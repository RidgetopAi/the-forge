/**
 * Unit Tests for FeedbackRouter
 *
 * Phase 6.6: Comprehensive unit tests for error routing system.
 *
 * Test Categories:
 * 1. categorizeError() - Error pattern matching
 * 2. routeError() - Decision logic for each category
 * 3. Max retry limit enforcement
 * 4. Pattern failure recording
 * 5. Opus stuck point resolution (mocked)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  FeedbackRouter,
  createFeedbackRouter,
  ErrorCategory,
  ErrorContext,
  FeedbackAction,
} from '../src/feedback-router.js';
import { TierRouter, TierCallResult } from '../src/tiers.js';
import { PatternTracker } from '../src/pattern-tracker.js';

// ============================================================================
// Mock TierRouter
// ============================================================================

function createMockTierRouter(): TierRouter & {
  callResult: TierCallResult;
  lastCallOptions: { operation: string; userPrompt: string } | null;
} {
  const mock = {
    callResult: {
      content: '{"action": "human_sync", "reason": "Test fallback"}',
      tier: 'opus' as const,
      model: 'claude-opus-4-5-20251101',
      inputTokens: 100,
      outputTokens: 50,
      costUsd: 0.01,
      latencyMs: 500,
    } as TierCallResult,
    lastCallOptions: null as { operation: string; userPrompt: string } | null,

    async call(options: { operation: string; userPrompt: string }) {
      mock.lastCallOptions = { operation: options.operation, userPrompt: options.userPrompt };
      return mock.callResult;
    },

    // Stubs for other TierRouter methods
    getTierForOperation() { return 'opus' as const; },
    getModelForTier() { return 'claude-opus-4-5-20251101'; },
    getCostDistribution() {
      return {
        opus: { absolute: 0, percentage: 0 },
        sonnet: { absolute: 0, percentage: 0 },
        haiku: { absolute: 0, percentage: 0 },
      };
    },
    getTotalCost() { return 0; },
    resetCostAccumulator() {},
  };

  return mock as unknown as TierRouter & {
    callResult: TierCallResult;
    lastCallOptions: { operation: string; userPrompt: string } | null;
  };
}

// ============================================================================
// Mock PatternTracker
// ============================================================================

function createMockPatternTracker(): PatternTracker & {
  recordedSuccesses: Array<{ patternId: string; patternName: string; context: string }>;
  recordedFailures: Array<{ patternId: string; patternName: string }>;
} {
  const mock = {
    recordedSuccesses: [] as Array<{ patternId: string; patternName: string; context: string }>,
    recordedFailures: [] as Array<{ patternId: string; patternName: string }>,

    async recordSuccess(patternId: string, patternName: string, context: string) {
      mock.recordedSuccesses.push({ patternId, patternName, context });
    },

    async recordFailure(patternId: string, patternName: string) {
      mock.recordedFailures.push({ patternId, patternName });
    },

    // Stubs for other PatternTracker methods
    getRecommendedPatterns() { return []; },
    getAllPatterns() { return []; },
    getPattern() { return undefined; },
    isLoaded() { return true; },
    async reload() {},
    async loadPatterns() {},
  };

  return mock as unknown as PatternTracker & {
    recordedSuccesses: Array<{ patternId: string; patternName: string; context: string }>;
    recordedFailures: Array<{ patternId: string; patternName: string }>;
  };
}

// ============================================================================
// categorizeError() Tests
// ============================================================================

describe('categorizeError()', () => {
  let router: FeedbackRouter;

  beforeEach(() => {
    router = createFeedbackRouter(
      createMockTierRouter() as unknown as TierRouter,
      createMockPatternTracker() as unknown as PatternTracker
    );
  });

  describe('type_error', () => {
    it('categorizes TypeScript errors with TS#### pattern', () => {
      expect(router.categorizeError('error TS2304: Cannot find name "foo"'))
        .toBe('type_error');
    });

    it('categorizes TS2322 type mismatch errors', () => {
      expect(router.categorizeError("TS2322: Type 'string' is not assignable to type 'number'"))
        .toBe('type_error');
    });

    it('categorizes TS2339 property access errors', () => {
      expect(router.categorizeError("error TS2339: Property 'bar' does not exist on type 'Foo'"))
        .toBe('type_error');
    });

    it('categorizes TS7006 implicit any errors', () => {
      expect(router.categorizeError("error TS7006: Parameter 'x' implicitly has an 'any' type"))
        .toBe('type_error');
    });
  });

  describe('compilation_error', () => {
    it('categorizes syntax errors', () => {
      expect(router.categorizeError('SyntaxError: Unexpected token }'))
        .toBe('compilation_error');
    });

    it('categorizes compilation failures', () => {
      expect(router.categorizeError('Cannot compile: missing semicolon'))
        .toBe('compilation_error');
    });

    it('categorizes unexpected token errors', () => {
      expect(router.categorizeError('Unexpected token, expected ";"'))
        .toBe('compilation_error');
    });

    it('categorizes parse errors', () => {
      expect(router.categorizeError('Parse error: Unexpected identifier'))
        .toBe('compilation_error');
    });
  });

  describe('test_failure', () => {
    it('categorizes FAIL output', () => {
      expect(router.categorizeError('FAIL src/utils.test.ts'))
        .toBe('test_failure');
    });

    it('categorizes test failed messages', () => {
      expect(router.categorizeError('test failed: should return correct value'))
        .toBe('test_failure');
    });

    it('categorizes assertion errors', () => {
      expect(router.categorizeError('AssertionError: expected 1 to equal 2'))
        .toBe('test_failure');
    });

    it('categorizes Expected assertions', () => {
      expect(router.categorizeError('Expected: 42, Received: undefined'))
        .toBe('test_failure');
    });

    it('categorizes failing test counts', () => {
      expect(router.categorizeError('3 failing tests in suite'))
        .toBe('test_failure');
    });
  });

  describe('lint_error', () => {
    it('categorizes ESLint errors', () => {
      expect(router.categorizeError('ESLint: no-unused-vars'))
        .toBe('lint_error');
    });

    it('categorizes Prettier errors', () => {
      expect(router.categorizeError('Prettier: formatting issue on line 42'))
        .toBe('lint_error');
    });

    it('categorizes lowercase eslint mentions', () => {
      expect(router.categorizeError('Running eslint --fix'))
        .toBe('lint_error');
    });
  });

  describe('timeout', () => {
    it('categorizes timeout errors', () => {
      expect(router.categorizeError('timeout: operation took too long'))
        .toBe('timeout');
    });

    it('categorizes ETIMEOUT errors', () => {
      expect(router.categorizeError('Error: ETIMEOUT connecting to server'))
        .toBe('timeout');
    });

    it('categorizes "timed out" messages', () => {
      expect(router.categorizeError('Request timed out after 30s'))
        .toBe('timeout');
    });

    it('categorizes ETIMEDOUT errors', () => {
      expect(router.categorizeError('Error: connect ETIMEDOUT 192.168.1.1:443'))
        .toBe('timeout');
    });
  });

  describe('runtime_error', () => {
    it('categorizes generic Error messages', () => {
      expect(router.categorizeError('Error: something went wrong'))
        .toBe('runtime_error');
    });

    it('categorizes Exception messages', () => {
      expect(router.categorizeError('NullPointerException: null reference'))
        .toBe('runtime_error');
    });

    it('categorizes undefined is not errors', () => {
      expect(router.categorizeError('undefined is not a function'))
        .toBe('runtime_error');
    });

    it('categorizes null is not errors', () => {
      expect(router.categorizeError('null is not an object'))
        .toBe('runtime_error');
    });

    it('categorizes cannot read property errors', () => {
      expect(router.categorizeError("cannot read property 'length' of undefined"))
        .toBe('runtime_error');
    });
  });

  describe('unknown', () => {
    it('categorizes unrecognized errors as unknown', () => {
      expect(router.categorizeError('Some weird error happened'))
        .toBe('unknown');
    });

    it('categorizes empty string as unknown', () => {
      expect(router.categorizeError(''))
        .toBe('unknown');
    });
  });
});

// ============================================================================
// routeError() Decision Logic Tests
// ============================================================================

describe('routeError() Decision Logic', () => {
  let router: FeedbackRouter;
  let mockTierRouter: ReturnType<typeof createMockTierRouter>;
  let mockPatternTracker: ReturnType<typeof createMockPatternTracker>;

  beforeEach(() => {
    mockTierRouter = createMockTierRouter();
    mockPatternTracker = createMockPatternTracker();
    router = createFeedbackRouter(
      mockTierRouter as unknown as TierRouter,
      mockPatternTracker as unknown as PatternTracker
    );
  });

  describe('type_error routing', () => {
    it('routes to retry with fix suggestion', async () => {
      const context: ErrorContext = {
        category: 'type_error',
        message: "error TS2304: Cannot find name 'foo'",
        previousAttempts: 0,
      };

      const action = await router.routeError(context);

      expect(action.action).toBe('retry');
      expect(action.suggestedFix).toContain("Import or declare 'foo'");
    });

    it('provides type mismatch fix suggestion', async () => {
      const context: ErrorContext = {
        category: 'type_error',
        message: "TS2322: Type 'string' is not assignable to type 'number'",
        previousAttempts: 0,
      };

      const action = await router.routeError(context);

      expect(action.action).toBe('retry');
      expect(action.suggestedFix).toContain('type');
    });

    it('provides property access fix suggestion', async () => {
      const context: ErrorContext = {
        category: 'type_error',
        message: "TS2339: Property 'bar' does not exist on type 'Foo'",
        previousAttempts: 0,
      };

      const action = await router.routeError(context);

      expect(action.action).toBe('retry');
      expect(action.suggestedFix).toContain("'bar'");
      expect(action.suggestedFix).toContain("'Foo'");
    });
  });

  describe('compilation_error routing', () => {
    it('routes to retry with syntax fix suggestion', async () => {
      const context: ErrorContext = {
        category: 'compilation_error',
        message: 'Unexpected token }',
        previousAttempts: 0,
      };

      const action = await router.routeError(context);

      expect(action.action).toBe('retry');
      expect(action.reason).toContain('syntax');
    });
  });

  describe('test_failure routing', () => {
    it('routes to retry for test failures', async () => {
      const context: ErrorContext = {
        category: 'test_failure',
        message: 'FAIL: expected 42, got undefined',
        previousAttempts: 0,
      };

      const action = await router.routeError(context);

      expect(action.action).toBe('retry');
      expect(action.reason).toContain('Test failed');
    });
  });

  describe('lint_error routing', () => {
    it('routes to retry for lint errors', async () => {
      const context: ErrorContext = {
        category: 'lint_error',
        message: 'ESLint: no-unused-vars',
        previousAttempts: 0,
      };

      const action = await router.routeError(context);

      expect(action.action).toBe('retry');
      expect(action.suggestedFix).toContain('fix');
    });
  });

  describe('timeout routing', () => {
    it('routes to escalate for timeout errors', async () => {
      const context: ErrorContext = {
        category: 'timeout',
        message: 'Operation timed out',
        previousAttempts: 0,
      };

      const action = await router.routeError(context);

      expect(action.action).toBe('escalate');
      expect(action.reason).toContain('loop');
    });
  });

  describe('runtime_error routing', () => {
    it('routes to retry on first attempt', async () => {
      const context: ErrorContext = {
        category: 'runtime_error',
        message: 'undefined is not a function',
        previousAttempts: 0,
      };

      const action = await router.routeError(context);

      expect(action.action).toBe('retry');
    });

    it('routes to escalate after first retry', async () => {
      const context: ErrorContext = {
        category: 'runtime_error',
        message: 'undefined is not a function',
        previousAttempts: 1,
      };

      const action = await router.routeError(context);

      expect(action.action).toBe('escalate');
      expect(action.reason).toContain('persists');
    });
  });

  describe('unknown error routing', () => {
    it('invokes Opus for judgment', async () => {
      mockTierRouter.callResult = {
        ...mockTierRouter.callResult,
        content: '{"action": "retry", "reason": "Opus says retry", "suggestedFix": "Do this"}',
      };

      const context: ErrorContext = {
        category: 'unknown',
        message: 'Some weird error',
        previousAttempts: 0,
      };

      const action = await router.routeError(context);

      expect(mockTierRouter.lastCallOptions?.operation).toBe('resolve_stuck_point');
      expect(action.action).toBe('retry');
      expect(action.reason).toBe('Opus says retry');
    });

    it('falls back to human_sync on Opus failure', async () => {
      mockTierRouter.callResult = {
        ...mockTierRouter.callResult,
        content: 'not valid json',
      };

      const context: ErrorContext = {
        category: 'unknown',
        message: 'Some weird error',
        previousAttempts: 0,
      };

      const action = await router.routeError(context);

      expect(action.action).toBe('human_sync');
    });
  });
});

// ============================================================================
// Max Retry Limit Tests
// ============================================================================

describe('Max Retry Limit', () => {
  let router: FeedbackRouter;
  let mockPatternTracker: ReturnType<typeof createMockPatternTracker>;

  beforeEach(() => {
    mockPatternTracker = createMockPatternTracker();
    router = createFeedbackRouter(
      createMockTierRouter() as unknown as TierRouter,
      mockPatternTracker as unknown as PatternTracker
    );
  });

  it('escalates when max retries reached', async () => {
    const context: ErrorContext = {
      category: 'type_error',
      message: 'error TS2304',
      previousAttempts: 3, // Default max is 3
    };

    const action = await router.routeError(context);

    expect(action.action).toBe('escalate');
    expect(action.reason).toContain('Max retries');
  });

  it('escalates when max retries exceeded', async () => {
    const context: ErrorContext = {
      category: 'compilation_error',
      message: 'SyntaxError',
      previousAttempts: 5, // Well over the limit
    };

    const action = await router.routeError(context);

    expect(action.action).toBe('escalate');
  });

  it('still allows retry when under max', async () => {
    const context: ErrorContext = {
      category: 'type_error',
      message: 'error TS2304',
      previousAttempts: 2, // Under default max of 3
    };

    const action = await router.routeError(context);

    expect(action.action).toBe('retry');
  });

  it('records pattern failure when max retries exceeded', async () => {
    const context: ErrorContext = {
      category: 'type_error',
      message: 'error TS2304',
      previousAttempts: 3,
      patternId: 'test-pattern',
      patternName: 'Test Pattern',
    };

    await router.routeError(context);

    expect(mockPatternTracker.recordedFailures.length).toBe(1);
    expect(mockPatternTracker.recordedFailures[0].patternId).toBe('test-pattern');
  });

  it('includes patternToUpdate in action when pattern present', async () => {
    const context: ErrorContext = {
      category: 'lint_error',
      message: 'ESLint error',
      previousAttempts: 3,
      patternId: 'my-pattern',
      patternName: 'My Pattern',
    };

    const action = await router.routeError(context);

    expect(action.patternToUpdate).toBe('my-pattern');
  });
});

// ============================================================================
// Configuration Tests
// ============================================================================

describe('Configuration', () => {
  let router: FeedbackRouter;

  beforeEach(() => {
    router = createFeedbackRouter(
      createMockTierRouter() as unknown as TierRouter,
      createMockPatternTracker() as unknown as PatternTracker
    );
  });

  it('getMaxAutoRetries returns default value', () => {
    expect(router.getMaxAutoRetries()).toBe(3);
  });

  it('setMaxAutoRetries changes the limit', async () => {
    router.setMaxAutoRetries(5);
    expect(router.getMaxAutoRetries()).toBe(5);

    // Should still allow retry at 4 attempts
    const context: ErrorContext = {
      category: 'type_error',
      message: 'error TS2304',
      previousAttempts: 4,
    };

    const action = await router.routeError(context);
    expect(action.action).toBe('retry');
  });

  it('setMaxAutoRetries enforces new limit', async () => {
    router.setMaxAutoRetries(2);

    const context: ErrorContext = {
      category: 'type_error',
      message: 'error TS2304',
      previousAttempts: 2,
    };

    const action = await router.routeError(context);
    expect(action.action).toBe('escalate');
  });
});

// ============================================================================
// Pattern Tracking Integration Tests
// ============================================================================

describe('Pattern Tracking Integration', () => {
  let router: FeedbackRouter;
  let mockPatternTracker: ReturnType<typeof createMockPatternTracker>;

  beforeEach(() => {
    mockPatternTracker = createMockPatternTracker();
    router = createFeedbackRouter(
      createMockTierRouter() as unknown as TierRouter,
      mockPatternTracker as unknown as PatternTracker
    );
  });

  it('recordPatternFailure calls through to tracker', async () => {
    await router.recordPatternFailure('p1', 'Pattern One');

    expect(mockPatternTracker.recordedFailures.length).toBe(1);
    expect(mockPatternTracker.recordedFailures[0]).toEqual({
      patternId: 'p1',
      patternName: 'Pattern One',
    });
  });

  it('recordPatternSuccess calls through to tracker', async () => {
    await router.recordPatternSuccess('p1', 'Pattern One', 'feature');

    expect(mockPatternTracker.recordedSuccesses.length).toBe(1);
    expect(mockPatternTracker.recordedSuccesses[0]).toEqual({
      patternId: 'p1',
      patternName: 'Pattern One',
      context: 'feature',
    });
  });
});

// ============================================================================
// Fix Suggestion Tests
// ============================================================================

describe('Fix Suggestions', () => {
  let router: FeedbackRouter;

  beforeEach(() => {
    router = createFeedbackRouter(
      createMockTierRouter() as unknown as TierRouter,
      createMockPatternTracker() as unknown as PatternTracker
    );
  });

  it('extracts variable name from TS2304 error', async () => {
    const context: ErrorContext = {
      category: 'type_error',
      message: "error TS2304: Cannot find name 'myVariable'",
      previousAttempts: 0,
    };

    const action = await router.routeError(context);

    expect(action.suggestedFix).toContain("'myVariable'");
  });

  it('extracts property and type from TS2339 error', async () => {
    const context: ErrorContext = {
      category: 'type_error',
      message: "TS2339: Property 'onClick' does not exist on type 'ButtonProps'",
      previousAttempts: 0,
    };

    const action = await router.routeError(context);

    expect(action.suggestedFix).toContain("'onClick'");
    expect(action.suggestedFix).toContain("'ButtonProps'");
  });

  it('suggests null checks for runtime errors', async () => {
    const context: ErrorContext = {
      category: 'runtime_error',
      message: 'undefined is not a function',
      previousAttempts: 0,
    };

    const action = await router.routeError(context);

    expect(action.suggestedFix).toContain('null');
    expect(action.suggestedFix).toContain('undefined');
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe('Edge Cases', () => {
  let router: FeedbackRouter;

  beforeEach(() => {
    router = createFeedbackRouter(
      createMockTierRouter() as unknown as TierRouter,
      createMockPatternTracker() as unknown as PatternTracker
    );
  });

  it('handles context with no pattern information', async () => {
    const context: ErrorContext = {
      category: 'type_error',
      message: 'error TS2304',
      previousAttempts: 0,
      // No patternId or patternName
    };

    const action = await router.routeError(context);

    expect(action.action).toBe('retry');
    expect(action.patternToUpdate).toBeUndefined();
  });

  it('handles context with file and line information', async () => {
    const context: ErrorContext = {
      category: 'type_error',
      message: 'error TS2304',
      file: '/path/to/file.ts',
      line: 42,
      previousAttempts: 0,
    };

    const action = await router.routeError(context);

    expect(action.action).toBe('retry');
  });

  it('handles context with stack trace', async () => {
    const context: ErrorContext = {
      category: 'runtime_error',
      message: 'Error: something failed',
      stackTrace: 'at Object.<anonymous> (/path/to/file.js:10:5)\nat Module._compile',
      previousAttempts: 0,
    };

    const action = await router.routeError(context);

    expect(action.action).toBe('retry');
  });
});
