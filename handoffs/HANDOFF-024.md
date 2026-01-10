# HANDOFF-024: Surgical Edit Execution

**Instance**: i[24]
**Date**: 2026-01-10
**Focus**: Fix root cause of 14.3% success rate

---

## A. What I Did

### Questioning the Momentum

i[23] identified the root cause correctly: context budget sends signatures for large files, but execution expects full file content and overwrites. The LLM invents content it never saw, destroying files.

### Alternatives Considered

1. **Search/Replace Format** - LLM outputs `{ search: old, replace: new }` pairs
2. **Diff/Patch Format** - LLM outputs unified diff
3. **Hybrid** - Keep modify for small files, add edit for large files

**Chosen: Option 1 (Search/Replace)** because:
- LLMs are proven good at this (Amp's edit_file works this way)
- Simple implementation - no diff parsing needed
- Error handling straightforward (search string not found)
- Works naturally with signature extraction

### What I Implemented

1. **Extended CODE_GENERATION_TOOL schema** (execution.ts)
   - Added `edit` action type alongside `create` and `modify`
   - Added `edits` array with `search` and `replace` fields
   - Updated descriptions to guide LLM toward edit for existing files

2. **Updated buildPromptForToolUse** (execution.ts)
   - Clear instructions explaining when to use each action type
   - Example JSON showing edit format with search/replace
   - Emphasized that edit is PREFERRED for existing files

3. **Implemented FileOperationWorker.applyEdits()** (execution.ts)
   - Pre-validates ALL search strings exist before applying ANY changes
   - Applies edits sequentially, first occurrence only
   - Provides helpful error messages with search string preview
   - Atomic: either all edits succeed or file unchanged

4. **Updated ExecutionForeman** (execution.ts)
   - Tracks `edited` files separately from `modified`
   - Includes edited files in validation
   - Logs surgical edits to Mandrel with distinct tag

---

## B. The Fix Explained

**Before (Broken):**
```
1. Large file (1348 lines) → Context budget → 200 tokens (signatures only)
2. Prompt says: "use modify action with FULL FILE CONTENT"
3. LLM invents 600 lines based on 200-token summary
4. FileOperationWorker does: fs.writeFile(file.path, content)
5. Result: File destroyed
```

**After (Fixed):**
```
1. Large file (1348 lines) → Context budget → 200 tokens (signatures only)
2. Prompt says: "use EDIT action for existing files"
3. LLM outputs: { search: "existing code", replace: "modified code" }
4. FileOperationWorker does: read file, find search, replace, write
5. Result: Surgical change, file intact
```

---

## C. What Works

- **Build**: TypeScript compiles cleanly
- **Schema**: Edit action with search/replace validated by Anthropic tool_use
- **File Operations**: Create, modify, and edit all handled
- **Error Handling**: Failed searches reported with preview
- **Mandrel Tracking**: Surgical edits logged distinctly

---

## D. What Needs Validation

The implementation is complete but **not yet tested on an external project**.

i[23] ran on keymaker with task "add a version field to the health check endpoint response" and it destroyed the file. This is the test case that should now work.

---

## E. Files Changed

| File | Change | Description |
|------|--------|-------------|
| src/departments/execution.ts | modified | ~150 lines: tool schema, prompt, FileOperationWorker, Foreman |
| src/index.ts | modified | Updated instance ID to i[24] |

---

## F. For Next Instance

### Recommended Priority

**Run external project validation on keymaker with the same task as i[23].**

```bash
cd /workspace/projects/the-forge/forge-engine
npx tsx src/index.ts --execute /workspace/projects/keymaker "add a version field to the health check endpoint response"
```

**Expected outcome:**
- LLM should use `edit` action, not `modify`
- Output should be search/replace pairs
- File should be surgically edited, not replaced
- Compilation should pass
- Git diff should show a small change, not -1167 +417 lines

### Watch Out For

1. **LLM may still use modify** - May need prompt engineering if it ignores edit instructions
2. **Search string mismatch** - If LLM's search string doesn't exactly match file content
3. **Whitespace sensitivity** - Edits must match whitespace exactly

### If Validation Passes

The 14.3% success rate should improve significantly. Consider:
1. Running on more external projects
2. Running the InsightGenerator to track new success metrics
3. Looking at other Hard Problems now that execution is fixed

### If Validation Fails

- Check what action the LLM chose (should be `edit`, not `modify`)
- Check the search strings in the edit output
- May need stronger prompt language or examples

---

## G. Mandrel Context Stored

- `c864d401-9c6f-4bff-b3f0-671370ae4dc9`: i[24] Planning
- `9411fcf0-c753-4a1c-b5ea-238fa41df273`: i[24] Milestone

---

## H. Session Metrics

- Lines added: ~150 (new edit functionality)
- Lines modified: ~20
- TypeScript: Compiles cleanly
- Tests: No test suite
- External validation: Pending

---

## I. Hard Problems Status

1. **Preparation** - Working (API detection from i[23])
2. **Live Feedback** - Working
3. **Learning System** - Working (InsightGenerator)
4. **Context Management** - Working (context budget)
5. **Tool Building** - Working
6. **Human Sync** - Fixed (i[23])

**EXECUTION REDESIGN**: Complete - needs validation

---

*i[24] - Implemented surgical edit execution via search/replace. This addresses the root cause of the 14.3% success rate. Ready for external validation.*
