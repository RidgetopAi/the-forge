# i[1]-v2 → i[2]-v2 Handoff

**Instance**: i[1]-v2 (first planning pass)
**Date**: 2026-01-10
**Mission**: Validate architecture, design Worker abstraction, propose Foreman protocol

---

## What I Did

### 1. Validated the Three-Tier Model

The model is **conceptually correct** but I identified a critical assumption:

**The seed assumes Haiku workers "just work."** This is untested.

- Can Haiku reliably extract code patterns?
- Can Haiku trace dependency graphs?
- What's the accuracy drop vs Sonnet?

**Recommendation**: Add "Worker Capability Validation" as Phase 0. Don't commit to architecture without empirical data.

### 2. Challenged Tier Boundaries

The seed says "use Opus for classification" but:
- Most tasks are obvious (feature, bugfix, refactor)
- Only edge cases need judgment ("make this faster" - what type?)

**My proposal**: Start with Sonnet for classification. Escalate to Opus only when confidence < threshold. Test and measure.

### 3. Designed FileDiscoveryWorker Completely

```typescript
// Input
interface FileDiscoveryContext {
  taskDescription: string;
  projectRoot: string;
  fileIndex: Array<{ path: string; size: number; lastModified: string }>;
  heuristics?: { keywords: string[]; likelyDirectories: string[] };
}

// Output
interface FileDiscoveryResult {
  relevantFiles: Array<{
    path: string;
    relevanceScore: number;  // 0-1
    reason: string;
  }>;
  suggestedExpansions?: string[];
}
```

**Key decisions:**
- Workers are STATELESS
- Two-phase discovery (paths first, content second) - solves context budget
- Confidence scores on all outputs
- 1 retry on parse failure, then escalate

### 4. Proposed Wave-Based Foreman Protocol

Instead of dynamic dependency resolution (over-engineered), use hard-coded waves:

```
Wave 1 (parallel):  FileDiscovery + WebResearch
Wave 2 (parallel):  Pattern + Dependency + Constraint workers
Wave 3 (Sonnet):    Foreman synthesis
```

### 5. Found 7 Gaps in the Seed

| Gap | Impact | My Proposal |
|-----|--------|-------------|
| Haiku capability untested | Workers might fail, erasing savings | Phase 0 validation |
| Worker result validation | Foreman can't verify completeness | Spot-checks + Quality dept |
| Context budget unspecified | Large codebase overflow | Two-phase discovery |
| Trivial task overhead | Worker dispatch > direct exec | Complexity threshold |
| WebResearch tier unclear | Web extraction might exceed Haiku | Test, may need Sonnet |
| Error propagation undefined | Empty results vs failures | Confidence thresholds |
| Tier boundary thresholds missing | "Uncertainty" isn't a number | Define: confidence < 0.7 → escalate |

### 6. Created Initial Tier Assignment Matrix

See Mandrel context `13aeae45-337e-455b-a858-e712d938b382` for full matrix.

Key uncertainties marked with `?`:
- Web content extraction (Haiku or Sonnet?)
- Code generation quality at Haiku tier
- Classification (Opus or Sonnet-with-escalation?)

---

## What I Explicitly Did NOT Do

1. Design the other 5 workers (Pattern, Dependency, Constraint, Web, Documentation)
2. Create implementation phases
3. Define numeric thresholds for tier boundaries
4. Build the Haiku capability test suite

---

## For i[2]-v2

**Your mission options** (pick based on your judgment):

### Option A: Complete Worker Specifications
Design the remaining workers with the same rigor as FileDiscoveryWorker:
- PatternExtractionWorker
- DependencyMapperWorker
- ConstraintIdentifierWorker
- WebResearchWorker
- DocumentationReaderWorker

### Option B: Define Tier Boundaries
The seed says "uncertainty thresholds" but gives no numbers. Define:
- What confidence score triggers escalation?
- What task complexity skips workers entirely?
- When does Sonnet classification escalate to Opus?

### Option C: Create Implementation Phases
Turn this design into buildable phases:
1. What's Phase 1?
2. What's testable after each phase?
3. What are dependencies between phases?

### Option D: Challenge My Work
I might be wrong. If you see a fundamental problem with:
- Wave-based dispatch (should it be dynamic?)
- Two-phase discovery (is there a better approach?)
- Haiku capability assumption (should we test NOW before planning further?)

Say so. **Bold thinking means challenging previous passes too.**

---

## Open Questions I Couldn't Answer

1. **What's the right retry count for workers?** I said 1, but maybe 0 (fail fast) or 2 (more resilient) is better.

2. **Should Foreman be one instance or multiple?** Current design: one Foreman per task. But could we have a Foreman per wave for more parallelism?

3. **How do we handle worker timeouts?** I didn't address this. What if Haiku hangs?

4. **What's the minimum viable implementation?** Could we start with just FileDiscoveryWorker + Foreman and add workers incrementally?

---

## Artifacts

- **Mandrel context**: `13aeae45-337e-455b-a858-e712d938b382`
- **This handoff**: `/workspace/projects/the-forge/handoffs/i1-v2-handoff.md`

---

*The enemy is premature convergence. Don't accept my work just because I did it. Push.*
