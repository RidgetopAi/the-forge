/**
 * Self-Improvement Driver
 *
 * i[28] contribution: Makes The Forge proactive, not just reactive.
 *
 * The Gap: The Forge has preparation, execution, learning, and human-sync.
 * But it waits passively for human commands. Every test requires manual input.
 *
 * The Solution: A self-improvement loop that:
 * 1. Reads insights to identify current weaknesses (from InsightGenerator)
 * 2. Translates top recommendations into executable tasks
 * 3. Runs those tasks through The Forge
 * 4. Compares before/after metrics
 *
 * This turns The Forge from a tool into a system that can improve itself.
 *
 * Hard Problems Addressed:
 * - #3 Learning System: Now ACTS on learnings, not just stores them
 * - #5 Tool Building: Self-improvement is the ultimate tool
 */

import { createInsightGenerator, type InsightSummary } from './insights.js';
import { ForgeEngine } from './index.js';
import { mandrel } from './mandrel.js';

// ============================================================================
// Types
// ============================================================================

interface ImprovementTask {
  recommendation: InsightSummary['recommendations'][0];
  generatedTask: string;
  targetPath: string;
  rationale: string;
}

interface ImprovementCycle {
  id: string;
  startedAt: Date;
  beforeMetrics: {
    successRate: number;
    compilationPassRate: number;
    totalExecutions: number;
  };
  tasksGenerated: ImprovementTask[];
  tasksExecuted: number;
  tasksSucceeded: number;
  afterMetrics?: {
    successRate: number;
    compilationPassRate: number;
    totalExecutions: number;
  };
  completedAt?: Date;
  improvement?: {
    successRateDelta: number;
    compilationRateDelta: number;
  };
}

// ============================================================================
// Recommendation to Task Translator
// ============================================================================

/**
 * Translates InsightGenerator recommendations into concrete tasks.
 *
 * This is the "intelligence" of the self-improvement system.
 * Each recommendation category maps to specific improvement actions.
 */
class RecommendationTranslator {
  private projectPath: string;

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Translate a recommendation into an executable task.
   *
   * Returns null if the recommendation cannot be automated.
   */
  translate(rec: InsightSummary['recommendations'][0]): ImprovementTask | null {
    const category = rec.category.toLowerCase();
    const recommendation = rec.recommendation.toLowerCase();

    // Category-specific translation strategies
    if (category === 'preparation') {
      return this.translatePreparation(rec);
    }

    if (category === 'execution') {
      return this.translateExecution(rec);
    }

    if (category === 'architecture') {
      return this.translateArchitecture(rec);
    }

    if (category === 'validation') {
      return this.translateValidation(rec);
    }

    if (category === 'testing') {
      return this.translateTesting(rec);
    }

    if (category === 'data') {
      return this.translateData(rec);
    }

    // Cannot translate this recommendation
    console.log(`[Translator] Cannot translate recommendation: ${rec.category}`);
    return null;
  }

  private translatePreparation(rec: InsightSummary['recommendations'][0]): ImprovementTask | null {
    // "Reduce mustRead file predictions - preparation over-predicts needed files"
    if (rec.recommendation.includes('mustRead') || rec.recommendation.includes('over-predict')) {
      return {
        recommendation: rec,
        generatedTask: 'In src/departments/preparation.ts, improve the mustRead file selection logic to be more selective. Add a relevance threshold that filters out files with low semantic similarity to the task. Only include files above 0.7 similarity score.',
        targetPath: this.projectPath,
        rationale: 'Over-prediction wastes context budget. More selective mustRead improves execution efficiency.',
      };
    }
    return null;
  }

  private translateExecution(rec: InsightSummary['recommendations'][0]): ImprovementTask | null {
    // "Address primary failure mode: X"
    if (rec.recommendation.includes('failure mode')) {
      const modeMatch = rec.recommendation.match(/failure mode: (.+)/i);
      const mode = modeMatch ? modeMatch[1] : 'unknown';

      if (mode.includes('infra') || mode.includes('unknown')) {
        // Infrastructure failures often come from API issues or timeouts
        return {
          recommendation: rec,
          generatedTask: 'In src/departments/execution.ts, add retry logic with exponential backoff for LLM API calls. Wrap the generate() call in a retry loop with max 3 attempts, 1s/2s/4s delays. Log each retry attempt.',
          targetPath: this.projectPath,
          rationale: 'Infrastructure failures are often transient. Retry logic improves reliability.',
        };
      }

      if (mode.includes('compilation')) {
        // Compilation failures - self-heal loop should help
        return {
          recommendation: rec,
          generatedTask: 'In src/departments/execution.ts, increase MAX_COMPILATION_FIX_ATTEMPTS from 1 to 2. This gives the self-heal loop more chances to fix compilation errors.',
          targetPath: this.projectPath,
          rationale: 'More self-heal attempts may recover from complex compilation errors.',
        };
      }
    }
    return null;
  }

