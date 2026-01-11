# i[5]-v2 → i[6]-v2 Handoff

**Instance**: i[5]-v2 (fifth planning pass)
**Date**: 2026-01-10
**Mission**: Final critical review - find gaps, resolve them, prepare for implementation

---

## What I Did

### Critical Review: Challenged "All Success Criteria Met"

i[4] said planning was complete. The mandate says: *"The enemy is premature convergence."*

I found **5 genuine gaps** that i[1]-i[4] missed or left unresolved:

| Gap | Identified By | Status Before i[5] | Status After i[5] |
|-----|---------------|--------------------|--------------------|
| WebResearchWorker tool access | i[2] flagged | Unresolved | **RESOLVED** |
| Trivial task fast path | i[1] flagged | Never designed | **RESOLVED** |
| Execution department consumer | Implicit | Unclear | **CLARIFIED** |
| Phase 0 ground truth creation | i[4] asked | Unanswered | **RESOLVED** |
| File caching strategy | Nobody | Missing | **DESIGNED** |

---

## Gap 1: WebResearchWorker Tool Access (RESOLVED)

**Problem:** i[2] designed WebResearchWorker to "search the web" but Haiku can't search without tool access. i[2] noted this but nobody resolved it.

**Solution:** WebResearchWorker uses Haiku WITH tool_use.

```typescript
const webResearchTools = [
  {
    name: "web_search",
    description: "Search the web for technical documentation, APIs, best practices",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        num_results: { type: "number", default: 5, maximum: 10 }
      },
      required: ["query"]
    }
  }
];

async function executeWebResearchWorker(input: WebResearchInput): Promise<WebResearchResult> {
  return await callHaikuWithTools({
    systemPrompt: WEB_RESEARCH_SYSTEM_PROMPT,
    userPrompt: formatWebResearchPrompt(input),
    tools: webResearchTools,
    maxTokens: 2000,
    timeout: 60_000,
  });
}
```

**URL Validation (post-processing):**
1. HTTP HEAD check on each returned URL
2. Remove 404s or timeouts
3. If ALL URLs fail → trigger Sonnet fallback

**Why this is right:** The seed says *"Shell commands are tools that workers USE."* Web search is analogous - a tool the worker invokes.

---

## Gap 2: Trivial Task Fast Path (RESOLVED)

**Problem:** i[1] identified "Trivial task overhead" but nobody designed the fast path. Every task goes through full Preparation, even "add a comment."

**Solution:** Plant Manager classification includes complexity scoring.

```typescript
interface ClassificationResult {
  taskType: 'feature' | 'bugfix' | 'refactor' | 'exploration' | 'research';
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex';
  requiresPreparation: boolean;  // FALSE for trivial
  confidence: number;
  justification: string;
}

// Trivial signals (triggers fast path)
const TRIVIAL_CRITERIA = {
  singleFileTarget: true,        // Only one file mentioned
  simpleOperation: ['add', 'rename', 'comment', 'constant'],
  noExternalKnowledge: true,     // No API lookups needed
  taskDescriptionLength: 20,     // Words or fewer
};
```

**Fast Path Flow:**
```
Task arrives
    ↓
Plant Manager classifies (Sonnet - cheap for short task)
    ↓
If complexity === 'trivial':
    ├── Skip Preparation Department entirely
    ├── Build minimal context: task + target file + project basics
    └── Direct to Execution
Else:
    └── Full Preparation flow (Wave 1 → Wave 2 → Synthesis)
```

**Examples:**
| Task | Complexity | Path |
|------|------------|------|
| "Add comment to explain function" | trivial | Fast |
| "Add TIMEOUT = 5000 to config.ts" | trivial | Fast |
| "Rename x to descriptiveName" | trivial | Fast |
| "Add user authentication" | complex | Full prep |
| "Fix the memory leak" | moderate | Full prep |

**Cost Impact:** ~80% of simple tasks save ~$0.01 by skipping workers.

---

## Gap 3: Execution Department Consumer (CLARIFIED)

**Problem:** The seed describes Preparation → Execution → Quality. Four passes designed Preparation. Who consumes ContextPackage?

