/**
 * Forge Engine Types
 *
 * Implements the ContextPackage schema from SIRK Pass #1
 * with runtime validation via Zod.
 */

import { z } from 'zod';

// ============================================================================
// Project Types (from i[1] taxonomy)
// ============================================================================

export const ProjectType = z.enum([
  'feature',    // Add capability to existing system
  'bugfix',     // Fix specific broken behavior
  'greenfield', // New project from scratch
  'refactor',   // Change structure, not behavior
  'research',   // Exploratory work
]);
export type ProjectType = z.infer<typeof ProjectType>;

// ============================================================================
// Task State Machine
// ============================================================================

export const TaskState = z.enum([
  'intake',           // Just received, not classified
  'classified',       // Plant Manager classified it
  'preparing',        // Preparation Department working
  'prepared',         // ContextPackage ready
  'executing',        // Execution Department working
  'reviewing',        // Quality Department reviewing
  'documenting',      // Documentation Department working
  'completed',        // All done
  'blocked',          // Needs human intervention
  'failed',           // Unrecoverable error
]);
export type TaskState = z.infer<typeof TaskState>;

// ============================================================================
// Context Package Schema (from i[1], validated)
// ============================================================================

export const ContextPackage = z.object({
  // Metadata
  id: z.string().uuid(),
  projectType: ProjectType,
  created: z.date(),
  preparedBy: z.string(), // Instance ID (e.g., "i[2]")

  // The Task
  task: z.object({
    description: z.string().min(1),
    acceptanceCriteria: z.array(z.string()),
    scope: z.object({
      inScope: z.array(z.string()),
      outOfScope: z.array(z.string()),
    }),
  }),

  // Architectural Context
  architecture: z.object({
    overview: z.string(),
    relevantComponents: z.array(z.object({
      name: z.string(),
      purpose: z.string(),
      location: z.string(), // file path or directory
      entryPoints: z.array(z.string()).optional(),
    })),
    dataFlow: z.string().optional(),
    dependencies: z.array(z.string()),
  }),

  // Code Context
  codeContext: z.object({
    mustRead: z.array(z.object({
      path: z.string(),
      reason: z.string(),
      focus: z.string().optional(), // specific function/section
    })),
    mustNotModify: z.array(z.object({
      path: z.string(),
      reason: z.string(),
    })),
    relatedExamples: z.array(z.object({
      path: z.string(),
      similarity: z.string(),
    })),
  }),

  // Patterns and Conventions
  patterns: z.object({
    namingConventions: z.string(),
    fileOrganization: z.string(),
    testingApproach: z.string(),
    errorHandling: z.string(),
    codeStyle: z.array(z.string()),
  }),

  // Constraints
  constraints: z.object({
    technical: z.array(z.string()),
    quality: z.array(z.string()),
    timeline: z.string().nullable(),
  }),

  // Known Risks
  risks: z.array(z.object({
    description: z.string(),
    mitigation: z.string(),
  })),

  // Previous Attempts (learning from history)
  history: z.object({
    previousAttempts: z.array(z.object({
      what: z.string(),
      result: z.string(),
      lesson: z.string(),
    })),
    // HARDENING-8/9: Accept multiple formats from LLM, normalize to { decision, rationale }
    // LLM may return: { decision, rationale }, { title, decision, rationale }, { title, rationale }, or plain string
    relatedDecisions: z.array(
      z.union([
        // Format 1: Has 'decision' field - extract decision + rationale, ignore extras
        z.object({
          decision: z.string(),
          rationale: z.string().default('No rationale provided'),
        }).passthrough().transform((obj) => ({ decision: obj.decision, rationale: obj.rationale })),
        // Format 2: Has 'title' but no 'decision' - use title as decision
        z.object({
          title: z.string(),
          rationale: z.string().default('No rationale provided'),
        }).transform((obj) => ({ decision: obj.title, rationale: obj.rationale })),
        // Format 3: Plain string - convert to object
        z.string().transform((s) => ({ decision: s, rationale: 'No rationale provided' })),
      ])
    ),
  }),

  // Human Sync Points
  humanSync: z.object({
    requiredBefore: z.array(z.string()), // Actions requiring human approval
    ambiguities: z.array(z.string()),    // Unresolved questions
  }),
});
export type ContextPackage = z.infer<typeof ContextPackage>;

// ============================================================================
// Task Object (what flows through the system)
// ============================================================================

