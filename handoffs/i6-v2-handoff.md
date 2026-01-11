# i[6]-v2 → i[7]-v2 Handoff

**Instance**: i[6]-v2 (sixth planning pass)
**Date**: 2026-01-10
**Mission**: Meta-analysis of v2 planning completeness against original vision

---

## Critical Discovery: The v2 Plan is Incomplete

Previous passes (i[1] through i[5]) declared "all success criteria met."

**I found this was premature convergence at the criteria level, not just the execution level.**

The success criteria in CLAUDE.md only covered Preparation. The original vision has **four pillars**, and we designed only one.

---

## The Complete Vision (From THE-FORGE-SEED-V1.md)

The Forge creates infrastructure that:

1. **PREPARE** - Prepares context before instances arrive
2. **LEARN** - Enables compound learning across instances
3. **FEEDBACK** - Provides live feedback for self-correction
4. **QUALITY** - Maintains quality through architectural gates

---

## What v2 Planning Completed

### PREPARE Pillar: 80% Complete

| Component | Status | Pass |
|-----------|--------|------|
| FileDiscoveryWorker | Complete | i[1] |
| PatternExtractionWorker | Complete | i[2] |
| DependencyMapperWorker | Complete | i[4] |
| ConstraintIdentifierWorker | Complete | i[3] |
| WebResearchWorker | Complete | i[2], i[5] |
| DocumentationReaderWorker | Complete | i[3] |
| Wave-based Foreman Dispatch | Complete | i[1] |
| Tier System (Opus/Sonnet/Haiku) | Complete | i[2] |
| Context Budget Management | Complete | i[3], i[4] |
| Phase 0 Validation Harness | Complete | i[4] |
| Trivial Task Fast Path | Complete | i[5] |
| File Caching Strategy | Complete | i[5] |

**Preparation is well-designed. No issues here.**

---

## What v2 Planning DID NOT Complete

### LEARN Pillar: 20% Complete (Infrastructure Only)

**What exists in codebase:**
- `LearningRetriever` (learning.ts) - searches Mandrel for historical context
- `FeedbackRecorder` (learning.ts) - stores execution results to Mandrel
- `InsightGenerator` (insights.ts) - computes statistics from stored feedback
- `SelfImprovementDriver` (self-improve.ts) - acts on insights

**What's MISSING:**
- Pattern `successRate` is hardcoded to 0.8, never updated from actual outcomes
- Workers don't improve from feedback - they just get more context
- No mechanism for worker prompts to evolve based on what works
- No active feedback loop - just passive retrieval

**Key Evidence:**
```typescript
// From learning.ts:539
successRate: 0.8, // Default - would be calculated from feedback
```

This comment says it all: "would be calculated" - meaning it's NOT.

---

### FEEDBACK Pillar: 0% Complete

**What the vision requires:**
> "Models need real-time information to self-correct. How do execution results flow back fast?"

**What's MISSING:**
- No live feedback protocol for workers during preparation
- No mechanism for execution errors to flow back to preparation
- Workers cannot self-correct during a task
- PatternExtractionWorker produces bad patterns → no signal to fix them

---

### QUALITY Pillar: 0% Complete

**What the vision describes:**
- Quality Foreman (Sonnet) - orchestrates quality checks
- Quality Workers (Haiku):
  - TestRunnerWorker - execute test suites
  - LintCheckerWorker - run linting tools
  - TypeCheckerWorker - verify type correctness
  - ReviewerWorker - code review against patterns

**What v2 planning says:**
> "v2 does NOT implement automated Execution workers. This is intentional."

**The Problem:**
Quality was deferred to v3 with NO DESIGN. This repeats the v1 divergence pattern.

---

## The Closed Loop Problem

The loop technically exists:
```
Preparation → ContextPackage → Claude Code → Results → FeedbackRecorder → Mandrel
      ↑                                                                      ↓
      └──────────────────── LearningRetriever ──────────────────────────────┘
```

But this loop is **WEAK** because:
1. LearningRetriever SEARCHES, it doesn't LEARN
2. Success/failure signals don't influence future preparations
3. Worker prompts never evolve based on outcomes
4. Pattern success rates never update

