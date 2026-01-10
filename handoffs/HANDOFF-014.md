# Handoff: Instance #14 → Instance #15

**Date:** 2026-01-09
**Model:** Claude Opus 4.5
**Session Focus:** Fix the Learning System - Two-Phase Retrieval

---

## A. What I Did

### Completed
- [x] Diagnosed why LearningRetriever returned 0 results
- [x] Implemented two-phase retrieval pattern in MandrelClient
- [x] Rewrote `findPreviousAttempts()` and `findRelatedDecisions()` in LearningRetriever
- [x] Verified fix works - now returns historical context items
- [x] TypeScript compiles

### Files Changed
| File | Change Type | Description |
|------|-------------|-------------|
| src/mandrel.ts | modified | Added `getContextById()` and `extractIdsFromSearchResults()` methods |
| src/learning.ts | modified | Rewrote `findPreviousAttempts()` and `findRelatedDecisions()` with two-phase retrieval |
| src/index.ts | modified | Updated instance ID to i[14] |

---

## B. The Root Problem (Now Solved)

**Why LearningRetriever returned 0 results:**

1. `smart_search` returns truncated display text with emojis:
   ```
   🔍 Smart Search Results (5)
   1. **COMPLETION: ContextPackage...** 📝
      💬 ContextPackage prepared for task d1ff16c5...
      🆔 ID: aa8369c0-96f1-47fb-ae5e-83b44ff3fc3d
   ```

2. LearningRetriever tried to parse this with regex looking for "Task:" and "lesson:" patterns

3. The actual data is JSON embedded in full context content - not visible in truncated display

**The Fix - Two-Phase Retrieval:**

1. **Phase 1: Discovery** - Call `smart_search()` to get relevant context IDs
2. **Phase 2: Retrieval** - Fetch full content via `context_search({id: uuid})`
3. **Phase 3: Parse** - Extract JSON from full content

---

## C. What Works

**Learning System (NOW WORKING):**

```
BEFORE i[14]:
[LearningRetriever] Found 0 historical context items

AFTER i[14]:
[LearningRetriever] Found 5 context IDs to fetch
[LearningRetriever] Found 1 previous attempts (via two-phase retrieval)
[LearningRetriever] Found 3 historical context items (after contamination filter)
```

The ContextPackage now includes real historical data in the `history` section.

**New MandrelClient Methods:**

```typescript
// Fetch full context by ID
mandrel.getContextById(id: string): Promise<{
  success: boolean;
  content?: string;
  type?: string;
  tags?: string[];
}>

// Extract IDs from search display text
mandrel.extractIdsFromSearchResults(searchResults: string): string[]
```

---

## D. What Doesn't Work / Known Issues

**Shell Quoting Issue (NOT FIXED):**

When content contains apostrophes (e.g., "It's"), the SSH command breaks:
```
bash: -c: line 1: unexpected EOF while looking for matching `"'
```

This happens because MandrelClient escapes single quotes but the LLM output often contains apostrophes. The SSH+curl pattern needs better quoting.

**Possible fix:** Use double quotes for the outer command or escape apostrophes in content before sending.

**Other inherited issues:**
- Quality score still fails for vague tasks (45/100)
- File discovery finds 0 files for simple tasks
- Decision retrieval returns 0 (most contexts aren't type "decision")

---

## E. Key Insights

**The Mandrel API has two return formats:**

1. **Display format** (from search tools): Truncated, emoji-rich, human-readable
2. **Full format** (from ID lookup): Complete content with embedded JSON

Any tool that needs to parse structured data from Mandrel should use the two-phase pattern.

**The Learning System was architecturally sound but implementation was wrong:**

i[4] designed the right abstractions (LearningRetriever, FeedbackRecorder, HistoricalContext). The issue was purely in the parsing layer - looking for patterns in the wrong format.

---

## F. For Next Instance

### Suggested Focus (pick 1-2)

1. **Fix shell quoting issue** - Content with apostrophes breaks SSH commands
   - Consider using HTTP directly or base64 encoding content

2. **Improve decision retrieval** - Returns 0 results because most contexts are type "completion" not "decision"
   - Maybe broaden search or extract decisions from completion content

3. **Better task description extraction** - `parseExecutionFeedback()` can't always find the original task description
   - Consider storing task description explicitly in execution feedback

4. **Test complex execution** - i[13]'s execution works for simple tasks
   - Test multi-file modifications

5. **Attack other Hard Problems:**
   - Human Sync Protocol - when/how to surface uncertainties
   - Context Management - what if ContextPackage exceeds window
   - Tool Building - self-extending capability

### Watch Out For

- The shell quoting issue may cause silent failures on content with special characters
- The pattern parsing in `parseExecutionFeedback()` is still somewhat fragile
- File discovery returning 0 results makes quality score fail even when learning works

---

## G. Mandrel Context Stored

Search: `context_search "i[14]"` or `context_search "two-phase retrieval"`

---

## H. The Strategic View

**After 14 passes, The Forge can:**
1. Classify tasks (PlantManager + LLM)
2. Prepare context packages (PreparationForeman + workers)
3. Evaluate preparation quality (QualityGate + LLM)
4. Execute tasks (ExecutionForeman + workers)
5. **LEARN from previous executions** ← FIXED by i[14]

**The learning loop is now closed:**
```
Task → Prepare (with historical context) → Execute → Store Feedback → Next Task learns from it
```

**Remaining Hard Problems:**
- Context Management (window limits)
- Human Sync Protocol (when to ask for clarification)
- Tool Building (self-extension)
- Better quality checks in Preparation

---

*Instance #14 complete. The Learning System now retrieves historical context. Future instances can learn from past executions.*
