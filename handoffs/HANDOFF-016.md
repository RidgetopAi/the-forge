# Handoff: Instance #16 → Instance #17

**Date:** 2026-01-09
**Model:** Claude Opus 4.5
**Session Focus:** Context Management - Hard Problem #4

---

## A. What I Did

### Completed
- [x] Analyzed Context Management problem from seed document
- [x] Designed three-component solution (TokenCounter, BudgetManager, FileExtractor)
- [x] Built `src/context-budget.ts` with all components
- [x] Integrated into Execution department (replaced dumb truncation)
- [x] Tested with real source files demonstrating 87-91% token reduction
- [x] TypeScript compiles
- [x] Stored context to Mandrel

### Files Created
| File | Description |
|------|-------------|
| src/context-budget.ts | Context Budget Manager with TokenCounter, ContextBudgetManager, FileContentExtractor |

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| src/departments/execution.ts | modified | Replaced truncateContent with processFilesWithBudget, added budget reporting |
| src/index.ts | modified | Added exports for context budget components, updated instance ID |

---

## B. The Architecture

### Context Budget Manager

**Problem:** The seed document says "Context window is the hard constraint. Can't dump everything in. Must be selective." Before i[16], CodeGenerationWorker just truncated each file to 3000 chars - no intelligence about WHAT to keep.

**Solution:** Three components working together:

```
┌─────────────────────────────────────────────────────────────┐
│                  processFilesWithBudget()                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. TokenCounter          2. BudgetManager      3. Extractor │
│  ┌───────────────┐       ┌───────────────┐     ┌───────────┐│
│  │ estimate()    │       │ allocate()    │     │ extract() ││
│  │ estimateCode()│       │ by priority   │     │ full      ││
│  └───────────────┘       │ high > med > low│   │ signatures││
│                          └───────────────┘     │ truncated ││
│                                                │ summary   ││
│                                                └───────────┘│
└─────────────────────────────────────────────────────────────┘
```

### TokenCounter
Estimates token count without API calls:
- English text: ~4 chars per token
- Code: ~3 chars per token (more conservative for special chars)

### ContextBudgetManager
Allocates budget across categories:
- Default: 60,000 tokens total
- 67% for mustRead files
- 13% for relatedExamples
- Remaining for patterns, history, output buffer

Priority allocation:
- High priority: up to 80% of file budget (shared among high files)
- Medium priority: share remaining after high
- Low priority: minimal allocation from leftovers

### FileContentExtractor
Four extraction levels (in order of information density):

1. **Full** - Entire file content (when fits budget)
2. **Signatures** - Imports + exports + type definitions + function signatures
3. **Truncated** - Smart truncation at structural boundaries
4. **Summary** - Just file description and export list

The key insight: An LLM doesn't need every line of implementation. It needs to know WHAT a file provides (types, functions) and HOW to use it (signatures, patterns).

---

## C. What Works

**Validation Test Results:**
```
Processing 5 files with 40k token budget...

Budget Summary:
  Total files: 5
  Full content: 3
  Signatures only: 2
  Truncated: 0
  Excluded: 0
  Tokens used: 18,353
  Budget remaining: 21,647

File Details:
  context-budget.ts: full (7774 tokens)
  index.ts: full (4958 tokens)
  human-sync.ts: signatures (8973 → 1194 tokens, 87% reduction)
  types.ts: full (3674 tokens)
  learning.ts: signatures (8028 → 753 tokens, 91% reduction)
```

The system intelligently:
- Kept high-priority files at full content
- Extracted signatures from medium/low priority files
- Achieved massive token reduction while preserving essential information

---

## D. What Doesn't Work / Known Issues

**Shell Quoting (INHERITED - NOT FIXED):**
Same issue from i[14], i[15]. Content with apostrophes breaks Mandrel storage via SSH.

**Signature Extraction Quality:**
The signature extraction regex is basic. Complex multi-line type definitions or unusual code patterns might not extract perfectly. The code handles common cases but edge cases exist.

**No Semantic Relevance:**
Budget allocation is by priority tags (high/medium/low) and size. It doesn't consider WHICH parts of a file are most relevant to the specific task. Future improvement could use embeddings to prioritize relevant sections.

---

## E. Key Insights

**Extraction > Truncation:**
The previous approach (truncate at 3000 chars) was throwing away potentially critical code. A function signature at char 4000 would be lost. Extraction preserves the structure - you get all the public API, all the types, all the function signatures.

**Information Density Hierarchy:**
Not all parts of code are equally useful for context:
1. Type definitions - critical for understanding data shapes
2. Function signatures - critical for understanding API
3. Implementation details - often not needed unless directly relevant
4. Comments - sometimes useful, often not

**Budget Reporting:**
The execution logs now show exactly how context was managed:
```
[Worker:CodeGeneration] Context Budget Summary:
  Total files: 5
  Full content: 3
  Signatures only: 2
  Tokens used: 18353
  Budget remaining: 21647
```

This visibility helps diagnose when context issues cause problems.

---

## F. For Next Instance

### Suggested Focus (pick 1-2)

1. **Response Handler Integration** (from i[15])
   - Users see Human Sync questions but can't respond
   - Add `--respond <request-id> <option>` CLI

2. **Fix Shell Quoting** (inherited)
   - Base64 encode content before SSH
   - Been an issue for multiple passes

3. **Improve Signature Extraction**
   - Better handling of complex type definitions
   - Consider using TypeScript's actual parser instead of regex

4. **Semantic Context Selection**
   - Use embeddings to prioritize RELEVANT sections of files
   - Not just priority tags, but task-relevance

5. **Attack Tool Building (Hard Problem #5)**
   - "The Forge may need to build its own tools"
   - What tools does it actually need?
   - Self-extending capability

### Watch Out For

- The signature extraction uses regex - complex code patterns might not extract well
- Budget allocation assumes all high-priority files are equally important
- The token estimation is approximate - very long contexts might still overflow

---

## G. Mandrel Context Stored

Search: `context_search "i[16]"` or `context_search "context-management"`

---

## H. The Strategic View

**After 16 passes, The Forge can:**
1. Classify tasks (PlantManager + LLM)
2. Detect risky/ambiguous situations (HumanSyncService, i[15])
3. Generate clarifying questions (HumanSyncService, i[15])
4. Prepare context packages (PreparationForeman + workers)
5. Evaluate preparation quality (QualityGate + LLM)
6. **Manage context intelligently** ← NEW (i[16])
7. Execute tasks (ExecutionForeman + workers)
8. Learn from previous executions (LearningRetriever, i[14])

**Hard Problems Progress:**
| Problem | Status | Key Contribution |
|---------|--------|------------------|
| 1. Preparation | ✅ Solved | Multiple passes (i[1]-i[12]) |
| 2. Live Feedback | ⚠️ Partial | ExecutionFeedback (i[4], i[13]) |
| 3. Learning System | ✅ Solved | Two-phase retrieval (i[14]) |
| 4. Context Management | ✅ Solved | Context Budget Manager (i[16]) |
| 5. Tool Building | ❌ Unsolved | - |
| 6. Human Sync | ✅ Solved | Trigger detection + questions (i[15]) |

**Remaining for Working Prototype:**
- Response handler integration (complete Human Sync loop)
- Fix shell quoting (reliability)
- End-to-end validation with complex real tasks

---

*Instance #16 complete. The Forge now manages context intelligently - extracting signatures from large files, allocating budget by priority, and reporting usage transparently.*
