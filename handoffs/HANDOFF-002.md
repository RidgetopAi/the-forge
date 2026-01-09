# Handoff: Instance #2 → Instance #3

**Date:** 2026-01-09
**Model:** Claude Opus 4.5
**Session Focus:** SIRK Pass #2 - Build the Orchestration Prototype

---

## A. What I Did

### Completed
- [x] Read seed, all handoffs, and Mandrel context from i[0] and i[1]
- [x] Made key decision: BUILD not DESIGN (2-3 instance limit, avoid design accumulation)
- [x] Built forge-engine prototype (TypeScript, ~600 lines)
- [x] Validated ContextPackage schema through execution
- [x] Tested against 3 task types (feature, bugfix, research)
- [x] Stored findings to Mandrel (2 contexts, tagged sirk-pass-2)

### Files Created
| File | Description |
|------|-------------|
| forge-engine/package.json | Project config |
| forge-engine/tsconfig.json | TypeScript config |
| forge-engine/src/types.ts | ContextPackage schema with Zod validation |
| forge-engine/src/state.ts | Task state machine |
| forge-engine/src/mandrel.ts | Mandrel client via SSH+curl |
| forge-engine/src/departments/plant-manager.ts | Task classification and routing |
| forge-engine/src/departments/preparation.ts | 7-phase preparation with workers |
| forge-engine/src/index.ts | CLI entry point and ForgeEngine class |
| handoffs/HANDOFF-002.md | This file |

---

## B. What I Contributed (Concrete Outputs)

### 1. Working Orchestration Prototype

```bash
# Run it yourself
cd /workspace/projects/the-forge/forge-engine
npm install
npx tsx src/index.ts /path/to/project "your task description"
```

### 2. Validated the Factory Model

The prototype proves:
- Plant Manager → Foreman → Worker hierarchy works
- State machine with valid transitions prevents invalid operations
- ContextPackage schema is implementable and usable
- Mandrel integration works from inside container
- Human sync triggers appropriately

### 3. Classification Results (Tested)

| Input | Detected Type | Confidence | Routing |
|-------|---------------|------------|---------|
| "add validation for..." | feature | 50% | preparation |
| "fix the bug where..." | bugfix | 70% | preparation |
| "investigate how to..." | research | 50% | r_and_d |

### 4. Key Insight: The LLM Gap

The prototype uses heuristics where LLM judgment is needed. Everything works but would be better with:
- Nuanced classification (not just keyword matching)
- Semantic keyword extraction (not just stopword removal)
- Pattern inference from code examples (not just config file detection)
- Risk assessment from historical failures (not just heuristics)

---

## C. What's Validated vs What's Proposed

### Validated (by execution)
- ContextPackage schema produces valid packages
- State machine prevents invalid transitions
- 7-phase preparation protocol executes end-to-end
- Mandrel client works via SSH+curl from container
- Human sync triggers on ambiguity/low confidence

### Still Theoretical (needs validation)
- LLM integration approach (heuristics used as placeholder)
- R&D Department implementation
- Execution/Quality/Documentation departments
- Learning system (Mandrel stores but nothing retrieves yet)
- Live feedback loop

---

## D. What's NOT Solved

### Explicitly Left for Future Passes

1. **LLM Integration** - Heuristics everywhere, need Anthropic/OpenAI calls
2. **R&D Department** - Routing exists, no implementation
3. **Execution Department** - State exists, no workers
4. **Quality Department** - State exists, no checks
5. **Documentation Department** - State exists, no generation
6. **Learning System** - How does preparation learn from execution outcomes?
7. **Live Feedback Loop** - How do errors flow back during execution?

### The Big Question for i[3]

**How should LLM capabilities be integrated?**

Option A: Direct Anthropic API calls in workers
- Pros: Full control, works standalone
- Cons: API key management, cost tracking

Option B: MCP tools that wrap LLM capabilities
- Pros: Consistent interface, could swap providers
- Cons: More abstraction, another moving part

Option C: Prompt templates for Claude Code to execute
- Pros: Human-in-loop validates prompts, no API cost
- Cons: Not autonomous

**My recommendation:** Start with C to validate prompts work, then B for automation.

---

## E. For Next Instance

### Suggested Focus (pick 1-2)

1. **Add LLM to Classification** - Replace keyword matching with actual LLM call. Test prompt quality. This is the smallest unit of LLM integration.

2. **Implement R&D Department** - Research tasks route there but nothing happens. Design the compounding loop (generate → critique → synthesize → stress test).

3. **Design Learning System** - After execution completes, what gets stored? How does it feed back into preparation? This is critical for compound learning.

4. **Build Execution Department** - The next step in the pipeline. Workers that actually write code (with supervision).

### Watch Out For

- The prototype WORKS - don't redesign it, extend it
- Heuristics are placeholders, not final solutions
- Test LLM integration on simple case before complex
- The 2-3 instance limit was about prototype - we have one now

### What Would Change My Mind

If execution shows ContextPackage is missing critical info for real code writing, the schema needs updating. Test it by actually trying to write code from a package.

---

## F. Mandrel Contexts Stored

- `81baf207-...`: Pass #2 Completion (what was built, validated)
- `ff9050e8-...`: Gaps and Next Steps (LLM integration options)

Search: `context_search "sirk-pass-2"`

---

## G. Session Summary

Pass #2 followed the SIRK constraint: "Maximum 2-3 instances before working prototype required."

**We now have a working prototype.**

- forge-engine: Orchestration that classifies, routes, and prepares
- State machine: Valid transitions, history tracking
- Mandrel integration: Context storage working
- Validation: Tested against 3 task types

The Forge has moved from design to implementation. Next passes can extend the working system rather than continue designing.

---

*Instance #2 complete. The prototype runs. Extend it.*
