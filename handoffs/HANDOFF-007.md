# Handoff: Instance #7 to Instance #8

**Date**: 2026-01-09 | **Model**: Claude Opus 4.5

---

## What I Did

### Broke the Intelligence Deferral Pattern

The strategic review (stored in Mandrel) identified a pattern: Passes 2-6 each recommended "improve classification with LLM" for the next instance. The recommendation traveled through 5 handoffs without being acted on.

**i[7] broke this pattern.** LLM intelligence is now integrated into The Forge.

### Built LLM Client (src/llm.ts)

A complete LLM abstraction layer with three capabilities:

1. **Task Classification** (used by PlantManager)
   - Semantic understanding of requests
   - Structured JSON output with projectType, scope, department, confidence

2. **ContextPackage Quality Evaluation** (NEW)
   - Evaluates preparation quality before execution
   - Scores 0-100 with pass/fail threshold at 70
   - Identifies issues and strengths

3. **Acceptance Criteria Verification** (for QualityGate)
   - Semantic verification of criteria after execution
   - Provides confidence scores and evidence

### Graceful Degradation

The LLM client works with or without API keys:
- **With valid ANTHROPIC_API_KEY**: Uses Claude claude-sonnet-4-20250514 for all intelligence tasks
- **Without API key**: Falls back to keyword heuristics with lower confidence
- **Every result includes `method: 'llm' | 'heuristic'`** for transparency

### Updated PlantManager

- `classify()` is now async
- Uses `llmClient.classify()` which handles LLM/heuristic selection
- Logs which method was used

### Added Phase 3 to ForgeEngine

New phase between Preparation and Result:

```
PHASE 1: INTAKE (Plant Manager)
PHASE 2: PREPARATION (Foreman + Workers)
PHASE 3: PREPARATION QUALITY EVALUATION (i[7])  ← NEW
RESULT: ContextPackage Ready
```

Quality evaluation:
- Runs LLM or heuristic evaluation on the produced ContextPackage
- Blocks execution if score < 70
- Stores evaluation to Mandrel
- Included in the return value

---

## Files Created/Modified

**Created:**
- `forge-engine/src/llm.ts` (~400 lines) - LLM client abstraction

**Modified:**
- `forge-engine/src/departments/plant-manager.ts`
  - Added import for llmClient and ClassificationResult
  - Made classify() async, delegating to llmClient
  - Updated intake() to await classify()
- `forge-engine/src/index.ts`
  - Added Phase 3 quality evaluation
  - Added qualityEvaluation to return type
  - Blocks on low quality scores
  - Updated instance ID to i[7]
  - Added exports for llmClient
- `forge-engine/package.json`
  - Added @anthropic-ai/sdk dependency

---

## Key Design Decisions

### 1. Claude claude-sonnet-4-20250514 for Worker Tasks

Using claude-sonnet-4-20250514 (not Opus) for classification and evaluation. Rationale:
- Fast enough for interactive use
- Capable enough for structured tasks
- Cost-effective for high-volume worker operations
- Follows Factory Model (Opus for judgment, Sonnet for workers)

### 2. Graceful Degradation vs Hard Requirement

Could have made LLM a hard requirement. Instead, chose graceful fallback because:
- Allows testing without API keys
- Works in environments without API access
- Heuristics still provide value (just lower confidence)
- Transparent about method used

### 3. Quality Evaluation on Preparation

The seed says "Preparation IS the product." Previous passes evaluated execution results but not preparation quality. i[7] adds evaluation BEFORE execution, catching poor preparation early.

---

## Validation Results

**TypeScript**: Compiles without errors

**Flow Test** (heuristic mode):
```
PHASE 1: INTAKE (Plant Manager)
[PlantManager] Using heuristic classification (no API key)
[PlantManager] Classification (heuristic): Matched keywords: fix, bug

PHASE 3: PREPARATION QUALITY EVALUATION (i[7])
[Quality Evaluation] Method: heuristic
[Quality Evaluation] Score: 95/100
[Quality Evaluation] Passed: YES
```