export const ForgeTask = z.object({
  id: z.string().uuid(),
  state: TaskState,
  created: z.date(),
  updated: z.date(),

  // Original request
  rawRequest: z.string(),

  // After classification (by Plant Manager)
  classification: z.object({
    projectType: ProjectType,
    scope: z.enum(['small', 'medium', 'large']),
    department: z.enum(['preparation', 'r_and_d', 'execution', 'quality', 'documentation']),
    confidence: z.number().min(0).max(1),
  }).optional(),

  // After preparation
  contextPackage: ContextPackage.optional(),

  // Execution result
  executionResult: z.object({
    success: z.boolean(),
    filesCreated: z.array(z.string()),
    filesModified: z.array(z.string()),
    testsPassed: z.boolean().optional(),
    notes: z.string().optional(),
  }).optional(),

  // Quality review
  qualityResult: z.object({
    passed: z.boolean(),
    checks: z.array(z.object({
      check: z.string(),
      passed: z.boolean(),
      notes: z.string().optional(),
    })),
  }).optional(),

  // Error/escalation info
  escalation: z.object({
    reason: z.string(),
    fromDepartment: z.string(),
    suggestedAction: z.string(),
  }).optional(),

  // Trace of state transitions
  stateHistory: z.array(z.object({
    from: TaskState,
    to: TaskState,
    timestamp: z.date(),
    actor: z.string(), // who made the transition
    reason: z.string().optional(),
  })),
});
export type ForgeTask = z.infer<typeof ForgeTask>;

// ============================================================================
// Department Messages (inter-department communication)
// ============================================================================

export const DepartmentMessage = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('handoff'),
    from: z.string(),
    to: z.string(),
    taskId: z.string().uuid(),
    payload: z.unknown(),
  }),
  z.object({
    type: z.literal('escalation'),
    from: z.string(),
    taskId: z.string().uuid(),
    reason: z.string(),
    context: z.unknown(),
    suggestedOptions: z.array(z.string()),
  }),
  z.object({
    type: z.literal('feedback'),
    from: z.string(),
    to: z.string(),
    taskId: z.string().uuid(),
    feedback: z.string(),
    retry: z.boolean(),
  }),
]);
export type DepartmentMessage = z.infer<typeof DepartmentMessage>;

// ============================================================================
// Human Sync Request (when human intervention needed)
// ============================================================================

export const HumanSyncRequest = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  created: z.date(),
  trigger: z.enum([
    'low_confidence',      // Classification confidence < threshold
    'ambiguity',           // Unresolved question
    'escalation',          // Department escalated
    'checkpoint',          // Planned human sync point
    'cost_threshold',      // About to exceed cost limit
  ]),
  question: z.string(),
  context: z.string(),
  options: z.array(z.object({
    label: z.string(),
    description: z.string(),
  })),
  response: z.object({
    selectedOption: z.string(),
    additionalNotes: z.string().optional(),
    timestamp: z.date(),
  }).optional(),
});
export type HumanSyncRequest = z.infer<typeof HumanSyncRequest>;

// ============================================================================
// Execution Feedback (for learning loop)
// ============================================================================

/**
 * Captures the results of executing a ContextPackage.
 * This is the feedback signal that enables compound learning.
 *
 * Key insight from i[4]: Without feedback, preparations repeat mistakes.
 * This schema captures what actually happened vs what was predicted,
 * enabling future preparations to learn from past executions.
 */
export const ExecutionFeedback = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  contextPackageId: z.string().uuid(),
  executedBy: z.string(), // Instance ID (e.g., "i[4]")
  timestamp: z.date(),

  // What actually happened
  outcome: z.object({
    success: z.boolean(),
    filesActuallyModified: z.array(z.string()),
    filesActuallyRead: z.array(z.string()),
    testsRan: z.boolean(),
    testsPassed: z.boolean().optional(),
    compilationPassed: z.boolean(),
    executionTimeMs: z.number().optional(),
  }),

  // Delta from prediction (the learning signal)
  accuracy: z.object({
    // Files that were predicted vs actually needed
    mustReadAccuracy: z.object({
      predicted: z.array(z.string()),   // From ContextPackage.codeContext.mustRead
      actual: z.array(z.string()),      // What was actually read
      missed: z.array(z.string()),      // Needed but not predicted
      unnecessary: z.array(z.string()), // Predicted but not needed
    }),
    // Pattern accuracy
    patternsFollowed: z.array(z.string()),
    patternsViolated: z.array(z.object({
      pattern: z.string(),
      violation: z.string(),
      reason: z.string().optional(),
    })),
  }),

  // Learnings (synthesized insights)
  learnings: z.array(z.object({
    type: z.enum(['insight', 'correction', 'pattern', 'warning']),
    content: z.string(),
    tags: z.array(z.string()),
  })),

  // Human feedback (optional - from Quality Gate)
  humanFeedback: z.object({
    approved: z.boolean(),
    comments: z.string().optional(),
    corrections: z.array(z.string()),
  }).optional(),
});
export type ExecutionFeedback = z.infer<typeof ExecutionFeedback>;

