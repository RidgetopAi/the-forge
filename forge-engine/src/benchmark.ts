/**
 * External Benchmark Suite
 *
 * i[30] contribution: Ground truth for measuring The Forge
 *
 * The Problem (from Oracle Review):
 * - The Forge grades itself
 * - When success rate changes, we can't tell if it's real or noise
 * - No external benchmark = no ground truth
 *
 * The Solution:
 * A fixed set of tasks with objective pass/fail criteria that
 * do not depend on The Forge's self-assessment.
 *
 * Pass/Fail Criteria (per task):
 * 1. TypeScript compiles (tsc --noEmit)
 * 2. No unrelated files modified
 * 3. Task-specific validation (e.g., function exists, export works)
 *
 * Usage:
 *   npx tsx src/benchmark.ts                    # Run full benchmark
 *   npx tsx src/benchmark.ts --task 1           # Run specific task
 *   npx tsx src/benchmark.ts --dry-run          # Show tasks without running
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

interface BenchmarkTask {
  id: number;
  name: string;
  description: string;
  targetPath: string;
  expectedFiles: string[];
  validate: (projectPath: string) => Promise<ValidationResult>;
}

interface ValidationResult {
  passed: boolean;
  reason: string;
  details?: Record<string, unknown>;
}

interface TaskResult {
  taskId: number;
  taskName: string;
  success: boolean;
  compilationPassed: boolean;
  validationPassed: boolean;
  noUnrelatedChanges: boolean;
  duration: number;
  error?: string;
  details: {
    forgeResult?: unknown;
    validationResult?: ValidationResult;
  };
}

interface BenchmarkResult {
  runId: string;
  instanceId: string;
  startedAt: Date;
  completedAt?: Date;
  totalDuration?: number;
  tasks: TaskResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    compilationPassRate: number;
    validationPassRate: number;
  };
}

// ============================================================================
// Benchmark Tasks
// ============================================================================

/**
 * Fixed benchmark tasks - these never change.
 * Each task has a specific validation function that checks objective criteria.
 */
