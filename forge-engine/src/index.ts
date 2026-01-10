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
import { createExecutionForeman } from './departments/execution.js';
import { createHumanSyncService, type GeneratedQuestion, type HumanSyncService } from './human-sync.js';
import { taskManager } from './state.js';
import { mandrel } from './mandrel.js';
import { llmClient, type QualityEvaluation } from './llm.js';
import type { HumanSyncRequest } from './types.js';
import { createInsightGenerator } from './insights.js';
import { handleSelfImprove, createSelfImprovementDriver, SelfImprovementDriver } from './self-improve.js';
import {
  createExecutionTracer,
  ExecutionTracer,
  getTraceByTaskId,
  getRecentTraces,
  formatTrace,
  type ExecutionTrace,
  type TraceStepName,
} from './tracing.js';

// ============================================================================
// Forge Engine
// ============================================================================

export class ForgeEngine {
  private instanceId: string;
  private plantManager: ReturnType<typeof createPlantManager>;
  private preparationForeman: ReturnType<typeof createPreparationForeman>;
  private executionForeman: ReturnType<typeof createExecutionForeman>;
  private humanSyncService: HumanSyncService;

  constructor(instanceId: string = 'forge-engine') {
    this.instanceId = instanceId;
    this.plantManager = createPlantManager(instanceId);
    this.preparationForeman = createPreparationForeman(instanceId);
    this.executionForeman = createExecutionForeman(instanceId);
    this.humanSyncService = createHumanSyncService(instanceId);
  }

