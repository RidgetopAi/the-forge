/**
 * Unit Tests for Preparation Department - Phase 4 Worker Integration
 *
 * Task 4.5: Tests for wave-based parallel worker dispatch and Foreman synthesis.
 *
 * Test Categories:
 * 1. Worker Initialization
 * 2. Wave-Based Execution (Wave 1 before Wave 2)
 * 3. Parallel Execution Within Waves
 * 4. Foreman Synthesis
 * 5. Error Handling
 * 6. Metrics Aggregation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PreparationForeman, createPreparationForeman } from '../../src/departments/preparation.js';
import { TierRouter } from '../../src/tiers.js';
import type { WorkerResult, WorkerMetrics } from '../../src/workers/base.js';
import type {
  FileDiscoveryOutput,
  PatternExtractionOutput,
  DependencyMappingOutput,
  ConstraintIdentificationOutput,
} from '../../src/workers/index.js';

// ============================================================================
// Mock Factories
// ============================================================================

/**
 * Create mock worker metrics
 */
function createMockMetrics(overrides: Partial<WorkerMetrics> = {}): WorkerMetrics {
  return {
    inputTokens: 100,
    outputTokens: 50,
    costUsd: 0.001,
    latencyMs: 500,
    turnCount: 1,
    toolCallCount: 2,
    tier: 'haiku',
    model: 'grok-4-1-fast-reasoning',
    ...overrides,
  };
}

/**
 * Create mock FileDiscoveryOutput
 */
function createMockFileDiscovery(): FileDiscoveryOutput {
  return {
    relevantFiles: [
      { path: 'src/index.ts', reason: 'Main entry point', priority: 'must_read' },
      { path: 'src/utils.ts', reason: 'Utility functions', priority: 'should_read' },
      { path: 'src/types.ts', reason: 'Type definitions', priority: 'may_read' },
    ],
    suggestedNewFiles: [
      { path: 'src/new-feature.ts', purpose: 'New feature implementation' },
    ],
    confidence: 85,
  };
}

/**
 * Create mock PatternExtractionOutput
 */
function createMockPatternExtraction(): PatternExtractionOutput {
  return {
    patterns: [
      {
        name: 'Error Handling',
        description: 'Use try/catch with typed errors',
        examples: ['try { } catch (e) { if (e instanceof CustomError) ... }'],
        applicability: 'All async functions',
      },
    ],
    conventions: {
      naming: 'camelCase for variables, PascalCase for types',
      fileOrganization: 'Feature-based directory structure',
      errorHandling: 'Custom error classes extending Error',
      testing: 'Vitest with describe/it blocks',
    },
    antiPatterns: [],
  };
}

/**
 * Create mock DependencyMappingOutput
 */
function createMockDependencyMapping(): DependencyMappingOutput {
  return {
    dependencies: [
      {
        source: 'src/index.ts',
        target: 'src/utils.ts',
        type: 'import',
        importedSymbols: ['helper'],
      },
    ],
    externalDependencies: [
      { name: 'zod', version: '^3.22.0', usage: 'Schema validation' },
    ],
    entryPoints: [
      { path: 'src/index.ts', type: 'main', exports: ['main'] },
    ],
    circularDependencies: [],
  };
}

/**
 * Create mock ConstraintIdentificationOutput
 */
function createMockConstraintIdentification(): ConstraintIdentificationOutput {
  return {
    typeConstraints: [
      {
        rule: 'strict mode enabled',
        enforcement: 'compile_time',
        severity: 'error',
        source: 'tsconfig.json',
      },
    ],
    testConstraints: [
      {
        rule: 'Tests must pass',
        enforcement: 'runtime',
        severity: 'error',
        source: 'CI pipeline',
      },
    ],
    lintConstraints: [],
    buildConstraints: [],
    apiConstraints: [],
  };
}

/**
 * Create a successful worker result
 */
function createSuccessResult<T>(data: T, metrics?: Partial<WorkerMetrics>): WorkerResult<T> {
  return {
    success: true,
    data,
    confidence: 85,
    metrics: createMockMetrics(metrics),
  };
}

/**
 * Create a failed worker result
 */
function createFailedResult<T>(error: string, metrics?: Partial<WorkerMetrics>): WorkerResult<T> {
  return {
    success: false,
    error,
    metrics: createMockMetrics(metrics),
  };
}

// ============================================================================
// Test Suites
// ============================================================================

