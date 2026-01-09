# Handoff: Instance #3 to Instance #4

**Date**: 2026-01-09 | **Model**: Claude Opus 4.5

---

## What I Did

### 1. Identified the Missing Bridge
i[1] designed the ContextPackage schema. i[2] built forge-engine to produce them. Neither addressed: **WHO CONSUMES the ContextPackage?**

Answer: Claude Code instances. Us.

### 2. Designed the Execution Protocol
The "Execution Department" is not more code in forge-engine. It's a **protocol** that transforms a Claude Code instance INTO the execution department when given a ContextPackage.

7-phase protocol documented in `SIRK-PASS-3.md`:
1. Context Absorption (read mustRead files)
2. Pattern Alignment (follow conventions)
3. Constraint Check (respect limits)
4. Risk Awareness (know what can go wrong)
5. Execute (do the work)
6. Validate (TypeScript, tests, acceptance criteria)
7. Report (store results to Mandrel)

### 3. Added Error Handling to MandrelClient
Following my own Execution Protocol, I executed the task "add error handling to the Mandrel client":

- **Error type discrimination**: `ssh_failed`, `timeout`, `json_parse`, `connection`, `tool_error`, `unknown`
- **Retry logic**: Exponential backoff (500ms, 1s, 2s) for retriable errors
- **Connection health tracking**: `getHealthStatus()` method
- **TypeScript compiles**: Validated

### 4. Self-Validation
Ran forge-engine, received ContextPackage, followed Execution Protocol, implemented feature. The loop works.

---

## Key Insight

**The Forge doesn't replace Claude Code - it augments it.**

```
Human Request
    ↓
ForgeEngine (produces ContextPackage)
    ↓
Claude Code + Execution Protocol (consumes ContextPackage, does work)
    ↓
Quality Gate (validates)
    ↓
Mandrel (stores results for learning)
```

The prototype is complete from Intake → Preparation. The execution path exists (Execution Protocol). What's missing: Quality Gate, Learning Retrieval, and LLM intelligence in preparation.

---

## Files Created/Modified

**Created:**
- `SIRK-PASS-3.md` - Full analysis and Execution Protocol design
- `handoffs/HANDOFF-003.md` - This document

**Modified:**
- `forge-engine/src/mandrel.ts` - Added error handling (error types, retry logic, health tracking)

---

## For Instance #4

### Suggested Focus Areas

**1. Improve Classification (HIGHEST IMPACT)**
The keyword matching is crude. "add error handling to Mandrel client" matched 6 files because they all contain "error". Semantic understanding is needed.

Options:
- TF-IDF scoring (better than raw keyword matching)
- LLM classification (Option B from i[2]: MCP tool wrapping Anthropic API)
- Embedding similarity (use Mandrel's pgvector)

**2. Build Quality Gate**
We have Preparation → Execution but no Quality review. What checks happen before work is accepted?
- TypeScript compilation passes
- Tests pass
- Code review checklist
- Acceptance criteria met

**3. Learning Retrieval**
Mandrel STORES contexts, but preparation doesn't RETRIEVE them. The 7-phase preparation protocol should query Mandrel for:
- Previous attempts at similar tasks
- Related decisions
- Patterns that worked/failed

**4. Human Sync Interface**
When Human Sync triggers, what does the human SEE? Current: just a message. Needed: structured options, context summary, clear choices.

### The Big Question

**How should feedback flow?**

When execution reveals the ContextPackage was wrong (wrong files, bad patterns, missing constraints), how does that information improve future preparations?

This is the learning loop. Without it, instances don't compound.

---

## Mandrel Context

Search: `context_search sirk-pass-3`

Key context IDs:
- `63cd5ab4-c468-45ff-9ccb-a3e1117d7f12` - SIRK Pass #3 completion summary
- `b86f2fb9-fa0b-4fa1-be24-eeb4cfc8a0f9` - i[2] handoff
- `190eec20-b0bc-4e62-8e89-4ca8c016b4f9` - i[1] handoff

---

## Status

- **Prototype**: Works (Intake → Classification → Preparation → ContextPackage)
- **Execution Protocol**: Designed and documented
- **Error Handling**: Implemented and tested
- **Quality Gate**: NOT IMPLEMENTED
- **Learning Loop**: NOT IMPLEMENTED
- **LLM Integration**: NOT IMPLEMENTED

The structure is in place. The intelligence is not.

---

*i[3] signing off. The forge-engine runs. The protocol is documented. Add intelligence.*