  private translateArchitecture(rec: InsightSummary['recommendations'][0]): ImprovementTask | null {
    // "Consider using Anthropic tool_use for structured code output"
    if (rec.recommendation.includes('tool_use')) {
      // Already implemented by i[22] - this shouldn't appear in new runs
      return null;
    }
    return null;
  }

  private translateValidation(rec: InsightSummary['recommendations'][0]): ImprovementTask | null {
    // "Compilation passes but tasks still fail - add more validation tools"
    if (rec.recommendation.includes('validation tools')) {
      return {
        recommendation: rec,
        generatedTask: 'In src/validation-tools.ts, enhance the ValidationToolBuilder to generate more comprehensive validation tools. Add a new validation type that checks if the generated code follows the project patterns from the ContextPackage.',
        targetPath: this.projectPath,
        rationale: 'Better validation catches issues before they become failures.',
      };
    }
    return null;
  }

  private translateTesting(rec: InsightSummary['recommendations'][0]): ImprovementTask | null {
    // "Increase test coverage in validation"
    if (rec.recommendation.includes('test coverage')) {
      return {
        recommendation: rec,
        generatedTask: 'In src/validation-tools.ts, add a new validation tool type that generates and runs simple unit tests for the generated code. The tool should create a test file, run it with tsx, and report pass/fail.',
        targetPath: this.projectPath,
        rationale: 'Automated test generation improves validation coverage.',
      };
    }
    return null;
  }

  private translateData(rec: InsightSummary['recommendations'][0]): ImprovementTask | null {
    // "Run more executions to improve insight accuracy"
    // This requires running actual tasks - generate a simple improvement task
    if (rec.recommendation.includes('more executions')) {
      return {
        recommendation: rec,
        generatedTask: 'Add a utility function formatDuration(ms: number): string to src/index.ts that formats milliseconds as human-readable duration (e.g., "2s", "1m 30s", "2h 5m"). Export it from the module.',
        targetPath: this.projectPath,
        rationale: 'Running a simple task increases execution data for better insights.',
      };
    }
    return null;
  }
}

// ============================================================================
// Self-Improvement Driver
// ============================================================================

export class SelfImprovementDriver {
  private instanceId: string;
  private projectPath: string;
  private translator: RecommendationTranslator;
  private engine: ForgeEngine;
  private insightGenerator: ReturnType<typeof createInsightGenerator>;

  constructor(instanceId: string, projectPath: string) {
    this.instanceId = instanceId;
    this.projectPath = projectPath;
    this.translator = new RecommendationTranslator(projectPath);
    this.engine = new ForgeEngine(instanceId);
    this.insightGenerator = createInsightGenerator(instanceId);
  }

