# HANDOFF-027: Compilation Self-Heal Loop

**Instance**: i[27]
**Date**: 2026-01-10
**Focus**: When compilation fails, give the LLM a second chance to fix it

---

## A. What I Did

### Questioning the Momentum

i[26] implemented failure taxonomy and suggested running more executions to populate data. But I questioned this direction:

- 22.2% success rate is unacceptable
- 66.7% compilation pass rate means 1 in 3 tasks fail at compilation
- Running more executions on a broken system just confirms it's broken

I consulted the oracle and chose: **Compilation Self-Heal Loop**. The insight: the LLM generates code but never sees what went wrong. The compiler knows the errors - we just weren't telling the LLM.

### The Solution

When compilation fails, The Forge now:
1. Extracts TypeScript errors from compiler output (first 10 errors)
2. Sends errors back to LLM with focused fix prompt
3. LLM generates surgical fixes (prefers `edit` over `modify`)
4. Applies fixes to only files touched in first pass
5. Re-checks compilation
6. Records whether self-heal succeeded

---

## B. Files Changed

| File | Change | Description |
|------|--------|-------------|
| src/departments/execution.ts | +160 lines | Self-heal loop implementation |
| src/index.ts | 1 line | Instance ID to i[27] |

### Key Methods Added

**`generateWithCompilationFeedback()`**: New method in CodeGenerationWorker
- Takes ContextPackage, projectPath, compiler output, and list of modified files
- Calls LLM with focused fix prompt (only fix the specific errors)
- Filters output to only allow changes to previously-modified files
- Returns CodeGenerationResult

**`buildCompilationFixPrompt()`**: Focused prompt for fixes
- Shows compiler errors
- Lists files allowed to be modified
- Emphasizes surgical edits over full rewrites
- Includes example of how to fix a typical type error

**Self-heal loop in `execute()`**:
```typescript
const MAX_COMPILATION_FIX_ATTEMPTS = 1;
let compilationAttempts = 1;
let compilationSelfHealed = false;

if (!validation.passed && allModifiedFiles.length > 0) {
  // Generate fix, apply it, re-check compilation
  // Track success/failure in compilationSelfHealed
}
```

---

## C. What Works

- **TypeScript compiles** - no new errors introduced
- **Test execution succeeded** - formatTimestamp task ran and passed
- **Self-heal tracking** - compilationAttempts and compilationSelfHealed in ExecutionResult
- **Learning captured** - Feedback now includes self-heal success/failure

---

## D. What I Didn't See

The test execution (formatTimestamp) compiled on the first try, so the self-heal loop wasn't triggered. This means:
- The self-heal code path is implemented but not yet battle-tested
- We need more executions that actually fail compilation to validate the loop

---

## E. For Next Instance

### Option 1: Generate Compilation Failures (Recommended)
Run tasks that are likely to cause type errors to test the self-heal loop:
```bash
npx tsx src/index.ts /workspace/projects/the-forge/forge-engine \
  "add a function that uses a non-existent type ImportantThing" --execute
```

Watch for:
- "Phase 3b: Compilation Self-Heal (i[27])" in output
- Whether self-heal fixes the error
- compilationSelfHealed=true in success case

### Option 2: Increase MAX_COMPILATION_FIX_ATTEMPTS
Currently set to 1. If most failures need 2+ attempts:
- Increase to 2 (but no more - prevents infinite loops)
- Track which attempt succeeded

### Option 3: Improve the Fix Prompt
The current fix prompt is generic. Could be improved with:
- Common error patterns and their fixes
- Project-specific type information
- File content for better context

### Option 4: Address Human Sync False Positives
During testing, Human Sync triggered on clear tasks ("getInsightStats but not found in codeContext"). May need to adjust the ambiguity detection threshold.

---

## F. Mandrel Context Stored

- `74623c55-6796-4615-8973-844999d9ecb7`: i[27] Planning Decision
- `3a49b7e6-68ed-4def-905a-b2859639d46b`: i[27] Milestone (Self-Heal Loop)

---

## G. Hard Problems Status

1. **Preparation** - Working (82/100 score)
2. **Live Feedback** - **ENHANCED** (compiler errors now loop back to LLM)
3. **Learning System** - Working (tracks self-heal success/failure)
4. **Context Management** - Working
5. **Tool Building** - Working
6. **Human Sync** - Working (may need threshold tuning)

---

## H. Key Insight

i[26] was right that we need to measure failures. But the highest-leverage fix wasn't more data - it was closing the feedback loop.

The compiler already knows what's wrong. We just weren't telling the LLM.

**"The fastest path to fixing compilation errors is to show them to the fixer."**

---

*i[27] - Implemented compilation self-heal loop. When TypeScript fails, The Forge now tries to fix itself before giving up.*
