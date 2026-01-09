# Handoff: Instance #5 to Instance #6

**Date**: 2026-01-09 | **Model**: Claude Opus 4.5

---

## What I Did

### 1. Fixed Cross-Project Contamination Bug (Critical)

Previous instances stored to Mandrel but the retrieval was pulling data from OTHER projects (ridge-control, forge-studio) into the-forge outputs.

**Root Cause:**
- `mandrel.searchContext()` searches GLOBALLY across all Mandrel projects
- `mandrel.smartSearch()` is project-scoped

**Fix Applied:**
1. Changed all LearningRetriever methods from `searchContext` to `smartSearch`
2. Added `fileExistsInProject()` validation method
3. Added `filterExistingFiles()` to remove non-existent paths
4. Post-process filtering in `retrieve()` removes contaminated results
5. Project path now stored and used for validation

**Evidence of Fix:**
Before: ContextPackages contained `src/cinematography/SceneDirector.ts` (from forge-studio)
After: Only files that exist in the-forge appear in output

### 2. Built Quality Gate Department

Created the missing validation layer between Execution and Completion.

**Quality Checks:**
- TypeScript Compilation (required) - runs `tsc --noEmit`
- Files Exist (required) - validates modified files exist
- Tests Pass (required if tests exist) - runs `npm test`
- Acceptance Criteria (advisory) - checks from ContextPackage
- Pattern Compliance (advisory) - checks for `any` types, TODO markers

**Quality Gate Decision:**
- `approve`: All required checks pass, no optional failures
- `human_review`: Required pass, optional failures exist
- `reject`: Required checks failed

---

## Key Insight

**Mandrel's API design creates a trap.**

`context_search` sounds like it should search the current project, but it searches globally by semantic similarity. Only `smart_search` respects project boundaries.

This is a systemic issue - any future retrieval code needs to use `smart_search` or implement client-side filtering.

---

## Files Created/Modified

**Created:**
- `forge-engine/src/departments/quality-gate.ts` - Quality Gate implementation (~340 lines)
- `handoffs/HANDOFF-005.md` - This document

**Modified:**
- `forge-engine/src/learning.ts` - Contamination fix (~60 lines added)
  - Added `fileExistsInProject()`, `filterExistingFiles()` methods
  - Changed `searchContext` → `smartSearch` in all retrieval methods
  - Added project path tracking and post-process filtering
- `forge-engine/src/state.ts` - Quality Gate support
  - Added `setExecutionResult()` method
  - Added `setQualityResult()` method
  - Updated transitions: `reviewing` can now go directly to `completed`
- `forge-engine/src/index.ts`
  - Updated instance ID to `i[5]`
  - Added QualityGate exports

---

## For Instance #6

### Suggested Focus Areas

**1. Wire Quality Gate into ForgeEngine (High Priority)**

The Quality Gate exists but isn't called. After execution, add:
```typescript
const qualityGate = createQualityGate(this.instanceId);
const qualityResult = await qualityGate.validate(taskId, projectPath, executionResult);
```

**2. Wire FeedbackRecorder (Still Not Called)**

i[4] built FeedbackRecorder but it's never invoked. After Quality Gate:
```typescript
await feedbackRecorder.recordFeedback({
  taskId: result.taskId,
  contextPackageId: pkg.id,
  success: qualityResult.passed,
  filesModified: [...],
  predictedMustRead: pkg.codeContext.mustRead.map(f => f.path),
  learnings: [...],
});
```

**3. Improve Classification (Medium Priority)**

PlantManager uses keyword matching (confidence always ~50%). Options:
- Embedding similarity via Mandrel's pgvector
- Prompt template approach (ask Claude to classify)
- TF-IDF scoring

**4. Documentation Department (Lower Priority)**

The pipeline is: Preparation → Execution → Quality → Documentation → Complete

Documentation Department doesn't exist yet. Should auto-generate:
- Changelog entry
- Updated README (if applicable)
- API documentation (if applicable)

### The Big Question

**How does execution actually happen?**

The Execution Department is a PROTOCOL (from i[3]), not code. Claude Code follows the ContextPackage. But the current flow doesn't capture execution results automatically.

Options:
1. Manual: Human runs Claude Code, then manually calls FeedbackRecorder
2. Semi-auto: ForgeEngine outputs a prompt for Claude Code to follow
3. Full auto: ForgeEngine spawns a Claude Code subprocess (complex)

The Quality Gate expects an `ExecutionResult` - how does that get populated?

---

## Validation Results

Tested with: `"improve error handling in the forge engine"`

**Before Fix (i[4] output):**
```json
"relatedExamples": [
  {"path": "src/cinematography/SceneDirector.ts", ...},
  {"path": "src/cinematography/ZoomController.ts", ...}
]
```

**After Fix (i[5] output):**
```json
"relatedExamples": [
  {"path": "/workspace/projects/the-forge/forge-engine/src/departments/plant-manager.ts", ...},
  {"path": "/workspace/projects/the-forge/forge-engine/src/learning.ts", ...}
]
```

No more cross-project contamination.

---

## Mandrel Context

Search: `context_search sirk-pass-5` or `context_search contamination-fix`

Key tags: [sirk-pass-5, i[5], contamination-fix, quality-gate, completed]

---

## Status

| Component | Status |
|-----------|--------|
| Contamination Fix | IMPLEMENTED & VERIFIED |
| Quality Gate | IMPLEMENTED (not wired in) |
| FeedbackRecorder | IMPLEMENTED (not called) |
| TypeScript | COMPILES |
| Documentation Dept | NOT IMPLEMENTED |
| LLM Classification | NOT IMPLEMENTED |

---

## Quick Start for i[6]

```bash
# Test forge-engine
cd /workspace/projects/the-forge/forge-engine
npx tsx src/index.ts /workspace/projects/the-forge "add a new feature"

# Check quality gate
cat src/departments/quality-gate.ts

# See what Mandrel has
ssh hetzner "curl -s -X POST http://localhost:8080/mcp/tools/context_search \
  -H 'Content-Type: application/json' \
  -d '{\"arguments\": {\"query\": \"sirk-pass-5\"}}'"
```

---

*i[5] signing off. The learning loop is clean. The Quality Gate exists. Wire them together.*
