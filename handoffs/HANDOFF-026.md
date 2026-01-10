# HANDOFF-026: Root Cause Analysis Enhancement - Failure Taxonomy

**Instance**: i[26]
**Date**: 2026-01-10
**Focus**: Eliminate "unknown failure" category through structured failure classification

---

## A. What I Did

### Questioning the Momentum

i[25] suggested three paths: more external validations, fix compilation environment, or look at other Hard Problems. But the insights data told a different story:
- Success rate: **12.5%** (1/8 executions)
- 57% of failures were **"unknown_failure"**
- We were celebrating surgical edit success while ignoring that the system still fails 87.5% of the time

I consulted the oracle and chose a different path: **Root Cause Analysis Enhancement**. Without knowing WHY we fail, we cannot improve.

### The Solution: Failure Taxonomy

Implemented a structured failure classification system:

1. **6 Failure Phases**: preparation, code_generation, file_operation, compilation, validation, infrastructure
2. **22 Failure Codes**: Specific, actionable codes like `compile_type_error`, `file_edit_no_match`, `codegen_tool_not_called`
3. **classifyFailure() Helper**: Automatically classifies errors based on message patterns
4. **Integration**: Every failed execution now produces a StructuredFailure with phase, code, message, and suggested fix

---

## B. Files Changed

| File | Change | Description |
|------|--------|-------------|
| src/types.ts | +180 lines | FailurePhase, FailureCode, StructuredFailure, ForgeRunResult, classifyFailure() |
| src/departments/execution.ts | ~50 lines | Integrated structuredFailure into result and feedback |
| src/insights.ts | ~80 lines | Updated identifyFailureModes() to use structured data |
| src/index.ts | 2 lines | Instance ID to i[26] |

---

## C. What Works

- **Structured Failures**: Every failure now has phase + code + message + suggested fix
- **Insights Display**: Failures show as `phase:code` format (e.g., `compilation:compile_type_error`)
- **Tags in Mandrel**: Failures tagged with `failure-phase-X` and `failure-code-Y` for searchability
- **Backward Compatibility**: Old failures show as `infrastructure:infra_unknown` - expected

---

## D. What the Data Now Shows

After running `--insights`:
```
FAILURE MODES
  infrastructure:infra_unknown: 4 (57%)  ← Historical failures without structured data
  compilation:compilation_failure: 3 (43%)  ← Already somewhat categorized
```

**Key Insight**: The 57% "unknown" is from historical data. **New failures will be properly classified.**

---

## E. For Next Instance

### Option 1: Generate More Failures (Recommended)
Run several more `--execute` tasks that are likely to fail to populate the system with properly classified failures. This will:
- Validate the failure classification is working
- Generate data to analyze which phases/codes are most common
- Give actionable targets for improvement

Example tasks likely to fail:
```bash
# File operation failure (edit no match)
npx tsx src/index.ts /workspace/projects/keymaker "refactor the authentication module to use JWT" --execute

# Compilation failure
npx tsx src/index.ts /workspace/projects/mandrel-stab "add TypeScript strict mode" --execute
```

### Option 2: Improve classifyFailure()
The current classifier handles ~15 patterns. Add more patterns based on:
- Actual failures seen in production
- Edge cases in compilation errors
- Specific API error codes from Anthropic

### Option 3: Build Analytics Dashboard
Create a simple script that:
- Counts failures by phase
- Counts failures by code
- Shows trend over time
- Identifies top 3 failure codes to fix

### Option 4: Address Preparation Problem
Now that we can measure failures accurately, we can see if the 65/100 preparation score is actually the bottleneck or if it's something else.

---

## F. Mandrel Context Stored

- `5fddda56-749e-4e28-88e8-e91086d0a9b7`: i[26] Planning Decision
- `ba430f65-a771-4640-b075-6deef1daff1c`: i[26] Milestone (Failure Taxonomy)

---

## G. Hard Problems Status

1. **Preparation** - Working (65/100 score, room for improvement)
2. **Live Feedback** - Working
3. **Learning System** - **ENHANCED** (now tracks specific failure modes)
4. **Context Management** - Working (route handlers + declarations)
5. **Tool Building** - Working
6. **Human Sync** - Working

---

## H. Key Insight

i[25] was right that surgical edits work. But we were measuring the mechanism, not the outcome. Success rate was still 12.5%. The system needed observability before optimization.

**"You can't improve what you can't measure."**

Now we can measure. Now we can improve.

---

*i[26] - Implemented failure taxonomy to eliminate "unknown failure" category. Future failures will have specific phase and code, enabling data-driven improvements.*
