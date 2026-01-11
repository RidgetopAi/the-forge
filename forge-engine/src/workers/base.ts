/**
 * BaseWorker - Abstract class for Haiku-tier workers
 *
 * Phase 2: Worker Abstraction Layer
 *
 * Workers are the labor force of The Forge. They:
 * - Receive focused tasks from Foreman
 * - Use tools to explore codebases autonomously
 * - Return structured results via submit_result pattern
 *
 * Key Design Decisions (Phase 0 validated):
 * - Use submit_result tool pattern (NOT regex JSON parsing) - 100% parse success
 * - Multi-turn tool loop for exploration workers
 * - Zod validation on all outputs
 * - Metrics aggregation across turns
 */

import { z } from 'zod';
import {
  TierRouter,
  TierCallOptions,
  TierCallResult,
  OperationType,
  SUBMIT_RESULT_TOOL,
  extractSubmitResult,
  hasSubmitResult,
  ToolCall,
} from '../tiers.js';
import {
  WORKER_TOOLS,
  executeTool,
  ToolInput,
  ToolResult,
} from './tools.js';
import type { Tool } from '@anthropic-ai/sdk/resources/messages';

// ============================================================================
// Interfaces
// ============================================================================

/**
 * Structured additional context provided to workers.
 * Each field contains pre-gathered information to include in the prompt.
 */
export interface WorkerAdditionalContext {
  /** List of files discovered as relevant (from FileDiscoveryWorker) */
  fileList?: string;
  /** Code samples/snippets relevant to the task */
  codeSamples?: string;
  /** Full file contents for must-read files */
  fileContents?: string;
  /** Configuration file contents (tsconfig, eslint, package.json, etc.) */
  configFiles?: string;
  /** Research queries or topics to investigate (for WebResearchWorker) */
  researchQueries?: string;
  /** Project-level context (architecture, conventions) */
  projectContext?: string;
  /** Documentation content to analyze (for DocumentationReaderWorker) */
  documentation?: string;
}

/**
 * Input provided to a worker for task execution.
 */
export interface WorkerInput {
  /** The task description */
  task: string;
  /** Root directory of the project being analyzed */
  projectRoot: string;
  /** Optional additional context for the worker (legacy, prefer additionalContext) */
  context?: string;
  /** Optional metadata passed through */
  metadata?: Record<string, unknown>;
  /** Structured additional context with typed fields */
  additionalContext?: WorkerAdditionalContext;
}

/**
 * Metrics collected during worker execution.
 * Aggregated across all turns for multi-turn workers.
 */
export interface WorkerMetrics {
  /** Total input tokens consumed */
  inputTokens: number;
  /** Total output tokens generated */
  outputTokens: number;
  /** Total cost in USD */
  costUsd: number;
  /** Total latency in milliseconds */
  latencyMs: number;
  /** Number of turns taken (1 for single-turn workers) */
  turnCount: number;
  /** Number of tool calls made (excluding submit_result) */
  toolCallCount: number;
  /** Which tier handled this worker */
  tier: 'opus' | 'sonnet' | 'haiku';
  /** Model ID used */
  model: string;
}

/**
 * Result from a worker execution.
 * Generic over the output type for type safety.
 */
export interface WorkerResult<T> {
  /** Whether the worker succeeded */
  success: boolean;
  /** Parsed and validated output data (if success) */
  data?: T;
  /** Error message (if !success) */
  error?: string;
  /** Worker's confidence in the result (0-100) */
  confidence?: number;
  /** Execution metrics */
  metrics: WorkerMetrics;
  /** Raw tool calls made during execution (for debugging) */
  toolCalls?: ToolCallRecord[];
}

/**
 * Record of a tool call made during execution.
 */
export interface ToolCallRecord {
  /** Tool name */
  name: string;
  /** Tool input */
  input: Record<string, unknown>;
  /** Tool output or error */
  output: string;
  /** Whether the call succeeded */
  success: boolean;
}

// ============================================================================
// BaseWorker Abstract Class
// ============================================================================

/**
 * Abstract base class for all Haiku-tier workers.
 *
 * Subclasses must implement:
 * - getSystemPrompt(): System prompt for the LLM
 * - buildUserPrompt(input): User message for the specific task
 *
 * Optionally override:
 * - canExplore: Set to true to enable exploration tools (glob, read, grep)
 * - maxTurns: Maximum turns for multi-turn execution (default: 10)
 *
 * Usage:
 * ```typescript
 * const FileListSchema = z.object({
 *   files: z.array(z.string()),
 *   count: z.number()
 * });
 *
 * class FileDiscoveryWorker extends BaseWorker<z.infer<typeof FileListSchema>> {
 *   protected canExplore = true;
 *
 *   constructor(router: TierRouter) {
 *     super(router, 'file_discovery', FileListSchema);
 *   }
 *
 *   getSystemPrompt(): string { return '...'; }
 *   buildUserPrompt(input: WorkerInput): string { return '...'; }
 * }
 *
 * const worker = new FileDiscoveryWorker(router);
 * const result = await worker.execute({ task: 'Find TS files', projectRoot: '.' });
 * ```
 */
