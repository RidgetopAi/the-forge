# i[7]-v2 → i[8]-v2 Handoff

**Instance**: i[7]-v2 (seventh planning pass)
**Date**: 2026-01-10
**Mission**: Final review of vision vs design vs what exists. Fill gaps for implementation.

---

## Executive Summary

**i[6] completed the design. I completed the implementation mapping.**

The v2 planning is now READY for a final Implementation Specification.

---

## What I Found (Vision vs Design vs Code)

### The Design is Complete

i[1]-i[6] designed all four vision pillars:
1. **PREPARE**: 6 LLM workers, wave dispatch, Foreman synthesis
2. **LEARN**: PatternTracker, success rate tracking, pattern deprecation
3. **FEEDBACK**: FeedbackRouter, handlers, retry limits
4. **QUALITY**: Quality Foreman, 4 Quality Workers (specs + prompts)

### The Code Doesn't Match

| Component | Design Says | Code Has |
|-----------|-------------|----------|
| Workers | LLM agents (Haiku) | Shell commands (`find`, `rg`) |
| Tier System | Opus/Sonnet/Haiku | Single `claude-sonnet-4` |
| Learning | PatternTracker updates successRate | `successRate: 0.8` hardcoded |
| Feedback | FeedbackRouter routes errors | Nothing |
| Quality | Automated workers | Basic acceptance check |

### The Gap Was Implementation Mapping

Previous passes designed WHAT to build but not:
- What files to create/modify
- In what order
- With what dependencies

**I filled those gaps below.**

---

## Gap Fill 1: v2 vs v3 Scope

### v2 Scope (This Run)
- Tier System (Opus/Sonnet/Haiku routing + cost tracking)
- Preparation Department LLM Workers (6 workers)
- PatternTracker (active learning)
- FeedbackRouter (live feedback)

### v3 Scope (Future)
- Execution Department Workers (code generation)
- Quality Department Workers (TestRunner, TypeChecker, etc.)
- Worker prompt evolution (A/B testing)

**Rationale**: v2 makes preparation intelligent and adaptive. v3 makes execution and quality intelligent. v2 execution still uses Claude Code.

---

## Gap Fill 2: File-to-Change Map

| Design Component | Target File | Change Type |
|-----------------|-------------|-------------|
| Tier System | NEW: `src/tiers.ts` | Create |
| Tier Routing | `src/llm.ts` | Modify |
| Cost Tracking | `src/llm.ts` | Modify |
| Worker Base | NEW: `src/workers/base.ts` | Create |
| FileDiscoveryWorker | NEW: `src/workers/file-discovery.ts` | Create |
| PatternExtractionWorker | NEW: `src/workers/pattern-extraction.ts` | Create |
| DependencyMapperWorker | NEW: `src/workers/dependency-mapper.ts` | Create |
| ConstraintIdentifierWorker | NEW: `src/workers/constraint-identifier.ts` | Create |
| WebResearchWorker | NEW: `src/workers/web-research.ts` | Create |
| DocumentationReaderWorker | NEW: `src/workers/documentation-reader.ts` | Create |
| PreparationForeman | `src/departments/preparation.ts` | Refactor |
| PatternTracker | NEW: `src/pattern-tracker.ts` | Create |
| PatternTracker Integration | `src/learning.ts` | Modify |
| FeedbackRouter | NEW: `src/feedback.ts` | Create |
| Feedback Handlers | `src/feedback.ts` | Add |
| Execution Integration | `src/departments/execution.ts` | Modify |

**New Files**: 9
**Modified Files**: 4
**Deleted Files**: 0

---

## Gap Fill 3: Implementation Phases

### Phase 0: Haiku Capability Validation
- Create 60 test cases (10 per worker type)
- 5 synthetic + 5 real-codebase per worker
- Thresholds: 90% parse, 70% accuracy, 5s P95
- **MUST PASS before Phase 2**

### Phase 1: Tier Foundation
1. Create `tiers.ts` with Opus/Sonnet/Haiku enum
2. Add tier routing to `llm.ts`
3. Add cost tracking per API call
4. **Test**: Calls route correctly, costs logged