// ============================================================================
// Historical Context (retrieved from Mandrel for preparation)
// ============================================================================

/**
 * Context retrieved from Mandrel to inform preparation.
 * This is what LearningRetriever produces.
 */
export const HistoricalContext = z.object({
  // Previous attempts at similar tasks
  previousAttempts: z.array(z.object({
    taskDescription: z.string(),
    outcome: z.enum(['success', 'partial', 'failed']),
    keyFiles: z.array(z.string()),
    lesson: z.string(),
    relevanceScore: z.number(), // Semantic similarity to current task
  })),

  // Related decisions made in this project
  relatedDecisions: z.array(z.object({
    title: z.string(),
    decision: z.string(),
    rationale: z.string().default('No rationale provided'),  // HARDENING-8
    tags: z.array(z.string()).default([]),  // HARDENING-8
  })),

  // Patterns that worked or failed
  patternHistory: z.array(z.object({
    pattern: z.string(),
    successRate: z.number(), // 0-1
    lastUsed: z.date(),
    context: z.string(),
  })),

  // Files frequently modified together (co-modification patterns)
  coModificationPatterns: z.array(z.object({
    files: z.array(z.string()),
    frequency: z.number(),
    typicalTask: z.string(),
  })),
});
export type HistoricalContext = z.infer<typeof HistoricalContext>;

// ============================================================================
// Failure Taxonomy (i[26] contribution - Root Cause Analysis Enhancement)
// ============================================================================

/**
 * i[26]: Structured failure taxonomy to eliminate "unknown failure" category.
 *
 * The Problem: 57% of failures were "unknown_failure" because we used text
 * parsing to categorize errors. This prevents learning from failures.
 *
 * The Solution: Explicit failure phases and codes. Every execution failure
 * MUST be tagged with exactly one phase and one code. This enables:
 * 1. Accurate failure mode analysis
 * 2. Targeted improvements (fix the phase that fails most)
 * 3. Trend tracking over time
 */

/**
 * Execution phases - where in the pipeline did we fail?
 */
export const FailurePhase = z.enum([
  'preparation',     // Context package assembly
  'code_generation', // LLM generates code
  'file_operation',  // Writing/editing files
  'compilation',     // TypeScript/build check
  'validation',      // Custom validation tools
  'infrastructure',  // System errors, timeouts, API failures
]);
export type FailurePhase = z.infer<typeof FailurePhase>;

/**
 * Failure codes - specific, actionable failure reasons.
 * Each code maps to a specific phase and has a clear remediation path.
 */
export const FailureCode = z.enum([
  // Preparation failures
  'prep_insufficient_context',
  'prep_wrong_files',
  'prep_missing_dependencies',

  // Code generation failures
  'codegen_no_output',
  'codegen_invalid_format',
  'codegen_tool_not_called',
  'codegen_wrong_action',

  // File operation failures
  'file_not_found',
  'file_write_error',
  'file_edit_no_match',
  'file_permission_error',

  // Compilation failures
  'compile_syntax_error',
  'compile_type_error',
  'compile_import_error',
  'compile_module_not_found',

  // Validation failures
  'validation_test_failed',
  'validation_not_run',
  'validation_timeout',

  // Infrastructure failures
  'infra_api_error',
  'infra_timeout',
  'infra_network_error',
  'infra_out_of_memory',
  'infra_unknown',
]);
export type FailureCode = z.infer<typeof FailureCode>;

/**
 * Structured failure record.
 * Every failed execution MUST produce one of these.
 */
export const StructuredFailure = z.object({
  phase: FailurePhase,
  code: FailureCode,
  message: z.string(),
  details: z.string().optional(),
  recoverable: z.boolean(),
  suggestedFix: z.string().optional(),
});
export type StructuredFailure = z.infer<typeof StructuredFailure>;