const BENCHMARK_TASKS: BenchmarkTask[] = [
  {
    id: 1,
    name: 'Add type alias to types.ts',
    description: 'Add a new type alias BenchmarkStatus = "pending" | "running" | "passed" | "failed" to src/types.ts and export it',
    targetPath: '/workspace/projects/the-forge/forge-engine',
    expectedFiles: ['src/types.ts'],
    validate: async (projectPath: string): Promise<ValidationResult> => {
      const filePath = path.join(projectPath, 'src/types.ts');
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.includes('BenchmarkStatus') && content.includes('pending') && content.includes('running')) {
          return { passed: true, reason: 'BenchmarkStatus type found with correct values' };
        }
        return { passed: false, reason: 'BenchmarkStatus type not found or incomplete' };
      } catch {
        return { passed: false, reason: 'Could not read file' };
      }
    },
  },
  {
    id: 2,
    name: 'Add interface to types.ts',
    description: 'Add a new interface BenchmarkConfig { taskCount: number; timeout: number; verbose: boolean; } to src/types.ts and export it',
    targetPath: '/workspace/projects/the-forge/forge-engine',
    expectedFiles: ['src/types.ts'],
    validate: async (projectPath: string): Promise<ValidationResult> => {
      const filePath = path.join(projectPath, 'src/types.ts');
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.includes('interface BenchmarkConfig') && 
            content.includes('taskCount') && 
            content.includes('timeout') &&
            content.includes('verbose')) {
          return { passed: true, reason: 'BenchmarkConfig interface found with all fields' };
        }
        return { passed: false, reason: 'BenchmarkConfig interface not found or incomplete' };
      } catch {
        return { passed: false, reason: 'Could not read file' };
      }
    },
  },
  {
    id: 3,
    name: 'Add helper to tracing.ts',
    description: 'Add and export a helper function isSlowStep(step: TraceStep, thresholdMs: number = 5000): boolean to src/tracing.ts that returns true if the step took longer than the threshold',
    targetPath: '/workspace/projects/the-forge/forge-engine',
    expectedFiles: ['src/tracing.ts'],
    validate: async (projectPath: string): Promise<ValidationResult> => {
      const filePath = path.join(projectPath, 'src/tracing.ts');
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.includes('isSlowStep') && content.includes('thresholdMs')) {
          return { passed: true, reason: 'isSlowStep function found' };
        }
        return { passed: false, reason: 'isSlowStep function not found' };
      } catch {
        return { passed: false, reason: 'Could not read file' };
      }
    },
  },
  {
    id: 4,
    name: 'Add constant to insights.ts',
    description: 'Add and export a constant DEFAULT_INSIGHT_LIMIT = 50 at the top of src/insights.ts',
    targetPath: '/workspace/projects/the-forge/forge-engine',
    expectedFiles: ['src/insights.ts'],
    validate: async (projectPath: string): Promise<ValidationResult> => {
      const filePath = path.join(projectPath, 'src/insights.ts');
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.includes('DEFAULT_INSIGHT_LIMIT') && content.includes('50')) {
          return { passed: true, reason: 'DEFAULT_INSIGHT_LIMIT constant found' };
        }
        return { passed: false, reason: 'DEFAULT_INSIGHT_LIMIT constant not found' };
      } catch {
        return { passed: false, reason: 'Could not read file' };
      }
    },
  },
  {
    id: 5,
    name: 'Add utility to mandrel.ts',
    description: 'Add and export a helper function formatMandrelTags(tags: string[]): string to src/mandrel.ts that joins tags with commas and wraps in brackets like [tag1, tag2]',
    targetPath: '/workspace/projects/the-forge/forge-engine',
    expectedFiles: ['src/mandrel.ts'],
    validate: async (projectPath: string): Promise<ValidationResult> => {
      const filePath = path.join(projectPath, 'src/mandrel.ts');
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        if (content.includes('formatMandrelTags') && content.includes('tags')) {
          return { passed: true, reason: 'formatMandrelTags function found' };
        }
        return { passed: false, reason: 'formatMandrelTags function not found' };
      } catch {
        return { passed: false, reason: 'Could not read file' };
      }
    },
  },
];

// ============================================================================
// Benchmark Runner
// ============================================================================

class BenchmarkRunner {
  private instanceId: string;
  private engine: ForgeEngine;
  
  constructor(instanceId: string) {
    this.instanceId = instanceId;
    this.engine = new ForgeEngine(instanceId);
  }
  
