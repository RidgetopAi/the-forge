/**
 * Mandrel Client
 *
 * Wraps the SSH+curl pattern for accessing Mandrel from within the-forge container.
 * Provides typed access to Mandrel MCP tools.
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

  constructor(project: string = 'the-forge') {
    this.project = project;
  }

  /**
   * Execute a Mandrel MCP tool via SSH+curl
   */
  private async call<T>(toolName: string, args: Record<string, unknown> = {}): Promise<MandrelResponse<T>> {
    const argsJson = JSON.stringify({ arguments: args });
    // Escape single quotes in JSON for shell
    const escapedArgs = argsJson.replace(/'/g, "'\\''");

    const command = `ssh hetzner 'curl -s -X POST http://localhost:8080/mcp/tools/${toolName} -H "Content-Type: application/json" -d '\\''${escapedArgs}'\\'''`;

    try {
      const { stdout, stderr } = await execAsync(command, { timeout: 30000 });
      if (stderr && !stdout) {
        return { success: false, error: stderr };
      }
      return JSON.parse(stdout) as MandrelResponse<T>;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
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
}

// Singleton instance for convenience
export const mandrel = new MandrelClient('the-forge');
