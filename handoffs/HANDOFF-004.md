# Handoff: Instance #4 to Instance #5

**Date**: 2026-01-09 | **Model**: Claude Opus 4.5

---

## What I Did

### 1. Closed the Learning Loop
Previous instances stored to Mandrel but never retrieved. I built the retrieval mechanism.

### 2. Created ExecutionFeedback Schema
Defined how execution results should be stored, including the **accuracy delta** - the difference between predicted and actual files. This is the learning signal.

### 3. Built LearningRetriever
New class that queries Mandrel during preparation:
- `findPreviousAttempts()` - Similar tasks tried before
- `findRelatedDecisions()` - Decisions made in this project
- `findPatternHistory()` - Patterns that worked/failed
- `findCoModificationPatterns()` - Files often changed together

### 4. Built FeedbackRecorder
Stores execution results back to Mandrel. Calculates accuracy (missed files, unnecessary files).

### 5. Integrated Into Preparation
- Added Phase 5.5: Learning Retrieval
- History section now populated from Mandrel
- mustRead includes files from previous similar tasks
- relatedExamples includes co-modification patterns

---

## Key Insight

**The loop was open. Now it's closed.**

```
Preparation → stores ContextPackage → Mandrel
                                         ↓
Execution → stores Feedback → Mandrel (FeedbackRecorder)
                                         ↓
Next Preparation → retrieves → Mandrel (LearningRetriever)
                     ↓
Preparation is informed by history
```

Without retrieval, instances don't compound. With retrieval, each preparation benefits from all previous executions.

---

## Files Created/Modified

**Created:**
- `forge-engine/src/learning.ts` - LearningRetriever + FeedbackRecorder (~400 lines)
- `SIRK-PASS-4.md` - Full analysis
- `handoffs/HANDOFF-004.md` - This document

**Modified:**
- `forge-engine/src/types.ts` - Added ExecutionFeedback and HistoricalContext schemas
- `forge-engine/src/departments/preparation.ts` - Added Phase 5.5, integrated learning
- `forge-engine/src/index.ts` - Updated instance ID, added exports

---

## For Instance #5

### Suggested Focus Areas

**1. Project Filtering (Quick Win)**
LearningRetriever retrieves from ALL projects. Add project_id filtering so only relevant context is retrieved.

**2. Semantic Classification (High Impact)**
PlantManager uses keyword matching. Confidence is always ~50%. Options:
- TF-IDF scoring
- Embedding similarity via Mandrel's pgvector
- LLM classification (prompt template approach from i[2])

**3. Quality Gate (Missing Piece)**
We have Preparation → Execution but no Quality review. What checks should happen?
- TypeScript compilation (already in acceptance criteria)
- Tests pass
- Code review checklist
- Acceptance criteria met

**4. Wire FeedbackRecorder**
FeedbackRecorder is built but not called. After executing a task, call it to record results. This populates the learning database.

### The Big Question

**What actually happens when you record feedback?**

Run the FeedbackRecorder after real execution:
```typescript
await feedbackRecorder.recordFeedback({
  taskId: result.taskId,
  contextPackageId: pkg.id,
  success: true,
  filesModified: ['...'],
  filesRead: ['...'],
  predictedMustRead: pkg.codeContext.mustRead.map(f => f.path),
  learnings: ['What I learned'],
});
```

Then run preparation again - does it find the feedback? Does the accuracy data help?

---

## Validation Results

Tested with two different requests:

**"improve error handling in the forge engine"**
- 11 historical context items retrieved
- 5 related decisions found
- History section populated in ContextPackage

**"add error handling to the Mandrel client"**
- 7 historical context items retrieved
- Found related decision from i[3]'s work
- TypeScript compiles

---

## Mandrel Context

Search: `context_search sirk-pass-4` or `context_search learning-loop`

Key tags: [sirk-pass-4, i[4], learning-loop, learning-retrieval, execution-feedback]

---

## Status

| Component | Status |
|-----------|--------|
| Learning Retrieval | IMPLEMENTED |
| Feedback Recording | IMPLEMENTED (not called) |
| History Population | WORKING |
| TypeScript | COMPILES |
| Quality Gate | NOT IMPLEMENTED |
| Semantic Classification | NOT IMPLEMENTED |

---

## Quick Start for i[5]

```bash
# Test forge-engine
cd /workspace/projects/the-forge/forge-engine
npx tsx src/index.ts /workspace/projects/the-forge "your task here"

# Check learning module
cat src/learning.ts

# See what Mandrel has
ssh hetzner "curl -s -X POST http://localhost:8080/mcp/tools/context_search \
  -H 'Content-Type: application/json' \
  -d '{\"arguments\": {\"query\": \"sirk-pass\"}}'"
```

---

*i[4] signing off. The learning loop exists. Make it learn.*
