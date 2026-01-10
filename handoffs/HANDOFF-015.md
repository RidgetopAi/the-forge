# Handoff: Instance #15 → Instance #16

**Date:** 2026-01-09
**Model:** Claude Opus 4.5
**Session Focus:** Human Sync Protocol - Active Trigger Detection and Question Generation

---

## A. What I Did

### Completed
- [x] Designed and implemented HumanSyncService
- [x] Built 5 trigger detectors (vague task, high-risk, conflicts, quality, ambiguous target)
- [x] Implemented context-aware question generation with options
- [x] Built response handling framework
- [x] Integrated into ForgeEngine at Phase 1.5 and Phase 3.5
- [x] Tested with high-risk and normal tasks
- [x] TypeScript compiles

### Files Created
| File | Description |
|------|-------------|
| src/human-sync.ts | HumanSyncService with triggers, question generation, response handling |

### Files Modified
| File | Change Type | Description |
|------|-------------|-------------|
| src/index.ts | modified | Added Phase 1.5 (pre-prep check) and Phase 3.5 (pre-exec check), updated exports |

---

## B. The Architecture

### HumanSyncService

Three capabilities working together:

**1. Trigger Detection**
```typescript
interface HumanSyncTrigger {
  id: string;
  name: string;
  priority: number; // 1-10, 10 = most urgent
  check: (context: TriggerContext) => TriggerResult;
}
```

Built-in triggers:
- `vagueTaskTrigger`: < 3 words, no action verb, only generic words
- `highRiskOperationTrigger`: delete, auth, admin, payment, production config
- `conflictingConstraintsTrigger`: speed vs thoroughness, no-breaking + refactor
- `qualityThresholdTrigger`: score < 40 (critical), < 60 (high), < 70 (medium)
- `ambiguousTargetTrigger`: no mustRead files, no relevant components

**2. Question Generation**
```typescript
const question = service.generateQuestion(firedTriggers, context);
// Returns: question text, context, options with impacts, urgency level
```

**3. Response Handling**
```typescript
const result = await service.processResponse(requestId, selectedOption, notes);
// Returns: action (proceed/modify/abort/retry), modifications
```

### Integration Points

```
PHASE 1: INTAKE
    ↓
PHASE 1.5: HUMAN SYNC - PRE-PREPARATION (NEW)
    - Check: VagueTask, HighRisk
    - Critical/High → STOP, return HumanSyncRequest
    ↓
PHASE 2: PREPARATION
    ↓
PHASE 3: QUALITY EVALUATION
    ↓
PHASE 3.5: HUMAN SYNC - PRE-EXECUTION (NEW)
    - Check: QualityThreshold, AmbiguousTarget, Conflicts
    - Critical/High → STOP, return HumanSyncRequest
    ↓
PHASE 4: EXECUTION
```

---

## C. What Works

**High-Risk Detection Test:**
```
Request: "delete all user data from the database and clean up the files"

[HumanSync] CRITICAL: This task involves high-risk operations. Do you want to proceed?
Identified risks:
• Deletion operation detected
• Bulk deletion detected

Options:
  [proceed_careful] Proceed with extra caution
  [proceed_fast] Proceed normally
  [modify_scope] Modify the scope
  [abort] Abort task
```
→ Pipeline STOPPED at Phase 1.5 with full HumanSyncRequest returned

**Normal Task Quality Check:**
```
Request: "add a simple greeting function that returns Hello World"

[HumanSync] Triggers fired: Quality Threshold Check, Ambiguous Target Detection
[HumanSync] MEDIUM: Preparation quality score is 65/100. How should we proceed?

Options:
  [improve] Improve preparation
  [execute_anyway] Execute anyway
  [add_context] I'll add context
```
→ Logged warning but proceeded (medium urgency doesn't block)

---

## D. What Doesn't Work / Known Issues

**Shell Quoting (INHERITED - NOT FIXED):**
When content contains apostrophes, SSH commands break. The option "I'll add context" causes:
```
bash: -c: line 1: unexpected EOF while looking for matching `"'
```
This is the same issue i[14] documented. Mandrel storage fails silently for content with apostrophes.

**VagueTask Trigger Sensitivity:**
The PlantManager's existing low-confidence check catches vague tasks before my trigger fires. Tasks like "fix it" and "update the thing" return 30% confidence and stop at classification, never reaching Phase 1.5.

This isn't necessarily bad (redundant safety) but means the VagueTaskTrigger rarely fires on its own.

**Response Handler Not Integrated:**
The `processResponse()` method exists but there's no CLI or API to actually call it. Users see the question and options but have no way to respond within The Forge. They must manually re-run with a modified request.

---

## E. Key Insights

**Human Sync is Architectural, Not Fallback:**
The seed document was right. The Forge needs a voice. Before i[15], it would just output "needsHumanSync: true" with a generic reason. Now it:
- Actively detects WHY human input is needed
- Generates specific, actionable questions
- Provides options with impact descriptions
- Assigns urgency to help prioritize

**Trigger Priority Ordering:**
Higher priority triggers are checked first. This means if both high-risk AND quality threshold fire, the high-risk question is shown (more urgent).

**Critical vs High vs Medium Urgency:**
- Critical/High: Blocks pipeline, returns immediately
- Medium: Logs warning, proceeds (for marginal quality scores)
- Low: Noted but not displayed

---

## F. For Next Instance

### Suggested Focus (pick 1-2)

1. **Implement Response Handler UI/CLI** - Users can see questions but can't respond
   - Add `--respond <request-id> <option>` CLI command
   - Store response, update task state, resume pipeline

2. **Fix Shell Quoting** - Content with apostrophes breaks Mandrel storage
   - Consider base64 encoding content before SSH
   - Or use a different quoting strategy

3. **Improve VagueTask Detection** - Currently redundant with PlantManager confidence
   - Could make it more nuanced (detect "what" without "where")
   - Or remove if PlantManager is sufficient

4. **Attack Other Hard Problems:**
   - Context Management (what if ContextPackage exceeds window)
   - Tool Building (self-extending capability)

### Watch Out For

- The shell quoting issue causes silent failures - check Mandrel for actual storage
- Quality scores between 60-70 trigger warnings but don't block
- The response handler infrastructure exists but isn't wired up

---

## G. Mandrel Context Stored

Search: `context_search "i[15]"` or `context_search "human-sync-protocol"`

---

## H. The Strategic View

**After 15 passes, The Forge can:**
1. Classify tasks (PlantManager + LLM)
2. **Detect risky/ambiguous situations** ← NEW (i[15])
3. **Generate clarifying questions** ← NEW (i[15])
4. Prepare context packages (PreparationForeman + workers)
5. Evaluate preparation quality (QualityGate + LLM)
6. Execute tasks (ExecutionForeman + workers)
7. Learn from previous executions (LearningRetriever, i[14] fix)

**The Human Sync Protocol addresses Seed Hard Problem #6:**
> When does the system surface uncertainties to the human? What triggers a Human Sync? What's the interface?

Answer (i[15]):
- **When:** At Phase 1.5 (pre-prep) and Phase 3.5 (pre-exec) via triggers
- **What triggers:** Five trigger types covering vagueness, risk, conflicts, quality, ambiguity
- **Interface:** HumanSyncRequest with question, context, options, urgency

**Remaining Hard Problems:**
- Context Management (window limits)
- Tool Building (self-extension)
- Response handling integration (users can't actually respond yet)

---

*Instance #15 complete. The Forge now has a voice - it can detect when human input is needed and ask meaningful questions with options.*
