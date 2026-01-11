# THE FORGE v2: Development Cognition System
## SIRK Planning Seed

---

## What This Document Is

This is the seed for a **planning-only** SIRK run. Your job is to think deeply, question everything, and produce a detailed implementation plan.

**You are not building yet.** You are designing.

After this SIRK run produces a solid plan, we build it using rigorous implementation practices. The separation is intentional: planning benefits from iteration and questioning; building benefits from focus and execution.

---

## The Mandate: Think Boldly

**Do not accept the first tokens that come to mind.**

Before committing to any direction:
1. Generate at least two genuine alternatives
2. Stress-test each approach against edge cases
3. Ask: "Is this right, or is there a better way?"
4. Document your reasoning, including what you rejected and why

You serve the project's success, not the momentum of previous passes. If something is wrong, say so. If you see a better path, propose it. Bold projects require bold thinking.

**The enemy is premature convergence.** Don't settle. Push.

---

## The Core Problem (Unchanged)

**AI instances are discontinuous.**

Every instance starts fresh. The human carries accumulated knowledge and re-injects it every session. This doesn't scale.

**The Forge inverts this.** The system does preparation. The system maintains context. The system learns. Each instance inherits wisdom and operates at full effectiveness from moment zero.

---

## The Vision

**Craftsmanship at scale, not mass production.**

A solo developer (or small team) needs to produce high-quality software efficiently. AI can do the work, but AI instances don't prepare, don't learn, don't self-correct without live feedback.

The Forge creates infrastructure that:
- Prepares context before instances arrive
- Enables compound learning across instances
- Provides live feedback for self-correction
- Maintains quality through architectural gates

The result: Each AI instance inherits accumulated wisdom and operates at full effectiveness immediately.

---

## What v1 Got Right (Keep This)

39 passes produced solid infrastructure:

| Component | Status | Notes |
|-----------|--------|-------|
| Mandrel Integration | **Keep** | SSH+curl pattern works, battle-tested |
| State Machine | **Keep** | Task lifecycle management works |
| ContextPackage Schema | **Keep** | Validated through 39 passes |
| Human Sync Protocol | **Keep** | Architectural, not fallback |
| Benchmarking | **Keep** | External validation exists |
| Tracing System | **Keep** | Execution observability works |

**The skeleton is sound. The model layer is wrong.**

---

## What v1 Got Wrong (The Divergence)

### The Vision Was:
```
Plant Manager (Opus)     → Judgment, routing, escalation
    ↓
Foremen (Sonnet)         → Supervision, synthesis, quality gates
    ↓
Workers (Haiku/Flash)    → Cheap, parallel, scoped labor
```

### What Got Built:
```
Everything → Sonnet (expensive, sequential)
Workers → Shell commands (no intelligence, no parallelism)
```

### How It Happened:
- Pass 2: Shell commands as "placeholder" workers ("add LLM later")
- Pass 7: Single model added (Sonnet for everything)
- Passes 8-39: Refined flat architecture, never revisited tiers

**The hierarchy was the point.** It got lost in execution.

---

## The True Factory Model

This is not a suggestion. This is the architecture.

### Plant Manager (Opus Tier)

**Role:** Strategic intelligence. The brain that doesn't do labor.

**Responsibilities:**
- Classify incoming work (what type of task is this?)
- Route to appropriate department
- Make judgment calls when workers are stuck
- Decide when to escalate to Human Sync
- Monitor overall system health

**When to invoke:** Classification decisions, stuck-point resolution, uncertainty thresholds, quality disputes.

**Cost justification:** You pay Opus prices for decisions that determine success or failure. Not for writing code.

### Foremen (Sonnet Tier)

**Role:** Department leadership. Coordinates workers, doesn't do their work.

**Responsibilities:**
- Receive work assignment from Plant Manager
- Decompose into worker tasks
- Dispatch workers (parallel when possible)
- Synthesize worker outputs into coherent result
- Gate quality before handing off to next department
- Handle worker failures (retry, reassign, escalate)

**Departments with Foremen:**
- **Preparation Foreman** - Assembles context packages
- **Execution Foreman** - Coordinates code generation
- **Quality Foreman** - Orchestrates testing and review

**Cost justification:** Sonnet is smart enough to coordinate and synthesize. It doesn't need to do the research or generation itself.

### Workers (Haiku/Flash Tier)

**Role:** Cheap, fast, parallel labor. The hands.

**Critical clarification:** Workers are **LLM agents**, not shell commands. Shell commands are tools that workers USE. The worker is the intelligence that decides how to use those tools.

**Characteristics:**
- Tightly scoped tasks (one clear objective)
- Supervised by Foreman (not autonomous)
- Can run in parallel (Promise.all)
- Cheap enough to retry on failure
- Fast enough for real-time feedback