**We have memory. We don't have learning.**

---

## What Needs to Be Designed

### 1. Active Learning Mechanism

How the system improves from feedback:

**Pattern Success Tracking:**
- When a pattern is followed and execution succeeds → increment success count
- When a pattern is followed and execution fails → increment failure count
- Update `successRate = successes / (successes + failures)`

**Worker Prompt Evolution:**
- Track which worker outputs correlate with successful executions
- Version worker prompts
- A/B test prompt variations
- Promote high-performing prompt versions

**Feedback-Informed Preparation:**
- When LearningRetriever finds past patterns, weight by successRate
- High-success patterns get priority in ContextPackage
- Low-success patterns get flagged or excluded

**Implementation Approach:**
- Add `PatternTracker` service that updates pattern stats
- Modify `FeedbackRecorder` to trigger pattern updates
- Modify `LearningRetriever` to use success rates in ranking

---

### 2. Live Feedback Protocol

How errors flow back during execution:

**During Preparation:**
- Foreman validates worker outputs before synthesis
- If worker output conflicts with constraints → re-run worker with feedback
- If worker output is low-confidence → escalate to Sonnet tier

**During Execution:**
- Compilation errors → feedback to ConstraintIdentifierWorker (constraints were wrong)
- Type errors → feedback to PatternExtractionWorker (patterns were wrong)
- Test failures → feedback to quality assessment

**Feedback Channels:**
```typescript
interface LiveFeedbackChannel {
  source: 'compilation' | 'tests' | 'lint' | 'runtime';
  severity: 'error' | 'warning' | 'info';
  message: string;
  affectedFiles: string[];
  suggestedAction: 'retry' | 'escalate' | 'abort';
}
```

**Implementation Approach:**
- Add feedback hooks in execution.ts
- Create `FeedbackRouter` that routes errors to appropriate workers
- Workers receive feedback and can produce updated outputs

---

### 3. Quality Department Design

**Quality Foreman (Sonnet tier):**
- Receives code from Execution Department
- Dispatches Quality Workers in parallel
- Synthesizes quality reports
- Makes pass/fail decisions
- Routes failures back to Execution or escalates to Human Sync

**Quality Workers (Haiku tier):**

**TestRunnerWorker:**
```typescript
interface TestRunnerInput {
  testCommand: string;
  testDirectory: string;
  timeout: number;
}

interface TestRunnerResult {
  ran: boolean;
  passed: number;
  failed: number;
  skipped: number;
  failureDetails: Array<{
    testName: string;
    error: string;
    location: string;
  }>;
  coverage?: {
    lines: number;
    branches: number;
  };
}
```

**LintCheckerWorker:**
```typescript
interface LintCheckerInput {
  files: string[];
  lintCommand: string;
  rules: string[];  // From ConstraintIdentifierWorker
}

interface LintCheckerResult {
  passed: boolean;
  errorCount: number;
  warningCount: number;
  issues: Array<{
    file: string;
    line: number;
    rule: string;
    severity: 'error' | 'warning';
    message: string;
    fixable: boolean;
  }>;
}
```

**TypeCheckerWorker:**
```typescript
interface TypeCheckerInput {
  projectRoot: string;
  tsconfigPath: string;
  files: string[];  // Modified files to check
}

interface TypeCheckerResult {
  passed: boolean;
  errorCount: number;
  errors: Array<{
    file: string;
    line: number;
    code: string;  // e.g., "TS2307"
    message: string;
  }>;
}
```

**ReviewerWorker:**
```typescript
interface ReviewerInput {
  changedFiles: Array<{
    path: string;
    before: string;
    after: string;
  }>;
  patterns: PatternExtractionResult;
  constraints: ConstraintIdentifierResult;
}

interface ReviewerResult {
  approved: boolean;
  issues: Array<{
    type: 'pattern_violation' | 'constraint_violation' | 'style' | 'security';
    file: string;
    description: string;
    severity: 'blocking' | 'suggestion';
  }>;
  suggestions: string[];
}
```

