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

const execAsync = promisify(exec);

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
// Workers (specialized task agents)
// ============================================================================

class FileDiscoveryWorker {
  /**
   * Discover relevant files for a task in a codebase
   */
  async discover(
    projectPath: string,
    keywords: string[],
    projectType: ProjectType
  ): Promise<FileDiscoveryResult> {
    console.log(`[Worker:FileDiscovery] Scanning ${projectPath} for: ${keywords.join(', ')}`);

    // Get directory structure
    let directoryStructure = '';
    try {
      const { stdout } = await execAsync(
        `find "${projectPath}" -type f -name "*.ts" -o -name "*.js" -o -name "*.tsx" -o -name "*.jsx" | head -50`,
        { timeout: 10000 }
      );
      directoryStructure = stdout;
    } catch {
      directoryStructure = 'Unable to scan directory';
    }

    // Search for keywords using ripgrep
    const relevantFiles: FileDiscoveryResult['relevantFiles'] = [];

    for (const keyword of keywords) {
      try {
        const { stdout } = await execAsync(
          `rg -l -i "${keyword}" "${projectPath}" --type ts --type js 2>/dev/null | head -10`,
          { timeout: 10000 }
        );

        for (const file of stdout.trim().split('\n').filter(Boolean)) {
          const existing = relevantFiles.find(f => f.path === file);
          if (existing) {
            existing.priority = 'high'; // Multiple keyword matches = high priority
          } else {
            relevantFiles.push({
              path: file,
              reason: `Contains "${keyword}"`,
              priority: 'medium',
            });
          }
        }
      } catch {
        // No matches for this keyword
      }
    }

    return { relevantFiles, directoryStructure };
  }
}

class PatternExtractionWorker {
  /**
   * Extract coding patterns from a codebase
   */
  async extract(projectPath: string): Promise<PatternExtractionResult> {
    console.log(`[Worker:PatternExtraction] Analyzing patterns in ${projectPath}`);

    // Check for config files
    const configs: string[] = [];
    const configFiles = ['tsconfig.json', 'package.json', '.eslintrc', '.prettierrc', 'jest.config.js'];

    for (const config of configFiles) {
      try {
        await fs.access(path.join(projectPath, config));
        configs.push(config);
      } catch {
        // File doesn't exist
      }
    }

    // Infer patterns from structure
    let testingApproach = 'Unknown';
    try {
      const { stdout } = await execAsync(`ls -la "${projectPath}" 2>/dev/null`);
      if (stdout.includes('jest') || stdout.includes('__tests__')) {
        testingApproach = 'Jest';
      } else if (stdout.includes('vitest')) {
        testingApproach = 'Vitest';
      } else if (stdout.includes('mocha')) {
        testingApproach = 'Mocha';
      }
    } catch {
      // Ignore
    }

    // Check package.json for more info
    let namingConventions = 'camelCase (TypeScript default)';
    let fileOrganization = 'Unknown';

    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));

      if (pkg.type === 'module') {
        fileOrganization = 'ES Modules';
      }

      if (pkg.scripts?.test) {
        testingApproach = pkg.scripts.test.includes('jest')
          ? 'Jest'
          : pkg.scripts.test.includes('vitest')
          ? 'Vitest'
          : testingApproach;
      }
    } catch {
      // No package.json or parse error
    }

    return {
      namingConventions,
      fileOrganization,
      testingApproach,
      errorHandling: 'Standard try/catch with typed errors',
      codeStyle: configs,
    };
  }
}

class ArchitectureAnalysisWorker {
  /**
   * Analyze the architecture of a codebase
   */
  async analyze(
    projectPath: string,
    relevantFiles: string[]
  ): Promise<ArchitectureAnalysisResult> {
    console.log(`[Worker:Architecture] Analyzing ${relevantFiles.length} files`);

    const components: ArchitectureAnalysisResult['components'] = [];
    const dependencies: string[] = [];

    // Read package.json for dependencies
    try {
      const pkgPath = path.join(projectPath, 'package.json');
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));

