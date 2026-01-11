/**
 * Tier System - Model Routing Infrastructure
 *
 * Phase 1.1: Provider Abstraction Layer
 * - Defines multi-provider model configurations
 * - Maps operations to tiers
 * - Maps tiers to specific models (including cross-provider)
 *
 * Phase 1.4: submit_result Tool Definition
 * - Standard tool for structured worker output
 * - Achieves 100% parse success (Phase 0 validated)
 *
 * Decision: Use Grok for 'haiku' tier based on Phase 0 validation
 * (75% accuracy vs 60% for Claude Haiku, lower cost)
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Tool, ToolUseBlock, TextBlock } from '@anthropic-ai/sdk/resources/messages';
import OpenAI from 'openai';

// ============================================================================
// Provider & Model Configuration
// ============================================================================

export type Provider = 'anthropic' | 'openai';

export interface ModelConfig {
  /** Model identifier for API calls (e.g., 'grok-4-1-fast-reasoning') */
  id: string;
  /** SDK provider to use */
  provider: Provider;
  /** Human-readable name */
  displayName: string;
  /** Environment variable containing API key */
  apiKeyEnv: string;
  /** Custom base URL for API (required for xAI, Groq, etc.) */
  baseURL?: string;
  /** Cost per 1M tokens */
  costs: {
    inputPer1M: number;
    outputPer1M: number;
  };
}

/**
 * Model configurations for all supported models.
 * Keys are internal identifiers, not model IDs.
 */
export const MODEL_CONFIGS: Record<string, ModelConfig> = {
  opus: {
    id: 'claude-opus-4-5-20251101',
    provider: 'anthropic',
    displayName: 'Claude Opus 4.5',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    costs: { inputPer1M: 15.0, outputPer1M: 75.0 },
  },
  sonnet: {
    id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    displayName: 'Claude Sonnet 4',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    costs: { inputPer1M: 3.0, outputPer1M: 15.0 },
  },
  haiku: {
    id: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Haiku',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    costs: { inputPer1M: 0.25, outputPer1M: 1.25 },
  },
  'grok-worker': {
    id: 'grok-4-1-fast-reasoning',
    provider: 'openai',
    displayName: 'Grok 4.1 Fast Reasoning',
    apiKeyEnv: 'XAI_API_KEY',
    baseURL: 'https://api.x.ai/v1',
    // xAI pricing as of 2026-01
    costs: { inputPer1M: 0.10, outputPer1M: 0.40 },
  },
} as const;

// ============================================================================
// Tier System
// ============================================================================

export type Tier = 'opus' | 'sonnet' | 'haiku';

/**
 * All 14 operation types mapped to their tier.
 *
 * Opus operations (judgment): 4
 * Sonnet operations (supervision): 4
 * Haiku operations (labor): 6
 */
export type OperationType =
  // Opus operations (judgment) - 10-15% of cost
  | 'classify_task'
  | 'resolve_stuck_point'
  | 'escalation_decision'
  | 'quality_judgment'
  // Sonnet operations (supervision) - 25-35% of cost
  | 'foreman_synthesis'
  | 'context_package_assembly'
  | 'execution_supervision'
  | 'quality_gate_decision'
  // Haiku operations (labor) - 50-65% of cost
  | 'file_discovery'
  | 'pattern_extraction'
  | 'dependency_mapping'
  | 'constraint_identification'
  | 'web_research'
  | 'documentation_reading';

/**
 * Maps operation types to their designated tier.
 * This determines which tier (and thus which model) handles each operation.
 */
export const OPERATION_TO_TIER: Record<OperationType, Tier> = {
  // Opus: Judgment calls, classification, escalation
  classify_task: 'opus',
  resolve_stuck_point: 'opus',
  escalation_decision: 'opus',
  quality_judgment: 'opus',
  // Sonnet: Supervision, synthesis, coordination
  foreman_synthesis: 'sonnet',
  context_package_assembly: 'sonnet',
  execution_supervision: 'sonnet',
  quality_gate_decision: 'sonnet',
  // Haiku: Worker labor (6 worker types)
  file_discovery: 'haiku',
  pattern_extraction: 'haiku',
  dependency_mapping: 'haiku',
  constraint_identification: 'haiku',
  web_research: 'haiku',
  documentation_reading: 'haiku',
} as const;

