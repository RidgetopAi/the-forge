/**
 * Preparation Department
 *
 * The critical one. Produces ContextPackage for execution.
 *
 * Structure:
 * - Foreman (Sonnet-tier): Coordinates workers, synthesizes results, gates quality
 * - Workers (Haiku-tier): Specialized tasks - file discovery, pattern extraction, etc.
 *
 * This prototype implements the 7-phase protocol from SIRK Pass #1.
 */

import { ContextPackage, ProjectType, HistoricalContext } from '../types.js';
import { taskManager } from '../state.js';
import { mandrel } from '../mandrel.js';
import { createLearningRetriever, LearningRetriever } from '../learning.js';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';

// Phase 4: LLM-based workers (replacing shell-command workers)
import { TierRouter } from '../tiers.js';
import {
  FileDiscoveryWorker as LLMFileDiscoveryWorker,
  PatternExtractionWorker as LLMPatternExtractionWorker,
  DependencyMapperWorker as LLMDependencyMapperWorker,
  ConstraintIdentifierWorker as LLMConstraintIdentifierWorker,
  WebResearchWorker as LLMWebResearchWorker,
  DocumentationReaderWorker as LLMDocumentationReaderWorker,
  FileDiscoveryOutput,
  PatternExtractionOutput,
  DependencyMappingOutput,
  ConstraintIdentificationOutput,
  WebResearchOutput,
  DocumentationReadingOutput,
} from '../workers/index.js';

const execAsync = promisify(exec);

// ============================================================================
// Phase 4: Worker Results Type
// ============================================================================

/**
 * Aggregated results from all LLM workers.
 * Used to collect output from wave-based parallel execution.
 */
interface WorkerResultsType {
  // Wave 1 results
  fileDiscovery?: FileDiscoveryOutput;
  constraintIdentification?: ConstraintIdentificationOutput;
  // Wave 2 results
  patternExtraction?: PatternExtractionOutput;
  dependencyMapping?: DependencyMappingOutput;
  // Wave 3 results (optional)
  webResearch?: WebResearchOutput;
  documentationReading?: DocumentationReadingOutput;
  // Aggregated metrics
  metrics: {
    totalInputTokens: number;
    totalOutputTokens: number;
    totalCostUsd: number;
    totalLatencyMs: number;
    workerCounts: { succeeded: number; failed: number };
  };
}

// ============================================================================
// Task Type Detection & Content Generation (i[10] contribution)
// ============================================================================

/**
 * Task types for content-aware preparation.
 *
 * i[10] contribution: Previous passes made file discovery task-type-aware (i[9]),
 * but content generation (acceptance criteria, constraints, patterns) was still
 * code-centric for all tasks. This led to nonsensical preparations like:
 * - "add a README" → acceptance: "TypeScript compilation must pass"
 *
 * This enum enables task-type-aware CONTENT generation, not just file discovery.
 */
type TaskContentType = 'documentation' | 'testing' | 'configuration' | 'code';

/**
 * Generated content for a task type.
 */
interface TaskTypeContent {
  taskType: TaskContentType;
  acceptanceCriteria: string[];
  qualityConstraints: string[];
  patterns: {
    conventions: string;
    organization: string;
    quality: string;
  };
}

/**
 * TaskTypeContentGenerator
 *
 * i[10] contribution: Generates task-type-appropriate content for ContextPackages.
 *
 * This fixes the problem identified by i[9]: the LLM quality evaluation scored
 * 45/100 for a README task because acceptance criteria said "Code compiles"
 * and constraints said "TypeScript compilation must pass".
 *
 * Now:
 * - Documentation tasks → Markdown patterns, readability criteria
 * - Testing tasks → Test coverage, assertion patterns
 * - Configuration tasks → Validation, compatibility criteria
 * - Code tasks → Compilation, type safety (the previous default)
 */
