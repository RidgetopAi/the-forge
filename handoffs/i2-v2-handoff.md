# i[2]-v2 → i[3]-v2 Handoff

**Instance**: i[2]-v2 (second planning pass)
**Date**: 2026-01-10
**Mission**: Design additional workers, create implementation phases, answer i[1]'s open questions

---

## What I Did

### 1. Designed PatternExtractionWorker (Complete Specification)

i[1] showed the pattern with FileDiscoveryWorker. I applied it to PatternExtractionWorker.

**Key Design Decision**: Two-phase extraction (lightweight scan → deep analysis)

```typescript
// Input Schema
interface PatternExtractionInput {
  projectRoot: string;
  fileSample: Array<{
    path: string;
    content: string;  // File content (passed from FileDiscovery Wave 1)
    size: number;
  }>;
  focusAreas?: 'naming' | 'structure' | 'error-handling' | 'testing' | 'all';
  maxPatterns?: number;  // Default: 10
}

// Output Schema
interface PatternExtractionResult {
  patterns: Array<{
    type: 'naming' | 'structure' | 'error-handling' | 'testing' | 'import' | 'other';
    name: string;           // e.g., "camelCase functions"
    description: string;    // What the pattern is
    evidence: string[];     // Lines/files where seen
    confidence: number;     // 0-1
    frequency: 'always' | 'usually' | 'sometimes';
  }>;
  conventions: {
    naming: string;         // Summary: "camelCase for functions, PascalCase for types"
    imports: string;        // Summary: "Relative imports for internal, package imports for external"
    exports: string;        // Summary: "Named exports, barrel files for public API"
    comments: string;       // Summary: "JSDoc for public APIs"
  };
  testingApproach: string;  // "Jest with describe/it blocks"
  errorHandling: string;    // "try/catch with typed errors"
  styleFiles: string[];     // [".eslintrc", "tsconfig.json"]
  extractionConfidence: number;  // Overall confidence 0-1
}
```

**Prompt Template:**
```
You are a code pattern extraction worker analyzing a TypeScript/JavaScript codebase.

PROJECT: {{projectRoot}}

Analyze these files to extract coding patterns:
{{#each fileSample}}
--- {{path}} ({{size}} bytes) ---
{{content}}
{{/each}}

Focus on: {{focusAreas}}

Extract UP TO {{maxPatterns}} patterns. For each pattern:
1. Identify what it IS (naming, structure, etc.)
2. Provide EVIDENCE (exact lines or snippets)
3. Rate your CONFIDENCE (0-1)
4. Note FREQUENCY (always/usually/sometimes)

Also summarize the overall conventions.

Return JSON matching this exact structure:
{patterns: [...], conventions: {...}, testingApproach: "...", ...}
```

**Error Handling:**
- Parse failure: Retry 1x with simplified prompt ("Return only JSON")
- Empty patterns: Return low confidence, flag for Foreman review
- Timeout (30s): Return partial results with `extractionConfidence: 0.3`

**Why Two-Phase?**
The current PatternExtractionWorker reads configs (tsconfig, eslint) but not CODE. We need to look at actual code to extract patterns. But sending all code would exceed context. Solution: Wave 1 (FileDiscovery) identifies files → Wave 2 (Pattern) receives a SAMPLE of those files with content.

---

### 2. Designed WebResearchWorker (Complete Specification)

**Critical Insight**: WebResearch is NOT general browsing. It's targeted lookup.

```typescript
// Input Schema
interface WebResearchInput {
  query: string;               // Specific question to answer
  context: {
    task: string;              // What task triggered this research
    technology: string[];      // e.g., ["TypeScript", "Express", "PostgreSQL"]
    keywords: string[];        // Additional search keywords
  };
  constraints: {
    maxSources?: number;       // Default: 3
    preferredDomains?: string[]; // e.g., ["docs.anthropic.com", "typescriptlang.org"]
    excludeDomains?: string[]; // e.g., ["w3schools.com"]
    recency?: 'any' | 'year' | 'month';  // How recent must sources be
  };
}

// Output Schema
interface WebResearchResult {
  answer: string;              // Direct answer to the query (synthesized)
  sources: Array<{
    url: string;
    title: string;
    snippet: string;           // Relevant excerpt
    relevanceScore: number;    // 0-1
    lastUpdated?: string;      // If available
  }>;
  codeExamples: Array<{
    code: string;
    language: string;
    source: string;            // URL it came from
    context: string;           // What this example demonstrates
  }>;
  caveats: string[];           // Warnings, version-specific info, etc.
  researchConfidence: number;  // 0-1 (low if sources disagree)
  searchesPerformed: string[]; // What searches we actually ran
}
```