describe('PreparationForeman', () => {
  let mockTierRouter: TierRouter;
  let foreman: PreparationForeman;
  let executionOrder: string[];

  beforeEach(() => {
    // Reset execution order tracker
    executionOrder = [];

    // Create mock TierRouter
    mockTierRouter = {
      call: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          task: {
            description: 'Test task',
            acceptanceCriteria: ['Tests pass'],
            scope: { inScope: ['feature'], outOfScope: [] },
          },
          architecture: {
            overview: 'Test architecture',
            relevantComponents: [],
            dependencies: [],
          },
          codeContext: {
            mustRead: [],
            mustNotModify: [],
            relatedExamples: [],
          },
          patterns: {
            namingConventions: 'camelCase',
            fileOrganization: 'feature-based',
            testingApproach: 'Vitest',
            errorHandling: 'try/catch',
            codeStyle: [],
          },
          constraints: {
            technical: [],
            quality: [],
            timeline: null,
          },
          risks: [],
          history: {
            previousAttempts: [],
            relatedDecisions: [],
          },
          humanSync: {
            requiredBefore: [],
            ambiguities: [],
          },
        }),
        tier: 'sonnet',
        model: 'claude-sonnet-4-20250514',
        inputTokens: 1000,
        outputTokens: 500,
        costUsd: 0.01,
        latencyMs: 2000,
      }),
      getTierForOperation: vi.fn().mockReturnValue('haiku'),
      getModelForTier: vi.fn().mockReturnValue('grok-4-1-fast-reasoning'),
      getCostDistribution: vi.fn().mockReturnValue({
        opus: { absolute: 0, percentage: 0 },
        sonnet: { absolute: 0.01, percentage: 0.5 },
        haiku: { absolute: 0.01, percentage: 0.5 },
      }),
      getTotalCost: vi.fn().mockReturnValue(0.02),
      resetCostAccumulator: vi.fn(),
    } as unknown as TierRouter;

    // Create foreman with mocked router
    foreman = createPreparationForeman('test-instance', mockTierRouter);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ============================================================================
  // Worker Initialization Tests
  // ============================================================================

  describe('Worker Initialization', () => {
    it('creates foreman with TierRouter', () => {
      expect(foreman).toBeDefined();
    });

    it('uses provided TierRouter', () => {
      // The foreman should use the injected TierRouter
      // We can verify this by checking that worker executions use it
      expect(mockTierRouter).toBeDefined();
    });

    it('creates foreman with default TierRouter when not provided', () => {
      const defaultForeman = createPreparationForeman('default-instance');
      expect(defaultForeman).toBeDefined();
    });
  });

  // ============================================================================
  // Wave-Based Execution Tests
  // ============================================================================

  describe('Wave-Based Execution', () => {
    beforeEach(() => {
      // Mock all worker execute methods
      const fileDiscoveryMock = vi.fn().mockImplementation(async () => {
        executionOrder.push('wave1-fileDiscovery');
        await new Promise(resolve => setTimeout(resolve, 10));
        return createSuccessResult(createMockFileDiscovery());
      });

      const constraintMock = vi.fn().mockImplementation(async () => {
        executionOrder.push('wave1-constraint');
        await new Promise(resolve => setTimeout(resolve, 10));
        return createSuccessResult(createMockConstraintIdentification());
      });

      const patternMock = vi.fn().mockImplementation(async () => {
        executionOrder.push('wave2-pattern');
        await new Promise(resolve => setTimeout(resolve, 10));
        return createSuccessResult(createMockPatternExtraction());
      });

      const dependencyMock = vi.fn().mockImplementation(async () => {
        executionOrder.push('wave2-dependency');
        await new Promise(resolve => setTimeout(resolve, 10));
        return createSuccessResult(createMockDependencyMapping());
      });

      // Access private llmWorkers via type assertion
      const foremanAny = foreman as any;
      foremanAny.llmWorkers = {
        fileDiscovery: { execute: fileDiscoveryMock },
        constraintIdentifier: { execute: constraintMock },
        patternExtraction: { execute: patternMock },
        dependencyMapper: { execute: dependencyMock },
        webResearch: { execute: vi.fn().mockResolvedValue(createSuccessResult({ findings: [], recommendations: [], unknowns: [] })) },
        documentationReader: { execute: vi.fn().mockResolvedValue(createSuccessResult({ summary: '', relevantSections: [], apiReferences: [], examples: [], warnings: [] })) },
      };
    });

    it('executes Wave 1 workers before Wave 2', async () => {
      const result = await foreman.executeWaveBasedWorkers(
        'Add user authentication',
        '/test/project'
      );

      expect(result.success).toBe(true);

      // Check that all Wave 1 workers ran before Wave 2
      const wave1Indices = executionOrder
        .map((op, i) => op.startsWith('wave1-') ? i : -1)
        .filter(i => i !== -1);
      const wave2Indices = executionOrder
        .map((op, i) => op.startsWith('wave2-') ? i : -1)
        .filter(i => i !== -1);

      // All Wave 1 indices should be less than all Wave 2 indices
      const maxWave1 = Math.max(...wave1Indices);
      const minWave2 = Math.min(...wave2Indices);
      expect(maxWave1).toBeLessThan(minWave2);
    });

    it('executes Wave 1 workers in parallel', async () => {
      // Track start times
      const startTimes: Record<string, number> = {};
      const foremanAny = foreman as any;

      foremanAny.llmWorkers.fileDiscovery.execute = vi.fn().mockImplementation(async () => {
        startTimes['fileDiscovery'] = Date.now();
        await new Promise(resolve => setTimeout(resolve, 50));
        return createSuccessResult(createMockFileDiscovery());
      });

      foremanAny.llmWorkers.constraintIdentifier.execute = vi.fn().mockImplementation(async () => {
        startTimes['constraint'] = Date.now();
        await new Promise(resolve => setTimeout(resolve, 50));
        return createSuccessResult(createMockConstraintIdentification());
      });

      const startTime = Date.now();
      await foreman.executeWaveBasedWorkers('Test task', '/test');
      const duration = Date.now() - startTime;

      // Both workers should start within 10ms of each other (parallel)
      expect(Math.abs(startTimes['fileDiscovery'] - startTimes['constraint'])).toBeLessThan(20);

      // Total duration should be ~50ms (parallel), not ~100ms (sequential)
      // Allow some buffer for test overhead
      expect(duration).toBeLessThan(200);
    });

    it('executes Wave 2 workers in parallel', async () => {
      const startTimes: Record<string, number> = {};
      const foremanAny = foreman as any;

      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockImplementation(async () => {
        startTimes['pattern'] = Date.now();
        await new Promise(resolve => setTimeout(resolve, 30));
        return createSuccessResult(createMockPatternExtraction());
      });

      foremanAny.llmWorkers.dependencyMapper.execute = vi.fn().mockImplementation(async () => {
        startTimes['dependency'] = Date.now();
        await new Promise(resolve => setTimeout(resolve, 30));
        return createSuccessResult(createMockDependencyMapping());
      });

      await foreman.executeWaveBasedWorkers('Test task', '/test');

      // Wave 2 workers should start within 10ms of each other
      expect(Math.abs(startTimes['pattern'] - startTimes['dependency'])).toBeLessThan(20);
    });

    it('passes Wave 1 results to Wave 2 workers', async () => {
      const foremanAny = foreman as any;
      let patternInput: any;

      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockImplementation(async (input: any) => {
        patternInput = input;
        return createSuccessResult(createMockPatternExtraction());
      });

      await foreman.executeWaveBasedWorkers('Test task', '/test');

      // Wave 2 should receive fileList in additionalContext
      expect(patternInput.additionalContext).toBeDefined();
      expect(patternInput.additionalContext.fileList).toContain('src/index.ts');
    });
  });

  // ============================================================================
  // Error Handling Tests
  // ============================================================================

  describe('Error Handling', () => {
    it('fails if FileDiscovery fails (required worker)', async () => {
      const foremanAny = foreman as any;

      // Need to mock all wave 1 workers since they run in parallel
      foremanAny.llmWorkers.fileDiscovery.execute = vi.fn().mockResolvedValue(
        createFailedResult('Network error')
      );
      foremanAny.llmWorkers.constraintIdentifier.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockConstraintIdentification())
      );
      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockPatternExtraction())
      );
      foremanAny.llmWorkers.dependencyMapper.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockDependencyMapping())
      );

      const result = await foreman.executeWaveBasedWorkers('Test task', '/nonexistent/test/path');

      expect(result.success).toBe(false);
      expect(result.error).toContain('FileDiscovery is required');
    });

    it('continues if optional worker fails', async () => {
      const foremanAny = foreman as any;

      // FileDiscovery succeeds
      foremanAny.llmWorkers.fileDiscovery.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockFileDiscovery())
      );

      // ConstraintIdentifier succeeds
      foremanAny.llmWorkers.constraintIdentifier.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockConstraintIdentification())
      );

      // PatternExtraction fails
      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockResolvedValue(
        createFailedResult('Pattern extraction failed')
      );

      // DependencyMapper succeeds
      foremanAny.llmWorkers.dependencyMapper.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockDependencyMapping())
      );

      const result = await foreman.executeWaveBasedWorkers('Test task', '/test');

      // Should still succeed because FileDiscovery is the only required worker
      expect(result.success).toBe(true);
      expect(result.results?.patternExtraction).toBeUndefined();
      expect(result.results?.dependencyMapping).toBeDefined();
    });

    it('tracks failed worker count in metrics', async () => {
      const foremanAny = foreman as any;

      foremanAny.llmWorkers.fileDiscovery.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockFileDiscovery())
      );
      foremanAny.llmWorkers.constraintIdentifier.execute = vi.fn().mockResolvedValue(
        createFailedResult('Constraint error')
      );
      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockPatternExtraction())
      );
      foremanAny.llmWorkers.dependencyMapper.execute = vi.fn().mockResolvedValue(
        createFailedResult('Dependency error')
      );

      const result = await foreman.executeWaveBasedWorkers('Test task', '/test');

      expect(result.results?.metrics.workerCounts.succeeded).toBe(2);
      expect(result.results?.metrics.workerCounts.failed).toBe(2);
    });
  });

  // ============================================================================
  // Metrics Aggregation Tests
  // ============================================================================

  describe('Metrics Aggregation', () => {
    it('aggregates token counts across workers', async () => {
      const foremanAny = foreman as any;

      foremanAny.llmWorkers.fileDiscovery.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockFileDiscovery(), { inputTokens: 100, outputTokens: 50 })
      );
      foremanAny.llmWorkers.constraintIdentifier.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockConstraintIdentification(), { inputTokens: 80, outputTokens: 40 })
      );
      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockPatternExtraction(), { inputTokens: 120, outputTokens: 60 })
      );
      foremanAny.llmWorkers.dependencyMapper.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockDependencyMapping(), { inputTokens: 90, outputTokens: 45 })
      );

      const result = await foreman.executeWaveBasedWorkers('Test task', '/test');

      expect(result.results?.metrics.totalInputTokens).toBe(100 + 80 + 120 + 90);
      expect(result.results?.metrics.totalOutputTokens).toBe(50 + 40 + 60 + 45);
    });

    it('aggregates cost across workers', async () => {
      const foremanAny = foreman as any;

      foremanAny.llmWorkers.fileDiscovery.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockFileDiscovery(), { costUsd: 0.001 })
      );
      foremanAny.llmWorkers.constraintIdentifier.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockConstraintIdentification(), { costUsd: 0.002 })
      );
      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockPatternExtraction(), { costUsd: 0.001 })
      );
      foremanAny.llmWorkers.dependencyMapper.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockDependencyMapping(), { costUsd: 0.001 })
      );

      const result = await foreman.executeWaveBasedWorkers('Test task', '/test');

      expect(result.results?.metrics.totalCostUsd).toBeCloseTo(0.005, 5);
    });
  });

  // ============================================================================
  // Foreman Synthesis Tests
  // ============================================================================

  describe('Foreman Synthesis', () => {
    it('calls TierRouter with context_package_assembly operation', async () => {
      const foremanAny = foreman as any;

      // Setup successful worker results
      foremanAny.llmWorkers.fileDiscovery.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockFileDiscovery())
      );
      foremanAny.llmWorkers.constraintIdentifier.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockConstraintIdentification())
      );
      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockPatternExtraction())
      );
      foremanAny.llmWorkers.dependencyMapper.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockDependencyMapping())
      );

      await foreman.prepareWithLLM('Test task', '/test');

      expect(mockTierRouter.call).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: 'context_package_assembly',
        })
      );
    });

    it('includes worker results in synthesis prompt', async () => {
      const foremanAny = foreman as any;

      foremanAny.llmWorkers.fileDiscovery.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockFileDiscovery())
      );
      foremanAny.llmWorkers.constraintIdentifier.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockConstraintIdentification())
      );
      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockPatternExtraction())
      );
      foremanAny.llmWorkers.dependencyMapper.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockDependencyMapping())
      );

      await foreman.prepareWithLLM('Test task', '/test');

      const callArgs = (mockTierRouter.call as any).mock.calls[0][0];
      expect(callArgs.userPrompt).toContain('fileDiscovery');
      expect(callArgs.userPrompt).toContain('patternExtraction');
      expect(callArgs.userPrompt).toContain('dependencyMapping');
      expect(callArgs.userPrompt).toContain('constraintIdentification');
    });

    it('returns validated ContextPackage on success', async () => {
      const foremanAny = foreman as any;

      foremanAny.llmWorkers.fileDiscovery.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockFileDiscovery())
      );
      foremanAny.llmWorkers.constraintIdentifier.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockConstraintIdentification())
      );
      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockPatternExtraction())
      );
      foremanAny.llmWorkers.dependencyMapper.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockDependencyMapping())
      );

      const result = await foreman.prepareWithLLM('Test task', '/test');

      expect(result.success).toBe(true);
      expect(result.package).toBeDefined();
      expect(result.package?.task.description).toBe('Test task');
    });

    it('returns error on invalid synthesis response', async () => {
      const foremanAny = foreman as any;

      foremanAny.llmWorkers.fileDiscovery.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockFileDiscovery())
      );
      foremanAny.llmWorkers.constraintIdentifier.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockConstraintIdentification())
      );
      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockPatternExtraction())
      );
      foremanAny.llmWorkers.dependencyMapper.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockDependencyMapping())
      );

      // Return invalid JSON
      (mockTierRouter.call as any).mockResolvedValue({
        content: 'not valid json',
        tier: 'sonnet',
        model: 'claude-sonnet-4',
        inputTokens: 100,
        outputTokens: 50,
        costUsd: 0.01,
        latencyMs: 1000,
      });

      const result = await foreman.prepareWithLLM('Test task', '/test');

      expect(result.success).toBe(false);
      expect(result.error).toContain('JSON');
    });

    it('includes total cost in metrics', async () => {
      const foremanAny = foreman as any;

      foremanAny.llmWorkers.fileDiscovery.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockFileDiscovery(), { costUsd: 0.001 })
      );
      foremanAny.llmWorkers.constraintIdentifier.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockConstraintIdentification(), { costUsd: 0.001 })
      );
      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockPatternExtraction(), { costUsd: 0.001 })
      );
      foremanAny.llmWorkers.dependencyMapper.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockDependencyMapping(), { costUsd: 0.001 })
      );

      const result = await foreman.prepareWithLLM('Test task', '/test');

      expect(result.metrics).toBeDefined();
      expect(result.metrics?.workerMetrics.totalCostUsd).toBeCloseTo(0.004, 5);
      expect(result.metrics?.synthesisMetrics?.costUsd).toBe(0.01);
      expect(result.metrics?.totalCostUsd).toBeCloseTo(0.014, 5);
    });
  });

  // ============================================================================
  // Wave 3 Optional Workers Tests
  // ============================================================================

  describe('Wave 3 Optional Workers', () => {
    beforeEach(() => {
      const foremanAny = foreman as any;

      foremanAny.llmWorkers.fileDiscovery.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockFileDiscovery())
      );
      foremanAny.llmWorkers.constraintIdentifier.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockConstraintIdentification())
      );
      foremanAny.llmWorkers.patternExtraction.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockPatternExtraction())
      );
      foremanAny.llmWorkers.dependencyMapper.execute = vi.fn().mockResolvedValue(
        createSuccessResult(createMockDependencyMapping())
      );
    });

    it('skips WebResearch when not requested', async () => {
      const foremanAny = foreman as any;
      const webResearchMock = vi.fn();
      foremanAny.llmWorkers.webResearch.execute = webResearchMock;

      await foreman.executeWaveBasedWorkers('Test task', '/test');

      expect(webResearchMock).not.toHaveBeenCalled();
    });

    it('runs WebResearch when requested', async () => {
      const foremanAny = foreman as any;
      foremanAny.llmWorkers.webResearch.execute = vi.fn().mockResolvedValue(
        createSuccessResult({
          findings: [{ topic: 'Test', content: 'Finding', relevance: 'high' as const, source: 'training' }],
          recommendations: [],
          unknowns: [],
        })
      );

      const result = await foreman.executeWaveBasedWorkers('Test task', '/test', {
        needsWebResearch: true,
      });

      expect(foremanAny.llmWorkers.webResearch.execute).toHaveBeenCalled();
      expect(result.results?.webResearch).toBeDefined();
    });

    it('skips DocumentationReader when no documentation provided', async () => {
      const foremanAny = foreman as any;
      const docReaderMock = vi.fn();
      foremanAny.llmWorkers.documentationReader.execute = docReaderMock;

      await foreman.executeWaveBasedWorkers('Test task', '/test');

      expect(docReaderMock).not.toHaveBeenCalled();
    });

    it('runs DocumentationReader when documentation provided', async () => {
      const foremanAny = foreman as any;
      foremanAny.llmWorkers.documentationReader.execute = vi.fn().mockResolvedValue(
        createSuccessResult({
          summary: 'API documentation',
          relevantSections: [],
          apiReferences: [],
          examples: [],
          warnings: [],
        })
      );

      const result = await foreman.executeWaveBasedWorkers('Test task', '/test', {
        documentation: '# API Docs\n\nSome documentation...',
      });

      expect(foremanAny.llmWorkers.documentationReader.execute).toHaveBeenCalled();
      expect(result.results?.documentationReading).toBeDefined();
    });
  });
});