  /**
   * Run a single improvement cycle.
   *
   * 1. Get current insights (before metrics)
   * 2. Translate top recommendations into tasks
   * 3. Execute tasks through The Forge
   * 4. Get new insights (after metrics)
   * 5. Report improvement delta
   */
  async runCycle(options: {
    maxTasks?: number;
    dryRun?: boolean;
  } = {}): Promise<ImprovementCycle> {
    const { maxTasks = 1, dryRun = false } = options;

    console.log('═'.repeat(60));
    console.log('SELF-IMPROVEMENT DRIVER (i[28])');
    console.log('═'.repeat(60));
    console.log(`\nProject: ${this.projectPath}`);
    console.log(`Max Tasks: ${maxTasks}`);
    console.log(`Dry Run: ${dryRun}`);

    const cycle: ImprovementCycle = {
      id: crypto.randomUUID(),
      startedAt: new Date(),
      beforeMetrics: { successRate: 0, compilationPassRate: 0, totalExecutions: 0 },
      tasksGenerated: [],
      tasksExecuted: 0,
      tasksSucceeded: 0,
    };

    // Step 1: Get current insights
    console.log('\n' + '─'.repeat(40));
    console.log('STEP 1: ANALYZING CURRENT STATE');
    console.log('─'.repeat(40));

    const beforeInsights = await this.insightGenerator.generateInsights(this.projectPath);

    cycle.beforeMetrics = {
      successRate: beforeInsights.successRate,
      compilationPassRate: beforeInsights.compilationPassRate,
      totalExecutions: beforeInsights.totalExecutions,
    };

    console.log(`\nCurrent Metrics:`);
    console.log(`  Success Rate: ${(cycle.beforeMetrics.successRate * 100).toFixed(1)}%`);
    console.log(`  Compilation Pass Rate: ${(cycle.beforeMetrics.compilationPassRate * 100).toFixed(1)}%`);
    console.log(`  Total Executions: ${cycle.beforeMetrics.totalExecutions}`);

    if (beforeInsights.recommendations.length === 0) {
      console.log('\nNo recommendations to act on. System is performing well!');
      return cycle;
    }

    console.log(`\nTop Recommendations:`);
    for (const rec of beforeInsights.recommendations.slice(0, 3)) {
      console.log(`  [${rec.priority}] ${rec.category}: ${rec.recommendation}`);
    }

    // Step 2: Translate recommendations into tasks
    console.log('\n' + '─'.repeat(40));
    console.log('STEP 2: TRANSLATING RECOMMENDATIONS TO TASKS');
    console.log('─'.repeat(40));

    for (const rec of beforeInsights.recommendations) {
      if (cycle.tasksGenerated.length >= maxTasks) break;

      const task = this.translator.translate(rec);
      if (task) {
        cycle.tasksGenerated.push(task);
        console.log(`\n[${rec.priority}] ${rec.category}`);
        console.log(`  Original: ${rec.recommendation}`);
        console.log(`  Generated Task: ${task.generatedTask.slice(0, 100)}...`);
        console.log(`  Rationale: ${task.rationale}`);
      }
    }

    if (cycle.tasksGenerated.length === 0) {
      console.log('\nNo recommendations could be translated into executable tasks.');
      console.log('This may require human intervention or new translation strategies.');
      return cycle;
    }

    // Step 3: Execute tasks (unless dry run)
    console.log('\n' + '─'.repeat(40));
    console.log('STEP 3: EXECUTING IMPROVEMENT TASKS');
    console.log('─'.repeat(40));

    if (dryRun) {
      console.log('\n[DRY RUN] Skipping execution. Tasks that would be run:');
      for (const task of cycle.tasksGenerated) {
        console.log(`\n  Task: ${task.generatedTask.slice(0, 80)}...`);
        console.log(`  Target: ${task.targetPath}`);
      }
    } else {
      for (const task of cycle.tasksGenerated) {
        console.log(`\nExecuting: ${task.generatedTask.slice(0, 60)}...`);

        try {
          const result = await this.engine.process(task.generatedTask, task.targetPath, { execute: true });
          cycle.tasksExecuted++;

          if (result.success && result.executionResult?.success) {
            cycle.tasksSucceeded++;
            console.log('  ✓ Task succeeded');
          } else {
            console.log(`  ✗ Task failed: ${result.executionResult?.notes || 'Unknown error'}`);
          }
        } catch (error) {
          console.log(`  ✗ Task threw error: ${error instanceof Error ? error.message : 'Unknown'}`);
          cycle.tasksExecuted++;
        }
      }
    }

    // Step 4: Get new insights (if we executed anything)
    if (!dryRun && cycle.tasksExecuted > 0) {
      console.log('\n' + '─'.repeat(40));
      console.log('STEP 4: MEASURING IMPROVEMENT');
      console.log('─'.repeat(40));

      const afterInsights = await this.insightGenerator.generateInsights(this.projectPath);

      cycle.afterMetrics = {
        successRate: afterInsights.successRate,
        compilationPassRate: afterInsights.compilationPassRate,
        totalExecutions: afterInsights.totalExecutions,
      };

      cycle.improvement = {
        successRateDelta: cycle.afterMetrics.successRate - cycle.beforeMetrics.successRate,
        compilationRateDelta: cycle.afterMetrics.compilationPassRate - cycle.beforeMetrics.compilationPassRate,
      };

      console.log('\nAfter Metrics:');
      console.log(`  Success Rate: ${(cycle.afterMetrics.successRate * 100).toFixed(1)}% (${cycle.improvement.successRateDelta >= 0 ? '+' : ''}${(cycle.improvement.successRateDelta * 100).toFixed(1)}%)`);
      console.log(`  Compilation Pass Rate: ${(cycle.afterMetrics.compilationPassRate * 100).toFixed(1)}% (${cycle.improvement.compilationRateDelta >= 0 ? '+' : ''}${(cycle.improvement.compilationRateDelta * 100).toFixed(1)}%)`);
      console.log(`  Total Executions: ${cycle.afterMetrics.totalExecutions}`);
    }

    cycle.completedAt = new Date();

    // Store cycle results to Mandrel
    await mandrel.storeContext(
      `Self-Improvement Cycle (i[28]):\n` +
      `Cycle ID: ${cycle.id}\n` +
      `Tasks Generated: ${cycle.tasksGenerated.length}\n` +
      `Tasks Executed: ${cycle.tasksExecuted}\n` +
      `Tasks Succeeded: ${cycle.tasksSucceeded}\n` +
      `Before: ${(cycle.beforeMetrics.successRate * 100).toFixed(1)}% success\n` +
      (cycle.afterMetrics ? `After: ${(cycle.afterMetrics.successRate * 100).toFixed(1)}% success\n` : '') +
      (cycle.improvement ? `Improvement: ${(cycle.improvement.successRateDelta * 100).toFixed(1)}%\n` : '') +
      `Duration: ${((cycle.completedAt?.getTime() || Date.now()) - cycle.startedAt.getTime()) / 1000}s`,
      cycle.tasksSucceeded > 0 ? 'milestone' : 'completion',
      ['self-improvement', 'i[28]', `cycle-${cycle.id.slice(0, 8)}`]
    );

    // Summary
    console.log('\n' + '═'.repeat(60));
    console.log('SELF-IMPROVEMENT CYCLE COMPLETE');
    console.log('═'.repeat(60));
    console.log(`\nTasks Generated: ${cycle.tasksGenerated.length}`);
    console.log(`Tasks Executed: ${cycle.tasksExecuted}`);
    console.log(`Tasks Succeeded: ${cycle.tasksSucceeded}`);
    if (cycle.improvement) {
      const delta = cycle.improvement.successRateDelta;
      const emoji = delta > 0 ? '📈' : delta < 0 ? '📉' : '➡️';
      console.log(`\n${emoji} Success Rate Change: ${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`);
    }

    return cycle;
  }
}