/**
 * Maps tiers to model configuration keys.
 *
 * This indirection allows swapping models per tier without changing
 * operation mappings. Phase 0 proved Grok outperforms Haiku at lower cost,
 * so 'haiku' tier uses 'grok-worker' model.
 */
export const TIER_TO_MODEL_KEY: Record<Tier, string> = {
  opus: 'opus',
  sonnet: 'sonnet',
  haiku: 'grok-worker', // Phase 0 decision: Grok over Haiku
} as const;

// ============================================================================
// Cost Constants
// ============================================================================

/**
 * Target cost distribution by tier.
 * Used for monitoring cost efficiency.
 */
export const COST_DISTRIBUTION_TARGETS = {
  opus: { min: 0.10, max: 0.15 }, // 10-15%
  sonnet: { min: 0.25, max: 0.35 }, // 25-35%
  haiku: { min: 0.50, max: 0.65 }, // 50-65%
} as const;

// ============================================================================
// TierRouter Configuration & Interfaces
// ============================================================================

export interface TierRouterConfig {
  /** Anthropic API key (for Opus/Sonnet tiers) */
  anthropicKey?: string;
  /** xAI API key (for Grok/worker tier) */
  xaiKey?: string;
}

/**
 * Tool choice configuration for controlling tool usage.
 * Normalized across Anthropic and OpenAI providers.
 */
export type ToolChoice =
  | 'auto' // Let LLM decide whether to use tools
  | 'required' // Force LLM to use at least one tool
  | { type: 'tool'; name: string }; // Force specific tool (e.g., submit_result)

/**
 * Options for making a tier-routed call.
 * Task 1.3: Added tools and toolChoice support.
 */
export interface TierCallOptions {
  /** Operation type determines which tier/model handles the call */
  operation: OperationType;
  /** System prompt for the LLM */
  systemPrompt: string;
  /** User prompt / message content */
  userPrompt: string;
  /** Maximum tokens for response (default: 4096) */
  maxTokens?: number;
  /** Temperature for generation (default: 0) */
  temperature?: number;
  /** Tools available for this call (Anthropic format) */
  tools?: Tool[];
  /** Tool choice strategy (default: 'auto') */
  toolChoice?: ToolChoice;
}

/**
 * Stop reason for LLM response.
 * Normalized across providers.
 */
export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'stop_sequence';

/**
 * Result from a tier-routed call.
 * Task 1.3: Added toolCalls and stopReason support.
 */
export interface TierCallResult {
  /** Text content of the response (may be empty if tool_use) */
  content: string;
  /** Which tier handled this call */
  tier: Tier;
  /** Actual model ID used */
  model: string;
  /** Input tokens consumed */
  inputTokens: number;
  /** Output tokens generated */
  outputTokens: number;
  /** Cost in USD for this call */
  costUsd: number;
  /** Latency in milliseconds */
  latencyMs: number;
  /** Tool calls from the response (unified format) */
  toolCalls?: ToolCall[];
  /** Why the response ended */
  stopReason?: StopReason;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the tier for a given operation type.
 */
export function getTierForOperation(operation: OperationType): Tier {
  return OPERATION_TO_TIER[operation];
}

/**
 * Get the model configuration for a given tier.
 */
export function getModelConfigForTier(tier: Tier): ModelConfig {
  const modelKey = TIER_TO_MODEL_KEY[tier];
  return MODEL_CONFIGS[modelKey];
}

/**
 * Calculate cost in USD for a given tier and token counts.
 */
export function calculateCost(
  tier: Tier,
  inputTokens: number,
  outputTokens: number
): number {
  const config = getModelConfigForTier(tier);
  return (
    (inputTokens / 1_000_000) * config.costs.inputPer1M +
    (outputTokens / 1_000_000) * config.costs.outputPer1M
  );
}

/**
 * Validate that required API keys are present for the configured models.
 * Returns array of missing key names, empty if all present.
 */
export function validateApiKeys(): string[] {
  const missing: string[] = [];

  // Check keys for all models referenced by TIER_TO_MODEL_KEY
  const usedModelKeys = new Set(Object.values(TIER_TO_MODEL_KEY));

  for (const modelKey of usedModelKeys) {
    const config = MODEL_CONFIGS[modelKey];
    if (!process.env[config.apiKeyEnv]) {
      missing.push(config.apiKeyEnv);
    }
  }

  return missing;
}

// ============================================================================
// Task 1.4: submit_result Tool Definition
// ============================================================================

/**
 * Standard submit_result tool for structured worker output.
 *
 * Workers MUST use this tool to return structured results.
 * This pattern achieves 100% parse success (Phase 0 validated).
 *
 * Format: Anthropic tool_use schema
 */
export const SUBMIT_RESULT_TOOL: Tool = {
  name: 'submit_result',
  description:
    'Submit your final findings. Call this when you have finished exploring and are ready to return your structured results. This must be your final action.',
  input_schema: {
    type: 'object' as const,
    properties: {
      result: {
        type: 'object',
        description:
          'Your structured findings in the format specified by your task instructions',
      },
      confidence: {
        type: 'number',
        description:
          'Your confidence level from 0-100 in the completeness and accuracy of your findings',
      },
    },
    required: ['result', 'confidence'],
  },
};

/**
 * Convert Anthropic tool format to OpenAI function format.
 * Used when routing to OpenAI-compatible providers (xAI, Groq, etc.)
 */
export function convertToolToOpenAI(tool: Tool): OpenAI.ChatCompletionTool {
  return {
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema as Record<string, unknown>,
    },
  };
}

