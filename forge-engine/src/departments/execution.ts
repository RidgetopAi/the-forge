/**
 * Execution Department
 *
 * i[13] contribution: The department that actually DOES the work.
 *
 * After 12 passes refining Preparation, this closes the loop.
 * The Forge can now prepare AND execute tasks.
 *
 * Structure:
 * - ExecutionForeman (Sonnet-tier): Orchestrates execution, manages workers
 * - CodeGenerationWorker (LLM): Generates code from ContextPackage
 * - FileOperationWorker: Creates/modifies files
 * - ValidationWorker: Runs TypeScript compilation, basic checks
 *
 * Key insight from seed document: "Preparation IS the product. If prep is right,
 * execution is almost mechanical." This department tests that hypothesis.
 */

import { ContextPackage, ExecutionFeedback } from '../types.js';
import { taskManager } from '../state.js';
import { mandrel } from '../mandrel.js';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

interface ExecutionResult {
  success: boolean;
  filesCreated: string[];
  filesModified: string[];
  filesRead: string[];
  compilationPassed: boolean;
  notes: string;
  error?: string;
}

interface CodeGenerationResult {
  success: boolean;
  files: Array<{
    path: string;
    content: string;
    action: 'create' | 'modify';
  }>;
  explanation: string;
  error?: string;
}

// ============================================================================
// Workers
// ============================================================================

/**
 * CodeGenerationWorker
 *
 * Uses LLM to generate code based on ContextPackage.
 * This is where preparation meets execution.
 */
