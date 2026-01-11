/**
 * Phase 0 Haiku Validation Test Harness - Production Pattern
 *
 * Workers use tools to explore codebases autonomously, not context dumps.
 * This is how it will work in production.
 *
 * Gate Criteria:
 * - Parse success rate >= 90%
 * - Accuracy >= 70% (>= 42/60 tests pass)
 * - P95 latency <= 5000ms
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { WORKER_TOOLS, executeTool, buildMinimalContext, getProjectSummary, type ToolInput } from './tools.js';

// ============================================================================
// Model Configuration
// ============================================================================

interface ModelConfig {
  id: string;
  provider: 'anthropic' | 'openai';
  displayName: string;
  apiKeyEnv: string;
  baseURL?: string;
}

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  'haiku': {
    id: 'claude-3-5-haiku-20241022',
    provider: 'anthropic',
    displayName: 'Claude 3.5 Haiku',
    apiKeyEnv: 'ANTHROPIC_API_KEY'
  },
  'grok-4-1-fast-reasoning': {
    id: 'grok-4-1-fast-reasoning',
    provider: 'openai',
    displayName: 'Grok 4.1 Fast Reasoning',
    apiKeyEnv: 'XAI_API_KEY',
    baseURL: 'https://api.x.ai/v1'
  }
};

// Convert Anthropic tools to OpenAI format
function convertToolsToOpenAI(tools: Anthropic.Tool[]): OpenAI.ChatCompletionTool[] {
  return tools.map(tool => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.input_schema as Record<string, unknown>
    }
  }));
}

const OPENAI_TOOLS = convertToolsToOpenAI(WORKER_TOOLS);

// ESM compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// Types
// ============================================================================

interface GroundTruth {
  version: string;
  thresholds: {
    parseSuccessRate: number;
    accuracyRate: number;
    p95LatencyMs: number;
    minPassingTests: number;
  };
  workers: Record<string, WorkerTestSuite>;
}

interface WorkerTestSuite {
  operationType: string;
  testCases: TestCase[];
}

interface TestCase {
  id: string;
  name: string;
  codebase?: string;
  input: Record<string, unknown>;
  expectedOutput: Record<string, unknown>;
  accuracyMetric: AccuracyMetric;
}

interface AccuracyMetric {
  type: 'jaccard_similarity' | 'must_include' | 'pattern_overlap' | 'edge_precision' | 'constraint_recall' | 'relevant_info_present' | 'info_extraction' | 'recall' | 'accuracy';
  threshold?: number;
  fields?: string[];
  requiredPaths?: string[];
  requiredPatterns?: string[];
  requiredConstraints?: string[];
  requiredTopics?: string[];
  requiredInfo?: string[];
  requiredItems?: string[];
}

interface TestResult {
  testId: string;
  workerType: string;
  name: string;
  passed: boolean;
  parseSuccess: boolean;
  accuracyScore: number;
  latencyMs: number;
  toolCalls: ToolCallRecord[];
  error?: string;
  rawOutput?: string;
  parsedOutput?: unknown;
}

interface ToolCallRecord {
  name: string;
  input: ToolInput;
  output: string;
}

interface ValidationResults {
  totalTests: number;
  passedTests: number;
  parseSuccessRate: number;
  accuracyRate: number;
  p95LatencyMs: number;
  gatePass: boolean;
  byWorker: Record<string, WorkerResults>;
  results: TestResult[];
}

interface WorkerResults {
  total: number;
  passed: number;
  parseSuccess: number;
  avgLatencyMs: number;
}

interface CLIOptions {
  worker?: string;
  test?: string;
  limit?: number;
  verbose: boolean;
  dryRun: boolean;
  model: string;
}

// ============================================================================
// Worker Prompts (Updated for Tool Use)
// ============================================================================

const WORKER_PROMPTS: Record<string, { system: string; buildUser: (input: Record<string, unknown>, context: string) => string }> = {
  file_discovery: {
    system: `You are a file discovery specialist for software projects.

Given a task description, use your tools to explore the codebase and identify ALL relevant files.

TOOLS AVAILABLE:
- glob(pattern): Find files matching a glob pattern (e.g., "**/*.ts", "src/routes/*.ts")
- read(path): Read the contents of a file
- grep(pattern, path?): Search for text patterns in files
- submit_result(result, confidence): Submit your final findings (REQUIRED as final step)

WORKFLOW:
1. Start with glob to find potentially relevant files
2. Read files that look promising based on their names
3. Use grep to find specific patterns if needed
4. Call submit_result with your findings

WHAT TO INCLUDE:
- Files that will be DIRECTLY MODIFIED to implement the task
- Files that provide CONTEXT needed to understand how to implement (imports, types, related code)
- Files that will be AFFECTED by the change (consumers of modified code)
- Entry points that wire things together (index.ts, app.ts, main.ts)
- Related test files, type definitions, and configuration

PRIORITY LEVELS:
- must_read: Files that will definitely be modified or are critical to understand
- should_read: Files that provide important context or may need changes
- may_read: Files that might be tangentially relevant

RULES:
1. Only include files that ACTUALLY EXIST (you verified with glob/read)
2. Be thorough - when in doubt, include the file
3. MUST call submit_result when done - do not output raw JSON

RESULT FORMAT (pass to submit_result):
{
  "relevantFiles": [
    {"path": "relative/path.ts", "reason": "why relevant", "priority": "must_read|should_read|may_read"}
  ],
  "suggestedNewFiles": [
    {"path": "relative/path.ts", "purpose": "what this file will contain"}
  ]
}`,
    buildUser: (input, context) => `TASK: ${input.task}

${context}

Explore the codebase using your tools. When done, call submit_result with your findings. Include ALL relevant files - both files to modify AND files needed for context.`
  },

  pattern_extraction: {
    system: `You are a code pattern analyst specializing in identifying conventions and patterns.

Use your tools to explore the codebase and extract patterns.

TOOLS AVAILABLE:
- glob(pattern): Find files matching a glob pattern
- read(path): Read the contents of a file
- grep(pattern, path?): Search for text patterns
- submit_result(result, confidence): Submit your final findings (REQUIRED as final step)

WORKFLOW:
1. Use glob to find code files
2. Read several representative files
3. Use grep to find recurring patterns
4. Call submit_result with your findings

RULES:
1. Be SPECIFIC - reference actual code, not generic descriptions
2. Patterns must be actionable for someone writing new code
3. Include file paths where patterns are demonstrated
4. Note any inconsistencies
5. MUST call submit_result when done - do not output raw JSON

RESULT FORMAT (pass to submit_result):
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
  ]
}`,
    buildUser: (input, context) => `TASK: ${input.task}

${context}

Explore the codebase using your tools. When done, call submit_result with your findings.`
  },

  dependency_mapping: {
    system: `You are a dependency analysis specialist for software projects.

Use your tools to map the dependency graph by reading files and analyzing imports.

TOOLS AVAILABLE:
- glob(pattern): Find files matching a glob pattern
- read(path): Read the contents of a file
- grep(pattern, path?): Search for import statements
- submit_result(result, confidence): Submit your final findings (REQUIRED as final step)

WORKFLOW:
1. Use glob to find source files
2. Read files and analyze their imports
3. Use grep to find specific import patterns
4. Call submit_result with your findings

RULES:
1. Track both direct imports and type imports
2. Identify external (npm) vs internal dependencies
3. Flag circular dependencies if found
4. Note entry points (files that are imported by nothing)
5. MUST call submit_result when done - do not output raw JSON

RESULT FORMAT (pass to submit_result):
{
  "dependencies": [
    {"source": "file.ts", "targets": ["dep1.ts", "dep2.ts"], "type": "import|type|runtime|test"}
  ],
  "externalDependencies": [
    {"name": "@anthropic-ai/sdk", "version": "^1.0.0", "usedIn": ["llm.ts"]}
  ],
  "entryPoints": ["index.ts"],
  "circularDependencies": []
}`,
    buildUser: (input, context) => `TASK: ${input.task}

${input.entryFile ? `ENTRY FILE: ${input.entryFile}` : ''}
${input.targetFile ? `TARGET FILE: ${input.targetFile}` : ''}
${input.directory ? `DIRECTORY: ${input.directory}` : ''}

${context}

Explore the codebase using your tools. When done, call submit_result with your findings.`
  },

  constraint_identification: {
    system: `You are a constraint analyst for software projects.

Use your tools to identify all constraints that new code must satisfy.

TOOLS AVAILABLE:
- glob(pattern): Find configuration files
- read(path): Read configuration and source files
- grep(pattern, path?): Search for constraint patterns
- submit_result(result, confidence): Submit your final findings (REQUIRED as final step)

WORKFLOW:
1. Use glob to find config files (tsconfig.json, .eslintrc.*, package.json, etc.)
2. Read the configuration files to understand build/type constraints
3. Read package.json to identify key dependencies (e.g., Zod, TypeScript, etc.)
4. Use grep to find how key libraries are used in the codebase
5. Identify type, lint, build, library, and test constraints
6. Call submit_result with your findings

IMPORTANT - LIBRARY CONSTRAINTS:
- Check package.json for key dependencies like Zod, TypeScript, validation libraries
- Search source files for usage patterns of these libraries
- Include library names explicitly in constraint descriptions (e.g., "TypeScript strict mode", "Zod schema validation required")

RULES:
1. Be SPECIFIC - cite actual config files and rules
2. ALWAYS mention library/technology names in descriptions (TypeScript, Zod, Express, etc.)
3. Distinguish between hard constraints (errors) and soft (warnings)
4. Note any constraints that are IMPLIED but not configured
5. MUST call submit_result when done - do not output raw JSON

RESULT FORMAT (pass to submit_result):
{
  "typeConstraints": [
    {"description": "TypeScript constraint description", "source": "file", "enforcement": "compile_time|runtime|lint"}
  ],
  "testConstraints": [
    {"description": "constraint", "testFile": "file", "coverage": "optional"}
  ],
  "lintConstraints": [
    {"rule": "rule-name", "severity": "error|warning|off", "source": "config file"}
  ],
  "buildConstraints": [
    {"description": "constraint", "source": "file"}
  ],
  "apiConstraints": [
    {"description": "constraint", "endpoint": "optional"}
  ]
}`,
    buildUser: (input, context) => `TASK: ${input.task}

${context}

Explore the codebase using your tools. When done, call submit_result with your findings.`
  },

  web_research: {
    system: `You are a technical research specialist.

Given a task requiring external knowledge, provide relevant findings from your training data.

NOTE: You don't have actual web access or tools for this task. Provide information from your training data, clearly noting any limitations.

OUTPUT FORMAT (respond with valid JSON only, no other text):
{
  "findings": [
    {"topic": "what was researched", "summary": "key information", "source": "documentation/common knowledge", "relevance": "high|medium|low"}
  ],
  "recommendations": [
    {"action": "what to do", "rationale": "why"}
  ],
  "unknowns": ["things that couldn't be determined"],
  "confidence": 0-100
}`,
    buildUser: (input) => `TASK: ${input.task}

SPECIFIC RESEARCH NEEDS:
${input.researchQueries ? (Array.isArray(input.researchQueries) ? input.researchQueries.join('\n') : input.researchQueries) : 'General research for the task.'}

${input.projectContext ? `PROJECT CONTEXT:\n${input.projectContext}` : ''}

Respond with valid JSON only. No explanatory text before or after.`
  },

  documentation_reading: {
    system: `You are a documentation analyst specializing in extracting actionable information.

Use your tools to find and read documentation, then extract information relevant to the task.

TOOLS AVAILABLE:
- glob(pattern): Find documentation files (*.md, docs/*)
- read(path): Read documentation content
- grep(pattern, path?): Search for specific topics in docs
- submit_result(result, confidence): Submit your final findings (REQUIRED as final step)

WORKFLOW:
1. Use glob to find documentation files
2. Read relevant documentation
3. Extract information applicable to the task
4. Call submit_result with your findings

RULES:
1. Focus on sections RELEVANT to the specific task
2. Extract concrete examples, not just descriptions
3. Note any warnings, deprecations, or gotchas
4. Preserve API signatures exactly as documented
5. MUST call submit_result when done - do not output raw JSON

RESULT FORMAT (pass to submit_result):
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
  "warnings": ["important caveats"]
}`,
    buildUser: (input, context) => `TASK: ${input.task}

${context}

Explore the documentation using your tools. When done, call submit_result with your findings.`
  }
};

// ============================================================================
// Test Harness Class
// ============================================================================

export class HaikuTestHarness {
  private anthropicClient?: Anthropic;
  private openaiClient?: OpenAI;
  private groundTruth: GroundTruth;
  private projectRoot: string;
  private options: CLIOptions;
  private modelConfig: ModelConfig;

  constructor(apiKey: string, projectRoot: string, options: CLIOptions) {
    this.projectRoot = projectRoot;
    this.options = options;
    this.groundTruth = this.loadGroundTruth();

    // Get model config
    this.modelConfig = MODEL_CONFIGS[options.model] || MODEL_CONFIGS['haiku'];

    // Initialize appropriate client
    if (this.modelConfig.provider === 'anthropic') {
      this.anthropicClient = new Anthropic({ apiKey });
    } else {
      this.openaiClient = new OpenAI({
        apiKey,
        baseURL: this.modelConfig.baseURL
      });
    }
  }

  private loadGroundTruth(): GroundTruth {
    const gtPath = path.join(this.projectRoot, 'test', 'ground-truth.json');
    const content = fs.readFileSync(gtPath, 'utf-8');
    return JSON.parse(content);
  }

  private resolveProjectRoot(testCase: TestCase): string {
    if (testCase.codebase) {
      // Synthetic codebases are in test/synthetic/
      if (testCase.codebase.startsWith('synthetic/')) {
        return path.join(this.projectRoot, 'test', testCase.codebase);
      }
      // "forge-engine" means the actual project root
      if (testCase.codebase === 'forge-engine') {
        return this.projectRoot;
      }
      // Other codebases assumed to be in test/synthetic/
      return path.join(this.projectRoot, 'test', 'synthetic', testCase.codebase);
    } else if (testCase.input.projectRoot === '.' || !testCase.input.projectRoot) {
      return this.projectRoot;
    } else {
      const inputRoot = testCase.input.projectRoot as string;
      return path.join(this.projectRoot, inputRoot);
    }
  }

  async runAllTests(): Promise<ValidationResults> {
    const results: TestResult[] = [];
    const byWorker: Record<string, WorkerResults> = {};

    // Filter test cases based on CLI options
    let testCases: Array<{ workerType: string; operationType: string; testCase: TestCase }> = [];

    for (const [workerType, suite] of Object.entries(this.groundTruth.workers)) {
      if (this.options.worker && workerType !== this.options.worker) continue;

      for (const testCase of suite.testCases) {
        if (this.options.test && testCase.id !== this.options.test) continue;
        testCases.push({ workerType, operationType: suite.operationType, testCase });
      }
    }

    // Apply limit
    if (this.options.limit && testCases.length > this.options.limit) {
      testCases = testCases.slice(0, this.options.limit);
    }

    console.log(`\n[Harness] Running ${testCases.length} test(s)...`);

    for (const { workerType, operationType, testCase } of testCases) {
      if (!byWorker[workerType]) {
        byWorker[workerType] = { total: 0, passed: 0, parseSuccess: 0, avgLatencyMs: 0 };
      }
      byWorker[workerType].total++;

      const result = await this.runTestCase(workerType, operationType, testCase);
      results.push(result);

      if (result.passed) byWorker[workerType].passed++;
      if (result.parseSuccess) byWorker[workerType].parseSuccess++;

      const status = result.passed ? '✓' : '✗';
      console.log(`  ${status} ${testCase.id}: ${result.passed ? 'PASS' : 'FAIL'} (${result.latencyMs}ms, ${result.toolCalls.length} tool calls)`);
    }

    // Calculate aggregate metrics
    const totalTests = results.length;
    const passedTests = results.filter(r => r.passed).length;
    const parseSuccesses = results.filter(r => r.parseSuccess).length;
    const parseSuccessRate = totalTests > 0 ? parseSuccesses / totalTests : 0;
    const accuracyRate = totalTests > 0 ? passedTests / totalTests : 0;

    // Calculate P95 latency
    const latencies = results.map(r => r.latencyMs).sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);
    const p95LatencyMs = latencies[p95Index] || latencies[latencies.length - 1] || 0;

    // Update avgLatencyMs per worker
    for (const workerType of Object.keys(byWorker)) {
      const workerResults = results.filter(r => r.workerType === workerType);
      const totalLatency = workerResults.reduce((sum, r) => sum + r.latencyMs, 0);
      byWorker[workerType].avgLatencyMs = workerResults.length > 0 ? totalLatency / workerResults.length : 0;
    }

    // Check gate
    const gatePass =
      parseSuccessRate >= this.groundTruth.thresholds.parseSuccessRate &&
      accuracyRate >= this.groundTruth.thresholds.accuracyRate &&
      p95LatencyMs <= this.groundTruth.thresholds.p95LatencyMs;

    return {
      totalTests,
      passedTests,
      parseSuccessRate,
      accuracyRate,
      p95LatencyMs,
      gatePass,
      byWorker,
      results
    };
  }

  async runTestCase(workerType: string, operationType: string, testCase: TestCase): Promise<TestResult> {
    const startTime = Date.now();
    const prompt = WORKER_PROMPTS[operationType];
    const toolCalls: ToolCallRecord[] = [];

    if (!prompt) {
      return {
        testId: testCase.id,
        workerType,
        name: testCase.name,
        passed: false,
        parseSuccess: false,
        accuracyScore: 0,
        latencyMs: 0,
        toolCalls,
        error: `Unknown operation type: ${operationType}`
      };
    }

    // Resolve the actual project path for this test
    const testProjectRoot = this.resolveProjectRoot(testCase);

    // Build minimal context
    const context = buildMinimalContext(testProjectRoot);
    const summary = getProjectSummary(testProjectRoot);
    const fullContext = `${summary}\n\n${context}`;

    // Build user message
    const userMessage = prompt.buildUser(testCase.input, fullContext);

    if (this.options.verbose) {
      this.logVerboseHeader(testCase, workerType, testProjectRoot);
      console.log('CONTEXT PROVIDED:');
      console.log(fullContext);
      console.log('-'.repeat(60));
      console.log('USER MESSAGE:');
      console.log(userMessage.slice(0, 500) + (userMessage.length > 500 ? '...' : ''));
      console.log('-'.repeat(60));
    }

    if (this.options.dryRun) {
      console.log('[DRY RUN] Would call Claude API here');
      console.log('-'.repeat(60));
      return {
        testId: testCase.id,
        workerType,
        name: testCase.name,
        passed: false,
        parseSuccess: false,
        accuracyScore: 0,
        latencyMs: Date.now() - startTime,
        toolCalls,
        rawOutput: '[DRY RUN - no API call made]'
      };
    }

    try {
      // Determine if this worker type uses tools
      const usesTools = operationType !== 'web_research';

      // Run the worker with tool_use loop
      const result = usesTools
        ? await this.runWorkerWithTools(prompt.system, userMessage, testProjectRoot, toolCalls)
        : await this.runWorkerWithoutTools(prompt.system, userMessage);

      const latencyMs = Date.now() - startTime;

      if (this.options.verbose) {
        console.log(`TOOL CALLS (${toolCalls.length}):`);
        for (const tc of toolCalls) {
          console.log(`  - ${tc.name}(${JSON.stringify(tc.input)})`);
          console.log(`    → ${tc.output.slice(0, 100)}${tc.output.length > 100 ? '...' : ''}`);
        }
        console.log('-'.repeat(60));
        console.log('RAW OUTPUT:');
        console.log(result.rawOutput);
        console.log('-'.repeat(60));
      }

      // Calculate accuracy
      const accuracyScore = result.parseSuccess
        ? this.calculateAccuracy(result.parsedOutput, testCase.expectedOutput, testCase.accuracyMetric)
        : 0;

      const passed = result.parseSuccess && accuracyScore >= (testCase.accuracyMetric.threshold || 0.7);

      if (this.options.verbose) {
        console.log(`ACCURACY: ${(accuracyScore * 100).toFixed(1)}% (threshold: ${((testCase.accuracyMetric.threshold || 0.7) * 100).toFixed(0)}%)`);
        console.log(`RESULT: ${passed ? '✓ PASS' : '✗ FAIL'}`);
        console.log('='.repeat(60));
      }

      return {
        testId: testCase.id,
        workerType,
        name: testCase.name,
        passed,
        parseSuccess: result.parseSuccess,
        accuracyScore,
        latencyMs,
        toolCalls,
        rawOutput: result.rawOutput,
        parsedOutput: result.parsedOutput
      };
    } catch (error) {
      return {
        testId: testCase.id,
        workerType,
        name: testCase.name,
        passed: false,
        parseSuccess: false,
        accuracyScore: 0,
        latencyMs: Date.now() - startTime,
        toolCalls,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async runWorkerWithTools(
    systemPrompt: string,
    userMessage: string,
    testProjectRoot: string,
    toolCalls: ToolCallRecord[]
  ): Promise<{ rawOutput: string; parseSuccess: boolean; parsedOutput: unknown }> {
    if (this.modelConfig.provider === 'anthropic') {
      return this.runWorkerWithToolsAnthropic(systemPrompt, userMessage, testProjectRoot, toolCalls);
    } else {
      return this.runWorkerWithToolsOpenAI(systemPrompt, userMessage, testProjectRoot, toolCalls);
    }
  }

  private async runWorkerWithToolsAnthropic(
    systemPrompt: string,
    userMessage: string,
    testProjectRoot: string,
    toolCalls: ToolCallRecord[]
  ): Promise<{ rawOutput: string; parseSuccess: boolean; parsedOutput: unknown }> {
    const messages: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }];
    const maxIterations = 15;

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.anthropicClient!.messages.create({
        model: this.modelConfig.id,
        max_tokens: 4096,
        temperature: 0,
        system: systemPrompt,
        messages,
        tools: WORKER_TOOLS
      });

      // Check if there are tool uses
      const toolUseBlocks = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      // Check for submit_result - this is our structured output!
      const submitResult = toolUseBlocks.find(block => block.name === 'submit_result');
      if (submitResult) {
        const input = submitResult.input as { result: unknown; confidence: number };

        toolCalls.push({
          name: 'submit_result',
          input: input as unknown as ToolInput,
          output: '[Final result submitted]'
        });

        // The result is already parsed JSON - no parsing needed!
        return {
          rawOutput: JSON.stringify(input.result, null, 2),
          parseSuccess: true,
          parsedOutput: input.result
        };
      }

      // If no tool uses at all, try to parse text output (fallback)
      if (toolUseBlocks.length === 0) {
        const textBlocks = response.content.filter(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );
        const textOutput = textBlocks.map(b => b.text).join('');
        return this.parseWorkerOutput(textOutput);
      }

      // Handle exploration tool calls (glob, read, grep)
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const toolUse of toolUseBlocks) {
        const input = toolUse.input as ToolInput;
        const result = executeTool(toolUse.name, input, testProjectRoot);

        toolCalls.push({
          name: toolUse.name,
          input,
          output: result.success ? result.output : `Error: ${result.error}`
        });

        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content: result.success ? result.output : `Error: ${result.error}`
        });
      }

      // Add assistant response and tool results to conversation
      messages.push({ role: 'assistant', content: response.content });
      messages.push({ role: 'user', content: toolResults });
    }

    // Max iterations reached
    return {
      rawOutput: '[Max iterations reached without final output]',
      parseSuccess: false,
      parsedOutput: undefined
    };
  }

  private async runWorkerWithToolsOpenAI(
    systemPrompt: string,
    userMessage: string,
    testProjectRoot: string,
    toolCalls: ToolCallRecord[]
  ): Promise<{ rawOutput: string; parseSuccess: boolean; parsedOutput: unknown }> {
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage }
    ];
    const maxIterations = 15;

    for (let i = 0; i < maxIterations; i++) {
      const response = await this.openaiClient!.chat.completions.create({
        model: this.modelConfig.id,
        max_tokens: 4096,
        temperature: 0,
        messages,
        tools: OPENAI_TOOLS
      });

      const choice = response.choices[0];
      const message = choice.message;

      // Check for tool calls
      if (message.tool_calls && message.tool_calls.length > 0) {
        // Filter to function tool calls only
        const functionCalls = message.tool_calls.filter(
          (tc): tc is OpenAI.ChatCompletionMessageToolCall & { type: 'function' } => tc.type === 'function'
        );

        // Check for submit_result
        const submitCall = functionCalls.find(tc => tc.function.name === 'submit_result');
        if (submitCall) {
          try {
            const input = JSON.parse(submitCall.function.arguments) as { result: unknown; confidence: number };

            toolCalls.push({
              name: 'submit_result',
              input: input as unknown as ToolInput,
              output: '[Final result submitted]'
            });

            return {
              rawOutput: JSON.stringify(input.result, null, 2),
              parseSuccess: true,
              parsedOutput: input.result
            };
          } catch {
            // Parse error on submit_result
          }
        }

        // Handle exploration tool calls
        const toolResults: OpenAI.ChatCompletionToolMessageParam[] = [];

        for (const toolCall of functionCalls) {
          try {
            const input = JSON.parse(toolCall.function.arguments) as ToolInput;
            const result = executeTool(toolCall.function.name, input, testProjectRoot);

            toolCalls.push({
              name: toolCall.function.name,
              input,
              output: result.success ? result.output : `Error: ${result.error}`
            });

            toolResults.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result.success ? result.output : `Error: ${result.error}`
            });
          } catch (err) {
            toolResults.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Error parsing arguments: ${err}`
            });
          }
        }

        // Add assistant message and tool results
        messages.push({ role: 'assistant', content: message.content, tool_calls: message.tool_calls });
        messages.push(...toolResults);
      } else {
        // No tool calls - try to parse text output
        const textOutput = message.content || '';
        return this.parseWorkerOutput(textOutput);
      }
    }

    // Max iterations reached
    return {
      rawOutput: '[Max iterations reached without final output]',
      parseSuccess: false,
      parsedOutput: undefined
    };
  }

  private async runWorkerWithoutTools(
    systemPrompt: string,
    userMessage: string
  ): Promise<{ rawOutput: string; parseSuccess: boolean; parsedOutput: unknown }> {
    if (this.modelConfig.provider === 'anthropic') {
      const response = await this.anthropicClient!.messages.create({
        model: this.modelConfig.id,
        max_tokens: 4096,
        temperature: 0,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }]
      });

      const rawOutput = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map(block => block.text)
        .join('');

      return this.parseWorkerOutput(rawOutput);
    } else {
      const response = await this.openaiClient!.chat.completions.create({
        model: this.modelConfig.id,
        max_tokens: 4096,
        temperature: 0,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage }
        ]
      });

      const rawOutput = response.choices[0].message.content || '';
      return this.parseWorkerOutput(rawOutput);
    }
  }

  private parseWorkerOutput(rawOutput: string): { rawOutput: string; parseSuccess: boolean; parsedOutput: unknown } {
    // Strategy 1: Extract JSON from markdown code blocks
    const codeBlockMatch = rawOutput.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
      try {
        const parsedOutput = JSON.parse(codeBlockMatch[1].trim());
        return { rawOutput, parseSuccess: true, parsedOutput };
      } catch { /* continue to next strategy */ }
    }

    // Strategy 2: Find JSON object in the output (text + JSON pattern)
    const jsonObjectMatch = rawOutput.match(/\{[\s\S]*\}/);
    if (jsonObjectMatch) {
      try {
        const parsedOutput = JSON.parse(jsonObjectMatch[0]);
        return { rawOutput, parseSuccess: true, parsedOutput };
      } catch { /* continue to next strategy */ }
    }

    // Strategy 3: Try parsing as-is (pure JSON)
    try {
      const parsedOutput = JSON.parse(rawOutput.trim());
      return { rawOutput, parseSuccess: true, parsedOutput };
    } catch {
      return { rawOutput, parseSuccess: false, parsedOutput: undefined };
    }
  }

  private logVerboseHeader(testCase: TestCase, workerType: string, projectRoot: string): void {
    console.log('='.repeat(60));
    console.log(`TEST: ${testCase.id} - ${testCase.name}`);
    console.log(`WORKER: ${workerType}`);
    console.log(`PROJECT ROOT: ${projectRoot}`);
    console.log('-'.repeat(60));
  }

  private calculateAccuracy(
    actual: unknown,
    expected: Record<string, unknown>,
    metric: AccuracyMetric
  ): number {
    try {
      switch (metric.type) {
        case 'jaccard_similarity':
          return this.jaccardSimilarity(actual, expected, metric.fields || []);

        case 'must_include':
          return this.mustInclude(actual, metric.requiredPaths || metric.requiredItems || []);

        case 'pattern_overlap':
          return this.patternOverlap(actual, metric.requiredPatterns || []);

        case 'edge_precision':
          return this.edgePrecision(actual, expected);

        case 'constraint_recall':
          return this.constraintRecall(actual, metric.requiredConstraints || []);

        case 'relevant_info_present':
          return this.relevantInfoPresent(actual, metric.requiredTopics || []);

        case 'info_extraction':
          return this.infoExtraction(actual, metric.requiredInfo || []);

        case 'recall':
        case 'accuracy':
          return this.generalRecall(actual, expected, metric.threshold || 0.7);

        default:
          return 0;
      }
    } catch {
      return 0;
    }
  }

  private jaccardSimilarity(actual: unknown, expected: Record<string, unknown>, fields: string[]): number {
    if (!actual || typeof actual !== 'object') return 0;

    const actualObj = actual as Record<string, unknown>;
    let totalScore = 0;

    for (const field of fields) {
      const [root, prop] = field.split('.');
      const actualArr = this.extractArray(actualObj, root, prop);
      const expectedArr = this.extractArray(expected, root, prop);

      if (actualArr.length === 0 && expectedArr.length === 0) {
        totalScore += 1;
        continue;
      }

      const actualSet = new Set(actualArr.map(s => s.toLowerCase()));
      const expectedSet = new Set(expectedArr.map(s => s.toLowerCase()));

      const intersection = [...actualSet].filter(x => expectedSet.has(x)).length;
      const union = new Set([...actualSet, ...expectedSet]).size;

      totalScore += union > 0 ? intersection / union : 0;
    }

    return fields.length > 0 ? totalScore / fields.length : 0;
  }

  private extractArray(obj: Record<string, unknown>, root: string, prop?: string): string[] {
    const arr = obj[root];
    if (!Array.isArray(arr)) return [];

    if (prop) {
      return arr.map(item => {
        if (typeof item === 'object' && item !== null) {
          return String((item as Record<string, unknown>)[prop] || '');
        }
        return '';
      }).filter(Boolean);
    }

    return arr.map(String);
  }

  private mustInclude(actual: unknown, required: string[]): number {
    if (!actual || typeof actual !== 'object') return 0;

    const actualStr = JSON.stringify(actual).toLowerCase();
    let found = 0;

    for (const item of required) {
      if (actualStr.includes(item.toLowerCase())) {
        found++;
      }
    }

    return required.length > 0 ? found / required.length : 0;
  }

  private patternOverlap(actual: unknown, requiredPatterns: string[]): number {
    if (!actual || typeof actual !== 'object') return 0;

    const actualStr = JSON.stringify(actual).toLowerCase();
    let found = 0;

    for (const pattern of requiredPatterns) {
      if (actualStr.includes(pattern.toLowerCase())) {
        found++;
      }
    }

    return requiredPatterns.length > 0 ? found / requiredPatterns.length : 0;
  }

  private edgePrecision(actual: unknown, expected: Record<string, unknown>): number {
    if (!actual || typeof actual !== 'object') return 0;

    const actualObj = actual as Record<string, unknown>;
    const actualDeps = actualObj.dependencies as Array<{ source: string; targets: string[] }> || [];
    const expectedDeps = expected.dependencies as Array<{ source: string; targets: string[] }> || [];

    if (actualDeps.length === 0 && expectedDeps.length === 0) return 1;
    if (actualDeps.length === 0) return 0;

    const actualEdges = new Set<string>();
    const expectedEdges = new Set<string>();

    for (const dep of actualDeps) {
      for (const target of dep.targets) {
        actualEdges.add(`${dep.source}->${target}`.toLowerCase());
      }
    }

    for (const dep of expectedDeps) {
      for (const target of dep.targets) {
        expectedEdges.add(`${dep.source}->${target}`.toLowerCase());
      }
    }

    const intersection = [...actualEdges].filter(e => expectedEdges.has(e)).length;
    return actualEdges.size > 0 ? intersection / actualEdges.size : 0;
  }

  private constraintRecall(actual: unknown, requiredConstraints: string[]): number {
    return this.mustInclude(actual, requiredConstraints);
  }

  private relevantInfoPresent(actual: unknown, requiredTopics: string[]): number {
    return this.mustInclude(actual, requiredTopics);
  }

  private infoExtraction(actual: unknown, requiredInfo: string[]): number {
    return this.mustInclude(actual, requiredInfo);
  }

  private generalRecall(actual: unknown, expected: Record<string, unknown>, _threshold: number): number {
    const actualStr = JSON.stringify(actual).toLowerCase();
    const expectedStr = JSON.stringify(expected).toLowerCase();

    const actualTokens = new Set(actualStr.split(/\W+/).filter(t => t.length > 2));
    const expectedTokens = new Set(expectedStr.split(/\W+/).filter(t => t.length > 2));

    const intersection = [...expectedTokens].filter(t => actualTokens.has(t)).length;
    return expectedTokens.size > 0 ? intersection / expectedTokens.size : 0;
  }

  generateReport(results: ValidationResults): string {
    const lines: string[] = [];

    lines.push('# Phase 0 Haiku Validation Results');
    lines.push('');
    lines.push(`**Date**: ${new Date().toISOString()}`);
    lines.push(`**Model**: ${this.modelConfig.id}`);
    lines.push(`**Provider**: ${this.modelConfig.displayName}`);
    lines.push(`**Mode**: Tool-use (production pattern)`);
    lines.push('');

    lines.push('## Gate Status');
    lines.push('');
    lines.push(`**${results.gatePass ? '✅ GATE PASSED' : '❌ GATE FAILED'}**`);
    lines.push('');

    lines.push('| Metric | Value | Threshold | Status |');
    lines.push('|--------|-------|-----------|--------|');
    lines.push(`| Parse Success Rate | ${(results.parseSuccessRate * 100).toFixed(1)}% | ≥${this.groundTruth.thresholds.parseSuccessRate * 100}% | ${results.parseSuccessRate >= this.groundTruth.thresholds.parseSuccessRate ? '✅' : '❌'} |`);
    lines.push(`| Accuracy Rate | ${(results.accuracyRate * 100).toFixed(1)}% | ≥${this.groundTruth.thresholds.accuracyRate * 100}% | ${results.accuracyRate >= this.groundTruth.thresholds.accuracyRate ? '✅' : '❌'} |`);
    lines.push(`| P95 Latency | ${results.p95LatencyMs}ms | ≤${this.groundTruth.thresholds.p95LatencyMs}ms | ${results.p95LatencyMs <= this.groundTruth.thresholds.p95LatencyMs ? '✅' : '❌'} |`);
    lines.push(`| Passed Tests | ${results.passedTests}/${results.totalTests} | ≥${this.groundTruth.thresholds.minPassingTests} | ${results.passedTests >= this.groundTruth.thresholds.minPassingTests ? '✅' : '❌'} |`);
    lines.push('');

    lines.push('## Per-Worker Results');
    lines.push('');
    lines.push('| Worker | Passed | Parse Success | Avg Latency |');
    lines.push('|--------|--------|---------------|-------------|');

    for (const [worker, stats] of Object.entries(results.byWorker)) {
      lines.push(`| ${worker} | ${stats.passed}/${stats.total} | ${stats.parseSuccess}/${stats.total} | ${stats.avgLatencyMs.toFixed(0)}ms |`);
    }
    lines.push('');

    const failedTests = results.results.filter(r => !r.passed);
    if (failedTests.length > 0) {
      lines.push('## Failed Tests');
      lines.push('');

      for (const test of failedTests) {
        lines.push(`### ${test.testId}: ${test.name}`);
        lines.push(`- **Worker**: ${test.workerType}`);
        lines.push(`- **Parse Success**: ${test.parseSuccess ? 'Yes' : 'No'}`);
        lines.push(`- **Accuracy Score**: ${(test.accuracyScore * 100).toFixed(1)}%`);
        lines.push(`- **Tool Calls**: ${test.toolCalls.length}`);
        if (test.error) {
          lines.push(`- **Error**: ${test.error}`);
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }
}

// ============================================================================
// CLI Argument Parsing
// ============================================================================

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);
  const options: CLIOptions = {
    verbose: false,
    dryRun: false,
    model: 'haiku'
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--worker':
        options.worker = args[++i];
        break;
      case '--test':
        options.test = args[++i];
        break;
      case '--limit':
        options.limit = parseInt(args[++i], 10);
        break;
      case '--model':
        options.model = args[++i];
        break;
      case '--verbose':
      case '-v':
        options.verbose = true;
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Usage: npx tsx src/workers/test-harness.ts [options]

Options:
  --worker <name>   Run only tests for specific worker (e.g., FileDiscoveryWorker)
  --test <id>       Run single test by ID (e.g., fd_synthetic_1)
  --limit <n>       Run first N tests only
  --model <name>    Model to use: haiku (default), grok-4-1-fast-reasoning
  --verbose, -v     Show detailed output (context, prompts, responses, tool calls)
  --dry-run         Show what would be sent without calling API
  --help, -h        Show this help message

Models:
  haiku                      Claude 3.5 Haiku (ANTHROPIC_API_KEY)
  grok-4-1-fast-reasoning    Grok 4.1 Fast Reasoning (XAI_API_KEY)
`);
        process.exit(0);
    }
  }

  return options;
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
  const options = parseArgs();

  // Get model config
  const modelConfig = MODEL_CONFIGS[options.model];
  if (!modelConfig) {
    console.error(`Error: Unknown model '${options.model}'. Available: ${Object.keys(MODEL_CONFIGS).join(', ')}`);
    process.exit(1);
  }

  // Get API key for selected model
  const apiKey = process.env[modelConfig.apiKeyEnv];

  if (!options.dryRun && !apiKey) {
    console.error(`Error: ${modelConfig.apiKeyEnv} environment variable required for ${modelConfig.displayName}`);
    process.exit(1);
  }

  const projectRoot = path.resolve(__dirname, '..', '..');
  console.log(`[Harness] Project root: ${projectRoot}`);
  console.log(`[Harness] Model: ${modelConfig.displayName} (${modelConfig.id})`);
  console.log('[Harness] Mode: Tool-use (production pattern)');
  if (options.worker) console.log(`[Harness] Filter: worker=${options.worker}`);
  if (options.test) console.log(`[Harness] Filter: test=${options.test}`);
  if (options.limit) console.log(`[Harness] Limit: ${options.limit}`);
  if (options.verbose) console.log('[Harness] Verbose mode enabled');
  if (options.dryRun) console.log('[Harness] Dry-run mode (no API calls)');

  const harness = new HaikuTestHarness(apiKey || 'dry-run', projectRoot, options);

  console.log('[Harness] Starting validation run...');
  const results = await harness.runAllTests();

  console.log('\n' + '='.repeat(60));
  console.log(harness.generateReport(results));

  // Write results to file
  const reportPath = path.join(projectRoot, 'test', 'haiku-validation-results.md');
  fs.writeFileSync(reportPath, harness.generateReport(results));
  console.log(`\n[Harness] Report written to: ${reportPath}`);

  process.exit(results.gatePass ? 0 : 1);
}

// Run if executed directly
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);

if (isMainModule) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export type { ValidationResults, TestResult, CLIOptions };