### Phase 2: Worker Abstraction
1. Create `workers/base.ts` with LLM worker interface
2. Implement `FileDiscoveryWorker` as first LLM worker
3. Run Phase 0 validation
4. **Gate**: Must pass 70% accuracy

### Phase 3: Worker Fleet
1. Implement remaining 5 workers
2. Validate each against Phase 0 cases
3. **Gate**: All workers pass thresholds

### Phase 4: Foreman Orchestration
1. Refactor `PreparationForeman` to use LLM workers
2. Implement wave dispatch
3. **Test**: End-to-end preparation completes

### Phase 5: Active Learning
1. Create `PatternTracker` service
2. Integrate with `FeedbackRecorder`
3. Integrate with `LearningRetriever`
4. **Test**: Success rates update from outcomes

### Phase 6: Live Feedback
1. Create `FeedbackRouter` and handlers
2. Integrate with execution
3. **Test**: Errors route to workers

---

## Gap Fill 4: Phase 0 Ground Truth (Sample)

### FileDiscoveryWorker (10 cases)

| ID | Input (task + codebase) | Expected Files |
|----|------------------------|----------------|
| FD-1 | "add login button" + React | auth/, components/Login |
| FD-2 | "fix database timeout" + Node | db/, connection.ts |
| FD-3 | "add README" + any | *.md, package.json |
| FD-4 | "add endpoint" + forge-engine | server.ts, routes/ |
| FD-5 | "fix type error" + forge-engine | types.ts, affected |

### PatternExtractionWorker (10 cases)

| ID | Input (code samples) | Expected Patterns |
|----|---------------------|-------------------|
| PE-1 | React components | PascalCase, hooks pattern |
| PE-2 | Express routes | Router middleware pattern |
| PE-3 | TypeScript utils | camelCase, pure functions |
| PE-4 | forge-engine src | ES Modules, Zod, async |
| PE-5 | departments/ | Foreman pattern, Department |

### (Remaining 4 workers follow same pattern - 10 cases each)

---

## What i[8] Should Do

### Option A: Write Implementation Specification (RECOMMENDED)

Using this handoff + i[6]'s designs, write the complete Implementation Specification:

1. **Full Tier System Design**
   - `tiers.ts` complete code
   - `llm.ts` modifications
   - Cost tracking schema

2. **Worker Base Class**
   - Input/output interfaces
   - LLM call pattern
   - Error handling
   - Timeout handling

3. **Each Worker Specification**
   - Full prompt template (from i[1]-i[5] designs)
   - Input schema
   - Output schema
   - Validation rules

4. **Integration Points**
   - How workers connect to Foreman
   - How PatternTracker hooks into learning loop
   - How FeedbackRouter hooks into execution

5. **Test Cases**
   - Complete Phase 0 ground truth
   - Integration test scenarios
   - Benchmark baselines

### Option B: Challenge This Work

If you see flaws in my scope definition, file mapping, or phase ordering - challenge it. The enemy is premature convergence.

---

## Key Insight

**The v2 planning was complete at the design level but incomplete at the implementation level.**

i[1]-i[5] designed Preparation.
i[6] designed Learning + Feedback + Quality.
i[7] (me) mapped designs to implementation.

**i[8] can now write the final Implementation Specification.**

---

## Mandrel Context IDs

- i[7] meta-analysis: 49dabf03-5e52-4ea8-9091-98a26eb6bffc
- i[6] complete planning: 931e72bd-9449-45bc-802d-40a7e8358835
- i[6] meta-analysis: 307b23ef-eecb-4681-9d0d-abe551f3b3a7

---

## The Vision Check (Did We Match It?)

From THE-FORGE-SEED-V2.md:

> "The Forge creates infrastructure that:
> - Prepares context before instances arrive ✅ (6 LLM workers designed)
> - Enables compound learning across instances ✅ (PatternTracker designed)
> - Provides live feedback for self-correction ✅ (FeedbackRouter designed)
> - Maintains quality through architectural gates ✅ (Quality Dept designed, deferred to v3)"

**The design matches the vision. Now we implement.**

---

*The enemy was premature convergence. We stopped converging at pass 5, discovered missing pillars at pass 6, mapped to implementation at pass 7. Now pass 8 writes the spec.*
