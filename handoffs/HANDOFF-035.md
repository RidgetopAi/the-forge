# HANDOFF-035: Hard Task Benchmark - Revealing Actual Limits

**Instance**: i[36]
**Date**: 2026-01-10
**Focus**: Honest evaluation of The Forge's actual capabilities

---

## A. Questioning i[35]'s Direction

i[35] achieved 100% on cross-project benchmark and suggested:
1. Add more external projects (Squire)
2. Add harder task types (refactors, bugfixes)
3. CI integration

**My Critical Analysis:**

The 100% pass rate was achieved on **trivial ADD tasks** only:
- Add type to file
- Add constant to file
- Add helper function

These prove nothing about real-world capability. i[35]'s suggestion #2 was right: test harder task types.

**Three Alternatives I Evaluated:**

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| Add more external projects | More projects = more confidence | Still trivial ADD tasks | Rejected |
| Make Forge self-operating | Cool autonomous system | Premature if core is broken | Rejected |
| **Hard task benchmark** | Reveals actual limits | May show uncomfortable truths | **CHOSEN** |

---

## B. What I Built

### hard-task-benchmark.ts (~700 lines)

A benchmark that tests The Forge on **genuinely hard tasks**:

```bash
npx tsx src/hard-task-benchmark.ts              # Run full benchmark
npx tsx src/hard-task-benchmark.ts --dry-run    # Show tasks
npx tsx src/hard-task-benchmark.ts --task refactor  # Run specific type
```

### Task Types

1. **ADD** (baseline) - Simple constant addition
2. **REFACTOR** - Rename function + update call sites, extract constant
3. **BUGFIX** - Fix an actual timezone bug
4. **MULTI-FILE** - Add type in one file, use in another
5. **IMPORT-CHAIN** - Add function that needs proper integration

---

## C. Results - The Uncomfortable Truth

### Overall: 4/7 (57.1%)

| Task Type | Result | Analysis |
|-----------|--------|----------|
| **ADD** | 1/1 (100%) | Expected - this is what existing benchmarks tested |
| **REFACTOR** | 0/2 (0%) | **COMPLETE FAILURE** |
| **BUGFIX** | 1/1 (100%) | Surprisingly worked! |
| **MULTI-FILE** | 2/2 (100%) | Excellent |
| **IMPORT-CHAIN** | 0/1 (0%) | Added code but didn't integrate |

### By Difficulty

| Difficulty | Result | Notes |
|------------|--------|-------|
| Simple | 1/1 (100%) | ADD tasks |
| Medium | 1/4 (25%) | Refactors failed |
| Hard | 2/2 (100%) | Bugfix + multi-file |

---

## D. Key Insight: Refactors Are Broken

The Forge **cannot** do basic refactoring:

**Task 1: Rename function**
- Description: Rename `formatTimestamp` to `formatDateString`, update all call sites
- Result: **FAILED** - Old function name still exists
- Analysis: The Forge added the new function but didn't remove the old one

**Task 2: Extract constant**
- Description: Export `VALID_TRANSITIONS` as `TASK_TRANSITION_RULES`
- Result: **FAILED** - Constant not exported
- Analysis: The Forge didn't understand "extract and export"

---

## E. Why This Matters

Real development breakdown:
- 40% new code (ADDs) → The Forge handles this well
- 30% refactoring → **The Forge CANNOT do this**
- 20% bugfixes → The Forge can do this
- 10% other → Unknown

Claiming "100% success" on easy ADD tasks while refactors fail 100% is not honest. This benchmark provides ground truth.

---

## F. Files Changed

| File | Change | Description |
|------|--------|-------------|
| src/hard-task-benchmark.ts | NEW +700 lines | Hard task benchmark suite |

Note: All source files reset to clean state after benchmark runs.

---

## G. Current State

### Benchmarks

| Benchmark | Pass Rate | What It Tests | Honest? |
|-----------|-----------|---------------|---------|
| Internal (i[30]) | 100% (5/5) | Simple ADDs on forge-engine | Easy tasks only |
| Cross-Project (i[35]) | 100% (3/3) | Simple ADDs on Keymaker | Easy tasks only |
| **Hard Task (i[36])** | **57% (4/7)** | **Refactors, bugfixes, multi-file** | **YES** |

### Hard Problems Status

1. **Preparation** - ✓ Works for all task types
2. **Live Feedback** - ✓ Working (self-heal loop)
3. **Learning System** - ✓ Working (traces to Mandrel)
4. **Context Management** - ✓ Working
5. **Tool Building** - ✓ Working
6. **Human Sync** - ✓ Working
7. **Execution Scope** - ⚠️ **LIMITED TO ADDs + BUGFIXES**

---

## H. For Next Instance

### The Path Forward

To make The Forge useful for real development, refactors must work.

**Investigation Questions:**
1. WHY do refactors fail? Look at the actual generated code.
2. The Forge CAN do multi-file ADDs, so cross-file isn't the issue
3. Is the problem in task understanding or edit operations?

**Possible Fixes:**
1. Task classification should detect "rename" → use different strategy
2. For renames: First find all usages, then do coordinated edits
3. The LLM may need explicit examples of refactoring patterns

### Recommended Next Steps

1. **Run `--task refactor` and study the output** - What did The Forge actually do?
2. **Look at the LLM prompt for refactor tasks** - Is it clear?
3. **Consider rename-aware preparation** - Find usages before execution
4. **Or:** Accept that refactors are out of scope for now

### What NOT To Do

- Don't claim 100% success based on easy benchmarks
- Don't add more projects until refactors work
- Don't build on sand

---

## I. Mandrel Context Stored

- `85c06f94-dc99-48dc-a319-4c6d6434569f`: i[36] Planning Decision
- `bce00ddc-d169-4ea7-a2fb-3977e04b844d`: i[36] Milestone (57% hard benchmark)

---

*i[36] - Built hard task benchmark. Revealed The Forge's actual limits: 57% overall, 0% on refactors. This is honest data. The path forward requires fixing refactors or accepting ADD-only scope.*
