/**
 * Integration Tests for Tier System
 *
 * Task 1.6: Live API calls to verify each tier works.
 *
 * These tests:
 * - Require real API keys (ANTHROPIC_API_KEY, XAI_API_KEY)
 * - Make actual API calls (costs ~$0.10 per run)
 * - Use 60s timeout for API latency
 * - Run sequentially to track cost distribution
 *
 * Run with: npm run test:integration
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  TierRouter,
  SUBMIT_RESULT_TOOL,
  extractSubmitResult,
  validateApiKeys,
} from '../src/tiers.js';

// Skip tests if API keys not configured
const missingKeys = validateApiKeys();
const skipTests = missingKeys.length > 0;

describe.skipIf(skipTests)('TierRouter Integration', () => {
  let router: TierRouter;

  beforeAll(() => {
    if (skipTests) {
      console.log(`Skipping integration tests - missing keys: ${missingKeys.join(', ')}`);
      return;
    }
    router = new TierRouter();
  });

  describe('Opus Tier (Judgment)', () => {
    it('calls Opus successfully with classify_task', { timeout: 60000 }, async () => {
      const result = await router.call({
        operation: 'classify_task',
        systemPrompt: `You are a task classifier. Classify the given task into one of: feature, bugfix, refactor, docs, test, config.

Use the submit_result tool to return your classification in this format:
{
  "classification": "feature" | "bugfix" | "refactor" | "docs" | "test" | "config",
  "reasoning": "Brief explanation"
}`,
        userPrompt: 'Add dark mode support to the application',
        tools: [SUBMIT_RESULT_TOOL],
        toolChoice: { type: 'tool', name: 'submit_result' },
        maxTokens: 500,
      });

      // Verify tier routing
      expect(result.tier).toBe('opus');
      expect(result.model).toBe('claude-opus-4-5-20251101');

      // Verify tool call
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls!.length).toBeGreaterThan(0);
      expect(result.toolCalls![0].name).toBe('submit_result');

      // Verify extractable result
      const extracted = extractSubmitResult<{
        classification: string;
        reasoning: string;
      }>(result.toolCalls!);
      expect(extracted).not.toBeNull();
      expect(extracted!.result.classification).toBeDefined();
      expect(extracted!.confidence).toBeGreaterThanOrEqual(0);
      expect(extracted!.confidence).toBeLessThanOrEqual(100);

      // Verify cost tracking
      expect(result.costUsd).toBeGreaterThan(0);
      expect(result.inputTokens).toBeGreaterThan(0);
      expect(result.outputTokens).toBeGreaterThan(0);
      expect(result.latencyMs).toBeGreaterThan(0);

      console.log(`  Opus call: ${result.inputTokens}in/${result.outputTokens}out, $${result.costUsd.toFixed(6)}, ${result.latencyMs}ms`);
    });
  });

  describe('Sonnet Tier (Supervision)', () => {
    it('calls Sonnet successfully with foreman_synthesis', { timeout: 60000 }, async () => {
      const workerOutputs = JSON.stringify({
        fileDiscovery: {
          files: ['src/theme.ts', 'src/components/ThemeProvider.tsx'],
          confidence: 85,
        },
        patternExtraction: {
          patterns: ['CSS-in-JS with styled-components', 'Context API for global state'],
          confidence: 90,
        },
      });

      const result = await router.call({
        operation: 'foreman_synthesis',
        systemPrompt: `You are a Foreman synthesizing worker outputs into an execution plan.

Analyze the worker findings and produce a synthesis with:
1. Key insights from each worker
2. Dependencies and relationships discovered
3. Recommended approach

Return as JSON.`,
        userPrompt: `Synthesize these worker outputs for "Add dark mode support":\n\n${workerOutputs}`,
        maxTokens: 1000,
      });

      // Verify tier routing
      expect(result.tier).toBe('sonnet');
      expect(result.model).toBe('claude-sonnet-4-20250514');

      // Verify response
      expect(result.content.length).toBeGreaterThan(0);

      // Verify cost tracking
      expect(result.costUsd).toBeGreaterThan(0);
      expect(result.inputTokens).toBeGreaterThan(0);

      console.log(`  Sonnet call: ${result.inputTokens}in/${result.outputTokens}out, $${result.costUsd.toFixed(6)}, ${result.latencyMs}ms`);
    });
  });

  describe('Haiku Tier (Labor) - Uses Grok', () => {
    it('calls Grok successfully with file_discovery', { timeout: 60000 }, async () => {
      const result = await router.call({
        operation: 'file_discovery',
        systemPrompt: `You are a file discovery worker. Given a task description, identify which files would likely be relevant.

Use the submit_result tool to return your findings in this format:
{
  "relevantFiles": ["path/to/file1.ts", "path/to/file2.tsx"],
  "reasoning": "Brief explanation of why each file matters"
}`,
        userPrompt: `Task: Add dark mode support
Project type: React TypeScript application
Key directories: src/components, src/styles, src/hooks

What files would likely need modification?`,
        tools: [SUBMIT_RESULT_TOOL],
        toolChoice: { type: 'tool', name: 'submit_result' },
        maxTokens: 500,
      });

      // Verify tier routing (tier name is 'haiku' but model is Grok)
      expect(result.tier).toBe('haiku');
      expect(result.model).toBe('grok-4-1-fast-reasoning');

      // Verify tool call
      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls!.length).toBeGreaterThan(0);
      expect(result.toolCalls![0].name).toBe('submit_result');

      // Verify extractable result
      const extracted = extractSubmitResult<{
        relevantFiles: string[];
        reasoning: string;
      }>(result.toolCalls!);
      expect(extracted).not.toBeNull();
      expect(extracted!.result.relevantFiles).toBeDefined();

      // Verify cost tracking
      expect(result.costUsd).toBeGreaterThan(0);

      console.log(`  Grok call: ${result.inputTokens}in/${result.outputTokens}out, $${result.costUsd.toFixed(6)}, ${result.latencyMs}ms`);
    });
  });

  describe('Cost Distribution', () => {
    it('tracks costs across all tiers correctly', async () => {
      // This test runs after the tier tests, so costs should be accumulated
      const dist = router.getCostDistribution();

      console.log('\n  Cost Distribution:');
      console.log(`    Opus:   $${dist.opus.absolute.toFixed(6)} (${(dist.opus.percentage * 100).toFixed(1)}%)`);
      console.log(`    Sonnet: $${dist.sonnet.absolute.toFixed(6)} (${(dist.sonnet.percentage * 100).toFixed(1)}%)`);
      console.log(`    Haiku:  $${dist.haiku.absolute.toFixed(6)} (${(dist.haiku.percentage * 100).toFixed(1)}%)`);
      console.log(`    Total:  $${router.getTotalCost().toFixed(6)}`);

      // Verify all tiers have recorded costs
      expect(dist.opus.absolute).toBeGreaterThan(0);
      expect(dist.sonnet.absolute).toBeGreaterThan(0);
      expect(dist.haiku.absolute).toBeGreaterThan(0);

      // Verify percentages sum to 1
      const totalPercentage =
        dist.opus.percentage + dist.sonnet.percentage + dist.haiku.percentage;
      expect(totalPercentage).toBeCloseTo(1.0, 5);

      // Verify total cost
      const totalCost = router.getTotalCost();
      expect(totalCost).toBeGreaterThan(0);
      expect(totalCost).toEqual(
        dist.opus.absolute + dist.sonnet.absolute + dist.haiku.absolute
      );
    });

    it('opus should be most expensive per call', async () => {
      const dist = router.getCostDistribution();

      // Opus has highest pricing, so even with similar token counts,
      // it should be the most expensive
      expect(dist.opus.absolute).toBeGreaterThan(dist.sonnet.absolute);
      expect(dist.sonnet.absolute).toBeGreaterThan(dist.haiku.absolute);
    });
  });
});

// Informational test that runs even without keys
describe('API Key Validation', () => {
  it('reports missing keys correctly', () => {
    const missing = validateApiKeys();

    if (missing.length > 0) {
      console.log(`\n  Missing API keys: ${missing.join(', ')}`);
      console.log('  Integration tests will be skipped.');
    } else {
      console.log('\n  All API keys present. Integration tests will run.');
    }

    // This test just documents status, always passes
    expect(true).toBe(true);
  });
});
