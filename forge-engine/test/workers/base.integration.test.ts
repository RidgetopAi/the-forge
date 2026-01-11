/**
 * Integration Tests for BaseWorker
 *
 * Phase 2.6: End-to-end testing with real API calls.
 *
 * These tests verify that:
 * - DummyFileWorker can explore using tools (glob, read)
 * - Multi-turn conversation works correctly
 * - submit_result pattern extracts structured output
 * - Zod validation passes on real responses
 * - Metrics are tracked correctly
 *
 * Uses forge-engine as the test project (known file structure).
 * Skips gracefully without API keys.
 *
 * Cost: ~$0.05-0.10 per run (Grok pricing, 2-3 turns)
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { z } from 'zod';
import {
  BaseWorker,
  WorkerInput,
  WorkerResult,
} from '../../src/workers/base.js';
import { TierRouter, validateApiKeys } from '../../src/tiers.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Test Output Schemas
// ============================================================================

// Schema for file discovery worker
const FileListSchema = z.object({
  files: z.array(z.string()),
  totalCount: z.number(),
});

type FileList = z.infer<typeof FileListSchema>;

// Schema for simple answer worker
const SimpleAnswerSchema = z.object({
  answer: z.string(),
});

type SimpleAnswer = z.infer<typeof SimpleAnswerSchema>;

// ============================================================================
// Test Workers
// ============================================================================

/**
 * Exploration-enabled worker for file discovery testing.
 * Uses glob/read tools to find files, then submits structured result.
 */
class DummyFileWorker extends BaseWorker<FileList> {
  protected canExplore = true;
  protected maxTurns = 8;

  constructor(router: TierRouter) {
    super(router, 'file_discovery', FileListSchema);
  }

  getSystemPrompt(): string {
    return `You are a file discovery worker.

Use the available tools to explore the codebase:
- glob(pattern): Find files matching a pattern (e.g., "**/*.ts", "src/*.json")
- read(path): Read file contents
- submit_result(result, confidence): Submit your findings

Your task is to find files matching the given pattern and report them.

CRITICAL: When done exploring, you MUST call submit_result with this exact format:
{
  "files": ["path/to/file1.ts", "path/to/file2.ts", ...],
  "totalCount": <number of files found>
}

Include the confidence value (0-100) based on how complete your search was.`;
  }

  buildUserPrompt(input: WorkerInput): string {
    return `${input.task}

Use glob() to search for files, then call submit_result with your findings.
Project root: ${input.projectRoot}`;
  }
}

/**
 * Non-exploration worker for simple single-turn testing.
 * Immediately returns a structured answer via submit_result.
 */
class SimpleAnswerWorker extends BaseWorker<SimpleAnswer> {
  constructor(router: TierRouter) {
    super(router, 'file_discovery', SimpleAnswerSchema);
  }

  getSystemPrompt(): string {
    return `You are a simple answer worker.

When asked a question, immediately call submit_result with your answer.

Format:
{
  "answer": "your answer here"
}

Include confidence (0-100) based on how certain you are.`;
  }

  buildUserPrompt(input: WorkerInput): string {
    return input.task;
  }
}

// ============================================================================
// Test Setup
// ============================================================================

// Skip if no API keys
const missingKeys = validateApiKeys();
const skipTests = missingKeys.length > 0;

if (skipTests) {
  console.log(
    `[Integration Tests] Skipping - missing API keys: ${missingKeys.join(', ')}`
  );
}

// ============================================================================
// Integration Tests
// ============================================================================