class CodeGenerationWorker {
  private client: Anthropic | null = null;
  private model: string = 'claude-sonnet-4-20250514';

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && apiKey.startsWith('sk-ant-')) {
      this.client = new Anthropic({ apiKey });
      console.log('[Worker:CodeGeneration] Anthropic API initialized');
    } else {
      console.warn('[Worker:CodeGeneration] No valid API key - execution will be limited');
    }
  }

  /**
   * Generate code from ContextPackage
   *
   * Reads mustRead files, constructs prompt, calls LLM
   */
  async generate(
    pkg: ContextPackage,
    projectPath: string
  ): Promise<CodeGenerationResult> {
    if (!this.client) {
      return {
        success: false,
        files: [],
        explanation: 'No LLM available for code generation',
        error: 'ANTHROPIC_API_KEY not configured',
      };
    }

    // Read mustRead files for context
    const fileContents: Array<{ path: string; content: string }> = [];
    for (const file of pkg.codeContext.mustRead) {
      try {
        const content = await fs.readFile(file.path, 'utf-8');
        fileContents.push({
          path: file.path,
          content: this.truncateContent(content, 3000), // Limit per-file
        });
        console.log(`[Worker:CodeGeneration] Read: ${file.path} (${content.length} chars)`);
      } catch (error) {
        console.warn(`[Worker:CodeGeneration] Could not read ${file.path}: ${error}`);
      }
    }

    // Build the prompt
    const prompt = this.buildPrompt(pkg, fileContents, projectPath);

    try {
      console.log('[Worker:CodeGeneration] Calling LLM for code generation...');

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      return this.parseResponse(text, projectPath);

    } catch (error) {
      console.error('[Worker:CodeGeneration] LLM call failed:', error);
      return {
        success: false,
        files: [],
        explanation: 'LLM call failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private buildPrompt(
    pkg: ContextPackage,
    fileContents: Array<{ path: string; content: string }>,
    projectPath: string
  ): string {
    const filesSection = fileContents.map(f =>
      `### ${f.path}\n\`\`\`typescript\n${f.content}\n\`\`\``
    ).join('\n\n');

    const patternsSection = `
- Naming: ${pkg.patterns.namingConventions}
- File Organization: ${pkg.patterns.fileOrganization}
- Error Handling: ${pkg.patterns.errorHandling}`;

    return `You are a code generation assistant for The Forge Development Cognition System.

## TASK
${pkg.task.description}

## ACCEPTANCE CRITERIA
${pkg.task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## PROJECT CONTEXT
Project Path: ${projectPath}
Project Type: ${pkg.projectType}

### Architecture Overview
${pkg.architecture.overview}

### Relevant Components
${pkg.architecture.relevantComponents.map(c =>
  `- ${c.name}: ${c.purpose} (${c.location})`
).join('\n')}

## CODE CONTEXT (Files to Reference)
${filesSection}

## PATTERNS TO FOLLOW
${patternsSection}

## CONSTRAINTS
Technical:
${pkg.constraints.technical.map(c => `- ${c}`).join('\n') || '- None specified'}

Quality:
${pkg.constraints.quality.map(c => `- ${c}`).join('\n') || '- None specified'}

## INSTRUCTIONS
1. Analyze the task and existing code patterns
2. Generate the code that fulfills the task
3. Follow existing patterns from the reference files
4. Output your response in the following JSON format:

\`\`\`json
{
  "files": [
    {
      "path": "absolute/path/to/file.ts",
      "action": "create" | "modify",
      "content": "full file content here"
    }
  ],
  "explanation": "Brief explanation of what was generated and why"
}
\`\`\`

IMPORTANT:
- Use ABSOLUTE paths based on the project path: ${projectPath}
- For new files, use "create" action
- For modifications to existing files, use "modify" action with full file content
- Follow TypeScript conventions
- Include necessary imports
- Generate complete, working code

Generate the code now:`;
  }

  private parseResponse(text: string, projectPath: string): CodeGenerationResult {
    try {
      // Extract JSON from response
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) {
        // Try to find raw JSON
        const rawJsonMatch = text.match(/\{[\s\S]*"files"[\s\S]*\}/);
        if (!rawJsonMatch) {
          throw new Error('No JSON found in response');
        }
        const parsed = JSON.parse(rawJsonMatch[0]);
        return this.validateAndNormalizeParsed(parsed, projectPath);
      }

      const parsed = JSON.parse(jsonMatch[1]);
      return this.validateAndNormalizeParsed(parsed, projectPath);

    } catch (error) {
      console.error('[Worker:CodeGeneration] Failed to parse response:', error);
      return {
        success: false,
        files: [],
        explanation: 'Failed to parse LLM response',
        error: error instanceof Error ? error.message : 'Parse error',
      };
    }
  }

  private validateAndNormalizeParsed(
    parsed: { files?: unknown[]; explanation?: string },
    projectPath: string
  ): CodeGenerationResult {
    if (!parsed.files || !Array.isArray(parsed.files)) {
      return {
        success: false,
        files: [],
        explanation: 'Invalid response structure',
        error: 'Missing or invalid files array',
      };
    }

    const files = (parsed.files as Array<Record<string, unknown>>).map((f) => ({
      path: this.normalizePath(String(f.path || ''), projectPath),
      content: String(f.content || ''),
      action: (f.action === 'modify' ? 'modify' : 'create') as 'create' | 'modify',
    }));

    return {
      success: true,
      files,
      explanation: String(parsed.explanation || 'Code generated successfully'),
    };
  }

  private normalizePath(filePath: string, projectPath: string): string {
    // If already absolute and under project, keep it
    if (filePath.startsWith(projectPath)) {
      return filePath;
    }
    // If relative, make absolute
    if (!filePath.startsWith('/')) {
      return path.join(projectPath, filePath);
    }
    // Otherwise return as-is
    return filePath;
  }

  private truncateContent(content: string, maxChars: number): string {
    if (content.length <= maxChars) return content;
    return content.substring(0, maxChars) + '\n\n// ... truncated for brevity';
  }
}

/**
 * FileOperationWorker
 *
 * Creates and modifies files safely.
 */
class FileOperationWorker {
  /**
   * Apply file operations from code generation
   */
  async apply(
    files: Array<{ path: string; content: string; action: 'create' | 'modify' }>
  ): Promise<{
    created: string[];
    modified: string[];
    errors: Array<{ path: string; error: string }>;
  }> {
    const created: string[] = [];
    const modified: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];

    for (const file of files) {
      try {
        // Ensure directory exists
        const dir = path.dirname(file.path);
        await fs.mkdir(dir, { recursive: true });

        // Check if file exists
        let exists = false;
        try {
          await fs.access(file.path);
          exists = true;
        } catch {
          exists = false;
        }

        // Write file
        await fs.writeFile(file.path, file.content, 'utf-8');

        if (exists) {
          modified.push(file.path);
          console.log(`[Worker:FileOperation] Modified: ${file.path}`);
        } else {
          created.push(file.path);
          console.log(`[Worker:FileOperation] Created: ${file.path}`);
        }

      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ path: file.path, error: message });
        console.error(`[Worker:FileOperation] Failed: ${file.path} - ${message}`);
      }
    }

    return { created, modified, errors };
  }
}

