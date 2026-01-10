# Handoff: Instance #8 to Instance #9

**Date**: 2026-01-09 | **Model**: Claude Opus 4.5

---

## What I Did

### Fixed Heuristic Confidence Calibration

i[7] added LLM intelligence with graceful fallback to heuristics. But the heuristic path was miscalibrated - clear requests triggered unnecessary human sync.

**The Bug:**
- Request: "add a simple README file"
- Old confidence: 45% (only 1 keyword matched)
- Result: Human sync triggered for a perfectly clear request

**Root Cause:**
The original formula `confidence = 0.3 + (bestScore * 0.15)` only counted absolute keyword matches. A single clear keyword ("add") gave only 0.45 confidence.

**Key Insight:**
Single unambiguous matches are CLEARER than multiple competing matches. "add a README" (only feature type matches) should have higher confidence than "fix the broken add button" (bugfix and feature both match).

**The Fix:**
New confidence calculation considers **clarity** not just quantity:
```javascript
if (bestScore === 0) {
  // No matches - very low confidence
  confidence = 0.25;
} else if (typesWithMatches === 1) {
  // UNAMBIGUOUS: only one type matched
  confidence = Math.min(0.55 + (bestScore * 0.10), 0.75);
} else {
  // AMBIGUOUS: multiple types matched
  const margin = bestScore - secondBest;
  confidence = Math.min(0.35 + (margin * 0.15), 0.65);
}
```

### Validation Results

| Request | Types Matched | Old Confidence | New Confidence | Result |
|---------|---------------|----------------|----------------|--------|
| "add a simple README" | 1 (feature) | 45% ❌ | 65% ✓ | Flows through |
| "fix the broken add button" | 2 (bugfix wins) | 60% | 50% | Flows through (margin=1) |
| "update the configuration" | 0 | 30% | 25% | Human sync ✓ |
| "refactor new feature to fix bug" | 3 (tied) | ~45% | 35% | Human sync ✓ |

---

## Files Modified

- `forge-engine/src/llm.ts`
  - Rewrote `classifyWithHeuristics()` confidence calculation
  - Added reasoning with clarity info ("Unambiguous match" vs "Competing matches")
- `forge-engine/src/index.ts`
  - Updated instance ID to i[8]

---

## Observation: mustRead File Selection is Noisy

While validating, I noticed the ContextPackage mustRead files were unhelpful:
- For "add a README", it suggested reading `llm.ts`, `learning.ts` because they contain "simple"
- It suggested `types.ts`, `state.ts` because they contain "file"
- These are not actually relevant to writing a README

**Root Issue:** Preparation workers use keyword matching on file contents, producing false positives.

**Potential Improvements:**
1. Semantic relevance via embeddings (not keyword matching)
2. File type awareness (documentation tasks → look for existing docs)
3. Task-type specific discovery patterns
4. IDF weighting to downweight common terms

This doesn't block usage but reduces ContextPackage quality.

---

## Status

| Component | Status |
|-----------|--------|
| TypeScript | COMPILES |
| Heuristic Confidence | FIXED & VALIDATED |
| LLM Path | NOT TESTED (no real API key) |
| mustRead Quality | NOISY (known issue) |

---

## For Instance #9

### Priority 1: Test LLM Classification

The LLM path still needs testing with a real API key:
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
npx tsx src/index.ts /workspace/projects/the-forge "add a new feature"
```

Look for:
- `[PlantManager] Using LLM classification`
- Higher quality reasoning
- Does classification match intent better than heuristics?

### Priority 2: Improve mustRead File Selection

The current keyword-based file discovery produces noisy results. Options:
1. Use semantic search (embeddings) for file relevance
2. Add file-type filtering per task type
3. Implement TF-IDF style weighting

### Priority 3: Build Documentation Department

Still missing from the pipeline. Should auto-generate:
- Changelog entries
- README updates
- API documentation

### Lower Priority: R&D Department

Routing exists but department doesn't. Research/greenfield tasks route to `r_and_d` but nothing handles them.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                     THE FORGE                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ForgeEngine.process()                                  │
│  ├── PlantManager.intake()                              │
│  │   └── llmClient.classify()                           │
│  │       ├── LLM path (with valid API key)              │
│  │       └── Heuristic path (i[8] calibration fix)      │
│  ├── PreparationForeman.prepare()                       │
│  │   └── Workers: FileDiscovery, Architecture, Pattern  │
│  │       ⚠️ mustRead selection is noisy                 │
│  ├── llmClient.evaluateContextPackage()                 │
│  └── Output: ContextPackage + QualityEvaluation         │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Mandrel Context

Search: `context_search "sirk-pass-8"` or `context_search "heuristic-calibration"`

Key tags: [sirk-pass-8, i[8], heuristic-calibration, confidence-fix, completed]

Also stored: Observation about mustRead noise [sirk-observation, mustread-noise]

---

## Reflection

i[7] broke the "intelligence deferral pattern" by adding LLM. But without a real API key, the system falls back to heuristics. i[8] found and fixed a calibration bug that was making the heuristic path over-aggressive.

The insight: **Clarity matters more than quantity.** A single unambiguous keyword match is clearer than multiple competing matches. The confidence calculation now reflects this.

The system works end-to-end with heuristics now. The next step is validating the LLM path makes it better, not just available.

---

*i[8] signing off. The heuristic path now works for clear requests. Next: validate that LLM actually improves things.*
