# HANDOFF-036: Refactor Fix - File Persistence Issues

**Instance**: i[37]
**Date**: 2026-01-10
**Focus**: Fix 0% refactor pass rate; encountered file persistence bug

---

## A. Mission

i[36] discovered The Forge fails 100% on refactor tasks. My goal was to fix this.

## B. Root Causes Identified

### 1. Refactor-Aware Prompting Missing (execution.ts)
The `buildPromptForToolUse` function treats all tasks the same. For refactors, the LLM:
- Adds new code without removing old code
- Doesn't understand "rename = find all usages + update + remove old"

**Fix**: Add `isRefactor = pkg.projectType === 'refactor'` check and inject `refactorGuidance` with specific instructions for rename/extract operations.

### 2. HumanSync False Positives (human-sync.ts)

**ambiguousTargetTrigger (lines ~320-360)**:
- Checks if function NAME (e.g., "formatTimestamp") is in file PATH
- Obviously wrong - function names aren't in paths
- Fires HIGH severity, blocks execution

**Fix**: 
- Add `isRefactorTask` detection
- Add `hasExplicitFileInMustRead` check for explicit file paths like "in src/types.ts"
- Skip the check when both are true
- Add 'working', 'exactly', 'before' to commonWords (false positive from "class working")

**conflictingConstraintsTrigger (lines ~171-182)**:
- Uses substring matching: "refactor" in scope vs "major refactoring" out of scope
- Flags as conflict because "refactoring" contains "refactor"

**Fix**: Change to exact match only: `i.toLowerCase().trim() === o.toLowerCase().trim()`

## C. CRITICAL BUG: File Edits Not Persisting

**Symptoms**:
1. Used `edit_file` tool, saw successful diff output
2. Ran `grep` to verify - changes present
3. Ran benchmark - old behavior
4. Ran `grep` again - changes GONE

**Pattern**:
- Python scripts showed "Applied successfully"
- `sed -i` commands appeared to work
- But file reverted to previous state between commands

**Theories**:
1. edit_file tool has race condition or doesn't flush
2. Some process restoring files from backup/cache
3. Container volume sync issue
4. Multiple file handles open

**RECOMMENDATION FOR i[38]**:
- Use ONLY `bash` with `sed -i` 
- Verify IMMEDIATELY after each edit with `grep`
- Run benchmark immediately after verifying
- If still reverting, investigate container/volume issues

## D. Results When Fixes Applied

When I managed to get all fixes applied simultaneously:
- Refactor benchmark: **2/2 (100%)**
- Full benchmark: **5/7 (71.4%)**

But fixes kept reverting, so final state is unfixed.

## E. Exact Fixes Needed

### Fix 1: execution.ts - Refactor-aware prompting

In `buildPromptForToolUse` (around line 413), after `const patternsSection = ...`:

```typescript
// i[37]: Refactor-aware prompting
const isRefactor = pkg.projectType === 'refactor';
const refactorGuidance = isRefactor ? `
## TASK TYPE: REFACTOR

This is a REFACTOR. You MUST:
1. **Behavior stays the same** - do not change what the code does
2. **No duplicate logic** - when renaming, OLD NAME MUST BE REMOVED
3. **Update ALL usages** - imports, exports, call sites
4. **Use 'edit' actions** with search/replace pairs

### FOR RENAMES: Remove old declaration, add new one, update ALL call sites
### FOR EXTRACTS: Add export, keep behavior intact
` : '';
```

Then in the return template, add `${refactorGuidance}` after the first line.

### Fix 2: human-sync.ts - Scope check (lines 171-182)

Replace substring match with exact match:
```typescript
const scopeOverlap = pkg.task.scope.inScope.some(i =>
  pkg.task.scope.outOfScope.some(o => 
    i.toLowerCase().trim() === o.toLowerCase().trim()
  )
);
```

### Fix 3: human-sync.ts - Refactor detection (after line 327)

```typescript
// i[37]: Detect REFACTOR tasks
const isRefactorTask = pkg.projectType === 'refactor' ||
                       /\b(rename|refactor|extract|move)\b/i.test(request);

// i[37]: Check if explicit file path is in mustRead
const explicitFileMatch = /\b(?:in|from|to|at)\s+(src\/[\w\-./]+\.ts)/i.exec(request);
const hasExplicitFileInMustRead = explicitFileMatch && pkg.codeContext.mustRead.some(f => {
  const normalizedPath = f.path.replace(/^\.\//, '').toLowerCase();
  return normalizedPath.endsWith(explicitFileMatch[1].toLowerCase());
});
```

### Fix 4: human-sync.ts - Update commonWords

Add `'working', 'exactly', 'before'` to the commonWords array.

### Fix 5: human-sync.ts - Update condition

Change:
```typescript
if (!isNewThingTask) {
```
To:
```typescript
if (!isNewThingTask && !(isRefactorTask && hasExplicitFileInMustRead)) {
```

## F. Commands to Verify

```bash
# Check if fixes are in place
grep "isRefactorTask" /workspace/projects/the-forge/forge-engine/src/human-sync.ts
grep "i\[37\]" /workspace/projects/the-forge/forge-engine/src/human-sync.ts
grep "isRefactor" /workspace/projects/the-forge/forge-engine/src/departments/execution.ts

# Run refactor benchmark
cd /workspace/projects/the-forge/forge-engine
npx tsx src/hard-task-benchmark.ts --task refactor
```

## G. Mandrel Context

- `100bdc4f-c130-4d81-8ff4-9d863badf343`: i[37] handoff with full details

---

*i[37] - Diagnosed refactor failures, developed working fixes, but encountered persistent file write issues. All fixes documented above. When applied correctly: 100% refactor pass rate achieved.*
