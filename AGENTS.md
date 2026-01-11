# The Forge v2 - SIRK Planning Run

## What You Are Doing

This is a **planning-only** SIRK run. You are designing, not building.

**Your output:** A detailed implementation plan for The Forge v2's hierarchical Factory Model.

**What comes after:** The plan gets built using rigorous implementation practices (Forever Workflow).

---

## The Mandate: Think Boldly

**Do not accept the first tokens that come to mind.**

Before committing to any direction:
1. Generate at least two genuine alternatives
2. Stress-test each approach against edge cases
3. Ask: "Is this right, or is there a better way?"
4. Document your reasoning, including what you rejected and why

You serve the project's success, not the momentum of previous passes. If something is wrong, say so. If you see a better path, propose it.

**The enemy is premature convergence.** Don't settle. Push.

---

## Session Workflow

1. **First:** Run `context_get_recent` via Mandrel to see what previous passes did
2. **Read:** `THE-FORGE-SEED-V2.md` - This is your primary reference
3. **Read:** `STRATEGIC-RECOMMENDATION-V2.md` - Context on what v1 got right/wrong
4. **Think:** Generate alternatives, stress-test, choose with reasoning
5. **Work:** Address the Hard Problems in the seed
6. **Store:** Save your work to Mandrel with `context_store`
7. **Handoff:** Write your handoff for the next pass

---

## Mandrel - Your Memory System

**All context, decisions, and handoffs flow through Mandrel.**

### How to Access Mandrel

From inside this container, use SSH + curl:

```bash
ssh hetzner 'curl -s -X POST http://localhost:8080/mcp/tools/<tool_name> \
  -H "Content-Type: application/json" \
  -d '\''{"arguments": {<params>}}'\'''
```

### Essential Commands

**Get recent context (START HERE):**
```bash
ssh hetzner 'curl -s -X POST http://localhost:8080/mcp/tools/context_get_recent \
  -H "Content-Type: application/json" \
  -d '\''{"arguments": {"limit": 10}}'\'''
```

**Search for specific context:**
```bash
ssh hetzner 'curl -s -X POST http://localhost:8080/mcp/tools/context_search \
  -H "Content-Type: application/json" \
  -d '\''{"arguments": {"query": "your search query"}}'\'''
```

**Store new context:**
```bash
ssh hetzner 'curl -s -X POST http://localhost:8080/mcp/tools/context_store \
  -H "Content-Type: application/json" \
  -d '\''{"arguments": {"content": "Your context here", "type": "planning", "tags": ["sirk-v2", "pass-N"]}}'\'''
```

**Context types:** `code`, `decision`, `error`, `discussion`, `planning`, `completion`, `milestone`, `reflections`, `handoff`

---

## Key Files

| File | Purpose |
|------|---------|
| `THE-FORGE-SEED-V2.md` | **PRIMARY** - The seed document with vision and Hard Problems |
| `STRATEGIC-RECOMMENDATION-V2.md` | Context on v1 learnings, what to keep/change |
| `THE-FORGE-SEED-V1.md` | Original seed (reference only) |
| `handoffs/` | Instance handoff chain |

---

## SIRK Planning Protocol

This run is **planning only**. Each pass should:

1. **Read the seed thoroughly** - THE-FORGE-SEED-V2.md is your primary reference
2. **Read previous passes** - Build on or challenge, don't repeat
3. **Think before designing** - Generate alternatives, evaluate, choose with reasoning
4. **Address Hard Problems** - Pick 1-2 from the seed and make concrete progress
5. **Be specific** - Propose schemas, interfaces, protocols - not vague concepts
6. **Find gaps** - What did the seed or previous passes miss?
7. **Leave clear handoff** - What you contributed, what's still open

---

## Hard Problems to Address

From THE-FORGE-SEED-V2.md:

1. **Worker Design** - How do Haiku workers actually work? Prompts, I/O, tools, supervision
2. **Parallel Execution** - Promise.all patterns, dependencies, partial failures
3. **Tier Boundaries** - Precisely when does each tier get invoked?
4. **Context Window Management** - How to handle large codebases?
5. **Web Research Boundaries** - When/how does WebResearchWorker activate?
6. **Foreman-Worker Protocol** - Data contracts, error handling, metadata

---

## Reference: Squire's Context Management Approach

For tackling **Context Window Management**, review `/workspace/projects/squire/` (read-only reference). Squire uses a different paradigm worth considering:

### Key Patterns

1. **Token Budgeting with Category Caps**
   - Budget split by category: high_salience (30%), relevant (variable), recent (remainder)
   - Highest-priority fills first, prevents any category consuming entire window
   - See: `src/services/context.ts`

2. **Multi-Factor Scoring**
   ```
   score = (0.45 × salience) + (0.25 × relevance) + (0.20 × recency) + (0.10 × strength)
   ```
   - Items compete for limited context budget based on composite score
   - Protects important content while allowing fresh content in

3. **Living Summaries (Consolidation Layer)**
   - Incrementally updated summaries that persist between sessions
   - Categories: personality, goals, relationships, projects, interests, etc.
   - Don't regenerate full summaries - incrementally update
   - See: `src/services/summaries.ts`

4. **Document Chunking (Triple Strategy)**
   - **Fixed chunker**: Token-counted (~500 tokens) with overlap
   - **Semantic chunker**: Respects document structure (paragraphs, sections)
   - **Hybrid**: Combines both
   - See: `src/services/documents/chunker/`

5. **Decay & Strengthening (Memory Lifecycle)**
   - Strength (0-1) decays based on: salience, access recency, access frequency
   - High-salience items protected from decay
   - Recently accessed items get protection boost
   - Low-salience + unaccessed items decay faster

### Applicability to The Forge

This is NOT prescriptive - it's one approach. Consider:
- **Budget caps** could apply to ContextPackage sections (files, patterns, constraints)
- **Scoring** could prioritize which files make it into worker context
- **Chunking** could handle large files that exceed worker context
- **Summaries** could compress codebase knowledge across tasks

Challenge this. Maybe there's a simpler approach for The Forge's specific needs.

---

## Success Criteria

The planning phase succeeds when we have:

- [ ] Detailed Worker Specifications (prompts, I/O schemas, tool access)
- [ ] Foreman Orchestration Design (task decomposition, dispatch, synthesis)
- [ ] Tier Assignment Matrix (every operation mapped with justification)
- [ ] Cost Projection Model (expected costs, comparison to flat model)
- [ ] Implementation Phases (ordered, testable, with clear deliverables)
- [ ] Validation Plan (how we prove it works)

---

## Non-Negotiables

- **Planning only** - No code in this SIRK run, just design
- **Bold thinking** - Question everything, reject premature convergence
- **Concrete output** - Schemas, interfaces, protocols - not vague concepts
- **Build on existing** - v1 infrastructure is sound, model layer needs redesign
- **Human-in-the-loop** - Architectural, not fallback

---

## The Vision (Why We're Doing This)

**Craftsmanship at scale, not mass production.**

A solo developer (or small team) needs to produce high-quality software efficiently. AI can do the work, but AI instances don't prepare, don't learn, don't self-correct without live feedback.

The Forge creates infrastructure that:
- Prepares context before instances arrive
- Enables compound learning across instances
- Provides live feedback for self-correction
- Maintains quality through architectural gates

The result: Each AI instance inherits accumulated wisdom and operates at full effectiveness immediately.