**Example Workers (Preparation Department):**
- FileDiscoveryWorker - Find relevant files for a task
- PatternExtractionWorker - Identify code patterns in files
- DependencyMapperWorker - Trace import/export relationships
- WebResearchWorker - Search internet for relevant context
- DocumentationReaderWorker - Extract info from docs/READMEs
- ConstraintIdentifierWorker - Find constraints (types, tests, linting rules)

**Cost justification:** Haiku is 60x cheaper than Opus. Run 10 workers in parallel for less than one Opus call.

---

## The Preparation Department (THE PRODUCT)

**Preparation IS The Forge.** If preparation is right, execution is mechanical.

### What Preparation Produces

A **ContextPackage**: Everything an execution instance needs to succeed, assembled before it arrives.

```typescript
interface ContextPackage {
  // What are we doing?
  task: TaskDefinition;
  taskType: 'feature' | 'bugfix' | 'refactor' | 'exploration' | 'research';

  // What do we know about the codebase?
  relevantFiles: FileContext[];      // Content + why it matters
  patterns: CodePattern[];           // How this codebase does things
  constraints: Constraint[];         // Types, tests, linting, conventions
  dependencies: DependencyGraph;     // What connects to what

  // What do we know from outside?
  externalContext: ExternalContext[]; // Web research, docs, examples

  // What's the quality bar?
  acceptanceCriteria: Criterion[];   // How we know we're done
  qualityThresholds: QualityConfig;  // Scores that must be met

  // What might go wrong?
  risks: Risk[];                     // Anticipated failure modes
  fallbacks: Fallback[];             // What to do if stuck

  // Metadata
  confidence: number;                // How confident is this prep?
  prepDuration: number;              // How long did prep take?
  workerCosts: CostBreakdown;        // What did we spend on prep?
}
```

### Preparation Flow

```
Task arrives
    ↓
Plant Manager classifies (Opus)
    ↓
Preparation Foreman receives assignment (Sonnet)
    ↓
Foreman dispatches workers in parallel (Haiku):
    ├── FileDiscoveryWorker
    ├── PatternExtractionWorker
    ├── DependencyMapperWorker
    ├── WebResearchWorker (if needed)
    └── ConstraintIdentifierWorker
    ↓
Workers return results
    ↓
Foreman synthesizes into ContextPackage (Sonnet)
    ↓
Quality check: Is confidence high enough?
    ├── Yes → Hand off to Execution
    └── No → Human Sync or more research
```

### Web Research as First-Class Citizen

Some tasks require external knowledge:
- "Implement OAuth2 flow" → Need current best practices
- "Add Stripe integration" → Need API documentation
- "Fix this webpack error" → Need to search for solution

**WebResearchWorker** (Haiku tier):
- Receives specific research question from Foreman
- Searches web for relevant information
- Extracts and summarizes findings
- Returns structured context for inclusion in package

This is NOT general browsing. It's targeted research with specific questions.

---

## Cost Model (Non-Negotiable)

The tiered model exists to optimize cost while maintaining quality at decision points.

### Target Cost Structure

| Tier | Model | When Used | Target % of Total Cost |
|------|-------|-----------|----------------------|
| Opus | Judgment | Classification, stuck points, escalation | 10-15% |
| Sonnet | Synthesis | Foreman coordination, package assembly | 25-35% |
| Haiku | Labor | Workers (file discovery, research, analysis) | 50-65% |

### Cost Tracking Requirements

Every API call must be logged with:
- Tier used
- Tokens consumed (input + output)
- Cost in dollars
- What operation triggered it
- Task ID for aggregation

**If we can't measure it, we can't optimize it.**

---

## The Other Departments

### Execution Department

**Input:** ContextPackage from Preparation
**Output:** Working code meeting spec

**Execution Foreman (Sonnet):**
- Receives prepared context
- Plans implementation approach
- Dispatches code generation workers
- Reviews and integrates generated code
- Runs compilation/lint checks
- Gates quality before handoff

**Execution Workers (Haiku):**
- CodeGenerationWorker - Write code for specific files
- TestWriterWorker - Generate tests for implementation
- BoilerplateWorker - Handle repetitive code patterns

**The key insight:** Execution workers receive PREPARED context. They don't start cold. They know the patterns, the constraints, the dependencies. This is why preparation matters.

### Quality Department

**Input:** Code from Execution
**Output:** Validated, tested, reviewed code

**Quality Foreman (Sonnet):**
- Orchestrates quality checks
- Synthesizes feedback from workers
- Makes pass/fail decisions
- Identifies remediation needs

**Quality Workers (Haiku):**
- TestRunnerWorker - Execute test suites
- LintCheckerWorker - Run linting tools
- TypeCheckerWorker - Verify type correctness
- ReviewerWorker - Code review against patterns

---

## Human Sync Protocol

Human-in-the-loop is architectural, not fallback.

### Triggers