/**
 * Enhanced execution result with structured failure.
 */
export const ForgeRunResult = z.object({
  runId: z.string().uuid(),
  taskId: z.string().uuid(),
  timestamp: z.date(),
  executedBy: z.string(),
  outcome: z.enum(['success', 'failure']),
  failure: StructuredFailure.optional(),
  timings: z.object({
    totalMs: z.number(),
    codeGenerationMs: z.number().optional(),
    fileOperationMs: z.number().optional(),
    compilationMs: z.number().optional(),
    validationMs: z.number().optional(),
  }).optional(),
  filesCreated: z.array(z.string()),
  filesModified: z.array(z.string()),
  filesRead: z.array(z.string()),
});
export type ForgeRunResult = z.infer<typeof ForgeRunResult>;

/**
 * Helper to create a StructuredFailure from common error patterns.
 */
// ============================================================================
// Benchmark Configuration
// ============================================================================

export interface BenchmarkConfig {
  taskCount: number;
  timeout: number;
  verbose: boolean;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format a timestamp as ISO date string (YYYY-MM-DD)
 */
export function formatTimestamp(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Simple greeting function
 * 
 * @param name - The name to greet
 * @returns A greeting message
 */
export function greetUser(name: string): string {
  return `Hello, ${name}! Welcome to The Forge Development Cognition System.`;
}

export function classifyFailure(
  errorMessage: string,
  phase: FailurePhase,
  details?: string
): StructuredFailure {
  const msg = errorMessage.toLowerCase();

  if (phase === 'compilation') {
    if (msg.includes('cannot find module')) {
      return { phase, code: 'compile_module_not_found', message: errorMessage, details, recoverable: true, suggestedFix: 'Ensure dependencies are installed' };
    }
    if (msg.includes('error ts2307')) {
      return { phase, code: 'compile_import_error', message: errorMessage, details, recoverable: true, suggestedFix: 'Add missing import' };
    }
    if (msg.match(/error ts2\d{3}/)) {
      return { phase, code: 'compile_type_error', message: errorMessage, details, recoverable: true, suggestedFix: 'Fix type mismatch' };
    }
    if (msg.includes('syntax error') || msg.includes('unexpected token')) {
      return { phase, code: 'compile_syntax_error', message: errorMessage, details, recoverable: true, suggestedFix: 'Fix syntax error' };
    }
  }

  if (phase === 'file_operation') {
    if (msg.includes('not found') || msg.includes('no such file')) {
      return { phase, code: 'file_not_found', message: errorMessage, details, recoverable: false, suggestedFix: 'Verify file path exists' };
    }
    if (msg.includes('search string not found')) {
      return { phase, code: 'file_edit_no_match', message: errorMessage, details, recoverable: true, suggestedFix: 'Provide more context for exact text matching' };
    }
    if (msg.includes('permission denied') || msg.includes('eacces')) {
      return { phase, code: 'file_permission_error', message: errorMessage, details, recoverable: false };
    }
  }

  if (phase === 'code_generation') {
    if (msg.includes('no tool') || msg.includes('did not call')) {
      return { phase, code: 'codegen_tool_not_called', message: errorMessage, details, recoverable: true };
    }
    if (msg.includes('json') || msg.includes('parse')) {
      return { phase, code: 'codegen_invalid_format', message: errorMessage, details, recoverable: true };
    }
  }

  if (phase === 'validation') {
    if (msg.includes('timeout')) {
      return { phase, code: 'validation_timeout', message: errorMessage, details, recoverable: true };
    }
    if (msg.includes('failed')) {
      return { phase, code: 'validation_test_failed', message: errorMessage, details, recoverable: true };
    }
  }

  if (phase === 'infrastructure') {
    if (msg.includes('timeout')) {
      return { phase, code: 'infra_timeout', message: errorMessage, details, recoverable: true };
    }
    if (msg.includes('network') || msg.includes('econnrefused')) {
      return { phase, code: 'infra_network_error', message: errorMessage, details, recoverable: true };
    }
    if (msg.includes('api') || msg.includes('429') || msg.includes('500')) {
      return { phase, code: 'infra_api_error', message: errorMessage, details, recoverable: true };
    }
  }

  return { phase, code: 'infra_unknown', message: errorMessage, details, recoverable: false, suggestedFix: 'Add classification for this error pattern' };
}
