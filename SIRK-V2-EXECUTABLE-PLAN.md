# THE FORGE v2: SIRK EXECUTABLE IMPLEMENTATION PLAN

**Document ID**: SIRK-V2-FINAL
**Created By**: i[8]-v2
**Date**: 2026-01-10
**Status**: AUTHORITATIVE GUIDESTONE
**Predecessors**: i[1]-i[7]-v2 planning, i[1]-i[34] v1 building

---

## EXECUTIVE SUMMARY

This document is the **definitive execution blueprint** for The Forge v2 implementation. It consolidates 7 planning passes and 34 building iterations into an unambiguous, phase-gated implementation roadmap.

**The Mission**: Transform The Forge from flat-model execution (all Sonnet) to a true three-tier cognition factory with:
- **Opus** for judgment (classification, escalation, stuck-point resolution)
- **Sonnet** for supervision (foreman coordination, synthesis)
- **Haiku** for labor (6 parallel preparation workers)

**What We Have** (validated foundation):
- 13,600 LOC TypeScript core engine
- 100% benchmark pass rate (5/5 tasks)
- Mandrel integration with 27 tools operational
- Learning loop architecture (retrieve → use → store)
- Human-sync protocol with 8 triggers

**What We Build** (this plan):
- Tier system with explicit model routing
- 6 LLM workers replacing shell-command preparation
- PatternTracker for active learning
- FeedbackRouter for intelligent error handling

---

## SECTION 1: VALIDATED FOUNDATION (NO ASSUMPTIONS)

### 1.1 What EXISTS and WORKS

| Component | File | LOC | Status | Evidence |
|-----------|------|-----|--------|----------|
| Types & Schemas | src/types.ts | 400+ | COMPLETE | Zod validation passes |
| State Machine | src/state.ts | 200+ | COMPLETE | Invalid transitions blocked |
| Mandrel Client | src/mandrel.ts | 467 | COMPLETE | Base64 quoting fix (i[17]) |
| LLM Integration | src/llm.ts | 500+ | WORKING | Anthropic SDK, cost tracking |
| Learning Retriever | src/learning.ts | 600+ | COMPLETE | Queries Mandrel history |
| Preparation Dept | src/departments/preparation.ts | 1300+ | SHELL-ONLY | 7 phases, no LLM workers |
| Execution Dept | src/departments/execution.ts | 1400+ | COMPLETE | Protocol enforcement |
| Quality Gate | src/departments/quality-gate.ts | 400+ | COMPLETE | 5 validation checks |
| Human Sync | src/human-sync.ts | 850+ | COMPLETE | 8 triggers, false positives fixed |
| Tracing | src/tracing.ts | 400+ | COMPLETE | Execution observability |
| Benchmark | src/benchmark.ts | 500+ | 100% PASS | i[34] achievement |

### 1.2 What DOES NOT EXIST (Must Build)

| Component | Planned File | Purpose | Dependency |
|-----------|--------------|---------|------------|
| Tier System | src/tiers.ts | Model routing by operation type | None |
| Worker Base | src/workers/base.ts | Abstract LLM worker pattern | tiers.ts |
| FileDiscoveryWorker | src/workers/file-discovery.ts | Find relevant files | base.ts |
| PatternExtractionWorker | src/workers/pattern-extraction.ts | Identify code patterns | base.ts |
| DependencyMapperWorker | src/workers/dependency-mapper.ts | Trace relationships | base.ts |
| ConstraintIdentifierWorker | src/workers/constraint-identifier.ts | Find constraints | base.ts |
| WebResearchWorker | src/workers/web-research.ts | Targeted web search | base.ts |
| DocumentationReaderWorker | src/workers/documentation-reader.ts | Extract doc info | base.ts |
| PatternTracker | src/pattern-tracker.ts | Active learning | learning.ts |
| FeedbackRouter | src/feedback-router.ts | Error routing | tiers.ts |

### 1.3 Configuration Constants (LOCKED)

```typescript
// Tier Model IDs (Anthropic API)
const TIER_MODELS = {
  opus: 'claude-opus-4-5-20251101',      // Plant Manager: judgment
  sonnet: 'claude-sonnet-4-20250514',    // Foremen: supervision
  haiku: 'claude-haiku-20241015'         // Workers: labor
} as const;

// Cost Targets (per 1M tokens)
const TIER_COSTS = {
  opus: { input: 15.0, output: 75.0 },
  sonnet: { input: 3.0, output: 15.0 },
  haiku: { input: 0.25, output: 1.25 }
} as const;

// Distribution Targets
const COST_DISTRIBUTION = {
  opus: { min: 0.10, max: 0.15 },    // 10-15%
  sonnet: { min: 0.25, max: 0.35 },  // 25-35%
  haiku: { min: 0.50, max: 0.65 }    // 50-65%
} as const;
```

---

## SECTION 2: IMPLEMENTATION PHASES

### PHASE 0: HAIKU VALIDATION (GATE: Must Complete Before Phase 1)

**Objective**: Prove Haiku can perform worker tasks with acceptable quality before building the tier system.

**Duration Estimate**: DO NOT ESTIMATE - complete when gate passes

**Acceptance Criteria**:
- [ ] 60 test cases written (10 per worker type × 6 workers)
- [ ] Parse success rate ≥ 90%
- [ ] Accuracy ≥ 70% against ground truth
- [ ] P95 latency ≤ 5 seconds per worker call
- [ ] All tests run in isolated benchmark mode

#### 0.1 Test Case Specifications

**FileDiscoveryWorker (10 test cases)**:
```yaml
test_cases:
  synthetic_1:
    task: "Add authentication to Express app"
    codebase: synthetic/express-basic
    expected_files:
      - routes/auth.ts (or create)
      - middleware/auth-middleware.ts
      - models/user.ts
    accuracy_metric: jaccard_similarity >= 0.7

  synthetic_2:
    task: "Fix React component re-rendering"
    codebase: synthetic/react-app
    expected_files:
      - src/components/ProblemComponent.tsx
      - src/hooks/useEffect calls
    accuracy_metric: must_include_problem_file

  # ... 3 more synthetic cases

  real_1:
    task: "Add cost tracking to LLM calls"
    codebase: the-forge/forge-engine
    expected_files:
      - src/llm.ts
      - src/types.ts (CostRecord schema)
    accuracy_metric: jaccard_similarity >= 0.7

  # ... 4 more real codebase cases
```