**Prompt Template:**
```
You are a technical research worker. Answer this specific question:

QUESTION: {{query}}

CONTEXT:
- Task: {{context.task}}
- Technologies: {{context.technology}}

CONSTRAINTS:
- Use at most {{constraints.maxSources}} sources
- Prefer: {{constraints.preferredDomains}}
- Recency: {{constraints.recency}}

Search the web and synthesize an answer. Include:
1. A direct ANSWER to the question
2. SOURCES with URLs and relevant snippets
3. CODE EXAMPLES if applicable
4. CAVEATS or warnings

Return JSON matching the schema.
```

**Tier Decision (IMPORTANT):**
i[1] flagged this as uncertain: Haiku or Sonnet?

**My Analysis:**
- Web search + synthesis is MORE complex than file discovery
- Haiku might hallucinate URLs or miss nuances
- BUT: We can validate URLs exist, check source quality

**My Recommendation:**
- Start with Haiku (cheaper)
- Add URL validation (HTTP HEAD check)
- If hallucination rate > 10%, escalate to Sonnet tier

**Error Handling:**
- No results: Return empty with `researchConfidence: 0.1`, flag for Foreman
- Conflicting sources: Note in caveats, lower confidence
- Timeout (60s): Return partial results
- Network failure: Retry 1x, then fail with specific error

---

### 3. Answered i[1]'s Open Questions

#### Q1: What's the right retry count for workers?

**Answer: 1 retry for parse failures, 0 retries for wrong content**

Reasoning:
- Parse failures (JSON syntax): Often fixable with a retry + clearer prompt
- Wrong content (patterns not found): Retrying won't help - escalate to Foreman
- Wrong content with different approach: Foreman decision, not worker retry

Implementation:
```typescript
async function runWorker(worker, input): Promise<Result> {
  const result = await worker.execute(input);

  if (result.parseError && !result.retriedParse) {
    // Parse failure - retry once with simplified prompt
    return worker.execute(input, { simplifiedPrompt: true });
  }

  if (result.empty || result.lowConfidence) {
    // Don't retry - flag for Foreman
    return { ...result, needsForemanReview: true };
  }

  return result;
}
```

#### Q2: Should Foreman be one instance or multiple?

**Answer: One Foreman per task (keep it simple), with option to pool later**

Reasoning:
- One Foreman = clear ownership, simpler debugging
- Multiple Foremen = more parallelism but coordination overhead
- The bottleneck is LLM latency, not Foreman compute

**BUT**: Design for future pooling:
```typescript
interface ForemanConfig {
  mode: 'single' | 'pooled';
  poolSize?: number;  // Only if mode === 'pooled'
}
```

Start with single. Add pooling if benchmark shows Foreman as bottleneck.

#### Q3: How do we handle worker timeouts?

**Answer: Per-worker timeouts with graceful degradation**

```typescript
const WORKER_TIMEOUTS: Record<WorkerType, number> = {
  FileDiscovery: 30_000,      // 30s - mostly shell commands
  PatternExtraction: 45_000,  // 45s - analyzing code
  DependencyMapper: 30_000,   // 30s - traversing imports
  ConstraintIdentifier: 30_000,
  WebResearch: 60_000,        // 60s - network latency
  DocumentationReader: 45_000,
};

async function executeWithTimeout(worker, input, timeout) {
  const result = await Promise.race([
    worker.execute(input),
    new Promise((_, reject) =>
      setTimeout(() => reject(new WorkerTimeout(worker.name, timeout)), timeout)
    )
  ]);

  return result;
}

// On timeout: Return partial results with low confidence
// Foreman decides whether to proceed or escalate
```

#### Q4: What's the minimum viable implementation (MVI)?

**Answer: Phase 1 only = Tier System + FileDiscoveryWorker as LLM + Cost Tracking**

Reasoning:
- We need to validate Haiku works BEFORE building 6 workers
- Phase 1 proves the concept with minimal investment
- If Phase 1 fails, we pivot (maybe Haiku is too weak)

MVI includes:
1. tiers.ts - Tier definitions (Opus, Sonnet, Haiku)
2. llm.ts modified - Tier selection, cost tracking
3. FileDiscoveryWorker converted - Shell commands → Haiku LLM
4. Benchmark comparison - Before/after cost and quality

---

### 4. Implementation Phases (Detailed)

#### Phase 0: Capability Validation (Pre-requisite)
**Goal**: Prove Haiku can do worker tasks before committing architecture
**Duration**: 1 focused pass

**Tasks:**
1. Create Haiku test harness (simple LLM call wrapper)
2. Run FileDiscovery prompts through Haiku (10 test cases)
3. Run PatternExtraction prompts through Haiku (10 test cases)
4. Measure: accuracy, parse success rate, latency
5. Decision gate: If accuracy < 70%, redesign workers or use Sonnet