export abstract class BaseWorker<TOutput> {
  /** TierRouter for making LLM calls */
  protected readonly tierRouter: TierRouter;

  /** Operation type for tier routing */
  protected readonly operationType: OperationType;

  /** Zod schema for validating output (HARDENING-3: allows schemas with defaults) */
  protected readonly outputSchema: z.ZodType<TOutput, z.ZodTypeDef, unknown>;

  /** Whether this worker can use exploration tools (glob, read, grep) */
  protected canExplore: boolean = false;

  /** Maximum number of turns for multi-turn execution */
  protected maxTurns: number = 10;

  /** Current project root (set during execute) */
  protected projectRoot: string = '';

  /**
   * Create a new worker.
   *
   * @param tierRouter - TierRouter for making LLM calls
   * @param operationType - Operation type for tier routing (e.g., 'file_discovery')
   * @param outputSchema - Zod schema for validating worker output
   */
  constructor(
    tierRouter: TierRouter,
    operationType: OperationType,
    outputSchema: z.ZodType<TOutput, z.ZodTypeDef, unknown>
  ) {
    this.tierRouter = tierRouter;
    this.operationType = operationType;
    this.outputSchema = outputSchema;
  }

  /**
   * Get the system prompt for this worker.
   * Should include instructions for using tools and submit_result.
   */
  abstract getSystemPrompt(): string;

  /**
   * Build the user prompt for a specific task.
   *
   * @param input - Worker input with task and project context
   */
  abstract buildUserPrompt(input: WorkerInput): string;

  /**
   * Get tools available to this worker.
   * By default, only submit_result. If canExplore is true, includes glob/read/grep.
   */
  protected getTools(): Tool[] {
    if (this.canExplore) {
      // WORKER_TOOLS already includes submit_result
      return WORKER_TOOLS;
    }
    // Only submit_result for non-exploration workers
    return [SUBMIT_RESULT_TOOL];
  }

  /**
   * Execute a tool call and return the result.
   *
   * @param toolCall - The tool call to execute
   * @returns Tool result with success status
   */
  protected executeToolCall(toolCall: ToolCall): ToolResult {
    const input = toolCall.input as ToolInput;
    return executeTool(toolCall.name, input, this.projectRoot);
  }

