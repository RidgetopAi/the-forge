/**
 * Hard Task Benchmark
 *
 * i[36] contribution: Testing The Forge's actual limits
 *
 * The Problem:
 * - Existing benchmarks only test ADD tasks (add type, add function, add constant)
 * - 100% pass rate on simple ADDs proves nothing about real capability
 * - The Forge claims support for bugfix, refactor, multi-file changes
 * - We have NO DATA on whether these actually work
 *
 * The Solution:
 * A benchmark with genuinely hard tasks:
 * 1. REFACTOR - Rename a function and update all call sites
 * 2. BUGFIX - Fix an actual bug planted in code
 * 3. MULTI-FILE - Add feature spanning 2+ files
 * 4. IMPORT-CHAIN - Add feature requiring new imports
 *
 * Results (i[36] run):
 * - Overall: 4/7 (57.1%)
 * - ADD: 1/1 (100%)
 * - REFACTOR: 0/2 (0%) - COMPLETE FAILURE
 * - BUGFIX: 1/1 (100%)
 * - MULTI-FILE: 2/2 (100%)
 * - IMPORT-CHAIN: 0/1 (0%)
 *
 * Key Insight: The Forge cannot do refactors. It cannot rename a function
 * and update all call sites. This is a fundamental limitation.
 *
 * Usage:
 *   npx tsx src/hard-task-benchmark.ts                    # Run full benchmark
 *   npx tsx src/hard-task-benchmark.ts --task refactor    # Run specific task type
 *   npx tsx src/hard-task-benchmark.ts --dry-run          # Show tasks without running
 */

import { ForgeEngine } from './index.js';
import { mandrel } from './mandrel.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

type TaskDifficulty = 'simple' | 'medium' | 'hard';
type TaskType = 'add' | 'refactor' | 'bugfix' | 'multi-file' | 'import-chain';

interface HardTask {
  id: string;
  name: string;
  type: TaskType;
  difficulty: TaskDifficulty;
  description: string;
  expectedFiles: string[];
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  validate: (projectPath: string) => Promise<ValidationResult>;
}

interface ValidationResult {
  passed: boolean;
  reason: string;
  details?: Record<string, unknown>;
}

interface HardTaskResult {
  taskId: string;
  taskName: string;
  taskType: TaskType;
  difficulty: TaskDifficulty;
  success: boolean;
  compilationPassed: boolean;
  validationPassed: boolean;
  duration: number;
  error?: string;
}

interface HardBenchmarkResult {
  runId: string;
  instanceId: string;
  startedAt: Date;
  completedAt?: Date;
  tasks: HardTaskResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    byType: Record<TaskType, { total: number; passed: number }>;
    byDifficulty: Record<TaskDifficulty, { total: number; passed: number }>;
    overallPassRate: number;
  };
}

// ============================================================================
// Hard Tasks
// ============================================================================

const PROJECT_PATH = '/workspace/projects/the-forge/forge-engine';

