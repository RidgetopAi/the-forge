/**
 * Unit Tests for Tier System
 *
 * Task 1.5: Comprehensive unit tests for tier routing infrastructure.
 *
 * Test Categories:
 * 1. Operation → Tier Mapping (all 14 operations)
 * 2. Tier → Model Mapping (verify Grok for haiku tier)
 * 3. Cost Calculation (all providers)
 * 4. Provider Routing Logic
 * 5. Tool Conversion Utilities
 * 6. SubmitResult Extraction
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  // Types
  Tier,
  OperationType,
  ToolCall,
  // Constants
  MODEL_CONFIGS,
  OPERATION_TO_TIER,
  TIER_TO_MODEL_KEY,
  COST_DISTRIBUTION_TARGETS,
  SUBMIT_RESULT_TOOL,
  SUBMIT_RESULT_TOOL_OPENAI,
  // Functions
  getTierForOperation,
  getModelConfigForTier,
  calculateCost,
  validateApiKeys,
  convertToolToOpenAI,
  extractSubmitResult,
  hasSubmitResult,
  // Classes
  TierRouter,
} from '../src/tiers.js';

// ============================================================================
// Operation → Tier Mapping Tests
// ============================================================================

describe('Operation → Tier Mapping', () => {
  describe('Opus Operations (Judgment)', () => {
    const opusOperations: OperationType[] = [
      'classify_task',
      'resolve_stuck_point',
      'escalation_decision',
      'quality_judgment',
    ];

    it.each(opusOperations)('routes %s to opus', (operation) => {
      expect(getTierForOperation(operation)).toBe('opus');
      expect(OPERATION_TO_TIER[operation]).toBe('opus');
    });

    it('has exactly 4 opus operations', () => {
      const opusOps = Object.entries(OPERATION_TO_TIER).filter(
        ([_, tier]) => tier === 'opus'
      );
      expect(opusOps.length).toBe(4);
    });
  });

  describe('Sonnet Operations (Supervision)', () => {
    const sonnetOperations: OperationType[] = [
      'foreman_synthesis',
      'context_package_assembly',
      'execution_supervision',
      'quality_gate_decision',
    ];

    it.each(sonnetOperations)('routes %s to sonnet', (operation) => {
      expect(getTierForOperation(operation)).toBe('sonnet');
      expect(OPERATION_TO_TIER[operation]).toBe('sonnet');
    });

    it('has exactly 4 sonnet operations', () => {
      const sonnetOps = Object.entries(OPERATION_TO_TIER).filter(
        ([_, tier]) => tier === 'sonnet'
      );
      expect(sonnetOps.length).toBe(4);
    });
  });

  describe('Haiku Operations (Labor)', () => {
    const haikuOperations: OperationType[] = [
      'file_discovery',
      'pattern_extraction',
      'dependency_mapping',
      'constraint_identification',
      'web_research',
      'documentation_reading',
    ];

    it.each(haikuOperations)('routes %s to haiku', (operation) => {
      expect(getTierForOperation(operation)).toBe('haiku');
      expect(OPERATION_TO_TIER[operation]).toBe('haiku');
    });

    it('has exactly 6 haiku operations', () => {
      const haikuOps = Object.entries(OPERATION_TO_TIER).filter(
        ([_, tier]) => tier === 'haiku'
      );
      expect(haikuOps.length).toBe(6);
    });
  });

  it('has exactly 14 total operations mapped', () => {
    expect(Object.keys(OPERATION_TO_TIER).length).toBe(14);
  });
});

// ============================================================================
// Tier → Model Mapping Tests
// ============================================================================

describe('Tier → Model Mapping', () => {
  it('maps opus tier to Claude Opus 4.5', () => {
    const modelKey = TIER_TO_MODEL_KEY['opus'];
    expect(modelKey).toBe('opus');
    expect(MODEL_CONFIGS[modelKey].id).toBe('claude-opus-4-5-20251101');
    expect(MODEL_CONFIGS[modelKey].provider).toBe('anthropic');
  });

  it('maps sonnet tier to Claude Sonnet 4', () => {
    const modelKey = TIER_TO_MODEL_KEY['sonnet'];
    expect(modelKey).toBe('sonnet');
    expect(MODEL_CONFIGS[modelKey].id).toBe('claude-sonnet-4-20250514');
    expect(MODEL_CONFIGS[modelKey].provider).toBe('anthropic');
  });

  it('maps haiku tier to Grok (not Claude Haiku) - Phase 0 decision', () => {
    const modelKey = TIER_TO_MODEL_KEY['haiku'];
    expect(modelKey).toBe('grok-worker');
    expect(MODEL_CONFIGS[modelKey].id).toBe('grok-4-1-fast-reasoning');
    expect(MODEL_CONFIGS[modelKey].provider).toBe('openai');
    expect(MODEL_CONFIGS[modelKey].baseURL).toBe('https://api.x.ai/v1');
  });

  it('getModelConfigForTier returns correct config', () => {
    const opusConfig = getModelConfigForTier('opus');
    expect(opusConfig.id).toBe('claude-opus-4-5-20251101');

    const haikuConfig = getModelConfigForTier('haiku');
    expect(haikuConfig.id).toBe('grok-4-1-fast-reasoning');
  });

  it('Claude Haiku model exists but is not used by any tier', () => {
    expect(MODEL_CONFIGS['haiku']).toBeDefined();
    expect(MODEL_CONFIGS['haiku'].id).toBe('claude-3-5-haiku-20241022');

    // But no tier maps to it
    const usedModels = Object.values(TIER_TO_MODEL_KEY);
    expect(usedModels).not.toContain('haiku');
  });
});

// ============================================================================
// Cost Calculation Tests
// ============================================================================

describe('Cost Calculation', () => {
  describe('calculateCost function', () => {
    it('calculates opus tier cost correctly', () => {
      // 1000 input, 500 output tokens
      // (1000/1M * 15) + (500/1M * 75) = 0.015 + 0.0375 = 0.0525
      const cost = calculateCost('opus', 1000, 500);
      expect(cost).toBeCloseTo(0.0525, 4);
    });

    it('calculates sonnet tier cost correctly', () => {
      // 1000 input, 500 output tokens
      // (1000/1M * 3) + (500/1M * 15) = 0.003 + 0.0075 = 0.0105
      const cost = calculateCost('sonnet', 1000, 500);
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('calculates haiku tier cost correctly (uses Grok pricing)', () => {
      // 1000 input, 500 output tokens
      // Uses Grok pricing: (1000/1M * 0.10) + (500/1M * 0.40) = 0.0001 + 0.0002 = 0.0003
      const cost = calculateCost('haiku', 1000, 500);
      expect(cost).toBeCloseTo(0.0003, 6);
    });

    it('handles zero tokens', () => {
      expect(calculateCost('opus', 0, 0)).toBe(0);
    });

    it('handles large token counts', () => {
      // 1M input, 1M output for opus
      // (1M/1M * 15) + (1M/1M * 75) = 15 + 75 = 90
      const cost = calculateCost('opus', 1_000_000, 1_000_000);
      expect(cost).toBeCloseTo(90, 2);
    });
  });

  describe('Model pricing configuration', () => {
    it('opus has highest pricing', () => {
      const opus = MODEL_CONFIGS['opus'].costs;
      const sonnet = MODEL_CONFIGS['sonnet'].costs;

      expect(opus.inputPer1M).toBeGreaterThan(sonnet.inputPer1M);
      expect(opus.outputPer1M).toBeGreaterThan(sonnet.outputPer1M);
    });

    it('grok worker has lowest pricing', () => {
      const grok = MODEL_CONFIGS['grok-worker'].costs;
      const sonnet = MODEL_CONFIGS['sonnet'].costs;

      expect(grok.inputPer1M).toBeLessThan(sonnet.inputPer1M);
      expect(grok.outputPer1M).toBeLessThan(sonnet.outputPer1M);
    });
  });

  describe('Cost distribution targets', () => {
    it('defines targets for all tiers', () => {
      expect(COST_DISTRIBUTION_TARGETS.opus).toBeDefined();
      expect(COST_DISTRIBUTION_TARGETS.sonnet).toBeDefined();
      expect(COST_DISTRIBUTION_TARGETS.haiku).toBeDefined();
    });

    it('targets sum to 100%', () => {
      const minTotal =
        COST_DISTRIBUTION_TARGETS.opus.min +
        COST_DISTRIBUTION_TARGETS.sonnet.min +
        COST_DISTRIBUTION_TARGETS.haiku.min;
      const maxTotal =
        COST_DISTRIBUTION_TARGETS.opus.max +
        COST_DISTRIBUTION_TARGETS.sonnet.max +
        COST_DISTRIBUTION_TARGETS.haiku.max;

      // Min should be <= 100%, max should be >= 100%
      expect(minTotal).toBeLessThanOrEqual(1.0);
      expect(maxTotal).toBeGreaterThanOrEqual(1.0);
    });
  });
});

// ============================================================================
// Provider Routing Tests (TierRouter class)
// ============================================================================

describe('TierRouter', () => {
  describe('Initialization', () => {
    it('creates instance without config', () => {
      // Should not throw even without API keys
      const router = new TierRouter();
      expect(router).toBeInstanceOf(TierRouter);
    });

    it('creates instance with config', () => {
      const router = new TierRouter({
        anthropicKey: 'test-key',
        xaiKey: 'test-key',
      });
      expect(router).toBeInstanceOf(TierRouter);
    });
  });

  describe('Operation routing', () => {
    let router: TierRouter;

    beforeEach(() => {
      router = new TierRouter();
    });

    it('getTierForOperation routes correctly', () => {
      expect(router.getTierForOperation('classify_task')).toBe('opus');
      expect(router.getTierForOperation('foreman_synthesis')).toBe('sonnet');
      expect(router.getTierForOperation('file_discovery')).toBe('haiku');
    });

    it('getModelForTier returns correct model ID', () => {
      expect(router.getModelForTier('opus')).toBe('claude-opus-4-5-20251101');
      expect(router.getModelForTier('sonnet')).toBe('claude-sonnet-4-20250514');
      expect(router.getModelForTier('haiku')).toBe('grok-4-1-fast-reasoning');
    });
  });

  describe('Cost tracking', () => {
    let router: TierRouter;

    beforeEach(() => {
      router = new TierRouter();
    });

    it('initial cost distribution is zero', () => {
      const dist = router.getCostDistribution();
      expect(dist.opus.absolute).toBe(0);
      expect(dist.sonnet.absolute).toBe(0);
      expect(dist.haiku.absolute).toBe(0);
    });

    it('initial total cost is zero', () => {
      expect(router.getTotalCost()).toBe(0);
    });

    it('resetCostAccumulator clears all costs', () => {
      // Can't add costs without mocking API calls, but can test reset behavior
      router.resetCostAccumulator();
      expect(router.getTotalCost()).toBe(0);
    });
  });
});

// ============================================================================
// Tool Conversion Tests
// ============================================================================

describe('Tool Conversion', () => {
  describe('SUBMIT_RESULT_TOOL', () => {
    it('has correct structure', () => {
      expect(SUBMIT_RESULT_TOOL.name).toBe('submit_result');
      expect(SUBMIT_RESULT_TOOL.description).toContain('final findings');
      expect(SUBMIT_RESULT_TOOL.input_schema.type).toBe('object');
    });

    it('requires result and confidence properties', () => {
      const required = SUBMIT_RESULT_TOOL.input_schema.required as string[];
      expect(required).toContain('result');
      expect(required).toContain('confidence');
    });

    it('defines result as object type', () => {
      const props = SUBMIT_RESULT_TOOL.input_schema.properties as Record<
        string,
        { type: string }
      >;
      expect(props.result.type).toBe('object');
    });

    it('defines confidence as number type', () => {
      const props = SUBMIT_RESULT_TOOL.input_schema.properties as Record<
        string,
        { type: string }
      >;
      expect(props.confidence.type).toBe('number');
    });
  });

  describe('convertToolToOpenAI', () => {
    it('converts submit_result tool to OpenAI format', () => {
      const converted = convertToolToOpenAI(SUBMIT_RESULT_TOOL);

      expect(converted.type).toBe('function');
      expect(converted.function.name).toBe('submit_result');
      expect(converted.function.description).toContain('final findings');
      expect(converted.function.parameters).toEqual(
        SUBMIT_RESULT_TOOL.input_schema
      );
    });

    it('SUBMIT_RESULT_TOOL_OPENAI is pre-converted', () => {
      expect(SUBMIT_RESULT_TOOL_OPENAI.type).toBe('function');
      expect(SUBMIT_RESULT_TOOL_OPENAI.function.name).toBe('submit_result');
    });

    it('preserves all schema properties', () => {
      const customTool = {
        name: 'custom_tool',
        description: 'A custom tool',
        input_schema: {
          type: 'object' as const,
          properties: {
            foo: { type: 'string' },
            bar: { type: 'number' },
          },
          required: ['foo'],
        },
      };

      const converted = convertToolToOpenAI(customTool);
      expect(converted.function.parameters).toEqual(customTool.input_schema);
    });
  });
});

// ============================================================================
// SubmitResult Extraction Tests
// ============================================================================

describe('SubmitResult Extraction', () => {
  describe('extractSubmitResult', () => {
    it('extracts submit_result from tool calls', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_123',
          name: 'submit_result',
          input: {
            result: { files: ['a.ts', 'b.ts'] },
            confidence: 85,
          },
        },
      ];

      const extracted = extractSubmitResult<{ files: string[] }>(toolCalls);
      expect(extracted).not.toBeNull();
      expect(extracted?.result.files).toEqual(['a.ts', 'b.ts']);
      expect(extracted?.confidence).toBe(85);
    });

    it('returns null when submit_result not present', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_123',
          name: 'glob',
          input: { pattern: '**/*.ts' },
        },
      ];

      const extracted = extractSubmitResult(toolCalls);
      expect(extracted).toBeNull();
    });

    it('extracts from multiple tool calls', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_1',
          name: 'glob',
          input: { pattern: '**/*.ts' },
        },
        {
          id: 'call_2',
          name: 'read',
          input: { path: 'src/index.ts' },
        },
        {
          id: 'call_3',
          name: 'submit_result',
          input: {
            result: { found: true },
            confidence: 100,
          },
        },
      ];

      const extracted = extractSubmitResult<{ found: boolean }>(toolCalls);
      expect(extracted?.result.found).toBe(true);
      expect(extracted?.confidence).toBe(100);
    });

    it('handles empty tool calls array', () => {
      const extracted = extractSubmitResult([]);
      expect(extracted).toBeNull();
    });
  });

  describe('hasSubmitResult', () => {
    it('returns true when submit_result present', () => {
      const toolCalls: ToolCall[] = [
        {
          id: 'call_123',
          name: 'submit_result',
          input: { result: {}, confidence: 50 },
        },
      ];

      expect(hasSubmitResult(toolCalls)).toBe(true);
    });

    it('returns false when submit_result not present', () => {
      const toolCalls: ToolCall[] = [
        { id: 'call_1', name: 'glob', input: { pattern: '*' } },
        { id: 'call_2', name: 'read', input: { path: 'x' } },
      ];

      expect(hasSubmitResult(toolCalls)).toBe(false);
    });

    it('returns false for empty array', () => {
      expect(hasSubmitResult([])).toBe(false);
    });
  });
});

// ============================================================================
// API Key Validation Tests
// ============================================================================

describe('validateApiKeys', () => {
  it('returns function exists', () => {
    expect(typeof validateApiKeys).toBe('function');
  });

  // Note: Full validation testing would require mocking process.env
  // which is complex in vitest. Integration tests cover this.
});
