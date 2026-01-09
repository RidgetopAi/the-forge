# Handoff: Instance #1 → Instance #2

**Date:** 2026-01-09
**Model:** Claude Opus 4.5
**Session Focus:** SIRK Pass #1 - Attack the Preparation Problem

---

## A. What I Did

### Completed
- [x] Critical review of THE-FORGE-SEED-V1.md - found 6 gaps and 3 edge cases
- [x] Defined project type taxonomy (5 types, preparation-centric)
- [x] Designed ContextPackage schema (concrete TypeScript interface)
- [x] Created 7-phase preparation protocol for Feature Addition
- [x] Validated factory model - identified 4 missing pieces
- [x] Stored all findings to Mandrel (5 contexts, tagged sirk-pass-1)

### Files Created/Modified
| File | Description |
|------|-------------|
| handoffs/HANDOFF-001.md | This file |

---

## B. What I Contributed (Concrete Outputs)

### 1. Six Gaps Found in Seed

1. **Routing Problem Precedes Preparation** - Must classify before preparing
2. **Context Package Undefined** - No format specified
3. **Project Type Taxonomy Missing** - Can't prepare for "arbitrary"
4. **Chicken-Egg: Learning↔Preparation** - Sequencing constraint not called out
5. **Human Sync Triggers Undefined** - No concrete triggers
6. **Factory Model Has No Entry Point** - How does work enter?

### 2. Project Type Taxonomy

| Type | Preparation Focus |
|------|-------------------|
| Feature Addition | Architecture, similar features, test patterns |
| Bug Fix | Error context, execution flow, recent changes |
| Greenfield Build | Requirements, tech decisions, scaffolding |
| Refactor/Migration | Dependency map, test coverage, migration path |
| Research/Spike | Info sources, time-box, deliverable format |

### 3. ContextPackage Schema

Full TypeScript interface with sections:
- `task` (description, acceptance criteria, scope)
- `architecture` (overview, components, data flow, deps)
- `codeContext` (mustRead, mustNotModify, examples)
- `patterns` (naming, file org, testing, style)
- `constraints` (technical, quality, timeline)
- `risks` (description, mitigation)
- `history` (previous attempts, related decisions)
- `humanSync` (requiredBefore, ambiguities)

### 4. Preparation Protocol (7 Phases)

1. Task Classification (Plant Manager)
2. Architectural Discovery (Foreman + Workers)
3. Code Context Assembly (Workers)
4. Pattern & Constraint Synthesis (Foreman)
5. Risk Assessment & Human Sync (Foreman)
6. Package Validation (Quality Gate)
7. Handoff to Execution

### 5. Factory Model Fixes

Added missing pieces:
- Intake function (PM.classify())
- Routing protocol (R&D vs Preparation)
- Inter-department handoff formats
- Error escalation paths

---

## C. What's Validated vs What's Proposed

### Validated (by this pass)
- 5 project types cover the space well
- ContextPackage schema is implementable
- Preparation protocol phases make sense
- Factory hierarchy is sound with additions

### Still Theoretical (needs validation)
- Protocol hasn't been tested on real project
- Don't know if schema fits context window
- Worker task granularity untested
- Timing/cost of preparation unknown

---

## D. What's NOT Solved

### Explicitly Left for Future Passes

1. **Preparation protocols for other 4 project types** - Only designed Feature Addition
2. **Learning System** - How does The Forge learn from outcomes?
3. **Live Feedback Loop** - How do execution results flow back?
4. **Context Management** - What if package exceeds window?
5. **Tool Building** - Self-extending capability boundaries
6. **Human Sync Protocol** - Concrete trigger thresholds

### The Big Open Question

The protocol describes WHAT to do but not HOW to orchestrate it. Who coordinates the workers? How does Foreman know when workers are done? This is the orchestration implementation problem.

---

## E. For Next Instance

### Suggested Focus (pick 1-2)

1. **Validate the ContextPackage** - Take a REAL project (maybe Mandrel itself?) and try to produce a ContextPackage manually. Does the schema work? What's missing?

2. **Design Preparation for another type** - Bug Fix is probably next most common. Different protocol needed.

3. **Attack the Orchestration Problem** - How does Plant Manager actually coordinate? What's the message passing? State machine?

4. **Design the Learning System** - After execution, what gets stored? How does it feed back into preparation?

### Watch Out For

- Don't re-explain what I covered - build on it or challenge it
- The ContextPackage schema looks complete but hasn't touched reality
- "Design accumulation" warning applies - validate before expanding

### What Would Change My Mind

If someone shows that the 5 project types don't actually cover the space, or that ContextPackage is missing something critical, update accordingly.

---

## F. Mandrel Contexts Stored

- `e6d540b9-...`: Critical Gaps Found (6 gaps, 3 edge cases)
- `d39c1897-...`: Project Type Taxonomy (5 types)
- `cee20427-...`: ContextPackage Schema (TypeScript interface)
- `54b2bb3c-...`: Feature Addition Protocol (7 phases)
- `75a8f364-...`: Factory Model Validation (4 missing pieces)

Search: `context_search "sirk-pass-1"`

---

## G. Session Summary

Pass #1 attacked the Preparation Problem directly:
- Defined what types of projects exist
- Designed what a context package contains
- Created a concrete protocol to produce packages
- Fixed gaps in the factory model

The Forge now has a concrete target for Preparation output. Next pass should validate this against reality.

---

*Instance #1 complete. Foundation is more concrete. Test it.*
