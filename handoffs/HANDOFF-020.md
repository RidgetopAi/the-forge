# HANDOFF-020: Insight Generator - Making Learning Compound

**Instance**: i[20]
**Date**: 2026-01-10
**Focus**: Hard Problem #3 - Learning System Enhancement

---

## What I Did

Built the **Insight Generator** - a component that analyzes accumulated execution feedback and generates actionable recommendations.

### The Gap I Found
The Forge had 167 contexts across 19 instances, but learning wasn't compounding. The LearningRetriever does string-matching retrieval but doesn't extract **statistical patterns** from accumulated data.

Same preparation mistakes could repeat because the system didn't know:
- Which preparation patterns correlate with success
- What mustRead accuracy actually predicts
- Which failure modes recur

### What I Built

**1. InsightGenerator Class** (~450 lines in src/insights.ts):
- `collectExecutionFeedback()` - Two-phase retrieval from Mandrel
- `computeStatistics()` - Success rates, compilation rates, mustRead accuracy
- `identifyFailureModes()` - Categorizes why executions fail
- `identifySuccessPatterns()` - What correlates with success
- `generateRecommendations()` - Actionable suggestions with evidence
- `formatInsights()` - CLI-friendly output

**2. CLI Command** (`--insights [project-path]`):
- `npx tsx src/index.ts --insights` - All projects
- `npx tsx src/index.ts --insights /workspace/projects/the-forge` - Filtered

### First Insights Generated

```
Total Executions: 3
Success Rate: 33.3%
Compilation Pass Rate: 100.0%
mustRead Over-Prediction Rate: 67%

RECOMMENDATIONS:
[!] PREPARATION: Reduce mustRead file predictions
    Evidence: 67% had unnecessary files. Avg 3.3 per execution.

[!] EXECUTION: Address primary failure mode: unknown failure
    Evidence: 2 failures (100% of failures)

[→] VALIDATION: Compilation passes but tasks still fail
    Evidence: 100% compile, 33% succeed
```

### Files Created/Modified
| File | Description |
|------|-------------|
| src/insights.ts | NEW - InsightGenerator (~450 lines) |
| src/index.ts | Added --insights command, exports, instance ID to i[20] |

---

## Key Insight

The mustRead prediction is **massively over-predicting** files. 67-100% of executions have unnecessary files in mustRead (files predicted as needed that weren't actually read).

This suggests the preparation keyword matching is too aggressive. The insight generator can now track this over time to see if improvements work.

---

## For i[21]

### Suggested Focus

1. **Act on the mustRead over-prediction insight**
   - Look at preparation.ts keyword matching
   - Make it more conservative or smarter
   - Run more executions to see if accuracy improves

2. **Improve failure mode detection**
   - Current: 100% "unknown_failure"
   - Add better categorization from learnings/error messages
   - JSON parsing errors, type errors, etc.

3. **Feed insights into preparation**
   - InsightGenerator produces recommendations
   - Preparation department should consume them
   - Automatic improvement loop

4. **Run more executions**
   - Only 3 records with proper JSON format
   - More data = better patterns
   - Try `--execute` on simple tasks

### Watch Out For

- InsightGenerator needs well-formatted execution feedback
- Not all contexts in Mandrel have the expected JSON structure
- May need to standardize feedback format across executions

---

## Build Status

```bash
npx tsc --noEmit  # ✅ Passes
npx tsx src/index.ts --insights  # ✅ Works
```

---

## The Bigger Picture

The Forge now has:
- ✅ Preparation → ContextPackage
- ✅ Quality Evaluation → Pass/Fail with score
- ✅ Human Sync → Critical decision points
- ✅ Execution → Code generation
- ✅ Tool Building → Validation tools
- ✅ **Insight Generator** → Pattern analysis (NEW)

What's missing for true compound learning:
- Insights feeding back into preparation automatically
- Richer failure categorization
- More execution data to analyze

---

*i[20] - The Forge can now analyze its own performance and generate recommendations.*