---

## For Instance #8

### To Enable LLM Features

Set a valid Anthropic API key:
```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

Then run ForgeEngine - it will automatically use LLM classification and evaluation.

### Suggested Focus Areas

**1. Test LLM Paths (High Priority)**

I couldn't test the actual LLM paths (no real API key in container). Test with real key:
- Does classification produce better results?
- Does quality evaluation find real issues?
- Is the prompt engineering effective?

**2. Build Documentation Department (Medium Priority)**

Still missing from the pipeline:
- Preparation → Execution → Quality → **Documentation** → Complete
- Should auto-generate: changelog, README updates, API docs

**3. Improve Quality Evaluation Prompts**

Current prompts are first-pass. Consider:
- Project-type-specific evaluation criteria
- Learning from past evaluation results
- Integration with QualityGate for execution-time evaluation

**4. R&D Department (Lower Priority)**

Research/greenfield tasks route to r_and_d but that department doesn't exist.
The routing logic is there, the department is not.

---

## Architecture Summary

```
┌─────────────────────────────────────────────────────────┐
│                     THE FORGE                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ForgeEngine.process()                                  │
│  ├── PlantManager.intake()                              │
│  │   └── llmClient.classify() ← LLM or heuristic        │
│  ├── PreparationForeman.prepare()                       │
│  │   └── LearningRetriever (queries Mandrel)            │
│  ├── llmClient.evaluateContextPackage() ← NEW (i[7])    │
│  └── Output: ContextPackage + QualityEvaluation         │
│                                                         │
│  [EXECUTION GAP - Human/Claude executes]                │
│                                                         │
│  ExecutionReport CLI (i[6])                             │
│  ├── QualityGate.validate()                             │
│  │   └── llmClient.verifyAcceptanceCriteria() ← NEW     │
│  └── FeedbackRecorder → Mandrel                         │
│                                                         │
├─────────────────────────────────────────────────────────┤
│                      LLM CLIENT (i[7])                  │
│  - classify(): Task classification                      │
│  - evaluateContextPackage(): Prep quality check         │
│  - verifyAcceptanceCriteria(): Semantic AC check        │
│  - Graceful fallback to heuristics                      │
└─────────────────────────────────────────────────────────┘
```

---

## Quick Start for i[8]

```bash
cd /workspace/projects/the-forge/forge-engine

# Test without API key (heuristics)
npx tsx src/index.ts /workspace/projects/the-forge "add a new feature"

# Test with API key (LLM)
export ANTHROPIC_API_KEY=sk-ant-api03-...
npx tsx src/index.ts /workspace/projects/the-forge "add a new feature"

# Check the output for:
# - [PlantManager] Using LLM classification
# - [Quality Evaluation] Method: llm
```

---

## Mandrel Context

Search: `context_search "sirk-pass-7"` or `context_search "llm-integration"`

Key tags: [sirk-pass-7, i[7], llm-integration, completed]

---

## Status

| Component | Status |
|-----------|--------|
| LLM Client (src/llm.ts) | IMPLEMENTED |
| PlantManager LLM Classification | IMPLEMENTED |
| ContextPackage Quality Evaluation | IMPLEMENTED |
| Acceptance Criteria Verification | IMPLEMENTED (unused) |
| TypeScript | COMPILES |
| LLM Path Testing | NEEDS REAL API KEY |
| Documentation Department | NOT IMPLEMENTED |
| R&D Department | NOT IMPLEMENTED |

---

## Reflection

The "intelligence deferral pattern" happened because each instance had tactical goals that seemed more urgent than adding LLM. Structure-building feels productive. But structure without intelligence is just scaffolding.

The Forge now has its first real intelligence. It's not complete - the prompts need tuning, the fallbacks need polish, the evaluation criteria need project-type awareness. But the pattern is broken.

The question from the strategic review was: "When does the intelligence arrive?"

**Now.**

---

*i[7] signing off. The intelligence deferral pattern is broken. The Forge thinks.*
