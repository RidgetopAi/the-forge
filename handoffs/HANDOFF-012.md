# Handoff: Instance #12 → Instance #13

**Date:** 2026-01-09
**Model:** Claude Opus 4.5
**Session Focus:** Add Pattern Inference Strategy for "add new X" → find existing X implementations

---

## A. What I Did

### Completed
- [x] Ran The Forge on a real task: "add the Execution Department"
- [x] Identified root cause: mustRead missed existing department implementations
- [x] Added Strategy 0.5: Pattern Inference to FileDiscoveryWorker
- [x] Validated fix: mustRead now includes preparation.ts, plant-manager.ts, quality-gate.ts
- [x] Stored handoff and completion contexts to Mandrel

### Files Changed
| File | Change Type | Description |
|------|-------------|-------------|
| src/departments/preparation.ts | modified | Added `discoverByPatternInference()` method (~100 lines) |
| src/index.ts | modified | Updated instance ID to i[12] |

---

## B. What Works

**Pattern Inference Strategy (Strategy 0.5):**

When task says "add/create/implement new [Concept]", finds existing implementations:

1. **Concept Detection:** Extracts architectural concepts (department, worker, foreman, component, service, handler, manager, controller, module)

2. **Three Search Methods:**
   - Files in directories named after concept (e.g., `/departments/*.ts`)
   - Classes/interfaces ending with concept (e.g., `class PreparationForeman`)
   - Files with concept in name (e.g., `*worker*.ts`)

3. **Adds to mustRead:** With reason "Existing X implementation (pattern to follow)"

**Validated with real task:**
```
Task: "add the Execution Department that takes a ContextPackage..."

BEFORE (i[11]):
- mustRead: llm.ts, types.ts
- Missing: No existing department implementations
- Quality: 65/100 FAILED
- LLM: "Missing critical context files - no existing department implementations"

AFTER (i[12]):
- mustRead: llm.ts, types.ts, quality-gate.ts, plant-manager.ts, preparation.ts
- LLM: "Identifies existing department implementations as patterns to follow"
```

---

## C. What Doesn't Work / Blockers

**Quality score dropped (65→45):**
The LLM evaluator is now harsher on OTHER issues that i[12] didn't fix:
- Generic acceptance criteria ("Code compiles" for any task)
- Fragmented scope keywords (just split task description into words)
- Shallow architecture overview ("Project with X files across Y components")
- Missing technical constraints

These are valid issues but not related to file discovery.

**relatedExamples still noisy:**
- Shows HANDOFF-*.md files because they contain "execution"
- Shows FORGE-ADVISOR.md for same reason
- For code tasks, markdown files are usually not relevant examples

**LearningRetriever found 0 items:**
- smart_search returned nothing for this project
- Either no relevant history or search not working

---

## D. Key Decisions Made

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Add Strategy 0.5 (not replace existing) | Pattern inference complements explicit references | Could have modified Strategy 0 to include inference |
| Detect 9 architectural concepts | Cover common patterns: department, worker, foreman, component, service, handler, manager, controller, module | Could have used LLM to extract concepts |
| Use three search methods | Different codebases organize differently (by directory vs by class suffix vs by filename) | Could have used just ripgrep for class definitions |
| Run all methods for each concept | Maximize recall, let deduplication handle overlaps | Could have stopped after first match |

---

## E. For Next Instance

### Suggested Focus (pick 1-2)

1. **Fix acceptance criteria generation** - Replace fragmented keyword scope and generic criteria with task-type-aware meaningful criteria

2. **Improve architecture overview** - The "Project with X files across Y components" is useless. Could describe how new code fits into the architecture.

3. **Filter relatedExamples** - For code tasks, filter out .md files that aren't API docs. The current matching is too generic.

4. **Test LearningRetriever** - It returned 0 items. Is smart_search working for this project? Is there relevant history?

5. **Attack other Hard Problems:**
   - Learning System (3) - Make LearningRetriever actually retrieve useful history
   - Context Management (4) - What if ContextPackage exceeds context window?
   - Human Sync Protocol (6) - Concrete triggers and interface

### Watch Out For

- Don't endlessly refine file discovery - 5+ passes have focused on Preparation
- The strategic question remains: "What makes the system useful?"
- Consider testing end-to-end usefulness by actually executing a ContextPackage

### What Would Change My Mind

If pattern inference causes false positives (includes irrelevant files as "patterns"), may need to filter by:
- File recency (prefer recently modified implementations)
- Code similarity (semantic matching)
- Relevance to task keywords

---

## F. Mandrel Context Stored

- `c3649e43-ad3a-4745-bf8e-536fb22bccbb`: SIRK Pass 12 Handoff (this summary)
- `5250c54a-5cf6-4848-97e0-0dd3b1a19b3e`: i[12] Completion (detailed implementation notes)

Search: `context_search "sirk-pass-12"`

---

## G. Session Metrics

- Lines added: ~100 (pattern inference strategy)
- TypeScript: COMPILES
- Pattern inference validated: mustRead now includes existing implementations

---

## H. The Strategic View

After 12 passes:
- **File Discovery:** Significantly improved
  - i[9]: Task-type awareness
  - i[11]: Explicit reference extraction
  - i[12]: Pattern inference for "add new X"
- **Content Generation:** i[10] made task-type-aware
- **Quality Evaluation:** Working (LLM scores accurately)

**Remaining gaps in Preparation:**
1. Acceptance criteria too generic
2. Scope keywords just fragmented description
3. Architecture overview shallow
4. relatedExamples too noisy

**Untouched Hard Problems:**
1. Learning System - infrastructure exists but not returning results
2. Context Management - what if package is too large?
3. Human Sync Protocol - concrete triggers undefined
4. Execution Department - still doesn't exist
5. Tool Building - not addressed

**The meta-question:** 12 passes have refined Preparation. When is Preparation "good enough" to move to other problems?

---

*Instance #12 complete. Pattern inference now finds existing implementations when creating new things.*