/**
 * OpenAI-formatted submit_result tool (convenience export)
 */
export const SUBMIT_RESULT_TOOL_OPENAI: OpenAI.ChatCompletionTool =
  convertToolToOpenAI(SUBMIT_RESULT_TOOL);

// ============================================================================
// Unified ToolCall Interface
// ============================================================================

/**
 * Unified tool call representation.
 * Normalizes across Anthropic and OpenAI response formats.
 */
export interface ToolCall {
  /** Unique identifier for this tool call */
  id: string;
  /** Tool name (e.g., 'submit_result', 'glob', 'read') */
  name: string;
  /** Parsed input arguments */
  input: Record<string, unknown>;
}

/**
 * Input shape for submit_result tool
 */
export interface SubmitResultInput<T = unknown> {
  result: T;
  confidence: number;
}

/**
 * Extract submit_result from tool calls.
 * Works with unified ToolCall format (normalized from either provider).
 *
 * @param toolCalls - Array of unified tool calls
 * @returns The result and confidence, or null if submit_result not found
 */
export function extractSubmitResult<T>(
  toolCalls: ToolCall[]
): SubmitResultInput<T> | null {
  const submitCall = toolCalls.find((tc) => tc.name === 'submit_result');
  if (!submitCall) return null;

  // Cast through unknown for type safety
  const input = submitCall.input as unknown as SubmitResultInput<T>;
  return {
    result: input.result,
    confidence: input.confidence,
  };
}

/**
 * Check if tool calls contain submit_result.
 * Useful for detecting when worker has finished.
 */
export function hasSubmitResult(toolCalls: ToolCall[]): boolean {
  return toolCalls.some((tc) => tc.name === 'submit_result');
}

// ============================================================================
// Task 1.2: Multi-Provider TierRouter
// ============================================================================

/**
 * Cost distribution entry for a tier.
 */
export interface CostDistributionEntry {
  /** Total cost in USD */
  absolute: number;
  /** Percentage of total cost (0-1) */
  percentage: number;
}

/**
 * Cost distribution across all tiers.
 */
export type CostDistribution = Record<Tier, CostDistributionEntry>;

/**
 * TierRouter - Multi-provider model routing infrastructure.
 *
 * Routes operations to appropriate tiers/models, handles both
 * Anthropic and OpenAI-compatible APIs, normalizes responses,
 * and tracks cost distribution.
 *
 * Usage:
 * ```typescript
 * const router = new TierRouter();
 * const result = await router.call({
 *   operation: 'file_discovery',
 *   systemPrompt: '...',
 *   userPrompt: '...',
 *   tools: [SUBMIT_RESULT_TOOL],
 *   toolChoice: { type: 'tool', name: 'submit_result' }
 * });
 * ```
 */
export class TierRouter {
  private anthropicClient: Anthropic | null = null;
  private openaiClient: OpenAI | null = null;
  private costAccumulator: Map<Tier, number> = new Map([
    ['opus', 0],
    ['sonnet', 0],
    ['haiku', 0],
  ]);

