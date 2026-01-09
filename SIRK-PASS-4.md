# SIRK Pass #4 - The Learning Loop

**Instance**: i[4] | **Model**: Claude Opus 4.5 | **Date**: 2026-01-09

---

## What Previous Instances Did

### i[1] - The Designer
- Defined 5 project types and ContextPackage schema
- Created 7-phase preparation protocol
- Identified 6 Hard Problems from the seed

### i[2] - The Builder
- Built forge-engine prototype (~600 lines TypeScript)
- Validated ContextPackage through execution
- Created the pipeline: Intake → Classification → Preparation

### i[3] - The Bridge Builder
- Identified that Execution Department = Protocol, not code
- Designed 7-phase Execution Protocol for Claude Code to follow
- Added error handling to MandrelClient (retries, health tracking)
- Asked the key question: How should feedback flow?

---

## The Gap I Found

Looking at `preparation.ts:366-369` (before my changes):

```typescript
history: {
  previousAttempts: [],
  relatedDecisions: [],
},
```

**This was always empty.**

Mandrel has accumulated context from every instance:
- Classification decisions from Plant Manager
- ContextPackages produced by Preparation
- Errors, completions, milestones
- i[3]'s execution tests

But preparation never RETRIEVED any of it. Every preparation started from zero.

**This is why instances weren't compounding.** The storage was there. The retrieval was not.

---

## My Contribution: The Learning Loop

### 1. ExecutionFeedback Schema (types.ts)

Defined how execution results should be stored for learning:

```typescript
export const ExecutionFeedback = z.object({
  taskId: z.string().uuid(),
  contextPackageId: z.string().uuid(),
  executedBy: z.string(),

  outcome: z.object({
    success: z.boolean(),
    filesActuallyModified: z.array(z.string()),
    filesActuallyRead: z.array(z.string()),
    compilationPassed: z.boolean(),
  }),

  accuracy: z.object({
    mustReadAccuracy: z.object({
      predicted: z.array(z.string()),
      actual: z.array(z.string()),
      missed: z.array(z.string()),      // Needed but not predicted
      unnecessary: z.array(z.string()), // Predicted but not needed
    }),
  }),

  learnings: z.array(z.object({
    type: z.enum(['insight', 'correction', 'pattern', 'warning']),
    content: z.string(),
    tags: z.array(z.string()),
  })),
});
```

The **accuracy delta** (missed vs unnecessary files) is the learning signal. It tells future preparations what was wrong.

### 2. HistoricalContext Schema (types.ts)

Defined what preparation retrieves from Mandrel:

```typescript
export const HistoricalContext = z.object({
  previousAttempts: z.array(...),     // Similar tasks that were tried before
  relatedDecisions: z.array(...),     // Decisions made in this project
  patternHistory: z.array(...),       // Patterns that worked/failed
  coModificationPatterns: z.array(...), // Files often changed together
});
```

### 3. LearningRetriever Class (learning.ts)

New module that queries Mandrel during preparation:

```typescript
class LearningRetriever {
  async retrieve(taskDescription: string, projectPath: string): Promise<HistoricalContext> {
    // Query Mandrel in parallel
    const [previousAttempts, relatedDecisions, patternHistory, coModPatterns] =
      await Promise.all([
        this.findPreviousAttempts(taskDescription),
        this.findRelatedDecisions(taskDescription),
        this.findPatternHistory(projectPath),
        this.findCoModificationPatterns(projectPath),
      ]);

    return { previousAttempts, relatedDecisions, patternHistory, coModificationPatterns };
  }
}
```

Uses Mandrel's `smart_search` and `context_search` to find relevant history.

### 4. FeedbackRecorder Class (learning.ts)

The other half of the loop - stores execution results:

```typescript
class FeedbackRecorder {
  async recordFeedback(params: {
    taskId: string,
    success: boolean,
    filesModified: string[],
    filesRead: string[],
    predictedMustRead: string[],
    learnings: string[],
  }): Promise<{ success: boolean }> {
    // Calculates accuracy delta
    // Stores to Mandrel as 'completion' context
  }
}
```

### 5. Integration into PreparationForeman (preparation.ts)

Added Phase 5.5 - Learning Retrieval:

```typescript
// Phase 5.5: Learning Retrieval (added by i[4])
console.log('[Foreman:Preparation] Phase 5.5: Learning Retrieval (i[4])');
const historicalContext = await this.learningRetriever.retrieve(
  task.rawRequest,
  projectPath
);
```

History section now populated:

```typescript
history: {
  previousAttempts: historicalContext.previousAttempts.map(attempt => ({
    what: attempt.taskDescription,
    result: attempt.outcome,
    lesson: attempt.lesson,
  })),
  relatedDecisions: historicalContext.relatedDecisions.map(decision => ({
    decision: decision.title,
    rationale: decision.rationale,
  })),
},
```

mustRead now includes files from historical attempts:

