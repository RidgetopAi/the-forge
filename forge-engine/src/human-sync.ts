/**
 * Human Sync Service
 *
 * i[15] Implementation: The Forge's voice.
 *
 * The seed document says: "Human-in-the-loop is architectural, not fallback."
 * This service implements that architecture.
 *
 * Three capabilities:
 * 1. DETECTION: Active triggers that identify when human input is needed
 * 2. QUESTION GENERATION: Turn ambiguity into actionable questions
 * 3. RESPONSE HANDLING: Process answers and resume the pipeline
 */

import { randomUUID } from 'crypto';
import { z } from 'zod';
import {
  HumanSyncRequest,
  type ContextPackage,
  type ForgeTask,
} from './types.js';
import { mandrel } from './mandrel.js';

// ============================================================================
// Trigger Types
// ============================================================================

/**
 * A trigger is a condition that fires Human Sync.
 * Each trigger has:
 * - id: unique identifier
 * - check: function that evaluates the condition
 * - priority: higher = more urgent
 * - generateQuestion: how to ask about this trigger
 */
export interface HumanSyncTrigger {
  id: string;
  name: string;
  priority: number; // 1-10, 10 = most urgent
  check: (context: TriggerContext) => TriggerResult;
}

export interface TriggerContext {
  task?: ForgeTask;
  rawRequest?: string;
  contextPackage?: ContextPackage;
  qualityScore?: number;
  estimatedCost?: number;
}

export interface TriggerResult {
  fired: boolean;
  reason?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details?: Record<string, unknown>;
}

// ============================================================================
// Question Schema (what we generate)
// ============================================================================

