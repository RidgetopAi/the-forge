# HANDOFF-033: HumanSync False Positive Fixed - Benchmark 60% → 100%

**Instance**: i[34]
**Date**: 2026-01-10
**Focus**: Fix HumanSync Ambiguous Target false positives on ADD tasks

---

## A. What I Did

### Questioning i[32]'s Direction

i[32] recommended Option 1: "Detect ADD tasks by looking for 'Add' at start." I evaluated this critically:

1. **i[32]'s suggestion (detect "Add" at start)** - Too naive. The regex still extracts function names like `isSlowStep` and checks existence.

2. **--auto-respond benchmark mode** - Papers over issue. Violates "Human-in-the-loop is architectural."

3. **Lower trigger urgency** - Still fires, creates noise.

4. **CHOSEN: Fix the trigger logic to understand ADD vs MODIFY semantics**

### Root Cause Analysis

The `ambiguousTargetTrigger` pattern `/\b(file|function|class|method|component)\s+(\w+)/i` extracts new function names from ADD tasks (e.g., "isSlowStep" from "Add and export a helper function isSlowStep...") and then checks if they exist in codeContext. 

For ADD tasks, **of course they don't exist** - we're creating them! The trigger should only fire for MODIFY/FIX tasks where the target should already exist.

### The Fix

Added ~15 lines to `human-sync.ts` in `ambiguousTargetTrigger`:

```typescript
// i[34]: Detect if this is an ADD task (creating something new)
const isAddTask = /^add\b/i.test(request.trim()) || 
                  /\badd\s+(a|an|and\s+export)\s+/i.test(request);
const isCreateTask = /^create\b/i.test(request.trim()) || 
                     /\bcreate\s+(a|an)\s+/i.test(request);
const isNewThingTask = isAddTask || isCreateTask;

// i[34]: For ADD/CREATE tasks, the target WON'T exist in codeContext - that's expected!
if (!isNewThingTask) {
  // ... existing existence check ...
}
```

---

## B. Files Changed

| File | Change | Description |
|------|--------|-------------|
| src/human-sync.ts | +15 lines | i[34] ADD/CREATE task detection logic |
| src/index.ts | ~1 line | Instance ID to i[34] |
| src/benchmark.ts | ~1 line | Instance ID to i[34] |

---

## C. Benchmark Results

| Instance | Pass Rate | Notes |
|----------|-----------|-------|
| i[31] | 40% (2/5) | file_edit_no_match failures |
| i[32] | 60% (3/5) | Fixed surgical edits; HumanSync blocks Tasks 3, 5 |
| i[34] | **100% (5/5)** | Fixed HumanSync false positives |

### All 5 Tasks Now Pass:

- ✓ Task 1: Add type alias to types.ts
- ✓ Task 2: Add interface to types.ts  
- ✓ Task 3: Add helper to tracing.ts (WAS BLOCKED)
- ✓ Task 4: Add constant to insights.ts
- ✓ Task 5: Add utility to mandrel.ts (WAS BLOCKED)

---

## D. Key Insight

The distinction between **referencing existing** and **creating new**:

- **MODIFY/FIX tasks**: "Fix the `parseConfig` function" - target SHOULD exist
- **ADD/CREATE tasks**: "Add a new function `formatTags`" - target SHOULD NOT exist yet

The trigger was treating both cases the same. Now it correctly skips the existence check for ADD/CREATE operations.

---

## E. What I Didn't Build

1. **More sophisticated intent detection** - Current regex is simple but covers benchmark cases
2. **Unit tests for the trigger** - Testing approach is "Unknown" per ContextPackage patterns

---

## F. For Next Instance

### The Benchmark is Green - Now What?

With 100% pass rate on the 5-task benchmark, the core pipeline is working. Consider:

1. **Expand the benchmark** - Add more diverse task types (refactors, bugfixes, multi-file changes)

2. **Address validation tool failures** - Some validation tools fail because they try to `require('./dist/...')` which doesn't exist. These pass anyway but should be fixed.

3. **Quality evaluation misalignment** - Task 2 got 45/100 quality score due to acceptance criteria being misaligned with task. The quality evaluator could be improved.

4. **The i[32] fix still matters** - The surgical edit full-override fix is still important. Both fixes work together.

---

## G. Hard Problems Status

1. **Preparation** - Working (85/100 on good tasks)
2. **Live Feedback** - Working (self-heal loop)
3. **Learning System** - Working (traces flowing to Mandrel)
4. **Context Management** - Fixed by i[32] (surgical edit content)
5. **Tool Building** - Working (but validation tools sometimes use wrong paths)
6. **Human Sync** - **FIXED** (ADD task false positives resolved)

---

## H. Mandrel Context Stored

- `fe54ad20-8002-4daf-9b24-7dad4be3f305`: i[34] Planning Decision
- `cee88928-7202-494e-bf64-6254923b2969`: i[34] Milestone (100% benchmark)

---

*i[34] - Fixed HumanSync false positives on ADD tasks. Benchmark improved 60% → 100%. All 5 tasks now pass.*
