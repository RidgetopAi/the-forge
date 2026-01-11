/**
 * Unit Tests for BaseWorker Abstract Class
 *
 * Phase 2.5: Comprehensive unit tests for worker abstraction layer.
 *
 * Test Categories:
 * 1. Construction - Worker instantiation
 * 2. Tool Configuration - getTools() behavior
 * 3. Single-Turn Execution - Non-exploration workers
 * 4. Multi-Turn Execution - Exploration workers
 * 5. Metrics Aggregation - Token/cost tracking
 * 6. Error Handling - Edge cases and failures
 * 7. Tool Execution - executeToolCall behavior
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';
import {
  BaseWorker,
  WorkerInput,
  WorkerResult,
  WorkerMetrics,
  ToolCallRecord,
} from '../../src/workers/base.js';
import {
  TierRouter,
  TierCallResult,
  ToolCall,
  SUBMIT_RESULT_TOOL,
} from '../../src/tiers.js';
import { WORKER_TOOLS } from '../../src/workers/tools.js';

// ============================================================================
// Test Fixtures
// ============================================================================

// Simple test output schema
const TestOutputSchema = z.object({
  items: z.array(z.string()),
  count: z.number(),
});

type TestOutput = z.infer<typeof TestOutputSchema>;

// Complex output schema for validation testing
const ComplexOutputSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      priority: z.enum(['must_read', 'should_read', 'may_read']),
    })
  ),
  totalCount: z.number().min(0),
});

type ComplexOutput = z.infer<typeof ComplexOutputSchema>;

// Concrete test worker (non-exploration)
class TestWorker extends BaseWorker<TestOutput> {
  constructor(router: TierRouter) {
    super(router, 'file_discovery', TestOutputSchema);
  }

  getSystemPrompt(): string {
    return 'You are a test worker. Return items and count.';
  }

  buildUserPrompt(input: WorkerInput): string {
    return `Task: ${input.task}`;
  }
}

// Exploration-enabled test worker
class ExplorationWorker extends BaseWorker<TestOutput> {
  protected canExplore = true;
  protected maxTurns = 5;

  constructor(router: TierRouter) {
    super(router, 'file_discovery', TestOutputSchema);
  }

  getSystemPrompt(): string {
    return 'You are an exploration worker. Use tools to find files.';
  }

  buildUserPrompt(input: WorkerInput): string {
    return `Find files matching: ${input.task}`;
  }
}

// Worker with complex schema
class ComplexSchemaWorker extends BaseWorker<ComplexOutput> {
  constructor(router: TierRouter) {
    super(router, 'file_discovery', ComplexOutputSchema);
  }

  getSystemPrompt(): string {
    return 'Return files with priorities.';
  }

  buildUserPrompt(input: WorkerInput): string {
    return input.task;
  }
}

// Helper to create mock TierRouter
function createMockRouter(): TierRouter {
  return new TierRouter();
}

// Helper to create mock TierCallResult
function createMockResult(
  overrides: Partial<TierCallResult> = {}
): TierCallResult {
  return {
    content: '',
    tier: 'haiku',
    model: 'grok-4-1-fast-reasoning',
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.00015,
    latencyMs: 500,
    ...overrides,
  };
}

// ============================================================================
// Construction Tests
// ============================================================================

describe('BaseWorker Construction', () => {
  it('creates worker with TierRouter and schema', () => {
    const router = createMockRouter();
    const worker = new TestWorker(router);
    expect(worker).toBeInstanceOf(BaseWorker);
  });

  it('creates exploration worker with canExplore = true', () => {
    const router = createMockRouter();
    const worker = new ExplorationWorker(router);
    expect(worker).toBeInstanceOf(BaseWorker);
  });

  it('abstract methods must be implemented', () => {
    const router = createMockRouter();
    const worker = new TestWorker(router);

    // Verify abstract methods return values
    expect(worker.getSystemPrompt()).toContain('test worker');
    expect(worker.buildUserPrompt({ task: 'test', projectRoot: '.' })).toBe(
      'Task: test'
    );
  });
});

// ============================================================================
// Tool Configuration Tests
// ============================================================================

describe('BaseWorker.getTools()', () => {
  it('returns only SUBMIT_RESULT_TOOL by default (non-exploration)', () => {
    const router = createMockRouter();
    const worker = new TestWorker(router);

    // Access protected method via type assertion
    const tools = (worker as any).getTools();

    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('submit_result');
  });

  it('returns all WORKER_TOOLS when canExplore=true', () => {
    const router = createMockRouter();
    const worker = new ExplorationWorker(router);

    const tools = (worker as any).getTools();

    // WORKER_TOOLS includes glob, read, grep, submit_result
    expect(tools.length).toBe(WORKER_TOOLS.length);
    expect(tools.map((t: any) => t.name)).toContain('glob');
    expect(tools.map((t: any) => t.name)).toContain('read');
    expect(tools.map((t: any) => t.name)).toContain('grep');
    expect(tools.map((t: any) => t.name)).toContain('submit_result');
  });
});

// ============================================================================
// Single-Turn Execution Tests
// ============================================================================

describe('BaseWorker.execute() - Single Turn', () => {
  let router: TierRouter;
  let callSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    router = createMockRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts result from submit_result tool call', async () => {
    const worker = new TestWorker(router);

    // Mock router.call to return submit_result
    callSpy = vi.spyOn(router, 'call').mockResolvedValue(
      createMockResult({
        toolCalls: [
          {
            id: 'call_1',
            name: 'submit_result',
            input: {
              result: { items: ['a.ts', 'b.ts'], count: 2 },
              confidence: 90,
            },
          },
        ],
        stopReason: 'tool_use',
      })
    );

    const result = await worker.execute({ task: 'test', projectRoot: '.' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ items: ['a.ts', 'b.ts'], count: 2 });
    expect(result.confidence).toBe(90);
  });

  it('forces submit_result via toolChoice for single-turn workers', async () => {
    const worker = new TestWorker(router);

    callSpy = vi.spyOn(router, 'call').mockResolvedValue(
      createMockResult({
        toolCalls: [
          {
            id: 'call_1',
            name: 'submit_result',
            input: { result: { items: [], count: 0 }, confidence: 50 },
          },
        ],
      })
    );

    await worker.execute({ task: 'test', projectRoot: '.' });

    expect(callSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        toolChoice: { type: 'tool', name: 'submit_result' },
      })
    );
  });

  it('returns error when no tool calls in response', async () => {
    const worker = new TestWorker(router);

    callSpy = vi
      .spyOn(router, 'call')
      .mockResolvedValue(createMockResult({ toolCalls: undefined }));

    const result = await worker.execute({ task: 'test', projectRoot: '.' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No submit_result');
  });

  it('returns error when submit_result not in tool calls', async () => {
    const worker = new TestWorker(router);

    callSpy = vi.spyOn(router, 'call').mockResolvedValue(
      createMockResult({
        toolCalls: [{ id: 'call_1', name: 'glob', input: { pattern: '*' } }],
      })
    );

    const result = await worker.execute({ task: 'test', projectRoot: '.' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('No submit_result');
  });

  it('validates output against Zod schema', async () => {
    const worker = new TestWorker(router);

    // Invalid shape (missing count)
    callSpy = vi.spyOn(router, 'call').mockResolvedValue(
      createMockResult({
        toolCalls: [
          {
            id: 'call_1',
            name: 'submit_result',
            input: {
              result: { items: ['a.ts'] }, // Missing count
              confidence: 80,
            },
          },
        ],
      })
    );

    const result = await worker.execute({ task: 'test', projectRoot: '.' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Zod validation failed');
  });

  it('includes confidence from submit_result', async () => {
    const worker = new TestWorker(router);

    callSpy = vi.spyOn(router, 'call').mockResolvedValue(
      createMockResult({
        toolCalls: [
          {
            id: 'call_1',
            name: 'submit_result',
            input: { result: { items: [], count: 0 }, confidence: 85 },
          },
        ],
      })
    );

    const result = await worker.execute({ task: 'test', projectRoot: '.' });

    expect(result.confidence).toBe(85);
  });
});

// ============================================================================
// Multi-Turn Execution Tests
// ============================================================================

describe('BaseWorker.execute() - Multi Turn', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('processes multiple tool calls before submit_result', async () => {
    const worker = new ExplorationWorker(router);

    // Simulate: Turn 1 = glob, Turn 2 = read, Turn 3 = submit_result
    const callSpy = vi
      .spyOn(router, 'call')
      .mockResolvedValueOnce(
        createMockResult({
          toolCalls: [
            { id: 'call_1', name: 'glob', input: { pattern: '**/*.ts' } },
          ],
          stopReason: 'tool_use',
        })
      )
      .mockResolvedValueOnce(
        createMockResult({
          toolCalls: [
            { id: 'call_2', name: 'read', input: { path: 'src/index.ts' } },
          ],
          stopReason: 'tool_use',
        })
      )
      .mockResolvedValueOnce(
        createMockResult({
          toolCalls: [
            {
              id: 'call_3',
              name: 'submit_result',
              input: {
                result: { items: ['src/index.ts'], count: 1 },
                confidence: 95,
              },
            },
          ],
          stopReason: 'tool_use',
        })
      );

    const result = await worker.execute({
      task: 'find files',
      projectRoot: process.cwd(),
    });

    expect(result.success).toBe(true);
    expect(result.metrics.turnCount).toBe(3);
    expect(callSpy).toHaveBeenCalledTimes(3);
  });

  it('enforces maxTurns limit', async () => {
    const worker = new ExplorationWorker(router);

    // Never return submit_result - always glob
    const callSpy = vi.spyOn(router, 'call').mockResolvedValue(
      createMockResult({
        toolCalls: [
          { id: 'call_1', name: 'glob', input: { pattern: '**/*.ts' } },
        ],
        stopReason: 'tool_use',
      })
    );

    const result = await worker.execute({
      task: 'find files',
      projectRoot: process.cwd(),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Max turns');
    expect(callSpy).toHaveBeenCalledTimes(5); // maxTurns = 5
  });

  it('forces submit_result on final turn', async () => {
    const worker = new ExplorationWorker(router);

    // Track all calls
    const calls: any[] = [];
    vi.spyOn(router, 'call').mockImplementation(async (options) => {
      calls.push(options);

      // On 5th call (final turn), return submit_result
      if (calls.length === 5) {
        return createMockResult({
          toolCalls: [
            {
              id: 'call_5',
              name: 'submit_result',
              input: { result: { items: [], count: 0 }, confidence: 50 },
            },
          ],
        });
      }

      // Otherwise return glob
      return createMockResult({
        toolCalls: [
          { id: `call_${calls.length}`, name: 'glob', input: { pattern: '*' } },
        ],
      });
    });

    await worker.execute({ task: 'find files', projectRoot: process.cwd() });

    // Verify last call forces submit_result
    const lastCall = calls[calls.length - 1];
    expect(lastCall.toolChoice).toEqual({ type: 'tool', name: 'submit_result' });
  });

  it('feeds tool results back to LLM via conversation context', async () => {
    const worker = new ExplorationWorker(router);

    const calls: any[] = [];
    vi.spyOn(router, 'call').mockImplementation(async (options) => {
      calls.push(options);

      if (calls.length === 1) {
        return createMockResult({
          toolCalls: [
            { id: 'call_1', name: 'glob', input: { pattern: '*.ts' } },
          ],
        });
      }

      return createMockResult({
        toolCalls: [
          {
            id: 'call_2',
            name: 'submit_result',
            input: { result: { items: ['a.ts'], count: 1 }, confidence: 90 },
          },
        ],
      });
    });

    await worker.execute({ task: 'find files', projectRoot: process.cwd() });

    // Second call should include tool results in userPrompt
    const secondCall = calls[1];
    expect(secondCall.userPrompt).toContain('Tool Results');
    expect(secondCall.userPrompt).toContain('glob');
  });

  it('breaks loop when no tool calls returned', async () => {
    const worker = new ExplorationWorker(router);

    // Return response with no tool calls
    vi.spyOn(router, 'call').mockResolvedValue(
      createMockResult({
        content: 'I am done.',
        toolCalls: [], // Empty tool calls
      })
    );

    const result = await worker.execute({
      task: 'find files',
      projectRoot: process.cwd(),
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Max turns');
  });
});

// ============================================================================
// Metrics Aggregation Tests
// ============================================================================

describe('BaseWorker Metrics', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('aggregates tokens across turns', async () => {
    const worker = new ExplorationWorker(router);

    vi.spyOn(router, 'call')
      .mockResolvedValueOnce(
        createMockResult({
          inputTokens: 100,
          outputTokens: 50,
          toolCalls: [
            { id: 'call_1', name: 'glob', input: { pattern: '*' } },
          ],
        })
      )
      .mockResolvedValueOnce(
        createMockResult({
          inputTokens: 200,
          outputTokens: 100,
          toolCalls: [
            {
              id: 'call_2',
              name: 'submit_result',
              input: { result: { items: [], count: 0 }, confidence: 80 },
            },
          ],
        })
      );

    const result = await worker.execute({
      task: 'find',
      projectRoot: process.cwd(),
    });

    expect(result.metrics.inputTokens).toBe(300); // 100 + 200
    expect(result.metrics.outputTokens).toBe(150); // 50 + 100
  });

  it('aggregates cost across turns', async () => {
    const worker = new ExplorationWorker(router);

    vi.spyOn(router, 'call')
      .mockResolvedValueOnce(
        createMockResult({
          costUsd: 0.001,
          toolCalls: [
            { id: 'call_1', name: 'glob', input: { pattern: '*' } },
          ],
        })
      )
      .mockResolvedValueOnce(
        createMockResult({
          costUsd: 0.002,
          toolCalls: [
            {
              id: 'call_2',
              name: 'submit_result',
              input: { result: { items: [], count: 0 }, confidence: 80 },
            },
          ],
        })
      );

    const result = await worker.execute({
      task: 'find',
      projectRoot: process.cwd(),
    });

    expect(result.metrics.costUsd).toBeCloseTo(0.003, 6);
  });

  it('counts tool calls correctly (excludes submit_result)', async () => {
    const worker = new ExplorationWorker(router);

    vi.spyOn(router, 'call')
      .mockResolvedValueOnce(
        createMockResult({
          toolCalls: [
            { id: 'call_1', name: 'glob', input: { pattern: '*' } },
            { id: 'call_2', name: 'read', input: { path: 'a.ts' } },
          ],
        })
      )
      .mockResolvedValueOnce(
        createMockResult({
          toolCalls: [
            { id: 'call_3', name: 'grep', input: { pattern: 'test' } },
          ],
        })
      )
      .mockResolvedValueOnce(
        createMockResult({
          toolCalls: [
            {
              id: 'call_4',
              name: 'submit_result',
              input: { result: { items: [], count: 0 }, confidence: 80 },
            },
          ],
        })
      );

    const result = await worker.execute({
      task: 'find',
      projectRoot: process.cwd(),
    });

    // glob + read + grep = 3 (submit_result ends the loop, not counted)
    expect(result.metrics.toolCallCount).toBe(3);
  });

  it('reports latency for full execution', async () => {
    const worker = new TestWorker(router);

    vi.spyOn(router, 'call').mockImplementation(async () => {
      // Simulate some delay
      await new Promise((r) => setTimeout(r, 10));
      return createMockResult({
        toolCalls: [
          {
            id: 'call_1',
            name: 'submit_result',
            input: { result: { items: [], count: 0 }, confidence: 50 },
          },
        ],
      });
    });

    const result = await worker.execute({ task: 'test', projectRoot: '.' });

    expect(result.metrics.latencyMs).toBeGreaterThanOrEqual(10);
  });

  it('reports correct tier and model', async () => {
    const worker = new TestWorker(router);

    vi.spyOn(router, 'call').mockResolvedValue(
      createMockResult({
        tier: 'haiku',
        model: 'grok-4-1-fast-reasoning',
        toolCalls: [
          {
            id: 'call_1',
            name: 'submit_result',
            input: { result: { items: [], count: 0 }, confidence: 50 },
          },
        ],
      })
    );

    const result = await worker.execute({ task: 'test', projectRoot: '.' });

    expect(result.metrics.tier).toBe('haiku');
    expect(result.metrics.model).toBe('grok-4-1-fast-reasoning');
  });

  it('turnCount is 1 for single-turn workers', async () => {
    const worker = new TestWorker(router);

    vi.spyOn(router, 'call').mockResolvedValue(
      createMockResult({
        toolCalls: [
          {
            id: 'call_1',
            name: 'submit_result',
            input: { result: { items: [], count: 0 }, confidence: 50 },
          },
        ],
      })
    );

    const result = await worker.execute({ task: 'test', projectRoot: '.' });

    expect(result.metrics.turnCount).toBe(1);
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('BaseWorker Error Handling', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('catches API errors and returns failure result', async () => {
    const worker = new TestWorker(router);

    vi.spyOn(router, 'call').mockRejectedValue(new Error('API rate limited'));

    const result = await worker.execute({ task: 'test', projectRoot: '.' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('API rate limited');
  });

  it('handles non-Error throws', async () => {
    const worker = new TestWorker(router);

    vi.spyOn(router, 'call').mockRejectedValue('string error');

    const result = await worker.execute({ task: 'test', projectRoot: '.' });

    expect(result.success).toBe(false);
    expect(result.error).toBe('string error');
  });

  it('returns metrics even on failure', async () => {
    const worker = new TestWorker(router);

    vi.spyOn(router, 'call').mockRejectedValue(new Error('fail'));

    const result = await worker.execute({ task: 'test', projectRoot: '.' });

    expect(result.metrics).toBeDefined();
    expect(result.metrics.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('handles Zod validation errors gracefully', async () => {
    const worker = new ComplexSchemaWorker(router);

    // Invalid priority value
    vi.spyOn(router, 'call').mockResolvedValue(
      createMockResult({
        toolCalls: [
          {
            id: 'call_1',
            name: 'submit_result',
            input: {
              result: {
                files: [{ path: 'a.ts', priority: 'invalid_priority' }],
                totalCount: 1,
              },
              confidence: 80,
            },
          },
        ],
      })
    );

    const result = await worker.execute({ task: 'test', projectRoot: '.' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Zod validation failed');
  });
});

// ============================================================================
// Tool Execution Tests
// ============================================================================

describe('BaseWorker.executeToolCall()', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  it('executes glob tool correctly', () => {
    const worker = new ExplorationWorker(router);
    (worker as any).projectRoot = process.cwd();

    const toolCall: ToolCall = {
      id: 'call_1',
      name: 'glob',
      input: { pattern: '*.json' },
    };

    const result = (worker as any).executeToolCall(toolCall);

    expect(result.success).toBe(true);
    // Should find package.json at minimum
    expect(result.output).toContain('package.json');
  });

  it('handles tool errors gracefully', () => {
    const worker = new ExplorationWorker(router);
    (worker as any).projectRoot = '/nonexistent/path';

    const toolCall: ToolCall = {
      id: 'call_1',
      name: 'read',
      input: { path: 'nonexistent.ts' },
    };

    const result = (worker as any).executeToolCall(toolCall);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('enforces security checks (path traversal)', () => {
    const worker = new ExplorationWorker(router);
    (worker as any).projectRoot = process.cwd();

    const toolCall: ToolCall = {
      id: 'call_1',
      name: 'read',
      input: { path: '../../../etc/passwd' },
    };

    const result = (worker as any).executeToolCall(toolCall);

    expect(result.success).toBe(false);
    expect(result.error).toContain('outside project root');
  });

  it('blocks access to ground-truth.json', () => {
    const worker = new ExplorationWorker(router);
    (worker as any).projectRoot = process.cwd();

    const toolCall: ToolCall = {
      id: 'call_1',
      name: 'read',
      input: { path: 'test/ground-truth.json' },
    };

    const result = (worker as any).executeToolCall(toolCall);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Access denied');
  });
});

// ============================================================================
// WorkerInput Handling Tests
// ============================================================================

describe('BaseWorker WorkerInput', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes task to buildUserPrompt', async () => {
    const worker = new TestWorker(router);

    vi.spyOn(router, 'call').mockResolvedValue(
      createMockResult({
        toolCalls: [
          {
            id: 'call_1',
            name: 'submit_result',
            input: { result: { items: [], count: 0 }, confidence: 50 },
          },
        ],
      })
    );

    await worker.execute({
      task: 'find TypeScript files',
      projectRoot: '/project',
    });

    expect(router.call).toHaveBeenCalledWith(
      expect.objectContaining({
        userPrompt: expect.stringContaining('find TypeScript files'),
      })
    );
  });

  it('sets projectRoot for tool execution', async () => {
    const worker = new ExplorationWorker(router);

    vi.spyOn(router, 'call').mockResolvedValue(
      createMockResult({
        toolCalls: [
          {
            id: 'call_1',
            name: 'submit_result',
            input: { result: { items: [], count: 0 }, confidence: 50 },
          },
        ],
      })
    );

    await worker.execute({
      task: 'test',
      projectRoot: '/custom/project/path',
    });

    expect((worker as any).projectRoot).toBe('/custom/project/path');
  });
});

// ============================================================================
// Tool Call Records Tests
// ============================================================================

describe('BaseWorker ToolCallRecords', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('records tool calls made during execution', async () => {
    const worker = new ExplorationWorker(router);

    vi.spyOn(router, 'call')
      .mockResolvedValueOnce(
        createMockResult({
          toolCalls: [
            { id: 'call_1', name: 'glob', input: { pattern: '*.ts' } },
          ],
        })
      )
      .mockResolvedValueOnce(
        createMockResult({
          toolCalls: [
            {
              id: 'call_2',
              name: 'submit_result',
              input: { result: { items: [], count: 0 }, confidence: 80 },
            },
          ],
        })
      );

    const result = await worker.execute({
      task: 'find',
      projectRoot: process.cwd(),
    });

    expect(result.toolCalls).toBeDefined();
    expect(result.toolCalls!.length).toBeGreaterThan(0);
    expect(result.toolCalls![0].name).toBe('glob');
    expect(result.toolCalls![0].input).toEqual({ pattern: '*.ts' });
  });

  it('includes success status in tool call records', async () => {
    const worker = new ExplorationWorker(router);

    vi.spyOn(router, 'call')
      .mockResolvedValueOnce(
        createMockResult({
          toolCalls: [
            { id: 'call_1', name: 'glob', input: { pattern: '*.ts' } },
          ],
        })
      )
      .mockResolvedValueOnce(
        createMockResult({
          toolCalls: [
            {
              id: 'call_2',
              name: 'submit_result',
              input: { result: { items: [], count: 0 }, confidence: 80 },
            },
          ],
        })
      );

    const result = await worker.execute({
      task: 'find',
      projectRoot: process.cwd(),
    });

    expect(result.toolCalls![0].success).toBe(true);
  });
});