**Deliverables:**
- haiku-capability-report.md with metrics
- Go/no-go decision on Haiku workers

**Success Criteria:**
- 70%+ accuracy on test cases
- 90%+ parse success rate
- < 5s average latency

---

#### Phase 1: Tier Foundation
**Goal**: Build the tier system and convert one worker
**Duration**: 2 focused passes

**Tasks:**
1. Create `tiers.ts`:
   ```typescript
   enum ModelTier {
     OPUS = 'opus',     // Judgment calls
     SONNET = 'sonnet', // Coordination
     HAIKU = 'haiku',   // Labor
   }

   const TIER_MODELS: Record<ModelTier, string> = {
     [ModelTier.OPUS]: 'claude-opus-4-20250514',
     [ModelTier.SONNET]: 'claude-sonnet-4-20250514',
     [ModelTier.HAIKU]: 'claude-haiku-3-5-20241022',
   };

   interface TierDecision {
     tier: ModelTier;
     reason: string;
     fallback?: ModelTier;
   }
   ```

2. Modify `llm.ts`:
   - Add tier parameter to API calls
   - Add cost tracking per call
   - Add cost aggregation per task

3. Convert FileDiscoveryWorker:
   - Replace shell commands with Haiku LLM call
   - Keep shell commands as TOOLS the worker can use
   - Implement input/output schemas from i[1]

4. Add cost logging:
   ```typescript
   interface CostLog {
     taskId: string;
     tier: ModelTier;
     operation: string;
     inputTokens: number;
     outputTokens: number;
     costUsd: number;
     timestamp: Date;
   }
   ```

**Deliverables:**
- tiers.ts with tier definitions
- Modified llm.ts with tier selection
- Haiku-powered FileDiscoveryWorker
- Cost tracking per API call

**Success Criteria:**
- FileDiscovery works at Haiku tier
- Cost per file discovery < $0.001
- Benchmark maintains 100% pass rate

---

#### Phase 2: Worker Fleet
**Goal**: Convert remaining workers to LLM agents
**Duration**: 3 focused passes

**Tasks:**
1. Convert PatternExtractionWorker (using spec from this handoff)
2. Convert ArchitectureAnalysisWorker → DependencyMapperWorker
3. Create ConstraintIdentifierWorker (new)
4. Create WebResearchWorker (using spec from this handoff)
5. Create DocumentationReaderWorker (new)

**Deliverables:**
- 6 Haiku-powered workers in `workers/` directory
- Unified worker interface
- Worker test suite

**Success Criteria:**
- All workers parse successfully 90%+
- Wave 1 + Wave 2 complete in < 10s total
- Cost per preparation < $0.02

---

#### Phase 3: Foreman Orchestration
**Goal**: Implement wave-based dispatch and synthesis
**Duration**: 2 focused passes

**Tasks:**
1. Implement wave executor:
   ```typescript
   async function executeWave(workers: Worker[], inputs: Input[]): Promise<Result[]> {
     return Promise.all(
       workers.map((w, i) => w.execute(inputs[i]))
     );
   }
   ```

2. Implement Foreman synthesis (Sonnet tier):
   - Receive Wave 1 + Wave 2 results
   - Synthesize into ContextPackage
   - Gate quality before handoff

3. Implement error aggregation:
   - Collect worker errors
   - Decide: retry, escalate, or proceed with partial

4. Connect to existing PreparationForeman

**Deliverables:**
- Wave executor with parallel dispatch
- Foreman synthesis at Sonnet tier
- Error handling protocol

**Success Criteria:**
- Preparation completes end-to-end
- Foreman uses Sonnet, workers use Haiku
- Cost breakdown matches targets (65% Haiku, 25% Sonnet)

---

#### Phase 4: Plant Manager Elevation
**Goal**: Move judgment calls to Opus tier
**Duration**: 1 focused pass

**Tasks:**
1. Classification → Opus (for edge cases)
2. Stuck-point resolution → Opus
3. Human Sync trigger decisions → Opus
4. Add Opus fallback to Sonnet if too slow

**Deliverables:**
- plant-manager.ts using Opus for judgment
- Escalation protocol from Sonnet → Opus
- Fallback mechanism

**Success Criteria:**
- Classification accuracy improves on edge cases
- Opus used for < 15% of total cost
- No regression on simple tasks

---

#### Phase 5: Validation & Tuning
**Goal**: Prove the tiered model works and optimize
**Duration**: 2 focused passes

**Tasks:**
1. Run full benchmark suite with tiered model
2. Compare cost: flat Sonnet vs tiered
3. Compare quality: ensure no regression
4. Tune tier assignments based on data
5. Run cross-project validation (not just self-hosted)

**Deliverables:**
- Benchmark results with tiered model
- Cost comparison report
- Tuning recommendations
- Cross-project validation results

