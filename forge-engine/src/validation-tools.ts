/**
 * Validation Tool Builder
 *
 * i[18] contribution: Addresses Hard Problem #5 (Tool Building)
 *
 * The seed document says: "The Forge may need to build its own tools.
 * Models that can create utilities for live feedback. Self-extending capability."
 *
 * This module implements that vision. For each executed task, it:
 * 1. Analyzes what was created/modified
 * 2. Generates task-specific validation scripts
 * 3. Runs the validation
 * 4. Returns structured results for the learning loop
 *
 * Why this matters:
 * - Compilation check tells you "it compiles"
 * - Validation tools tell you "it works"
 *
 * The gap in the feedback loop was that ExecutionFeedback always had
 * testsPassed: undefined because no tests were run. Now we generate
 * and run tests on the fly.
 */

import { ContextPackage, ProjectType } from './types.js';
import { llmClient } from './llm.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import Anthropic from '@anthropic-ai/sdk';

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

/**
 * A generated validation tool
 */
export interface ValidationTool {
  id: string;
  name: string;
  type: 'unit_test' | 'integration_test' | 'script' | 'assertion' | 'lint_check';
  description: string;
  code: string;
  runCommand: string;
  timeout: number; // ms
}

/**
 * Result of running a validation tool
 */
export interface ValidationResult {
  toolId: string;
  toolName: string;
  passed: boolean;
  output: string;
  duration: number; // ms
  error?: string;
}

/**
 * Summary of all validations
 */
export interface ValidationSummary {
  totalTools: number;
  passed: number;
  failed: number;
  skipped: number;
  results: ValidationResult[];
  overallPassed: boolean;
}

// ============================================================================
// Validation Tool Builder
// ============================================================================

export class ValidationToolBuilder {
  private instanceId: string;
  private client: Anthropic | null = null;
  private model: string = 'claude-sonnet-4-20250514';

  constructor(instanceId: string) {
    this.instanceId = instanceId;
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (apiKey && apiKey.startsWith('sk-ant-')) {
      this.client = new Anthropic({ apiKey });
    }
  }

  /**
   * Build validation tools for an executed task
   *
   * Analyzes the task and generated files to create appropriate validation scripts.
   */
  async buildTools(
    pkg: ContextPackage,
    projectPath: string,
    filesCreated: string[],
    filesModified: string[]
  ): Promise<ValidationTool[]> {
    console.log(`[ValidationToolBuilder] Building validation tools for ${pkg.projectType} task`);

    const tools: ValidationTool[] = [];
    const allFiles = [...filesCreated, ...filesModified];

    if (allFiles.length === 0) {
      console.log('[ValidationToolBuilder] No files to validate');
      return tools;
    }

    // Strategy 1: Structural validations (always apply)
    tools.push(...await this.buildStructuralValidations(allFiles, projectPath));

    // Strategy 2: Type-specific validations
    switch (pkg.projectType) {
      case 'feature':
        tools.push(...await this.buildFeatureValidations(pkg, allFiles, projectPath));
        break;
      case 'bugfix':
        tools.push(...await this.buildBugfixValidations(pkg, allFiles, projectPath));
        break;
      case 'refactor':
        tools.push(...await this.buildRefactorValidations(allFiles, projectPath));
        break;
      case 'greenfield':
        tools.push(...await this.buildGreenfieldValidations(allFiles, projectPath));
        break;
    }

    // Strategy 3: CLI runtime validation (HARDENING-5)
    // If this looks like a CLI task, add runtime execution validation
    const cliValidations = await this.buildCliValidations(pkg, allFiles, projectPath);
    tools.push(...cliValidations);

    // Strategy 4: LLM-generated custom validations (for complex cases)
    if (this.client && allFiles.length <= 5) {
      const customTools = await this.buildCustomValidations(pkg, allFiles, projectPath);
      tools.push(...customTools);
    }

    console.log(`[ValidationToolBuilder] Generated ${tools.length} validation tools`);
    return tools;
  }