**PatternExtractionWorker (10 test cases)**:
```yaml
test_cases:
  synthetic_1:
    file: synthetic/patterns/react-hooks.tsx
    expected_patterns:
      - "useState for local state"
      - "useEffect with dependency array"
      - "Custom hook naming: use* prefix"
    accuracy_metric: pattern_overlap >= 0.6

  real_1:
    file: the-forge/forge-engine/src/mandrel.ts
    expected_patterns:
      - "SSH+curl pattern for MCP calls"
      - "Base64 encoding for JSON payloads"
      - "Retry with exponential backoff"
    accuracy_metric: pattern_overlap >= 0.6
```

**DependencyMapperWorker (10 test cases)**:
```yaml
test_cases:
  synthetic_1:
    entry_file: synthetic/deps/index.ts
    expected_graph:
      index.ts:
        - utils/helpers.ts
        - services/api.ts
      services/api.ts:
        - utils/http.ts
    accuracy_metric: edge_precision >= 0.8

  real_1:
    entry_file: the-forge/forge-engine/src/index.ts
    expected_dependencies:
      - src/types.ts
      - src/mandrel.ts
      - src/departments/preparation.ts
    accuracy_metric: edge_precision >= 0.8
```

**ConstraintIdentifierWorker (10 test cases)**:
```yaml
test_cases:
  synthetic_1:
    codebase: synthetic/typed-project
    expected_constraints:
      - "TypeScript strict mode enabled"
      - "ESLint airbnb config"
      - "Jest for testing"
    accuracy_metric: constraint_recall >= 0.7

  real_1:
    codebase: the-forge/forge-engine
    expected_constraints:
      - "TypeScript with Zod schemas"
      - "Must compile with tsc"
      - "Mandrel integration required"
    accuracy_metric: constraint_recall >= 0.7
```

**WebResearchWorker (10 test cases)**:
```yaml
test_cases:
  synthetic_1:
    query: "Anthropic Claude API tool_use format"
    expected_findings:
      - tool_use block structure
      - input schema requirements
    accuracy_metric: relevant_info_present

  synthetic_2:
    query: "Express.js middleware error handling best practice"
    expected_findings:
      - Error-first middleware pattern
      - next(err) propagation
    accuracy_metric: relevant_info_present
```

**DocumentationReaderWorker (10 test cases)**:
```yaml
test_cases:
  synthetic_1:
    doc_path: synthetic/docs/API.md
    task: "Understand authentication endpoints"
    expected_extraction:
      - POST /auth/login
      - POST /auth/register
      - Token format
    accuracy_metric: info_extraction >= 0.7

  real_1:
    doc_path: the-forge/THE-FORGE-SEED-V2.md
    task: "Extract tier system requirements"
    expected_extraction:
      - Opus for judgment
      - Sonnet for supervision
      - Haiku for labor
    accuracy_metric: info_extraction >= 0.7
```

#### 0.2 Phase 0 Deliverables

