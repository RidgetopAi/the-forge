# HANDOFF-022: Anthropic tool_use for Reliable Code Generation

**Instance**: i[22]
**Date**: 2026-01-10
**Focus**: Eliminating JSON parsing failures through structured output

---

## A. What I Did

### Questioning the Momentum

i[21]'s direction: "Run more executions to gather data with improved error capture"

I questioned this. Running more executions on an unreliable system just generates more failed data. The REVIEW-003 said "focus on reliability, not features." The core issue is the **67% unknown_failure rate**.

### Alternatives Considered

1. **Run more executions** - just generates more potentially-failed data
2. **Add a test suite** - good but doesn't fix underlying fragility
3. **Anthropic tool_use for code generation** - eliminates JSON parsing issues entirely

### Chosen: Alternative 3 (tool_use)

**Rationale:**
- InsightGenerator already recommends: "Consider using Anthropic tool_use for structured code output"
- Anthropic tool_use guarantees valid JSON - LLM MUST conform to schema
- No parsing needed - the API handles it
- This is a fundamental reliability improvement to the most critical component

### Implementation

**1. Added tool definition (execution.ts)**
```typescript
const CODE_GENERATION_TOOL: Anthropic.Tool = {
  name: 'submit_code_changes',
  description: 'Submit the generated code changes for the task.',
  input_schema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string' },
            action: { type: 'string', enum: ['create', 'modify'] },
            content: { type: 'string' },
          },
          required: ['path', 'action', 'content'],
        },
      },
      explanation: { type: 'string' },
    },
    required: ['files', 'explanation'],
  },
};
```

**2. Modified CodeGenerationWorker.generate()**
- Changed from `messages.create()` to use `tools` and `tool_choice: { type: 'any' }`
- Extract tool_use block from response instead of parsing text
- Input is already validated by Anthropic's API - no JSON parsing needed
- Kept legacy parsing as fallback (in case model doesn't use tool)

**3. New buildPromptForToolUse() method**
- Same context as before, but without JSON output instructions
- Tells model to "use the submit_code_changes tool to provide your code"

### Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| src/departments/execution.ts | modified | Added tool_use implementation (~150 lines) |
| src/index.ts | modified | Updated instance ID to i[22] |

---

## B. What Works

**Verified with `npx tsc --noEmit`**: Compiles without errors

**Verified with test run**: Preparation and classification work. The LLM call with tool_use is wired up. The pipeline proceeds to Human Sync check before execution.

---

## C. What Doesn't Work / Blockers

**Human Sync false positive**: The AmbiguousTargetTrigger has a bug - it looks for patterns like "method called" and then checks if "called" is in mustRead. This is a false positive that blocks execution for tasks that say things like "add a method called X".

**Execution not fully tested**: I couldn't get a full execution cycle due to Human Sync blocking. The tool_use code path is implemented but needs real-world validation.

---

## D. Key Decisions Made

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Use tool_use over text parsing | Guaranteed valid JSON structure | Text with robust parsing (fragile), Multiple JSON repair strategies (still fragile) |
| Keep legacy parsing as fallback | In case model unexpectedly doesn't use tool | Remove completely (too risky) |
| Force tool use with tool_choice: 'any' | Ensures structured output | tool_choice: 'auto' (model might not use tool) |

---

## E. For Next Instance

### Immediate Priority

1. **Fix the Human Sync false positive** in `human-sync.ts`:
   - Line ~322-331: The regex `\b(file|function|class|method|component)\s+(\w+)/i` matches "method called"
   - Then checks if "called" is in mustRead (it's not), causing false trigger
   - Fix: exclude common words like "called", "named", "defined" from the check

2. **Run a full execution** to verify tool_use works end-to-end
   ```bash
   cd /workspace/projects/the-forge/forge-engine
   npx tsx src/index.ts /workspace/projects/the-forge/forge-engine "add a simple logging helper" --execute
   ```

3. **Re-run insights** after successful executions to measure improvement

### Context You'll Need

- The tool_use implementation is complete but untested in full execution
- Legacy JSON parsing kept as fallback in `parseResponse()`
- The `buildPromptForToolUse()` is nearly identical to `buildPrompt()` but without JSON output instructions

### Watch Out For

- If tool_use fails, check if the model returns text instead of tool_use block
- The fallback to `parseResponse()` should catch this case
- Human Sync triggers may need tuning for better precision

### Open Questions

- Will tool_use significantly improve success rate?
- Should we remove the legacy JSON parsing entirely once tool_use is validated?
- Is the Human Sync AmbiguousTargetTrigger too aggressive in general?

---

## F. Mandrel Context Stored

- `1aacc077-fd3f-4689-abde-d47c0a76ae82`: i[22] Planning - Questioning momentum, tool_use decision

---

## G. Session Metrics

- Lines added: ~150 (tool definition + new methods)
- Lines modified: ~30 (updated generate method)
- TypeScript: Compiles cleanly
- Tests: No test suite exists yet
- Build status: Passing

---

*i[22] - Implemented Anthropic tool_use for reliable structured code generation. The fragile JSON parsing bottleneck is addressed; validation needed.*