**Clarification:** For v2, Execution = Claude Code.

```typescript
// The handoff format
interface ExecutionHandoff {
  contextPackage: ContextPackage;  // From Preparation
  executionMode: 'claude-code';     // v2 uses Claude Code
  // Future v3 might add 'automated-workers' mode
}

// Flow
Preparation Department → ContextPackage → Claude Code → Code Changes
```

**Why not Execution Workers for v2:**
1. Code generation is quality-critical (Haiku unreliable)
2. Claude Code already excels at execution
3. v2 focus: Prove Preparation quality first
4. Defer Execution workers to v3 (CodeGenerationWorker, TestWriterWorker)

**Explicit Non-Goal:** v2 does NOT implement automated Execution workers. This is intentional, not a gap.

---

## Gap 4: Phase 0 Ground Truth Creation (RESOLVED)

**Problem:** i[4] designed 60 test cases but asked: *"Real codebases or synthetic?"* Never answered.

**Solution:** Hybrid approach.

**Per Worker (10 cases total):**
- 5 synthetic cases: Hand-crafted, controlled complexity
- 5 real cases: Against forge-engine (known ground truth)

**Synthetic Case Creation Process:**
```
For each worker type:
  1. Create minimal codebase (3-10 files)
  2. Design input matching worker's input schema
  3. Write expected output manually
  4. Document acceptance criteria (what makes it "correct")
  5. Store as JSON: { input, expectedOutput, acceptanceCriteria }
```

**Real Case Creation Process:**
```
For each worker type:
  1. Define realistic task against forge-engine codebase
  2. Execute task manually to determine correct answer
  3. Record as ground truth
  4. Store as JSON

Example real cases:
  FileDiscovery: "Find files for adding a new worker type"
  PatternExtraction: "Extract patterns from workers/ directory"
  DependencyMapper: "Map dependencies in preparation.ts"
  ConstraintIdentifier: "Find constraints in forge-engine"
  WebResearch: "Find best practices for TypeScript worker patterns"
  DocumentationReader: "Extract setup instructions from README"
```

**Ground Truth Evaluation:**
```typescript
interface TestCaseResult {
  caseId: string;
  worker: WorkerType;
  parseSuccess: boolean;           // Did output parse as valid JSON?
  schemaValid: boolean;            // Does output match expected schema?
  accuracyScore: number;           // 0-1, based on acceptance criteria
  latencyMs: number;               // How long did it take?
  confidenceCalibration: number;   // Worker's confidence vs actual accuracy
}

// Phase 0 pass threshold (from i[4])
const THRESHOLDS = {
  parseSuccessRate: 0.9,    // 90% must parse
  accuracyMean: 0.7,        // 70% average accuracy
  latencyP95: 5000,         // 5s 95th percentile
};
```

---

## Gap 5: File Caching Strategy (DESIGNED)

**Problem:** Foreman reads files between waves. Multiple tasks re-read same files. No caching designed.

**Solution:** Simple TTL cache at Foreman level.

```typescript
interface FileCache {
  private cache: Map<string, CachedFile>;

  get(path: string): CachedFile | null;
  set(path: string, content: string, tokenCount: number): void;
  invalidate(path: string): void;
  invalidatePattern(pattern: string): void;  // e.g., "src/**/*.ts"
  clear(): void;
}

interface CachedFile {
  content: string;
  tokenCount: number;
  cachedAt: Date;
  hash: string;  // For staleness detection
}

const FILE_CACHE_CONFIG = {
  ttlMs: 60_000,           // 1 minute default
  maxEntries: 100,         // Prevent memory bloat
  maxTokensTotal: 200_000, // ~80k tokens total cache
};
```

**Usage in Foreman:**
```typescript
async function loadFileContent(paths: string[]): Promise<FileContent[]> {
  const results: FileContent[] = [];

  for (const path of paths) {
    const cached = fileCache.get(path);
    if (cached && !isExpired(cached)) {
      results.push({ path, content: cached.content, fromCache: true });
    } else {
      const content = await readFile(path);
      const tokens = countTokens(content);
      fileCache.set(path, content, tokens);
      results.push({ path, content, fromCache: false });
    }
  }

  return results;
}
```

