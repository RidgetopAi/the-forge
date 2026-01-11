# i[3]-v2 → i[4]-v2 Handoff

**Instance**: i[3]-v2 (third planning pass)
**Date**: 2026-01-10
**Mission**: Solve context window management, complete remaining workers, fill synthesis prompt gap

---

## What I Did

### 1. SOLVED Context Window Management (The Hard Problem)

Previous passes avoided this. I tackled it head-on.

**Core Insight:** Context overflow happens at 4 points:
1. FileDiscoveryWorker input (file index for large codebases)
2. PatternExtractionWorker input (file content samples)
3. Foreman synthesis input (all worker outputs)
4. Final ContextPackage output

**Solution: Budget + Hierarchical + Sampling + Map-Not-Dump**

```typescript
const CONTEXT_BUDGETS = {
  fileDiscoveryInput: 30_000,
  patternExtractionInput: 40_000,
  dependencyMapperInput: 30_000,
  constraintIdentifierInput: 20_000,
  webResearchInput: 10_000,
  documentationReaderInput: 30_000,
  foremanSynthesisInput: 60_000,
  contextPackageOutput: 80_000,
};
```

**Key Strategies:**

1. **Hierarchical Discovery** (for large codebases)
   - < 1000 files: Send full file index
   - 1000-5000 files: Directory structure first, then files in relevant directories
   - > 5000 files: Sample directories, identify patterns, expand

2. **Content Sampling** (for Wave 2 workers)
   - Max 15 files sampled
   - Max 300 lines per file
   - Smart truncation: head (200 lines) + tail (50 lines)
   - Diversity sampling: one file per directory first, then by relevance

3. **ContextPackage as Map, Not Dump**
   - Include file PATHS + EXCERPTS, not full content
   - Execution phase reads full files itself
   - Package budget: ~30-50k tokens (vs 200k+ for full dump)

4. **Budget Enforcement**
   - Every operation gets a token budget
   - Exceed budget → apply reduction strategy
   - Track confidence impact from reductions

**Alternatives I Rejected:**
- External chunk storage (over-engineered, adds infrastructure)
- Multi-pass discovery (more latency, higher cost)
- Ask user to specify scope (defeats automation goal)

---

### 2. Designed ConstraintIdentifierWorker

```typescript
interface ConstraintIdentifierInput {
  projectRoot: string;
  configFiles: Array<{ path: string; content: string; type: string }>;
  sampleCode?: Array<{ path: string; content: string }>;
  focusAreas?: ('types' | 'linting' | 'testing' | 'dependencies' | 'all')[];
  budget: { maxConfigTokens: number; maxSampleTokens: number };
}

interface ConstraintIdentifierResult {
  constraints: Array<{
    category: 'type-system' | 'linting' | 'testing' | 'build' | 'dependency' | 'convention';
    name: string;
    description: string;
    source: string;
    enforcement: 'build-time' | 'lint-time' | 'test-time' | 'convention';
    severity: 'error' | 'warning' | 'info';
  }>;
  typescript: { strict: boolean; strictNullChecks: boolean; ... } | null;
  linting: { tool: string; keyRules: [...]; extends: [...] } | null;
  testing: { framework: string; coverageRequired: boolean; ... } | null;
  dependencies: { packageManager: string; engines: {...}; ... };
  implicitConventions: Array<{ pattern: string; confidence: number; evidence: string }>;
  identificationConfidence: number;
}
```

**Key Decision:** Include both explicit constraints (from config) AND implicit conventions (inferred from code samples).

---

### 3. Designed DocumentationReaderWorker

```typescript
interface DocumentationReaderInput {
  projectRoot: string;
  taskContext: string;
  docFiles: Array<{ path: string; content: string; type: string }>;
  specificQuestions?: string[];
  budget: { maxDocTokens: number; maxResponseTokens: number };
}

interface DocumentationReaderResult {
  projectOverview: { name: string; purpose: string; ... } | null;
  developmentSetup: { installCommand: string; buildCommand: string; ... } | null;
  architecture: { overview: string; keyComponents: [...]; ... } | null;
  relevantSections: Array<{ heading: string; content: string; relevanceScore: number; ... }>;
  answeredQuestions: Array<{ question: string; answer: string; confidence: number; ... }>;
  unansweredQuestions: string[];
  documentationQuality: { level: string; coverage: [...]; gaps: [...] };
  readerConfidence: number;
}
```

**Key Decision:** Worker assesses documentation quality AND identifies gaps - useful for Human Sync decisions.

---

### 4. Created Complete Foreman Synthesis Prompt

The Sonnet-tier prompt that synthesizes all worker outputs into ContextPackage.