  /**
   * Run the full benchmark suite
   */
  async runAll(options: { dryRun?: boolean } = {}): Promise<BenchmarkResult> {
    const result: BenchmarkResult = {
      runId: crypto.randomUUID(),
      instanceId: this.instanceId,
      startedAt: new Date(),
      tasks: [],
      summary: {
        total: BENCHMARK_TASKS.length,
        passed: 0,
        failed: 0,
        passRate: 0,
        compilationPassRate: 0,
        validationPassRate: 0,
      },
    };
    
    console.log('═'.repeat(60));
    console.log('EXTERNAL BENCHMARK SUITE (i[30])');
    console.log('═'.repeat(60));
    console.log(`\nRun ID: ${result.runId.slice(0, 8)}...`);
    console.log(`Instance: ${this.instanceId}`);
    console.log(`Tasks: ${BENCHMARK_TASKS.length}`);
    console.log(`Dry Run: ${options.dryRun || false}`);
    
    if (options.dryRun) {
      console.log('\n' + '─'.repeat(40));
      console.log('TASKS (dry run - not executing)');
      console.log('─'.repeat(40));
      for (const task of BENCHMARK_TASKS) {
        console.log(`\n[${task.id}] ${task.name}`);
        console.log(`    ${task.description}`);
        console.log(`    Expected files: ${task.expectedFiles.join(', ')}`);
      }
      return result;
    }
    
    for (const task of BENCHMARK_TASKS) {
      console.log('\n' + '─'.repeat(40));
      console.log(`TASK ${task.id}: ${task.name}`);
      console.log('─'.repeat(40));
      
      // i[31]: Reset git state between tasks to prevent accumulation
      await this.resetGitState(task.targetPath);
      
      const taskResult = await this.runTask(task);
      result.tasks.push(taskResult);
      
      const icon = taskResult.success ? '✓' : '✗';
      console.log(`\n${icon} Task ${task.id}: ${taskResult.success ? 'PASSED' : 'FAILED'}`);
      if (!taskResult.success) {
        console.log(`  Reason: ${taskResult.error || 'Unknown'}`);
      }
    }
    
    // Compute summary
    result.completedAt = new Date();
    result.totalDuration = result.completedAt.getTime() - result.startedAt.getTime();
    result.summary.passed = result.tasks.filter(t => t.success).length;
    result.summary.failed = result.tasks.filter(t => !t.success).length;
    result.summary.passRate = result.summary.passed / result.summary.total;
    result.summary.compilationPassRate = 
      result.tasks.filter(t => t.compilationPassed).length / result.summary.total;
    result.summary.validationPassRate = 
      result.tasks.filter(t => t.validationPassed).length / result.summary.total;
    
    // Store to Mandrel
    await this.storeBenchmarkResult(result);
    
    // Print summary
    console.log('\n' + '═'.repeat(60));
    console.log('BENCHMARK SUMMARY');
    console.log('═'.repeat(60));
    console.log(`\nTotal: ${result.summary.total}`);
    console.log(`Passed: ${result.summary.passed} (${(result.summary.passRate * 100).toFixed(1)}%)`);
    console.log(`Failed: ${result.summary.failed}`);
    console.log(`\nCompilation Pass Rate: ${(result.summary.compilationPassRate * 100).toFixed(1)}%`);
    console.log(`Validation Pass Rate: ${(result.summary.validationPassRate * 100).toFixed(1)}%`);
    console.log(`\nTotal Duration: ${(result.totalDuration / 1000).toFixed(1)}s`);
    console.log('═'.repeat(60));
    
    return result;
  }
  
  /**
   * Run a single benchmark task
   */
  async runTask(task: BenchmarkTask): Promise<TaskResult> {
    const startTime = Date.now();
    const result: TaskResult = {
      taskId: task.id,
      taskName: task.name,
      success: false,
      compilationPassed: false,
      validationPassed: false,
      noUnrelatedChanges: false,
      duration: 0,
      details: {},
    };
    
    try {
      // Get git status before
      const gitStatusBefore = await this.getGitStatus(task.targetPath);
      
      // Run The Forge
      console.log(`[Benchmark] Running task: ${task.description.slice(0, 60)}...`);
      const forgeResult = await this.engine.process(task.description, task.targetPath, { execute: true });
      result.details.forgeResult = forgeResult;
      
      // Check compilation
      result.compilationPassed = await this.checkCompilation(task.targetPath);
      if (!result.compilationPassed) {
        result.error = 'TypeScript compilation failed';
        result.duration = Date.now() - startTime;
        return result;
      }
      console.log('  ✓ Compilation passed');
      
      // Check for unrelated changes
      const gitStatusAfter = await this.getGitStatus(task.targetPath);
      const changedFiles = this.getChangedFiles(gitStatusBefore, gitStatusAfter);
      const relatedFiles = changedFiles.filter(f => 
        task.expectedFiles.some(expected => f.includes(expected))
      );
      const unrelatedFiles = changedFiles.filter(f => 
        !task.expectedFiles.some(expected => f.includes(expected))
      );
      
      result.noUnrelatedChanges = unrelatedFiles.length === 0;
      if (!result.noUnrelatedChanges) {
        result.error = `Unrelated files changed: ${unrelatedFiles.join(', ')}`;
        console.log(`  ✗ Unrelated files changed: ${unrelatedFiles.join(', ')}`);
      } else {
        console.log('  ✓ No unrelated changes');
      }
      
      // Run task-specific validation
      const validationResult = await task.validate(task.targetPath);
      result.validationPassed = validationResult.passed;
      result.details.validationResult = validationResult;
      
      if (!result.validationPassed) {
        result.error = validationResult.reason;
        console.log(`  ✗ Validation failed: ${validationResult.reason}`);
      } else {
        console.log(`  ✓ Validation passed: ${validationResult.reason}`);
      }
      
      // Task passes if all criteria are met
      result.success = result.compilationPassed && result.noUnrelatedChanges && result.validationPassed;
      
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }
    
    result.duration = Date.now() - startTime;
    return result;
  }
  