  constructor(config?: TierRouterConfig) {
    // Initialize Anthropic client for opus/sonnet tiers
    const anthropicKey = config?.anthropicKey || process.env.ANTHROPIC_API_KEY;
    if (anthropicKey) {
      this.anthropicClient = new Anthropic({ apiKey: anthropicKey });
    }

    // Initialize OpenAI client for xAI (haiku tier uses Grok)
    const workerConfig = MODEL_CONFIGS[TIER_TO_MODEL_KEY['haiku']];
    if (workerConfig.provider === 'openai') {
      const xaiKey = config?.xaiKey || process.env[workerConfig.apiKeyEnv];
      if (xaiKey) {
        this.openaiClient = new OpenAI({
          apiKey: xaiKey,
          baseURL: workerConfig.baseURL,
        });
      }
    }
  }

  /**
   * Get the tier for a given operation type.
   */
  getTierForOperation(operation: OperationType): Tier {
    return OPERATION_TO_TIER[operation];
  }

  /**
   * Get the model ID for a given tier.
   */
  getModelForTier(tier: Tier): string {
    const modelKey = TIER_TO_MODEL_KEY[tier];
    return MODEL_CONFIGS[modelKey].id;
  }

  /**
   * Make a tier-routed LLM call.
   * Automatically routes to the correct provider based on operation type.
   */
  async call(options: TierCallOptions): Promise<TierCallResult> {
    const tier = this.getTierForOperation(options.operation);
    const modelKey = TIER_TO_MODEL_KEY[tier];
    const modelConfig = MODEL_CONFIGS[modelKey];

    // Route to correct provider
    if (modelConfig.provider === 'anthropic') {
      return this.callAnthropic(options, tier, modelConfig);
    } else {
      return this.callOpenAI(options, tier, modelConfig);
    }
  }

