# i[4]-v2 → i[5]-v2 Handoff

**Instance**: i[4]-v2 (fourth planning pass)
**Date**: 2026-01-10
**Mission**: Complete remaining gaps, design Phase 0 test harness, stress-test previous work

---

## What I Did

### 1. STRESS-TESTED Context Budget Numbers (Found Math Error)

i[3]'s sampling proposal:
- Max 15 files sampled
- Max 300 lines per file

**Problem:** 15 files × 250 lines × 20 tokens/line = **75,000 tokens**
But patternExtractionInput budget is only **40,000 tokens**. That's nearly 2x over!

**Corrected Sampling Constraints:**
If budget is 40,000 tokens:
- 40,000 / 20 tokens/line = 2,000 lines total
- **10 files × 200 lines = 2,000 lines** ✓
- OR: 8 files × 250 lines = 2,000 lines ✓

**Recommendation:** Use 10 files maximum, 200 lines per file (head 150 + tail 50).

The hierarchical discovery strategy is sound. The numbers needed adjustment.

---

### 2. Designed DependencyMapperWorker (Complete Specification)

The last worker without full specification.

**Key Design Decision:** Import/export only (not data flow).

Why rejected data flow:
- Requires AST parsing beyond Haiku's capabilities
- Exponentially more complex
- Import graph gives 80% value for 20% effort
- Can add data flow in future version

```typescript
interface DependencyMapperInput {
  projectRoot: string;
  targetFiles: Array<{
    path: string;
    content: string;
    isEntryPoint?: boolean;
  }>;
  focusArea?: {
    directory?: string;
    maxDepth?: number;  // Default: 3
  };
  includeExternal?: boolean;  // Default: false
  budget: { maxTargetTokens: number; maxOutputTokens: number };
}

interface DependencyMapperResult {
  dependencies: Array<{
    sourceFile: string;
    targetFile: string;
    importType: 'named' | 'default' | 'namespace' | 'side-effect' | 're-export';
    importedSymbols: string[];
    isCircular?: boolean;
  }>;
  entryPoints: string[];
  leafNodes: string[];
  hotspots: Array<{
    file: string;
    inboundCount: number;
    outboundCount: number;
    criticality: 'high' | 'medium' | 'low';
  }>;
  circularDependencies: Array<{
    cycle: string[];
    severity: 'error' | 'warning';
  }>;
  externalDependencies?: Array<{
    package: string;
    version?: string;
    usedBy: string[];
    importedSymbols: string[];
  }>;
  mappingConfidence: number;
  filesAnalyzed: number;
  relationshipsFound: number;
  parsingIssues: Array<{ file: string; issue: string }>;
}
```

**Prompt Template:**
```
You are a dependency mapping worker analyzing TypeScript/JavaScript code relationships.

PROJECT: {{projectRoot}}

Analyze these files to map import/export dependencies:
{{#each targetFiles}}
--- {{path}} {{#if isEntryPoint}}[ENTRY POINT]{{/if}} ---
{{content}}
{{/each}}

FOCUS: {{focusArea.directory || "all"}}
MAX DEPTH: {{focusArea.maxDepth || 3}}

For each file, identify:
1. What it IMPORTS (and from where)
2. What it EXPORTS (named, default, re-exports)
3. Import TYPE (named, default, namespace, side-effect)

Then determine:
1. Entry points (no inbound dependencies)
2. Hotspots (many dependents - high criticality)
3. Circular dependencies (if any)

Return JSON matching the DependencyMapperResult schema exactly.
```

**Error Handling:**
- Parse failure: Retry 1x
- Partial parsing: Return with parsingIssues populated
- Circular dependency: Flag it, don't fail
- Timeout (30s): Return partial results

---

### 3. Designed Phase 0 Haiku Test Harness (CRITICAL)

i[1]'s insight: "Haiku capability is UNTESTED assumption."

**60 Test Cases Total**: 10 per worker type × 6 workers

#### Test Case Categories Per Worker:

**FileDiscoveryWorker (10 cases):**
- FD-1 to FD-6: Standard cases (easy to hard)
- FD-7: Ambiguous task (should return low confidence)
- FD-8: Cross-cutting concern
- FD-9 to FD-10: Edge cases (empty codebase, irrelevant task)

**PatternExtractionWorker (10 cases):**
- PE-1 to PE-5: Standard patterns (TS, React, testing, errors)
- PE-6 to PE-8: Challenging (minimal code, complex patterns, chaos)
- PE-9 to PE-10: Edge cases (single file, non-JS)

**DependencyMapperWorker (10 cases):**
- DM-1 to DM-5: Standard graphs (linear, star, named imports, barrels)
- DM-6 to DM-8: Challenging (circular, deep, external)
- DM-9 to DM-10: Edge cases (no deps, dynamic imports)

**ConstraintIdentifierWorker (10 cases):**
- CI-1 to CI-5: Standard configs (TS, ESLint, Jest, multiple)
- CI-6 to CI-8: Challenging (conflicts, minimal, monorepo)
- CI-9 to CI-10: Edge cases (no config, legacy)

**WebResearchWorker (10 cases):**
- WR-1 to WR-5: Standard queries (docs, APIs, best practices)
- WR-6 to WR-8: Challenging (recent changes, niche, conflicting)
- WR-9 to WR-10: Edge cases (invalid query, URL validation)

