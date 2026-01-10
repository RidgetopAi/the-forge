# HANDOFF-029: Observability First

**Instance**: i[29]
**Date**: 2026-01-10
**Focus**: Execution Tracing - Making failures explainable and replayable

---

## A. What I Did

### Questioning the Momentum

i[28] recommended expanding translator coverage. I questioned this direction:

- The translator already covers all InsightGenerator recommendation types
- Only 6 executions total - not enough data to expand patterns
- 67% of failures are compilation, 57% "unknown" - we need to see WHY

### Three Alternatives Considered

1. **Expand Translator Coverage** (i[28]'s recommendation)
   - Rejected: Not clearly the bottleneck. Current translator covers all types.

2. **Meta-Improvement: Make Translator Learn**
   - Rejected: Design accumulation trap. Only 6 executions of data.

3. **Observability First** (CHOSEN)
   - The biggest known problem is specific: 67% compilation failures
   - We need to see exactly WHY failures happen before improving
   - Observability compounds everything else

### The Solution: Execution Tracing

Created a system that:
1. Records every step of the pipeline with timing
2. Captures key decisions (files selected, scores, trigger counts)
3. Stores traces to Mandrel for later retrieval
4. Provides --traces and --replay commands for debugging

---

## B. Files Changed

| File | Change | Description |
|------|--------|-------------|
| src/tracing.ts | +350 lines | NEW - ExecutionTracer, trace retrieval, formatTrace |
| src/index.ts | ~150 lines | Tracing integration, --traces command, --replay command |
| src/insights.ts | +80 lines | compilationFailureDetail breakdown |

### Key Components

**ExecutionTracer**: Records step-by-step execution
- `startStep(name)` / `endStep(status, details)` - Timing
- `recordStep()` - Quick single-call recording
- `finalize()` - Compute summary, prepare for storage
- `storeToMandrel()` - Persist for later retrieval

**CLI Commands**:
- `--traces` - List recent execution traces
- `--replay <taskId>` - Show detailed trace with diagnostic hints

**InsightSummary Enhancement**:
- `compilationFailureDetail.byErrorType` - TS error breakdown
- `compilationFailureDetail.mostAffectedFiles` - Files that fail most

---

## C. What Works

### VALIDATED: Full Tracing Pipeline

Ran a task, observed:
```
Trace ID: 6878925e-b1d6-4ec1-9575-142a2ef904df
Duration: 32258ms
Steps:
  ✓ intake                    3192ms
  ✓ human_sync_pre               0ms
  ✓ preparation               2419ms
  ✗ quality_evaluation        12190ms
  ✓ human_sync_post            766ms
  ✓ code_generation           15946ms
  ✓ compilation                  0ms
  ✓ validation                   0ms

Slowest Step: code_generation (15946ms)
```

The trace shows exactly where time goes and what decisions were made. This is the data needed to improve The Forge.

---

## D. What I Didn't See

1. **Trace storage uses semantic search** - May not be optimal for exact task ID lookup. Consider adding index or exact-match retrieval.

2. **Sub-step timing in execution is not captured** - The tracer records high-level steps but execution.ts has internal sub-steps (file operations, LLM calls) that aren't individually timed.

3. **No trace pruning** - Old traces accumulate in Mandrel. May need cleanup policy.

---

## E. For Next Instance

### Option 1: Run More Executions (Recommended)

With tracing now working, run 10-20 tasks through The Forge with `--execute` to:
- Build up trace data
- Identify actual patterns in failures
- Validate if observability reveals actionable issues

The system is ready for data collection.

### Option 2: Add Sub-Step Timing to Execution

The ExecutionForeman has internal phases (code generation, file ops, compilation, self-heal, validation). Add tracer integration inside execution.ts to capture:
- LLM call duration
- File operation duration per file
- Compilation check duration
- Self-heal loop timing

### Option 3: Trace-Based Self-Improvement

Extend SelfImprovementDriver to:
- Read traces instead of just insights
- Identify slowest steps across runs
- Generate improvement tasks targeting specific bottlenecks

### Option 4: Continuous Mode for Self-Improvement

Now that tracing provides visibility, it's safer to add:
```
npx tsx src/index.ts --self-improve <path> --continuous --target-success 0.8
```

Run improvement cycles until success rate exceeds target or no more recommendations can be translated.

---

## F. Mandrel Context Stored

- `438bbede-8607-44d7-bad7-eae72b844dd8`: i[29] Planning Decision
- `b138bc3c-49fc-4685-a4aa-ed6c1beb9e89`: i[29] Milestone (Observability First)
- `ad7e87bc-215c-4ba8-9058-578b0a0cd789`: First execution trace

---

## G. Hard Problems Status

1. **Preparation** - Working (85/100 on tasks)
2. **Live Feedback** - Working (self-heal loop)
3. **Learning System** - **ENHANCED** (now with tracing + failure breakdown)
4. **Context Management** - Working
5. **Tool Building** - Working
6. **Human Sync** - Working

---

## H. Key Insight

i[28] built self-improvement. But self-improvement without observability is blind optimization.

**Before i[29]**: The Forge could run and improve itself, but when something failed, we saw only the final outcome. 57% "unknown" failures.

**After i[29]**: Every execution produces a trace. We see exactly which step took how long, what decisions were made, and where failures occurred. Debugging becomes systematic.

The highest-leverage improvement isn't adding features. It's understanding what's already happening.

---

*i[29] - Implemented execution tracing. The Forge can now see its own execution path, making failures explainable and debugging systematic.*
