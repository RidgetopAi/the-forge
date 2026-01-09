# SIRK Pass #3 - The Execution Bridge

**Instance**: i[3] | **Model**: Claude Opus 4.5 | **Date**: 2026-01-09

---

## What Previous Instances Did

### i[1] - The Designer
- Found 6 gaps in the seed document
- Defined 5 project types (feature, bugfix, greenfield, refactor, research)
- Created ContextPackage schema with 8 sections
- Designed 7-phase preparation protocol
- Validated factory model, added missing pieces

### i[2] - The Builder
- Built forge-engine prototype (~600 lines TypeScript)
- Validated ContextPackage schema through actual execution
- Created: types.ts, state.ts, mandrel.ts, plant-manager.ts, preparation.ts, index.ts
- Tested 3 task types (feature, bugfix, research)
- Identified LLM integration as the key missing piece
- Recommended: Option C (prompt templates) first, then Option B (MCP tools)

---

## My Observation

I ran the prototype on a real task:
```bash
npx tsx src/index.ts /workspace/projects/the-forge "add error handling to the Mandrel client"
```

**Result**: It works. But it reveals the core limitation.

The prototype found 6 "relevant" files - every file containing the word "error". That's not relevance; that's string matching. The semantic understanding that would rank mandrel.ts as PRIMARY and everything else as CONTEXT is missing.

But this isn't the gap I'm here to fill.

---

## The Gap I Found

The prototype PRODUCES a ContextPackage. But **WHO CONSUMES IT?**

The answer is obvious when you see it: **A Claude Code instance.**

The Forge isn't replacing Claude Code. It's a PREPARATION LAYER that makes Claude Code instances maximally effective.

So the "Execution Department" isn't more code in forge-engine. It's a **PROTOCOL** that a Claude Code instance follows when given a ContextPackage.

This is the missing bridge between Preparation (output: ContextPackage) and Execution (actor: Claude Code instance).

---

## The Execution Protocol

### Architecture Decision

**The Execution Department is not code. It's a protocol.**

When a Claude Code instance receives a ContextPackage, it becomes the Execution Department by following this protocol. The "worker" is Claude Code itself. The "foreman" is the protocol enforcing structure.

This maps to i[2]'s recommendation: "Option C first - prompt templates for Claude Code."

### The Protocol

```markdown
# Forge Execution Protocol v1

You are a Claude Code instance executing a task prepared by The Forge.

## Context Package
[ContextPackage JSON injected here]

## Phase 1: Context Absorption

Read these files in order (mustRead):
{{#each codeContext.mustRead}}
- [ ] {{path}} - {{reason}}
{{/each}}

DO NOT MODIFY these files (mustNotModify):
{{#each codeContext.mustNotModify}}
- {{path}} - {{reason}}
{{/each}}

Use these as examples (relatedExamples):
{{#each codeContext.relatedExamples}}
- {{path}} - {{similarity}}
{{/each}}

## Phase 2: Pattern Alignment

Follow these conventions:
- **Naming**: {{patterns.namingConventions}}
- **File Organization**: {{patterns.fileOrganization}}
- **Testing**: {{patterns.testingApproach}}
- **Error Handling**: {{patterns.errorHandling}}

Config references: {{patterns.codeStyle}}

## Phase 3: Constraint Check

Technical constraints:
{{#each constraints.technical}}
- {{this}}
{{/each}}

Quality requirements:
{{#each constraints.quality}}
- {{this}}
{{/each}}

## Phase 4: Risk Awareness

Known risks and mitigations:
{{#each risks}}
- **{{description}}** → {{mitigation}}
{{/each}}

## Phase 5: Execute

Task: {{task.description}}

Acceptance Criteria:
{{#each task.acceptanceCriteria}}
- [ ] {{this}}
{{/each}}

Scope:
- IN: {{task.scope.inScope}}
- OUT: {{task.scope.outOfScope}}

## Phase 6: Validate

Before declaring complete:
1. [ ] TypeScript compilation passes
2. [ ] All existing tests pass
3. [ ] All acceptance criteria met
4. [ ] No mustNotModify files changed
5. [ ] Patterns followed consistently

## Phase 7: Report

Store to Mandrel with context_store:
- Type: completion (if done) or handoff (if partial)
- Tags: [forge-execution, task-id, project-type]
- Content: What you did, what worked, what didn't, lessons learned
```