class TaskTypeContentGenerator {
  /**
   * Detect the task type from the request description.
   *
   * Reuses detection patterns from FileDiscoveryWorker (i[9]) for consistency.
   */
  detectTaskType(taskDescription: string): TaskContentType {
    const lower = taskDescription.toLowerCase();

    // Documentation detection
    if (lower.includes('readme') ||
        lower.includes('documentation') ||
        lower.includes('docs') ||
        lower.includes('comment') ||
        lower.includes('document') ||
        lower.includes('api docs') ||
        lower.includes('jsdoc') ||
        lower.includes('tsdoc')) {
      return 'documentation';
    }

    // Testing detection
    if (lower.includes('test') ||
        lower.includes('spec') ||
        lower.includes('coverage') ||
        lower.includes('unit test') ||
        lower.includes('integration test') ||
        lower.includes('e2e')) {
      return 'testing';
    }

    // Configuration detection
    if (lower.includes('config') ||
        lower.includes('setting') ||
        lower.includes('setup') ||
        lower.includes('environment') ||
        lower.includes('env') ||
        lower.includes('.json') ||
        lower.includes('.yaml') ||
        lower.includes('.yml') ||
        lower.includes('tsconfig') ||
        lower.includes('eslint') ||
        lower.includes('prettier')) {
      return 'configuration';
    }

    // Default to code
    return 'code';
  }

  /**
   * Generate task-type-appropriate content.
   */
  generate(taskDescription: string): TaskTypeContent {
    const taskType = this.detectTaskType(taskDescription);

    switch (taskType) {
      case 'documentation':
        return this.generateDocumentationContent(taskDescription);
      case 'testing':
        return this.generateTestingContent(taskDescription);
      case 'configuration':
        return this.generateConfigurationContent(taskDescription);
      case 'code':
      default:
        return this.generateCodeContent(taskDescription);
    }
  }

  /**
   * Documentation task content (README, docs, comments)
   */
  private generateDocumentationContent(taskDescription: string): TaskTypeContent {
    const lower = taskDescription.toLowerCase();
    const criteria: string[] = [];

    // Base documentation criteria
    if (lower.includes('readme')) {
      criteria.push('README.md file exists');
      criteria.push('README has required sections (description, usage, installation)');
    } else {
      criteria.push('Documentation file(s) created or updated');
    }

    criteria.push('Documentation is clear and readable');
    criteria.push('All links are valid (no broken links)');
    criteria.push('Code examples are accurate and runnable');

    return {
      taskType: 'documentation',
      acceptanceCriteria: criteria,
      qualityConstraints: [
        'Valid Markdown syntax',
        'Consistent heading hierarchy (h1 → h2 → h3)',
        'Accurate and up-to-date information',
        'No spelling or grammar errors',
      ],
      patterns: {
        conventions: 'Markdown formatting conventions',
        organization: 'Logical section ordering (overview → details → examples)',
        quality: 'Clear, concise writing with code examples where appropriate',
      },
    };
  }

  /**
   * Testing task content (tests, specs, coverage)
   */
  private generateTestingContent(taskDescription: string): TaskTypeContent {
    const lower = taskDescription.toLowerCase();
    const criteria: string[] = [];

    criteria.push('All tests pass');
    criteria.push('Test coverage maintained or improved');

    if (lower.includes('new test') || lower.includes('add test')) {
      criteria.push('New test file(s) created in correct location');
      criteria.push('Tests follow project naming conventions');
    }

    if (lower.includes('fix') || lower.includes('broken')) {
      criteria.push('Previously failing test now passes');
    }

    criteria.push('No flaky tests introduced');

    return {
      taskType: 'testing',
      acceptanceCriteria: criteria,
      qualityConstraints: [
        'Use project test framework (Jest/Vitest/Mocha)',
        'Follow Arrange-Act-Assert pattern',
        'Tests are isolated (no shared state)',
        'Descriptive test names explaining expected behavior',
      ],
      patterns: {
        conventions: 'describe/it blocks with clear naming (*.test.ts or *.spec.ts)',
        organization: 'Tests co-located with source or in __tests__ directory',
        quality: 'Fast, deterministic, independent tests',
      },
    };
  }

