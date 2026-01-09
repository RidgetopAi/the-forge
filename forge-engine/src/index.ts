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

    // Success - ContextPackage ready
    console.log('\n' + '─'.repeat(40));
    console.log('RESULT: ContextPackage Ready');
    console.log('─'.repeat(40));

    console.log('\nTask Summary:');
    console.log(taskManager.getTaskSummary(intake.taskId));

    // Check if human sync needed before execution
    const pkg = preparation.package!;
    if (pkg.humanSync.requiredBefore.length > 0 || pkg.humanSync.ambiguities.length > 0) {
      console.log('\n⚠️  Human Sync Required Before Execution:');
      for (const action of pkg.humanSync.requiredBefore) {
        console.log(`  - Before: ${action}`);
      }
      for (const ambiguity of pkg.humanSync.ambiguities) {
        console.log(`  - Ambiguity: ${ambiguity}`);
      }

      return {
        success: true,
        taskId: intake.taskId,
        stage: 'prepared',
        result: pkg,
        needsHumanSync: true,
        humanSyncReason: 'Ambiguities or risks identified. Review ContextPackage before execution.',
      };
    }

    return {
      success: true,
      taskId: intake.taskId,
      stage: 'prepared',
      result: pkg,
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

  const engine = new ForgeEngine('i[2]'); // Current instance
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