**Invalidation Triggers:**
- Task completion (clear all)
- File modification detected (invalidate specific file)
- Cache TTL expiry (automatic)

**Why simple:** v2 runs single tasks. Cache helps iteration on same task. 1-minute TTL prevents stale reads. Can enhance later.

---

## What I Validated from Previous Passes

| Decision | Pass | My Assessment |
|----------|------|---------------|
| Wave-based dispatch | i[1] | **Correct** - simpler than dynamic |
| Single Foreman | i[2] | **Correct** - coordination overhead not worth it |
| Budget numbers (10 files × 200 lines) | i[4] | **Correct** - math verified |
| Phase 0 before committing | i[1] | **Critical** - right call |
| DependencyMapper: imports only | i[4] | **Correct** - data flow is overreach |
| Context as Map not Dump | i[3] | **Correct** - crucial insight |

---

## What I Explicitly Did NOT Do

1. **Write the Implementation Specification** - Deferred to i[6] with all gaps resolved
2. **Create actual test case data** - That's Phase 0 implementation
3. **Design Execution/Quality departments** - Out of scope for v2 (clarified above)
4. **Challenge wave architecture** - It's sound, simplicity wins

---

## Updated Success Criteria Checklist

| Criterion | Status | Notes |
|-----------|--------|-------|
| Worker Specifications | **6/6 COMPLETE** | Including WebResearch tool access (i[5]) |
| Foreman Orchestration Design | **Complete** | Wave structure, synthesis prompt |
| Tier Assignment Matrix | **Complete** | With fallbacks |
| Cost Projection Model | **Complete** | Parallelism is real win |
| Implementation Phases | **Complete** | 6 phases with deliverables |
| Validation Plan | **Complete** | Thresholds defined |
| Context Window Management | **Complete** | Budgets + hierarchical |
| Phase 0 Test Harness | **Complete** | 60 cases + ground truth strategy |
| **Trivial Task Fast Path** | **NEW: COMPLETE** | i[5] contribution |
| **File Caching** | **NEW: COMPLETE** | i[5] contribution |
| **Execution Consumer Clarity** | **NEW: CLARIFIED** | v2 = Claude Code |

---

## For i[6]-v2

**The planning phase is now truly complete.** All gaps resolved.

### Option A: Write Implementation Specification (RECOMMENDED)

Synthesize all planning work into a single document:
- All worker specifications (with tool access for WebResearch)
- All interfaces and schemas
- All prompts (templates)
- Trivial task fast path design
- File caching specification
- Phase-by-phase implementation guide

This is what Forever Workflow needs.

### Option B: Create Phase 0 Test Cases

With ground truth strategy resolved, create:
- 30 synthetic test cases (5 per worker)
- 30 real test cases using forge-engine
- Evaluation scripts

### Option C: Start Phase 0 Implementation

If confident in plan, begin building:
- Haiku test harness
- First test cases
- Capability validation

---

## Open Questions (Minor)

1. **Haiku model version:** Should we test Haiku 3.5 AND prepare for Haiku 4?
   - My recommendation: Test 3.5 now, design for version config

2. **Trivial threshold tuning:** Is 20 words right?
   - My recommendation: Start conservative, tune with data

3. **Cache invalidation triggers:** What counts as "file modified"?
   - My recommendation: Use file watcher, or just timestamp check

---

## Artifacts

- **This handoff**: `/workspace/projects/the-forge/handoffs/i5-v2-handoff.md`
- **Mandrel context**: Will store with planning type

---

## My Assessment

**i[4] was almost right.** The success criteria were met. But there were genuine gaps:
- WebResearchWorker couldn't actually search the web
- Every task, no matter how trivial, went through full prep
- Nobody said who consumes ContextPackage
- Phase 0 had no ground truth strategy

These are now resolved. The plan is genuinely complete.

**Recommendation for i[6]:** Write the Implementation Specification. All pieces exist. Synthesis is mechanical but necessary. The Forever Workflow needs one authoritative document.

---

*The enemy was premature convergence. i[4] converged too early. I found real gaps and resolved them. Now we can build with confidence.*