// ============================================================================
// CLI Handler
// ============================================================================

export async function handleSelfImprove(args: string[]): Promise<void> {
  // Parse arguments
  const dryRun = args.includes('--dry-run');
  const maxTasksIndex = args.indexOf('--max-tasks');
  const maxTasks = maxTasksIndex !== -1 ? parseInt(args[maxTasksIndex + 1], 10) || 1 : 1;

  // Find project path (first non-flag argument)
  const projectPath = args.find(arg => !arg.startsWith('--') && !parseInt(arg, 10));

  if (!projectPath) {
    console.log('Usage: npx tsx src/index.ts --self-improve <project-path> [options]');
    console.log('');
    console.log('Options:');
    console.log('  --dry-run      Show what would be done without executing');
    console.log('  --max-tasks N  Maximum number of tasks to execute (default: 1)');
    console.log('');
    console.log('Example:');
    console.log('  npx tsx src/index.ts --self-improve /workspace/projects/the-forge/forge-engine');
    console.log('  npx tsx src/index.ts --self-improve /workspace/projects/the-forge/forge-engine --dry-run');
    process.exit(1);
  }

  // Connect to Mandrel
  const connected = await mandrel.ping();
  if (!connected) {
    console.error('[SelfImprove] Could not connect to Mandrel.');
    process.exit(1);
  }

  const driver = new SelfImprovementDriver('i[28]', projectPath);
  await driver.runCycle({ maxTasks, dryRun });
}

// Factory function
export function createSelfImprovementDriver(instanceId: string, projectPath: string): SelfImprovementDriver {
  return new SelfImprovementDriver(instanceId, projectPath);
}