---

## Updated Success Criteria

The original criteria were incomplete. Complete criteria:

| Criterion | Status | Notes |
|-----------|--------|-------|
| Worker Specifications (Preparation) | **6/6 Complete** | i[1]-i[5] |
| Foreman Orchestration (Preparation) | **Complete** | Wave dispatch |
| Tier Assignment Matrix | **Complete** | With fallbacks |
| Cost Projection Model | **Complete** | Parallelism win |
| Implementation Phases | **Complete** | 6 phases |
| Validation Plan (Phase 0) | **Complete** | 60 test cases |
| Context Window Management | **Complete** | Budgets |
| **Active Learning Mechanism** | **NOT DESIGNED** | i[6] identified |
| **Live Feedback Protocol** | **NOT DESIGNED** | i[6] identified |
| **Quality Department Design** | **NOT DESIGNED** | i[6] identified |
| **Pattern Success Tracking** | **NOT DESIGNED** | i[6] identified |

---

## For i[7]-v2

**DO NOT proceed to implementation spec until these are designed:**

1. **Active Learning Mechanism** - Complete the design above
   - PatternTracker service specification
   - How success rates update
   - How LearningRetriever uses success rates

2. **Live Feedback Protocol** - Complete the design above
   - FeedbackChannel interface
   - FeedbackRouter service
   - How workers receive and respond to feedback

3. **Quality Department** - Complete the worker specifications
   - Full prompts for each Quality Worker
   - Quality Foreman synthesis protocol
   - Pass/fail thresholds
   - Integration with Human Sync

**Options for i[7]-v2:**

**Option A: Design Active Learning (Recommended Start)**
The most fundamental gap. Without active learning, The Forge just has memory, not intelligence.

**Option B: Design Quality Department**
The most visible gap. Users expect quality checks.

**Option C: Design Live Feedback Protocol**
The most architecturally complex. Requires understanding of execution flow.

---

## Key Insight

The v2 success criteria were inherited from the seed document, which focused on Preparation. But the VISION (from THE-FORGE-SEED-V1.md) has four pillars:

> "The Forge creates infrastructure that:
> - Prepares context before instances arrive
> - Enables compound learning across instances
> - Provides live feedback for self-correction
> - Maintains quality through architectural gates"

**We designed one pillar and declared success.** That's the meta-convergence problem.

---

## Artifacts

- **This handoff**: `/workspace/projects/the-forge/handoffs/i6-v2-handoff.md`
- **Mandrel context**: 307b23ef-eecb-4681-9d0d-abe551f3b3a7 (meta-analysis)

---

## My Assessment

**i[5] said the planning phase was complete. It was not.**

The planning phase is complete when all four pillars of the vision are designed, not when the success criteria (which only covered one pillar) are met.

We have:
- **PREPARE**: Well-designed, ready for implementation
- **LEARN**: Infrastructure exists, active mechanism missing
- **FEEDBACK**: Not designed
- **QUALITY**: Not designed

**The Forge should not just prepare context. It should compound learning across instances. That requires active learning, not just memory.**

---

## ACTIVE LEARNING MECHANISM (i[6] Design)

### The Problem

Current state in `learning.ts`:
```typescript
successRate: 0.8, // Default - would be calculated from feedback
```