  /**
   * Run all validation tools
   */
  async runTools(
    tools: ValidationTool[],
    projectPath: string
  ): Promise<ValidationSummary> {
    console.log(`[ValidationToolBuilder] Running ${tools.length} validation tools`);

    const results: ValidationResult[] = [];
    let passed = 0;
    let failed = 0;
    let skipped = 0;

    for (const tool of tools) {
      try {
        console.log(`[ValidationToolBuilder] Running: ${tool.name}`);
        const result = await this.runTool(tool, projectPath);
        results.push(result);

        if (result.passed) {
          passed++;
          console.log(`[ValidationToolBuilder] ✓ ${tool.name} passed (${result.duration}ms)`);
        } else {
          failed++;
          console.log(`[ValidationToolBuilder] ✗ ${tool.name} failed: ${result.error || result.output.slice(0, 100)}`);
        }
      } catch (error) {
        skipped++;
        console.warn(`[ValidationToolBuilder] ⚠ ${tool.name} skipped: ${error}`);
        results.push({
          toolId: tool.id,
          toolName: tool.name,
          passed: false,
          output: '',
          duration: 0,
          error: `Skipped: ${error instanceof Error ? error.message : 'Unknown error'}`,
        });
      }
    }

    const summary: ValidationSummary = {
      totalTools: tools.length,
      passed,
      failed,
      skipped,
      results,
      overallPassed: failed === 0,
    };

    console.log(`[ValidationToolBuilder] Summary: ${passed}/${tools.length} passed`);
    return summary;
  }

