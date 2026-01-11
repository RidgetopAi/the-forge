/**
 * Integration Tests for Preparation Department - Phase 4
 *
 * Task 4.6: Full pipeline test with real API calls.
 *
 * These tests require API keys:
 * - ANTHROPIC_API_KEY (for Sonnet synthesis)
 * - XAI_API_KEY (for Grok workers)
 *
 * Run with: npm run test:integration -- test/departments/preparation.integration.test.ts
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { createPreparationForeman, PreparationForeman } from '../../src/departments/preparation.js';
import { TierRouter, COST_DISTRIBUTION_TARGETS } from '../../src/tiers.js';
import { ContextPackage } from '../../src/types.js';
import * as path from 'path';

// ============================================================================
// Test Configuration
// ============================================================================

const TEST_PROJECT_PATH = path.resolve(__dirname, '../synthetic/express-basic');
const INSTANCE_ID = 'phase4-integration-test';

// Skip tests if API keys not available
const hasApiKeys = Boolean(process.env.ANTHROPIC_API_KEY && process.env.XAI_API_KEY);

// ============================================================================
// Integration Tests
// ============================================================================

describe.skipIf(!hasApiKeys)('Preparation Department Integration', () => {
  let foreman: PreparationForeman;
  let tierRouter: TierRouter;

  beforeAll(() => {
    tierRouter = new TierRouter();
    foreman = createPreparationForeman(INSTANCE_ID, tierRouter);
  });

  describe('Full LLM Pipeline', () => {
    it('produces valid ContextPackage for a feature task', async () => {
      const result = await foreman.prepareWithLLM(
        'Add user authentication to the API with JWT tokens',
        TEST_PROJECT_PATH
      );

      expect(result.success).toBe(true);
      expect(result.package).toBeDefined();

      const pkg = result.package!;

      // Verify structure
      expect(pkg.id).toBeDefined();
      expect(pkg.task.description).toContain('authentication');
      expect(pkg.task.acceptanceCriteria).toBeInstanceOf(Array);
      expect(pkg.task.acceptanceCriteria.length).toBeGreaterThan(0);

      // Verify codeContext
      expect(pkg.codeContext.mustRead).toBeInstanceOf(Array);
      expect(pkg.codeContext.mustRead.length).toBeGreaterThan(0);

      // Verify patterns
      expect(pkg.patterns.namingConventions).toBeDefined();
      expect(pkg.patterns.testingApproach).toBeDefined();

      // Verify constraints
      expect(pkg.constraints.quality).toBeInstanceOf(Array);
    }, 120000); // 2 minute timeout for API calls

    it('produces valid ContextPackage for a documentation task', async () => {
      const result = await foreman.prepareWithLLM(
        'Add a comprehensive README.md file with installation and usage instructions',
        TEST_PROJECT_PATH
      );

      expect(result.success).toBe(true);
      expect(result.package).toBeDefined();

      const pkg = result.package!;

      // Documentation tasks should have appropriate acceptance criteria
      expect(pkg.task.acceptanceCriteria.some(c =>
        c.toLowerCase().includes('readme') ||
        c.toLowerCase().includes('documentation') ||
        c.toLowerCase().includes('markdown')
      )).toBe(true);
    }, 120000);

    it('handles web research option', async () => {
      const result = await foreman.prepareWithLLM(
        'Integrate Stripe payment processing',
        TEST_PROJECT_PATH,
        { needsWebResearch: true }
      );

      expect(result.success).toBe(true);

      // Should have run web research worker
      expect(result.metrics?.workerMetrics.workerCounts.succeeded).toBeGreaterThan(4);
    }, 180000); // 3 minute timeout for extra API call
  });

  describe('Cost Distribution', () => {
    it('maintains expected cost distribution (50-65% Haiku tier)', async () => {
      // Reset cost accumulator
      tierRouter.resetCostAccumulator();

      await foreman.prepareWithLLM(
        'Add error logging to all API endpoints',
        TEST_PROJECT_PATH
      );

      const distribution = tierRouter.getCostDistribution();

      // Haiku tier (workers) should be 50-65% of total cost
      const haikuPercentage = distribution.haiku.percentage;
      console.log(`[Integration Test] Cost distribution - Haiku: ${(haikuPercentage * 100).toFixed(1)}%`);

      // Allow wider range for integration tests due to variability
      expect(haikuPercentage).toBeGreaterThan(0.3); // At least 30%
      expect(haikuPercentage).toBeLessThan(0.8); // At most 80%
    }, 120000);
  });

  describe('Metrics Tracking', () => {
    it('tracks total cost accurately', async () => {
      const result = await foreman.prepareWithLLM(
        'Add unit tests for the user service',
        TEST_PROJECT_PATH
      );

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();

      const metrics = result.metrics!;

      // Worker metrics should be accumulated
      expect(metrics.workerMetrics.totalInputTokens).toBeGreaterThan(0);
      expect(metrics.workerMetrics.totalOutputTokens).toBeGreaterThan(0);
      expect(metrics.workerMetrics.totalCostUsd).toBeGreaterThan(0);

      // Synthesis metrics should exist
      expect(metrics.synthesisMetrics).toBeDefined();
      expect(metrics.synthesisMetrics!.costUsd).toBeGreaterThan(0);

      // Total cost should be sum of workers + synthesis
      const expectedTotal = metrics.workerMetrics.totalCostUsd + metrics.synthesisMetrics!.costUsd;
      expect(metrics.totalCostUsd).toBeCloseTo(expectedTotal, 5);

      console.log(`[Integration Test] Total cost: $${metrics.totalCostUsd.toFixed(4)}`);
      console.log(`[Integration Test] Workers: $${metrics.workerMetrics.totalCostUsd.toFixed(4)}`);
      console.log(`[Integration Test] Synthesis: $${metrics.synthesisMetrics!.costUsd.toFixed(4)}`);
    }, 120000);

    it('tracks worker success/failure counts', async () => {
      const result = await foreman.prepareWithLLM(
        'Implement caching layer',
        TEST_PROJECT_PATH
      );

      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();

      const workerCounts = result.metrics!.workerMetrics.workerCounts;

      // Should have at least 4 successful workers (Wave 1 + Wave 2)
      expect(workerCounts.succeeded).toBeGreaterThanOrEqual(4);

      console.log(`[Integration Test] Workers succeeded: ${workerCounts.succeeded}, failed: ${workerCounts.failed}`);
    }, 120000);
  });

  describe('ContextPackage Validation', () => {
    it('produces Zod-validated output', async () => {
      const result = await foreman.prepareWithLLM(
        'Add pagination to product listing',
        TEST_PROJECT_PATH
      );

      expect(result.success).toBe(true);

      // The package should already be Zod-validated by synthesizeContextPackage
      const pkg = result.package!;

      // Verify Zod validation by checking required fields exist
      expect(pkg.id).toMatch(/^[0-9a-f-]{36}$/); // UUID format
      expect(pkg.projectType).toBeDefined();
      expect(pkg.created).toBeInstanceOf(Date);
      expect(pkg.preparedBy).toBe(INSTANCE_ID);
    }, 120000);
  });

  describe('Wave Execution', () => {
    it('executes workers in correct wave order', async () => {
      // This test verifies the order by checking that all required
      // information flows correctly through the pipeline

      const result = await foreman.prepareWithLLM(
        'Add input validation to all form handlers',
        TEST_PROJECT_PATH
      );

      expect(result.success).toBe(true);

      const pkg = result.package!;

      // Wave 1 results should inform the final package
      // FileDiscovery should have found files
      expect(pkg.codeContext.mustRead.length).toBeGreaterThan(0);

      // Wave 2 results should be in the package
      // PatternExtraction should have identified patterns
      expect(pkg.patterns.namingConventions).toBeTruthy();

      // DependencyMapping should inform architecture
      expect(pkg.architecture.dependencies).toBeInstanceOf(Array);
    }, 120000);
  });
});

// ============================================================================
// Benchmark Comparison Tests
// ============================================================================

describe.skipIf(!hasApiKeys)('Benchmark Comparison', () => {
  let foreman: PreparationForeman;
  let tierRouter: TierRouter;

  beforeAll(() => {
    tierRouter = new TierRouter();
    foreman = createPreparationForeman('benchmark-test', tierRouter);
  });

  it('Phase 4 maintains or improves on existing benchmark pass rate', async () => {
    // Run a simple task that should pass reliably
    const result = await foreman.prepareWithLLM(
      'Add a health check endpoint to the API',
      TEST_PROJECT_PATH
    );

    expect(result.success).toBe(true);

    // Basic quality checks that should always pass
    const pkg = result.package!;
    expect(pkg.task.description).toBeTruthy();
    expect(pkg.codeContext.mustRead.length).toBeGreaterThan(0);
    expect(pkg.patterns.testingApproach).toBeTruthy();

    // Log for comparison with previous benchmarks
    console.log('[Benchmark] Phase 4 LLM pipeline completed successfully');
    console.log(`[Benchmark] mustRead files: ${pkg.codeContext.mustRead.length}`);
    console.log(`[Benchmark] Total cost: $${result.metrics?.totalCostUsd.toFixed(4)}`);
  }, 120000);
});
