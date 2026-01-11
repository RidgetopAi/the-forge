/**
 * Unit Tests for Phase 3 Worker Implementations
 *
 * Tests for:
 * - FileDiscoveryWorker
 * - PatternExtractionWorker
 * - DependencyMapperWorker
 * - ConstraintIdentifierWorker
 * - WebResearchWorker
 * - DocumentationReaderWorker
 *
 * Test Categories per worker:
 * 1. Construction and configuration (canExplore flag)
 * 2. System prompt generation
 * 3. User prompt building
 * 4. Schema validation (valid and invalid)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TierRouter, TierCallResult } from '../../src/tiers.js';
import {
  FileDiscoveryWorker,
  FileDiscoveryOutputSchema,
  PatternExtractionWorker,
  PatternExtractionOutputSchema,
  DependencyMapperWorker,
  DependencyMappingOutputSchema,
  ConstraintIdentifierWorker,
  ConstraintIdentificationOutputSchema,
  WebResearchWorker,
  WebResearchOutputSchema,
  DocumentationReaderWorker,
  DocumentationReadingOutputSchema,
} from '../../src/workers/index.js';

// ============================================================================
// Test Fixtures
// ============================================================================

function createMockRouter(): TierRouter {
  return new TierRouter();
}

function createMockResult(overrides: Partial<TierCallResult> = {}): TierCallResult {
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
// FileDiscoveryWorker Tests
// ============================================================================

describe('FileDiscoveryWorker', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Construction', () => {
    it('creates worker with canExplore = true', () => {
      const worker = new FileDiscoveryWorker(router);
      expect((worker as any).canExplore).toBe(true);
    });

    it('has maxTurns set to 10', () => {
      const worker = new FileDiscoveryWorker(router);
      expect((worker as any).maxTurns).toBe(10);
    });
  });

  describe('System Prompt', () => {
    it('includes instructions for glob, read, grep tools', () => {
      const worker = new FileDiscoveryWorker(router);
      const prompt = worker.getSystemPrompt();

      expect(prompt).toContain('glob');
      expect(prompt).toContain('read');
      expect(prompt).toContain('grep');
    });

    it('explains priority levels', () => {
      const worker = new FileDiscoveryWorker(router);
      const prompt = worker.getSystemPrompt();

      expect(prompt).toContain('must_read');
      expect(prompt).toContain('should_read');
      expect(prompt).toContain('may_read');
    });

    it('mentions submit_result for output', () => {
      const worker = new FileDiscoveryWorker(router);
      const prompt = worker.getSystemPrompt();

      expect(prompt).toContain('submit_result');
    });
  });

  describe('User Prompt', () => {
    it('includes task description', () => {
      const worker = new FileDiscoveryWorker(router);
      const prompt = worker.buildUserPrompt({
        task: 'Find authentication files',
        projectRoot: process.cwd(),
      });

      expect(prompt).toContain('Find authentication files');
    });

    it('includes additionalContext.projectContext if provided', () => {
      const worker = new FileDiscoveryWorker(router);
      const prompt = worker.buildUserPrompt({
        task: 'Find files',
        projectRoot: process.cwd(),
        additionalContext: {
          projectContext: 'This is a React app',
        },
      });

      expect(prompt).toContain('This is a React app');
    });
  });

  describe('Schema Validation', () => {
    it('validates correct output', () => {
      const validOutput = {
        relevantFiles: [
          { path: 'src/auth.ts', reason: 'Authentication logic', priority: 'must_read' as const },
        ],
        suggestedNewFiles: [
          { path: 'src/auth.test.ts', purpose: 'Tests for auth' },
        ],
        confidence: 85,
      };

      const result = FileDiscoveryOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('rejects invalid priority', () => {
      const invalidOutput = {
        relevantFiles: [
          { path: 'src/auth.ts', reason: 'Auth', priority: 'invalid' },
        ],
        suggestedNewFiles: [],
        confidence: 85,
      };

      const result = FileDiscoveryOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });

    it('rejects confidence out of range', () => {
      const invalidOutput = {
        relevantFiles: [],
        suggestedNewFiles: [],
        confidence: 150, // > 100
      };

      const result = FileDiscoveryOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });
  });

  describe('Execution', () => {
    it('returns valid FileDiscoveryOutput', async () => {
      const worker = new FileDiscoveryWorker(router);

      vi.spyOn(router, 'call').mockResolvedValue(
        createMockResult({
          toolCalls: [
            {
              id: 'call_1',
              name: 'submit_result',
              input: {
                result: {
                  relevantFiles: [
                    { path: 'src/index.ts', reason: 'Entry point', priority: 'must_read' },
                  ],
                  suggestedNewFiles: [],
                  confidence: 90,
                },
                confidence: 90,
              },
            },
          ],
        })
      );

      const result = await worker.execute({ task: 'find files', projectRoot: process.cwd() });

      expect(result.success).toBe(true);
      expect(result.data?.relevantFiles).toHaveLength(1);
      expect(result.data?.relevantFiles[0].priority).toBe('must_read');
    });
  });
});

// ============================================================================
// PatternExtractionWorker Tests
// ============================================================================

describe('PatternExtractionWorker', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Construction', () => {
    it('creates worker with canExplore = true', () => {
      const worker = new PatternExtractionWorker(router);
      expect((worker as any).canExplore).toBe(true);
    });
  });

  describe('System Prompt', () => {
    it('explains what patterns to look for', () => {
      const worker = new PatternExtractionWorker(router);
      const prompt = worker.getSystemPrompt();

      expect(prompt).toContain('pattern');
      expect(prompt).toContain('convention');
    });

    it('mentions anti-patterns', () => {
      const worker = new PatternExtractionWorker(router);
      const prompt = worker.getSystemPrompt();

      expect(prompt).toContain('anti-pattern');
    });
  });

  describe('User Prompt', () => {
    it('includes file list if provided', () => {
      const worker = new PatternExtractionWorker(router);
      const prompt = worker.buildUserPrompt({
        task: 'Extract patterns',
        projectRoot: process.cwd(),
        additionalContext: {
          fileList: 'src/index.ts\nsrc/utils.ts',
        },
      });

      expect(prompt).toContain('src/index.ts');
      expect(prompt).toContain('src/utils.ts');
    });
  });

  describe('Schema Validation', () => {
    it('validates correct output', () => {
      const validOutput = {
        patterns: [
          {
            name: 'Repository Pattern',
            description: 'Data access abstraction',
            examples: ['src/repos/user.ts'],
            applicability: 'All data access',
          },
        ],
        conventions: {
          naming: 'camelCase',
          fileOrganization: 'Feature folders',
        },
        antiPatterns: [],
        confidence: 75,
      };

      const result = PatternExtractionOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('allows optional convention fields', () => {
      const validOutput = {
        patterns: [],
        conventions: {},
        antiPatterns: [],
        confidence: 50,
      };

      const result = PatternExtractionOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// DependencyMapperWorker Tests
// ============================================================================

describe('DependencyMapperWorker', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Construction', () => {
    it('creates worker with canExplore = true', () => {
      const worker = new DependencyMapperWorker(router);
      expect((worker as any).canExplore).toBe(true);
    });
  });

  describe('System Prompt', () => {
    it('explains dependency types', () => {
      const worker = new DependencyMapperWorker(router);
      const prompt = worker.getSystemPrompt();

      expect(prompt).toContain('import');
      expect(prompt).toContain('type');
      expect(prompt).toContain('runtime');
    });

    it('mentions circular dependencies', () => {
      const worker = new DependencyMapperWorker(router);
      const prompt = worker.getSystemPrompt();

      expect(prompt).toContain('circular');
    });
  });

  describe('Schema Validation', () => {
    it('validates correct output', () => {
      const validOutput = {
        dependencies: [
          {
            from: 'src/a.ts',
            to: 'src/b.ts',
            type: 'import' as const,
            imports: ['foo', 'bar'],
          },
        ],
        externalDependencies: [
          { name: 'express', usedBy: ['src/server.ts'], isDev: false },
        ],
        entryPoints: [
          { path: 'src/index.ts', type: 'main', description: 'Main entry' },
        ],
        circularDependencies: [],
        confidence: 80,
      };

      const result = DependencyMappingOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('rejects invalid dependency type', () => {
      const invalidOutput = {
        dependencies: [
          { from: 'a.ts', to: 'b.ts', type: 'invalid' },
        ],
        externalDependencies: [],
        entryPoints: [],
        circularDependencies: [],
        confidence: 80,
      };

      const result = DependencyMappingOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// ConstraintIdentifierWorker Tests
// ============================================================================

describe('ConstraintIdentifierWorker', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Construction', () => {
    it('creates worker with canExplore = true', () => {
      const worker = new ConstraintIdentifierWorker(router);
      expect((worker as any).canExplore).toBe(true);
    });

    it('has maxTurns set to 8', () => {
      const worker = new ConstraintIdentifierWorker(router);
      expect((worker as any).maxTurns).toBe(8);
    });
  });

  describe('System Prompt', () => {
    it('lists config files to check', () => {
      const worker = new ConstraintIdentifierWorker(router);
      const prompt = worker.getSystemPrompt();

      expect(prompt).toContain('tsconfig');
      expect(prompt).toContain('eslint');
      expect(prompt).toContain('jest');
    });

    it('explains enforcement types', () => {
      const worker = new ConstraintIdentifierWorker(router);
      const prompt = worker.getSystemPrompt();

      expect(prompt).toContain('compile_time');
      expect(prompt).toContain('runtime');
      expect(prompt).toContain('lint');
    });
  });

  describe('Schema Validation', () => {
    it('validates correct output', () => {
      const validOutput = {
        typeConstraints: [
          {
            name: 'strict mode',
            description: 'All strict options',
            source: 'tsconfig.json',
            enforcement: 'compile_time' as const,
            severity: 'error' as const,
          },
        ],
        testConstraints: [],
        lintConstraints: [],
        buildConstraints: [],
        apiConstraints: [],
        confidence: 90,
      };

      const result = ConstraintIdentificationOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('rejects invalid enforcement', () => {
      const invalidOutput = {
        typeConstraints: [
          {
            name: 'test',
            description: 'test',
            source: 'tsconfig.json',
            enforcement: 'invalid',
            severity: 'error',
          },
        ],
        testConstraints: [],
        lintConstraints: [],
        buildConstraints: [],
        apiConstraints: [],
        confidence: 90,
      };

      const result = ConstraintIdentificationOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });
  });
});

// ============================================================================
// WebResearchWorker Tests
// ============================================================================

describe('WebResearchWorker', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Construction', () => {
    it('creates worker with canExplore = false', () => {
      const worker = new WebResearchWorker(router);
      expect((worker as any).canExplore).toBe(false);
    });
  });

  describe('System Prompt', () => {
    it('clarifies no actual web access', () => {
      const worker = new WebResearchWorker(router);
      const prompt = worker.getSystemPrompt();

      expect(prompt).toContain('NOT have actual web access');
    });

    it('explains relevance levels', () => {
      const worker = new WebResearchWorker(router);
      const prompt = worker.getSystemPrompt();

      expect(prompt).toContain('high');
      expect(prompt).toContain('medium');
      expect(prompt).toContain('low');
    });
  });

  describe('User Prompt', () => {
    it('includes research queries if provided', () => {
      const worker = new WebResearchWorker(router);
      const prompt = worker.buildUserPrompt({
        task: 'Research JWT',
        projectRoot: '/project',
        additionalContext: {
          researchQueries: 'How to implement JWT refresh?',
        },
      });

      expect(prompt).toContain('How to implement JWT refresh?');
    });
  });

  describe('Schema Validation', () => {
    it('validates correct output', () => {
      const validOutput = {
        findings: [
          {
            topic: 'JWT Best Practices',
            content: 'Use httpOnly cookies',
            relevance: 'high' as const,
            caveats: 'Verify with OWASP',
          },
        ],
        recommendations: [
          {
            recommendation: 'Use refresh tokens',
            rationale: 'Better security',
          },
        ],
        unknowns: [],
        confidence: 70,
      };

      const result = WebResearchOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('rejects invalid relevance', () => {
      const invalidOutput = {
        findings: [
          { topic: 'Test', content: 'Test', relevance: 'invalid' },
        ],
        recommendations: [],
        unknowns: [],
        confidence: 70,
      };

      const result = WebResearchOutputSchema.safeParse(invalidOutput);
      expect(result.success).toBe(false);
    });
  });

  describe('Execution', () => {
    it('forces submit_result on single turn', async () => {
      const worker = new WebResearchWorker(router);

      const callSpy = vi.spyOn(router, 'call').mockResolvedValue(
        createMockResult({
          toolCalls: [
            {
              id: 'call_1',
              name: 'submit_result',
              input: {
                result: {
                  findings: [],
                  recommendations: [],
                  unknowns: [],
                  confidence: 50,
                },
                confidence: 50,
              },
            },
          ],
        })
      );

      await worker.execute({ task: 'research', projectRoot: '/project' });

      expect(callSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolChoice: { type: 'tool', name: 'submit_result' },
        })
      );
    });
  });
});

// ============================================================================
// DocumentationReaderWorker Tests
// ============================================================================

describe('DocumentationReaderWorker', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Construction', () => {
    it('creates worker with canExplore = false', () => {
      const worker = new DocumentationReaderWorker(router);
      expect((worker as any).canExplore).toBe(false);
    });
  });

  describe('System Prompt', () => {
    it('explains what to extract from docs', () => {
      const worker = new DocumentationReaderWorker(router);
      const prompt = worker.getSystemPrompt();

      expect(prompt).toContain('API');
      expect(prompt).toContain('example');
      expect(prompt).toContain('warning');
    });
  });

  describe('User Prompt', () => {
    it('includes documentation from additionalContext', () => {
      const worker = new DocumentationReaderWorker(router);
      const prompt = worker.buildUserPrompt({
        task: 'Extract API info',
        projectRoot: '/project',
        additionalContext: {
          documentation: '# API Documentation\n\nThis is the docs.',
        },
      });

      expect(prompt).toContain('# API Documentation');
    });

    it('falls back to context if documentation not provided', () => {
      const worker = new DocumentationReaderWorker(router);
      const prompt = worker.buildUserPrompt({
        task: 'Extract API info',
        projectRoot: '/project',
        context: 'Fallback documentation content',
      });

      expect(prompt).toContain('Fallback documentation content');
    });

    it('notes when no documentation provided', () => {
      const worker = new DocumentationReaderWorker(router);
      const prompt = worker.buildUserPrompt({
        task: 'Extract API info',
        projectRoot: '/project',
      });

      expect(prompt).toContain('No documentation provided');
    });
  });

  describe('Schema Validation', () => {
    it('validates correct output', () => {
      const validOutput = {
        summary: 'API documentation for auth module',
        relevantSections: [
          {
            title: 'Authentication',
            keyPoints: ['Uses JWT', 'Refresh tokens'],
            relevance: 'Covers main auth flow',
          },
        ],
        apiReferences: [
          {
            name: 'useAuth',
            type: 'hook',
            signature: 'useAuth(): AuthContext',
            description: 'Access auth state',
          },
        ],
        examples: [
          {
            description: 'Basic usage',
            code: 'const { user } = useAuth();',
            language: 'typescript',
          },
        ],
        warnings: [],
        confidence: 85,
      };

      const result = DocumentationReadingOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });

    it('validates with optional fields missing', () => {
      const validOutput = {
        summary: 'Basic docs',
        relevantSections: [],
        apiReferences: [
          {
            name: 'foo',
            type: 'function',
            description: 'Does foo',
          },
        ],
        examples: [],
        warnings: [],
        confidence: 60,
      };

      const result = DocumentationReadingOutputSchema.safeParse(validOutput);
      expect(result.success).toBe(true);
    });
  });
});

// ============================================================================
// Cross-Worker Tests
// ============================================================================

describe('All Workers', () => {
  let router: TierRouter;

  beforeEach(() => {
    router = createMockRouter();
  });

  describe('Exploration vs Non-Exploration', () => {
    it('exploration workers have canExplore = true', () => {
      const explorationWorkers = [
        new FileDiscoveryWorker(router),
        new PatternExtractionWorker(router),
        new DependencyMapperWorker(router),
        new ConstraintIdentifierWorker(router),
      ];

      for (const worker of explorationWorkers) {
        expect((worker as any).canExplore).toBe(true);
      }
    });

    it('non-exploration workers have canExplore = false', () => {
      const nonExplorationWorkers = [
        new WebResearchWorker(router),
        new DocumentationReaderWorker(router),
      ];

      for (const worker of nonExplorationWorkers) {
        expect((worker as any).canExplore).toBe(false);
      }
    });
  });

  describe('System Prompts', () => {
    it('all workers have non-empty system prompts', () => {
      const allWorkers = [
        new FileDiscoveryWorker(router),
        new PatternExtractionWorker(router),
        new DependencyMapperWorker(router),
        new ConstraintIdentifierWorker(router),
        new WebResearchWorker(router),
        new DocumentationReaderWorker(router),
      ];

      for (const worker of allWorkers) {
        const prompt = worker.getSystemPrompt();
        expect(prompt.length).toBeGreaterThan(100);
      }
    });

    it('all workers mention submit_result in system prompt', () => {
      const allWorkers = [
        new FileDiscoveryWorker(router),
        new PatternExtractionWorker(router),
        new DependencyMapperWorker(router),
        new ConstraintIdentifierWorker(router),
        new WebResearchWorker(router),
        new DocumentationReaderWorker(router),
      ];

      for (const worker of allWorkers) {
        const prompt = worker.getSystemPrompt();
        expect(prompt).toContain('submit_result');
      }
    });
  });
});