  /**
   * Configuration task content (config files, settings)
   */
  private generateConfigurationContent(taskDescription: string): TaskTypeContent {
    const criteria: string[] = [];

    criteria.push('Configuration file is valid (parseable JSON/YAML/etc)');
    criteria.push('Application starts successfully with new configuration');
    criteria.push('Configuration changes take effect as expected');

    return {
      taskType: 'configuration',
      acceptanceCriteria: criteria,
      qualityConstraints: [
        'Backward compatible (existing workflows not broken)',
        'New options documented (inline comments or README)',
        'Sensible defaults for optional settings',
        'Validation for required settings',
      ],
      patterns: {
        conventions: 'Match existing config file format and structure',
        organization: 'Group related settings, use comments for sections',
        quality: 'Environment-specific overrides where appropriate',
      },
    };
  }

  /**
   * Code task content (features, bugfixes, refactors) - the original default
   */
  private generateCodeContent(taskDescription: string): TaskTypeContent {
    const lower = taskDescription.toLowerCase();
    const criteria: string[] = [];

    // Base code criteria
    criteria.push('Code compiles without errors');
    criteria.push('Functionality works as described');

    if (lower.includes('test')) {
      criteria.push('Tests pass');
    }

    if (lower.includes('error') || lower.includes('bug')) {
      criteria.push('Error no longer occurs');
    }

    return {
      taskType: 'code',
      acceptanceCriteria: criteria,
      qualityConstraints: [
        'TypeScript compilation must pass',
        'Existing tests must pass',
        'No new linting errors',
      ],
      patterns: {
        conventions: 'camelCase (TypeScript default)',
        organization: 'ES Modules with clear imports/exports',
        quality: 'Type-safe, error handling, follows existing patterns',
      },
    };
  }
}

// ============================================================================
// Worker Results (what workers produce)
// ============================================================================

interface FileDiscoveryResult {
  relevantFiles: Array<{
    path: string;
    reason: string;
    priority: 'high' | 'medium' | 'low';
  }>;
  directoryStructure: string;
}

interface PatternExtractionResult {
  namingConventions: string;
  fileOrganization: string;
  testingApproach: string;
  errorHandling: string;
  codeStyle: string[];
}

interface ArchitectureAnalysisResult {
  overview: string;
  components: Array<{
    name: string;
    purpose: string;
    location: string;
    entryPoints?: string[];
  }>;
  dependencies: string[];
  dataFlow?: string;
}

// ============================================================================
// Preparation Foreman
// ============================================================================

export class PreparationForeman {
  private instanceId: string;
  private learningRetriever: LearningRetriever;
  // INTEGRATION-5: Removed shell-based workers (FileDiscoveryWorker, PatternExtractionWorker, ArchitectureAnalysisWorker)
  // Now using LLM-based workers exclusively via TierRouter

  // LLM-based workers via TierRouter
  private tierRouter: TierRouter;
  private llmWorkers: {
    fileDiscovery: LLMFileDiscoveryWorker;
    patternExtraction: LLMPatternExtractionWorker;
    dependencyMapper: LLMDependencyMapperWorker;
    constraintIdentifier: LLMConstraintIdentifierWorker;
    webResearch: LLMWebResearchWorker;
    documentationReader: LLMDocumentationReaderWorker;
  };

  constructor(instanceId: string, tierRouter?: TierRouter) {
    this.instanceId = instanceId;
    this.learningRetriever = createLearningRetriever(instanceId);

    // INTEGRATION-5: Removed shell-based worker initialization
    // Initialize TierRouter and LLM workers
    this.tierRouter = tierRouter ?? new TierRouter();
    this.llmWorkers = {
      fileDiscovery: new LLMFileDiscoveryWorker(this.tierRouter),
      patternExtraction: new LLMPatternExtractionWorker(this.tierRouter),
      dependencyMapper: new LLMDependencyMapperWorker(this.tierRouter),
      constraintIdentifier: new LLMConstraintIdentifierWorker(this.tierRouter),
      webResearch: new LLMWebResearchWorker(this.tierRouter),
      documentationReader: new LLMDocumentationReaderWorker(this.tierRouter),
    };
  }