| Deliverable | File | Description |
|-------------|------|-------------|
| Test harness | src/workers/test-harness.ts | Runs all 60 tests |
| Synthetic codebases | test/synthetic/* | 6 synthetic test projects |
| Ground truth | test/ground-truth.json | Expected outputs for all tests |
| Results report | test/haiku-validation-results.md | Pass/fail with metrics |

#### 0.3 Phase 0 Exit Gate

```typescript
interface Phase0Gate {
  parseSuccessRate: number;  // >= 0.90
  accuracyRate: number;       // >= 0.70
  p95Latency: number;         // <= 5000ms
  totalTests: number;         // === 60
  passedTests: number;        // >= 42 (70%)
}

function validatePhase0Gate(results: Phase0Gate): boolean {
  return (
    results.parseSuccessRate >= 0.90 &&
    results.accuracyRate >= 0.70 &&
    results.p95Latency <= 5000 &&
    results.passedTests >= 42
  );
}
```

**IF GATE FAILS**:
- Document failure modes
- Adjust worker prompts or switch to Sonnet for problematic workers
- Re-run validation
- Do NOT proceed to Phase 1 until gate passes

---

### PHASE 1: TIER SYSTEM FOUNDATION

**Prerequisite**: Phase 0 gate passed
**Objective**: Build the model routing infrastructure

#### 1.1 Create src/tiers.ts

```typescript
// SPECIFICATION - IMPLEMENT EXACTLY

import Anthropic from '@anthropic-ai/sdk';

export type Tier = 'opus' | 'sonnet' | 'haiku';

export type OperationType =
  // Opus operations (judgment)
  | 'classify_task'
  | 'resolve_stuck_point'
  | 'escalation_decision'
  | 'quality_judgment'
  // Sonnet operations (supervision)
  | 'foreman_synthesis'
  | 'context_package_assembly'
  | 'execution_supervision'
  | 'quality_gate_decision'
  // Haiku operations (labor)
  | 'file_discovery'
  | 'pattern_extraction'
  | 'dependency_mapping'
  | 'constraint_identification'
  | 'web_research'
  | 'documentation_reading';

const OPERATION_TO_TIER: Record<OperationType, Tier> = {
  // Opus
  classify_task: 'opus',
  resolve_stuck_point: 'opus',
  escalation_decision: 'opus',
  quality_judgment: 'opus',
  // Sonnet
  foreman_synthesis: 'sonnet',
  context_package_assembly: 'sonnet',
  execution_supervision: 'sonnet',
  quality_gate_decision: 'sonnet',
  // Haiku
  file_discovery: 'haiku',
  pattern_extraction: 'haiku',
  dependency_mapping: 'haiku',
  constraint_identification: 'haiku',
  web_research: 'haiku',
  documentation_reading: 'haiku',
};

const TIER_TO_MODEL: Record<Tier, string> = {
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-20250514',
  haiku: 'claude-haiku-20241015',
};

export interface TierCallOptions {
  operation: OperationType;
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
}

export interface TierCallResult {
  content: string;
  tier: Tier;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

export class TierRouter {
  private client: Anthropic;
  private costAccumulator: Map<Tier, number> = new Map([
    ['opus', 0],
    ['sonnet', 0],
    ['haiku', 0],
  ]);

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  getTierForOperation(operation: OperationType): Tier {
    return OPERATION_TO_TIER[operation];
  }

  getModelForTier(tier: Tier): string {
    return TIER_TO_MODEL[tier];
  }

  async call(options: TierCallOptions): Promise<TierCallResult> {
    const tier = this.getTierForOperation(options.operation);
    const model = this.getModelForTier(tier);

    const startTime = Date.now();

    const response = await this.client.messages.create({
      model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0,
      system: options.systemPrompt,
      messages: [{ role: 'user', content: options.userPrompt }],
    });

    const latencyMs = Date.now() - startTime;
    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;

    const costUsd = this.calculateCost(tier, inputTokens, outputTokens);
    this.costAccumulator.set(tier, (this.costAccumulator.get(tier) ?? 0) + costUsd);

    const content = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');

    return {
      content,
      tier,
      model,
      inputTokens,
      outputTokens,
      costUsd,
      latencyMs,
    };
  }

  private calculateCost(tier: Tier, inputTokens: number, outputTokens: number): number {
    const costs = {
      opus: { input: 15.0, output: 75.0 },
      sonnet: { input: 3.0, output: 15.0 },
      haiku: { input: 0.25, output: 1.25 },
    };

    const tierCost = costs[tier];
    return (
      (inputTokens / 1_000_000) * tierCost.input +
      (outputTokens / 1_000_000) * tierCost.output
    );
  }

  getCostDistribution(): Record<Tier, { absolute: number; percentage: number }> {
    const total = Array.from(this.costAccumulator.values()).reduce((a, b) => a + b, 0);
    const distribution: Record<Tier, { absolute: number; percentage: number }> = {
      opus: { absolute: 0, percentage: 0 },
      sonnet: { absolute: 0, percentage: 0 },
      haiku: { absolute: 0, percentage: 0 },
    };

    for (const [tier, cost] of this.costAccumulator) {
      distribution[tier as Tier] = {
        absolute: cost,
        percentage: total > 0 ? cost / total : 0,
      };
    }

    return distribution;
  }

  resetCostAccumulator(): void {
    this.costAccumulator = new Map([
      ['opus', 0],
      ['sonnet', 0],
      ['haiku', 0],
    ]);
  }
}
```

#### 1.2 Phase 1 Acceptance Criteria

- [ ] src/tiers.ts compiles without errors
- [ ] TierRouter correctly maps all 14 operation types
- [ ] Cost calculation matches expected values (unit test)
- [ ] Integration test: call each tier once successfully
- [ ] Cost distribution tracking verified

#### 1.3 Phase 1 Test Cases

```typescript
// test/tiers.test.ts
describe('TierRouter', () => {
  it('routes classify_task to opus', () => {
    expect(router.getTierForOperation('classify_task')).toBe('opus');
  });

  it('routes file_discovery to haiku', () => {
    expect(router.getTierForOperation('file_discovery')).toBe('haiku');
  });

  it('calculates opus cost correctly', () => {
    // 1000 input, 500 output tokens
    // (1000/1M * 15) + (500/1M * 75) = 0.000015 + 0.0000375 = 0.0000525
    expect(router['calculateCost']('opus', 1000, 500)).toBeCloseTo(0.0000525);
  });

  it('tracks cost distribution', async () => {
    await router.call({ operation: 'file_discovery', ... });
    const dist = router.getCostDistribution();
    expect(dist.haiku.absolute).toBeGreaterThan(0);
  });
});
```

---

### PHASE 2: WORKER ABSTRACTION

**Prerequisite**: Phase 1 complete
**Objective**: Build the abstract worker base class

#### 2.1 Create src/workers/base.ts

```typescript
// SPECIFICATION - IMPLEMENT EXACTLY

import { z, ZodSchema } from 'zod';
import { TierRouter, OperationType, TierCallResult } from '../tiers';

export interface WorkerInput {
  task: string;
  projectRoot: string;
  additionalContext?: Record<string, unknown>;
}

export interface WorkerMetrics {
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  parseSuccess: boolean;
  retryCount: number;
}

export interface WorkerResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  metrics: WorkerMetrics;
  raw?: string;
}

export abstract class BaseWorker<TOutput> {
  protected tierRouter: TierRouter;
  protected operationType: OperationType;
  protected outputSchema: ZodSchema<TOutput>;
  protected maxRetries: number = 2;

  constructor(
    tierRouter: TierRouter,
    operationType: OperationType,
    outputSchema: ZodSchema<TOutput>
  ) {
    this.tierRouter = tierRouter;
    this.operationType = operationType;
    this.outputSchema = outputSchema;
  }

  abstract getSystemPrompt(): string;
  abstract buildUserPrompt(input: WorkerInput): string;

  async execute(input: WorkerInput): Promise<WorkerResult<TOutput>> {
    const startTime = Date.now();
    let lastError: string | undefined;
    let retryCount = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCost = 0;
    let rawResponse: string | undefined;

    while (retryCount <= this.maxRetries) {
      try {
        const result = await this.tierRouter.call({
          operation: this.operationType,
          systemPrompt: this.getSystemPrompt(),
          userPrompt: this.buildUserPrompt(input),
          maxTokens: 4096,
          temperature: 0,
        });

        rawResponse = result.content;
        totalInputTokens += result.inputTokens;
        totalOutputTokens += result.outputTokens;
        totalCost += result.costUsd;

        // Extract JSON from response
        const jsonMatch = result.content.match(/```json\n?([\s\S]*?)\n?```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : result.content;

        const parsed = JSON.parse(jsonStr);
        const validated = this.outputSchema.parse(parsed);

        return {
          success: true,
          data: validated,
          metrics: {
            latencyMs: Date.now() - startTime,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
            costUsd: totalCost,
            parseSuccess: true,
            retryCount,
          },
          raw: rawResponse,
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        retryCount++;

        if (retryCount <= this.maxRetries) {
          // Exponential backoff: 100ms, 200ms, 400ms
          await new Promise(r => setTimeout(r, 100 * Math.pow(2, retryCount - 1)));
        }
      }
    }

    return {
      success: false,
      error: lastError,
      metrics: {
        latencyMs: Date.now() - startTime,
        inputTokens: totalInputTokens,
        outputTokens: totalOutputTokens,
        costUsd: totalCost,
        parseSuccess: false,
        retryCount,
      },
      raw: rawResponse,
    };
  }
}
```

#### 2.2 Phase 2 Acceptance Criteria

- [ ] src/workers/base.ts compiles without errors
- [ ] Abstract class can be extended (verified by dummy worker test)
- [ ] Retry logic works correctly (mock test)
- [ ] JSON extraction handles both fenced and raw JSON
- [ ] Zod validation catches malformed output

---

### PHASE 3: WORKER IMPLEMENTATIONS

**Prerequisite**: Phase 2 complete
**Objective**: Implement all 6 preparation workers

#### 3.1 FileDiscoveryWorker (src/workers/file-discovery.ts)

```typescript
import { z } from 'zod';
import { BaseWorker, WorkerInput } from './base';
import { TierRouter } from '../tiers';

export const FileDiscoveryOutputSchema = z.object({
  relevantFiles: z.array(z.object({
    path: z.string(),
    reason: z.string(),
    priority: z.enum(['must_read', 'should_read', 'may_read']),
  })),
  suggestedNewFiles: z.array(z.object({
    path: z.string(),
    purpose: z.string(),
  })),
  confidence: z.number().min(0).max(100),
});

export type FileDiscoveryOutput = z.infer<typeof FileDiscoveryOutputSchema>;

export class FileDiscoveryWorker extends BaseWorker<FileDiscoveryOutput> {
  constructor(tierRouter: TierRouter) {
    super(tierRouter, 'file_discovery', FileDiscoveryOutputSchema);
  }

  getSystemPrompt(): string {
    return `You are a file discovery specialist for software projects.

Given a task description and project structure, identify which files are relevant.

RULES:
1. Only include files that ACTUALLY EXIST or SHOULD BE CREATED
2. Prioritize files that will be MODIFIED over files that are just context
3. Be conservative - fewer highly-relevant files beats many tangentially-relevant files
4. Consider test files, type definitions, and configuration

OUTPUT FORMAT (JSON only):
{
  "relevantFiles": [
    {"path": "relative/path.ts", "reason": "why relevant", "priority": "must_read|should_read|may_read"}
  ],
  "suggestedNewFiles": [
    {"path": "relative/path.ts", "purpose": "what this file will contain"}
  ],
  "confidence": 0-100
}`;
  }

  buildUserPrompt(input: WorkerInput): string {
    return `TASK: ${input.task}

PROJECT ROOT: ${input.projectRoot}

${input.additionalContext?.fileList
  ? `AVAILABLE FILES:\n${input.additionalContext.fileList}`
  : 'No file list provided - suggest based on common patterns.'}

Respond with JSON only.`;
  }
}
```

#### 3.2 PatternExtractionWorker (src/workers/pattern-extraction.ts)

```typescript
import { z } from 'zod';
import { BaseWorker, WorkerInput } from './base';
import { TierRouter } from '../tiers';

export const PatternExtractionOutputSchema = z.object({
  patterns: z.array(z.object({
    name: z.string(),
    description: z.string(),
    examples: z.array(z.string()),
    applicability: z.string(),
  })),
  conventions: z.object({
    naming: z.string(),
    fileOrganization: z.string(),
    errorHandling: z.string(),
    testing: z.string(),
  }),
  antiPatterns: z.array(z.object({
    pattern: z.string(),
    reason: z.string(),
  })),
  confidence: z.number().min(0).max(100),
});

export type PatternExtractionOutput = z.infer<typeof PatternExtractionOutputSchema>;

export class PatternExtractionWorker extends BaseWorker<PatternExtractionOutput> {
  constructor(tierRouter: TierRouter) {
    super(tierRouter, 'pattern_extraction', PatternExtractionOutputSchema);
  }

  getSystemPrompt(): string {
    return `You are a code pattern analyst specializing in identifying conventions and patterns.

Given code samples, extract:
1. Recurring patterns (with concrete examples)
2. Naming and organization conventions
3. Anti-patterns to avoid

RULES:
1. Be SPECIFIC - reference actual code, not generic descriptions
2. Patterns must be actionable for someone writing new code
3. Include file paths where patterns are demonstrated
4. Note any inconsistencies (patterns that vary across the codebase)

OUTPUT FORMAT (JSON only):
{
  "patterns": [
    {"name": "pattern name", "description": "what it is", "examples": ["code snippets"], "applicability": "when to use"}
  ],
  "conventions": {
    "naming": "naming conventions observed",
    "fileOrganization": "how files are organized",
    "errorHandling": "error handling approach",
    "testing": "testing patterns"
  },
  "antiPatterns": [
    {"pattern": "what to avoid", "reason": "why"}
  ],
  "confidence": 0-100
}`;
  }

  buildUserPrompt(input: WorkerInput): string {
    return `TASK: ${input.task}

CODE SAMPLES:
${input.additionalContext?.codeSamples || 'No code samples provided.'}

Respond with JSON only.`;
  }
}
```

#### 3.3 DependencyMapperWorker (src/workers/dependency-mapper.ts)

```typescript
import { z } from 'zod';
import { BaseWorker, WorkerInput } from './base';
import { TierRouter } from '../tiers';

export const DependencyMapperOutputSchema = z.object({
  dependencies: z.array(z.object({
    source: z.string(),
    targets: z.array(z.string()),
    type: z.enum(['import', 'type', 'runtime', 'test']),
  })),
  externalDependencies: z.array(z.object({
    name: z.string(),
    version: z.string().optional(),
    usedIn: z.array(z.string()),
  })),
  entryPoints: z.array(z.string()),
  circularDependencies: z.array(z.array(z.string())),
  confidence: z.number().min(0).max(100),
});

export type DependencyMapperOutput = z.infer<typeof DependencyMapperOutputSchema>;

export class DependencyMapperWorker extends BaseWorker<DependencyMapperOutput> {
  constructor(tierRouter: TierRouter) {
    super(tierRouter, 'dependency_mapping', DependencyMapperOutputSchema);
  }

  getSystemPrompt(): string {
    return `You are a dependency analysis specialist for software projects.

Given file contents and import statements, map the dependency graph.

RULES:
1. Track both direct imports and type imports
2. Identify external (npm) vs internal dependencies
3. Flag circular dependencies if found
4. Note entry points (files that are imported by nothing)

OUTPUT FORMAT (JSON only):
{
  "dependencies": [
    {"source": "file.ts", "targets": ["dep1.ts", "dep2.ts"], "type": "import|type|runtime|test"}
  ],
  "externalDependencies": [
    {"name": "@anthropic-ai/sdk", "version": "^1.0.0", "usedIn": ["llm.ts"]}
  ],
  "entryPoints": ["index.ts"],
  "circularDependencies": [["a.ts", "b.ts", "a.ts"]],
  "confidence": 0-100
}`;
  }

  buildUserPrompt(input: WorkerInput): string {
    return `TASK: ${input.task}

PROJECT ROOT: ${input.projectRoot}

FILE CONTENTS WITH IMPORTS:
${input.additionalContext?.fileContents || 'No file contents provided.'}

Respond with JSON only.`;
  }
}
```

#### 3.4 ConstraintIdentifierWorker (src/workers/constraint-identifier.ts)

```typescript
import { z } from 'zod';
import { BaseWorker, WorkerInput } from './base';
import { TierRouter } from '../tiers';

export const ConstraintIdentifierOutputSchema = z.object({
  typeConstraints: z.array(z.object({
    description: z.string(),
    source: z.string(),
    enforcement: z.enum(['compile_time', 'runtime', 'lint']),
  })),
  testConstraints: z.array(z.object({
    description: z.string(),
    testFile: z.string(),
    coverage: z.string().optional(),
  })),
  lintConstraints: z.array(z.object({
    rule: z.string(),
    severity: z.enum(['error', 'warning', 'off']),
    source: z.string(),
  })),
  buildConstraints: z.array(z.object({
    description: z.string(),
    source: z.string(),
  })),
  apiConstraints: z.array(z.object({
    description: z.string(),
    endpoint: z.string().optional(),
  })),
  confidence: z.number().min(0).max(100),
});

export type ConstraintIdentifierOutput = z.infer<typeof ConstraintIdentifierOutputSchema>;

export class ConstraintIdentifierWorker extends BaseWorker<ConstraintIdentifierOutput> {
  constructor(tierRouter: TierRouter) {
    super(tierRouter, 'constraint_identification', ConstraintIdentifierOutputSchema);
  }

  getSystemPrompt(): string {
    return `You are a constraint analyst for software projects.

Identify all constraints that new code must satisfy:
- Type system requirements (TypeScript strict mode, Zod schemas)
- Test requirements (what tests exist, coverage expectations)
- Lint rules (ESLint, Prettier configurations)
- Build requirements (compilation targets, bundling)
- API constraints (external service contracts)

RULES:
1. Be SPECIFIC - cite actual config files and rules
2. Distinguish between hard constraints (errors) and soft (warnings)
3. Note any constraints that are IMPLIED but not configured

OUTPUT FORMAT (JSON only):
{
  "typeConstraints": [...],
  "testConstraints": [...],
  "lintConstraints": [...],
  "buildConstraints": [...],
  "apiConstraints": [...],
  "confidence": 0-100
}`;
  }

  buildUserPrompt(input: WorkerInput): string {
    return `TASK: ${input.task}

PROJECT ROOT: ${input.projectRoot}

CONFIGURATION FILES:
${input.additionalContext?.configFiles || 'No config files provided.'}

Respond with JSON only.`;
  }
}
```

#### 3.5 WebResearchWorker (src/workers/web-research.ts)

```typescript
import { z } from 'zod';
import { BaseWorker, WorkerInput } from './base';
import { TierRouter } from '../tiers';

export const WebResearchOutputSchema = z.object({
  findings: z.array(z.object({
    topic: z.string(),
    summary: z.string(),
    source: z.string().optional(),
    relevance: z.enum(['high', 'medium', 'low']),
  })),
  recommendations: z.array(z.object({
    action: z.string(),
    rationale: z.string(),
  })),
  unknowns: z.array(z.string()),
  confidence: z.number().min(0).max(100),
});

export type WebResearchOutput = z.infer<typeof WebResearchOutputSchema>;

export class WebResearchWorker extends BaseWorker<WebResearchOutput> {
  constructor(tierRouter: TierRouter) {
    super(tierRouter, 'web_research', WebResearchOutputSchema);
  }

  getSystemPrompt(): string {
    return `You are a technical research specialist.

Given a task requiring external knowledge, provide relevant findings.

SCOPE LIMITS:
1. Only research what is DIRECTLY needed for the task
2. Prefer official documentation over blog posts
3. Note version-specific information (APIs change)
4. Distinguish between verified facts and best practices

OUTPUT FORMAT (JSON only):
{
  "findings": [
    {"topic": "what was researched", "summary": "key information", "source": "URL if known", "relevance": "high|medium|low"}
  ],
  "recommendations": [
    {"action": "what to do", "rationale": "why"}
  ],
  "unknowns": ["things that couldn't be determined"],
  "confidence": 0-100
}

NOTE: You don't have actual web access. Provide information from your training data, clearly noting any limitations.`;
  }

  buildUserPrompt(input: WorkerInput): string {
    return `TASK: ${input.task}

SPECIFIC RESEARCH NEEDS:
${input.additionalContext?.researchQueries || 'General research for the task.'}

PROJECT CONTEXT:
${input.additionalContext?.projectContext || 'No additional context.'}

Respond with JSON only.`;
  }
}
```

#### 3.6 DocumentationReaderWorker (src/workers/documentation-reader.ts)

```typescript
import { z } from 'zod';
import { BaseWorker, WorkerInput } from './base';
import { TierRouter } from '../tiers';

export const DocumentationReaderOutputSchema = z.object({
  summary: z.string(),
  relevantSections: z.array(z.object({
    title: z.string(),
    content: z.string(),
    applicability: z.string(),
  })),
  apiReferences: z.array(z.object({
    name: z.string(),
    signature: z.string().optional(),
    description: z.string(),
  })),
  examples: z.array(z.object({
    description: z.string(),
    code: z.string(),
  })),
  warnings: z.array(z.string()),
  confidence: z.number().min(0).max(100),
});

export type DocumentationReaderOutput = z.infer<typeof DocumentationReaderOutputSchema>;

export class DocumentationReaderWorker extends BaseWorker<DocumentationReaderOutput> {
  constructor(tierRouter: TierRouter) {
    super(tierRouter, 'documentation_reading', DocumentationReaderOutputSchema);
  }

  getSystemPrompt(): string {
    return `You are a documentation analyst specializing in extracting actionable information.

Given documentation content, extract information relevant to the task at hand.

RULES:
1. Focus on sections RELEVANT to the specific task
2. Extract concrete examples, not just descriptions
3. Note any warnings, deprecations, or gotchas
4. Preserve API signatures exactly as documented

OUTPUT FORMAT (JSON only):
{
  "summary": "brief overview of relevant documentation",
  "relevantSections": [
    {"title": "section name", "content": "key content", "applicability": "how it applies to task"}
  ],
  "apiReferences": [
    {"name": "function/method name", "signature": "signature if available", "description": "what it does"}
  ],
  "examples": [
    {"description": "what this example shows", "code": "code snippet"}
  ],
  "warnings": ["important caveats"],
  "confidence": 0-100
}`;
  }

  buildUserPrompt(input: WorkerInput): string {
    return `TASK: ${input.task}

DOCUMENTATION CONTENT:
${input.additionalContext?.documentation || 'No documentation provided.'}

Respond with JSON only.`;
  }
}
```

#### 3.7 Worker Index (src/workers/index.ts)

```typescript
export * from './base';
export * from './file-discovery';
export * from './pattern-extraction';
export * from './dependency-mapper';
export * from './constraint-identifier';
export * from './web-research';
export * from './documentation-reader';
```

#### 3.8 Phase 3 Acceptance Criteria

- [ ] All 6 workers compile without errors
- [ ] Each worker passes its 10 validation tests from Phase 0
- [ ] Worker outputs conform to Zod schemas
- [ ] Retry logic handles transient failures
- [ ] Cost tracking per worker verified

---

### PHASE 4: PREPARATION DEPARTMENT INTEGRATION

**Prerequisite**: Phase 3 complete
**Objective**: Replace shell-command preparation with LLM workers

#### 4.1 Modify src/departments/preparation.ts

**Current State**: 7-phase preparation using shell commands (find, grep, etc.)

**Target State**: Wave-based parallel worker dispatch with Foreman synthesis

```typescript
// KEY CHANGES TO MAKE (do not rewrite entire file)

// 1. Add imports
import { TierRouter } from '../tiers';
import {
  FileDiscoveryWorker,
  PatternExtractionWorker,
  DependencyMapperWorker,
  ConstraintIdentifierWorker,
  WebResearchWorker,
  DocumentationReaderWorker,
} from '../workers';

// 2. Add worker initialization to constructor
class PreparationDepartment {
  private tierRouter: TierRouter;
  private workers: {
    fileDiscovery: FileDiscoveryWorker;
    patternExtraction: PatternExtractionWorker;
    dependencyMapper: DependencyMapperWorker;
    constraintIdentifier: ConstraintIdentifierWorker;
    webResearch: WebResearchWorker;
    documentationReader: DocumentationReaderWorker;
  };

  constructor(tierRouter: TierRouter, ...existingParams) {
    this.tierRouter = tierRouter;
    this.workers = {
      fileDiscovery: new FileDiscoveryWorker(tierRouter),
      patternExtraction: new PatternExtractionWorker(tierRouter),
      dependencyMapper: new DependencyMapperWorker(tierRouter),
      constraintIdentifier: new ConstraintIdentifierWorker(tierRouter),
      webResearch: new WebResearchWorker(tierRouter),
      documentationReader: new DocumentationReaderWorker(tierRouter),
    };
  }

  // 3. Replace shell-based methods with worker calls
  async prepare(task: TaskDescription): Promise<ContextPackage> {
    // Wave 1: Independent workers (parallel)
    const [fileDiscovery, constraints] = await Promise.all([
      this.workers.fileDiscovery.execute({
        task: task.description,
        projectRoot: this.projectRoot,
        additionalContext: { fileList: await this.getFileList() },
      }),
      this.workers.constraintIdentifier.execute({
        task: task.description,
        projectRoot: this.projectRoot,
        additionalContext: { configFiles: await this.getConfigFiles() },
      }),
    ]);

    // Wave 2: Dependent on Wave 1 results (parallel)
    const [patterns, dependencies] = await Promise.all([
      this.workers.patternExtraction.execute({
        task: task.description,
        projectRoot: this.projectRoot,
        additionalContext: {
          codeSamples: await this.readFiles(fileDiscovery.data?.relevantFiles || [])
        },
      }),
      this.workers.dependencyMapper.execute({
        task: task.description,
        projectRoot: this.projectRoot,
        additionalContext: {
          fileContents: await this.getImports(fileDiscovery.data?.relevantFiles || [])
        },
      }),
    ]);

    // Wave 3: Optional workers based on task type
    let webResearch, documentation;
    if (this.needsWebResearch(task)) {
      webResearch = await this.workers.webResearch.execute({
        task: task.description,
        projectRoot: this.projectRoot,
        additionalContext: { researchQueries: this.generateResearchQueries(task) },
      });
    }
    if (this.hasDocumentation()) {
      documentation = await this.workers.documentationReader.execute({
        task: task.description,
        projectRoot: this.projectRoot,
        additionalContext: { documentation: await this.getDocumentation() },
      });
    }

    // Foreman Synthesis (Sonnet)
    return this.synthesizeContextPackage({
      fileDiscovery,
      patterns,
      dependencies,
      constraints,
      webResearch,
      documentation,
    });
  }

  // 4. Add Foreman synthesis method
  private async synthesizeContextPackage(workerResults: WorkerResults): Promise<ContextPackage> {
    const result = await this.tierRouter.call({
      operation: 'context_package_assembly',
      systemPrompt: FOREMAN_SYNTHESIS_PROMPT,
      userPrompt: JSON.stringify(workerResults, null, 2),
    });

    // Parse and return ContextPackage
    return ContextPackageSchema.parse(JSON.parse(result.content));
  }
}
```

#### 4.2 Phase 4 Acceptance Criteria

- [ ] preparation.ts compiles after modification
- [ ] Worker dispatch runs in parallel waves
- [ ] Foreman synthesis produces valid ContextPackage
- [ ] Existing benchmark still passes (100%)
- [ ] Cost distribution within targets (50-65% Haiku)

---

### PHASE 5: PATTERN TRACKER (ACTIVE LEARNING)

**Prerequisite**: Phase 4 complete
**Objective**: Track pattern success rates for adaptive learning

#### 5.1 Create src/pattern-tracker.ts

```typescript
import { z } from 'zod';
import { MandrelClient } from './mandrel';

const PatternScoreSchema = z.object({
  patternId: z.string(),
  name: z.string(),
  successCount: z.number(),
  failureCount: z.number(),
  lastUsed: z.string(),
  successRate: z.number(),
  contexts: z.array(z.string()), // task types where this pattern succeeded
});

type PatternScore = z.infer<typeof PatternScoreSchema>;

export class PatternTracker {
  private mandrelClient: MandrelClient;
  private patternScores: Map<string, PatternScore> = new Map();
  private loaded: boolean = false;

  constructor(mandrelClient: MandrelClient) {
    this.mandrelClient = mandrelClient;
  }

  async loadPatterns(): Promise<void> {
    if (this.loaded) return;

    const result = await this.mandrelClient.searchContext('pattern_score');
    // Parse and populate patternScores map
    this.loaded = true;
  }

  async recordSuccess(patternId: string, patternName: string, context: string): Promise<void> {
    const existing = this.patternScores.get(patternId) || this.createNewPattern(patternId, patternName);
    existing.successCount++;
    existing.lastUsed = new Date().toISOString();
    existing.successRate = existing.successCount / (existing.successCount + existing.failureCount);
    if (!existing.contexts.includes(context)) {
      existing.contexts.push(context);
    }
    this.patternScores.set(patternId, existing);
    await this.persistPattern(existing);
  }

  async recordFailure(patternId: string, patternName: string): Promise<void> {
    const existing = this.patternScores.get(patternId) || this.createNewPattern(patternId, patternName);
    existing.failureCount++;
    existing.lastUsed = new Date().toISOString();
    existing.successRate = existing.successCount / (existing.successCount + existing.failureCount);
    this.patternScores.set(patternId, existing);
    await this.persistPattern(existing);
  }

  getRecommendedPatterns(taskType: string, limit: number = 5): PatternScore[] {
    return Array.from(this.patternScores.values())
      .filter(p => p.successRate >= 0.7)
      .filter(p => p.contexts.includes(taskType) || p.contexts.length === 0)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, limit);
  }

  private createNewPattern(patternId: string, patternName: string): PatternScore {
    return {
      patternId,
      name: patternName,
      successCount: 0,
      failureCount: 0,
      lastUsed: new Date().toISOString(),
      successRate: 0,
      contexts: [],
    };
  }

  private async persistPattern(pattern: PatternScore): Promise<void> {
    await this.mandrelClient.storeContext(
      JSON.stringify(pattern),
      'planning',
      ['pattern_score', pattern.patternId]
    );
  }
}
```

#### 5.2 Phase 5 Acceptance Criteria

- [ ] PatternTracker compiles without errors
- [ ] Patterns persist to Mandrel correctly
- [ ] Success/failure rates calculate correctly
- [ ] Pattern recommendations filter by success rate
- [ ] Integration with learning.ts verified

---

### PHASE 6: FEEDBACK ROUTER

**Prerequisite**: Phase 5 complete
**Objective**: Intelligent error routing for self-correction

#### 6.1 Create src/feedback-router.ts

```typescript
import { TierRouter } from './tiers';
import { PatternTracker } from './pattern-tracker';

export type ErrorCategory =
  | 'compilation_error'
  | 'type_error'
  | 'test_failure'
  | 'lint_error'
  | 'runtime_error'
  | 'timeout'
  | 'unknown';

export interface ErrorContext {
  category: ErrorCategory;
  message: string;
  file?: string;
  line?: number;
  stackTrace?: string;
  previousAttempts: number;
}

export interface FeedbackAction {
  action: 'retry' | 'escalate' | 'fail' | 'human_sync';
  reason: string;
  suggestedFix?: string;
  patternToUpdate?: string;
}

export class FeedbackRouter {
  private tierRouter: TierRouter;
  private patternTracker: PatternTracker;
  private maxAutoRetries: number = 3;

  constructor(tierRouter: TierRouter, patternTracker: PatternTracker) {
    this.tierRouter = tierRouter;
    this.patternTracker = patternTracker;
  }

  categorizeError(error: string): ErrorCategory {
    if (error.includes('TS') && /TS\d{4}/.test(error)) return 'type_error';
    if (error.includes('Cannot compile') || error.includes('SyntaxError')) return 'compilation_error';
    if (error.includes('FAIL') || error.includes('test')) return 'test_failure';
    if (error.includes('ESLint') || error.includes('Prettier')) return 'lint_error';
    if (error.includes('timeout') || error.includes('ETIMEOUT')) return 'timeout';
    if (error.includes('Error:') || error.includes('Exception')) return 'runtime_error';
    return 'unknown';
  }

  async routeError(context: ErrorContext): Promise<FeedbackAction> {
    // Quick exits for known patterns
    if (context.previousAttempts >= this.maxAutoRetries) {
      return {
        action: 'escalate',
        reason: `Max retries (${this.maxAutoRetries}) exceeded`,
      };
    }

    // Simple errors can be retried immediately
    if (context.category === 'lint_error' && context.previousAttempts < 2) {
      return {
        action: 'retry',
        reason: 'Lint errors are typically auto-fixable',
        suggestedFix: 'Run linter with --fix flag',
      };
    }

    // Complex errors need judgment
    if (context.category === 'unknown' || context.previousAttempts >= 2) {
      const judgment = await this.tierRouter.call({
        operation: 'resolve_stuck_point',
        systemPrompt: STUCK_POINT_RESOLUTION_PROMPT,
        userPrompt: JSON.stringify(context),
      });

      return this.parseJudgment(judgment.content);
    }

    // Default: retry with context
    return {
      action: 'retry',
      reason: `Attempting auto-fix for ${context.category}`,
    };
  }

  private parseJudgment(content: string): FeedbackAction {
    try {
      return JSON.parse(content) as FeedbackAction;
    } catch {
      return {
        action: 'human_sync',
        reason: 'Could not parse judgment - requesting human input',
      };
    }
  }
}

const STUCK_POINT_RESOLUTION_PROMPT = `You are an expert debugger resolving stuck points in automated code generation.

Given an error context, decide:
1. Can this be automatically retried with different approach?
2. Should this escalate to a human?
3. Should the task fail?

Consider:
- Number of previous attempts
- Error category and specific message
- Whether the error suggests a fundamental misunderstanding vs. a typo

OUTPUT FORMAT (JSON only):
{
  "action": "retry|escalate|fail|human_sync",
  "reason": "explanation",
  "suggestedFix": "optional specific fix suggestion",
  "patternToUpdate": "optional pattern ID that failed"
}`;
```

#### 6.2 Phase 6 Acceptance Criteria

- [ ] FeedbackRouter compiles without errors
- [ ] Error categorization is accurate (test with sample errors)
- [ ] Escalation path works (max retries exceeded)
- [ ] Opus is only called for complex judgments
- [ ] Integration with existing execution.ts

---

## SECTION 3: INTEGRATION & VALIDATION

### 3.1 Integration Checklist

After all phases complete, verify end-to-end:

| Check | Command/Method | Expected |
|-------|----------------|----------|
| TypeScript compilation | `npx tsc --noEmit` | No errors |
| Existing benchmark | `npx ts-node src/benchmark.ts` | 100% pass |
| Tier distribution | Review cost logs | Opus 10-15%, Sonnet 25-35%, Haiku 50-65% |
| Worker accuracy | Phase 0 test harness | ≥70% |
| Pattern learning | Store → retrieve cycle | Patterns persist and retrieve |
| Error routing | Inject test errors | Correct categorization and action |

### 3.2 Rollback Plan

If a phase fails validation:

1. **Phase 0 Fails**: Adjust worker prompts, consider Sonnet for weak workers
2. **Phase 1-3 Fail**: Compilation issues - fix and recompile
3. **Phase 4 Fails**: Preparation regression - revert to shell-command prep
4. **Phase 5-6 Fail**: Learning regression - disable new features, keep core

### 3.3 Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Benchmark pass rate | ≥100% | Automated benchmark |
| Worker accuracy | ≥70% | Phase 0 test harness |
| Context package quality | Human review | Sample 10 packages |
| Cost per task | < $0.50 average | LLM cost tracking |
| Haiku cost share | 50-65% | Cost distribution |
| Pattern learning evidence | N > 20 patterns | Mandrel query |

---

## SECTION 4: FILE MANIFEST

### Files to CREATE (11 files)

| File | Phase | Purpose | LOC Est. |
|------|-------|---------|----------|
| src/tiers.ts | 1 | Tier system and model routing | 150 |
| src/workers/base.ts | 2 | Abstract worker base class | 120 |
| src/workers/file-discovery.ts | 3 | File discovery worker | 80 |
| src/workers/pattern-extraction.ts | 3 | Pattern extraction worker | 90 |
| src/workers/dependency-mapper.ts | 3 | Dependency mapping worker | 85 |
| src/workers/constraint-identifier.ts | 3 | Constraint identification worker | 95 |
| src/workers/web-research.ts | 3 | Web research worker | 75 |
| src/workers/documentation-reader.ts | 3 | Documentation reading worker | 85 |
| src/workers/index.ts | 3 | Worker exports | 10 |
| src/pattern-tracker.ts | 5 | Active pattern learning | 120 |
| src/feedback-router.ts | 6 | Error routing | 130 |

**Estimated New LOC**: ~1,040

### Files to MODIFY (4 files)

| File | Phase | Changes |
|------|-------|---------|
| src/llm.ts | 1 | Add TierRouter import, deprecate direct calls |
| src/departments/preparation.ts | 4 | Replace shell commands with worker dispatch |
| src/learning.ts | 5 | Integrate PatternTracker |
| src/index.ts | 6 | Wire new components |

---

## SECTION 5: PHASE 0 SYNTHETIC CODEBASES

### 5.1 Required Test Projects

Create minimal synthetic projects in `test/synthetic/`:

```
test/synthetic/
├── express-basic/           # Basic Express.js app
│   ├── src/
│   │   ├── index.ts
│   │   ├── routes/
│   │   └── middleware/
│   ├── package.json
│   └── tsconfig.json
│
├── react-app/               # React application
│   ├── src/
│   │   ├── App.tsx
│   │   ├── components/
│   │   └── hooks/
│   └── package.json
│
├── typed-project/           # TypeScript with strict config
│   ├── src/
│   ├── tsconfig.json (strict: true)
│   └── .eslintrc.js
│
├── deps/                    # Dependency graph test
│   ├── index.ts
│   ├── utils/
│   └── services/
│
├── patterns/                # Code pattern samples
│   ├── react-hooks.tsx
│   ├── error-handling.ts
│   └── api-patterns.ts
│
└── docs/                    # Documentation samples
    ├── API.md
    └── ARCHITECTURE.md
```

Each project should be minimal (50-200 LOC total) but contain enough structure to validate workers.

---

## SECTION 6: PROMPTS REFERENCE

### 6.1 Foreman Synthesis Prompt

```
You are the Preparation Foreman for The Forge factory system.

You have received outputs from 6 worker specialists:
1. FileDiscoveryWorker - relevant files for the task
2. PatternExtractionWorker - code patterns and conventions
3. DependencyMapperWorker - file dependency graph
4. ConstraintIdentifierWorker - type/test/lint constraints
5. WebResearchWorker - external knowledge (optional)
6. DocumentationReaderWorker - project documentation (optional)

Your job: Synthesize these into a unified ContextPackage.

RULES:
1. Resolve conflicts between workers (e.g., files mentioned by one but not another)
2. Prioritize concrete information over vague summaries
3. Flag low-confidence areas that need human review
4. Ensure the package is actionable for execution

OUTPUT: Complete ContextPackage JSON matching the schema.
```

### 6.2 Plant Manager Classification Prompt

```
You are the Plant Manager for The Forge factory system.

Given a task request, classify it:
- projectType: feature | bugfix | greenfield | refactor | research
- complexity: simple | moderate | complex | very_complex
- riskLevel: low | medium | high | critical
- estimatedWorkers: which workers are needed

RULES:
1. Be conservative with complexity estimates
2. Flag anything touching auth/payments/data as higher risk
3. Greenfield = new project, not new feature in existing project

OUTPUT FORMAT (JSON only):
{
  "projectType": "...",
  "complexity": "...",
  "riskLevel": "...",
  "estimatedWorkers": ["file_discovery", "pattern_extraction", ...],
  "reasoning": "brief explanation"
}
```

---

## SECTION 7: DECISION LOG

Decisions made during planning that should NOT be revisited without escalation:

| Decision | Rationale | Alternatives Considered |
|----------|-----------|------------------------|
| Haiku for all workers | Cost optimization, validated by Phase 0 | Sonnet for workers (too expensive) |
| Wave-based parallelism | Natural dependencies, not over-engineered | Full DAG scheduler (complexity) |
| Zod for output validation | Already in codebase, proven | io-ts (learning curve), manual (error-prone) |
| Mandrel for pattern storage | Already operational, semantic search | Local SQLite (no semantic), Redis (no persistence) |
| 3 retry max | Balance between persistence and waste | 1 (too fragile), 5 (too wasteful) |
| 70% accuracy threshold | Achievable with Haiku, meaningful | 80% (too strict), 60% (too loose) |

---

## SECTION 8: RISK REGISTER

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Haiku accuracy too low | Medium | High | Phase 0 gate; fallback to Sonnet for weak workers |
| Worker outputs too variable | Medium | Medium | Zod schemas; retry on parse failure |
| Cost exceeds targets | Low | Medium | Monitor distribution; adjust worker count |
| Mandrel unavailable | Low | High | Graceful degradation to shell commands |
| Integration breaks benchmark | Medium | High | Rollback to pre-Phase-4 state |

---

## APPENDIX A: VALIDATION COMMANDS

```bash
# Full compilation check
cd /workspace/projects/the-forge/forge-engine
npx tsc --noEmit

# Run existing benchmark
npx ts-node src/benchmark.ts

# Run Phase 0 validation (after creating test harness)
npx ts-node test/workers/run-validation.ts

# Check Mandrel connectivity
ssh hetzner 'curl -s -X POST http://localhost:8080/mcp/tools/mandrel_ping -H "Content-Type: application/json" -d '\''{"arguments": {}}'\'''

# View cost distribution (after runs)
npx ts-node -e "import { TierRouter } from './src/tiers'; const r = new TierRouter(process.env.CLAUDE_API_KEY!); console.log(r.getCostDistribution());"
```

---

## APPENDIX B: INSTANCE CONTINUITY

This plan serves as the **canonical reference** for all subsequent instances. When picking up this work:

1. Read this document FIRST
2. Check which phase was last completed (look for PHASE_N_COMPLETE markers in code or handoffs)
3. Run validation commands to confirm state
4. Continue from next phase gate

**DO NOT**:
- Skip phases
- Assume anything not in this document
- Modify architecture without escalation to human

---

**END OF SIRK-V2-EXECUTABLE-PLAN**

*Generated by i[8]-v2 on 2026-01-10*
*Consolidates i[1]-i[7]-v2 planning passes*
*Validated against i[1]-i[34] building experience*