---

## The Complete Picture

```
Human Request
    ↓
┌─────────────────────────────────────────────────────────────┐
│ FORGE ENGINE (preparation)                                   │
│                                                             │
│   Plant Manager → classify, route                           │
│        ↓                                                    │
│   Preparation Foreman → workers discover, extract, analyze  │
│        ↓                                                    │
│   OUTPUT: ContextPackage (JSON)                             │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ EXECUTION PROTOCOL (consumption)                             │
│                                                             │
│   Claude Code instance receives ContextPackage               │
│        ↓                                                    │
│   Instance follows 7-phase protocol                          │
│        ↓                                                    │
│   OUTPUT: ExecutionResult → stored to Mandrel               │
└─────────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────────┐
│ QUALITY GATE (validation)                                    │
│                                                             │
│   Human or automated review                                  │
│        ↓                                                    │
│   APPROVE → Documentation → Complete                         │
│   REJECT → Feedback → Re-execution                          │
└─────────────────────────────────────────────────────────────┘
```

---

## What This Unlocks

### 1. Self-Application
The Forge can use itself. When forge-engine produces a ContextPackage, a Claude Code instance (like me) can consume it using the Execution Protocol.

### 2. LLM Integration Path
The Execution Protocol IS the "Option C" i[2] recommended. Now we can:
1. Test the protocol manually (Claude Code follows it)
2. Refine based on real execution
3. Later, automate via MCP tools (Option B)

### 3. Learning Loop
ExecutionResults stored to Mandrel become input for future preparations:
- What files were actually modified? → Better mustRead predictions
- What patterns emerged? → Better pattern extraction
- What failed? → Risk database grows

---

## Validation: Self-Execution

I will now execute the task that forge-engine prepared: "add error handling to the Mandrel client"

This validates both:
1. The ContextPackage (i[2]'s prototype)
2. The Execution Protocol (my contribution)

---

## Critical Assessment of i[1] and i[2]

### What They Got Right
- ContextPackage schema is solid and implementable
- Factory model hierarchy (PM → Foreman → Workers) is sound
- State machine prevents invalid transitions
- Mandrel integration enables compound learning
- 2-3 instance prototype limit was followed

### What They Missed
1. **Execution was hand-waved**: "If prep is right, execution is almost mechanical" - but HOW does execution happen? Neither pass defined the interface between ContextPackage and work.

2. **No self-application**: Neither instance used The Forge on The Forge. If your system for software development can't develop itself, you haven't validated it.

3. **Human-in-the-loop underspecified**: Human Sync triggers are defined, but the actual human interaction protocol isn't. When human is synced, what do they SEE? What can they DO?

---

## For Instance #4

### Suggested Focus
1. **Improve Classification** - The keyword matching is too crude. Either:
   - Add simple scoring (TF-IDF, keyword position)
   - Or design the LLM integration (Option B: MCP tool wrapping Anthropic API)

2. **Build Quality Gate** - We have Preparation → Execution but no Quality review. What checks happen before work is accepted?

3. **Human Sync Interface** - What does the human actually see when Human Sync triggers? Design the UI/interaction.

4. **Learning Retrieval** - Mandrel STORES contexts, but preparation doesn't RETRIEVE them. Add history lookup to preparation phase.

### The Big Question
**How should feedback flow?**

When execution reveals that the ContextPackage was wrong (wrong files, bad patterns, missing constraints), how does that information improve future preparations?

This is the learning loop. Without it, instances don't compound.

---

## Appendix: Raw Execution Test

ContextPackage produced by forge-engine for "add error handling to the Mandrel client":

- Task ID: ed4eb7d5-3ed1-4426-bf3c-baa644091696
- Package ID: 9bfa91c4-1a84-4696-99c3-ee19bb6eee8a
- Type: feature (50% confidence)
- mustRead: 6 files (all containing "error" - too broad)
- Ambiguity flagged: "Request is brief - may need more detail"
- Human Sync triggered: Yes

The prototype correctly:
- Classified the task as feature
- Extracted relevant keywords
- Found files containing those keywords
- Triggered Human Sync for ambiguous request

The prototype incorrectly:
- Made every file "must read" (no prioritization)
- Didn't recognize "Mandrel client" refers to mandrel.ts specifically
- Set confidence at 50% (only "add" matched feature keywords)

This confirms: heuristics work for structure, LLM needed for semantics.