      dependencies.push(...Object.keys(pkg.dependencies ?? {}));
      dependencies.push(...Object.keys(pkg.devDependencies ?? {}).map(d => `${d} (dev)`));
    } catch {
      // Ignore
    }

    // Analyze file structure to identify components
    const dirCounts: Record<string, number> = {};
    for (const file of relevantFiles) {
      const dir = path.dirname(file).replace(projectPath, '').split('/')[1] ?? 'root';
      dirCounts[dir] = (dirCounts[dir] ?? 0) + 1;
    }

    for (const [dir, count] of Object.entries(dirCounts)) {
      if (count >= 1) {
        components.push({
          name: dir,
          purpose: `Contains ${count} relevant file(s)`,
          location: path.join(projectPath, dir),
        });
      }
    }

    return {
      overview: `Project with ${relevantFiles.length} relevant files across ${components.length} components`,
      components,
      dependencies: dependencies.slice(0, 20), // Top 20
    };
  }
}

// ============================================================================
// Preparation Foreman
// ============================================================================

export class PreparationForeman {
  private instanceId: string;
  private fileWorker: FileDiscoveryWorker;
  private patternWorker: PatternExtractionWorker;
  private architectureWorker: ArchitectureAnalysisWorker;
  private learningRetriever: LearningRetriever;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    this.fileWorker = new FileDiscoveryWorker();
    this.patternWorker = new PatternExtractionWorker();
    this.architectureWorker = new ArchitectureAnalysisWorker();
    this.learningRetriever = createLearningRetriever(instanceId);
  }

  /**
   * Execute the 7-phase preparation protocol
   *
   * Returns a complete ContextPackage ready for execution.
   */
  async prepare(
    taskId: string,
    projectPath: string
  ): Promise<{ success: boolean; package?: ContextPackage; error?: string }> {
    const task = taskManager.getTask(taskId);
    if (!task || !task.classification) {
      return { success: false, error: 'Task not found or not classified' };
    }

    console.log(`[Foreman:Preparation] Starting preparation for task ${taskId}`);
    console.log(`[Foreman:Preparation] Type: ${task.classification.projectType}, Scope: ${task.classification.scope}`);

    // Transition to preparing state
    taskManager.transitionState(taskId, 'preparing', this.instanceId, 'Starting preparation');

    try {
      // Phase 1: Already done by Plant Manager (classification)
      console.log('[Foreman:Preparation] Phase 1: Classification complete');

      // Phase 2: Architectural Discovery
      console.log('[Foreman:Preparation] Phase 2: Architectural Discovery');

      // Extract keywords from request
      const keywords = this.extractKeywords(task.rawRequest);
      console.log(`[Foreman:Preparation] Keywords: ${keywords.join(', ')}`);

      // Worker: File Discovery
      const fileResult = await this.fileWorker.discover(
        projectPath,
        keywords,
        task.classification.projectType
      );

      // Phase 3: Code Context Assembly
      console.log('[Foreman:Preparation] Phase 3: Code Context Assembly');

      // Worker: Architecture Analysis
      const relevantPaths = fileResult.relevantFiles.map(f => f.path);
      const archResult = await this.architectureWorker.analyze(projectPath, relevantPaths);

      // Phase 4: Pattern & Constraint Synthesis
      console.log('[Foreman:Preparation] Phase 4: Pattern Synthesis');

      // Worker: Pattern Extraction
      const patternResult = await this.patternWorker.extract(projectPath);

      // Phase 5: Risk Assessment
      console.log('[Foreman:Preparation] Phase 5: Risk Assessment');
      const risks = this.assessRisks(task, fileResult, archResult);

      // Phase 5.5: Learning Retrieval (added by i[4])
      // This is the key to compound learning - retrieve historical context
      console.log('[Foreman:Preparation] Phase 5.5: Learning Retrieval (i[4])');
      const historicalContext = await this.learningRetriever.retrieve(
        task.rawRequest,
        projectPath
      );

      // Phase 6: Package Validation (internal)
      console.log('[Foreman:Preparation] Phase 6: Package Validation');

      // Phase 7: Build the ContextPackage
      console.log('[Foreman:Preparation] Phase 7: Building ContextPackage');

      const contextPackage: ContextPackage = {
        id: crypto.randomUUID(),
        projectType: task.classification.projectType,
        created: new Date(),
        preparedBy: this.instanceId,

        task: {
          description: task.rawRequest,
          acceptanceCriteria: this.inferAcceptanceCriteria(task.rawRequest),
          scope: {
            inScope: keywords,
            outOfScope: ['unrelated features', 'major refactoring'],
          },
        },

        architecture: {
          overview: archResult.overview,
          relevantComponents: archResult.components,
          dataFlow: archResult.dataFlow,
          dependencies: archResult.dependencies,
        },

        codeContext: {
          // Combine file discovery with historical learning (i[4])
          mustRead: [
            // Files from keyword search
            ...fileResult.relevantFiles
              .filter(f => f.priority === 'high')
              .map(f => ({
                path: f.path,
                reason: f.reason,
              })),
            // Files from previous similar tasks (learning retrieval)
            ...historicalContext.previousAttempts
              .flatMap(attempt => attempt.keyFiles.map(path => ({
                path,
                reason: `From previous task: "${attempt.taskDescription.substring(0, 30)}..."`,
              })))
              .slice(0, 3), // Limit historical files
          ].filter((f, i, arr) =>
            // Deduplicate by path
            arr.findIndex(x => x.path === f.path) === i
          ),
          mustNotModify: [], // Would be populated by deeper analysis
          relatedExamples: [
            // Files from keyword search
            ...fileResult.relevantFiles
              .filter(f => f.priority !== 'high')
              .slice(0, 5)
              .map(f => ({
                path: f.path,
                similarity: f.reason,
              })),
            // Files from co-modification patterns (learning retrieval)
            ...historicalContext.coModificationPatterns
              .flatMap(p => p.files.map(path => ({
                path,
                similarity: `Co-modified in: ${p.typicalTask}`,
              })))
              .slice(0, 3),
          ].filter((f, i, arr) =>
            arr.findIndex(x => x.path === f.path) === i
          ),
        },

        patterns: {
          namingConventions: patternResult.namingConventions,
          fileOrganization: patternResult.fileOrganization,
          testingApproach: patternResult.testingApproach,
          errorHandling: patternResult.errorHandling,
          codeStyle: patternResult.codeStyle,
        },

        constraints: {
          technical: archResult.dependencies.length > 10
            ? ['Large dependency graph - minimize new dependencies']
            : [],
          quality: ['TypeScript compilation must pass', 'Existing tests must pass'],
          timeline: null,
        },

        risks,

        // History section now populated by LearningRetriever (i[4])
        history: {
          previousAttempts: historicalContext.previousAttempts.map(attempt => ({
            what: attempt.taskDescription,
            result: attempt.outcome,
            lesson: attempt.lesson,
          })),
          relatedDecisions: historicalContext.relatedDecisions.map(decision => ({
            decision: decision.title,
            rationale: decision.rationale,
          })),
        },

        humanSync: {
          requiredBefore: risks.length > 2 ? ['execution'] : [],
          ambiguities: this.findAmbiguities(task.rawRequest),
        },
      };

      // Validate package
      const validation = this.validatePackage(contextPackage);
      if (!validation.valid) {
        return { success: false, error: `Package validation failed: ${validation.errors.join(', ')}` };
      }

      // Store package on task
      taskManager.setContextPackage(taskId, contextPackage);
      taskManager.transitionState(taskId, 'prepared', this.instanceId, 'ContextPackage ready');

      // Store to Mandrel
      await mandrel.storeContext(
        `ContextPackage prepared for task ${taskId}:\n${JSON.stringify(contextPackage, null, 2)}`,
        'completion',
        ['context-package', task.classification.projectType, this.instanceId]
      );

      console.log('[Foreman:Preparation] ContextPackage complete');
      return { success: true, package: contextPackage };

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Foreman:Preparation] Error: ${message}`);

      taskManager.transitionState(taskId, 'failed', this.instanceId, message);
      return { success: false, error: message };
    }
  }

  /**
   * Extract keywords from a request for file discovery
   */
  private extractKeywords(request: string): string[] {
    // Remove common words
    const stopWords = new Set([
      'a', 'an', 'the', 'to', 'and', 'or', 'but', 'in', 'on', 'at', 'for',
      'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its',
      'this', 'that', 'these', 'those',
      'add', 'create', 'implement', 'fix', 'update', 'change', 'make',
      'want', 'need', 'please', 'can', 'help',
    ]);

    const words = request
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w));

    // Return unique keywords, max 10
    return [...new Set(words)].slice(0, 10);
  }

  /**
   * Infer acceptance criteria from request
   */
  private inferAcceptanceCriteria(request: string): string[] {
    const criteria: string[] = [];

    if (request.toLowerCase().includes('test')) {
      criteria.push('Tests pass');
    }

    if (request.toLowerCase().includes('error') || request.toLowerCase().includes('bug')) {
      criteria.push('Error no longer occurs');
    }

    criteria.push('Code compiles without errors');
    criteria.push('Functionality works as described');

    return criteria;
  }

  /**
   * Assess risks based on analysis results
   */
  private assessRisks(
    task: ReturnType<typeof taskManager.getTask>,
    fileResult: FileDiscoveryResult,
    archResult: ArchitectureAnalysisResult
  ): Array<{ description: string; mitigation: string }> {
    const risks: Array<{ description: string; mitigation: string }> = [];

    if (fileResult.relevantFiles.length === 0) {
      risks.push({
        description: 'No relevant files found - may be working in wrong location',
        mitigation: 'Verify project path and keywords',
      });
    }

    if (fileResult.relevantFiles.length > 20) {
      risks.push({
        description: 'Many files affected - scope may be too broad',
        mitigation: 'Consider breaking into smaller tasks',
      });
    }

    if (archResult.dependencies.length > 30) {
      risks.push({
        description: 'Complex dependency graph',
        mitigation: 'Test thoroughly after changes',
      });
    }

    return risks;
  }

  /**
   * Find ambiguities that need human clarification
   */
  private findAmbiguities(request: string): string[] {
    const ambiguities: string[] = [];

    // Check for vague language
    const vagueTerms = ['better', 'improve', 'optimize', 'clean', 'nice', 'good'];
    for (const term of vagueTerms) {
      if (request.toLowerCase().includes(term)) {
        ambiguities.push(`"${term}" is subjective - needs specific criteria`);
      }
    }

    // Check for missing details
    if (request.length < 50) {
      ambiguities.push('Request is brief - may need more detail');
    }

    return ambiguities;
  }

  /**
   * Validate the ContextPackage
   */
  private validatePackage(pkg: ContextPackage): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!pkg.task.description) {
      errors.push('Missing task description');
    }

    if (pkg.codeContext.mustRead.length === 0 && pkg.codeContext.relatedExamples.length === 0) {
      errors.push('No code context identified');
    }

    // Check estimated size (rough context window check)
    const jsonSize = JSON.stringify(pkg).length;
    if (jsonSize > 50000) {
      errors.push(`Package too large (${jsonSize} chars) - may exceed context window`);
    }

    return { valid: errors.length === 0, errors };
  }
}

// Factory function
export function createPreparationForeman(instanceId: string): PreparationForeman {
  return new PreparationForeman(instanceId);
}