  /**
   * Execute the worker on the given input.
   *
   * For single-turn workers (canExplore=false): Makes one LLM call with forced submit_result.
   * For multi-turn workers (canExplore=true): Loops until submit_result or maxTurns.
   *
   * @param input - Worker input with task and project context
   * @returns Worker result with typed data and metrics
   */
  async execute(input: WorkerInput): Promise<WorkerResult<TOutput>> {
    const startTime = Date.now();
    this.projectRoot = input.projectRoot;

    // Initialize metrics
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCostUsd = 0;
    let turnCount = 0;
    let toolCallCount = 0;
    const toolCallRecords: ToolCallRecord[] = [];

    // Track tier/model from first call
    let tier: WorkerMetrics['tier'] = 'haiku';
    let model = '';

    // Build initial call options
    const tools = this.getTools();
    const systemPrompt = this.getSystemPrompt();
    const userPrompt = this.buildUserPrompt(input);

    // For single-turn workers, force submit_result immediately
    const isSingleTurn = !this.canExplore;

    try {
      if (isSingleTurn) {
        // Single-turn: Force submit_result on first call
        const result = await this.tierRouter.call({
          operation: this.operationType,
          systemPrompt,
          userPrompt,
          tools,
          toolChoice: { type: 'tool', name: 'submit_result' },
          maxTokens: 4096,
          temperature: 0,
        });

        turnCount = 1;
        totalInputTokens = result.inputTokens;
        totalOutputTokens = result.outputTokens;
        totalCostUsd = result.costUsd;
        tier = result.tier;
        model = result.model;

        // Extract submit_result
        if (result.toolCalls && hasSubmitResult(result.toolCalls)) {
          const submitResult = extractSubmitResult<TOutput>(result.toolCalls);
          if (submitResult) {
            // Validate with Zod
            const validated = this.outputSchema.safeParse(submitResult.result);
            if (validated.success) {
              return {
                success: true,
                data: validated.data,
                confidence: submitResult.confidence,
                metrics: this.buildMetrics(
                  startTime,
                  totalInputTokens,
                  totalOutputTokens,
                  totalCostUsd,
                  toolCallCount,
                  turnCount,
                  tier,
                  model
                ),
                toolCalls: toolCallRecords,
              };
            } else {
              return {
                success: false,
                error: `Zod validation failed: ${validated.error.message}`,
                metrics: this.buildMetrics(
                  startTime,
                  totalInputTokens,
                  totalOutputTokens,
                  totalCostUsd,
                  toolCallCount,
                  turnCount,
                  tier,
                  model
                ),
                toolCalls: toolCallRecords,
              };
            }
          }
        }

        // No submit_result found (shouldn't happen with toolChoice forced)
        return {
          success: false,
          error: 'No submit_result tool call in response',
          metrics: this.buildMetrics(
            startTime,
            totalInputTokens,
            totalOutputTokens,
            totalCostUsd,
            toolCallCount,
            turnCount,
            tier,
            model
          ),
          toolCalls: toolCallRecords,
        };
      }

      // Multi-turn execution for exploration workers
      // Build message history for multi-turn conversation
      // Note: TierRouter currently takes string userPrompt, not message array
      // For Phase 2, we'll flatten the conversation into the prompt for each turn
      // Phase 4 may extend TierRouter to support message arrays natively

      let conversationContext = userPrompt;

      while (turnCount < this.maxTurns) {
        turnCount++;

        // On final turn, force submit_result
        const isLastTurn = turnCount === this.maxTurns;
        const toolChoice = isLastTurn
          ? { type: 'tool' as const, name: 'submit_result' }
          : ('auto' as const);

        const result = await this.tierRouter.call({
          operation: this.operationType,
          systemPrompt,
          userPrompt: conversationContext,
          tools,
          toolChoice,
          maxTokens: 4096,
          temperature: 0,
        });

        // Track metrics
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
        totalCostUsd += result.costUsd;
        if (turnCount === 1) {
          tier = result.tier;
          model = result.model;
        }

        // Check for submit_result
        if (result.toolCalls && hasSubmitResult(result.toolCalls)) {
          const submitResult = extractSubmitResult<TOutput>(result.toolCalls);
          if (submitResult) {
            // Validate with Zod
            const validated = this.outputSchema.safeParse(submitResult.result);
            if (validated.success) {
              return {
                success: true,
                data: validated.data,
                confidence: submitResult.confidence,
                metrics: this.buildMetrics(
                  startTime,
                  totalInputTokens,
                  totalOutputTokens,
                  totalCostUsd,
                  toolCallCount,
                  turnCount,
                  tier,
                  model
                ),
                toolCalls: toolCallRecords,
              };
            } else {
              return {
                success: false,
                error: `Zod validation failed: ${validated.error.message}`,
                metrics: this.buildMetrics(
                  startTime,
                  totalInputTokens,
                  totalOutputTokens,
                  totalCostUsd,
                  toolCallCount,
                  turnCount,
                  tier,
                  model
                ),
                toolCalls: toolCallRecords,
              };
            }
          }
        }

        // Process other tool calls
        if (result.toolCalls && result.toolCalls.length > 0) {
          const toolResultsText: string[] = [];

          for (const toolCall of result.toolCalls) {
            if (toolCall.name === 'submit_result') continue;

            toolCallCount++;
            const toolResult = this.executeToolCall(toolCall);

            toolCallRecords.push({
              name: toolCall.name,
              input: toolCall.input,
              output: toolResult.success
                ? toolResult.output
                : `Error: ${toolResult.error}`,
              success: toolResult.success,
            });

            // Format tool result for context
            toolResultsText.push(
              `[Tool: ${toolCall.name}]\n` +
                `Input: ${JSON.stringify(toolCall.input)}\n` +
                `Result: ${toolResult.success ? toolResult.output : `Error: ${toolResult.error}`}`
            );
          }

          // Append tool results to conversation context
          if (toolResultsText.length > 0) {
            conversationContext +=
              '\n\n--- Tool Results ---\n' + toolResultsText.join('\n\n');
            conversationContext +=
              '\n\n--- Continue ---\nUse the tool results above to continue your analysis. Call submit_result when you have gathered enough information.';
          }
        } else {
          // No tool calls and no submit_result - LLM seems stuck
          break;
        }
      }

      // Max turns reached without submit_result
      return {
        success: false,
        error: `Max turns (${this.maxTurns}) reached without submit_result`,
        metrics: this.buildMetrics(
          startTime,
          totalInputTokens,
          totalOutputTokens,
          totalCostUsd,
          toolCallCount,
          turnCount,
          tier,
          model
        ),
        toolCalls: toolCallRecords,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        metrics: this.buildMetrics(
          startTime,
          totalInputTokens,
          totalOutputTokens,
          totalCostUsd,
          toolCallCount,
          turnCount,
          tier,
          model
        ),
        toolCalls: toolCallRecords,
      };
    }
  }

  /**
   * Build metrics object from accumulated values.
   */
  private buildMetrics(
    startTime: number,
    inputTokens: number,
    outputTokens: number,
    costUsd: number,
    toolCallCount: number,
    turnCount: number,
    tier: WorkerMetrics['tier'],
    model: string
  ): WorkerMetrics {
    return {
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs: Date.now() - startTime,
      turnCount,
      toolCallCount,
      tier,
      model,
    };
  }
}

// ============================================================================
// Exports
// ============================================================================

export type { Tool, ToolCall };