**Success Criteria:**
- Benchmark maintains 100%
- Cost reduction > 40% vs flat Sonnet
- Works on 2+ external projects

---

### 5. Validation Plan

| Phase | What We Validate | How We Validate | Success Threshold |
|-------|------------------|-----------------|-------------------|
| 0 | Haiku capability | 10 test cases per worker type | 70% accuracy |
| 1 | Tier system works | FileDiscovery runs at Haiku tier | Benchmark 100% |
| 2 | Workers work | Worker test suite | 90% parse success |
| 3 | Orchestration works | End-to-end preparation | Preparation completes |
| 4 | Opus adds value | A/B test classification accuracy | +5% on edge cases |
| 5 | Economics work | Cost tracking comparison | 40% cost reduction |

---

### 6. Cost Projection Model (Refined)

**Current State (Flat Sonnet):**
```
Per task average:
- Classification: ~500 tokens = $0.0015
- Preparation: ~2000 tokens = $0.006
- Quality eval: ~1000 tokens = $0.003
- Total: ~$0.01/task
```

**Projected (Tiered Model):**
```
Per task average:
- Classification (Opus, 10% of tasks): ~500 tokens = $0.0075 × 0.1 = $0.00075
- Classification (Sonnet, 90% of tasks): ~500 tokens = $0.0015 × 0.9 = $0.00135
- Workers (Haiku, 5 workers): ~500 tokens × 5 = $0.000625
- Foreman synthesis (Sonnet): ~1500 tokens = $0.0045
- Quality eval (Sonnet): ~1000 tokens = $0.003
- Total: ~$0.01/task (similar! but with parallelism)
```

**The real win isn't cost reduction per task - it's:**
1. Parallel worker execution (5 workers in 2s vs 5 sequential calls in 10s)
2. Better preparation quality (specialized workers vs one-shot)
3. Future scalability (can add workers cheaply)

---

### 7. Tier Assignment Matrix (Updated)

| Operation | Tier | Justification | Fallback |
|-----------|------|---------------|----------|
| Task classification (simple) | Sonnet | Most tasks are obvious | None |
| Task classification (edge) | Opus | Judgment call on ambiguous | Sonnet |
| Stuck-point resolution | Opus | Critical decision | Human Sync |
| Human Sync trigger | Opus | Judgment on escalation | Conservative (always escalate) |
| FileDiscovery | Haiku | Pattern matching, cheap | Sonnet if accuracy < 70% |
| PatternExtraction | Haiku | Code analysis, parallelizable | Sonnet |
| DependencyMapper | Haiku | Graph traversal, structured | Sonnet |
| ConstraintIdentifier | Haiku | Rule extraction | Sonnet |
| WebResearch | Haiku (with validation) | Needs URL checks | Sonnet if hallucination > 10% |
| DocumentationReader | Haiku | Text extraction | Sonnet |
| Foreman synthesis | Sonnet | Requires judgment | None |
| Quality gate | Sonnet | Assessment quality matters | None |
| Code generation | Sonnet | Quality critical | None |

---

## What I Explicitly Did NOT Do

1. Design ConstraintIdentifierWorker or DocumentationReaderWorker (lower priority)
2. Create the Haiku test harness (that's Phase 0 implementation work)
3. Define the complete Foreman synthesis prompt
4. Address context window management for large codebases (still open)

---

## For i[3]-v2

**Your mission options** (pick based on your judgment):

### Option A: Design Remaining Workers
Design ConstraintIdentifierWorker and DocumentationReaderWorker with same rigor.

### Option B: Tackle Context Window Management
This is an unsolved problem. Large codebases will overflow context. Options:
- Chunking strategy (split into chunks, run workers on chunks, merge)
- Prioritization (only top-N files)
- Two-phase (summarize first, detail second)

### Option C: Design Haiku Test Harness (Phase 0)
Create the specific test cases and harness for Haiku capability validation.

### Option D: Challenge My Phases
Are my phases ordered correctly? Are dependencies right? What's missing?

---

## Open Questions I Couldn't Answer

1. **How do we handle context overflow?** Large codebases will exceed Haiku's context. Need chunking or prioritization strategy.

2. **Should WebResearch use web search tools?** I assumed Haiku would use built-in search. But maybe we need explicit tool calls (like web_search()). This affects the prompt design.

3. **What's the Foreman synthesis prompt?** I sketched the protocol but not the actual Sonnet prompt that synthesizes worker results into ContextPackage.

4. **How do we track worker performance over time?** Need telemetry to detect degradation.

---

## Artifacts

- **This handoff**: `/workspace/projects/the-forge/handoffs/i2-v2-handoff.md`
- **Mandrel context**: Will store after writing

---

*The enemy is premature convergence. I've made concrete decisions but left room to challenge them. Push.*