/**
 * ValidationWorker
 *
 * Runs basic validation checks on the result.
 */
class ValidationWorker {
  /**
   * Run TypeScript compilation check
   */
  async checkCompilation(projectPath: string): Promise<{
    passed: boolean;
    output: string;
  }> {
    try {
      // Find tsconfig.json
      const tsconfigPath = path.join(projectPath, 'tsconfig.json');
      try {
        await fs.access(tsconfigPath);
      } catch {
        // No tsconfig, skip compilation check
        console.log('[Worker:Validation] No tsconfig.json found, skipping compilation check');
        return { passed: true, output: 'No tsconfig.json found' };
      }

      // Run tsc --noEmit
      console.log('[Worker:Validation] Running TypeScript compilation check...');
      const { stdout, stderr } = await execAsync(
        `cd "${projectPath}" && npx tsc --noEmit 2>&1`,
        { timeout: 60000 }
      );

      const output = stdout + stderr;
      const passed = !output.includes('error TS');

      console.log(`[Worker:Validation] Compilation: ${passed ? 'PASSED' : 'FAILED'}`);

      return { passed, output: output.trim() || 'Compilation successful' };

    } catch (error) {
      // tsc returns non-zero on errors
      const message = error instanceof Error ? (error as Error & { stdout?: string; stderr?: string }).stdout || (error as Error & { stderr?: string }).stderr || error.message : 'Unknown error';
      const passed = !message.includes('error TS');
      return { passed, output: message };
    }
  }
}

// ============================================================================
// Execution Foreman
// ============================================================================

