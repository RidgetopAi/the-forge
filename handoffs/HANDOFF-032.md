# HANDOFF-032: Fixed Surgical Edit Root Cause - Benchmark 40% → 60%

**Instance**: i[32]
**Date**: 2026-01-10
**Focus**: Fix the dominant failure mode from i[31]'s benchmark

---

## A. What I Did

### Questioning i[31]'s Direction

i[31] identified the root cause (surgical edit mismatch) and recommended "provide full file content to code_generation for target files." I questioned this and evaluated alternatives:

1. **Provide full file content for all mustRead files** (i[31]'s suggestion)
   - Rejected as-is: May blow context budget on large files. Doesn't address the conceptual distinction.

2. **Validate edit before applying + fallback to create_file**
   - Rejected: Doesn't fix root cause. create_file fallback destroys content LLM never saw.

3. **Read target files fresh at code generation time** (CHOSEN)
   - Key insight: Context budget is for UNDERSTANDING (signatures fine for reference files). But EDIT TARGETS need FULL CONTENT.
   - Modified execution.ts to detect mustRead files that got signatures/truncated and read their full content.

### The Fix

Added 40 lines to `execution.ts` in `CodeGenerationWorker.generate()`:

```typescript
// i[32]: For mustRead files (edit targets), if we got signatures/truncated,
// read full content so LLM can generate valid search strings
if (isMustRead && (extractionMethod === 'signatures' || extractionMethod === 'truncated')) {
  const fullContent = await fs.readFile(file.path, 'utf-8');
  // Use full content instead of extracted version
}
```

---

## B. Files Changed

| File | Change | Description |
|------|--------|-------------|
| src/departments/execution.ts | +40 lines | i[32] full-override logic for mustRead files |
| src/index.ts | ~1 line | Instance ID to i[32] |
| src/benchmark.ts | ~1 line | Instance ID to i[32] |

---

## C. What Works

### Benchmark Improvement

| Instance | Pass Rate | Notes |
|----------|-----------|-------|
| i[31] | 40% (2/5) | file_edit_no_match on Tasks 2, 3, 5 |
| i[32] | 60% (3/5) | Task 2 now passes; 3, 5 blocked by HumanSync |

### The Fix in Action

Log output proves it's working:
```
[Worker:CodeGeneration] /workspace/.../types.ts: signatures -> full-override (i[32] fix)
[Worker:CodeGeneration] i[32] fix: Overrode 2 file(s) to full content for surgical edits
```

### Task 2 Root Cause Fixed

- Before: Failed with `file_edit_no_match` - LLM generated edit assuming full content but had signatures
- After: **PASSED** - LLM receives actual file content, generates valid surgical edits

---

## D. What I Didn't Build

1. **HumanSync bypass for benchmark** - Tasks 3 and 5 still fail because HumanSync fires "Ambiguous Target Detection" at HIGH urgency
2. **Fix for HumanSync trigger logic** - The trigger fires when function name in task isn't found in codeContext, but this is false positive (we're ADDING the function)

---

## E. For Next Instance

### Remaining Benchmark Failures (2/5)

Tasks 3 and 5 fail with HumanSync blocking, not file_edit_no_match:

```
[HumanSync] HIGH: Unable to identify what files/components to modify.
Context: Task mentions "isSlowStep" but not found in codeContext...
```

The trigger is **correct behavior** but wrong application:
- When ADDING a new function, of course it's not in codeContext yet
- The trigger should only fire if we're trying to MODIFY something we can't find

### Option 1: Fix Ambiguous Target Trigger (Recommended)

In `human-sync.ts`, the "Ambiguous Target Detection" trigger should distinguish:
- **ADD tasks**: New things won't be in codeContext - that's expected
- **MODIFY tasks**: If target isn't found, that's ambiguous

Detection hint: Task description contains "Add" at the start.

### Option 2: Add Benchmark Mode

Add `--auto-respond` flag to benchmark that automatically responds to HumanSync requests with "let_forge_decide" option.

### Option 3: Lower Trigger Urgency

Change "Ambiguous Target Detection" from HIGH to MEDIUM urgency so it warns but doesn't block.

---

## F. Mandrel Context Stored

- `aeda318b-fc13-4ccb-8893-cebfe5d4cd53`: i[32] Planning Decision
- `0d53de1d-804c-4e21-a7be-9b4c6138cc46`: i[32] Milestone

---

## G. Hard Problems Status

1. **Preparation** - Working (85/100 on successful tasks)
2. **Live Feedback** - Working (self-heal loop)
3. **Learning System** - Working (traces flowing)
4. **Context Management** - **FIXED** (surgical edit root cause solved)
5. **Tool Building** - Working
6. **Human Sync** - **NEW ISSUE**: Over-triggers on ADD tasks

---

## H. Key Insight

The distinction between **understanding context** and **editing context** is crucial:

- **Understanding context**: Signatures, summaries, and examples are fine. Budget constraints apply.
- **Editing context**: Must have full, exact file content. No budget shortcuts allowed.

The fix respects this distinction by letting context budget handle related examples (signatures OK) while ensuring edit targets get full content.

---

*i[32] - Fixed surgical edit mismatch. Benchmark improved 40% → 60%. Remaining failures are HumanSync false positives on ADD tasks.*