  /**
   * i[31]: Reset git state to clean slate before each task
   * This prevents task N's changes from affecting task N+1
   */
  private async resetGitState(projectPath: string): Promise<void> {
    try {
      console.log('[Benchmark] Resetting git state...');
      await execAsync('git checkout -- .', { cwd: projectPath });
      await execAsync('git clean -fd', { cwd: projectPath });
      console.log('[Benchmark] Git state reset complete');
    } catch (error) {
      console.warn('[Benchmark] Warning: Could not reset git state:', error);
    }
  }
  
  /**
   * Check TypeScript compilation
   */
  private async checkCompilation(projectPath: string): Promise<boolean> {
    try {
      await execAsync('npx tsc --noEmit', { cwd: projectPath });
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Get current git status
   */
  private async getGitStatus(projectPath: string): Promise<string[]> {
    try {
      const { stdout } = await execAsync('git status --porcelain', { cwd: projectPath });
      return stdout.trim().split('\n').filter(Boolean);
    } catch {
      return [];
    }
  }
  
  /**
   * Get list of changed files
   */
  private getChangedFiles(before: string[], after: string[]): string[] {
    const beforeSet = new Set(before);
    return after
      .filter(line => !beforeSet.has(line))
      .map(line => line.slice(3).trim()); // Remove git status prefix
  }
  
  /**
   * Store benchmark result to Mandrel
   */
  private async storeBenchmarkResult(result: BenchmarkResult): Promise<void> {
    const content = [
      `External Benchmark Result (i[30]):`,
      `Run ID: ${result.runId}`,
      `Instance: ${result.instanceId}`,
      ``,
      `Summary:`,
      `  Total: ${result.summary.total}`,
      `  Passed: ${result.summary.passed} (${(result.summary.passRate * 100).toFixed(1)}%)`,
      `  Failed: ${result.summary.failed}`,
      `  Compilation: ${(result.summary.compilationPassRate * 100).toFixed(1)}%`,
      `  Validation: ${(result.summary.validationPassRate * 100).toFixed(1)}%`,
      ``,
      `Tasks:`,
      ...result.tasks.map(t => 
        `  [${t.success ? '✓' : '✗'}] ${t.taskName}: ${t.success ? 'PASSED' : t.error}`
      ),
      ``,
      `Duration: ${(result.totalDuration || 0) / 1000}s`,
      ``,
      `BENCHMARK_JSON:${JSON.stringify(result)}`,
    ].join('\n');
    
    await mandrel.storeContext(content, 'milestone', [
      'external-benchmark',
      `run-${result.runId.slice(0, 8)}`,
      `pass-rate-${Math.round(result.summary.passRate * 100)}`,
      this.instanceId,
    ]);
  }
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  const dryRun = args.includes('--dry-run');
  const taskIndex = args.indexOf('--task');
  const specificTask = taskIndex !== -1 ? parseInt(args[taskIndex + 1], 10) : undefined;
  
  // Connect to Mandrel
  const connected = await mandrel.ping();
  if (!connected) {
    console.error('[Benchmark] Could not connect to Mandrel.');
    process.exit(1);
  }
  
  const runner = new BenchmarkRunner('i[36]');
  
  if (specificTask !== undefined) {
    const task = BENCHMARK_TASKS.find(t => t.id === specificTask);
    if (!task) {
      console.error(`Task ${specificTask} not found. Available: ${BENCHMARK_TASKS.map(t => t.id).join(', ')}`);
      process.exit(1);
    }
    
    console.log(`Running single task: ${task.name}`);
    const result = await runner.runTask(task);
    console.log(JSON.stringify(result, null, 2));
  } else {
    await runner.runAll({ dryRun });
  }
}

main().catch(console.error);
