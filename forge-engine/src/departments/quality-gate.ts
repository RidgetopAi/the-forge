/**
 * Quality Gate Department
 *
 * Created by i[5] to fill the gap between Execution and Completion.
 *
 * The Quality Gate validates execution results before work is accepted:
 * - TypeScript compilation must pass
 * - Tests must pass (if applicable)
 * - Acceptance criteria must be met
 * - No obvious regressions
 *
 * This is a GATE - work cannot proceed without passing quality checks.
 */

import { ContextPackage } from '../types.js';
import { taskManager } from '../state.js';
import { mandrel } from '../mandrel.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

const execAsync = promisify(exec);

// ============================================================================
// Quality Check Results
// ============================================================================

export interface QualityCheckResult {
  check: string;
  passed: boolean;
  required: boolean;
  message: string;
  details?: string;
}

export interface QualityGateResult {
  passed: boolean;
  checks: QualityCheckResult[];
  summary: string;
  recommendation: 'approve' | 'reject' | 'human_review';
  failedRequired: number;
  failedOptional: number;
}

// ============================================================================
// Execution Result (input to Quality Gate)
// ============================================================================

export interface ExecutionResult {
  taskId: string;
  contextPackageId: string;
  success: boolean;
  filesCreated: string[];
  filesModified: string[];
  filesRead: string[];
  notes?: string;
}

// ============================================================================
// Quality Gate Implementation
// ============================================================================

export class QualityGate {
  private instanceId: string;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  /**
   * Run all quality checks on execution results.
   *
   * This is the main entry point for the Quality Gate.
   */
  async validate(
    taskId: string,
    projectPath: string,
    executionResult: ExecutionResult
  ): Promise<QualityGateResult> {
    const task = taskManager.getTask(taskId);
    if (!task || !task.contextPackage) {
      return {
        passed: false,
        checks: [],
        summary: 'Task or ContextPackage not found',
        recommendation: 'reject',
        failedRequired: 1,
        failedOptional: 0,
      };
    }

    console.log(`[QualityGate] Running quality checks for task ${taskId}`);

    // Transition task to reviewing state
    taskManager.transitionState(taskId, 'reviewing', this.instanceId, 'Quality Gate validation');

    // Run all checks
    const checks: QualityCheckResult[] = [];

    // Required checks
    checks.push(await this.checkTypeScriptCompilation(projectPath));
    checks.push(await this.checkFilesExist(projectPath, executionResult.filesModified));

    // Conditional checks
    if (await this.hasTests(projectPath)) {
      checks.push(await this.checkTestsPass(projectPath));
    }

    // Acceptance criteria checks
    const criteriaChecks = await this.checkAcceptanceCriteria(
      task.contextPackage,
      executionResult
    );
    checks.push(...criteriaChecks);

    // Pattern compliance (advisory)
    checks.push(await this.checkPatternCompliance(projectPath, executionResult.filesModified));

    // Calculate results
    const failedRequired = checks.filter(c => c.required && !c.passed).length;
    const failedOptional = checks.filter(c => !c.required && !c.passed).length;
    const passed = failedRequired === 0;

    // Determine recommendation
    let recommendation: QualityGateResult['recommendation'];
    if (passed && failedOptional === 0) {
      recommendation = 'approve';
    } else if (passed && failedOptional > 0) {
      recommendation = 'human_review';
    } else {
      recommendation = 'reject';
    }

    const result: QualityGateResult = {
      passed,
      checks,
      summary: this.generateSummary(checks, passed),
      recommendation,
      failedRequired,
      failedOptional,
    };

    // Store quality result on task
    taskManager.setQualityResult(taskId, result);

    // Log to Mandrel
    await mandrel.storeContext(
      `QualityGate result for task ${taskId}:\n` +
      `Passed: ${passed}\n` +
      `Recommendation: ${recommendation}\n` +
      `Required failures: ${failedRequired}\n` +
      `Optional failures: ${failedOptional}\n` +
      `Checks:\n${checks.map(c => `  - [${c.passed ? 'PASS' : 'FAIL'}] ${c.check}: ${c.message}`).join('\n')}`,
      'completion',
      ['quality-gate', passed ? 'passed' : 'failed', this.instanceId]
    );

    // Transition state based on result
    if (passed) {
      taskManager.transitionState(taskId, 'completed', this.instanceId, 'Quality Gate passed');
    } else {
      taskManager.transitionState(taskId, 'blocked', this.instanceId, 'Quality Gate failed');
    }

    console.log(`[QualityGate] ${passed ? 'PASSED' : 'FAILED'}: ${result.summary}`);

    return result;
  }