  /**
   * Get historical context for a task.
   *
   * INTEGRATION-1: Exposed for index.ts to pass to prepareWithLLM.
   * Previously only used internally by prepare().
   */
  async getHistoricalContext(
    taskDescription: string,
    projectPath: string
  ): Promise<HistoricalContext> {
    return this.learningRetriever.retrieve(taskDescription, projectPath);
  }

  // ============================================================================
  // Phase 4: Wave-Based Parallel Worker Dispatch
  // ============================================================================

  /**
   * Results from all LLM workers, collected by wave.
   */
  private workerResults?: WorkerResultsType;

  /**
   * Execute LLM workers in parallel waves.
   *
   * Wave 1 (Independent - run in parallel):
   * - FileDiscoveryWorker: Discovers relevant files
   * - ConstraintIdentifierWorker: Identifies project constraints
   *
   * Wave 2 (Depends on Wave 1 - run in parallel):
   * - PatternExtractionWorker: Extracts coding patterns (needs fileDiscovery results)
   * - DependencyMapperWorker: Maps file dependencies (needs fileDiscovery results)
   *
   * Wave 3 (Optional, based on task type):
   * - WebResearchWorker: If task needs external research
   * - DocumentationReaderWorker: If task has documentation to analyze
   *
   * @param taskDescription - The task to prepare for
   * @param projectPath - Root path of the project
   * @param options - Optional configuration for wave execution
   */
  async executeWaveBasedWorkers(
    taskDescription: string,
    projectPath: string,
    options?: {
      needsWebResearch?: boolean;
      documentation?: string;
    }
  ): Promise<{
    success: boolean;
    results?: WorkerResultsType;
    error?: string;
  }> {
    console.log('[Foreman:Preparation] Starting wave-based worker dispatch');

    // Initialize metrics
    const metrics = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCostUsd: 0,
      totalLatencyMs: 0,
      workerCounts: { succeeded: 0, failed: 0 },
    };

    const results: NonNullable<typeof this.workerResults> = { metrics };

    // Helper to accumulate metrics
    const accumulateMetrics = (workerMetrics: {
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      latencyMs: number;
    }) => {
      metrics.totalInputTokens += workerMetrics.inputTokens;
      metrics.totalOutputTokens += workerMetrics.outputTokens;
      metrics.totalCostUsd += workerMetrics.costUsd;
      metrics.totalLatencyMs += workerMetrics.latencyMs;
    };

