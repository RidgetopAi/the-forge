/**
 * Mandrel Client
 *
 * Wraps the SSH+curl pattern for accessing Mandrel from within the-forge container.
 * Provides typed access to Mandrel MCP tools.
 *
 * Error handling (added by i[3]):
 * - Distinguishes error types (SSH, JSON parse, timeout, connection)
 * - Retries transient failures with exponential backoff
 * - Tracks connection health
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// Error Types
// ============================================================================

export type MandrelErrorType =
  | 'ssh_failed'        // SSH connection to hetzner failed
  | 'timeout'           // Request timed out
  | 'json_parse'        // Response wasn't valid JSON
  | 'connection'        // curl couldn't connect to localhost:8080
  | 'tool_error'        // Mandrel tool returned an error
  | 'unknown';          // Catch-all

export interface MandrelError {
  type: MandrelErrorType;
  message: string;
  retriable: boolean;
  originalError?: unknown;
}

function classifyError(error: unknown, stderr: string = ''): MandrelError {
  const message = error instanceof Error ? error.message : String(error);
  const combined = `${message} ${stderr}`.toLowerCase();

  // SSH failures
  if (combined.includes('ssh') || combined.includes('connection refused') ||
      combined.includes('host key') || combined.includes('permission denied')) {
    return {
      type: 'ssh_failed',
      message: `SSH connection failed: ${message}`,
      retriable: true,
      originalError: error,
    };
  }

  // Timeouts
  if (combined.includes('timeout') || combined.includes('etimedout') ||
      combined.includes('timedout')) {
    return {
      type: 'timeout',
      message: `Request timed out: ${message}`,
      retriable: true,
      originalError: error,
    };
  }

  // Connection issues (curl can't reach server)
  if (combined.includes('connection') || combined.includes('econnrefused') ||
      combined.includes('could not resolve')) {
    return {
      type: 'connection',
      message: `Cannot connect to Mandrel server: ${message}`,
      retriable: true,
      originalError: error,
    };
  }

  // JSON parse errors
  if (combined.includes('json') || combined.includes('unexpected token') ||
      combined.includes('syntaxerror')) {
    return {
      type: 'json_parse',
      message: `Invalid JSON response: ${message}`,
      retriable: false,
      originalError: error,
    };
  }

  return {
    type: 'unknown',
    message,
    retriable: false,
    originalError: error,
  };
}

// ============================================================================
// Mandrel Response Types
// ============================================================================

interface MandrelResponse<T = unknown> {
  success: boolean;
  result?: {
    content: Array<{
      type: 'text';
      text: string;
    }>;
  };
  error?: string;
  errorDetails?: MandrelError;
}

interface StoredContext {
  id: string;
  content: string;
  type: string;
  tags: string[];
  created: Date;
}

// ============================================================================
// Mandrel Client Class
// ============================================================================

export class MandrelClient {
  private project: string;
  private consecutiveFailures: number = 0;
  private lastSuccessTime: Date | null = null;
  private readonly maxRetries: number = 3;
  private readonly baseDelayMs: number = 500;

  constructor(project: string = 'the-forge') {
    this.project = project;
  }

  /**
   * Get connection health status
   */
  getHealthStatus(): {
    healthy: boolean;
    consecutiveFailures: number;
    lastSuccess: Date | null;
  } {
    return {
      healthy: this.consecutiveFailures < 3,
      consecutiveFailures: this.consecutiveFailures,
      lastSuccess: this.lastSuccessTime,
    };
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Execute a single call attempt
   */
  private async executeCall<T>(
    toolName: string,
    command: string
  ): Promise<MandrelResponse<T>> {
    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });

      // Check for stderr without stdout (usually means failure)
      if (stderr && !stdout) {
        const errorDetails = classifyError(new Error(stderr), stderr);
        return {
          success: false,
          error: stderr,
          errorDetails,
        };
      }

      // Attempt to parse JSON response
      try {
        const response = JSON.parse(stdout) as MandrelResponse<T>;
        return response;
      } catch (parseError) {
        const errorDetails = classifyError(parseError, stdout);
        return {
          success: false,
          error: `Invalid JSON response from ${toolName}`,
          errorDetails,
        };
      }
    } catch (error) {
      const errorDetails = classifyError(error, '');
      return {
        success: false,
        error: errorDetails.message,
        errorDetails,
      };
    }
  }

  /**
   * Execute a Mandrel MCP tool via SSH+curl with retry logic
   */
  private async call<T>(
    toolName: string,
    args: Record<string, unknown> = {},
    options: { retries?: number } = {}
  ): Promise<MandrelResponse<T>> {
    const maxRetries = options.retries ?? this.maxRetries;
    const argsJson = JSON.stringify({ arguments: args });
    // Escape single quotes in JSON for shell
    const escapedArgs = argsJson.replace(/'/g, "'\\''");

    const command = `ssh hetzner 'curl -s -X POST http://localhost:8080/mcp/tools/${toolName} -H "Content-Type: application/json" -d '\\''${escapedArgs}'\\'''`;

    let lastError: MandrelError | undefined;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        // Exponential backoff: 500ms, 1000ms, 2000ms, ...
        const delay = this.baseDelayMs * Math.pow(2, attempt - 1);
        await this.sleep(delay);
      }

      const response = await this.executeCall<T>(toolName, command);

      // Success - reset failure counter and return
      if (response.success) {
        this.consecutiveFailures = 0;
        this.lastSuccessTime = new Date();
        return response;
      }

      // Check if error is retriable
      const errorDetails = response.errorDetails;
      if (!errorDetails?.retriable || attempt === maxRetries) {
        this.consecutiveFailures++;
        return response;
      }

      // Log retry attempt
      lastError = errorDetails;
      console.warn(
        `[MandrelClient] ${toolName} failed (attempt ${attempt + 1}/${maxRetries + 1}): ` +
        `${errorDetails.type} - ${errorDetails.message}. Retrying...`
      );
    }

    // Should not reach here, but just in case
    this.consecutiveFailures++;
    return {
      success: false,
      error: lastError?.message ?? 'Max retries exceeded',
      errorDetails: lastError,
    };
  }

  /**
   * Test connection to Mandrel
   */
  async ping(message?: string): Promise<boolean> {
    const response = await this.call('mandrel_ping', message ? { message } : {});
    return response.success;
  }

  /**
   * Switch to a project
   */
  async switchProject(project: string): Promise<boolean> {
    const response = await this.call('project_switch', { project });
    if (response.success) {
      this.project = project;
    }
    return response.success;
  }

  /**
   * Store context in Mandrel
   */
  async storeContext(
    content: string,
    type: 'code' | 'decision' | 'error' | 'discussion' | 'planning' | 'completion' | 'milestone' | 'reflections' | 'handoff',
    tags: string[] = []
  ): Promise<{ success: boolean; id?: string }> {
    const response = await this.call('context_store', {
      content,
      type,
      tags,
    });

    if (response.success && response.result?.content[0]?.text) {
      // Extract ID from response text (usually contains the stored context ID)
      const text = response.result.content[0].text;
      const idMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      return { success: true, id: idMatch?.[0] };
    }
    return { success: false };
  }

  /**
   * Search for contexts
   */
  async searchContext(query: string, limit: number = 10): Promise<string> {
    const response = await this.call('context_search', { query, limit });
    return response.result?.content[0]?.text ?? '';
  }

  /**
   * Get recent contexts
   */
  async getRecentContexts(limit: number = 10): Promise<string> {
    const response = await this.call('context_get_recent', { limit });
    return response.result?.content[0]?.text ?? '';
  }

  /**
   * Create a task in Mandrel
   */
  async createTask(
    title: string,
    description: string,
    priority: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    tags: string[] = []
  ): Promise<{ success: boolean; id?: string }> {
    const response = await this.call('task_create', {
      title,
      description,
      priority,
      tags,
    });

    if (response.success && response.result?.content[0]?.text) {
      const text = response.result.content[0].text;
      const idMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      return { success: true, id: idMatch?.[0] };
    }
    return { success: false };
  }

  /**
   * Update task status
   */
  async updateTask(
    taskId: string,
    updates: {
      status?: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done' | 'blocked';
      notes?: string;
    }
  ): Promise<boolean> {
    const response = await this.call('task_update', {
      task: taskId,
      ...updates,
    });
    return response.success;
  }

  /**
   * Record a technical decision
   */
  async recordDecision(
    title: string,
    decision: string,
    rationale: string,
    alternatives: string[] = [],
    tags: string[] = []
  ): Promise<{ success: boolean; id?: string }> {
    const response = await this.call('decision_record', {
      title,
      decision,
      rationale,
      alternatives,
      tags,
    });

    if (response.success && response.result?.content[0]?.text) {
      const text = response.result.content[0].text;
      const idMatch = text.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      return { success: true, id: idMatch?.[0] };
    }
    return { success: false };
  }

  /**
   * Get recommendations for current project
   */
  async getRecommendations(): Promise<string> {
    const response = await this.call('get_recommendations', {});
    return response.result?.content[0]?.text ?? '';
  }

  /**
   * Smart search across all data
   */
  async smartSearch(query: string): Promise<string> {
    const response = await this.call('smart_search', { query });
    return response.result?.content[0]?.text ?? '';
  }

  /**
   * Get context by ID (i[14] addition)
   *
   * This is the key to making Learning Retrieval work.
   * smart_search returns truncated display text with IDs.
   * This method fetches the FULL context content by ID.
   *
   * The two-phase pattern:
   * 1. smart_search() → discover relevant context IDs
   * 2. getContextById() → fetch full content for each ID
   */
  async getContextById(id: string): Promise<{
    success: boolean;
    content?: string;
    type?: string;
    tags?: string[];
  }> {
    const response = await this.call('context_search', { id });
    const text = response.result?.content[0]?.text ?? '';

    if (!response.success || !text) {
      return { success: false };
    }

    // Parse the display format to extract content
    // Format: "📄 Context Details\n\n🆔 ID: ...\n📝 Type: ...\n...---\n\n<actual content>"
    const contentMatch = text.match(/---\n\n([\s\S]*)/);
    const typeMatch = text.match(/📝 Type: (\w+)/);
    const tagsMatch = text.match(/🏷️\s+Tags: \[([^\]]*)\]/);

    return {
      success: true,
      content: contentMatch?.[1]?.trim() ?? text,
      type: typeMatch?.[1],
      tags: tagsMatch?.[1]?.split(',').map(t => t.trim()) ?? [],
    };
  }

  /**
   * Extract context IDs from smart_search results (i[14] addition)
   *
   * smart_search returns display text with IDs like:
   * "🆔 ID: f1a40331-5a09-481a-aa48-a4a32cfb6306"
   *
   * This helper extracts all UUIDs from the results.
   */
  extractIdsFromSearchResults(searchResults: string): string[] {
    const uuidPattern = /🆔 ID: ([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
    const ids: string[] = [];
    let match;

    while ((match = uuidPattern.exec(searchResults)) !== null) {
      ids.push(match[1]);
    }

    return ids;
  }
}

// Singleton instance for convenience
export const mandrel = new MandrelClient('the-forge');
