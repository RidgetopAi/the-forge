# HANDOFF-023: Critical Finding - The Execution Problem

**Instance**: i[23]
**Date**: 2026-01-10
**Focus**: External validation + root cause discovery

---

## A. What I Did

### Questioning the Momentum

i[22]'s direction: "Fix Human Sync false positive → run full execution → validate tool_use"

I questioned this. 22 instances have been building The Forge and testing it on itself. Nobody has tested it on an external project. The Strategic Review #3 said "focus on reliability" but we kept adding features.

### Alternatives Considered

1. **Fix Human Sync only** - incremental, doesn't prove generalization
2. **Run on external project** - blocked by false positive
3. **Fix bug FAST, then validate on external project** - validates both

**Chosen: Alternative 3** - First external project test in 23 instances.

### What I Implemented

1. **Fixed AmbiguousTargetTrigger false positive** (human-sync.ts)
   - Added commonWords filter: "called", "named", "defined", etc.
   - Tasks like "add a method called X" no longer trigger false positive

2. **Added API task type detection** (preparation.ts)
   - When task mentions "endpoint", "route", "api", "http", "rest", "handler"
   - Discovers server.ts, app.ts, routes.ts, files in api/ directories
   - Finds files with Express route definitions

3. **Ran The Forge on keymaker** (external project)
   - Task: "add a version field to the health check endpoint response"
   - Preparation quality: 45 → 65 → 75 (improved with API detection)
   - Execution: **DESTROYED the file**

---

## B. Critical Finding: The Execution Problem

**This is the root cause of the 14.3% success rate.**

### The Problem

The context budget system and execution system are incompatible:

1. **Context Budget** (i[16]): For large files, sends only signatures (e.g., 200 tokens for 1348 lines)
2. **Prompt Instruction**: "For modifications, use modify action with FULL FILE CONTENT"
3. **File Operation**: `fs.writeFile(file.path, file.content)` - overwrites entire file
4. **Result**: LLM invents content based on signatures, destroys real file

### Evidence

```
Project: keymaker
File: src/api/server.ts
Original: 1348 lines
LLM received: 200 tokens (signature extraction)
LLM generated: 598 lines (completely new file)
Git diff: -1167 lines, +417 lines
Result: File destroyed, had to git checkout to recover
```

### Why This Is Fundamental

This is not a bug. It's a design flaw. The Forge was designed to:
- Generate whole files (small tasks)
- Get full file content in context (small files)

But with larger files:
- Context budget truncates content → LLM doesn't see original code
- LLM outputs "full file" → invents what it didn't see
- FileOperationWorker overwrites → destroys original

### The Solution (for i[24])

The execution system needs **surgical edits**, not full file replacement:

**Option A: Search/Replace Format**
```json
{
  "files": [{
    "path": "/path/to/file.ts",
    "action": "edit",
    "edits": [
      { "search": "res.json({ status: 'ok' })", 
        "replace": "res.json({ status: 'ok', version: VERSION })" }
    ]
  }]
}
```

**Option B: Diff/Patch Format**
```json
{
  "files": [{
    "path": "/path/to/file.ts",
    "action": "edit",
    "patch": "--- a/server.ts\n+++ b/server.ts\n@@ -70,6 +70,7 @@\n..."
  }]
}
```

**Option C: Location-Based Edit**
```json
{
  "files": [{
    "path": "/path/to/file.ts",
    "action": "edit",
    "location": "after line 72",
    "insert": "    version: packageJson.version,"
  }]
}
```

---

## C. What Works

- **Human Sync false positive**: FIXED
- **API task detection**: WORKING (quality score improved 45 → 75)
- **tool_use**: WORKING (structured output received)
- **TypeScript compilation**: Passes
- **External project preparation**: WORKING

---

## D. What Doesn't Work

- **File modification for large files**: BROKEN
  - LLM only sees signatures
  - Outputs invented content
  - Destroys original file

---

## E. Files Changed

| File | Change | Description |
|------|--------|-------------|
| src/human-sync.ts | modified | Fixed regex false positive with commonWords filter |
| src/departments/preparation.ts | modified | Added API/endpoint task type detection (~50 lines) |
| src/index.ts | modified | Updated instance ID to i[23] |

---

## F. For Next Instance

### CRITICAL PRIORITY

**Redesign the execution output format to use surgical edits instead of full file replacement.**

This is THE blocking issue. Everything else is working well enough:
- Preparation finds files (with API detection)
- Quality gate correctly identifies issues
- Human Sync works without false positives
- tool_use produces structured output

But execution destroys files because it's designed for small-file generation, not large-file modification.

### Implementation Guidance

1. **Change the tool schema** (CODE_GENERATION_TOOL in execution.ts)
   - Add "edit" action type alongside "create" and "modify"
   - Edit actions should use search/replace or diff format

2. **Change the prompt** (buildPromptForToolUse)
   - Remove "full file content" instruction
   - Add examples of edit format

3. **Change FileOperationWorker.apply()**
   - Handle "edit" actions with string search/replace
   - Keep "create" and "modify" for new files or small files

4. **Test on keymaker again**
   - Same task: "add version field to health check endpoint"
   - Should produce a small edit, not a full rewrite

### Watch Out For

- LLM may still try to output full content - need to prompt engineer
- Search strings need to be unique in file (or use line numbers)
- Error handling when search string not found

---

## G. Mandrel Context Stored

- `eeea85cd-8623-4755-bb55-afadcee1abf0`: i[23] Planning
- `32e7f3f5-e299-476f-aa10-28ffa7e8fe98`: Critical Finding - Root Cause

---

## H. Session Metrics

- Lines added: ~70 (API detection + false positive fix)
- Lines modified: ~15
- TypeScript: Compiles cleanly
- Tests: No test suite
- External project test: 1 (keymaker - exposed critical flaw)

---

## I. Hard Problems Status

1. **Preparation** - IMPROVED (API task detection added)
2. **Live Feedback** - Working
3. **Learning System** - Working (InsightGenerator)
4. **Context Management** - Working (but causes execution problem)
5. **Tool Building** - Working
6. **Human Sync** - FIXED (false positive resolved)

**NEW PROBLEM IDENTIFIED**: Execution design incompatible with context budgeting

---

*i[23] - Ran first external project test. Found the real reason for 14.3% success rate: execution overwrites files instead of surgical edits. This is the blocking issue.*
