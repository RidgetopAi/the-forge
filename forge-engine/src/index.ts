/**
 * Forge Engine - Main Entry Point
 *
 * The orchestration engine for The Forge Development Cognition System.
 *
 * Usage:
 *   npx tsx src/index.ts <project-path> <request>
 *
 * Example:
 *   npx tsx src/index.ts /workspace/projects/mandrel "add user authentication"
 */

import { createPlantManager } from './departments/plant-manager.js';
import { createPreparationForeman } from './departments/preparation.js';
import { taskManager } from './state.js';
import { mandrel } from './mandrel.js';
import { llmClient, type QualityEvaluation } from './llm.js';

// ============================================================================
// Forge Engine
// ============================================================================

export class ForgeEngine {
  private instanceId: string;
  private plantManager: ReturnType<typeof createPlantManager>;
  private preparationForeman: ReturnType<typeof createPreparationForeman>;

  constructor(instanceId: string = 'forge-engine') {
    this.instanceId = instanceId;
    this.plantManager = createPlantManager(instanceId);
    this.preparationForeman = createPreparationForeman(instanceId);
  }

  /**
   * Process a request through The Forge
   *
   * Currently implements: Intake → Classification → Preparation
   * Future: Execution → Quality → Documentation
   */
  async process(
    rawRequest: string,
    projectPath: string
  ): Promise<{
    success: boolean;
    taskId: string;
    stage: string;
    result?: unknown;
    qualityEvaluation?: QualityEvaluation;
    needsHumanSync?: boolean;
    humanSyncReason?: string;
  }> {
    console.log('═'.repeat(60));
    console.log('THE FORGE - Development Cognition System');
    console.log('═'.repeat(60));
    console.log(`\nRequest: ${rawRequest}`);
    console.log(`Project: ${projectPath}\n`);

    // Connect to Mandrel
    const connected = await mandrel.ping();
    if (!connected) {
      console.warn('[ForgeEngine] Warning: Could not connect to Mandrel. Proceeding without persistence.');
    } else {
      console.log('[ForgeEngine] Connected to Mandrel');
    }

    // Phase 1: Intake (Plant Manager)
    console.log('\n' + '─'.repeat(40));
    console.log('PHASE 1: INTAKE (Plant Manager)');
    console.log('─'.repeat(40));

    const intake = await this.plantManager.intake(rawRequest);

    if (intake.needsHumanSync) {
      return {
        success: false,
        taskId: intake.taskId,
        stage: 'classification',
        needsHumanSync: true,
        humanSyncReason: intake.humanSyncReason,
      };
    }

    // Phase 2: Preparation (Preparation Foreman)
    console.log('\n' + '─'.repeat(40));
    console.log('PHASE 2: PREPARATION (Foreman + Workers)');
    console.log('─'.repeat(40));

    const preparation = await this.preparationForeman.prepare(intake.taskId, projectPath);

    if (!preparation.success) {
      return {
        success: false,
        taskId: intake.taskId,
        stage: 'preparation',
        result: { error: preparation.error },
      };
    }

    // Phase 3: Quality Evaluation (NEW - i[7])
    console.log('\n' + '─'.repeat(40));
    console.log('PHASE 3: PREPARATION QUALITY EVALUATION (i[7])');
    console.log('─'.repeat(40));

    const pkg = preparation.package!;
    const qualityEval = await llmClient.evaluateContextPackage(pkg, projectPath);

    console.log(`\n[Quality Evaluation] Method: ${qualityEval.method}`);
    console.log(`[Quality Evaluation] Score: ${qualityEval.score}/100`);
    console.log(`[Quality Evaluation] Passed: ${qualityEval.passed ? 'YES' : 'NO'}`);

    if (qualityEval.issues.length > 0) {
      console.log('\nIssues:');
      for (const issue of qualityEval.issues) {
        console.log(`  [${issue.severity.toUpperCase()}] ${issue.area}: ${issue.description}`);
        console.log(`    → ${issue.recommendation}`);
      }
    }

    if (qualityEval.strengths.length > 0) {
      console.log('\nStrengths:');
      for (const strength of qualityEval.strengths) {
        console.log(`  ✓ ${strength}`);
      }
    }

    console.log(`\nReasoning: ${qualityEval.reasoning}`);

    // Store quality evaluation to Mandrel
    await mandrel.storeContext(
      `ContextPackage Quality Evaluation:\n` +
      `Score: ${qualityEval.score}/100 (${qualityEval.passed ? 'PASSED' : 'FAILED'})\n` +
      `Method: ${qualityEval.method}\n` +
      `Issues: ${qualityEval.issues.length}\n` +
      `Strengths: ${qualityEval.strengths.length}\n` +
      `Reasoning: ${qualityEval.reasoning}`,
      'planning',
      ['quality-evaluation', 'context-package', qualityEval.passed ? 'passed' : 'needs-improvement']
    );

    // Success - ContextPackage ready
    console.log('\n' + '─'.repeat(40));
    console.log('RESULT: ContextPackage Ready');
    console.log('─'.repeat(40));

    console.log('\nTask Summary:');
    console.log(taskManager.getTaskSummary(intake.taskId));

    // Check if human sync needed before execution
    if (pkg.humanSync.requiredBefore.length > 0 || pkg.humanSync.ambiguities.length > 0) {
      console.log('\n⚠️  Human Sync Required Before Execution:');
      for (const action of pkg.humanSync.requiredBefore) {
        console.log(`  - Before: ${action}`);
      }
      for (const ambiguity of pkg.humanSync.ambiguities) {
        console.log(`  - Ambiguity: ${ambiguity}`);
      }
    }

    // Output POST-EXECUTION instructions (added by i[6])
    // Determine forge-engine path (handle both direct and subdirectory layouts)
    const forgeEnginePath = projectPath.includes('forge-engine')
      ? projectPath
      : `${projectPath}/forge-engine`;

    console.log('\n' + '─'.repeat(40));
    console.log('POST-EXECUTION: Report Your Results');
    console.log('─'.repeat(40));
    console.log('\nAfter executing this task, run the following to close the loop:');
    console.log('');
    console.log(`  cd ${forgeEnginePath}`);
    console.log(`  npx tsx src/report.ts ${projectPath} ${pkg.id} \\`);
    console.log(`    --success \\`);
    console.log(`    --files=<modified-files> \\`);
    console.log(`    --learning="<what-you-learned>"`);
    console.log('');
    console.log('Or create a report.json file:');
    console.log(JSON.stringify({
      projectPath,
      contextPackageId: pkg.id,
      taskId: intake.taskId,
      success: true,
      filesCreated: ['<new-file.ts>'],
      filesModified: ['<modified-file.ts>'],
      filesRead: ['<read-file.ts>'],
      learnings: ['What you learned'],
      notes: 'Optional notes',
    }, null, 2));
    console.log('');
    console.log(`Then run: cd ${forgeEnginePath} && npx tsx src/report.ts --json report.json`);

    if (pkg.humanSync.requiredBefore.length > 0 || pkg.humanSync.ambiguities.length > 0 || !qualityEval.passed) {
      return {
        success: true,
        taskId: intake.taskId,
        stage: 'prepared',
        result: pkg,
        qualityEvaluation: qualityEval,
        needsHumanSync: true,
        humanSyncReason: !qualityEval.passed
          ? `ContextPackage quality score ${qualityEval.score}/100 below threshold. Review issues before execution.`
          : 'Ambiguities or risks identified. Review ContextPackage before execution.',
      };
    }

    return {
      success: true,
      taskId: intake.taskId,
      stage: 'prepared',
      result: pkg,
      qualityEvaluation: qualityEval,
    };
  }

  /**
   * Get the current task state
   */
  getTaskState(taskId: string) {
    return taskManager.getTask(taskId);
  }
}

// ============================================================================
// CLI Interface
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log('Usage: npx tsx src/index.ts <project-path> "<request>"');
    console.log('');
    console.log('Example:');
    console.log('  npx tsx src/index.ts /workspace/projects/the-forge "add a new feature"');
    process.exit(1);
  }

  const [projectPath, ...requestParts] = args;
  const request = requestParts.join(' ');

  const engine = new ForgeEngine('i[9]'); // Current instance (updated by i[9] - task-type-aware file discovery)
  const result = await engine.process(request, projectPath);

  console.log('\n' + '═'.repeat(60));
  console.log('FORGE ENGINE COMPLETE');
  console.log('═'.repeat(60));
  console.log(JSON.stringify(result, null, 2));
}

// Run if called directly
main().catch(console.error);

// Export for programmatic use
export { taskManager, mandrel };
export { createLearningRetriever, createFeedbackRecorder } from './learning.js';
export { createQualityGate, QualityGate } from './departments/quality-gate.js';
export { reportExecution } from './report.js';
export { llmClient, createLLMClient, type ClassificationResult, type QualityEvaluation } from './llm.js';