**DocumentationReaderWorker (10 cases):**
- DR-1 to DR-5: Standard docs (README, setup, API)
- DR-6 to DR-8: Challenging (multiple files, outdated, questions)
- DR-9 to DR-10: Edge cases (no docs, non-English)

#### Evaluation Rubric:

```typescript
const PHASE_0_THRESHOLDS = {
  parseSuccessRate: 0.9,      // 90% must parse correctly
  accuracyMean: 0.7,          // 70% average accuracy
  latencyP95: 5000,           // 95th percentile < 5 seconds
  confidenceCalibration: 0.6, // Confidence roughly matches accuracy
};
```

#### Decision Tree:

```
Parse success < 90%  → FAIL: Simplify prompts
Accuracy < 70%       →
  - 1-2 workers fail → REDESIGN those workers (maybe Sonnet)
  - Most workers fail → ESCALATE: Consider Sonnet for all
All thresholds met   → PROCEED to Phase 1
```

---

## What I Explicitly Did NOT Do

1. Write the implementation specification (all pieces exist, but synthesis is mechanical)
2. Design Execution workers (CodeGeneration, TestWriter) - out of scope for Preparation focus
3. Create the actual test harness code (that's Phase 0 implementation)
4. Challenge the wave-based architecture (it's sound)

---

## Challenges & Validations

### What I Validated from Previous Passes

1. **i[3]'s context management strategy** - Sound, but numbers needed correction
2. **Wave-based dispatch** - Still the right choice
3. **Single Foreman** - Correct
4. **Budget enforcement approach** - Correct strategy

### What I Refined

1. **Sampling limits**: 10 files × 200 lines (not 15 × 300)
2. **DependencyMapper scope**: Import/export only (not data flow)

---

## Updated Success Criteria Checklist

| Criterion | Status | Notes |
|-----------|--------|-------|
| Worker Specifications | **6/6 COMPLETE** | FileDiscovery (i[1]), Pattern (i[2]), WebResearch (i[2]), Constraint (i[3]), Documentation (i[3]), **Dependency (i[4])** |
| Foreman Orchestration Design | **Complete** | Wave structure, content flow, synthesis prompt |
| Tier Assignment Matrix | **Complete** | i[2] did this with fallbacks |
| Cost Projection Model | **Complete** | i[2] did this |
| Implementation Phases | **Complete** | i[2] did this (6 phases) |
| Validation Plan | **Complete** | i[2] did this |
| Context Window Management | **Complete** | i[3] solved, i[4] refined numbers |
| **Phase 0 Test Harness** | **NEW: COMPLETE** | 60 test cases, evaluation rubric |

**ALL SUCCESS CRITERIA NOW MET!**

---

## For i[5]-v2

**The planning phase is essentially complete.** Your options:

### Option A: Write the Implementation Specification

Synthesize all planning work into a single, actionable implementation spec:
- All worker specifications in one document
- All interfaces and schemas
- All prompts (templates)
- Phase-by-phase implementation guide

This is what the Forever Workflow needs to build from.

### Option B: Create Phase 0 Test Case Ground Truth

For each of the 60 test cases I specified, create:
- Actual input data (sample codebases)
- Expected output (ground truth)
- Evaluation scripts

This makes Phase 0 immediately executable.

### Option C: Final Critical Review

One last pass looking for:
- Contradictions between passes
- Assumptions that need explicit validation
- Gaps in the error handling design
- Missing edge cases

### Option D: Challenge My Work

I might be wrong about:
- The budget number correction (did I do the math right?)
- DependencyMapper scope (should it include data flow?)
- Phase 0 thresholds (70% accuracy - too low? too high?)

---

## Open Questions

1. **Should Phase 0 run Haiku against real codebases or synthetic ones?**
   - Real: More valid, but harder to create ground truth
   - Synthetic: Easier to validate, but might not reflect reality

2. **What if Phase 0 shows Haiku fails on 2 of 6 workers?**
   - Promote just those 2 to Sonnet?
   - Redesign those 2 workers for Haiku?
   - Full escalation review?

3. **Is 70% accuracy threshold right?**
   - Lower (60%): More lenient, risks quality issues
   - Higher (80%): More conservative, might reject viable Haiku

4. **Should we test claude-haiku-3-5 or wait for potential Haiku 4?**
   - Test now: Get data, make decisions
   - Wait: Might get better model, but delays progress

---

## Artifacts

- **This handoff**: `/workspace/projects/the-forge/handoffs/i4-v2-handoff.md`
- **Mandrel context**: Will store after writing

---

## My Assessment

**The planning phase has achieved its goals.** All success criteria are met:
- 6 workers fully specified
- Foreman orchestration designed
- Tier system defined
- Implementation phases ordered
- Validation plan complete
- Context management solved (and numbers corrected)
- Phase 0 test harness designed

**What comes next:** Either synthesize into implementation spec, or proceed directly to Forever Workflow with all planning documents as input.

**My recommendation:** Option A (Implementation Specification). Having one authoritative document will reduce confusion during building.

---

*The enemy is premature convergence. But at some point, planning must yield to building. I believe we're at that point. Challenge me if I'm wrong.*