describe.skipIf(skipTests)('BaseWorker Integration', () => {
  let router: TierRouter;
  let testProjectRoot: string;

  beforeAll(() => {
    router = new TierRouter();
    // Use forge-engine as test project (known files)
    testProjectRoot = path.resolve(__dirname, '..', '..');
    console.log(`[Integration Tests] Project root: ${testProjectRoot}`);
  });

  describe('DummyFileWorker - Multi-Turn Exploration', () => {
    it(
      'executes multi-turn file discovery',
      { timeout: 120000 },
      async () => {
        const worker = new DummyFileWorker(router);

        const result = await worker.execute({
          task: 'Find all TypeScript files in the src directory. Use glob("src/**/*.ts") to search.',
          projectRoot: testProjectRoot,
        });

        console.log('Worker result:', JSON.stringify(result, null, 2));

        // Should succeed
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();

        // Should find .ts files
        expect(result.data!.files.length).toBeGreaterThan(0);
        expect(result.data!.files.some((f) => f.endsWith('.ts'))).toBe(true);

        // Should find known files
        const foundFiles = result.data!.files.map((f) => f.toLowerCase());
        expect(
          foundFiles.some((f) => f.includes('tiers') || f.includes('index'))
        ).toBe(true);

        // Should have valid count
        expect(result.data!.totalCount).toBe(result.data!.files.length);

        // Should have confidence
        expect(result.confidence).toBeGreaterThanOrEqual(0);
        expect(result.confidence).toBeLessThanOrEqual(100);

        // Metrics should be populated
        expect(result.metrics.turnCount).toBeGreaterThanOrEqual(1);
        expect(result.metrics.costUsd).toBeGreaterThan(0);
        expect(result.metrics.latencyMs).toBeGreaterThan(0);
        expect(result.metrics.tier).toBe('haiku');

        console.log(
          `Completed in ${result.metrics.turnCount} turns, $${result.metrics.costUsd.toFixed(4)}, ${result.metrics.toolCallCount} tool calls`
        );
      }
    );

    it(
      'finds specific file pattern',
      { timeout: 120000 },
      async () => {
        const worker = new DummyFileWorker(router);

        const result = await worker.execute({
          task: 'Find all JSON files in the project root. Use glob("*.json") to search.',
          projectRoot: testProjectRoot,
        });

        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();

        // Should find package.json at minimum
        const foundFiles = result.data!.files.map((f) => f.toLowerCase());
        expect(foundFiles.some((f) => f.includes('package.json'))).toBe(true);

        console.log(
          `Found ${result.data!.totalCount} JSON files in ${result.metrics.turnCount} turns`
        );
      }
    );
  });

  describe('SimpleAnswerWorker - Single Turn', () => {
    it(
      'handles single-turn tasks',
      { timeout: 60000 },
      async () => {
        const worker = new SimpleAnswerWorker(router);

        const result = await worker.execute({
          task: 'What is 2 + 2? Answer with just the number.',
          projectRoot: testProjectRoot,
        });

        expect(result.success).toBe(true);
        expect(result.data?.answer).toBeDefined();
        expect(result.data!.answer).toContain('4');
        expect(result.metrics.turnCount).toBe(1);
        expect(result.confidence).toBeGreaterThanOrEqual(50);

        console.log(
          `Answer: "${result.data!.answer}" (confidence: ${result.confidence})`
        );
      }
    );
  });

  describe('Error Handling', () => {
    it(
      'handles invalid glob patterns gracefully',
      { timeout: 120000 },
      async () => {
        const worker = new DummyFileWorker(router);

        // The worker should handle "no files found" gracefully
        const result = await worker.execute({
          task: 'Find all files matching "nonexistent_pattern_xyz_123/**/*.fake"',
          projectRoot: testProjectRoot,
        });

        // Should still succeed - worker should report empty results
        expect(result.success).toBe(true);
        expect(result.data).toBeDefined();
        expect(result.data!.files.length).toBe(0);
        expect(result.data!.totalCount).toBe(0);
      }
    );
  });

  describe('Metrics Accuracy', () => {
    it(
      'tracks tokens and cost correctly',
      { timeout: 120000 },
      async () => {
        const worker = new SimpleAnswerWorker(router);

        const result = await worker.execute({
          task: 'Say "hello"',
          projectRoot: testProjectRoot,
        });

        expect(result.success).toBe(true);

        // Tokens should be reasonable for a simple task
        expect(result.metrics.inputTokens).toBeGreaterThan(0);
        expect(result.metrics.inputTokens).toBeLessThan(5000); // Sanity check
        expect(result.metrics.outputTokens).toBeGreaterThan(0);
        expect(result.metrics.outputTokens).toBeLessThan(1000); // Simple response

        // Cost should be minimal for single turn with Grok
        expect(result.metrics.costUsd).toBeGreaterThan(0);
        expect(result.metrics.costUsd).toBeLessThan(0.01); // Should be < $0.01

        console.log(
          `Tokens: ${result.metrics.inputTokens} in, ${result.metrics.outputTokens} out, $${result.metrics.costUsd.toFixed(6)}`
        );
      }
    );
  });
});

// ============================================================================
// Standalone Execution (for manual testing)
// ============================================================================

// Allow running directly with: npx tsx test/workers/base.integration.test.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log('Running integration tests directly...');

  const missing = validateApiKeys();
  if (missing.length > 0) {
    console.error(`Missing API keys: ${missing.join(', ')}`);
    process.exit(1);
  }

  const router = new TierRouter();
  const projectRoot = path.resolve(__dirname, '..', '..');

  console.log(`Project root: ${projectRoot}`);

  const worker = new DummyFileWorker(router);

  worker
    .execute({
      task: 'Find all TypeScript files in src/. Use glob("src/**/*.ts").',
      projectRoot,
    })
    .then((result) => {
      console.log('\n=== Result ===');
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      console.error('Error:', err);
      process.exit(1);
    });
}
