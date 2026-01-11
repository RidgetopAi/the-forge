# Strategic Recommendation: The Forge v2 Direction

**Date**: 2026-01-10
**Context**: After 39 SIRK passes, strategic review by Opus 4.5
**Purpose**: Input for Seed v2 and SIRK planning phase

---

## Executive Summary

The Forge has validated infrastructure (~13,600 lines) but diverged from the Factory Model. The skeleton is sound; the model tier layer is wrong. **Refactor, don't rewrite.**

---

## What to Keep (Validated Infrastructure)

### 1. Mandrel Integration (mandrel.ts)
- SSH+curl pattern works reliably
- Context storage/retrieval battle-tested
- **Keep as-is**

### 2. State Machine (state.ts)
- Task lifecycle management works
- Valid transitions prevent invalid operations
- **Keep as-is**

### 3. ContextPackage Schema (types.ts)
- Validated through 39 passes of use
- Schema is complete and implementable
- **Keep as-is**

### 4. Human Sync Protocol (human-sync.ts)
- Architecturally sound (not fallback)
- Triggers, questions, responses all work
- **Keep as-is**

### 5. Benchmarking Infrastructure
- benchmark.ts, hard-task-benchmark.ts, cross-project-benchmark.ts
- External validation exists and works
- **Keep as-is**

### 6. Tracing System (tracing.ts)
- Execution observability works
- Useful for debugging and analysis
- **Keep as-is**

---

## What Must Change (The Divergence)

### The Core Problem

The seed specified a tiered cost model:
```
Plant Manager (Opus) -> Judgment calls
Foremen (Sonnet) -> Supervision
Workers (Haiku/Flash) -> Cheap parallel labor
```

What was built:
```
Everything -> Sonnet (when LLM used)
Workers -> Shell commands (no LLM at all)
```

### Where It Happened

1. **i[2]** used shell commands as worker placeholders ("add LLM later")
2. **i[7]** added LLM but only ONE model (Sonnet for everything)
3. **i[8]-i[39]** refined flat architecture, never revisited tiers

### Why It Matters

- No cost optimization (Sonnet for everything is expensive)
- No parallelization (shell commands are sequential)
- Doesn't scale economically (no cheap labor tier)

---

## Recommended Refactor Phases

### Phase 1: Model Tier System
**Goal**: Create infrastructure for tiered model usage
**Files**: New tiers.ts, modify llm.ts
**Tasks**:
- Define tier enum: Opus, Sonnet, Haiku
- Define which operations use which tier
- Add cost tracking per API call
- Wire tier selection into LLMClient

### Phase 2: Worker Tier Implementation
**Goal**: Replace shell-command workers with Haiku LLM workers
**Files**: preparation.ts (major refactor)
**Tasks**:
- FileDiscoveryWorker -> Haiku API call
- PatternExtractionWorker -> Haiku API call
- ArchitectureAnalysisWorker -> Haiku API call
- Enable Promise.all() for parallel worker execution
- Add worker supervision/retry logic

### Phase 3: PlantManager Elevation
**Goal**: Use Opus for judgment calls
**Files**: plant-manager.ts, llm.ts
**Tasks**:
- Classification decisions -> Opus
- Human Sync trigger decisions -> Opus
- Escalation decisions -> Opus
- Fallback to Sonnet if Opus unavailable/too slow

### Phase 4: Foreman Formalization
**Goal**: Clear Foreman role at Sonnet tier
**Files**: preparation.ts
**Tasks**:
- PreparationForeman coordinates workers (doesn't do labor)
- Synthesizes worker outputs into ContextPackage
- Gates quality before handoff
- Handles worker failures with retry/escalation

### Phase 5: Validation and Tuning
**Goal**: Prove the tiered model works and is cost-effective
**Files**: benchmarks, new cost-analysis tooling
**Tasks**:
- Run full benchmark suite with tiered model
- Track cost per task (compare to flat Sonnet approach)
- Tune tier assignments based on results
- Document cost/quality tradeoffs

---

## Key Insights for Seed v2

### 1. Be Explicit About Tiers
The original seed mentioned tiers but didn't mandate them. Seed v2 should specify:
- WHICH operations use WHICH tier
- WHY each tier is appropriate
- WHAT the cost structure should look like

### 2. Workers Must Be LLM Agents
The original seed said workers are "cheap/fast models". Seed v2 should clarify:
- Workers are NOT shell commands
- Workers ARE Haiku/Flash API calls
- Workers CAN run in parallel

### 3. Build Phase vs Design Phase
SIRK worked for planning but the "2-3 instance before prototype" rule led to shortcuts. Seed v2 should:
- Separate SIRK planning passes from build passes
- Planning: iterate on design with SIRK
- Building: execute plan without SIRK iteration

### 4. Validate Tiers Early
The flat architecture solidified because no one tested tiered alternatives. Seed v2 should require:
- Tier system implemented in first build phase
- Cost tracking from day one
- Comparison data before proceeding

---

## For SIRK Planning Passes

When running SIRK to create the detailed plan:

1. **Start with tier definitions** - Which operation uses which model and why
2. **Design worker parallelization** - How workers coordinate, what they return
3. **Define Foreman responsibilities** - Supervision, synthesis, quality gates
4. **Specify PlantManager judgment calls** - When to use Opus, what decisions matter
5. **Create build phases with clear deliverables** - Each phase should be testable

---

## Success Criteria for v2

1. **Tiered cost structure implemented** - Opus/Sonnet/Haiku all used appropriately
2. **Workers run in parallel** - Promise.all on Haiku calls
3. **Cost per task tracked** - Know what each operation costs
4. **Benchmark maintained or improved** - Don't regress from 100%
5. **Cross-project validation** - Works on projects other than itself

---

## The Bottom Line

| Decision | Recommendation |
|----------|----------------|
| Start over vs refactor | **Refactor** - skeleton is sound |
| What to keep | Mandrel, state, types, human-sync, benchmarks, tracing |
| What to change | LLM tier layer (one layer, not whole system) |
| How to plan | SIRK passes for detailed design |
| How to build | Execute plan without SIRK iteration |
| Estimated effort | 6-8 focused passes for tier refactor |

---

*Stored by: Opus 4.5 Strategic Advisor*
*Context: Post-39-pass analysis, pre-SIRK-planning*