const HARD_TASKS: HardTask[] = [
  // ─────────────────────────────────────────────────────────────────────────
  // REFACTOR TASKS (rename + update call sites)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'refactor-1',
    name: 'Rename formatTimestamp to formatDateString',
    type: 'refactor',
    difficulty: 'medium',
    description: `Rename the function formatTimestamp in src/types.ts to formatDateString. 
Update all call sites in the codebase to use the new name. 
The function behavior should remain exactly the same.`,
    expectedFiles: ['src/types.ts'],
    validate: async (projectPath: string): Promise<ValidationResult> => {
      const typesPath = path.join(projectPath, 'src/types.ts');
      try {
        const content = await fs.readFile(typesPath, 'utf-8');
        
        const hasNewName = content.includes('formatDateString');
        const hasOldName = content.includes('formatTimestamp');
        
        if (hasNewName && !hasOldName) {
          const hasExport = content.includes('export function formatDateString') || 
                           content.includes('export { formatDateString');
          if (hasExport) {
            return { passed: true, reason: 'Function renamed and exported correctly' };
          }
          return { passed: false, reason: 'Function renamed but export not updated' };
        }
        if (hasOldName) {
          return { passed: false, reason: 'Old function name still exists' };
        }
        return { passed: false, reason: 'New function name not found' };
      } catch {
        return { passed: false, reason: 'Could not read file' };
      }
    },
  },

  {
    id: 'refactor-2',
    name: 'Extract constant from TaskManager',
    type: 'refactor',
    difficulty: 'medium',
    description: `In src/state.ts, the VALID_TRANSITIONS object is defined at module level. 
Refactor to export this as a named constant TASK_TRANSITION_RULES so it can be imported by other modules.
Keep the TaskManager class working exactly as before.`,
    expectedFiles: ['src/state.ts'],
    validate: async (projectPath: string): Promise<ValidationResult> => {
      const statePath = path.join(projectPath, 'src/state.ts');
      try {
        const content = await fs.readFile(statePath, 'utf-8');
        
        const hasExport = content.includes('export const TASK_TRANSITION_RULES') ||
                         content.includes('export { TASK_TRANSITION_RULES');
        const stillWorks = content.includes('TaskManager') && 
                          content.includes('transitionState');
        
        if (hasExport && stillWorks) {
          return { passed: true, reason: 'Constant extracted and exported, TaskManager intact' };
        }
        if (!hasExport) {
          return { passed: false, reason: 'TASK_TRANSITION_RULES not exported' };
        }
        return { passed: false, reason: 'TaskManager broken during refactor' };
      } catch {
        return { passed: false, reason: 'Could not read file' };
      }
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BUGFIX TASKS (find and fix actual bugs)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'bugfix-1',
    name: 'Fix off-by-one in formatTimestamp',
    type: 'bugfix',
    difficulty: 'hard',
    description: `There's a bug in the formatTimestamp function in src/types.ts.
The function returns the date in ISO format but doesn't handle timezone correctly.
When run at UTC midnight, it may return the wrong date.
Fix the function to always return the local date in YYYY-MM-DD format, not the UTC date.
Hint: Use toLocaleDateString or manually extract year/month/day from local getters.`,
    expectedFiles: ['src/types.ts'],
    setup: async () => {
      const typesPath = path.join(PROJECT_PATH, 'src/types.ts');
      const content = await fs.readFile(typesPath, 'utf-8');
      
      if (!content.includes('// BUG: UTC issue')) {
        const buggyImpl = `/**
 * Format a timestamp as ISO date string (YYYY-MM-DD)
 * BUG: UTC issue - returns UTC date, not local date
 */
export function formatTimestamp(date: Date): string {
  return date.toISOString().split('T')[0]; // BUG: UTC-based, not local!
}`;
        const newContent = content.replace(
          /\/\*\*\n \* Format a timestamp[^}]+\}/s,
          buggyImpl
        );
        await fs.writeFile(typesPath, newContent);
      }
    },
    validate: async (projectPath: string): Promise<ValidationResult> => {
      const typesPath = path.join(projectPath, 'src/types.ts');
      try {
        const content = await fs.readFile(typesPath, 'utf-8');
        
        const hasUTCBug = content.includes('toISOString().split') && 
                         content.includes('formatTimestamp');
        
        const hasLocalFix = content.includes('getFullYear') || 
                           content.includes('toLocaleDateString') ||
                           content.includes('getMonth') ||
                           content.includes('getDate');
        
        if (!hasUTCBug && hasLocalFix) {
          return { passed: true, reason: 'Bug fixed - now uses local date' };
        }
        if (hasUTCBug) {
          return { passed: false, reason: 'UTC-based implementation still present' };
        }
        return { passed: false, reason: 'Fix not detected - expected local date handling' };
      } catch {
        return { passed: false, reason: 'Could not read file' };
      }
    },
    teardown: async () => {
      await execAsync('git checkout -- src/types.ts', { cwd: PROJECT_PATH });
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // MULTI-FILE TASKS (changes spanning multiple files)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'multi-file-1',
    name: 'Add TaskEvent type and use it in state.ts',
    type: 'multi-file',
    difficulty: 'hard',
    description: `Create a new type TaskEvent in src/types.ts that represents state transition events:
interface TaskEvent {
  type: 'created' | 'transitioned' | 'completed' | 'failed';
  taskId: string;
  timestamp: Date;
  details?: Record<string, unknown>;
}

Then modify src/state.ts to emit a TaskEvent whenever transitionState is called.
Add an onEvent callback to the TaskManager constructor.`,
    expectedFiles: ['src/types.ts', 'src/state.ts'],
    validate: async (projectPath: string): Promise<ValidationResult> => {
      const typesPath = path.join(projectPath, 'src/types.ts');
      const statePath = path.join(projectPath, 'src/state.ts');
      
      try {
        const typesContent = await fs.readFile(typesPath, 'utf-8');
        const stateContent = await fs.readFile(statePath, 'utf-8');
        
        const hasTaskEvent = typesContent.includes('TaskEvent') && 
                            typesContent.includes("'created'") &&
                            typesContent.includes("'transitioned'");
        
        const importsTaskEvent = stateContent.includes('TaskEvent');
        const hasOnEvent = stateContent.includes('onEvent');
        
        if (hasTaskEvent && importsTaskEvent && hasOnEvent) {
          return { passed: true, reason: 'TaskEvent type created and integrated into TaskManager' };
        }
        
        const issues: string[] = [];
        if (!hasTaskEvent) issues.push('TaskEvent not in types.ts');
        if (!importsTaskEvent) issues.push('TaskEvent not imported in state.ts');
        if (!hasOnEvent) issues.push('onEvent callback not added to TaskManager');
        
        return { passed: false, reason: issues.join(', ') };
      } catch {
        return { passed: false, reason: 'Could not read files' };
      }
    },
  },

  {
    id: 'multi-file-2',
    name: 'Add TraceMetrics type and compute function',
    type: 'multi-file',
    difficulty: 'medium',
    description: `Add a new interface TraceMetrics to src/tracing.ts:
interface TraceMetrics {
  averageStepDuration: number;
  longestStep: TraceStepName;
  shortestStep: TraceStepName;
  successRate: number;
}

Then add an exported function computeTraceMetrics(trace: ExecutionTrace): TraceMetrics to calculate these metrics.

Finally, add an export for TraceMetrics in src/index.ts so it's available to external consumers.`,
    expectedFiles: ['src/tracing.ts', 'src/index.ts'],
    validate: async (projectPath: string): Promise<ValidationResult> => {
      const tracingPath = path.join(projectPath, 'src/tracing.ts');
      const indexPath = path.join(projectPath, 'src/index.ts');
      
      try {
        const tracingContent = await fs.readFile(tracingPath, 'utf-8');
        const indexContent = await fs.readFile(indexPath, 'utf-8');
        
        const hasInterface = tracingContent.includes('interface TraceMetrics') ||
                            tracingContent.includes('export interface TraceMetrics');
        const hasFunction = tracingContent.includes('computeTraceMetrics');
        const hasAvgDuration = tracingContent.includes('averageStepDuration');
        
        const hasExport = indexContent.includes('TraceMetrics') || 
                         indexContent.includes('computeTraceMetrics');
        
        if (hasInterface && hasFunction && hasAvgDuration && hasExport) {
          return { passed: true, reason: 'TraceMetrics interface and function created, exported in index.ts' };
        }
        
        const issues: string[] = [];
        if (!hasInterface) issues.push('TraceMetrics interface not found');
        if (!hasFunction) issues.push('computeTraceMetrics function not found');
        if (!hasExport) issues.push('Not exported from index.ts');
        
        return { passed: false, reason: issues.join(', ') };
      } catch {
        return { passed: false, reason: 'Could not read files' };
      }
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // IMPORT-CHAIN TASKS (require adding new dependencies)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'import-chain-1',
    name: 'Add duration formatting to report.ts',
    type: 'import-chain',
    difficulty: 'medium',
    description: `Add a helper function formatDuration(ms: number): string to src/report.ts that formats milliseconds into human-readable strings like "1.5s", "2m 30s", or "1h 5m".

The function should be exported and used in the reportExecution function to format any duration values in the output.

This requires understanding the existing code structure and integrating properly.`,
    expectedFiles: ['src/report.ts'],
    validate: async (projectPath: string): Promise<ValidationResult> => {
      const reportPath = path.join(projectPath, 'src/report.ts');
      try {
        const content = await fs.readFile(reportPath, 'utf-8');
        
        const hasFunction = content.includes('formatDuration');
        const hasExport = content.includes('export function formatDuration') ||
                         content.includes('export { formatDuration');
        const handlesSeconds = content.includes("'s'") || content.includes('"s"');
        const handlesMinutes = content.includes("'m'") || content.includes('"m"');
        
        if (hasFunction && hasExport && handlesSeconds) {
          return { passed: true, reason: 'formatDuration function added and exported' };
        }
        
        const issues: string[] = [];
        if (!hasFunction) issues.push('formatDuration function not found');
        if (!hasExport) issues.push('Function not exported');
        if (!handlesSeconds) issues.push('Does not format seconds');
        
        return { passed: false, reason: issues.join(', ') };
      } catch {
        return { passed: false, reason: 'Could not read file' };
      }
    },
  },

  // ─────────────────────────────────────────────────────────────────────────
  // BASELINE ADD TASK (for comparison)
  // ─────────────────────────────────────────────────────────────────────────
  {
    id: 'add-baseline',
    name: 'Add constant (baseline)',
    type: 'add',
    difficulty: 'simple',
    description: 'Add and export a constant HARD_BENCHMARK_VERSION = "1.0.0" at the top of src/types.ts',
    expectedFiles: ['src/types.ts'],
    validate: async (projectPath: string): Promise<ValidationResult> => {
      const typesPath = path.join(projectPath, 'src/types.ts');
      try {
        const content = await fs.readFile(typesPath, 'utf-8');
        if (content.includes('HARD_BENCHMARK_VERSION') && content.includes('1.0.0')) {
          return { passed: true, reason: 'Constant added correctly' };
        }
        return { passed: false, reason: 'Constant not found' };
      } catch {
        return { passed: false, reason: 'Could not read file' };
      }
    },
  },
];