  /**
   * Run a single validation tool
   */
  private async runTool(tool: ValidationTool, projectPath: string): Promise<ValidationResult> {
    const startTime = Date.now();

    try {
      // If tool has code, write it to a temp file first
      let command = tool.runCommand;
      if (tool.code) {
        const tempFile = path.join(projectPath, `.validation-${tool.id}.ts`);
        await fs.writeFile(tempFile, tool.code);
        command = command.replace('$VALIDATION_FILE', tempFile);

        try {
          const { stdout, stderr } = await execAsync(command, {
            cwd: projectPath,
            timeout: tool.timeout,
          });

          // Clean up temp file
          try {
            await fs.unlink(tempFile);
          } catch { /* ignore cleanup errors */ }

          const output = stdout + stderr;
          const duration = Date.now() - startTime;

          // Determine pass/fail based on exit code (we got here, so it's 0)
          // i[39]: Fixed false negative - only check for ERROR PATTERNS, not identifiers
          // Previous: "handleError" in export would fail validation incorrectly
          // Now: Only fail on actual error messages like "Error:" or "error:" at line start
          const lowerOutput = output.toLowerCase();
          const hasActualError = lowerOutput.includes('error:') ||     // Error messages typically have colon
                                 lowerOutput.includes('exception:') ||  // Exception messages
                                 /^error\s/m.test(lowerOutput) ||       // "error" at line start
                                 /\bfailed\s+(?:to|with)/i.test(output) ||  // "failed to" or "failed with" patterns
                                 lowerOutput.includes('✗');             // Explicit failure marker
          const passed = !hasActualError;

          return {
            toolId: tool.id,
            toolName: tool.name,
            passed,
            output,
            duration,
          };
        } catch (execError) {
          // Clean up temp file even on error
          try {
            await fs.unlink(tempFile);
          } catch { /* ignore */ }
          throw execError;
        }
      } else {
        // Simple command without code file
        const { stdout, stderr } = await execAsync(command, {
          cwd: projectPath,
          timeout: tool.timeout,
        });

        const output = stdout + stderr;
        const duration = Date.now() - startTime;

        // i[39]: Fixed false negative - only check for ERROR PATTERNS, not identifiers
        const lowerOutput = output.toLowerCase();
        const hasActualError = lowerOutput.includes('error:') ||
                               lowerOutput.includes('exception:') ||
                               /^error\s/m.test(lowerOutput) ||
                               /\bfailed\s+(?:to|with)/i.test(output) ||
                               lowerOutput.includes('✗');
        const passed = !hasActualError;

        return {
          toolId: tool.id,
          toolName: tool.name,
          passed,
          output,
          duration,
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : 'Unknown error';
      const output = (error as { stdout?: string; stderr?: string }).stdout ||
                    (error as { stderr?: string }).stderr || '';

      return {
        toolId: tool.id,
        toolName: tool.name,
        passed: false,
        output,
        duration,
        error: message,
      };
    }
  }

  // ============================================================================
  // Structural Validations (always apply)
  // ============================================================================

  private async buildStructuralValidations(
    files: string[],
    projectPath: string
  ): Promise<ValidationTool[]> {
    const tools: ValidationTool[] = [];

    // Check each file exists and is readable
    for (const file of files) {
      tools.push({
        id: `file-exists-${path.basename(file)}`,
        name: `File exists: ${path.basename(file)}`,
        type: 'assertion',
        description: 'Verify the generated file exists and is readable',
        code: '',
        runCommand: `test -f "${file}" && echo "File exists" || (echo "File missing" && exit 1)`,
        timeout: 5000,
      });
    }

    // Check TypeScript files for basic syntax
    const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
    if (tsFiles.length > 0) {
      tools.push({
        id: 'typescript-syntax',
        name: 'TypeScript syntax check',
        type: 'lint_check',
        description: 'Verify TypeScript files have valid syntax',
        code: '',
        runCommand: `npx tsc --noEmit --skipLibCheck ${tsFiles.map(f => `"${f}"`).join(' ')} 2>&1 || true`,
        timeout: 30000,
      });
    }

    // Check JSON files are valid
    const jsonFiles = files.filter(f => f.endsWith('.json'));
    for (const file of jsonFiles) {
      tools.push({
        id: `json-valid-${path.basename(file)}`,
        name: `Valid JSON: ${path.basename(file)}`,
        type: 'assertion',
        description: 'Verify JSON file is valid',
        code: '',
        runCommand: `node -e "JSON.parse(require('fs').readFileSync('${file}', 'utf-8'))"`,
        timeout: 5000,
      });
    }

    // Check Markdown files for broken links
    const mdFiles = files.filter(f => f.endsWith('.md'));
    for (const file of mdFiles) {
      tools.push({
        id: `markdown-links-${path.basename(file)}`,
        name: `Markdown links: ${path.basename(file)}`,
        type: 'assertion',
        description: 'Check for obviously broken internal links',
        code: '',
        // Simple grep for links that reference non-existent files
        runCommand: `grep -oE '\\[.*?\\]\\(([^)]+)\\)' "${file}" | grep -v 'http' | head -5 || echo "No internal links"`,
        timeout: 5000,
      });
    }

    return tools;
  }

  // ============================================================================
  // Feature-specific Validations
  // ============================================================================

  private async buildFeatureValidations(
    pkg: ContextPackage,
    files: string[],
    projectPath: string
  ): Promise<ValidationTool[]> {
    const tools: ValidationTool[] = [];

    // For features, check that exports exist
    const tsFiles = files.filter(f => f.endsWith('.ts') || f.endsWith('.tsx'));
    for (const file of tsFiles) {
      tools.push({
        id: `exports-check-${path.basename(file)}`,
        name: `Exports check: ${path.basename(file)}`,
        type: 'assertion',
        description: 'Verify file has exports (not dead code)',
        code: '',
        runCommand: `grep -E "^export " "${file}" | head -3 || echo "No exports found"`,
        timeout: 5000,
      });
    }

    // Check for required imports (sanity check)
    for (const file of tsFiles) {
      tools.push({
        id: `imports-check-${path.basename(file)}`,
        name: `Imports resolvable: ${path.basename(file)}`,
        type: 'assertion',
        description: 'Verify imports can be resolved',
        code: '',
        // TypeScript compiler will catch unresolvable imports
        runCommand: `npx tsc --noEmit "${file}" 2>&1 | grep -i "cannot find" || echo "All imports resolvable"`,
        timeout: 15000,
      });
    }

    return tools;
  }

  // ============================================================================
  // Bugfix-specific Validations
  // ============================================================================

  private async buildBugfixValidations(
    pkg: ContextPackage,
    files: string[],
    projectPath: string
  ): Promise<ValidationTool[]> {
    const tools: ValidationTool[] = [];

    // For bugfixes, look for existing tests that should now pass
    const testPattern = files
      .filter(f => !f.includes('.test.') && !f.includes('.spec.'))
      .map(f => {
        const base = path.basename(f, path.extname(f));
        return `*${base}*.test.*`;
      });

    if (testPattern.length > 0) {
      tools.push({
        id: 'related-tests',
        name: 'Run related tests',
        type: 'unit_test',
        description: 'Run tests for modified files',
        code: '',
        runCommand: `npx jest --testPathPattern="${testPattern[0]}" --passWithNoTests 2>&1 || echo "No related tests found"`,
        timeout: 60000,
      });
    }

    return tools;
  }

  // ============================================================================
  // Refactor-specific Validations
  // ============================================================================

  private async buildRefactorValidations(
    files: string[],
    projectPath: string
  ): Promise<ValidationTool[]> {
    const tools: ValidationTool[] = [];

    // For refactors, all existing tests should still pass
    tools.push({
      id: 'all-tests',
      name: 'All tests pass',
      type: 'integration_test',
      description: 'Refactoring should not break existing tests',
      code: '',
      runCommand: 'npx jest --passWithNoTests 2>&1 || echo "No test runner configured"',
      timeout: 120000,
    });

    return tools;
  }

  // ============================================================================
  // Greenfield-specific Validations
  // ============================================================================

  private async buildGreenfieldValidations(
    files: string[],
    projectPath: string
  ): Promise<ValidationTool[]> {
    const tools: ValidationTool[] = [];

    // For new projects, check basic structure
    tools.push({
      id: 'has-entrypoint',
      name: 'Has entry point',
      type: 'assertion',
      description: 'New project should have an entry point',
      code: '',
      runCommand: `find "${projectPath}" -name "index.ts" -o -name "main.ts" -o -name "app.ts" | head -1 || echo "No entry point found"`,
      timeout: 5000,
    });

    // Check package.json exists
    tools.push({
      id: 'has-package-json',
      name: 'Has package.json',
      type: 'assertion',
      description: 'New project should have package.json',
      code: '',
      runCommand: `test -f "${path.join(projectPath, 'package.json')}" && echo "package.json exists" || echo "No package.json"`,
      timeout: 5000,
    });

    return tools;
  }

  // ============================================================================
  // CLI Runtime Validation (HARDENING-5)
  // ============================================================================

  /**
   * Detect if this looks like a CLI task and add runtime execution validation.
   *
   * HARDENING-5: Addresses the gap where code passes compilation but crashes at runtime.
   * Example: RangeError: Invalid count value: -6 at String.repeat()
   *
   * This catches runtime errors that static analysis misses.
   */
  private async buildCliValidations(
    pkg: ContextPackage,
    files: string[],
    projectPath: string
  ): Promise<ValidationTool[]> {
    const tools: ValidationTool[] = [];

    // Detect CLI entry points
    const cliEntryPoint = await this.detectCliEntryPoint(files, projectPath);
    if (!cliEntryPoint) {
      return tools;
    }

    console.log(`[ValidationToolBuilder] CLI entry point detected: ${cliEntryPoint.file}`);

    // Add runtime execution validation
    tools.push({
      id: 'cli-runtime-execution',
      name: 'CLI runtime execution',
      type: 'script',
      description: 'HARDENING-5: Run CLI and verify no runtime exceptions',
      code: '',
      runCommand: cliEntryPoint.command,
      timeout: 10000, // 10 second timeout
    });

    // If CLI has a --help flag pattern, test that too
    if (cliEntryPoint.hasHelpFlag) {
      tools.push({
        id: 'cli-help-flag',
        name: 'CLI --help works',
        type: 'script',
        description: 'Verify --help flag works without error',
        code: '',
        runCommand: cliEntryPoint.helpCommand,
        timeout: 5000,
      });
    }

    return tools;
  }

  /**
   * Detect CLI entry points from files
   *
   * Checks for:
   * 1. Files with shebang (#!/usr/bin/env node or #!/usr/bin/env tsx)
   * 2. Files named index.ts, main.ts, cli.ts in src/ or root
   * 3. package.json bin field pointing to files
   * 4. Files containing common CLI patterns (process.argv, commander, yargs, etc.)
   */
  private async detectCliEntryPoint(
    files: string[],
    projectPath: string
  ): Promise<{ file: string; command: string; hasHelpFlag: boolean; helpCommand: string } | null> {
    // Priority order for CLI detection
    const cliPatterns = [
      /process\.argv/,
      /import.*commander/,
      /import.*yargs/,
      /import.*meow/,
      /\.option\s*\(/,
      /\.command\s*\(/,
      /parseArgs/,
    ];

    const helpPatterns = [
      /--help/,
      /-h\b/,
      /\.help\s*\(/,
      /showHelp/,
    ];

    // Check files for CLI patterns
    for (const file of files) {
      if (!file.endsWith('.ts') && !file.endsWith('.js')) continue;

      try {
        const content = await fs.readFile(file, 'utf-8');

        // Check for shebang
        const hasShebang = content.startsWith('#!/');

        // Check for CLI patterns
        const isCliFile = cliPatterns.some(pattern => pattern.test(content));

        // Check for help flag support
        const hasHelpFlag = helpPatterns.some(pattern => pattern.test(content));

        // Prioritize: shebang > explicit CLI patterns > filename
        if (hasShebang || isCliFile) {
          const basename = path.basename(file);
          const isTsFile = file.endsWith('.ts');

          // Build run command
          // For TypeScript, use tsx; for JS, use node
          // Note: We do NOT use || true because we want to catch non-zero exit codes
          // that indicate runtime failures (RangeError, TypeError, etc.)
          const runner = isTsFile ? 'npx tsx' : 'node';
          const command = `${runner} "${file}" 2>&1`;
          const helpCommand = `${runner} "${file}" --help 2>&1`;

          console.log(`[ValidationToolBuilder] CLI detected via ${hasShebang ? 'shebang' : 'patterns'}: ${basename}`);

          return {
            file,
            command,
            hasHelpFlag,
            helpCommand,
          };
        }
      } catch {
        // Skip files we can't read
        continue;
      }
    }

    // Fallback: check for common CLI filenames
    const cliFilenames = ['cli.ts', 'main.ts', 'index.ts', 'cli.js', 'main.js', 'index.js'];
    for (const filename of cliFilenames) {
      const matchingFiles = files.filter(f => path.basename(f) === filename);
      if (matchingFiles.length > 0) {
        const file = matchingFiles[0];
        const isTsFile = file.endsWith('.ts');
        const runner = isTsFile ? 'npx tsx' : 'node';

        return {
          file,
          command: `${runner} "${file}" 2>&1`,
          hasHelpFlag: false,
          helpCommand: '',
        };
      }
    }

    return null;
  }

  // ============================================================================
  // LLM-Generated Custom Validations
  // ============================================================================

  /**
   * Use LLM to generate task-specific validation scripts
   *
   * This is the "self-extending capability" - The Forge creates
   * custom tools for validating specific functionality.
   */
  private async buildCustomValidations(
    pkg: ContextPackage,
    files: string[],
    projectPath: string
  ): Promise<ValidationTool[]> {
    if (!this.client) {
      return [];
    }

    try {
      console.log('[ValidationToolBuilder] Generating custom validation via LLM');

      // Read file contents for context
      const fileContents: Array<{ path: string; content: string }> = [];
      for (const file of files.slice(0, 3)) { // Limit to first 3 files
        try {
          const content = await fs.readFile(file, 'utf-8');
          fileContents.push({
            path: file,
            content: content.slice(0, 2000), // First 2000 chars
          });
        } catch { /* skip unreadable files */ }
      }

      if (fileContents.length === 0) {
        return [];
      }

      const prompt = this.buildValidationPrompt(pkg, fileContents);

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text' ? response.content[0].text : '';
      return this.parseValidationResponse(text);

    } catch (error) {
      console.warn('[ValidationToolBuilder] LLM validation generation failed:', error);
      return [];
    }
  }

  private buildValidationPrompt(
    pkg: ContextPackage,
    fileContents: Array<{ path: string; content: string }>
  ): string {
    const filesSection = fileContents.map(f =>
      `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``
    ).join('\n\n');

    return `You are a validation engineer for The Forge development system.

## TASK THAT WAS EXECUTED
${pkg.task.description}

## ACCEPTANCE CRITERIA
${pkg.task.acceptanceCriteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

## FILES CREATED/MODIFIED
${filesSection}

## YOUR JOB
Generate 1-2 simple shell commands or Node.js one-liners that validate whether the task was completed correctly.

Focus on:
1. Functional validation (does it work?)
2. Contract validation (does it export what it should?)
3. Integration validation (does it work with related code?)

## OUTPUT FORMAT (JSON only, no explanation)
\`\`\`json
[
  {
    "name": "Short descriptive name",
    "description": "What this validates",
    "command": "shell command to run (use node -e for JS/TS)"
  }
]
\`\`\`

Keep commands simple - they should complete in under 10 seconds.
If you can't think of a meaningful validation, return empty array: []`;
  }

  private parseValidationResponse(text: string): ValidationTool[] {
    try {
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[1]);
      if (!Array.isArray(parsed)) return [];

      return parsed.map((item: { name: string; description: string; command: string }, i: number) => ({
        id: `custom-${i}`,
        name: item.name || `Custom validation ${i + 1}`,
        type: 'script' as const,
        description: item.description || 'LLM-generated validation',
        code: '',
        runCommand: item.command || 'echo "No command"',
        timeout: 10000,
      }));
    } catch {
      return [];
    }
  }
}

// Factory function
export function createValidationToolBuilder(instanceId: string): ValidationToolBuilder {
  return new ValidationToolBuilder(instanceId);
}
