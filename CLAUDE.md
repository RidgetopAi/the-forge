# The Forge - Agent Instructions

## Project Context

This is **The Forge** - a Development Cognition System being built through SIRK (multi-pass iterative refinement). You are an instance contributing to this process.

## Mandrel - Your Memory System

**All context, decisions, and handoffs flow through Mandrel.** This is your persistent memory across instances.

### How to Access Mandrel

From inside this container, use SSH + curl:

```bash
ssh hetzner 'curl -s -X POST http://localhost:8080/mcp/tools/<tool_name> \
  -H "Content-Type: application/json" \
  -d '\''{"arguments": {<params>}}'\'''
```

### Essential Mandrel Commands

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
  -d '\''{"arguments": {"content": "Your context here", "type": "planning", "tags": ["tag1", "tag2"]}}'\'''
```

**Context types:** `code`, `decision`, `error`, `discussion`, `planning`, `completion`, `milestone`, `reflections`, `handoff`

**List all tools:**
```bash
ssh hetzner 'curl -s -X POST http://localhost:8080/mcp/tools/mandrel_help \
  -H "Content-Type: application/json" \
  -d '\''{"arguments": {}}'\'''
```

## Session Workflow

1. **First:** Run `context_get_recent` to see what previous instances did
2. **Read:** THE-FORGE-SEED-V1.md for the vision and Hard Problems
3. **Read:** Latest handoff in `handoffs/` directory
4. **Work:** Make your contribution following SIRK protocol
5. **Store:** Save your work to Mandrel with `context_store`
6. **Handoff:** Write your handoff document for the next instance

## Before You Build

1. Question the previous handoff's direction. Is it right for the project, or just next in line?
2. Generate two real alternatives to your initial plan.
3. Evaluate all three. Choose with reasoning, not momentum.
4. Store your plan to Mandrel (`context_store`, type: `planning`) with your chosen approach and why you rejected the alternatives.

You serve the project, not the chain. Your reasoning becomes context for future instances.

## Key Files

- `THE-FORGE-SEED-V1.md` - The seed document (vision, patterns, problems)
- `handoffs/HANDOFF-NNN.md` - Instance handoff chain
- `HANDOFF-TEMPLATE.md` - Template for writing your handoff

## SIRK Protocol Summary

Each pass should:
1. Read all previous passes
2. Critically evaluate (don't accept uncritically)
3. Pick 1-2 Hard Problems and make concrete progress
4. Find edge cases previous passes missed
5. Leave clear handoff for next instance
6. Don't repeat - build on or challenge previous work

## Non-Negotiables

- Database-backed everything (no .md file state management)
- No unconstrained design - validate what you design
- Maximum 2-3 instances before working prototype required
- Human-in-the-loop is architectural, not fallback