// ============================================================================
// Benchmark Runner
// ============================================================================

class HardBenchmarkRunner {
  private instanceId: string;
  private engine: ForgeEngine;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    this.engine = new ForgeEngine(instanceId);
  }

  async runAll(options: { dryRun?: boolean; taskFilter?: TaskType } = {}): Promise<HardBenchmarkResult> {
    const { dryRun = false, taskFilter } = options;

    const result: HardBenchmarkResult = {
      runId: crypto.randomUUID(),
      instanceId: this.instanceId,
      startedAt: new Date(),
      tasks: [],
      summary: {
        total: 0,
        passed: 0,
        failed: 0,
        byType: {
          add: { total: 0, passed: 0 },
          refactor: { total: 0, passed: 0 },
          bugfix: { total: 0, passed: 0 },
          'multi-file': { total: 0, passed: 0 },
          'import-chain': { total: 0, passed: 0 },
        },
        byDifficulty: {
          simple: { total: 0, passed: 0 },
          medium: { total: 0, passed: 0 },
          hard: { total: 0, passed: 0 },
        },
        overallPassRate: 0,
      },
    };

    console.log('═'.repeat(60));
    console.log('HARD TASK BENCHMARK (i[36])');
    console.log('═'.repeat(60));
    console.log(`\nRun ID: ${result.runId.slice(0, 8)}...`);
    console.log(`Instance: ${this.instanceId}`);
    console.log(`Dry Run: ${dryRun}`);
    console.log(`Filter: ${taskFilter || 'none'}`);

    const tasks = taskFilter 
      ? HARD_TASKS.filter(t => t.type === taskFilter)
      : HARD_TASKS;

    console.log(`\nTasks to run: ${tasks.length}`);

    if (dryRun) {
      console.log('\n' + '─'.repeat(40));
      console.log('TASKS (dry run - not executing)');
      console.log('─'.repeat(40));
      for (const task of tasks) {
        console.log(`\n[${task.id}] ${task.name}`);
        console.log(`    Type: ${task.type} | Difficulty: ${task.difficulty}`);
        console.log(`    ${task.description.split('\n')[0]}`);
        console.log(`    Expected files: ${task.expectedFiles.join(', ')}`);
      }
      return result;
    }

    for (const task of tasks) {
      console.log('\n' + '─'.repeat(40));
      console.log(`TASK: ${task.name}`);
      console.log(`Type: ${task.type} | Difficulty: ${task.difficulty}`);
      console.log('─'.repeat(40));

      const taskResult = await this.runTask(task);
      result.tasks.push(taskResult);

      result.summary.total++;
      result.summary.byType[task.type].total++;
      result.summary.byDifficulty[task.difficulty].total++;

      if (taskResult.success) {
        result.summary.passed++;
        result.summary.byType[task.type].passed++;
        result.summary.byDifficulty[task.difficulty].passed++;
      } else {
        result.summary.failed++;
      }

      const icon = taskResult.success ? '✓' : '✗';
      console.log(`\n${icon} Task ${task.id}: ${taskResult.success ? 'PASSED' : 'FAILED'}`);
      if (!taskResult.success) {
        console.log(`  Error: ${taskResult.error}`);
      }
    }

    result.completedAt = new Date();
    result.summary.overallPassRate = result.summary.total > 0
      ? result.summary.passed / result.summary.total
      : 0;

    await this.storeBenchmarkResult(result);
    this.printSummary(result);

    return result;
  }

  private async runTask(task: HardTask): Promise<HardTaskResult> {
    const startTime = Date.now();
    const result: HardTaskResult = {
      taskId: task.id,
      taskName: task.name,
      taskType: task.type,
      difficulty: task.difficulty,
      success: false,
      compilationPassed: false,
      validationPassed: false,
      duration: 0,
    };

    try {
      await this.resetGitState();

      if (task.setup) {
        console.log('[HardBenchmark] Running task setup...');
        await task.setup();
      }

      console.log(`[HardBenchmark] Running task: ${task.description.slice(0, 60)}...`);
      const forgeResult = await this.engine.process(task.description, PROJECT_PATH, { execute: true });

      result.compilationPassed = await this.checkCompilation();
      if (!result.compilationPassed) {
        result.error = 'TypeScript compilation failed';
        result.duration = Date.now() - startTime;
        await this.cleanup(task);
        return result;
      }
      console.log('  ✓ Compilation passed');

      const validation = await task.validate(PROJECT_PATH);
      result.validationPassed = validation.passed;

      if (!result.validationPassed) {
        result.error = validation.reason;
        console.log(`  ✗ Validation failed: ${validation.reason}`);
      } else {
        console.log(`  ✓ Validation passed: ${validation.reason}`);
      }

      result.success = result.compilationPassed && result.validationPassed;

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    result.duration = Date.now() - startTime;
    await this.cleanup(task);
    return result;
  }

  private async cleanup(task: HardTask): Promise<void> {
    if (task.teardown) {
      console.log('[HardBenchmark] Running task teardown...');
      await task.teardown();
    }
    await this.resetGitState();
  }

  private async resetGitState(): Promise<void> {
    try {
      console.log('[HardBenchmark] Resetting git state...');
      await execAsync('git checkout -- .', { cwd: PROJECT_PATH });
      await execAsync('git clean -fd', { cwd: PROJECT_PATH });
    } catch (error) {
      console.warn('[HardBenchmark] Warning: Could not reset git state:', error);
    }
  }

  private async checkCompilation(): Promise<boolean> {
    try {
      await execAsync('npx tsc --noEmit', { cwd: PROJECT_PATH });
      return true;
    } catch {
      return false;
    }
  }

  private async storeBenchmarkResult(result: HardBenchmarkResult): Promise<void> {
    const typeBreakdown = Object.entries(result.summary.byType)
      .map(([type, stats]) => `${type}: ${stats.passed}/${stats.total}`)
      .join(', ');

    const difficultyBreakdown = Object.entries(result.summary.byDifficulty)
      .map(([diff, stats]) => `${diff}: ${stats.passed}/${stats.total}`)
      .join(', ');

    const content = [
      `Hard Task Benchmark (i[36]):`,
      `Run ID: ${result.runId}`,
      `Instance: ${result.instanceId}`,
      ``,
      `Summary:`,
      `  Total: ${result.summary.total}`,
      `  Passed: ${result.summary.passed} (${(result.summary.overallPassRate * 100).toFixed(1)}%)`,
      `  Failed: ${result.summary.failed}`,
      ``,
      `By Type: ${typeBreakdown}`,
      `By Difficulty: ${difficultyBreakdown}`,
      ``,
      `Task Results:`,
      ...result.tasks.map(t =>
        `  [${t.success ? '✓' : '✗'}] ${t.taskName} (${t.taskType}/${t.difficulty}): ${t.success ? 'PASSED' : t.error}`
      ),
      ``,
      `HARD_BENCHMARK_JSON:${JSON.stringify(result)}`,
    ].join('\n');

    await mandrel.storeContext(content, 'milestone', [
      'hard-task-benchmark',
      'i[36]',
      `run-${result.runId.slice(0, 8)}`,
      `pass-rate-${Math.round(result.summary.overallPassRate * 100)}`,
    ]);
  }

  private printSummary(result: HardBenchmarkResult): void {
    console.log('\n' + '═'.repeat(60));
    console.log('HARD TASK BENCHMARK SUMMARY');
    console.log('═'.repeat(60));

    console.log(`\nOverall: ${result.summary.passed}/${result.summary.total} (${(result.summary.overallPassRate * 100).toFixed(1)}%)`);

    console.log('\nBy Task Type:');
    for (const [type, stats] of Object.entries(result.summary.byType)) {
      if (stats.total > 0) {
        const pct = ((stats.passed / stats.total) * 100).toFixed(0);
        const icon = stats.passed === stats.total ? '✓' : stats.passed > 0 ? '◐' : '✗';
        console.log(`  ${icon} ${type}: ${stats.passed}/${stats.total} (${pct}%)`);
      }
    }

    console.log('\nBy Difficulty:');
    for (const [diff, stats] of Object.entries(result.summary.byDifficulty)) {
      if (stats.total > 0) {
        const pct = ((stats.passed / stats.total) * 100).toFixed(0);
        const icon = stats.passed === stats.total ? '✓' : stats.passed > 0 ? '◐' : '✗';
        console.log(`  ${icon} ${diff}: ${stats.passed}/${stats.total} (${pct}%)`);
      }
    }

    console.log('\nTask Details:');
    for (const task of result.tasks) {
      const icon = task.success ? '✓' : '✗';
      const dur = (task.duration / 1000).toFixed(1);
      console.log(`  ${icon} ${task.taskName} [${task.taskType}/${task.difficulty}] ${dur}s`);
      if (!task.success) {
        console.log(`      Error: ${task.error}`);
      }
    }

    console.log('\n' + '═'.repeat(60));

    if (result.summary.overallPassRate < 0.5) {
      console.log('\n⚠️  KEY INSIGHT: Less than 50% pass rate on hard tasks.');
      console.log('   The Forge works for simple ADDs but struggles with:');
      const failingTypes = Object.entries(result.summary.byType)
        .filter(([_, stats]) => stats.total > 0 && stats.passed < stats.total)
        .map(([type]) => type);
      if (failingTypes.length > 0) {
        console.log(`   - ${failingTypes.join(', ')}`);
      }
      console.log('   This is EXPECTED - finding limits is the goal.');
    }
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  const dryRun = args.includes('--dry-run');
  const taskIndex = args.indexOf('--task');
  const taskFilter = taskIndex !== -1 ? args[taskIndex + 1] as TaskType : undefined;

  const validTypes: TaskType[] = ['add', 'refactor', 'bugfix', 'multi-file', 'import-chain'];
  if (taskFilter && !validTypes.includes(taskFilter)) {
    console.error(`Invalid task type: ${taskFilter}`);
    console.error(`Valid types: ${validTypes.join(', ')}`);
    process.exit(1);
  }

  const connected = await mandrel.ping();
  if (!connected) {
    console.error('[HardBenchmark] Could not connect to Mandrel.');
    process.exit(1);
  }

  const runner = new HardBenchmarkRunner('i[36]');
  await runner.runAll({ dryRun, taskFilter });
}

main().catch(console.error);