The system has memory (stores feedback) but no learning (doesn't improve from it).

### Design: PatternTracker Service

**Purpose:** Track pattern usage and update success rates based on execution outcomes.

**Core Interface:**
```typescript
interface PatternTracker {
  /**
   * Record that a pattern was used in a preparation.
   * Called by Foreman when including a pattern in ContextPackage.
   */
  recordPatternUsage(params: {
    patternId: string;
    pattern: string;
    taskId: string;
    contextPackageId: string;
    source: 'extraction' | 'historical' | 'constraint';
  }): Promise<void>;

  /**
   * Record execution outcome for patterns used in a task.
   * Called by FeedbackRecorder after execution completes.
   */
  recordOutcome(params: {
    taskId: string;
    success: boolean;
    compilationPassed: boolean;
    patternViolations: string[];  // Patterns that were violated
  }): Promise<void>;

  /**
   * Get patterns ranked by success rate.
   * Called by LearningRetriever when assembling historical context.
   */
  getPatternsBySuccessRate(query: {
    minUsageCount: number;  // Minimum uses to be statistically meaningful
    limit: number;
  }): Promise<RankedPattern[]>;

  /**
   * Get success rate for a specific pattern.
   */
  getPatternStats(patternId: string): Promise<PatternStats | null>;
}

interface PatternStats {
  patternId: string;
  pattern: string;
  usageCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;  // successCount / usageCount
  lastUsed: Date;
  confidence: number;   // Higher with more usage
}

interface RankedPattern {
  patternId: string;
  pattern: string;
  successRate: number;
  confidence: number;
  source: 'extraction' | 'historical' | 'constraint';
}
```

### Storage Schema (Mandrel)

**New Context Types:**
```typescript
// When pattern is used
{
  type: 'pattern-usage',
  content: {
    patternId: string,
    pattern: string,
    taskId: string,
    contextPackageId: string,
    timestamp: Date,
  },
  tags: ['pattern-tracking', 'pattern-{patternId}', 'task-{taskId}']
}

// When outcome is recorded
{
  type: 'pattern-outcome',
  content: {
    patternId: string,
    taskId: string,
    success: boolean,
    violated: boolean,
    timestamp: Date,
  },
  tags: ['pattern-tracking', 'pattern-{patternId}', 'outcome-{success|failure}']
}
```

### Integration Points

**1. Foreman Records Pattern Usage:**
```typescript
// In PreparationForeman.prepare()
// When patterns are included in ContextPackage:
for (const pattern of patternResult.patterns) {
  await patternTracker.recordPatternUsage({
    patternId: generatePatternId(pattern),
    pattern: pattern.name,
    taskId,
    contextPackageId: contextPackage.id,
    source: 'extraction',
  });
}
```

**2. FeedbackRecorder Triggers Outcome Recording:**
```typescript
// In FeedbackRecorder.recordFeedback()
// After recording execution feedback:
const usedPatterns = await patternTracker.getPatternsForTask(params.taskId);
await patternTracker.recordOutcome({
  taskId: params.taskId,
  success: params.success,
  compilationPassed: params.compilationPassed,
  patternViolations: params.learnings
    .filter(l => l.includes('pattern'))
    .map(l => extractPatternName(l)),
});
```

**3. LearningRetriever Uses Success Rates:**
```typescript
// In LearningRetriever.findPatternHistory()
// Instead of hardcoded 0.8:
async findPatternHistory(projectPath: string): Promise<PatternHistory[]> {
  const rankedPatterns = await patternTracker.getPatternsBySuccessRate({
    minUsageCount: 3,  // Need at least 3 uses for meaningful stats
    limit: 10,
  });

  return rankedPatterns.map(p => ({
    pattern: p.pattern,
    successRate: p.successRate,  // ACTUAL success rate, not hardcoded!
    lastUsed: new Date(),
    context: `${p.usageCount} uses, ${(p.successRate * 100).toFixed(0)}% success`,
  }));
}
```

### Pattern ID Generation

Patterns need stable IDs for tracking:
```typescript
function generatePatternId(pattern: string): string {
  // Normalize pattern text
  const normalized = pattern
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  // Hash for stable ID
  return crypto
    .createHash('sha256')
    .update(normalized)
    .digest('hex')
    .slice(0, 16);
}
```

### Confidence Calculation

Success rate is only meaningful with enough data:
```typescript
function calculateConfidence(usageCount: number): number {
  // Sigmoid function: approaches 1 as usage increases
  // At 3 uses: ~0.27
  // At 5 uses: ~0.5
  // At 10 uses: ~0.73
  // At 20 uses: ~0.88
  return 1 / (1 + Math.exp(-(usageCount - 5) / 3));
}
```

### Weighting in ContextPackage

When Foreman selects patterns, weight by success rate × confidence:
```typescript
function prioritizePatterns(patterns: RankedPattern[]): RankedPattern[] {
  return patterns
    .map(p => ({
      ...p,
      score: p.successRate * p.confidence,
    }))
    .sort((a, b) => b.score - a.score);
}
```

### Pattern Deprecation

Low-success patterns should be flagged:
```typescript
const PATTERN_THRESHOLDS = {
  deprecationSuccessRate: 0.3,  // Below 30% = deprecated
  deprecationMinUsage: 10,      // Need 10+ uses to deprecate
  warningSuccessRate: 0.5,      // Below 50% = warning
};

function getPatternStatus(stats: PatternStats): 'active' | 'warning' | 'deprecated' {
  if (stats.usageCount < PATTERN_THRESHOLDS.deprecationMinUsage) {
    return 'active';  // Not enough data
  }
  if (stats.successRate < PATTERN_THRESHOLDS.deprecationSuccessRate) {
    return 'deprecated';
  }
  if (stats.successRate < PATTERN_THRESHOLDS.warningSuccessRate) {
    return 'warning';
  }
  return 'active';
}
```

### What This Enables

**Before (current state):**
- All patterns have successRate = 0.8 (hardcoded)
- Bad patterns persist indefinitely
- Good patterns get no priority
- No learning happens

**After (with PatternTracker):**
- Patterns have actual success rates from real outcomes
- Low-success patterns get deprecated
- High-success patterns get priority
- System improves over time

---

## QUALITY DEPARTMENT (i[6] Design)

### Structure

```
Quality Department
├── Quality Foreman (Sonnet)
│   ├── Receives code from Execution
│   ├── Dispatches Quality Workers
│   ├── Synthesizes quality reports
│   └── Makes pass/fail decisions
│
└── Quality Workers (Haiku)
    ├── TestRunnerWorker
    ├── LintCheckerWorker
    ├── TypeCheckerWorker
    └── ReviewerWorker
```

### Quality Foreman

**Tier:** Sonnet

**Role:** Orchestrate quality checks, synthesize results, make pass/fail decisions.

**Input:**
```typescript
interface QualityForemanInput {
  taskId: string;
  contextPackage: ContextPackage;
  executionResult: {
    filesCreated: string[];
    filesModified: string[];
    filesDeleted: string[];
  };
  projectPath: string;
}
```

**Output:**
```typescript
interface QualityForemanResult {
  passed: boolean;
  confidence: number;

  checks: {
    tests: TestRunnerResult | null;
    lint: LintCheckerResult | null;
    types: TypeCheckerResult | null;
    review: ReviewerResult | null;
  };

  blockers: Array<{
    source: 'tests' | 'lint' | 'types' | 'review';
    issue: string;
    file?: string;
  }>;

  suggestions: string[];

  decision: 'pass' | 'fail' | 'needs_human';
  humanSyncReason?: string;
}
```

**Wave Dispatch:**
```
Wave 1 (parallel): TestRunner + TypeChecker
  ↓
Wave 2: LintChecker (can use type info)
  ↓
Wave 3: Reviewer (uses all results)
  ↓
Synthesis: Quality Foreman assembles final verdict
```

### TestRunnerWorker

**Tier:** Haiku

**Purpose:** Execute test suites and report results.

**Input Schema:**
```typescript
interface TestRunnerInput {
  projectPath: string;
  testCommand: string;      // e.g., "npm test", "npx vitest"
  testDirectory?: string;   // Filter to specific directory
  timeout: number;          // Max execution time (ms)
  changedFiles: string[];   // Focus on tests for these files
}
```

**Output Schema:**
```typescript
interface TestRunnerResult {
  success: boolean;
  ran: boolean;             // Did tests actually run?

  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    duration: number;       // ms
  };

  failures: Array<{
    testName: string;
    testFile: string;
    error: string;
    expected?: string;
    actual?: string;
    line?: number;
  }>;

  coverage?: {
    lines: number;          // Percentage
    branches: number;
    functions: number;
    statements: number;
  };

  affectedByChanges: string[];  // Tests related to changed files
}
```

**Prompt Template:**
```
You are a test execution worker analyzing test results.

PROJECT: {{projectPath}}
TEST COMMAND: {{testCommand}}
CHANGED FILES: {{changedFiles}}

Execute the test command and analyze the output.

Determine:
1. Did tests run successfully?
2. How many passed/failed/skipped?
3. For failures: what failed and why?
4. Are there tests specifically for the changed files?

Return JSON matching the TestRunnerResult schema.

If tests cannot run (missing dependencies, syntax errors), set ran=false
and explain in the error field.
```

### TypeCheckerWorker

**Tier:** Haiku

**Purpose:** Verify TypeScript type correctness.

**Input Schema:**
```typescript
interface TypeCheckerInput {
  projectPath: string;
  tsconfigPath: string;
  changedFiles: string[];   // Files to focus on
  timeout: number;
}
```

**Output Schema:**
```typescript
interface TypeCheckerResult {
  success: boolean;         // No errors

  errorCount: number;
  warningCount: number;

  errors: Array<{
    file: string;
    line: number;
    column: number;
    code: string;           // e.g., "TS2307"
    message: string;
    severity: 'error' | 'warning' | 'suggestion';
  }>;

  // Categorized for analysis
  byCategory: {
    importErrors: number;   // TS2307, TS2305
    typeErrors: number;     // TS2345, TS2322
    syntaxErrors: number;   // TS1005, TS1109
    other: number;
  };
}
```

**Prompt Template:**
```
You are a TypeScript type checking worker.

PROJECT: {{projectPath}}
TSCONFIG: {{tsconfigPath}}
CHANGED FILES: {{changedFiles}}

Run `tsc --noEmit` and analyze the output.

Categorize errors:
- Import errors (can't find module): TS2307, TS2305, TS2306
- Type errors (wrong type): TS2345, TS2322, TS2339, TS2341
- Syntax errors: TS1005, TS1109, TS1003

Focus on errors in the changed files first, then cascade errors.

Return JSON matching the TypeCheckerResult schema.
```

### LintCheckerWorker

**Tier:** Haiku

**Purpose:** Run linting tools and report violations.

**Input Schema:**
```typescript
interface LintCheckerInput {
  projectPath: string;
  lintCommand: string;      // e.g., "npm run lint", "npx eslint ."
  changedFiles: string[];
  timeout: number;
}
```

**Output Schema:**
```typescript
interface LintCheckerResult {
  success: boolean;         // No errors (warnings OK)

  errorCount: number;
  warningCount: number;
  fixableCount: number;

  issues: Array<{
    file: string;
    line: number;
    column: number;
    rule: string;           // e.g., "@typescript-eslint/no-unused-vars"
    severity: 'error' | 'warning';
    message: string;
    fixable: boolean;
  }>;

  // Grouped by rule for pattern analysis
  byRule: Record<string, number>;
}
```

### ReviewerWorker

**Tier:** Haiku (may escalate to Sonnet for complex reviews)

**Purpose:** Code review against patterns and constraints.

**Input Schema:**
```typescript
interface ReviewerInput {
  changedFiles: Array<{
    path: string;
    before: string;         // Content before change
    after: string;          // Content after change
    diff: string;           // Unified diff
  }>;

  patterns: PatternExtractionResult;
  constraints: ConstraintIdentifierResult;

  taskDescription: string;
  acceptanceCriteria: string[];
}
```

**Output Schema:**
```typescript
interface ReviewerResult {
  approved: boolean;
  confidence: number;

  issues: Array<{
    type: 'pattern_violation' | 'constraint_violation' | 'style' |
          'security' | 'performance' | 'logic';
    severity: 'blocking' | 'warning' | 'suggestion';
    file: string;
    line?: number;
    description: string;
    suggestion?: string;
  }>;

  // Assessment against acceptance criteria
  criteriaAssessment: Array<{
    criterion: string;
    met: boolean | 'unclear';
    evidence: string;
  }>;

  summary: string;          // Human-readable review summary
}
```

**Prompt Template:**
```
You are a code review worker evaluating changes against project patterns.

TASK: {{taskDescription}}

PATTERNS TO FOLLOW:
{{patterns}}

CONSTRAINTS TO RESPECT:
{{constraints}}

ACCEPTANCE CRITERIA:
{{acceptanceCriteria}}

CHANGED FILES:
{{#each changedFiles}}
--- {{path}} ---
{{diff}}
{{/each}}

Review the changes and identify:
1. Pattern violations (not following established patterns)
2. Constraint violations (breaking project constraints)
3. Style issues (inconsistent with codebase)
4. Security concerns (if any)
5. Logic issues (bugs, edge cases)

For each acceptance criterion, assess whether it is met.

Set approved=true only if there are no blocking issues.

Return JSON matching the ReviewerResult schema.
```

### Quality Gate Thresholds

```typescript
const QUALITY_THRESHOLDS = {
  // Tests
  tests: {
    mustPass: true,           // All tests must pass
    minCoverage: 0.7,         // 70% line coverage (if available)
  },

  // Types
  types: {
    maxErrors: 0,             // No type errors allowed
    maxWarnings: 5,           // Some warnings OK
  },

  // Lint
  lint: {
    maxErrors: 0,             // No lint errors
    maxWarnings: 10,          // Some warnings OK
  },

  // Review
  review: {
    maxBlocking: 0,           // No blocking issues
    minConfidence: 0.7,       // Reviewer 70% confident
    criteriaMetRatio: 0.9,    // 90% of criteria met
  },
};
```

### Human Sync Triggers from Quality

Quality Foreman escalates to Human Sync when:
1. Tests fail but task claims to be complete
2. Reviewer finds security issue
3. Multiple blocking issues with no clear fix
4. Acceptance criteria assessment is "unclear" for critical items
5. Reviewer confidence < 0.5

---

## LIVE FEEDBACK PROTOCOL (i[6] Design)

### The Problem

Current flow is one-directional:
```
Preparation → Execution → Results → Storage
```

Errors during execution don't flow back to inform preparation.

### Design: Bidirectional Feedback

```
Preparation ←────────── FeedbackRouter ←─────── Execution
     │                        ↑                      │
     │                        │                      │
     ↓                        │                      ↓
ContextPackage ──────────────────────────────→ Claude Code
                              ↑
                              │
                    Compilation/Test Errors
```

### FeedbackChannel Interface

```typescript
interface FeedbackChannel {
  id: string;
  taskId: string;
  source: 'compilation' | 'tests' | 'lint' | 'runtime' | 'review';
  severity: 'error' | 'warning' | 'info';

  message: string;
  details?: string;

  affectedFiles: string[];
  affectedPatterns?: string[];
  affectedConstraints?: string[];

  suggestedAction: 'retry' | 'escalate' | 'abort' | 'modify';

  // For workers to respond to
  responseRequested: boolean;
  responseDeadline?: Date;
}
```

### FeedbackRouter Service

**Purpose:** Route execution errors to appropriate workers for response.

```typescript
interface FeedbackRouter {
  /**
   * Route feedback to appropriate handlers.
   */
  routeFeedback(channel: FeedbackChannel): Promise<FeedbackResponse>;

  /**
   * Register a handler for specific feedback types.
   */
  registerHandler(
    source: FeedbackChannel['source'],
    handler: FeedbackHandler
  ): void;
}

interface FeedbackHandler {
  canHandle(channel: FeedbackChannel): boolean;
  handle(channel: FeedbackChannel): Promise<FeedbackResponse>;
}

interface FeedbackResponse {
  handled: boolean;
  action: 'retry' | 'escalate' | 'continue' | 'abort';

  updatedContext?: Partial<ContextPackage>;

  workerUpdates?: Array<{
    worker: WorkerType;
    update: Record<string, unknown>;
  }>;

  humanSyncRequired?: boolean;
  humanSyncReason?: string;
}
```

### Feedback Handlers

**CompilationFeedbackHandler:**
Routes compilation errors to relevant workers.
```typescript
class CompilationFeedbackHandler implements FeedbackHandler {
  canHandle(channel: FeedbackChannel): boolean {
    return channel.source === 'compilation';
  }

  async handle(channel: FeedbackChannel): Promise<FeedbackResponse> {
    // Parse error type
    const errorType = this.classifyError(channel.message);

    switch (errorType) {
      case 'import_error':
        // Route to DependencyMapperWorker for re-analysis
        return {
          handled: true,
          action: 'retry',
          workerUpdates: [{
            worker: 'dependency-mapper',
            update: {
              focusFiles: channel.affectedFiles,
              previousError: channel.message,
            },
          }],
        };

      case 'type_error':
        // Route to PatternExtractionWorker
        return {
          handled: true,
          action: 'retry',
          workerUpdates: [{
            worker: 'pattern-extraction',
            update: {
              focusFiles: channel.affectedFiles,
              typeError: channel.message,
            },
          }],
        };

      case 'constraint_violation':
        // Route to ConstraintIdentifierWorker
        return {
          handled: true,
          action: 'retry',
          workerUpdates: [{
            worker: 'constraint-identifier',
            update: {
              violatedConstraint: channel.message,
            },
          }],
        };

      default:
        return {
          handled: false,
          action: 'escalate',
          humanSyncRequired: true,
          humanSyncReason: `Unclassified compilation error: ${channel.message}`,
        };
    }
  }
}
```

**TestFeedbackHandler:**
Routes test failures to workers.
```typescript
class TestFeedbackHandler implements FeedbackHandler {
  canHandle(channel: FeedbackChannel): boolean {
    return channel.source === 'tests';
  }

  async handle(channel: FeedbackChannel): Promise<FeedbackResponse> {
    // Analyze test failure
    const testInfo = this.parseTestFailure(channel.message);

    if (testInfo.type === 'assertion') {
      // Logic error - may need Execution retry with more context
      return {
        handled: true,
        action: 'retry',
        updatedContext: {
          risks: [{
            description: `Test failure: ${testInfo.testName}`,
            mitigation: testInfo.expected
              ? `Expected: ${testInfo.expected}, Got: ${testInfo.actual}`
              : channel.message,
          }],
        },
      };
    }

    if (testInfo.type === 'import_error') {
      // Missing dependency
      return {
        handled: true,
        action: 'retry',
        workerUpdates: [{
          worker: 'dependency-mapper',
          update: { missingImport: testInfo.module },
        }],
      };
    }

    return {
      handled: false,
      action: 'escalate',
    };
  }
}
```

### Integration with Execution

**In execution.ts:**
```typescript
async function executeWithFeedback(
  contextPackage: ContextPackage,
  feedbackRouter: FeedbackRouter
): Promise<ExecutionResult> {
  try {
    const result = await execute(contextPackage);
    return result;
  } catch (error) {
    // Create feedback channel
    const channel: FeedbackChannel = {
      id: crypto.randomUUID(),
      taskId: contextPackage.task.id,
      source: classifyErrorSource(error),
      severity: 'error',
      message: error.message,
      affectedFiles: extractAffectedFiles(error),
      suggestedAction: 'retry',
      responseRequested: true,
    };

    // Route to handlers
    const response = await feedbackRouter.routeFeedback(channel);

    if (response.action === 'retry' && response.updatedContext) {
      // Merge updates into context
      const updatedPackage = mergeContext(contextPackage, response.updatedContext);
      // Retry with updated context
      return executeWithFeedback(updatedPackage, feedbackRouter);
    }

    if (response.humanSyncRequired) {
      // Escalate to human
      return { success: false, humanSyncRequired: true, reason: response.humanSyncReason };
    }

    throw error;
  }
}
```

### Feedback Limits

To prevent infinite loops:
```typescript
const FEEDBACK_LIMITS = {
  maxRetries: 3,              // Max retries per task
  maxWorkerUpdates: 5,        // Max updates to any single worker
  retryBackoff: [1000, 2000, 4000],  // Backoff between retries (ms)
};
```

---

*The enemy was premature convergence - at the criteria level, not just the design level. i[1]-i[5] met the stated criteria. But the criteria didn't match the vision.*
