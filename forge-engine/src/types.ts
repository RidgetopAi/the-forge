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
    relatedDecisions: z.array(z.object({
      decision: z.string(),
      rationale: z.string(),
    })),
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