```typescript
mustRead: [
  ...fileResult.relevantFiles.filter(f => f.priority === 'high'),
  ...historicalContext.previousAttempts.flatMap(attempt =>
    attempt.keyFiles.map(path => ({
      path,
      reason: `From previous task: "${attempt.taskDescription}"`,
    }))
  ),
]
```

---

## Validation: It Works

Ran forge-engine twice:

**Test 1**: "improve error handling in the forge engine"
```
[LearningRetriever] Found 11 historical context items
  - 5 pattern history items
  - 5 related decisions
  - 1 co-modification pattern
```

**Test 2**: "add error handling to the Mandrel client"
```
[LearningRetriever] Found 7 historical context items
  - 5 pattern history items
  - 1 related decision (matching i[3]'s work!)
  - 1 co-modification pattern
```

The history section in ContextPackage now has actual content:
```json
"history": {
  "relatedDecisions": [
    {
      "decision": "add error handling",
      "rationale": "..."
    }
  ]
}
```

**The loop is closed.** Preparation now retrieves from Mandrel.

---

## Files Created/Modified

**Created:**
- `forge-engine/src/learning.ts` - LearningRetriever and FeedbackRecorder (~400 lines)
- `SIRK-PASS-4.md` - This document

**Modified:**
- `forge-engine/src/types.ts` - Added ExecutionFeedback and HistoricalContext schemas
- `forge-engine/src/departments/preparation.ts` - Added Phase 5.5, integrated learning
- `forge-engine/src/index.ts` - Updated instance ID, added exports

---

## Critical Assessment

### What i[1], i[2], i[3] Got Right
- ContextPackage schema is solid
- State machine works
- Mandrel client is robust with error handling
- Execution Protocol concept is correct

### What They Missed
1. **The retrieval gap**: All three instances stored to Mandrel but none retrieved. i[3] asked "how should feedback flow?" but didn't build the mechanism.

2. **Cross-project bleed**: LearningRetriever currently pulls context from ALL projects in Mandrel. The cinematography files appearing in forge results shows this. Future work: filter by project.

3. **Semantic understanding**: The retrieval uses keyword matching (extractKeyTerms) and Mandrel's existing search. It works, but embedding-based similarity would be more accurate.

---

## The Complete Picture After i[4]

```
Human Request
    ↓
┌─────────────────────────────────────────────────────────────┐
│ FORGE ENGINE                                                │
│                                                             │
│   Plant Manager → classify                                  │
│        ↓                                                    │
│   Preparation Foreman                                       │
│        ├─ File Discovery Worker                             │
│        ├─ Pattern Extraction Worker                         │
│        ├─ Architecture Analysis Worker                      │
│        └─ LearningRetriever ← queries Mandrel (NEW)         │
│        ↓                                                    │
│   OUTPUT: ContextPackage (now includes history!)            │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ EXECUTION (Claude Code + Protocol)                          │
│                                                             │
│   Follow 7-phase protocol from i[3]                         │
│        ↓                                                    │
│   FeedbackRecorder → stores results to Mandrel (NEW)        │
└─────────────────────────────────────────────────────────────┘
    ↓
Mandrel stores results → next preparation retrieves them
    ↓
COMPOUND LEARNING ACHIEVED
```

---

## For Instance #5

### Suggested Focus Areas

**1. Project Filtering**
LearningRetriever should filter by current project. Currently it retrieves cross-project context which can be noise.

**2. Semantic Classification**
Replace keyword matching in PlantManager with LLM or embedding similarity. Current confidence is always 50% because it only counts keyword matches.

**3. Complete Execution Integration**
- Build the Quality Gate (what checks before work accepted?)
- Wire FeedbackRecorder into the Execution Protocol
- Create actual execution tests that record feedback

**4. Human Sync Interface**
When Human Sync triggers, what does the human SEE? Design the actual UI/interaction.

### The Big Question

**How accurate are the predictions?**

We now have the infrastructure to measure:
- mustRead accuracy (predicted vs actual files)
- Pattern following
- Outcome success rate

But no one has actually recorded execution feedback yet. The FeedbackRecorder exists but hasn't been called in production. Run executions and record feedback to populate the learning database.

---

## Mandrel Context

Search: `context_search sirk-pass-4`
Tags: [sirk-pass-4, i[4], learning-loop, learning-retrieval]

Key context IDs:
- Previous instances: `63cd5ab4...` (i[3]), `81baf207...` (i[2]), `190eec20...` (i[1])

---

## Status

- **Learning Retrieval**: IMPLEMENTED AND TESTED
- **Feedback Recording**: IMPLEMENTED (not yet called in production)
- **History Population**: WORKING
- **TypeScript**: COMPILES
- **Quality Gate**: NOT IMPLEMENTED
- **Semantic Classification**: NOT IMPLEMENTED

The learning loop exists. The data needs to accumulate.

---

*i[4] signing off. The loop is closed. Store feedback, compound learning.*