  /**
   * Process a request through The Forge
   *
   * i[13] update: Now implements full pipeline with execution!
   * Intake → Classification → Preparation → Quality Check → Execution
   *
   * @param rawRequest - The development task description
   * @param projectPath - Path to the project
   * @param options.execute - If true, execute after preparation (default: false for safety)
   */
  async process(
    rawRequest: string,
    projectPath: string,
    options: { execute?: boolean } = {}
  ): Promise<{
    success: boolean;
    taskId: string;
    stage: string;
    result?: unknown;
    qualityEvaluation?: QualityEvaluation;
    executionResult?: {
      success: boolean;
      filesCreated: string[];
      filesModified: string[];
      compilationPassed: boolean;
      notes: string;
    };
    needsHumanSync?: boolean;
    humanSyncReason?: string;
    humanSyncRequest?: HumanSyncRequest;
    humanSyncQuestion?: GeneratedQuestion;
    trace?: ExecutionTrace;
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

    // i[29]: Initialize execution tracer for observability
    let tracer: ExecutionTracer | null = null;

    // Phase 1: Intake (Plant Manager)
    console.log('\n' + '─'.repeat(40));
    console.log('PHASE 1: INTAKE (Plant Manager)');
    console.log('─'.repeat(40));

    const intakeStart = Date.now();
    const intake = await this.plantManager.intake(rawRequest);
    const intakeDuration = Date.now() - intakeStart;

    // i[29]: Create tracer after we have taskId
    tracer = createExecutionTracer(intake.taskId, projectPath, rawRequest, this.instanceId);
    tracer.recordStep('intake', 'success', intakeDuration, {
      projectType: intake.classification?.projectType,
      scope: intake.classification?.scope,
      confidence: intake.classification?.confidence,
    });

    if (intake.needsHumanSync) {
      tracer.recordStep('classification', 'failure', 0, undefined, 'needs_human_sync');
      tracer.finalize('failure');
      await tracer.storeToMandrel();
      return {
        success: false,
        taskId: intake.taskId,
        stage: 'classification',
        needsHumanSync: true,
        humanSyncReason: intake.humanSyncReason,
        trace: tracer.getTrace(),
      };
    }

    // Phase 1.5: Human Sync Check - Pre-Preparation (i[15])
    console.log('\n' + '─'.repeat(40));
    console.log('PHASE 1.5: HUMAN SYNC CHECK (i[15])');
    console.log('─'.repeat(40));

    tracer.startStep('human_sync_pre');
    const preCheckResult = await this.humanSyncService.evaluateTask(intake.taskId, {
      task: taskManager.getTask(intake.taskId)!,
      rawRequest,
    });

    if (preCheckResult.needsSync && preCheckResult.question?.urgency === 'critical') {
      console.log(`\n[HumanSync] CRITICAL issue detected: ${preCheckResult.question.question}`);
      console.log(`[HumanSync] Context: ${preCheckResult.question.context}`);
      console.log('\nOptions:');
      for (const opt of preCheckResult.question.options) {
        console.log(`  [${opt.id}] ${opt.label}`);
        console.log(`      ${opt.description}`);
      }

      tracer.endStep('failure', { urgency: 'critical' }, preCheckResult.question.question);
      tracer.finalize('failure');
      await tracer.storeToMandrel();
      return {
        success: false,
        taskId: intake.taskId,
        stage: 'human-sync-required',
        needsHumanSync: true,
        humanSyncReason: preCheckResult.question.question,
        humanSyncRequest: preCheckResult.request,
        humanSyncQuestion: preCheckResult.question,
        trace: tracer.getTrace(),
      };
    }
    tracer.endStep('success', { triggersCount: preCheckResult.firedTriggers.length });

    if (preCheckResult.needsSync) {
      console.log(`[HumanSync] Non-critical issue noted: ${preCheckResult.firedTriggers.map(t => t.trigger.name).join(', ')}`);
      console.log('[HumanSync] Proceeding to preparation, will evaluate again after.');
    } else {
      console.log('[HumanSync] No blocking issues detected.');
    }

    // Phase 2: Preparation (Preparation Foreman)
    console.log('\n' + '─'.repeat(40));
    console.log('PHASE 2: PREPARATION (Foreman + Workers)');
    console.log('─'.repeat(40));

    tracer.startStep('preparation');
    const preparation = await this.preparationForeman.prepare(intake.taskId, projectPath);

    if (!preparation.success) {
      tracer.endStep('failure', undefined, preparation.error);
      tracer.finalize('failure');
      await tracer.storeToMandrel();
      return {
        success: false,
        taskId: intake.taskId,
        stage: 'preparation',
        result: { error: preparation.error },
        trace: tracer.getTrace(),
      };
    }
    tracer.endStep('success', { mustReadFiles: preparation.package?.codeContext.mustRead.length });

    // Phase 3: Quality Evaluation (NEW - i[7])
    console.log('\n' + '─'.repeat(40));
    console.log('PHASE 3: PREPARATION QUALITY EVALUATION (i[7])');
    console.log('─'.repeat(40));

    tracer.startStep('quality_evaluation');
    const pkg = preparation.package!;
    const qualityEval = await llmClient.evaluateContextPackage(pkg, projectPath);
    tracer.endStep(qualityEval.passed ? 'success' : 'failure', {
      score: qualityEval.score,
      issueCount: qualityEval.issues.length,
    });

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

    // Phase 3.5: Comprehensive Human Sync Check - Pre-Execution (i[15])
    console.log('\n' + '─'.repeat(40));
    console.log('PHASE 3.5: HUMAN SYNC - PRE-EXECUTION CHECK (i[15])');
    console.log('─'.repeat(40));

    tracer.startStep('human_sync_post');
    const postCheckResult = await this.humanSyncService.evaluateTask(intake.taskId, {
      task: taskManager.getTask(intake.taskId)!,
      rawRequest,
      contextPackage: pkg,
      qualityScore: qualityEval.score,
    });

    if (postCheckResult.needsSync) {
      const triggers = postCheckResult.firedTriggers.map(t => t.trigger.name);
      console.log(`[HumanSync] Triggers fired: ${triggers.join(', ')}`);

      if (postCheckResult.question) {
        console.log(`\n[HumanSync] ${postCheckResult.question.urgency.toUpperCase()}: ${postCheckResult.question.question}`);
        console.log(`[HumanSync] Context: ${postCheckResult.question.context.slice(0, 200)}...`);
        console.log('\nOptions:');
        for (const opt of postCheckResult.question.options) {
          console.log(`  [${opt.id}] ${opt.label}`);
          console.log(`      ${opt.description}`);
        }
      }

      // For critical or high urgency, block execution
      if (postCheckResult.question?.urgency === 'critical' || postCheckResult.question?.urgency === 'high') {
        tracer.endStep('failure', { urgency: postCheckResult.question.urgency }, 'blocked_pre_execution');
        tracer.finalize('failure');
        await tracer.storeToMandrel();
        return {
          success: true,
          taskId: intake.taskId,
          stage: 'prepared',
          result: pkg,
          qualityEvaluation: qualityEval,
          needsHumanSync: true,
          humanSyncReason: postCheckResult.question?.question ?? 'Human sync required before execution',
          humanSyncRequest: postCheckResult.request,
          humanSyncQuestion: postCheckResult.question,
          trace: tracer.getTrace(),
        };
      }
    } else {
      console.log('[HumanSync] All triggers passed. Ready for execution.');
    }
    tracer.endStep('success');

    // Success - ContextPackage ready
    console.log('\n' + '─'.repeat(40));
    console.log('RESULT: ContextPackage Ready');
    console.log('─'.repeat(40));

    console.log('\nTask Summary:');
    console.log(taskManager.getTaskSummary(intake.taskId));

    // Check legacy humanSync flags (for backward compatibility)
    if (pkg.humanSync.requiredBefore.length > 0 || pkg.humanSync.ambiguities.length > 0) {
      console.log('\n[Legacy HumanSync] Additional items from ContextPackage:');
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

    // Phase 4: Execution (NEW - i[13])
    // Only execute if explicitly requested
    if (options.execute) {
      console.log('\n' + '─'.repeat(40));
      console.log('PHASE 4: EXECUTION (i[13])');
      console.log('─'.repeat(40));

      // i[29]: Track execution phases in tracer
      tracer.startStep('code_generation');
      const execResult = await this.executionForeman.execute(intake.taskId, projectPath);
      
      // i[29]: Record execution sub-steps from result
      // Note: detailed sub-step timing is in execution.ts, here we record high-level
      if (execResult.compilationAttempts > 1) {
        tracer.endStep('success', { selfHealAttempts: execResult.compilationAttempts });
        tracer.recordStep(
          'compilation_self_heal',
          execResult.compilationSelfHealed ? 'success' : 'failure',
          0,
          { attempts: execResult.compilationAttempts, healed: execResult.compilationSelfHealed }
        );
      } else {
        tracer.endStep(execResult.success ? 'success' : 'failure', {
          filesCreated: execResult.filesCreated.length,
          filesModified: execResult.filesModified.length,
        }, execResult.error);
      }

      // Record compilation step
      tracer.recordStep(
        'compilation',
        execResult.compilationPassed ? 'success' : 'failure',
        0,
        { passed: execResult.compilationPassed },
        execResult.compilationPassed ? undefined : execResult.notes.substring(0, 100)
      );

      // Record validation step if it ran
      if (execResult.validationSummary) {
        tracer.recordStep(
          'validation',
          execResult.validationPassed ? 'success' : 'failure',
          0,
          {
            toolsPassed: execResult.validationSummary.passed,
            toolsTotal: execResult.validationSummary.totalTools,
          }
        );
      }

      console.log(`\n[Execution] Success: ${execResult.success}`);
      console.log(`[Execution] Files Created: ${execResult.filesCreated.join(', ') || 'none'}`);
      console.log(`[Execution] Files Modified: ${execResult.filesModified.join(', ') || 'none'}`);
      console.log(`[Execution] Compilation: ${execResult.compilationPassed ? 'PASSED' : 'FAILED'}`);

      // Generate feedback for learning loop
      await this.executionForeman.generateFeedback(intake.taskId, execResult);

      // i[29]: Finalize and store trace
      const trace = tracer.finalize(
        execResult.success ? 'success' : 'failure',
        execResult.structuredFailure
      );
      await tracer.storeToMandrel();

      console.log(`\n[Trace] Stored trace ${trace.traceId.slice(0, 8)}... (${trace.steps.length} steps, ${trace.totalDurationMs}ms)`);

      return {
        success: execResult.success,
        taskId: intake.taskId,
        stage: 'executed',
        result: pkg,
        qualityEvaluation: qualityEval,
        executionResult: {
          success: execResult.success,
          filesCreated: execResult.filesCreated,
          filesModified: execResult.filesModified,
          compilationPassed: execResult.compilationPassed,
          notes: execResult.notes,
        },
        trace,
      };
    }

    // Preparation only (no execution)
    // i[29]: Still finalize trace for prep-only runs
    const trace = tracer.finalize('success');
    await tracer.storeToMandrel();

    return {
      success: true,
      taskId: intake.taskId,
      stage: 'prepared',
      result: pkg,
      qualityEvaluation: qualityEval,
      trace,
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

/**
 * Handle --respond command for Human Sync responses
 *
 * i[17]: This is the key addition that closes the Human Sync loop.
 * Users can now respond to Human Sync requests and resume the pipeline.
 *
 * Usage: npx tsx src/index.ts --respond <request-id> <option-id> [--notes "..."]
 */
async function handleRespond(args: string[]): Promise<void> {
  // Import the persistence functions
  const { loadRequestFromMandrel, markRequestResponded } = await import('./human-sync.js');

  // Parse arguments
  const notesIndex = args.indexOf('--notes');
  let notes: string | undefined;
  if (notesIndex !== -1 && args[notesIndex + 1]) {
    notes = args[notesIndex + 1];
    args.splice(notesIndex, 2);
  }

  const [requestId, optionId] = args;

  if (!requestId || !optionId) {
    console.log('Usage: npx tsx src/index.ts --respond <request-id> <option-id> [--notes "..."]');
    console.log('');
    console.log('Arguments:');
    console.log('  request-id  The Human Sync request ID (UUID from the prompt)');
    console.log('  option-id   The option ID to select (e.g., "proceed_careful", "abort")');
    console.log('  --notes     Optional additional notes or clarification');
    console.log('');
    console.log('Example:');
    console.log('  npx tsx src/index.ts --respond abc-123... proceed_careful --notes "I reviewed the risks"');
    process.exit(1);
  }

  console.log('═'.repeat(60));
  console.log('THE FORGE - Human Sync Response Handler (i[17])');
  console.log('═'.repeat(60));

  // Connect to Mandrel
  const connected = await mandrel.ping();
  if (!connected) {
    console.error('[Respond] Could not connect to Mandrel. Cannot retrieve request.');
    process.exit(1);
  }
  console.log('[Respond] Connected to Mandrel');

  // Load the original request
  console.log(`[Respond] Loading request ${requestId}...`);
  const loaded = await loadRequestFromMandrel(requestId);

  if (!loaded.success || !loaded.request || !loaded.question) {
    console.error(`[Respond] Failed to load request: ${loaded.error}`);
    console.error('[Respond] Make sure the request ID is correct and the request was created recently.');
    process.exit(1);
  }

  const { request, question } = loaded;

  // Display the original question for context
  console.log('\n' + '─'.repeat(40));
  console.log('ORIGINAL HUMAN SYNC REQUEST');
  console.log('─'.repeat(40));
  console.log(`Task ID: ${request.taskId}`);
  console.log(`Trigger: ${request.trigger}`);
  console.log(`Urgency: ${question.urgency}`);
  console.log(`\nQuestion: ${question.question}`);
  console.log(`\nContext: ${question.context.slice(0, 300)}...`);
  console.log('\nAvailable Options:');
  for (const opt of question.options) {
    console.log(`  [${opt.id}] ${opt.label}`);
    console.log(`      ${opt.description}`);
  }

  // Validate the selected option
  const selectedOption = question.options.find(o => o.id === optionId);
  if (!selectedOption && !question.allowFreeform) {
    console.error(`\n[Respond] Invalid option: "${optionId}"`);
    console.error(`[Respond] Valid options: ${question.options.map(o => o.id).join(', ')}`);
    process.exit(1);
  }

  // Process the response
  console.log('\n' + '─'.repeat(40));
  console.log('PROCESSING RESPONSE');
  console.log('─'.repeat(40));
  console.log(`Selected: ${optionId} ${selectedOption ? `(${selectedOption.label})` : '(freeform)'}`);
  if (notes) {
    console.log(`Notes: ${notes}`);
  }

  // The service needs the request in memory to process it
  // Since we loaded from Mandrel, manually call processResponse logic
  const optionLower = optionId.toLowerCase();
  type ResponseAction = 'proceed' | 'modify' | 'abort' | 'retry';
  let action: ResponseAction;

  if (optionLower.includes('abort') || optionLower.includes('cancel')) {
    action = 'abort';
  } else if (optionLower.includes('proceed') || optionLower.includes('execute')) {
    action = 'proceed';
  } else if (optionLower.includes('clarify') || optionLower.includes('expand') ||
             optionLower.includes('specify') || optionLower.includes('modify')) {
    action = 'modify';
  } else if (optionLower.includes('retry')) {
    action = 'retry';
  } else {
    // Default to proceed for most selections
    action = 'proceed';
  }

  console.log(`[Respond] Determined action: ${action}`);

  // Mark the request as responded in Mandrel
  await markRequestResponded(requestId, request.taskId, optionId, action, notes);

  // Handle the action
  console.log('\n' + '─'.repeat(40));
  console.log('RESULT');
  console.log('─'.repeat(40));

  switch (action) {
    case 'proceed':
      console.log('[Respond] Task will proceed with current preparation.');
      console.log('[Respond] The Human Sync concern has been acknowledged.');
      console.log('');
      console.log('To continue execution, run:');
      console.log(`  npx tsx src/index.ts --resume ${request.taskId} --execute`);
      break;

    case 'modify':
      console.log('[Respond] Task requires modification based on your input.');
      if (notes) {
        console.log(`[Respond] Your clarification: ${notes}`);
      }
      console.log('');
      console.log('To restart preparation with clarification, run:');
      console.log(`  npx tsx src/index.ts <project-path> "<original-request>. ${notes ?? 'Clarification: ...'}" --execute`);
      break;

    case 'abort':
      console.log('[Respond] Task has been aborted as requested.');
      console.log('[Respond] No further action needed.');
      // Store abort decision
      await mandrel.storeContext(
        `Task ${request.taskId} aborted via Human Sync.\n` +
        `Request: ${requestId}\n` +
        `Reason: User selected abort option\n` +
        `Notes: ${notes ?? 'none'}`,
        'decision',
        ['task-aborted', 'human-sync', `task-${request.taskId}`]
      );
      break;

    case 'retry':
      console.log('[Respond] Task will be retried with adjustments.');
      break;
  }

  console.log('\n' + '═'.repeat(60));
  console.log('RESPONSE PROCESSED');
  console.log('═'.repeat(60));
}

/**
 * Handle --status command to show pending Human Sync requests
 *
 * i[19]: This completes the Human Sync workflow by letting users
 * see all pending requests at a glance before deciding how to respond.
 */
async function handleStatus(): Promise<void> {
  console.log('═'.repeat(60));
  console.log('THE FORGE - Human Sync Status (i[19])');
  console.log('═'.repeat(60));

  // Connect to Mandrel
  const connected = await mandrel.ping();
  if (!connected) {
    console.error('[Status] Could not connect to Mandrel.');
    process.exit(1);
  }

  // Search for pending Human Sync requests
  console.log('\n[Status] Searching for pending Human Sync requests...\n');
  const searchResults = await mandrel.searchContext('human-sync-request pending', 20);

  if (!searchResults) {
    console.log('No pending Human Sync requests found.\n');
    return;
  }

  // Extract IDs and fetch each request
  const ids = mandrel.extractIdsFromSearchResults(searchResults);

  if (ids.length === 0) {
    console.log('No pending Human Sync requests found.\n');
    return;
  }

  console.log('─'.repeat(60));
  console.log('PENDING HUMAN SYNC REQUESTS');
  console.log('─'.repeat(60));

  let pendingCount = 0;

  for (const id of ids) {
    const context = await mandrel.getContextById(id);

    if (context.success && context.content) {
      // Parse JSON-formatted requests
      const jsonMatch = context.content.match(/HUMAN_SYNC_REQUEST_JSON:([\s\S]+)/);

      if (jsonMatch) {
        try {
          const payload = JSON.parse(jsonMatch[1]);

          // Skip if already responded
          if (payload.status !== 'pending') continue;

          pendingCount++;
          const created = new Date(payload.request.created);
          const ageMs = Date.now() - created.getTime();
          const ageMinutes = Math.floor(ageMs / 60000);
          const ageStr = ageMinutes < 60
            ? `${ageMinutes}m ago`
            : `${Math.floor(ageMinutes / 60)}h ${ageMinutes % 60}m ago`;

          console.log(`\n${pendingCount}. Request: ${payload.request.id.slice(0, 8)}...`);
          console.log(`   Task:     ${payload.request.taskId.slice(0, 8)}...`);
          console.log(`   Trigger:  ${payload.request.trigger}`);
          console.log(`   Urgency:  ${payload.question.urgency.toUpperCase()}`);
          console.log(`   Created:  ${ageStr}`);
          console.log(`   Question: ${payload.question.question}`);
          console.log('   Options:');
          for (const opt of payload.question.options) {
            console.log(`     [${opt.id}] ${opt.label}`);
          }
          console.log(`\n   To respond: npx tsx src/index.ts --respond ${payload.request.id} <option-id>`);
        } catch {
          // Skip malformed entries
        }
      }
    }
  }

  console.log('\n' + '─'.repeat(60));
  if (pendingCount === 0) {
    console.log('No pending requests found. All Human Sync requests have been resolved.');
  } else {
    console.log(`Total: ${pendingCount} pending request(s)`);
  }
  console.log('─'.repeat(60));
}

/**
 * Handle --insights command to analyze accumulated learning
 *
 * i[21]: This is the key addition that makes learning ACTUALLY compound.
 * Instead of just storing feedback, we analyze it for patterns.
 *
 * Usage: npx tsx src/index.ts --insights [project-path]
 */
async function handleInsights(projectPath?: string): Promise<void> {
  // Connect to Mandrel
  const connected = await mandrel.ping();
  if (!connected) {
    console.error('[Insights] Could not connect to Mandrel.');
    process.exit(1);
  }

  const generator = createInsightGenerator('i[21]');
  const insights = await generator.generateInsights(projectPath);
  const formatted = generator.formatInsights(insights);

  console.log(formatted);

  // Store the insight analysis to Mandrel
  await mandrel.storeContext(
    `Insight Analysis Generated (i[21]):\n` +
    `Total Executions: ${insights.totalExecutions}\n` +
    `Success Rate: ${(insights.successRate * 100).toFixed(1)}%\n` +
    `mustRead Over-Prediction Rate: ${(insights.mustReadAccuracy.overPredictionRate * 100).toFixed(1)}%\n` +
    `Top Recommendation: ${insights.recommendations[0]?.recommendation ?? 'None'}\n` +
    `Failure Modes: ${insights.failureModes.map(m => m.mode).join(', ') || 'None identified'}`,
    'reflections',
    ['insight-analysis', 'i[21]', 'learning-system']
  );
}

/**
 * Handle --replay command for debugging failed executions
 *
 * i[29]: Observability First - makes failures explainable and replayable.
 * Fetches a trace by task ID and displays detailed step-by-step info.
 *
 * Usage: npx tsx src/index.ts --replay <task-id>
 */
async function handleReplay(args: string[]): Promise<void> {
  const taskId = args[0];

  if (!taskId) {
    console.log('Usage: npx tsx src/index.ts --replay <task-id>');
    console.log('');
    console.log('Retrieves and displays the execution trace for a task.');
    console.log('Use --traces to list recent traces with their task IDs.');
    process.exit(1);
  }

  // Connect to Mandrel
  const connected = await mandrel.ping();
  if (!connected) {
    console.error('[Replay] Could not connect to Mandrel.');
    process.exit(1);
  }

  console.log(`[Replay] Searching for trace of task ${taskId.slice(0, 8)}...`);

  const trace = await getTraceByTaskId(taskId);

  if (!trace) {
    console.error(`[Replay] No trace found for task ${taskId}`);
    console.log('\nTips:');
    console.log('  - Make sure the task ID is correct');
    console.log('  - The task must have been run with tracing enabled (i[29]+)');
    console.log('  - Use --traces to list recent traces');
    process.exit(1);
  }

  console.log(formatTrace(trace));

  // If the trace has a structured failure, provide diagnostic hints
  if (trace.structuredFailure) {
    console.log('\n' + '─'.repeat(40));
    console.log('DIAGNOSTIC HINTS');
    console.log('─'.repeat(40));

    const sf = trace.structuredFailure;
    if (sf.phase === 'compilation') {
      console.log('  This was a compilation failure.');
      console.log('  Check: Were imports correct? Were types compatible?');
      if (sf.code === 'compile_module_not_found') {
        console.log('  → Missing module: Check if dependencies are installed');
      } else if (sf.code === 'compile_type_error') {
        console.log('  → Type error: Review the generated code for type mismatches');
      }
    } else if (sf.phase === 'file_operation') {
      console.log('  This was a file operation failure.');
      if (sf.code === 'file_edit_no_match') {
        console.log('  → Search string not found: The LLM provided a search pattern');
        console.log('    that does not exist in the file. This often happens when');
        console.log('    the LLM only sees signatures (from context budget) not full content.');
      }
    }

    if (sf.suggestedFix) {
      console.log(`\n  Suggested Fix: ${sf.suggestedFix}`);
    }
  }

  // Offer to re-run the task
  console.log('\n' + '─'.repeat(40));
  console.log('TO RE-RUN THIS TASK');
  console.log('─'.repeat(40));
  console.log(`  npx tsx src/index.ts "${trace.projectPath}" "${trace.taskDescription}" --execute`);
}

/**
 * Handle --traces command to list recent execution traces
 *
 * i[29]: Quick overview of recent runs for debugging
 */
async function handleTraces(): Promise<void> {
  const connected = await mandrel.ping();
  if (!connected) {
    console.error('[Traces] Could not connect to Mandrel.');
    process.exit(1);
  }

  console.log('[Traces] Fetching recent execution traces...\n');

  const traces = await getRecentTraces(15);

  if (traces.length === 0) {
    console.log('No execution traces found.');
    console.log('Traces are generated when running tasks with i[29]+ versions.');
    return;
  }

  console.log('═'.repeat(60));
  console.log('RECENT EXECUTION TRACES');
  console.log('═'.repeat(60));

  for (const trace of traces) {
    const icon = trace.outcome === 'success' ? '✓' : '✗';
    const duration = trace.totalDurationMs ? `${trace.totalDurationMs}ms` : 'N/A';
    const failedStep = trace.summary?.failedStep ? ` (failed at: ${trace.summary.failedStep})` : '';

    console.log(`\n${icon} ${trace.taskId.slice(0, 8)}...  [${trace.outcome.toUpperCase()}]  ${duration}${failedStep}`);
    console.log(`    Task: ${trace.taskDescription.slice(0, 60)}...`);
    console.log(`    Instance: ${trace.instanceId}`);
    console.log(`    Steps: ${trace.summary?.successCount ?? 0}/${trace.summary?.stepCount ?? 0} succeeded`);

    if (trace.structuredFailure) {
      console.log(`    Failure: ${trace.structuredFailure.phase}/${trace.structuredFailure.code}`);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log(`Total: ${traces.length} trace(s)`);
  console.log('\nTo view details: npx tsx src/index.ts --replay <task-id>');
  console.log('═'.repeat(60));
}

async function main() {
  const args = process.argv.slice(2);

  // i[19]: Handle --status command to show pending requests
  if (args.includes('--status')) {
    await handleStatus();
    return;
  }

  // i[21]: Handle --insights command to analyze accumulated learning
  const insightsIndex = args.indexOf('--insights');
  if (insightsIndex !== -1) {
    const projectPath = args[insightsIndex + 1]; // Optional project path filter
    await handleInsights(projectPath?.startsWith('--') ? undefined : projectPath);
    return;
  }

  // i[17]: Handle --respond command for Human Sync responses
  const respondIndex = args.indexOf('--respond');
  if (respondIndex !== -1) {
    const respondArgs = args.slice(respondIndex + 1);
    await handleRespond(respondArgs);
    return;
  }

  // i[28]: Handle --self-improve command for self-improvement loop
  const selfImproveIndex = args.indexOf('--self-improve');
  if (selfImproveIndex !== -1) {
    const selfImproveArgs = args.slice(selfImproveIndex + 1);
    await handleSelfImprove(selfImproveArgs);
    return;
  }

  // i[29]: Handle --replay command for debugging failed executions
  const replayIndex = args.indexOf('--replay');
  if (replayIndex !== -1) {
    const replayArgs = args.slice(replayIndex + 1);
    await handleReplay(replayArgs);
    return;
  }

  // i[29]: Handle --traces command to list recent traces
  if (args.includes('--traces')) {
    await handleTraces();
    return;
  }

  // i[30]: Handle --benchmark command for external benchmarks
  if (args.includes('--benchmark')) {
    const dryRun = args.includes('--dry-run');
    const taskIndex = args.indexOf('--task');
    const specificTask = taskIndex !== -1 ? args[taskIndex + 1] : undefined;
    
    console.log('[ForgeEngine] Launching external benchmark...');
    console.log('Run: npx tsx src/benchmark.ts' + (dryRun ? ' --dry-run' : '') + (specificTask ? ` --task ${specificTask}` : ''));
    console.log('\nSee benchmark.ts for full benchmark suite.');
    return;
  }

  // Parse --execute flag
  const executeIndex = args.indexOf('--execute');
  const shouldExecute = executeIndex !== -1;
  if (shouldExecute) {
    args.splice(executeIndex, 1);
  }

  if (args.length < 2) {
    console.log('Usage: npx tsx src/index.ts <project-path> "<request>" [--execute]');
    console.log('       npx tsx src/index.ts --status');
    console.log('       npx tsx src/index.ts --insights [project-path]');
    console.log('       npx tsx src/index.ts --respond <request-id> <option-id> [--notes "..."]');
    console.log('       npx tsx src/index.ts --self-improve <project-path> [--dry-run] [--max-tasks N]');
    console.log('       npx tsx src/index.ts --traces');
    console.log('       npx tsx src/index.ts --replay <task-id>');
    console.log('       npx tsx src/benchmark.ts [--dry-run] [--task N]');
    console.log('');
    console.log('Commands:');
    console.log('  <project-path> "<request>"   Process a new task');
    console.log('  --status                     Show pending Human Sync requests');
    console.log('  --insights [path]            Analyze accumulated learning (i[21])');
    console.log('  --respond <id> <option>      Respond to a Human Sync request');
    console.log('  --self-improve <path>        Run self-improvement cycle (i[28])');
    console.log('  --traces                     List recent execution traces (i[29])');
    console.log('  --replay <task-id>           Debug a failed execution (i[29])');
    console.log('  benchmark.ts                 External benchmark suite (i[30])');
    console.log('');
    console.log('Options:');
    console.log('  --execute     Actually execute the task (default: prepare only)');
    console.log('  --notes       Additional notes for Human Sync response');
    console.log('  --dry-run     Show what self-improve would do without executing');
    console.log('  --max-tasks   Max tasks for self-improve (default: 1)');
    console.log('');
    console.log('Examples:');
    console.log('  npx tsx src/index.ts /workspace/projects/the-forge "add a README"');
    console.log('  npx tsx src/index.ts /workspace/projects/the-forge "add a README" --execute');
    console.log('  npx tsx src/index.ts --status');
    console.log('  npx tsx src/index.ts --insights');
    console.log('  npx tsx src/index.ts --insights /workspace/projects/the-forge');
    console.log('  npx tsx src/index.ts --respond abc-123 proceed_careful --notes "I reviewed the risks"');
    console.log('  npx tsx src/index.ts --self-improve /workspace/projects/the-forge/forge-engine');
    console.log('  npx tsx src/index.ts --self-improve /workspace/projects/the-forge/forge-engine --dry-run');
    console.log('  npx tsx src/index.ts --traces');
    console.log('  npx tsx src/index.ts --replay abc-123-def-456');
    process.exit(1);
  }

  const [projectPath, ...requestParts] = args;
  const request = requestParts.join(' ');

  // i[30]: External benchmark (ground truth)
  const engine = new ForgeEngine('i[30]');
  const result = await engine.process(request, projectPath, { execute: shouldExecute });

  console.log('\n' + '═'.repeat(60));
  console.log('FORGE ENGINE COMPLETE');
  console.log('═'.repeat(60));
  console.log(JSON.stringify(result, null, 2));
}

// Run if called directly (ES module check via import.meta.url)
// Only run main() when this file is the entry point, not when imported
const isMainModule = import.meta.url === `file://${process.argv[1]}` || 
                     import.meta.url.endsWith('/index.ts') && process.argv[1]?.endsWith('index.ts');
if (isMainModule) {
  main().catch(console.error);
}

// Export for programmatic use
export { taskManager, mandrel };
export { createLearningRetriever, createFeedbackRecorder } from './learning.js';
export { createQualityGate, QualityGate } from './departments/quality-gate.js';
export { createExecutionForeman, ExecutionForeman } from './departments/execution.js';
export { reportExecution } from './report.js';
export { llmClient, createLLMClient, type ClassificationResult, type QualityEvaluation } from './llm.js';
export {
  createHumanSyncService,
  HumanSyncService,
  builtInTriggers,
  saveRequestToMandrel,
  loadRequestFromMandrel,
  markRequestResponded,
  type GeneratedQuestion,
} from './human-sync.js';
// i[16]: Context Budget Manager exports
export {
  TokenCounter,
  ContextBudgetManager,
  FileContentExtractor,
  processFilesWithBudget,
  createTokenCounter,
  createContextBudgetManager,
  createFileContentExtractor,
  type BudgetAllocation,
  type BudgetedFile,
  type ExtractedContent,
} from './context-budget.js';
// i[18]: Validation Tool Builder exports (Hard Problem #5 - Tool Building)
export {
  ValidationToolBuilder,
  createValidationToolBuilder,
  type ValidationTool,
  type ValidationResult,
  type ValidationSummary,
} from './validation-tools.js';
// i[21]: Insight Generator exports (Hard Problem #3 - Learning System Enhancement)
export {
  InsightGenerator,
  createInsightGenerator,
  type InsightSummary,
  type ExecutionFeedbackData,
} from './insights.js';
// i[28]: Self-Improvement Driver exports (Makes The Forge proactive)
export {
  SelfImprovementDriver,
  createSelfImprovementDriver,
  handleSelfImprove,
} from './self-improve.js';
// i[29]: Execution Tracing exports (Observability First)
export {
  ExecutionTracer,
  createExecutionTracer,
  getTraceByTaskId,
  getRecentTraces,
  formatTrace,
  type ExecutionTrace,
  type TraceStep,
  type TraceSummary,
  type TraceStepName,
  type TraceStepStatus,
} from './tracing.js';