  /**
   * Call Anthropic API (Claude models).
   */
  private async callAnthropic(
    options: TierCallOptions,
    tier: Tier,
    modelConfig: ModelConfig
  ): Promise<TierCallResult> {
    if (!this.anthropicClient) {
      throw new Error(
        `Anthropic client not initialized. Set ${modelConfig.apiKeyEnv} environment variable.`
      );
    }

    const startTime = Date.now();

    // Build request
    const request: Anthropic.MessageCreateParams = {
      model: modelConfig.id,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: options.userPrompt }],
    };

    // Add tools if provided
    if (options.tools && options.tools.length > 0) {
      request.tools = options.tools;

      // Convert tool choice
      if (options.toolChoice) {
        if (options.toolChoice === 'auto') {
          request.tool_choice = { type: 'auto' };
        } else if (options.toolChoice === 'required') {
          request.tool_choice = { type: 'any' };
        } else {
          // Specific tool
          request.tool_choice = {
            type: 'tool',
            name: options.toolChoice.name,
          };
        }
      }
    }

    const response = await this.anthropicClient.messages.create(request);

    const latencyMs = Date.now() - startTime;
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    // Calculate and track cost
    const costUsd = this.calculateCostForConfig(
      modelConfig,
      inputTokens,
      outputTokens
    );
    this.costAccumulator.set(
      tier,
      (this.costAccumulator.get(tier) ?? 0) + costUsd
    );

    // Extract text content
    const textBlocks = response.content.filter(
      (block): block is TextBlock => block.type === 'text'
    );
    const content = textBlocks.map((b) => b.text).join('');

    // Extract tool calls
    const toolUseBlocks = response.content.filter(
      (block): block is ToolUseBlock => block.type === 'tool_use'
    );
    const toolCalls: ToolCall[] = toolUseBlocks.map((block) => ({
      id: block.id,
      name: block.name,
      input: block.input as Record<string, unknown>,
    }));

    // Normalize stop reason
    const stopReason = this.normalizeAnthropicStopReason(response.stop_reason);

    return {
      content,
      tier,
      model: modelConfig.id,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason,
    };
  }

  /**
   * Call OpenAI-compatible API (xAI Grok, Groq, etc.).
   */
  private async callOpenAI(
    options: TierCallOptions,
    tier: Tier,
    modelConfig: ModelConfig
  ): Promise<TierCallResult> {
    if (!this.openaiClient) {
      throw new Error(
        `OpenAI client not initialized. Set ${modelConfig.apiKeyEnv} environment variable.`
      );
    }

    const startTime = Date.now();

    // Build request
    const request: OpenAI.ChatCompletionCreateParams = {
      model: modelConfig.id,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0,
      messages: [
        { role: 'system', content: options.systemPrompt },
        { role: 'user', content: options.userPrompt },
      ],
    };

    // Add tools if provided (convert from Anthropic to OpenAI format)
    if (options.tools && options.tools.length > 0) {
      request.tools = options.tools.map(convertToolToOpenAI);

      // Convert tool choice
      if (options.toolChoice) {
        if (options.toolChoice === 'auto') {
          request.tool_choice = 'auto';
        } else if (options.toolChoice === 'required') {
          request.tool_choice = 'required';
        } else {
          // Specific tool
          request.tool_choice = {
            type: 'function',
            function: { name: options.toolChoice.name },
          };
        }
      }
    }

    const response = await this.openaiClient.chat.completions.create(request);

    const latencyMs = Date.now() - startTime;
    const choice = response.choices[0];
    const message = choice.message;

    // Normalize token usage (OpenAI uses different field names)
    const inputTokens = response.usage?.prompt_tokens ?? 0;
    const outputTokens = response.usage?.completion_tokens ?? 0;

    // Calculate and track cost
    const costUsd = this.calculateCostForConfig(
      modelConfig,
      inputTokens,
      outputTokens
    );
    this.costAccumulator.set(
      tier,
      (this.costAccumulator.get(tier) ?? 0) + costUsd
    );

    // Extract text content
    const content = message.content ?? '';

    // Extract tool calls (normalize from OpenAI format)
    const toolCalls: ToolCall[] = [];
    if (message.tool_calls) {
      for (const tc of message.tool_calls) {
        if (tc.type === 'function') {
          try {
            const input = JSON.parse(tc.function.arguments);
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              input,
            });
          } catch {
            // Skip malformed tool calls
            console.warn(`Failed to parse tool call arguments: ${tc.function.arguments}`);
          }
        }
      }
    }

    // Normalize stop reason
    const stopReason = this.normalizeOpenAIStopReason(choice.finish_reason);

    return {
      content,
      tier,
      model: modelConfig.id,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      stopReason,
    };
  }

  /**
   * Calculate cost for a specific model config.
   */
  private calculateCostForConfig(
    config: ModelConfig,
    inputTokens: number,
    outputTokens: number
  ): number {
    return (
      (inputTokens / 1_000_000) * config.costs.inputPer1M +
      (outputTokens / 1_000_000) * config.costs.outputPer1M
    );
  }

  /**
   * Normalize Anthropic stop reason to unified format.
   */
  private normalizeAnthropicStopReason(
    reason: string | null
  ): StopReason | undefined {
    switch (reason) {
      case 'end_turn':
        return 'end_turn';
      case 'tool_use':
        return 'tool_use';
      case 'max_tokens':
        return 'max_tokens';
      case 'stop_sequence':
        return 'stop_sequence';
      default:
        return undefined;
    }
  }

  /**
   * Normalize OpenAI stop reason to unified format.
   */
  private normalizeOpenAIStopReason(
    reason: string | null
  ): StopReason | undefined {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'tool_calls':
        return 'tool_use';
      case 'length':
        return 'max_tokens';
      default:
        return undefined;
    }
  }

  /**
   * Get current cost distribution across tiers.
   */
  getCostDistribution(): CostDistribution {
    const total = Array.from(this.costAccumulator.values()).reduce(
      (a, b) => a + b,
      0
    );

    const distribution: CostDistribution = {
      opus: { absolute: 0, percentage: 0 },
      sonnet: { absolute: 0, percentage: 0 },
      haiku: { absolute: 0, percentage: 0 },
    };

    for (const tier of ['opus', 'sonnet', 'haiku'] as Tier[]) {
      const cost = this.costAccumulator.get(tier) ?? 0;
      distribution[tier] = {
        absolute: cost,
        percentage: total > 0 ? cost / total : 0,
      };
    }

    return distribution;
  }

  /**
   * Get total accumulated cost.
   */
  getTotalCost(): number {
    return Array.from(this.costAccumulator.values()).reduce((a, b) => a + b, 0);
  }

  /**
   * Reset cost accumulator.
   */
  resetCostAccumulator(): void {
    this.costAccumulator = new Map([
      ['opus', 0],
      ['sonnet', 0],
      ['haiku', 0],
    ]);
  }
}