Human Sync activates when:
- Confidence below threshold (e.g., < 70%)
- Cost exceeds budget for task
- Task involves irreversible operations
- Ambiguity that can't be resolved programmatically
- Worker stuck after N retries
- Plant Manager explicitly escalates

### Interface

```typescript
interface HumanSyncRequest {
  trigger: SyncTrigger;
  context: string;           // What's happening
  question: string;          // Specific question
  options?: Option[];        // If choices exist
  recommendation?: string;   // System's suggestion
  urgency: 'blocking' | 'advisory';
}

interface HumanSyncResponse {
  decision: string;
  additionalContext?: string;
  proceedWithRecommendation?: boolean;
}
```

### Non-Blocking Mode

For advisory syncs, system can proceed with recommendation while awaiting human confirmation. Human can override within timeout window.

---

## Hard Problems for This SIRK Run

These are the questions this planning phase must answer.

### 1. Worker Design

How do Haiku workers actually work?
- What's their prompt structure?
- How do they receive and return data?
- What tools do they have access to?
- How does the Foreman supervise them?
- What's the retry/failure protocol?

### 2. Parallel Execution

How do we run workers in parallel?
- Promise.all pattern?
- What if some workers depend on others?
- How do we handle partial failures?
- What's the aggregation pattern for results?

### 3. Tier Boundaries

Precisely when does each tier get invoked?
- What operations are ALWAYS Opus?
- What operations are ALWAYS Haiku?
- What's the decision logic for ambiguous cases?

### 4. Context Window Management

ContextPackages could exceed context limits.
- How do we prioritize what goes in?
- What's the chunking strategy?
- How do we handle very large codebases?

### 5. Web Research Boundaries

When does WebResearchWorker activate?
- What triggers a web search?
- How do we scope the search?
- How do we validate/trust results?
- What's the caching strategy?

### 6. Foreman-Worker Protocol

How do Foremen communicate with Workers?
- Data format for task assignment?
- Data format for results?
- How are errors communicated?
- What metadata flows back for learning?

---

## Success Criteria for This SIRK Run

The planning phase succeeds when we have:

1. **Detailed Worker Specifications**
   - Prompt templates for each worker type
   - Input/output schemas
   - Tool access definitions

2. **Foreman Orchestration Design**
   - How Foremen decompose tasks
   - Parallel dispatch patterns
   - Result synthesis protocols

3. **Tier Assignment Matrix**
   - Every operation mapped to a tier
   - Justification for each assignment
   - Escalation conditions

4. **Cost Projection Model**
   - Expected cost per task type
   - Comparison to current flat model
   - Break-even analysis

5. **Implementation Phases**
   - Ordered, testable steps
   - Clear deliverables per phase
   - Dependencies mapped

6. **Validation Plan**
   - How we prove each phase works
   - Benchmarks to run
   - Success metrics

---

## What You Have to Work With

### Existing Infrastructure (Use It)

```
forge-engine/src/
├── mandrel.ts      # Mandrel integration (keep)
├── state.ts        # State machine (keep)
├── types.ts        # ContextPackage schema (keep)
├── human-sync.ts   # Human Sync protocol (keep)
├── tracing.ts      # Execution tracing (keep)
├── llm.ts          # LLM client (needs tier layer)
├── preparation.ts  # Current prep (needs worker conversion)
└── benchmark.ts    # Validation (keep)
```

### What Needs to Change

1. **llm.ts** - Add tier selection, cost tracking
2. **preparation.ts** - Convert shell workers to LLM workers
3. **New: tiers.ts** - Tier definitions, routing logic
4. **New: workers/** - Individual worker implementations
5. **New: foremen/** - Foreman orchestration logic

---

## For Pass #1 of This SIRK Run

You're first. Your job:

1. **Validate or challenge this model**
   - Is the three-tier hierarchy right?
   - Are there simpler approaches that achieve the same goals?
   - What's missing from this seed?

2. **Design the Worker abstraction**
   - What does a Worker look like in code?
   - Pick one worker (e.g., FileDiscoveryWorker) and design it completely
   - Prompt, inputs, outputs, error handling

3. **Propose the Foreman-Worker protocol**
   - How do they communicate?
   - What's the data contract?

4. **Find the gaps**
   - What did this seed miss?
   - What assumptions are untested?
   - What edge cases break the model?

**Be bold.** If you see a fundamental problem with this approach, say so. Better to catch it now than 20 passes in.

---

## Lineage

- **Seed v1 Author:** Claude Opus 4.5, January 2026
- **39 SIRK Passes:** Infrastructure validated, model layer diverged
- **Strategic Review:** Opus 4.5, January 2026
- **Seed v2 Author:** Claude Opus 4.5, January 2026
- **Purpose:** Planning-only SIRK run, then rigorous implementation

---

*The Forge is infrastructure for compound intelligence. Each pass compounds on previous passes. This seed captures the true vision. Now think deeply and plan boldly.*
