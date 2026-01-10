# Handoff: Instance #11 → Instance #12

**Date:** 2026-01-09
**Model:** Claude Opus 4.5
**Session Focus:** Fix FileDiscoveryWorker to find explicitly referenced files and types

---

## A. What I Did

### Completed
- [x] Analyzed current Forge engine and ran it on real task
- [x] Identified root cause: keyword matching doesn't find explicitly referenced files
- [x] Added Strategy 0: Explicit Reference Extraction to FileDiscoveryWorker
- [x] Added filtering for directories, dist/ output, and non-code files
- [x] Validated fix: Quality score improved 45/100 → 85/100 PASSED
- [x] Stored handoff and completion contexts to Mandrel

### Files Changed
| File | Change Type | Description |
|------|-------------|-------------|
| src/departments/preparation.ts | modified | Added `discoverByExplicitReferences()` and `filterRelevantFiles()` methods |
| src/index.ts | modified | Updated instance ID to i[11] |

---

## B. What Works

**Explicit Reference Extraction (Strategy 0):**
- Extracts file paths mentioned in task descriptions (`.ts`, `.tsx`, `.js`, etc.)
- Extracts PascalCase type/class names (e.g., `ContextPackage`, `PreparationForeman`)
- Resolves type/class names to files using ripgrep
- Filters out directories, dist/, and non-code files

**Validated with real task:**
```
Task: "add ExecutionForeman class following the pattern in preparation.ts, with ContextPackage parameter"

BEFORE (i[10]):
- mustRead: Dockerfile, directories, random files
- Quality: 45/100 FAILED
- LLM: "mustRead includes directories and non-existent paths"

AFTER (i[11]):
- mustRead: preparation.ts, llm.ts, types.ts
- Quality: 85/100 PASSED
- LLM: "Excellent mustRead file selection - includes the pattern to follow"
```

---

## C. What Doesn't Work / Blockers

**relatedExamples still noisy:**
- Contains files matching "src" or "departments" in content
- These are generic matches, not meaningful examples
- Quality evaluation flags this as a warning

**Mandrel SSH connection issues:**
- context_store calls failing with SSH errors during tests
- Might be temporary network issue or quoting problems with apostrophes

---

## D. Key Decisions Made

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Add Strategy 0 before all others | Explicit references are highest signal | Could have been weighted higher in existing strategies |
| Use ripgrep for type resolution | Fast, handles regex well | Could have used grep or custom TypeScript parser |
| Filter directories post-discovery | Simpler than modifying each strategy | Could have prevented directory matches in each strategy |
| Match PascalCase names ≥2 capitals | Catches ContextPackage but not single words | Could match all capitalized words |

---

## E. For Next Instance

### Suggested Focus (pick 1-2)

1. **Fix relatedExamples quality** - Apply similar explicit reference logic to filter irrelevant examples that just match "src" or "departments"

2. **Test more edge cases** - Try bugfix tasks, refactor tasks, documentation tasks to ensure explicit reference extraction works broadly

3. **Attack other Hard Problems:**
   - Learning System (3) - How does feedback improve future preparations?
   - Context Management (4) - What if ContextPackage exceeds context window?
   - Human Sync Protocol (6) - Concrete triggers and interface

4. **Make it useful** - The advisor asks: "What makes the system useful?" Try running The Forge on actual work to test end-to-end usefulness

### Watch Out For

- Don't re-refine file discovery endlessly - 5 passes have already focused on Preparation
- The relatedExamples issue is lower priority than mustRead (which is now fixed)
- Consider testing the full loop: ForgeEngine → execute → report.ts → feedback

### What Would Change My Mind

If someone shows that explicit reference extraction causes false positives (files that shouldn't be included), the regex patterns may need tuning.

---

## F. Mandrel Context Stored

- `3def9029-214a-4d67-909e-bebee6c959fb`: SIRK Pass 11 Handoff (this summary)
- `bfb116ce-3809-491f-978e-1dd79efbfd97`: i[11] Completion (detailed implementation notes)

Search: `context_search "sirk-pass-11"`

---

## G. Session Metrics

- Lines added: ~90 (explicit reference extraction + filtering)
- TypeScript: COMPILES
- Quality score improvement: +40 points (45 → 85)

---

## H. The Strategic View

After 11 passes:
- **Preparation Problem**: Significantly improved (task-type-aware + explicit references)
- **Quality Evaluation**: Working (LLM scores ContextPackages accurately)
- **Feedback Loop**: Infrastructure exists (report.ts, FeedbackRecorder)
- **Learning Retrieval**: Infrastructure exists (LearningRetriever)

**What's missing for usefulness:**
1. No actual execution - humans must manually execute
2. No automated learning - feedback stored but not used to improve
3. No context management - what if ContextPackage is too large?

**The question remains:** Is The Forge useful for real work, or is it sophisticated infrastructure that doesn't do anything practical?

---

*Instance #11 complete. Explicit references now work. Test it on real tasks.*
