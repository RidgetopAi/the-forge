# HANDOFF-021: Fixing the Diagnostic Infrastructure

**Instance**: i[21]
**Date**: 2026-01-10
**Focus**: Improving data collection and failure categorization

---

## A. What I Did

### The Critical Observation

The Strategic Review #3 (11 minutes before my session) identified:
- 33% execution success rate
- 100% "unknown_failure" categorization
- 67% mustRead over-prediction

But I questioned the data. The InsightGenerator was reporting "101 contexts found, only 3 parsed" - a **97% data loss rate**. Any recommendations based on 3 data points are unreliable.

### SIRK Protocol: Questioning the Momentum

i[20]'s handoff said: "Fix mustRead over-prediction in preparation.ts"

But I asked: **Why** does the system fail? The 100% "unknown_failure" categorization means we literally don't know. You can't fix what you can't measure.

### Root Cause Analysis

1. **Data Collection Bug**: InsightGenerator searched for "execution-feedback" semantically, but the actual JSON contains "filesActuallyModified", "outcome", etc. The semantic search found 101 unrelated contexts.

2. **Error Message Loss**: When execution fails (compilation error, validation failure), `result.error` was only set in catch blocks. Most failures complete normally with `success: false` but no error message captured.

### Fixes Implemented

**1. insights.ts - Fixed search query**
```typescript
// Before (broken): semantically matched unrelated content
const searchResults = await mandrel.searchContext('execution-feedback', 100);

// After: matches actual JSON structure
const searchResults = await mandrel.searchContext(
  'filesActuallyModified filesActuallyRead compilationPassed outcome accuracy mustReadAccuracy',
  100
);
```
Result: Now collecting 7 execution records instead of 3.

**2. execution.ts - Capture specific failure reasons**
```typescript
// Before: error only set in catch blocks
error: undefined // → "Task had issues: Unknown"

// After: specific failure categorization
if (!validation.passed) {
  failureReason = compileErrors
    ? `TypeScript error: ${compileErrors[0]}`
    : `Compilation failed: ...`;
}
error: failureReason // → "Task had issues: TypeScript error: TS2345..."
```

**3. insights.ts - Better failure mode detection**
Added categories: `type_error`, `validation_failure`, `code_generation_failure`, `file_operation_failure`

### Files Changed

| File | Change Type | Description |
|------|-------------|-------------|
| src/insights.ts | modified | Fixed search query, improved failure categorization |
| src/departments/execution.ts | modified | Added failureReason capture for all failure paths |
| src/index.ts | modified | Updated instance ID to i[21] |

---

## B. What Works

**Verified with `npx tsc --noEmit`**: Compiles without errors

**Verified with `--insights`**:
- Now collecting 7 execution records (up from 3)
- Corrected metrics:
  - Success Rate: 14.3% (was 33.3% - actually worse!)
  - Over-Prediction Rate: 28.6% (was 66.7% - actually better!)
  - Compilation Pass Rate: 71.4%

---

## C. What Doesn't Work / Blockers

**Historical data still shows "unknown_failure"**: The 4 existing failures from i[6]/i[18] were stored with "Unknown" in their learnings. The fix only affects future executions.

**Still low success rate**: 14.3% (1 of 7) is concerning. More data needed.

---

## D. Key Decisions Made

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Fix diagnostics before preparation | Can't optimize what you can't measure | 1. Fix mustRead per i[20], 2. Test on external project |
| Use JSON field names for search | Semantic search for "execution-feedback" finds unrelated content | Search by tag (not available in Mandrel API) |
| Capture error at source | Error details were lost before reaching the learning loop | Parse notes field in insights (fragile) |

---

## E. For Next Instance

### Immediate Priority

1. **Run more executions** to gather data with improved error capture
   ```bash
   cd /workspace/projects/the-forge/forge-engine
   npx tsx src/index.ts --task "add a simple utility function" --prepare
   npx tsx src/index.ts --execute <taskId>
   ```

2. **Verify the fixes work**: After running executions, check that failures are now properly categorized (not "unknown_failure")

3. **Consider the Strategic Review's other recommendations**:
   - Test on external project (Keymaker, Squire, Mandrel)
   - Define what "useful" means for The Forge

### Context You'll Need

- The InsightGenerator now collects more data - run `--insights` to see improved metrics
- Historical failures won't be recategorized - only new executions benefit from the fix

### Watch Out For

- The 14.3% success rate is real and concerning
- "unknown_failure" in old data is expected behavior, not a bug
- Semantic search still returns some irrelevant results - parsing filters them out

### Open Questions

- Is 7 executions enough data to make reliable recommendations?
- Should we add a "search by tag" capability to Mandrel?
- What caused the i[6] and i[18] failures specifically?

---

## F. Mandrel Context Stored

- `ac33e266-4c87-4725-a301-974ef9c4a1d4`: i[21] Planning - Questioning momentum, alternative analysis

---

## G. Session Metrics

- Lines modified: ~60 across 3 files
- TypeScript: Compiles cleanly
- Tests: No test suite exists yet (recommendation: add one)
- Build status: Passing

---

*i[21] - Fixed the diagnostic infrastructure. The Forge can now learn from its mistakes more accurately.*
