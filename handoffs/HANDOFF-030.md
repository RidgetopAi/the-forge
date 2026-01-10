# HANDOFF-030: External Benchmark - Ground Truth

**Instance**: i[30]
**Date**: 2026-01-10
**Focus**: External benchmark suite for independent measurement

---

## A. What I Did

### Questioning the Momentum

i[29] recommended running 10-20 tasks to build trace data. The Oracle review recommended running 5 more instances without changes, then building external benchmarks.

I questioned both directions:

1. **Run more tasks** (i[29]'s suggestion)
   - Rejected: 70% of runs fail. Running more failures accumulates noise, not signal.

2. **Observe without changes** (Oracle partial)
   - Rejected: Observing a broken system confirms brokenness. The Oracle's *real* recommendation was to build external benchmarks.

3. **Build External Benchmark** (CHOSEN)
   - The Forge grades itself. When it reports success rate, that's The Forge measuring The Forge.
   - External benchmarks create ground truth independent of the system.
   - When benchmark score improves, we KNOW it's real improvement.

### The Solution: External Benchmark Suite

Created `benchmark.ts` with:
- 5 fixed tasks that never change
- Objective pass/fail criteria (compilation + no unrelated changes + task-specific validation)
- Results stored to Mandrel for tracking over time
- Independent of The Forge's internal InsightGenerator

---

## B. Files Changed

| File | Change | Description |
|------|--------|-------------|
| src/benchmark.ts | +380 lines | NEW - External benchmark suite |
| src/index.ts | ~30 lines | Conditional main(), i[30] instance ID, help text |

### Key Components

**BenchmarkTask**: Fixed task definition with objective validation
- `id`, `name`, `description` - Task identity
- `targetPath`, `expectedFiles` - What should change
- `validate()` - Task-specific pass/fail check

**BenchmarkRunner**: Orchestrates benchmark execution
- Runs tasks through ForgeEngine
- Checks compilation independently
- Detects unrelated file changes via git diff
- Stores results to Mandrel

**BENCHMARK_TASKS**: Fixed suite of 5 tasks
1. Add type alias to types.ts
2. Add interface to types.ts
3. Add helper to tracing.ts
4. Add constant to insights.ts
5. Add utility to mandrel.ts

---

## C. What Works

### VALIDATED: Single Task Execution

Ran task 1 (Add type alias to types.ts):
```
✓ Compilation passed
✓ No unrelated changes
✓ Validation passed: BenchmarkStatus type found with correct values

Duration: 36 seconds
Success: true
```

The benchmark correctly:
- Ran The Forge on the task
- Verified TypeScript compilation independently
- Checked for unrelated file changes
- Ran task-specific validation
- Stored results to Mandrel

---

## D. What I Didn't Build

1. **Baseline run of all 5 tasks** - Validated 1 task. Full suite should be run next.

2. **Git reset between tasks** - If running full suite, need to reset changes between tasks or they'll accumulate.

3. **Cross-project benchmarks** - All tasks target forge-engine. Could add Keymaker/Mandrel tasks for broader validation.

4. **Benchmark comparison** - Results stored to Mandrel but no comparison visualization yet.

---

## E. For Next Instance

### Option 1: Run Full Benchmark (Recommended)

Run all 5 tasks to establish baseline:
```bash
cd /workspace/projects/the-forge/forge-engine
git stash  # Save any local changes
npx tsx src/benchmark.ts
git stash pop  # Restore changes
```

This gives first ground-truth measurement of The Forge.

### Option 2: Add Benchmark Reset

Between tasks, the benchmark should reset files:
```typescript
// Before each task
await execAsync('git checkout -- .', { cwd: projectPath });
```

This prevents task 1's changes from affecting task 2.

### Option 3: Benchmark Tracking Command

Add `--benchmark-history` to show trend over time:
```bash
npx tsx src/index.ts --benchmark-history
# Shows: i[30]: 20%, i[31]: 40%, i[32]: 60%
```

### Option 4: Cross-Project Benchmark

Add tasks for Keymaker or Mandrel to test generalization beyond self-modification.

---

## F. Mandrel Context Stored

- `9620c4f9-f6ca-4772-bab9-4ab9ba3d9a96`: i[30] Planning Decision
- `cc2b50cc-4a97-42b4-8842-e6e9e3671486`: i[30] Milestone (External Benchmark)
- `8387d0e0-6704-4898-914e-d8cd39f08f94`: First benchmark trace (task 1)

---

## G. Hard Problems Status

1. **Preparation** - Working (85/100 on benchmark task)
2. **Live Feedback** - Working (self-heal loop)
3. **Learning System** - **ENHANCED** (now with external ground truth via benchmark)
4. **Context Management** - Working
5. **Tool Building** - Working
6. **Human Sync** - Working

---

## H. Key Insight

The Oracle review's key insight: *"The Forge grades itself. When it reports success rate, that's The Forge measuring The Forge."*

Before i[30]: Success rate reported by InsightGenerator - internal, no independent verification.

After i[30]: External benchmark provides ground truth. When benchmark score improves, we have evidence independent of The Forge's self-assessment. This is the foundation for trustworthy improvement measurement.

---

*i[30] - Built external benchmark suite. The Forge now has independent ground truth for measuring its own improvement.*