export const GeneratedQuestion = z.object({
  question: z.string(),
  context: z.string(),
  options: z.array(z.object({
    id: z.string(),
    label: z.string(),
    description: z.string(),
    impact: z.string().optional(),
  })),
  allowFreeform: z.boolean(),
  urgency: z.enum(['low', 'medium', 'high', 'critical']),
  triggeredBy: z.array(z.string()),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestion>;

// ============================================================================
// Built-in Triggers
// ============================================================================

/**
 * VagueTaskTrigger: Fires when task description is too short or unclear
 */
export const vagueTaskTrigger: HumanSyncTrigger = {
  id: 'vague_task',
  name: 'Vague Task Detection',
  priority: 8,
  check: (ctx) => {
    const request = ctx.rawRequest ?? ctx.task?.rawRequest ?? '';

    // Check word count
    const words = request.trim().split(/\s+/).filter(w => w.length > 0);
    if (words.length < 3) {
      return {
        fired: true,
        reason: `Task too brief (${words.length} words). Need more context to proceed.`,
        severity: 'high',
        details: { wordCount: words.length },
      };
    }

    // Check for action verbs
    const actionVerbs = ['add', 'create', 'build', 'implement', 'fix', 'update', 'remove', 'delete', 'refactor', 'change', 'modify'];
    const hasActionVerb = actionVerbs.some(verb =>
      request.toLowerCase().includes(verb)
    );
    if (!hasActionVerb) {
      return {
        fired: true,
        reason: 'No clear action verb detected. What should be done?',
        severity: 'medium',
        details: { hasActionVerb: false },
      };
    }

    // Check for specificity (has nouns that aren't generic)
    const genericWords = ['thing', 'stuff', 'something', 'it', 'that', 'this'];
    const isOnlyGeneric = words.every(w =>
      genericWords.includes(w.toLowerCase()) ||
      actionVerbs.includes(w.toLowerCase()) ||
      ['a', 'an', 'the', 'to', 'for', 'in', 'on'].includes(w.toLowerCase())
    );
    if (isOnlyGeneric) {
      return {
        fired: true,
        reason: 'Task lacks specific nouns. What exactly should be created/modified?',
        severity: 'high',
        details: { isOnlyGeneric: true },
      };
    }

    return { fired: false, severity: 'low' };
  },
};

/**
 * ConflictingConstraintsTrigger: Fires when constraints appear to conflict
 */
export const conflictingConstraintsTrigger: HumanSyncTrigger = {
  id: 'conflicting_constraints',
  name: 'Conflicting Constraints Detection',
  priority: 9,
  check: (ctx) => {
    const pkg = ctx.contextPackage;
    if (!pkg) return { fired: false, severity: 'low' };

    const conflicts: string[] = [];

    // Check for speed vs thoroughness conflict
    const hasSpeedConstraint = pkg.constraints.technical.some(c =>
      c.toLowerCase().includes('fast') || c.toLowerCase().includes('quick')
    );
    const hasThoroughnessConstraint = pkg.constraints.quality.some(c =>
      c.toLowerCase().includes('thorough') || c.toLowerCase().includes('comprehensive')
    );
    if (hasSpeedConstraint && hasThoroughnessConstraint) {
      conflicts.push('Speed requirement conflicts with thoroughness requirement');
    }

    // Check for "no breaking changes" + "major refactor"
    const noBreakingChanges = pkg.constraints.technical.some(c =>
      c.toLowerCase().includes('no breaking') || c.toLowerCase().includes('backward')
    );
    const isMajorRefactor = pkg.task.description.toLowerCase().includes('refactor') &&
      (pkg.task.description.toLowerCase().includes('major') ||
        pkg.task.description.toLowerCase().includes('complete'));
    if (noBreakingChanges && isMajorRefactor) {
      conflicts.push('No breaking changes + major refactor may be incompatible');
    }

    // Check for conflicting scope
    // i[38]: Changed from substring to EXACT match only
    // Previous: "refactor" matched "major refactoring" via substring - false positive
    const scopeOverlap = pkg.task.scope.inScope.some(i =>
      pkg.task.scope.outOfScope.some(o =>
        i.toLowerCase().trim() === o.toLowerCase().trim()
      )
    );
    if (scopeOverlap) {
      conflicts.push('Scope overlap detected between inScope and outOfScope');
    }

    if (conflicts.length > 0) {
      return {
        fired: true,
        reason: `Found ${conflicts.length} potential constraint conflict(s)`,
        severity: conflicts.length > 1 ? 'critical' : 'high',
        details: { conflicts },
      };
    }

    return { fired: false, severity: 'low' };
  },
};

/**
 * HighRiskOperationTrigger: Fires for dangerous operations
 */
export const highRiskOperationTrigger: HumanSyncTrigger = {
  id: 'high_risk_operation',
  name: 'High Risk Operation Detection',
  priority: 10,
  check: (ctx) => {
    const request = ctx.rawRequest ?? ctx.task?.rawRequest ?? '';
    const requestLower = request.toLowerCase();

    const risks: string[] = [];

    // Destructive operations
    if (requestLower.includes('delete') && !requestLower.includes('undo')) {
      risks.push('Deletion operation detected');
    }
    if (requestLower.includes('drop') && (requestLower.includes('table') || requestLower.includes('database'))) {
      risks.push('Database drop operation detected');
    }
    if (requestLower.includes('remove all') || requestLower.includes('delete all')) {
      risks.push('Bulk deletion detected');
    }

    // Security-sensitive
    if (requestLower.includes('auth') || requestLower.includes('password') || requestLower.includes('credential')) {
      risks.push('Security-sensitive operation (authentication/credentials)');
    }
    if (requestLower.includes('admin') || requestLower.includes('root') || requestLower.includes('sudo')) {
      risks.push('Elevated privilege operation detected');
    }

    // Core system modifications
    if (requestLower.includes('core') && (requestLower.includes('change') || requestLower.includes('modify'))) {
      risks.push('Core system modification');
    }
    if (requestLower.includes('config') && (requestLower.includes('production') || requestLower.includes('prod'))) {
      risks.push('Production configuration change');
    }

    // Payment/financial
    if (requestLower.includes('payment') || requestLower.includes('billing') || requestLower.includes('charge')) {
      risks.push('Financial/payment operation');
    }

    if (risks.length > 0) {
      return {
        fired: true,
        reason: `High-risk operation(s) detected: ${risks.join('; ')}`,
        severity: 'critical',
        details: { risks },
      };
    }

    return { fired: false, severity: 'low' };
  },
};

/**
 * QualityThresholdTrigger: Fires when quality score is below threshold
 */
export const qualityThresholdTrigger: HumanSyncTrigger = {
  id: 'quality_threshold',
  name: 'Quality Threshold Check',
  priority: 7,
  check: (ctx) => {
    const score = ctx.qualityScore;
    if (score === undefined) return { fired: false, severity: 'low' };

    if (score < 40) {
      return {
        fired: true,
        reason: `Quality score critically low (${score}/100). Preparation may be insufficient.`,
        severity: 'critical',
        details: { score },
      };
    }

    if (score < 60) {
      return {
        fired: true,
        reason: `Quality score below threshold (${score}/100). Review before proceeding.`,
        severity: 'high',
        details: { score },
      };
    }

    if (score < 70) {
      return {
        fired: true,
        reason: `Quality score marginal (${score}/100). Consider reviewing preparation.`,
        severity: 'medium',
        details: { score },
      };
    }

    return { fired: false, severity: 'low' };
  },
};

/**
 * AmbiguousTargetTrigger: Fires when it's unclear what to modify
 */
export const ambiguousTargetTrigger: HumanSyncTrigger = {
  id: 'ambiguous_target',
  name: 'Ambiguous Target Detection',
  priority: 8,
  check: (ctx) => {
    const pkg = ctx.contextPackage;
    if (!pkg) return { fired: false, severity: 'low' };

    const issues: string[] = [];

    // No mustRead files but task involves modification
    const isModification = ['feature', 'bugfix', 'refactor'].includes(pkg.projectType);
    if (isModification && pkg.codeContext.mustRead.length === 0) {
      issues.push('No files identified to read/modify for this task');
    }

    // Architecture has no relevant components
    if (isModification && pkg.architecture.relevantComponents.length === 0) {
      issues.push('No relevant components identified in architecture');
    }

    // Task mentions specific file/function but not found
    // i[23]: Fixed false positive - exclude common words like "called", "named", etc.
    // i[34]: Fixed false positive - skip existence check for ADD/CREATE tasks
    const request = ctx.task?.rawRequest ?? '';
    
    // i[34]: Detect if this is an ADD task (creating something new)
    // Pattern: starts with "add" or contains "add a/an/and" before the type mention
    const isAddTask = /^add\b/i.test(request.trim()) ||
                      /\badd\s+(a|an|and\s+export)\s+/i.test(request);
    const isCreateTask = /^create\b/i.test(request.trim()) ||
                         /\bcreate\s+(a|an)\s+/i.test(request);
    const isNewThingTask = isAddTask || isCreateTask;

    // i[38]: Detect REFACTOR tasks - function names won't match file paths
    const isRefactorTask = pkg.projectType === 'refactor' ||
                           /\b(rename|refactor|extract|move)\b/i.test(request);

    // i[38]: Check if an explicit file path is mentioned and is in mustRead
    // Pattern: "in src/types.ts" or "from src/state.ts"
    const explicitFileMatch = /\b(?:in|from|to|at)\s+(src\/[\w\-./]+\.\w+)/i.exec(request);
    const hasExplicitFileInMustRead = explicitFileMatch && pkg.codeContext.mustRead.some(f => {
      const normalizedPath = f.path.replace(/^.*\//, '').toLowerCase();
      const targetFile = explicitFileMatch[1].split('/').pop()?.toLowerCase();
      return normalizedPath === targetFile || f.path.toLowerCase().includes(explicitFileMatch[1].toLowerCase());
    });

    const mentionsSpecific = /\b(file|function|class|method|component)\s+(\w+)/i.exec(request);
    if (mentionsSpecific) {
      const mentionedName = mentionsSpecific[2].toLowerCase();
      // Skip common verbs/words that aren't actual names
      // i[38]: Added 'working', 'exactly', 'before' to prevent false positives
      const commonWords = ['called', 'named', 'defined', 'that', 'which', 'the', 'a', 'an', 'to', 'for', 'with', 'from', 'is', 'are', 'was', 'were', 'will', 'would', 'should', 'can', 'could', 'like', 'new', 'add', 'create', 'simple', 'basic', 'helper', 'utility', 'working', 'exactly', 'before'];
      if (!commonWords.includes(mentionedName)) {
        // i[34]: For ADD/CREATE tasks, the target WON'T exist in codeContext - that's expected!
        // i[38]: For REFACTOR tasks with explicit file paths, the FUNCTION name won't be in the PATH - that's expected!
        // Only fire the "not found" warning for MODIFY/FIX tasks where target should exist
        if (!isNewThingTask && !(isRefactorTask && hasExplicitFileInMustRead)) {
          const foundInMustRead = pkg.codeContext.mustRead.some(f =>
            f.path.toLowerCase().includes(mentionedName)
          );
          if (!foundInMustRead) {
            issues.push(`Task mentions "${mentionsSpecific[2]}" but not found in codeContext`);
          }
        }
      }
    }

    if (issues.length > 0) {
      return {
        fired: true,
        reason: `Ambiguous target: ${issues.join('; ')}`,
        severity: issues.length > 1 ? 'high' : 'medium',
        details: { issues },
      };
    }

    return { fired: false, severity: 'low' };
  },
};

// ============================================================================
// Human Sync Service
// ============================================================================

export class HumanSyncService {
  private instanceId: string;
  private triggers: HumanSyncTrigger[];
  private pendingRequests: Map<string, HumanSyncRequest>;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    this.triggers = [
      vagueTaskTrigger,
      conflictingConstraintsTrigger,
      highRiskOperationTrigger,
      qualityThresholdTrigger,
      ambiguousTargetTrigger,
    ];
    this.pendingRequests = new Map();
  }

  /**
   * Add a custom trigger
   */
  addTrigger(trigger: HumanSyncTrigger): void {
    this.triggers.push(trigger);
    this.triggers.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Run all triggers against context
   * Returns fired triggers sorted by priority
   */
  checkTriggers(context: TriggerContext): Array<{
    trigger: HumanSyncTrigger;
    result: TriggerResult;
  }> {
    const results: Array<{ trigger: HumanSyncTrigger; result: TriggerResult }> = [];

    for (const trigger of this.triggers) {
      try {
        const result = trigger.check(context);
        if (result.fired) {
          results.push({ trigger, result });
        }
      } catch (err) {
        console.error(`[HumanSync] Trigger ${trigger.id} threw error:`, err);
      }
    }

    // Already sorted by priority since triggers are pre-sorted
    return results;
  }

  /**
   * Generate a question from fired triggers
   */
  generateQuestion(
    firedTriggers: Array<{ trigger: HumanSyncTrigger; result: TriggerResult }>,
    context: TriggerContext
  ): GeneratedQuestion {
    if (firedTriggers.length === 0) {
      throw new Error('No triggers fired - cannot generate question');
    }

    // Get the highest priority trigger
    const primary = firedTriggers[0];
    const triggerId = primary.trigger.id;
    const triggerIds = firedTriggers.map(t => t.trigger.id);

    // Generate question based on trigger type
    switch (triggerId) {
      case 'vague_task':
        return this.generateVagueTaskQuestion(context, firedTriggers);

      case 'high_risk_operation':
        return this.generateHighRiskQuestion(context, primary);

      case 'conflicting_constraints':
        return this.generateConflictQuestion(context, primary);

      case 'quality_threshold':
        return this.generateQualityQuestion(context, primary);

      case 'ambiguous_target':
        return this.generateAmbiguousTargetQuestion(context, primary);

      default:
        return this.generateGenericQuestion(context, firedTriggers);
    }
  }

  private generateVagueTaskQuestion(
    context: TriggerContext,
    triggers: Array<{ trigger: HumanSyncTrigger; result: TriggerResult }>
  ): GeneratedQuestion {
    const request = context.rawRequest ?? context.task?.rawRequest ?? '';
    const details = triggers[0].result.details;

    return {
      question: 'The task description needs clarification. Can you provide more detail?',
      context: `Current request: "${request}"\n\nIssue: ${triggers[0].result.reason}`,
      options: [
        {
          id: 'expand',
          label: 'Let me expand on this',
          description: 'Provide a more detailed description of what needs to be done',
          impact: 'Will restart preparation with new description',
        },
        {
          id: 'example',
          label: 'Here\'s an example of what I want',
          description: 'Provide an example of the desired outcome',
          impact: 'Will use example to guide implementation',
        },
        {
          id: 'proceed',
          label: 'Proceed with best guess',
          description: 'Let The Forge make reasonable assumptions',
          impact: 'May require revision if assumptions are wrong',
        },
      ],
      allowFreeform: true,
      urgency: triggers[0].result.severity === 'critical' ? 'critical' : 'high',
      triggeredBy: triggers.map(t => t.trigger.id),
    };
  }

  private generateHighRiskQuestion(
    context: TriggerContext,
    primary: { trigger: HumanSyncTrigger; result: TriggerResult }
  ): GeneratedQuestion {
    const risks = (primary.result.details?.risks as string[]) ?? [];
    const request = context.rawRequest ?? context.task?.rawRequest ?? '';

    return {
      question: 'This task involves high-risk operations. Do you want to proceed?',
      context: `Request: "${request}"\n\nIdentified risks:\n${risks.map(r => `• ${r}`).join('\n')}`,
      options: [
        {
          id: 'proceed_careful',
          label: 'Proceed with extra caution',
          description: 'Execute with additional validation steps and confirmations',
          impact: 'Slower execution, more checkpoints',
        },
        {
          id: 'proceed_fast',
          label: 'Proceed normally',
          description: 'I understand the risks and want to proceed without extra checks',
          impact: 'Normal execution speed',
        },
        {
          id: 'modify_scope',
          label: 'Modify the scope',
          description: 'Let me reduce the scope to avoid some risks',
          impact: 'Will restart preparation with modified request',
        },
        {
          id: 'abort',
          label: 'Abort task',
          description: 'Cancel this task entirely',
          impact: 'Task will be marked as cancelled',
        },
      ],
      allowFreeform: false,
      urgency: 'critical',
      triggeredBy: [primary.trigger.id],
    };
  }

  private generateConflictQuestion(
    context: TriggerContext,
    primary: { trigger: HumanSyncTrigger; result: TriggerResult }
  ): GeneratedQuestion {
    const conflicts = (primary.result.details?.conflicts as string[]) ?? [];

    return {
      question: 'There appear to be conflicting requirements. Which should take priority?',
      context: `Detected conflicts:\n${conflicts.map(c => `• ${c}`).join('\n')}`,
      options: [
        {
          id: 'first_priority',
          label: 'Prioritize first constraint',
          description: `Prioritize: ${conflicts[0]?.split(' ')[0] ?? 'first'} requirement`,
          impact: 'May sacrifice second constraint',
        },
        {
          id: 'balance',
          label: 'Try to balance both',
          description: 'Attempt to satisfy both constraints with compromises',
          impact: 'May result in suboptimal solution for both',
        },
        {
          id: 'clarify',
          label: 'Let me clarify',
          description: 'Provide more context about the actual requirements',
          impact: 'Will update constraints before proceeding',
        },
      ],
      allowFreeform: true,
      urgency: 'high',
      triggeredBy: [primary.trigger.id],
    };
  }

  private generateQualityQuestion(
    context: TriggerContext,
    primary: { trigger: HumanSyncTrigger; result: TriggerResult }
  ): GeneratedQuestion {
    const score = primary.result.details?.score as number;

    return {
      question: `Preparation quality score is ${score}/100. How should we proceed?`,
      context: `The preparation may be insufficient for good execution.\n\nReason: ${primary.result.reason}`,
      options: [
        {
          id: 'improve',
          label: 'Improve preparation',
          description: 'Spend more time on preparation before execution',
          impact: 'Better quality but longer time',
        },
        {
          id: 'execute_anyway',
          label: 'Execute anyway',
          description: 'Proceed with current preparation',
          impact: 'Faster but may need revision',
        },
        {
          id: 'add_context',
          label: 'I\'ll add context',
          description: 'Provide additional information to improve preparation',
          impact: 'Will incorporate new context',
        },
      ],
      allowFreeform: true,
      urgency: score < 40 ? 'critical' : score < 60 ? 'high' : 'medium',
      triggeredBy: [primary.trigger.id],
    };
  }

  private generateAmbiguousTargetQuestion(
    context: TriggerContext,
    primary: { trigger: HumanSyncTrigger; result: TriggerResult }
  ): GeneratedQuestion {
    const issues = (primary.result.details?.issues as string[]) ?? [];

    return {
      question: 'Unable to identify what files/components to modify. Can you help clarify?',
      context: `Issues found:\n${issues.map(i => `• ${i}`).join('\n')}`,
      options: [
        {
          id: 'specify_files',
          label: 'I\'ll specify the files',
          description: 'Provide explicit file paths to modify',
          impact: 'Direct guidance for execution',
        },
        {
          id: 'specify_component',
          label: 'I\'ll specify the component',
          description: 'Point to the general area/module',
          impact: 'Will search within that area',
        },
        {
          id: 'let_forge_decide',
          label: 'Let The Forge decide',
          description: 'Use best judgment to find the right location',
          impact: 'May create new files if nothing found',
        },
      ],
      allowFreeform: true,
      urgency: 'high',
      triggeredBy: [primary.trigger.id],
    };
  }

  private generateGenericQuestion(
    context: TriggerContext,
    triggers: Array<{ trigger: HumanSyncTrigger; result: TriggerResult }>
  ): GeneratedQuestion {
    const reasons = triggers.map(t => t.result.reason).filter(Boolean);

    return {
      question: 'Human input needed before proceeding. How would you like to continue?',
      context: `Issues detected:\n${reasons.map(r => `• ${r}`).join('\n')}`,
      options: [
        {
          id: 'proceed',
          label: 'Proceed anyway',
          description: 'Continue with current understanding',
          impact: 'May need revision later',
        },
        {
          id: 'clarify',
          label: 'Let me clarify',
          description: 'Provide additional context',
          impact: 'Will incorporate feedback',
        },
        {
          id: 'abort',
          label: 'Abort',
          description: 'Cancel this task',
          impact: 'Task will be cancelled',
        },
      ],
      allowFreeform: true,
      urgency: triggers[0]?.result.severity ?? 'medium',
      triggeredBy: triggers.map(t => t.trigger.id),
    };
  }

  /**
   * Create a HumanSyncRequest from a generated question
   *
   * i[17] update: Now persists to Mandrel for retrieval by --respond command.
   * This closes the Human Sync loop - requests survive CLI restarts.
   */
  async createRequest(
    taskId: string,
    question: GeneratedQuestion,
    trigger: HumanSyncRequest['trigger']
  ): Promise<HumanSyncRequest> {
    const request: HumanSyncRequest = {
      id: randomUUID(),
      taskId,
      created: new Date(),
      trigger,
      question: question.question,
      context: question.context,
      options: question.options.map(o => ({
        label: o.label,
        description: o.description,
      })),
    };

    // Store in memory (for backward compatibility during session)
    this.pendingRequests.set(request.id, request);

    // i[17]: Persist to Mandrel for cross-session retrieval
    // This is the key change that enables the --respond command to work
    await saveRequestToMandrel(request, question);

    // Also store human-readable version for context (legacy format)
    await mandrel.storeContext(
      `Human Sync Request created:\n` +
      `Request ID: ${request.id}\n` +
      `Task: ${taskId}\n` +
      `Trigger: ${trigger}\n` +
      `Question: ${question.question}\n` +
      `Context: ${question.context}\n` +
      `Options: ${question.options.map(o => `[${o.id}] ${o.label}`).join(', ')}\n` +
      `Urgency: ${question.urgency}\n\n` +
      `To respond, run:\n` +
      `  npx tsx src/index.ts --respond ${request.id} <option-id> [--notes "..."]`,
      'discussion',
      ['human-sync', 'request', trigger, `urgency-${question.urgency}`]
    );

    return request;
  }

  /**
   * Process a human response
   */
  async processResponse(
    requestId: string,
    selectedOption: string,
    additionalNotes?: string
  ): Promise<{
    success: boolean;
    action: 'proceed' | 'modify' | 'abort' | 'retry';
    modifications?: Record<string, unknown>;
  }> {
    const request = this.pendingRequests.get(requestId);
    if (!request) {
      return { success: false, action: 'abort' };
    }

    // Update request with response
    request.response = {
      selectedOption,
      additionalNotes,
      timestamp: new Date(),
    };

    // Store response to Mandrel
    await mandrel.storeContext(
      `Human Sync Response received:\n` +
      `Request: ${requestId}\n` +
      `Task: ${request.taskId}\n` +
      `Selected: ${selectedOption}\n` +
      `Notes: ${additionalNotes ?? 'none'}`,
      'decision',
      ['human-sync', 'response', selectedOption]
    );

    // Determine action based on response
    const optionLower = selectedOption.toLowerCase();

    if (optionLower.includes('abort') || optionLower.includes('cancel')) {
      return { success: true, action: 'abort' };
    }

    if (optionLower.includes('proceed') || optionLower.includes('execute')) {
      return {
        success: true,
        action: 'proceed',
        modifications: additionalNotes ? { additionalContext: additionalNotes } : undefined,
      };
    }

    if (optionLower.includes('clarify') || optionLower.includes('expand') || optionLower.includes('specify')) {
      return {
        success: true,
        action: 'modify',
        modifications: {
          clarification: additionalNotes,
          needsRePrepare: true,
        },
      };
    }

    // Default: proceed with modifications
    return {
      success: true,
      action: 'proceed',
      modifications: additionalNotes ? { humanInput: additionalNotes } : undefined,
    };
  }

  /**
   * Get pending request by ID
   */
  getPendingRequest(requestId: string): HumanSyncRequest | undefined {
    return this.pendingRequests.get(requestId);
  }

  /**
   * Get all pending requests for a task
   */
  getPendingRequestsForTask(taskId: string): HumanSyncRequest[] {
    return Array.from(this.pendingRequests.values()).filter(r => r.taskId === taskId);
  }

  /**
   * High-level: Check if task needs human sync and generate request if so
   */
  async evaluateTask(
    taskId: string,
    context: TriggerContext
  ): Promise<{
    needsSync: boolean;
    request?: HumanSyncRequest;
    question?: GeneratedQuestion;
    firedTriggers: Array<{ trigger: HumanSyncTrigger; result: TriggerResult }>;
  }> {
    // Run all triggers
    const firedTriggers = this.checkTriggers(context);

    if (firedTriggers.length === 0) {
      return { needsSync: false, firedTriggers: [] };
    }

    // Generate question
    const question = this.generateQuestion(firedTriggers, context);

    // Map trigger type to HumanSyncRequest trigger
    const triggerType = this.mapTriggerType(firedTriggers[0].trigger.id);

    // Create request
    const request = await this.createRequest(taskId, question, triggerType);

    console.log(`[HumanSync] Created request ${request.id} for task ${taskId}`);
    console.log(`[HumanSync] Triggers fired: ${firedTriggers.map(t => t.trigger.name).join(', ')}`);
    console.log(`[HumanSync] Question: ${question.question}`);

    return {
      needsSync: true,
      request,
      question,
      firedTriggers,
    };
  }

  private mapTriggerType(triggerId: string): HumanSyncRequest['trigger'] {
    switch (triggerId) {
      case 'vague_task':
      case 'ambiguous_target':
        return 'ambiguity';
      case 'conflicting_constraints':
        return 'escalation';
      case 'high_risk_operation':
        return 'checkpoint';
      case 'quality_threshold':
        return 'escalation';
      default:
        return 'ambiguity';
    }
  }
}

// Factory function
export function createHumanSyncService(instanceId: string): HumanSyncService {
  return new HumanSyncService(instanceId);
}

// Export triggers for extension
export const builtInTriggers = {
  vagueTaskTrigger,
  conflictingConstraintsTrigger,
  highRiskOperationTrigger,
  qualityThresholdTrigger,
  ambiguousTargetTrigger,
};

// ============================================================================
// Request Persistence (i[17] addition)
// ============================================================================

/**
 * Save a HumanSyncRequest to Mandrel for persistence across CLI invocations.
 *
 * i[17]: This closes the Human Sync loop. Previously, requests were only
 * stored in-memory and lost when the CLI exited. Now they persist to Mandrel
 * and can be retrieved by ID for response processing.
 */
export async function saveRequestToMandrel(
  request: HumanSyncRequest,
  question: GeneratedQuestion
): Promise<{ success: boolean; id?: string }> {
  // Store as structured JSON with special tags for retrieval
  const payload = {
    request: {
      id: request.id,
      taskId: request.taskId,
      created: request.created.toISOString(),
      trigger: request.trigger,
      question: request.question,
      context: request.context,
      options: request.options,
    },
    question: {
      question: question.question,
      context: question.context,
      options: question.options,
      allowFreeform: question.allowFreeform,
      urgency: question.urgency,
      triggeredBy: question.triggeredBy,
    },
    status: 'pending', // Will be updated when response received
  };

  const result = await mandrel.storeContext(
    `HUMAN_SYNC_REQUEST_JSON:${JSON.stringify(payload)}`,
    'discussion',
    ['human-sync-request', 'pending', `request-${request.id}`, `task-${request.taskId}`]
  );

  return result;
}

/**
 * Load a HumanSyncRequest from Mandrel by its ID.
 *
 * i[17]: This enables the --respond command to retrieve the original request
 * context, understand what was asked, and process the user's response.
 */
export async function loadRequestFromMandrel(requestId: string): Promise<{
  success: boolean;
  request?: HumanSyncRequest;
  question?: GeneratedQuestion;
  error?: string;
}> {
  // i[17]: Search for the JSON-formatted request specifically
  // Using the request ID in the query to find the right context
  const searchQuery = `HUMAN_SYNC_REQUEST_JSON request-${requestId}`;
  const searchResults = await mandrel.searchContext(searchQuery, 10);

  if (!searchResults) {
    return { success: false, error: 'Request not found in Mandrel' };
  }

  // Extract context IDs from search results
  const ids = mandrel.extractIdsFromSearchResults(searchResults);
  console.log(`[HumanSync] Found ${ids.length} potential matches`);

  if (ids.length === 0) {
    return { success: false, error: 'No matching request found' };
  }

  // Try each ID until we find the right JSON-formatted request
  for (const id of ids) {
    const context = await mandrel.getContextById(id);

    if (context.success && context.content) {
      // Parse the JSON payload from the content
      const jsonMatch = context.content.match(/HUMAN_SYNC_REQUEST_JSON:([\s\S]+)/);

      if (jsonMatch) {
        try {
          const payload = JSON.parse(jsonMatch[1]);

          // Verify this is the right request by checking the ID
          if (payload.request?.id !== requestId) {
            console.log(`[HumanSync] Found different request ${payload.request?.id}, continuing...`);
            continue;
          }

          // Reconstruct the HumanSyncRequest
          const request: HumanSyncRequest = {
            id: payload.request.id,
            taskId: payload.request.taskId,
            created: new Date(payload.request.created),
            trigger: payload.request.trigger,
            question: payload.request.question,
            context: payload.request.context,
            options: payload.request.options,
          };

          // Reconstruct the GeneratedQuestion
          const question: GeneratedQuestion = {
            question: payload.question.question,
            context: payload.question.context,
            options: payload.question.options,
            allowFreeform: payload.question.allowFreeform,
            urgency: payload.question.urgency,
            triggeredBy: payload.question.triggeredBy,
          };

          console.log(`[HumanSync] Successfully loaded request ${requestId}`);
          return { success: true, request, question };
        } catch (parseError) {
          console.error('[HumanSync] Failed to parse stored request:', parseError);
        }
      }
    }
  }

  return { success: false, error: 'Could not find or parse stored request' };
}

/**
 * Mark a request as responded in Mandrel.
 *
 * i[17]: After processing a response, we store the completion record
 * so the learning system can see what decisions were made.
 */
export async function markRequestResponded(
  requestId: string,
  taskId: string,
  selectedOption: string,
  action: 'proceed' | 'modify' | 'abort' | 'retry',
  additionalNotes?: string
): Promise<void> {
  await mandrel.storeContext(
    `Human Sync Response Processed:\n` +
    `Request ID: ${requestId}\n` +
    `Task ID: ${taskId}\n` +
    `Selected Option: ${selectedOption}\n` +
    `Action: ${action}\n` +
    `Notes: ${additionalNotes ?? 'none'}\n` +
    `Processed: ${new Date().toISOString()}`,
    'decision',
    ['human-sync-response', 'processed', `request-${requestId}`, `task-${taskId}`, `action-${action}`]
  );
}