    try {
      // =======================================================================
      // Wave 1: Independent workers (run in parallel)
      // =======================================================================
      console.log('[Foreman:Preparation] Wave 1: FileDiscovery + ConstraintIdentifier (parallel)');
      const wave1Start = Date.now();

      const [fileDiscoveryResult, constraintResult] = await Promise.all([
        this.llmWorkers.fileDiscovery.execute({
          task: taskDescription,
          projectRoot: projectPath,
        }),
        this.llmWorkers.constraintIdentifier.execute({
          task: taskDescription,
          projectRoot: projectPath,
        }),
      ]);

      const wave1Duration = Date.now() - wave1Start;
      console.log(`[Foreman:Preparation] Wave 1 completed in ${wave1Duration}ms`);

      // Process Wave 1 results
      if (fileDiscoveryResult.success && fileDiscoveryResult.data) {
        results.fileDiscovery = fileDiscoveryResult.data;
        accumulateMetrics(fileDiscoveryResult.metrics);
        metrics.workerCounts.succeeded++;
        console.log(`[Foreman:Preparation] FileDiscovery: ${results.fileDiscovery.relevantFiles.length} files found`);
      } else {
        metrics.workerCounts.failed++;
        console.warn(`[Foreman:Preparation] FileDiscovery failed: ${fileDiscoveryResult.error}`);
      }

      if (constraintResult.success && constraintResult.data) {
        results.constraintIdentification = constraintResult.data;
        accumulateMetrics(constraintResult.metrics);
        metrics.workerCounts.succeeded++;
        console.log(`[Foreman:Preparation] ConstraintIdentifier: found constraints`);
      } else {
        metrics.workerCounts.failed++;
        console.warn(`[Foreman:Preparation] ConstraintIdentifier failed: ${constraintResult.error}`);
      }

      // =======================================================================
      // Wave 2: Dependent workers (run in parallel, need Wave 1 results)
      // =======================================================================
      console.log('[Foreman:Preparation] Wave 2: PatternExtraction + DependencyMapper (parallel)');
      const wave2Start = Date.now();

      // Build context from Wave 1 results
      const fileListContext = results.fileDiscovery
        ? results.fileDiscovery.relevantFiles.map(f => `- ${f.path}: ${f.reason}`).join('\n')
        : '';

      const [patternResult, dependencyResult] = await Promise.all([
        this.llmWorkers.patternExtraction.execute({
          task: taskDescription,
          projectRoot: projectPath,
          additionalContext: {
            fileList: fileListContext,
          },
        }),
        this.llmWorkers.dependencyMapper.execute({
          task: taskDescription,
          projectRoot: projectPath,
          additionalContext: {
            fileList: fileListContext,
          },
        }),
      ]);

      const wave2Duration = Date.now() - wave2Start;
      console.log(`[Foreman:Preparation] Wave 2 completed in ${wave2Duration}ms`);

      // Process Wave 2 results
      if (patternResult.success && patternResult.data) {
        results.patternExtraction = patternResult.data;
        accumulateMetrics(patternResult.metrics);
        metrics.workerCounts.succeeded++;
        console.log(`[Foreman:Preparation] PatternExtraction: ${results.patternExtraction.patterns.length} patterns found`);
      } else {
        metrics.workerCounts.failed++;
        console.warn(`[Foreman:Preparation] PatternExtraction failed: ${patternResult.error}`);
      }

      if (dependencyResult.success && dependencyResult.data) {
        results.dependencyMapping = dependencyResult.data;
        accumulateMetrics(dependencyResult.metrics);
        metrics.workerCounts.succeeded++;
        console.log(`[Foreman:Preparation] DependencyMapper: ${results.dependencyMapping.dependencies.length} dependencies mapped`);
      } else {
        metrics.workerCounts.failed++;
        console.warn(`[Foreman:Preparation] DependencyMapper failed: ${dependencyResult.error}`);
      }

      // =======================================================================
      // Wave 3: Optional workers (based on task type)
      // =======================================================================
      const wave3Workers: Promise<void>[] = [];

      if (options?.needsWebResearch) {
        console.log('[Foreman:Preparation] Wave 3: WebResearch requested');
        wave3Workers.push(
          this.llmWorkers.webResearch.execute({
            task: taskDescription,
            projectRoot: projectPath,
            additionalContext: {
              researchQueries: taskDescription,
            },
          }).then(result => {
            if (result.success && result.data) {
              results.webResearch = result.data;
              accumulateMetrics(result.metrics);
              metrics.workerCounts.succeeded++;
              console.log(`[Foreman:Preparation] WebResearch: ${results.webResearch.findings.length} findings`);
            } else {
              metrics.workerCounts.failed++;
              console.warn(`[Foreman:Preparation] WebResearch failed: ${result.error}`);
            }
          })
        );
      }

      if (options?.documentation) {
        console.log('[Foreman:Preparation] Wave 3: DocumentationReader requested');
        wave3Workers.push(
          this.llmWorkers.documentationReader.execute({
            task: taskDescription,
            projectRoot: projectPath,
            additionalContext: {
              documentation: options.documentation,
            },
          }).then(result => {
            if (result.success && result.data) {
              results.documentationReading = result.data;
              accumulateMetrics(result.metrics);
              metrics.workerCounts.succeeded++;
              console.log(`[Foreman:Preparation] DocumentationReader: ${results.documentationReading.relevantSections.length} sections`);
            } else {
              metrics.workerCounts.failed++;
              console.warn(`[Foreman:Preparation] DocumentationReader failed: ${result.error}`);
            }
          })
        );
      }

      if (wave3Workers.length > 0) {
        const wave3Start = Date.now();
        await Promise.all(wave3Workers);
        const wave3Duration = Date.now() - wave3Start;
        console.log(`[Foreman:Preparation] Wave 3 completed in ${wave3Duration}ms`);
      }

      // Store results for later use by synthesis
      this.workerResults = results;

      // Check if we have minimum viable results
      if (!results.fileDiscovery) {
        return {
          success: false,
          error: 'FileDiscovery is required but failed',
          results,
        };
      }

      console.log(`[Foreman:Preparation] Wave dispatch complete: ${metrics.workerCounts.succeeded} succeeded, ${metrics.workerCounts.failed} failed`);
      console.log(`[Foreman:Preparation] Total cost: $${metrics.totalCostUsd.toFixed(4)}, Tokens: ${metrics.totalInputTokens} in / ${metrics.totalOutputTokens} out`);

      return { success: true, results };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error in wave dispatch';
      console.error(`[Foreman:Preparation] Wave dispatch error: ${message}`);
      return { success: false, error: message };
    }
  }

  // ============================================================================
  // Phase 4: Foreman Synthesis (Sonnet tier)
  // ============================================================================

  /**
   * System prompt for Foreman synthesis.
   * This prompt instructs the Sonnet-tier LLM to synthesize worker results
   * into a complete ContextPackage.
   */
  private static readonly FOREMAN_SYNTHESIS_PROMPT = `You are the Preparation Foreman in The Forge, an AI-powered software factory.

Your job is to synthesize the results from multiple specialized workers into a complete ContextPackage for task execution.

## Input Format

You will receive JSON containing results from these workers:
- fileDiscovery: Relevant files and suggested new files
- patternExtraction: Coding patterns and conventions
- dependencyMapping: File dependencies and entry points
- constraintIdentification: Technical constraints (TypeScript, tests, lint, build)
- webResearch: (optional) External research findings
- documentationReading: (optional) Documentation analysis

## Output Requirements

Produce a valid ContextPackage JSON object with this structure:

{
  "task": {
    "description": "The task description",
    "acceptanceCriteria": ["Criterion 1", "Criterion 2"],
    "scope": {
      "inScope": ["item 1", "item 2"],
      "outOfScope": ["item 1"]
    }
  },
  "architecture": {
    "overview": "High-level architecture summary",
    "relevantComponents": [
      {"name": "ComponentName", "purpose": "What it does", "location": "path/to/file"}
    ],
    "dataFlow": "Optional data flow description",
    "dependencies": ["dep1", "dep2"]
  },
  "codeContext": {
    "mustRead": [
      {"path": "path/to/file", "reason": "Why it's important"}
    ],
    "mustNotModify": [
      {"path": "path/to/protected/file", "reason": "Why it should not be modified"}
    ],
    "relatedExamples": [
      {"path": "path/to/file", "similarity": "How it's similar"}
    ]
  },
  "patterns": {
    "namingConventions": "Description of naming patterns",
    "fileOrganization": "How files are organized",
    "testingApproach": "Testing patterns used",
    "errorHandling": "Error handling approach",
    "codeStyle": ["style1", "style2"]
  },
  "constraints": {
    "technical": ["constraint 1"],
    "quality": ["quality req 1"],
    "timeline": null
  },
  "risks": [
    {"description": "Risk description", "mitigation": "How to mitigate"}
  ],
  "history": {
    "previousAttempts": [],
    "relatedDecisions": []
  },
  "humanSync": {
    "requiredBefore": [],
    "ambiguities": ["Any unclear requirements"]
  }
}

## Synthesis Guidelines

1. **File Discovery**: Use must_read files in codeContext.mustRead, should_read/may_read in relatedExamples
2. **Patterns**: Synthesize pattern worker output into the patterns section
3. **Constraints**: Combine constraint worker output into constraints.technical and constraints.quality
4. **Dependencies**: Extract key dependencies for architecture.dependencies
5. **Risks**: Identify risks based on constraint violations, complex dependencies, etc.
6. **Acceptance Criteria**: Infer from task type and constraints

Be concise but complete. Focus on what the executing instance needs to know.`;

  /**
   * Synthesize worker results into a ContextPackage using Sonnet tier.
   *
   * This is the Foreman's core function: taking the raw output from
   * all workers and assembling them into a coherent, validated
   * ContextPackage ready for execution.
   *
   * @param workerResults - Results from all workers (wave 1-3)
   * @param taskDescription - The original task description
   * @param projectPath - Project root path
   * @param historicalContext - Historical context from learning retrieval
   * @returns Validated ContextPackage or error
   */
  async synthesizeContextPackage(
    workerResults: WorkerResultsType,
    taskDescription: string,
    projectPath: string,
    historicalContext?: HistoricalContext
  ): Promise<{
    success: boolean;
    package?: ContextPackage;
    error?: string;
    metrics?: {
      inputTokens: number;
      outputTokens: number;
      costUsd: number;
      latencyMs: number;
    };
  }> {
    console.log('[Foreman:Synthesis] Starting context package synthesis (Sonnet tier)');

    try {
      // Build user prompt with all worker results
      const userPrompt = JSON.stringify({
        taskDescription,
        projectPath,
        workerResults: {
          fileDiscovery: workerResults.fileDiscovery,
          patternExtraction: workerResults.patternExtraction,
          dependencyMapping: workerResults.dependencyMapping,
          constraintIdentification: workerResults.constraintIdentification,
          webResearch: workerResults.webResearch,
          documentationReading: workerResults.documentationReading,
        },
        historicalContext: historicalContext ? {
          previousAttempts: historicalContext.previousAttempts,
          relatedDecisions: historicalContext.relatedDecisions,
        } : undefined,
      }, null, 2);

      // Call Sonnet tier for synthesis
      const result = await this.tierRouter.call({
        operation: 'context_package_assembly',
        systemPrompt: PreparationForeman.FOREMAN_SYNTHESIS_PROMPT,
        userPrompt,
        maxTokens: 4096,
        temperature: 0,
      });

      console.log(`[Foreman:Synthesis] Sonnet response received: ${result.outputTokens} tokens, $${result.costUsd.toFixed(4)}`);

      // Parse the JSON response
      let parsedResponse: unknown;
      try {
        // Extract JSON from the response (may be wrapped in markdown code blocks)
        let jsonContent = result.content.trim();
        if (jsonContent.startsWith('```json')) {
          jsonContent = jsonContent.slice(7);
        } else if (jsonContent.startsWith('```')) {
          jsonContent = jsonContent.slice(3);
        }
        if (jsonContent.endsWith('```')) {
          jsonContent = jsonContent.slice(0, -3);
        }
        parsedResponse = JSON.parse(jsonContent.trim());
      } catch (parseError) {
        console.error('[Foreman:Synthesis] Failed to parse JSON response');
        return {
          success: false,
          error: `Failed to parse synthesis response as JSON: ${parseError instanceof Error ? parseError.message : 'Unknown parse error'}`,
          metrics: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: result.costUsd,
            latencyMs: result.latencyMs,
          },
        };
      }

      // Add required fields that Foreman doesn't generate
      const packageWithMetadata = {
        id: crypto.randomUUID(),
        projectType: 'feature' as const, // Default, can be overridden
        created: new Date(),
        preparedBy: this.instanceId,
        ...parsedResponse as object,
      };

      // Validate with ContextPackage Zod schema (imported from types.ts)
      // Note: ContextPackage is both a type and a Zod schema
      const { ContextPackage: ContextPackageSchema } = await import('../types.js');
      const validated = ContextPackageSchema.safeParse(packageWithMetadata);

      if (!validated.success) {
        console.error('[Foreman:Synthesis] Validation failed:', validated.error.errors);
        return {
          success: false,
          error: `ContextPackage validation failed: ${validated.error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          metrics: {
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            costUsd: result.costUsd,
            latencyMs: result.latencyMs,
          },
        };
      }

      console.log('[Foreman:Synthesis] ContextPackage validated successfully');

      return {
        success: true,
        package: validated.data,
        metrics: {
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          costUsd: result.costUsd,
          latencyMs: result.latencyMs,
        },
      };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown synthesis error';
      console.error(`[Foreman:Synthesis] Error: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Full LLM-based preparation pipeline.
   *
   * This is the Phase 4 replacement for the shell-command-based prepare() method.
   * It runs wave-based workers followed by Foreman synthesis.
   *
   * @param taskDescription - The task to prepare for
   * @param projectPath - Project root path
   * @param options - Configuration options
   */
  async prepareWithLLM(
    taskDescription: string,
    projectPath: string,
    options?: {
      needsWebResearch?: boolean;
      documentation?: string;
      historicalContext?: HistoricalContext;
    }
  ): Promise<{
    success: boolean;
    package?: ContextPackage;
    error?: string;
    metrics?: {
      workerMetrics: WorkerResultsType['metrics'];
      synthesisMetrics?: {
        inputTokens: number;
        outputTokens: number;
        costUsd: number;
        latencyMs: number;
      };
      totalCostUsd: number;
    };
  }> {
    console.log('[Foreman:Preparation] Starting LLM-based preparation pipeline');

    // Step 1: Run wave-based workers
    const waveResult = await this.executeWaveBasedWorkers(
      taskDescription,
      projectPath,
      {
        needsWebResearch: options?.needsWebResearch,
        documentation: options?.documentation,
      }
    );

    if (!waveResult.success || !waveResult.results) {
      return {
        success: false,
        error: waveResult.error || 'Wave-based worker dispatch failed',
      };
    }

    // Step 2: Synthesize into ContextPackage
    const synthesisResult = await this.synthesizeContextPackage(
      waveResult.results,
      taskDescription,
      projectPath,
      options?.historicalContext
    );

    if (!synthesisResult.success || !synthesisResult.package) {
      return {
        success: false,
        error: synthesisResult.error || 'Synthesis failed',
        metrics: {
          workerMetrics: waveResult.results.metrics,
          synthesisMetrics: synthesisResult.metrics,
          totalCostUsd: waveResult.results.metrics.totalCostUsd + (synthesisResult.metrics?.costUsd || 0),
        },
      };
    }

    const totalCost = waveResult.results.metrics.totalCostUsd + (synthesisResult.metrics?.costUsd || 0);
    console.log(`[Foreman:Preparation] LLM pipeline complete. Total cost: $${totalCost.toFixed(4)}`);

    return {
      success: true,
      package: synthesisResult.package,
      metrics: {
        workerMetrics: waveResult.results.metrics,
        synthesisMetrics: synthesisResult.metrics,
        totalCostUsd: totalCost,
      },
    };
  }

  // INTEGRATION-5: Removed shell-based prepare() method (see prepareWithLLM instead)
  // Also removed helper methods: extractKeywords, inferAcceptanceCriteria, assessRisks, findAmbiguities, validatePackage
}

// Factory function
export function createPreparationForeman(
  instanceId: string,
  tierRouter?: TierRouter
): PreparationForeman {
  return new PreparationForeman(instanceId, tierRouter);
}