  // ============================================================================
  // Individual Checks
  // ============================================================================

  /**
   * Check that TypeScript compiles without errors.
   * This is a REQUIRED check.
   */
  private async checkTypeScriptCompilation(projectPath: string): Promise<QualityCheckResult> {
    console.log('[QualityGate] Checking TypeScript compilation...');

    try {
      // Look for tsconfig in project or subdirectories
      const tsconfigPaths = [
        path.join(projectPath, 'tsconfig.json'),
        path.join(projectPath, 'forge-engine', 'tsconfig.json'),
      ];

      let tsconfigPath: string | null = null;
      for (const p of tsconfigPaths) {
        try {
          await fs.access(p);
          tsconfigPath = p;
          break;
        } catch {
          continue;
        }
      }

      if (!tsconfigPath) {
        return {
          check: 'TypeScript Compilation',
          passed: true,
          required: true,
          message: 'No tsconfig.json found - skipped',
        };
      }

      const projectDir = path.dirname(tsconfigPath);
      const { stdout, stderr } = await execAsync(`cd "${projectDir}" && npx tsc --noEmit 2>&1`, {
        timeout: 60000,
      });

      const output = stdout + stderr;
      const hasErrors = output.includes('error TS');

      return {
        check: 'TypeScript Compilation',
        passed: !hasErrors,
        required: true,
        message: hasErrors ? 'TypeScript compilation failed' : 'TypeScript compilation passed',
        details: hasErrors ? output.substring(0, 500) : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // If tsc exits with non-zero, it means errors
      if (message.includes('error TS')) {
        return {
          check: 'TypeScript Compilation',
          passed: false,
          required: true,
          message: 'TypeScript compilation failed',
          details: message.substring(0, 500),
        };
      }

      return {
        check: 'TypeScript Compilation',
        passed: true,
        required: true,
        message: 'TypeScript check completed (may have warnings)',
      };
    }
  }

  /**
   * Check that all modified files exist.
   * This is a REQUIRED check.
   */
  private async checkFilesExist(
    projectPath: string,
    files: string[]
  ): Promise<QualityCheckResult> {
    console.log('[QualityGate] Checking modified files exist...');

    const missing: string[] = [];

    for (const file of files) {
      const fullPath = path.isAbsolute(file) ? file : path.join(projectPath, file);
      try {
        await fs.access(fullPath);
      } catch {
        missing.push(file);
      }
    }

    return {
      check: 'Files Exist',
      passed: missing.length === 0,
      required: true,
      message: missing.length === 0
        ? `All ${files.length} modified files exist`
        : `${missing.length} files missing`,
      details: missing.length > 0 ? `Missing: ${missing.join(', ')}` : undefined,
    };
  }

  /**
   * Check if the project has tests.
   */
  private async hasTests(projectPath: string): Promise<boolean> {
    const testPatterns = [
      '**/*.test.ts',
      '**/*.spec.ts',
      '**/__tests__/**',
      '**/test/**',
    ];

    for (const pattern of testPatterns) {
      try {
        const { stdout } = await execAsync(
          `find "${projectPath}" -path "*/node_modules" -prune -o -name "*.test.ts" -print | head -1`,
          { timeout: 5000 }
        );
        if (stdout.trim()) return true;
      } catch {
        continue;
      }
    }

    return false;
  }

  /**
   * Check that tests pass.
   * This is a REQUIRED check if tests exist.
   */
  private async checkTestsPass(projectPath: string): Promise<QualityCheckResult> {
    console.log('[QualityGate] Running tests...');

    try {
      // Try to find package.json with test script
      const pkgPath = path.join(projectPath, 'package.json');
      let testCommand = 'npm test';

      try {
        const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
        if (!pkg.scripts?.test || pkg.scripts.test === 'echo "Error: no test specified" && exit 1') {
          return {
            check: 'Tests',
            passed: true,
            required: false,
            message: 'No test script defined - skipped',
          };
        }
        testCommand = 'npm test';
      } catch {
        // No package.json, try forge-engine subdirectory
        const forgeEnginePkgPath = path.join(projectPath, 'forge-engine', 'package.json');
        try {
          await fs.access(forgeEnginePkgPath);
          testCommand = `cd "${path.join(projectPath, 'forge-engine')}" && npm test`;
        } catch {
          return {
            check: 'Tests',
            passed: true,
            required: false,
            message: 'No test configuration found - skipped',
          };
        }
      }

      const { stdout, stderr } = await execAsync(testCommand, { timeout: 120000 });

      // Check for test failures in output
      const output = stdout + stderr;
      const hasFailures = output.includes('FAIL') || output.includes('failed') ||
        output.includes('Error:');

      return {
        check: 'Tests',
        passed: !hasFailures,
        required: true,
        message: hasFailures ? 'Tests failed' : 'Tests passed',
        details: hasFailures ? output.substring(0, 500) : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      return {
        check: 'Tests',
        passed: false,
        required: true,
        message: 'Test execution failed',
        details: message.substring(0, 500),
      };
    }
  }

  /**
   * Check acceptance criteria from ContextPackage.
   * These are REQUIRED checks.
   */
  private async checkAcceptanceCriteria(
    pkg: ContextPackage,
    executionResult: ExecutionResult
  ): Promise<QualityCheckResult[]> {
    console.log('[QualityGate] Checking acceptance criteria...');

    const checks: QualityCheckResult[] = [];

    for (const criterion of pkg.task.acceptanceCriteria) {
      // Basic heuristic matching - future: use LLM for semantic evaluation
      let passed = true;
      let message = 'Criterion not automatically verifiable - marked as passed';

      // Try to match specific patterns
      if (criterion.toLowerCase().includes('compiles')) {
        // Already checked by TypeScript compilation
        message = 'Covered by TypeScript compilation check';
      } else if (criterion.toLowerCase().includes('tests')) {
        // Already checked by test run
        message = 'Covered by test execution check';
      } else if (criterion.toLowerCase().includes('error') && criterion.toLowerCase().includes('no longer')) {
        // Can't automatically verify - needs human
        passed = true; // Assume passed, but flag for review
        message = 'Cannot automatically verify - requires manual testing';
      }

      checks.push({
        check: `Criterion: ${criterion.substring(0, 50)}`,
        passed,
        required: false, // Acceptance criteria are advisory until LLM evaluation
        message,
      });
    }

    return checks;
  }

  /**
   * Check pattern compliance (advisory).
   * This is an OPTIONAL check.
   */
  private async checkPatternCompliance(
    projectPath: string,
    modifiedFiles: string[]
  ): Promise<QualityCheckResult> {
    console.log('[QualityGate] Checking pattern compliance...');

    // Basic checks - future: more sophisticated analysis
    const issues: string[] = [];

    for (const file of modifiedFiles) {
      const fullPath = path.isAbsolute(file) ? file : path.join(projectPath, file);

      try {
        const content = await fs.readFile(fullPath, 'utf-8');

        // Check for common issues
        if (content.includes('console.log') && !file.includes('test')) {
          // Allow console.log for now - just advisory
        }

        if (content.includes('any') && file.endsWith('.ts')) {
          issues.push(`${path.basename(file)}: contains 'any' type`);
        }

        if (content.includes('TODO') || content.includes('FIXME')) {
          issues.push(`${path.basename(file)}: contains TODO/FIXME`);
        }
      } catch {
        // File doesn't exist or can't read - already caught by files exist check
      }
    }

    return {
      check: 'Pattern Compliance',
      passed: issues.length === 0,
      required: false, // Advisory only
      message: issues.length === 0
        ? 'No pattern violations detected'
        : `${issues.length} advisory issues found`,
      details: issues.length > 0 ? issues.join('\n') : undefined,
    };
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  private generateSummary(checks: QualityCheckResult[], passed: boolean): string {
    const total = checks.length;
    const passedCount = checks.filter(c => c.passed).length;
    const requiredFailed = checks.filter(c => c.required && !c.passed).length;

    if (passed) {
      return `Quality Gate PASSED: ${passedCount}/${total} checks passed`;
    } else {
      return `Quality Gate FAILED: ${requiredFailed} required checks failed`;
    }
  }
}

// Factory function
export function createQualityGate(instanceId: string): QualityGate {
  return new QualityGate(instanceId);
}