export class ExecutionForeman {
  private instanceId: string;
  private codeWorker: CodeGenerationWorker;
  private fileWorker: FileOperationWorker;
  private validationWorker: ValidationWorker;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    this.codeWorker = new CodeGenerationWorker();
    this.fileWorker = new FileOperationWorker();
    this.validationWorker = new ValidationWorker();
  }

  /**
   * Execute a prepared ContextPackage
   *
   * This is the moment of truth: does preparation lead to successful execution?
   */
  async execute(
    taskId: string,
    projectPath: string
  ): Promise<ExecutionResult> {
    const task = taskManager.getTask(taskId);
    if (!task || !task.contextPackage) {
      return {
        success: false,
        filesCreated: [],
        filesModified: [],
        filesRead: [],
        compilationPassed: false,
        notes: 'Task not found or not prepared',
        error: 'NO_CONTEXT_PACKAGE',
      };
    }

    const pkg = task.contextPackage;
    console.log(`[Foreman:Execution] Starting execution for task ${taskId}`);
    console.log(`[Foreman:Execution] Task: ${pkg.task.description.substring(0, 100)}...`);

    // Transition to executing state
    taskManager.transitionState(taskId, 'executing', this.instanceId, 'Starting execution');

    try {
      // Phase 1: Code Generation
      console.log('\n[Foreman:Execution] Phase 1: Code Generation');
      const codeResult = await this.codeWorker.generate(pkg, projectPath);

      if (!codeResult.success) {
        taskManager.transitionState(taskId, 'failed', this.instanceId, codeResult.error || 'Code generation failed');
        return {
          success: false,
          filesCreated: [],
          filesModified: [],
          filesRead: pkg.codeContext.mustRead.map(f => f.path),
          compilationPassed: false,
          notes: codeResult.explanation,
          error: codeResult.error,
        };
      }

      console.log(`[Foreman:Execution] Generated ${codeResult.files.length} file(s)`);
      console.log(`[Foreman:Execution] Explanation: ${codeResult.explanation}`);

      // Phase 2: File Operations
      console.log('\n[Foreman:Execution] Phase 2: File Operations');
      const fileResult = await this.fileWorker.apply(codeResult.files);

      if (fileResult.errors.length > 0) {
        const errorMsg = fileResult.errors.map(e => `${e.path}: ${e.error}`).join('; ');
        console.warn(`[Foreman:Execution] File operation errors: ${errorMsg}`);
      }

      // Phase 3: Validation
      console.log('\n[Foreman:Execution] Phase 3: Validation');
      const validation = await this.validationWorker.checkCompilation(projectPath);

      // Build result
      const result: ExecutionResult = {
        success: codeResult.success && fileResult.errors.length === 0 && validation.passed,
        filesCreated: fileResult.created,
        filesModified: fileResult.modified,
        filesRead: pkg.codeContext.mustRead.map(f => f.path),
        compilationPassed: validation.passed,
        notes: [
          codeResult.explanation,
          validation.passed ? 'TypeScript compilation passed' : `Compilation issues: ${validation.output.substring(0, 200)}`,
        ].join('\n'),
      };

      // Set execution result on task
      taskManager.setExecutionResult(taskId, {
        success: result.success,
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        testsPassed: undefined, // TODO: Add test running
        notes: result.notes,
      });

      // Transition state
      if (result.success) {
        taskManager.transitionState(taskId, 'reviewing', this.instanceId, 'Execution complete, ready for review');
      } else {
        taskManager.transitionState(taskId, 'blocked', this.instanceId, 'Execution had issues');
      }

      // Store to Mandrel
      await mandrel.storeContext(
        `Execution complete for task ${taskId}:\n` +
        `Success: ${result.success}\n` +
        `Files Created: ${result.filesCreated.join(', ') || 'none'}\n` +
        `Files Modified: ${result.filesModified.join(', ') || 'none'}\n` +
        `Compilation: ${result.compilationPassed ? 'PASSED' : 'FAILED'}\n` +
        `Notes: ${result.notes}`,
        result.success ? 'completion' : 'error',
        ['execution', result.success ? 'success' : 'failed', this.instanceId]
      );

      console.log(`\n[Foreman:Execution] Complete: ${result.success ? 'SUCCESS' : 'ISSUES FOUND'}`);
      return result;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[Foreman:Execution] Error: ${message}`);

      taskManager.transitionState(taskId, 'failed', this.instanceId, message);

      return {
        success: false,
        filesCreated: [],
        filesModified: [],
        filesRead: pkg.codeContext.mustRead.map(f => f.path),
        compilationPassed: false,
        notes: 'Execution failed with error',
        error: message,
      };
    }
  }

  /**
   * Generate execution feedback for the learning loop
   *
   * i[4] designed ExecutionFeedback schema - this implements it.
   */
  async generateFeedback(
    taskId: string,
    result: ExecutionResult,
  ): Promise<ExecutionFeedback | null> {
    const task = taskManager.getTask(taskId);
    if (!task || !task.contextPackage) {
      return null;
    }

    const pkg = task.contextPackage;
    const predicted = pkg.codeContext.mustRead.map(f => f.path);

    // Calculate accuracy
    const missed = result.filesRead.filter(f => !predicted.includes(f));
    const unnecessary = predicted.filter(f => !result.filesRead.includes(f));

    const feedback: ExecutionFeedback = {
      id: crypto.randomUUID(),
      taskId,
      contextPackageId: pkg.id,
      executedBy: this.instanceId,
      timestamp: new Date(),

      outcome: {
        success: result.success,
        filesActuallyModified: [...result.filesCreated, ...result.filesModified],
        filesActuallyRead: result.filesRead,
        testsRan: false, // TODO
        compilationPassed: result.compilationPassed,
      },

      accuracy: {
        mustReadAccuracy: {
          predicted,
          actual: result.filesRead,
          missed,
          unnecessary,
        },
        patternsFollowed: [], // TODO: Analyze patterns
        patternsViolated: [],
      },

      learnings: [
        {
          type: result.success ? 'insight' : 'correction',
          content: result.success
            ? `Task executed successfully. ${result.filesCreated.length} files created, ${result.filesModified.length} modified.`
            : `Task had issues: ${result.error || 'Unknown'}`,
          tags: [pkg.projectType, result.success ? 'success' : 'failure'],
        },
      ],
    };

    // Store feedback to Mandrel
    await mandrel.storeContext(
      `Execution feedback for ${taskId}:\n${JSON.stringify(feedback, null, 2)}`,
      'completion',
      ['execution-feedback', result.success ? 'success' : 'failure', this.instanceId]
    );

    return feedback;
  }
}

// Factory function
export function createExecutionForeman(instanceId: string): ExecutionForeman {
  return new ExecutionForeman(instanceId);
}