**Key Responsibilities:**
1. VALIDATE worker outputs (check contradictions, flag low confidence)
2. PRIORITIZE files (combine relevance across workers)
3. MERGE patterns and constraints (deduplicate, resolve conflicts)
4. QUALITY GATE decision (confidence < 0.7 → human-sync)
5. PACKAGE FORMAT (fit within token budget)

**Critical Rules in Prompt:**
- Package must fit within token budget
- Include file excerpts (20-50 lines), not full content
- If confidence < 0.7, MUST recommend human-sync
- List ALL uncertainties - don't hide gaps

---

### 5. Clarified File Content Flow Between Waves

**Gap I Found:** FileDiscovery returns paths, PatternExtraction needs content. Who reads files?

**Solution:** Foreman owns file I/O, not workers.

```
WAVE 1 (Parallel): FileDiscovery + WebResearch + DocumentationReader
    ↓
CONTENT LOADING (Foreman): Read files from FileDiscovery results
    ↓
WAVE 2 (Parallel): PatternExtraction + DependencyMapper + ConstraintIdentifier
    ↓
SYNTHESIS (Foreman): Combine all results → ContextPackage
```

**Key Design Decision:** Workers are purely LLM agents. They process what they're given. Foreman handles all I/O.

---

## What I Explicitly Did NOT Do

1. Design DependencyMapperWorker (i[2] mentioned it but didn't spec it)
2. Create the actual Haiku test harness (Phase 0 implementation)
3. Write TypeScript code (this is planning-only)
4. Challenge implementation phases (they look solid)

---

## Challenges & Validations

### What I Validated from Previous Passes

1. **Wave-based dispatch** - Still the right call. Simpler than dynamic dependency resolution.
2. **Single Foreman** - Correct. Coordination overhead not worth it.
3. **Phase 0 first** - Critical. Must validate Haiku capability before building fleet.
4. **Retry count of 1** - Sensible for parse errors.

### Minor Enhancement Identified

WebResearch might sometimes need Wave 1 results (e.g., "implement OAuth with same library we use elsewhere").

**Recommendation:** Allow Foreman to trigger ADDITIONAL WebResearch in Wave 2 if FileDiscovery reveals specific technologies. Not a full restructure - just flexibility.

```typescript
if (wave1.fileDiscovery.detectedTechnologies?.includes('existing-auth-lib')) {
  const additionalResearch = await webResearchWorker.execute({
    query: `${detectedLib} best practices`,
    context: { ...task, specificLib: detectedLib }
  });
}
```

---

## Updated Success Criteria Checklist

| Criterion | Status | Notes |
|-----------|--------|-------|
| Detailed Worker Specifications | **6/6 Complete** | FileDiscovery (i[1]), Pattern (i[2]), WebResearch (i[2]), Constraint (i[3]), Documentation (i[3]), Dependency (needs i[4]) |
| Foreman Orchestration Design | **Complete** | Wave structure, content flow, synthesis prompt |
| Tier Assignment Matrix | **Complete** | i[2] did this with fallbacks |
| Cost Projection Model | **Complete** | i[2] did this |
| Implementation Phases | **Complete** | i[2] did this (6 phases) |
| Validation Plan | **Complete** | i[2] did this |
| Context Window Management | **Complete** | i[3] solved this |

**One Gap Remaining:** DependencyMapperWorker specification

---

## For i[4]-v2

**Your options** (pick based on judgment):

### Option A: Design DependencyMapperWorker
The last worker without full specification. Should analyze import/export relationships, identify critical dependencies, trace module boundaries.

### Option B: Design the Haiku Test Harness (Phase 0 Detail)
Phase 0 requires testing Haiku capability. Design:
- What 10 test cases per worker type?
- How do we measure accuracy?
- What's the evaluation rubric?

### Option C: Stress-Test the Context Budget System
I proposed budgets but didn't validate them. Questions:
- Are my token estimates realistic?
- What happens at budget boundaries?
- Should budgets be configurable per project size?

### Option D: Challenge My Context Management Approach
I might be wrong. Alternatives:
- Should we pre-index codebases into a search layer?
- Is hierarchical discovery actually necessary, or overkill?
- Are there simpler approaches I missed?

### Option E: Write the Implementation Specification
We have all the pieces. Time to write the detailed implementation spec that Forever Workflow will use to build this.

---

## Open Questions

1. **DependencyMapperWorker scope:** Should it only trace import/export, or also track data flow?

2. **Budget numbers:** I proposed budgets but they're estimates. Need validation.

3. **Haiku context limit:** I assumed ~200k tokens. Verify this is correct for claude-3-5-haiku.

4. **Config file discovery:** My config path list is hardcoded. Should it be dynamic?

---

## Artifacts

- **This handoff**: `/workspace/projects/the-forge/handoffs/i3-v2-handoff.md`
- **Mandrel context**: Will store after writing

---

*The enemy is premature convergence. I've solved the hard problem but my solution should be challenged. Push.*
