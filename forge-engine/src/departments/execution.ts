/**
 * Execution Department
 *
 * i[13] contribution: The department that actually DOES the work.
 * i[16] enhancement: Context Budget Manager integration
 * i[18] enhancement: Tool Building integration for task-specific validation
 * i[22] enhancement: Anthropic tool_use for reliable structured output
 *
 * After 12 passes refining Preparation, this closes the loop.
 * The Forge can now prepare AND execute tasks.
 *
 * i[16] addition: Now uses intelligent context budget management instead of
 * dumb 3000-char truncation. Files are processed with:
 * - Token budget allocation by priority
 * - Signature extraction for large files
 * - Smart truncation preserving structural boundaries
 *
 * i[18] addition: Tool Building - generates and runs task-specific validation
 * tools. This solves Hard Problem #5 and closes the feedback loop properly.
 * Instead of just "does it compile", we can now ask "does it work".
 *
 * i[22] addition: Anthropic tool_use for code generation. REVIEW-003 identified
 * 67% "unknown_failure" and InsightGenerator recommended tool_use. Instead of
 * fragile JSON parsing from text, we now use tool_use which guarantees valid
 * structured output. The LLM must conform to the schema - no parsing needed.
 *
 * Structure:
 * - ExecutionForeman (Sonnet-tier): Orchestrates execution, manages workers
 * - CodeGenerationWorker (LLM): Generates code from ContextPackage
 * - FileOperationWorker: Creates/modifies files
 * - ValidationWorker: Runs TypeScript compilation, basic checks
 * - ValidationToolBuilder (i[18]): Generates and runs task-specific tests
 *
 * Key insight from seed document: "Preparation IS the product. If prep is right,
 * execution is almost mechanical." This department tests that hypothesis.
 */

import {
  ContextPackage,
  ExecutionFeedback,
  StructuredFailure,
  ForgeRunResult,
  classifyFailure,
  type FailurePhase,
} from '../types.js';
import {
  FeedbackRouter,
  createFeedbackRouter,
  ErrorContext,
  FeedbackAction,
} from '../feedback-router.js';
import { TierRouter, calculateCost } from '../tiers.js';
import { getPatternTracker } from '../pattern-tracker.js';
import { taskManager } from '../state.js';
import { mandrel, centralMandrel } from '../mandrel.js';
import { webSocketStreamer } from '../websocket-streamer.js';
import { processFilesWithBudget, TokenCounter, type BudgetedFile } from '../context-budget.js';
import {
  createValidationToolBuilder,
  ValidationToolBuilder,
  type ValidationSummary,
} from '../validation-tools.js';
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
  compilationAttempts: number; // i[27]: Track self-heal attempts
  compilationSelfHealed: boolean; // i[27]: Did self-heal fix compilation?
  validationPassed: boolean; // i[18]: Tool Building result
  validationSummary?: ValidationSummary; // i[18]: Detailed validation results
  notes: string;
  error?: string;
  structuredFailure?: StructuredFailure; // i[26]: Structured failure for analytics
  // INTEGRATION-4: Cost breakdown by phase
  costBreakdown?: {
    codeGeneration: number;
    selfHeal: number;
    total: number;
  };
}

/**
 * i[24]: Extended to support surgical edits
 */
interface FileEdit {
  search: string;
  replace: string;
}

interface CodeGenerationResult {
  success: boolean;
  files: Array<{
    path: string;
    action: 'create' | 'modify' | 'edit';
    content?: string;        // For create/modify
    edits?: FileEdit[];      // For edit action (i[24])
  }>;
  explanation: string;
  error?: string;
  costUsd?: number; // INTEGRATION-4: Track LLM cost
}

// ============================================================================
// i[22]: Tool Definition for Anthropic tool_use
// ============================================================================

/**
 * Tool definition for code generation output.
 *
 * i[22] contribution: Instead of asking the LLM to output JSON in text
 * (which requires fragile parsing), we define this as a tool that the
 * LLM calls with structured arguments. This guarantees valid output.
 *
 * The LLM is forced to call this tool, and Anthropic's API ensures the
 * arguments conform to the schema.
 */
/**
 * i[24]: Redesigned tool schema with surgical edit support.
 *
 * Root cause from i[23]: Context budget sends signatures for large files,
 * but old schema expected full file content. LLM invents content it didn't see,
 * destroys original file.
 *
 * Solution: Add 'edit' action with search/replace pairs for surgical modifications.
 * - 'create': New file with full content (unchanged)
 * - 'modify': Replace entire file (use only for small files)
 * - 'edit': Surgical search/replace edits (use for any existing file)
 */
const CODE_GENERATION_TOOL: Anthropic.Tool = {
  name: 'submit_code_changes',
  description: 'Submit the generated code changes for the task. Use "create" for new files, "edit" for surgical changes to existing files (preferred), or "modify" only for complete rewrites of small files.',
  input_schema: {
    type: 'object' as const,
    properties: {
      files: {
        type: 'array',
        description: 'Array of files to create, edit, or modify',
        items: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Absolute path to the file',
            },
            action: {
              type: 'string',
              enum: ['create', 'modify', 'edit'],
              description: 'create = new file, edit = surgical changes (preferred for existing files), modify = full replacement (only for small files)',
            },
            content: {
              type: 'string',
              description: 'For create/modify: the complete file content. Not used for edit action.',
            },
            edits: {
              type: 'array',
              description: 'For edit action: array of search/replace operations. CRITICAL: Each search string must be COMPLETE - never use ellipsis (...) to abbreviate.',
              items: {
                type: 'object',
                properties: {
                  search: {
                    type: 'string',
                    description: 'COMPLETE, VERBATIM text to find in the file. Must match exactly including whitespace. NEVER truncate with ellipsis (...) - the full text must be included.',
                  },
                  replace: {
                    type: 'string',
                    description: 'Text to replace the search string with',
                  },
                },
                required: ['search', 'replace'],
              },
            },
          },
          required: ['path', 'action'],
        },
      },
      explanation: {
        type: 'string',
        description: 'Brief explanation of what was generated and why',
      },
    },
    required: ['files', 'explanation'],
  },
};

// ============================================================================
// Workers
// ============================================================================

/**
 * CodeGenerationWorker
 *
 * Uses LLM to generate code based on ContextPackage.
 * This is where preparation meets execution.
 *
 * i[22] enhancement: Now uses Anthropic tool_use for guaranteed structured output.
 */
class CodeGenerationWorker {
  private client: Anthropic | null = null;
  private model: string = 'claude-sonnet-4-20250514';
  private lastBudgetResult: Awaited<ReturnType<typeof processFilesWithBudget>> | null = null;

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
   * i[16] enhancement: Now uses Context Budget Manager for intelligent
   * file content extraction instead of dumb truncation.
   *
   * i[22] enhancement: Now uses Anthropic tool_use for guaranteed structured
   * output. Instead of fragile JSON parsing from text, the LLM calls a tool
   * with structured arguments. This eliminates JSON parsing failures.
   *
   * Reads mustRead files, constructs prompt, calls LLM with tool_use
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

    // i[16]: Use Context Budget Manager for intelligent file content extraction
    // Budget: 40k tokens for file contents (leaving room for prompt structure)
    console.log('[Worker:CodeGeneration] Processing files with context budget...');

    const filesToProcess: Array<{ path: string; reason: string; priority: 'high' | 'medium' | 'low' }> = [];

    // Add mustRead as high priority
    for (const f of pkg.codeContext.mustRead) {
      filesToProcess.push({
        path: f.path,
        reason: f.reason,
        priority: 'high',
      });
    }

    // Add related examples as medium priority
    for (const example of pkg.codeContext.relatedExamples.slice(0, 5)) {
      filesToProcess.push({
        path: example.path,
        reason: example.similarity,
        priority: 'medium',
      });
    }

    // HARDENING-6: Pass projectPath so files are read with absolute paths
    const budgetResult = await processFilesWithBudget(filesToProcess, 40000, projectPath);

    // Report budget usage
    console.log(`[Worker:CodeGeneration] Context Budget Summary:`);
    console.log(`  Total files: ${budgetResult.summary.totalFiles}`);
    console.log(`  Full content: ${budgetResult.summary.includedFull}`);
    console.log(`  Signatures only: ${budgetResult.summary.includedSignatures}`);
    console.log(`  Truncated: ${budgetResult.summary.includedTruncated}`);
    console.log(`  Excluded: ${budgetResult.summary.excluded}`);
    console.log(`  Tokens used: ${budgetResult.summary.totalTokensUsed}`);
    console.log(`  Budget remaining: ${budgetResult.summary.budgetRemaining}`);

    // i[32]: CRITICAL FIX for surgical edit mismatch
    // Root cause (i[31]): LLM receives signatures-only, generates edits expecting full content.
    // Solution: For HIGH PRIORITY files (mustRead = edit targets), always provide full content.
    // Context budget is for UNDERSTANDING; edit targets need FULL CONTENT.
    const mustReadPaths = new Set(pkg.codeContext.mustRead.map(f => f.path));

    // Convert budgeted files to the format expected by buildPrompt
    const fileContents: Array<{ path: string; content: string; method?: string }> = [];
    let fullContentOverrides = 0;

    for (const file of budgetResult.files) {
      if (file.content) {
        // i[32]: If this is a mustRead file and we only got signatures/truncated,
        // read the full content so LLM can generate valid search strings
        const isMustRead = mustReadPaths.has(file.path);
        const needsFullContent = isMustRead &&
          (file.extractionMethod === 'signatures' || file.extractionMethod === 'truncated');

        if (needsFullContent) {
          try {
            // HARDENING-6: Use absolute path for file reading
            const absolutePath = path.join(projectPath, file.path);
            const fullContent = await fs.readFile(absolutePath, 'utf-8');
            fileContents.push({
              path: file.path,
              content: fullContent,
              method: 'full-override',
            });
            fullContentOverrides++;
            console.log(`[Worker:CodeGeneration] ${file.path}: ${file.extractionMethod} -> full-override (i[32] fix)`);
          } catch {
            fileContents.push({
              path: file.path,
              content: file.content,
              method: file.extractionMethod,
            });
            console.warn(`[Worker:CodeGeneration] ${file.path}: failed to read full content, using ${file.extractionMethod}`);
          }
        } else {
          fileContents.push({
            path: file.path,
            content: file.content,
            method: file.extractionMethod,
          });
          console.log(`[Worker:CodeGeneration] ${file.path}: ${file.extractionMethod} (${file.allocatedTokens} tokens)`);
        }
      }
    }

    if (fullContentOverrides > 0) {
      console.log(`[Worker:CodeGeneration] i[32] fix: Overrode ${fullContentOverrides} file(s) to full content for surgical edits`);
    }

    // Store this last budget result for logging
    this.lastBudgetResult = budgetResult;

    // Build the prompt (now without JSON output instructions)
    const prompt = this.buildPromptForToolUse(pkg, fileContents, projectPath);

    try {
      console.log('[Worker:CodeGeneration] Calling LLM with tool_use (i[22])...');
      // DEBUG: Log prompt for debugging
      if (process.env.FORGE_DEBUG_PROMPT) {
        console.log('[Worker:CodeGeneration] DEBUG - Full prompt:');
        console.log('='.repeat(80));
        console.log(prompt);
        console.log('='.repeat(80));
      }

      // i[22]: Use tool_use with tool_choice: 'any' to force structured output
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 8000,
        tools: [CODE_GENERATION_TOOL],
        tool_choice: { type: 'any' }, // Force the model to use a tool
        messages: [{ role: 'user', content: prompt }],
      });

      // Extract tool use from response
      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (!toolUse || toolUse.name !== 'submit_code_changes') {
        // Fallback: try legacy text parsing if no tool use found
        console.warn('[Worker:CodeGeneration] No tool_use in response, trying legacy parsing...');
        const textBlock = response.content.find(
          (block): block is Anthropic.TextBlock => block.type === 'text'
        );
        if (textBlock) {
          return this.parseResponse(textBlock.text, projectPath);
        }
        return {
          success: false,
          files: [],
          explanation: 'LLM did not call the submit_code_changes tool',
          error: 'NO_TOOL_USE_IN_RESPONSE',
        };
      }

      // i[22]: The input is already validated by Anthropic's API!
      // No JSON parsing needed - just validate and normalize
      const input = toolUse.input as {
        files?: Array<{ path: string; action: string; content: string }>;
        explanation?: string;
      };

      console.log(`[Worker:CodeGeneration] Tool use received: ${input.files?.length ?? 0} file(s)`);
      // INTEGRATION-4: Calculate cost from usage
      let costUsd = calculateCost(
        'sonnet',
        response.usage.input_tokens,
        response.usage.output_tokens
      );
      console.log(`[Worker:CodeGeneration] Cost: $${costUsd.toFixed(4)} (${response.usage.input_tokens} in / ${response.usage.output_tokens} out)`);

      // HARDENING-10: Feedback loop - if no files generated, retry with forceful prompt
      if (!input.files || input.files.length === 0) {
        console.log('[Worker:CodeGeneration] WARNING: No files generated. Retrying with explicit instruction...');

        const retryPrompt = `${prompt}

IMPORTANT: Your previous response had an EMPTY files array. This is not acceptable.
You provided this explanation: "${input.explanation}"

Now you MUST actually generate the code. Create the files described in your explanation.
The files array CANNOT be empty. Generate at least one file with actual code.

Call submit_code_changes now with the actual file contents:`;

        const retryResponse = await this.client.messages.create({
          model: this.model,
          max_tokens: 8000,
          tools: [CODE_GENERATION_TOOL],
          tool_choice: { type: 'any' },
          messages: [{ role: 'user', content: retryPrompt }],
        });

        const retryToolUse = retryResponse.content.find(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        );

        if (retryToolUse && retryToolUse.name === 'submit_code_changes') {
          const retryInput = retryToolUse.input as {
            files?: Array<{ path: string; action: string; content: string }>;
            explanation?: string;
          };

          const retryCost = calculateCost(
            'sonnet',
            retryResponse.usage.input_tokens,
            retryResponse.usage.output_tokens
          );
          costUsd += retryCost;
          console.log(`[Worker:CodeGeneration] Retry cost: $${retryCost.toFixed(4)} (${retryResponse.usage.input_tokens} in / ${retryResponse.usage.output_tokens} out)`);
          console.log(`[Worker:CodeGeneration] Retry produced ${retryInput.files?.length ?? 0} file(s)`);

          if (retryInput.files && retryInput.files.length > 0) {
            const result = this.validateAndNormalizeParsed(
              {
                files: retryInput.files,
                explanation: retryInput.explanation ?? 'Code generated via tool_use (retry)',
              },
              projectPath
            );
            result.costUsd = costUsd;
            return result;
          }
        }

        // Still no files after retry - return failure
        console.log('[Worker:CodeGeneration] ERROR: Still no files after retry. Returning failure.');
        return {
          success: false,
          files: [],
          explanation: input.explanation ?? 'LLM failed to generate code after retry',
          error: 'EMPTY_FILES_AFTER_RETRY',
          costUsd,
        };
      }

      const result = this.validateAndNormalizeParsed(
        {
          files: input.files ?? [],
          explanation: input.explanation ?? 'Code generated via tool_use',
        },
        projectPath
      );
      result.costUsd = costUsd;
      return result;

    } catch (error) {
      console.error('[Worker:CodeGeneration] LLM call failed:', error);
      return {
        success: false,
        files: [],
        explanation: 'LLM call failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        costUsd: 0,
      };
    }
  }

  /**
   * Build prompt for tool_use (i[22])
   *
   * Similar to buildPrompt but without JSON output instructions.
   * The output format is now handled by the tool definition.
   */
  private buildPromptForToolUse(
    pkg: ContextPackage,
    fileContents: Array<{ path: string; content: string; method?: string }>,
    projectPath: string
  ): string {
    // i[16]: Include extraction method info for transparency
    const filesSection = fileContents.map(f => {
      const methodNote = f.method && f.method !== 'full'
        ? `\n<!-- Content extracted using: ${f.method} -->`
        : '';
      return `### ${f.path}${methodNote}\n\`\`\`typescript\n${f.content}\n\`\`\``;
    }).join('\n\n');

    const patternsSection = `
- Naming: ${pkg.patterns.namingConventions}
- File Organization: ${pkg.patterns.fileOrganization}
- Error Handling: ${pkg.patterns.errorHandling}`;

    // i[38]: Refactor-aware prompting - fixes 0% refactor pass rate
    const isRefactor = pkg.projectType === 'refactor';
    const refactorGuidance = isRefactor ? `
## TASK TYPE: REFACTOR

This is a REFACTOR task. You MUST:
1. **Behavior stays the same** - do not change what the code does
2. **No duplicate logic** - when renaming, OLD NAME MUST BE REMOVED
3. **Update ALL usages** - imports, exports, call sites, everywhere
4. **Use 'edit' actions** with search/replace pairs

### FOR RENAMES:
- Find the old declaration and REPLACE it with the new name
- Find ALL call sites and update them
- The old name should NOT exist in the codebase after your changes

### FOR EXTRACTS:
- Add the new export
- Keep behavior intact
- Update any internal references
` : '';

    return `You are a code generation assistant for The Forge Development Cognition System.
${refactorGuidance}
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
4. Use the submit_code_changes tool to provide your code

## ACTION TYPES (CRITICAL - i[24])
- **create**: For NEW files only. Provide full content.
- **edit**: For MODIFYING EXISTING files. Provide search/replace pairs.
  This is the PREFERRED action for existing files because you may only see
  signatures or excerpts of large files, not the full content.
- **modify**: Only use for COMPLETE REWRITES of small files where you've seen
  the entire file content.

## EDIT FORMAT EXAMPLE
For the edit action, provide an array of search/replace operations:
\`\`\`json
{
  "path": "/path/to/file.ts",
  "action": "edit",
  "edits": [
    {
      "search": "res.json({ status: 'ok' })",
      "replace": "res.json({ status: 'ok', version: VERSION })"
    }
  ]
}
\`\`\`

### CRITICAL: SEARCH STRING REQUIREMENTS (HARDENING-14)
- The search string must be the COMPLETE, VERBATIM text from the file
- NEVER truncate with ellipsis (...) - this will FAIL
- NEVER abbreviate or summarize code - include the FULL text
- Include enough context (2-3 lines) to make the match UNIQUE in the file
- Copy the exact whitespace, indentation, and line breaks
- If a search string is too long, that's OK - include it all anyway
- The FileOperationWorker does LITERAL string matching - there is no fuzzy matching

Each edit is applied in order.

## OTHER REQUIREMENTS
- Use ABSOLUTE paths based on the project path: ${projectPath}
- Follow TypeScript conventions
- Include necessary imports
- Generate complete, working code

## MODULE INTEGRATION (HARDENING-7)
When creating NEW modules or files in a new directory, you MUST also update parent module files:

**For Rust projects:**
- New \`src/my_module/mod.rs\` → Add \`pub mod my_module;\` to \`src/lib.rs\` or \`src/main.rs\`
- New submodule \`src/parent/child.rs\` → Add \`pub mod child;\` to \`src/parent/mod.rs\`

**For TypeScript/JavaScript projects:**
- New module → Update relevant index.ts/index.js to re-export if needed
- New component → Add to barrel exports if the project uses them

Always check for existing module declaration files and add the necessary exports/declarations.

## ESM/NodeNext IMPORT REQUIREMENTS (HARDENING-4)
If the project uses ESM with NodeNext/Node16 module resolution (check constraints above), you MUST:
- Use namespace imports for Node.js built-ins: \`import * as fs from 'node:fs'\`
- NOT default imports: \`import fs from 'fs'\` ❌ (Node.js built-ins have no default export)
- Use the 'node:' protocol prefix: node:fs, node:path, node:os, node:crypto, node:http, node:util, etc.

**Common built-in modules requiring namespace imports:**
- \`import * as fs from 'node:fs'\` or \`import * as fs from 'node:fs/promises'\`
- \`import * as path from 'node:path'\`
- \`import * as os from 'node:os'\`
- \`import * as crypto from 'node:crypto'\`
- \`import * as http from 'node:http'\`
- \`import * as https from 'node:https'\`
- \`import * as url from 'node:url'\`
- \`import * as util from 'node:util'\`
- \`import * as child_process from 'node:child_process'\`

## CRITICAL: YOU MUST GENERATE ACTUAL CODE (HARDENING-10)
- The \`files\` array in your tool call MUST NOT be empty
- Do NOT just explain what you would do - actually DO IT
- Every task requires at least one file to be created or modified
- If you're unsure, create the new file(s) anyway - we can iterate
- An empty files array is a FAILURE - you must produce working code

## FINAL REMINDER: SEARCH STRINGS (HARDENING-14)
When using "edit" action, your search strings will be matched LITERALLY against the file.
- Include the COMPLETE text, not a summary or abbreviation
- Using "..." or truncating the string = GUARANTEED FAILURE
- Copy the exact code from the file, including all whitespace

Generate the code now by calling the submit_code_changes tool with actual file changes:`;
  }

  private buildPrompt(
    pkg: ContextPackage,
    fileContents: Array<{ path: string; content: string; method?: string }>,
    projectPath: string
  ): string {
    // i[16]: Include extraction method info for transparency
    const filesSection = fileContents.map(f => {
      const methodNote = f.method && f.method !== 'full'
        ? `\n<!-- Content extracted using: ${f.method} -->`
        : '';
      return `### ${f.path}${methodNote}\n\`\`\`typescript\n${f.content}\n\`\`\``;
    }).join('\n\n');

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

  /**
   * Parse LLM response to extract generated code
   *
   * i[19] enhancement: Robust parsing that handles common LLM JSON issues:
   * - Unescaped newlines in code strings
   * - Mixed quote styles
   * - Trailing commas
   * - Code blocks within JSON content
   */
  private parseResponse(text: string, projectPath: string): CodeGenerationResult {
    try {
      // Strategy 1: Extract JSON from markdown code block
      const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          return this.validateAndNormalizeParsed(parsed, projectPath);
        } catch {
          // JSON in code block was malformed, try repair
          const repaired = this.repairJson(jsonMatch[1]);
          if (repaired) {
            return this.validateAndNormalizeParsed(repaired, projectPath);
          }
        }
      }

      // Strategy 2: Try raw JSON extraction
      const rawJsonMatch = text.match(/\{[\s\S]*"files"[\s\S]*\}/);
      if (rawJsonMatch) {
        try {
          const parsed = JSON.parse(rawJsonMatch[0]);
          return this.validateAndNormalizeParsed(parsed, projectPath);
        } catch {
          const repaired = this.repairJson(rawJsonMatch[0]);
          if (repaired) {
            return this.validateAndNormalizeParsed(repaired, projectPath);
          }
        }
      }

      // Strategy 3: Extract files individually using regex
      // This handles cases where JSON structure is broken but content is there
      const filesResult = this.extractFilesFromBrokenJson(text, projectPath);
      if (filesResult.files.length > 0) {
        console.log(`[Worker:CodeGeneration] Recovered ${filesResult.files.length} file(s) from malformed JSON`);
        return filesResult;
      }

      throw new Error('No valid JSON or extractable file content found in response');

    } catch (error) {
      console.error('[Worker:CodeGeneration] Failed to parse response:', error);
      // Log first/last portion of response for debugging
      console.error('[Worker:CodeGeneration] Response preview (first 500 chars):', text.slice(0, 500));
      console.error('[Worker:CodeGeneration] Response preview (last 500 chars):', text.slice(-500));
      return {
        success: false,
        files: [],
        explanation: 'Failed to parse LLM response',
        error: error instanceof Error ? error.message : 'Parse error',
      };
    }
  }

  /**
   * Attempt to repair common JSON issues from LLM output
   *
   * i[19]: Common issues:
   * - Literal newlines in string content (should be \n)
   * - Unescaped quotes and backslashes
   * - Trailing commas
   */
  private repairJson(jsonStr: string): { files?: unknown[]; explanation?: string } | null {
    try {
      // First, try as-is (maybe it's already valid)
      return JSON.parse(jsonStr);
    } catch {
      // Continue with repair attempts
    }

    try {
      // Try to fix the JSON by finding and escaping content fields
      // This is a targeted fix for code content with newlines
      let repaired = jsonStr;

      // Replace literal newlines inside string values with \n
      // Match "content": "..." patterns and escape newlines within
      repaired = repaired.replace(
        /"content"\s*:\s*"([\s\S]*?)"\s*([,}])/g,
        (match, content, ending) => {
          // Escape unescaped newlines, tabs, and backslashes
          const escaped = content
            .replace(/\\/g, '\\\\')  // Escape backslashes first
            .replace(/\n/g, '\\n')   // Then newlines
            .replace(/\r/g, '\\r')   // Carriage returns
            .replace(/\t/g, '\\t')   // Tabs
            .replace(/"/g, '\\"');   // Quotes (careful: may double-escape)
          return `"content": "${escaped}"${ending}`;
        }
      );

      // Remove trailing commas before } or ]
      repaired = repaired.replace(/,\s*([}\]])/g, '$1');

      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }

  /**
   * Last-resort extraction: Find file paths and content blocks
   * even if JSON structure is completely broken
   *
   * i[19]: Looks for patterns like:
   * - "path": "/some/path.ts"
   * - ```typescript ... ``` blocks
   */
  private extractFilesFromBrokenJson(
    text: string,
    projectPath: string
  ): CodeGenerationResult {
    const files: Array<{ path: string; content: string; action: 'create' | 'modify' }> = [];

    // Find all path declarations
    const pathMatches = [...text.matchAll(/"path"\s*:\s*"([^"]+)"/g)];

    // Find corresponding code blocks (look for typescript/ts blocks or content fields)
    for (const pathMatch of pathMatches) {
      const filePath = this.normalizePath(pathMatch[1], projectPath);

      // Look for content after this path declaration
      const afterPath = text.slice(pathMatch.index! + pathMatch[0].length);

      // Try to find a code block
      const codeBlockMatch = afterPath.match(/```(?:typescript|ts|javascript|js)?\s*([\s\S]*?)```/);

      if (codeBlockMatch) {
        files.push({
          path: filePath,
          content: codeBlockMatch[1].trim(),
          action: 'create', // Assume create when we can't determine
        });
      }
    }

    // Try to extract explanation
    const explanationMatch = text.match(/"explanation"\s*:\s*"([^"]+)"/);
    const explanation = explanationMatch
      ? explanationMatch[1]
      : 'Extracted from partially parsed response';

    return {
      success: files.length > 0,
      files,
      explanation,
      error: files.length === 0 ? 'Could not extract files from response' : undefined,
    };
  }

  /**
   * i[24]: Updated to handle edit action with search/replace pairs
   */
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

    const files = (parsed.files as Array<Record<string, unknown>>).map((f) => {
      const action = f.action === 'edit' ? 'edit' : (f.action === 'modify' ? 'modify' : 'create');
      const path = this.normalizePath(String(f.path || ''), projectPath);

      if (action === 'edit') {
        // i[24]: Handle edit action with search/replace pairs
        const edits = Array.isArray(f.edits)
          ? (f.edits as Array<Record<string, unknown>>).map(e => ({
              search: String(e.search || ''),
              replace: String(e.replace || ''),
            }))
          : [];
        return { path, action: action as 'edit', edits };
      } else {
        // create or modify - use content
        return {
          path,
          action: action as 'create' | 'modify',
          content: String(f.content || ''),
        };
      }
    });

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

  // i[16]: truncateContent removed - replaced by Context Budget Manager

  /**
   * Get the last budget result for reporting
   */
  getLastBudgetResult() {
    return this.lastBudgetResult;
  }

  /**
   * i[27]: Generate code to fix compilation errors.
   *
   * This is the self-heal capability: when compilation fails, we feed the
   * compiler errors back to the LLM and ask it to fix ONLY those errors.
   *
   * Key constraints:
   * - Only fix the specific errors shown
   * - Prefer 'edit' action with surgical search/replace
   * - Don't refactor or touch unrelated code
   * - Don't invent new content for files you haven't fully seen
   */
  async generateWithCompilationFeedback(
    pkg: ContextPackage,
    projectPath: string,
    compilerOutput: string,
    modifiedFiles: string[]
  ): Promise<CodeGenerationResult> {
    if (!this.client) {
      return {
        success: false,
        files: [],
        explanation: 'No LLM available for compilation fix',
        error: 'ANTHROPIC_API_KEY not configured',
      };
    }

    // Truncate compiler output to first 10 errors or 4000 chars
    const errorLines = compilerOutput.split('\n')
      .filter(line => line.includes('error TS'))
      .slice(0, 10);
    const truncatedErrors = errorLines.length > 0
      ? errorLines.join('\n')
      : compilerOutput.slice(0, 4000);

    // Build focused fix prompt
    const fixPrompt = this.buildCompilationFixPrompt(
      pkg,
      projectPath,
      truncatedErrors,
      modifiedFiles
    );

    try {
      console.log('[Worker:CodeGeneration] Calling LLM for compilation fix (i[27])...');

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 4000,
        tools: [CODE_GENERATION_TOOL],
        tool_choice: { type: 'any' },
        messages: [{ role: 'user', content: fixPrompt }],
      });

      const toolUse = response.content.find(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
      );

      if (!toolUse || toolUse.name !== 'submit_code_changes') {
        return {
          success: false,
          files: [],
          explanation: 'LLM did not call the submit_code_changes tool for fix',
          error: 'NO_TOOL_USE_FOR_FIX',
        };
      }

      const input = toolUse.input as {
        files?: Array<{ path: string; action: string; content?: string; edits?: Array<{ search: string; replace: string }> }>;
        explanation?: string;
      };

      console.log(`[Worker:CodeGeneration] Fix generated: ${input.files?.length ?? 0} file(s)`);

      // INTEGRATION-4: Calculate cost from usage
      const costUsd = calculateCost(
        'sonnet',
        response.usage.input_tokens,
        response.usage.output_tokens
      );
      console.log(`[Worker:CodeGeneration] Self-heal cost: $${costUsd.toFixed(4)} (${response.usage.input_tokens} in / ${response.usage.output_tokens} out)`);

      // Filter to only allow changes to files that were modified in the first pass
      // This prevents the LLM from making unauthorized changes
      const allowedFiles = new Set(modifiedFiles);
      const filteredFiles = (input.files ?? []).filter(f => {
        const isAllowed = allowedFiles.has(f.path);
        if (!isAllowed) {
          console.warn(`[Worker:CodeGeneration] Filtered out unauthorized fix to: ${f.path}`);
        }
        return isAllowed;
      });

      const result = this.validateAndNormalizeParsed(
        {
          files: filteredFiles,
          explanation: input.explanation ?? 'Compilation fix generated',
        },
        projectPath
      );
      result.costUsd = costUsd;
      return result;

    } catch (error) {
      console.error('[Worker:CodeGeneration] Compilation fix LLM call failed:', error);
      return {
        success: false,
        files: [],
        explanation: 'Compilation fix LLM call failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        costUsd: 0,
      };
    }
  }

  /**
   * i[27]: Build a focused prompt for fixing compilation errors.
   */
  private buildCompilationFixPrompt(
    pkg: ContextPackage,
    projectPath: string,
    compilerErrors: string,
    modifiedFiles: string[]
  ): string {
    return `You are a code repair assistant. Your ONLY job is to fix the compilation errors below.

## COMPILATION ERRORS
\`\`\`
${compilerErrors}
\`\`\`

## FILES YOU MAY MODIFY
You may ONLY make changes to these files (the ones touched in the previous pass):
${modifiedFiles.map(f => `- ${f}`).join('\n')}

## CONSTRAINTS (CRITICAL)
1. Fix ONLY the specific TypeScript errors shown above
2. Do NOT refactor unrelated code
3. Do NOT add new features or functionality
4. Do NOT modify files not listed above
5. Use the "edit" action with precise search/replace pairs

## SEARCH STRING REQUIREMENTS (HARDENING-14)
- The search string must be COMPLETE, VERBATIM text from the file
- NEVER truncate with ellipsis (...) - this will FAIL
- NEVER abbreviate - include the FULL text
- Include enough context (2-3 lines) to make the match UNIQUE
- Copy exact whitespace and indentation

## TASK CONTEXT (for reference only)
Original task: ${pkg.task.description}
Project: ${projectPath}

## ACTION TYPES
- **edit**: PREFERRED. Provide search/replace pairs for surgical fixes.
- **modify**: Only if you need to completely rewrite a small file.
- **create**: Only if an error indicates a missing file (rare).

## EXAMPLE FIX
If the error is "Property 'foo' does not exist on type 'Bar'", you might:
\`\`\`json
{
  "path": "/path/to/file.ts",
  "action": "edit",
  "edits": [
    {
      "search": "interface Bar {",
      "replace": "interface Bar {\\n  foo: string;"
    }
  ]
}
\`\`\`

Now fix ONLY the compilation errors by calling submit_code_changes:`;
  }
}

/**
 * FileOperationWorker
 *
 * Creates, modifies, and edits files safely.
 *
 * i[24]: Added support for surgical edits via search/replace.
 * This solves the root cause of the 14.3% success rate:
 * - Context budget sends signatures for large files
 * - LLM now uses edit action with search/replace instead of full file replacement
 * - Original file content is preserved, only targeted changes applied
 */
class FileOperationWorker {
  /**
   * Apply file operations from code generation
   *
   * i[24]: Now handles three action types:
   * - create: New file with full content
   * - modify: Replace entire file (legacy, use for small files only)
   * - edit: Surgical search/replace (preferred for existing files)
   */
  async apply(
    files: Array<{
      path: string;
      action: 'create' | 'modify' | 'edit';
      content?: string;
      edits?: FileEdit[];
    }>
  ): Promise<{
    created: string[];
    modified: string[];
    edited: string[];      // i[24]: Track files edited surgically
    errors: Array<{ path: string; error: string }>;
  }> {
    const created: string[] = [];
    const modified: string[] = [];
    const edited: string[] = [];
    const errors: Array<{ path: string; error: string }> = [];

    for (const file of files) {
      try {
        if (file.action === 'edit') {
          // i[24]: Surgical edit via search/replace
          const editResult = await this.applyEdits(file.path, file.edits || []);
          if (editResult.success) {
            edited.push(file.path);
            console.log(`[Worker:FileOperation] Edited: ${file.path} (${editResult.editsApplied} changes)`);
          } else {
            errors.push({ path: file.path, error: editResult.error || 'Edit failed' });
            console.error(`[Worker:FileOperation] Edit failed: ${file.path} - ${editResult.error}`);
          }
        } else {
          // create or modify - full file replacement
          const dir = path.dirname(file.path);
          await fs.mkdir(dir, { recursive: true });

          let exists = false;
          try {
            await fs.access(file.path);
            exists = true;
          } catch {
            exists = false;
          }

          await fs.writeFile(file.path, file.content || '', 'utf-8');

          if (exists) {
            modified.push(file.path);
            console.log(`[Worker:FileOperation] Modified: ${file.path}`);
          } else {
            created.push(file.path);
            console.log(`[Worker:FileOperation] Created: ${file.path}`);
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        errors.push({ path: file.path, error: message });
        console.error(`[Worker:FileOperation] Failed: ${file.path} - ${message}`);
      }
    }

    return { created, modified, edited, errors };
  }

  /**
   * i[24]: Apply search/replace edits to a file
   *
   * Each edit is applied in order. If any search string is not found,
   * the operation fails and the file is not modified.
   */
  private async applyEdits(
    filePath: string,
    edits: FileEdit[]
  ): Promise<{ success: boolean; editsApplied: number; error?: string }> {
    if (edits.length === 0) {
      return { success: false, editsApplied: 0, error: 'No edits provided' };
    }

    // Read original file
    let content: string;
    try {
      content = await fs.readFile(filePath, 'utf-8');
    } catch (error) {
      return {
        success: false,
        editsApplied: 0,
        error: `Cannot read file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Validate all search strings exist before applying any changes
    for (let i = 0; i < edits.length; i++) {
      const edit = edits[i];
      if (!content.includes(edit.search)) {
        // Provide helpful context for debugging
        const searchPreview = edit.search.length > 50
          ? edit.search.substring(0, 50) + '...'
          : edit.search;
        return {
          success: false,
          editsApplied: 0,
          error: `Edit ${i + 1}: Search string not found: "${searchPreview}"`,
        };
      }
    }

    // Apply all edits in order
    let modifiedContent = content;
    let editsApplied = 0;

    for (const edit of edits) {
      // Replace first occurrence only (to be precise)
      const index = modifiedContent.indexOf(edit.search);
      if (index !== -1) {
        modifiedContent =
          modifiedContent.substring(0, index) +
          edit.replace +
          modifiedContent.substring(index + edit.search.length);
        editsApplied++;
      }
    }

    // Write the modified content
    try {
      await fs.writeFile(filePath, modifiedContent, 'utf-8');
    } catch (error) {
      return {
        success: false,
        editsApplied: 0,
        error: `Cannot write file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    return { success: true, editsApplied };
  }
}

/**
 * ValidationWorker
 *
 * Runs basic validation checks on the result.
 */
class ValidationWorker {
  /**
   * Run compilation check (TypeScript or Rust)
   * HARDENING-11: Added Rust support via cargo check
   */
  async checkCompilation(projectPath: string): Promise<{
    passed: boolean;
    output: string;
    projectType: 'typescript' | 'rust' | 'unknown';
  }> {
    // Check for TypeScript project
    const tsconfigPath = path.join(projectPath, 'tsconfig.json');
    const hasTypeScript = await fs.access(tsconfigPath).then(() => true).catch(() => false);

    if (hasTypeScript) {
      return this.checkTypeScriptCompilation(projectPath);
    }

    // HARDENING-11: Check for Rust project
    const cargoPath = path.join(projectPath, 'Cargo.toml');
    const hasRust = await fs.access(cargoPath).then(() => true).catch(() => false);

    if (hasRust) {
      return this.checkRustCompilation(projectPath);
    }

    // No recognized project type
    console.log('[Worker:Validation] No tsconfig.json or Cargo.toml found, skipping compilation check');
    return { passed: true, output: 'No recognized project type', projectType: 'unknown' };
  }

  /**
   * Run TypeScript compilation check
   */
  private async checkTypeScriptCompilation(projectPath: string): Promise<{
    passed: boolean;
    output: string;
    projectType: 'typescript' | 'rust' | 'unknown';
  }> {
    try {
      console.log('[Worker:Validation] Running TypeScript compilation check...');
      const { stdout, stderr } = await execAsync(
        `cd "${projectPath}" && npx tsc --noEmit 2>&1`,
        { timeout: 60000 }
      );

      const output = stdout + stderr;
      const passed = !output.includes('error TS');

      console.log(`[Worker:Validation] TypeScript compilation: ${passed ? 'PASSED' : 'FAILED'}`);

      return { passed, output: output.trim() || 'Compilation successful', projectType: 'typescript' };

    } catch (error) {
      // tsc returns non-zero on errors
      const message = error instanceof Error ? (error as Error & { stdout?: string; stderr?: string }).stdout || (error as Error & { stderr?: string }).stderr || error.message : 'Unknown error';
      const passed = !message.includes('error TS');
      return { passed, output: message, projectType: 'typescript' };
    }
  }

  /**
   * Run Rust compilation check (HARDENING-11)
   */
  private async checkRustCompilation(projectPath: string): Promise<{
    passed: boolean;
    output: string;
    projectType: 'typescript' | 'rust' | 'unknown';
  }> {
    try {
      console.log('[Worker:Validation] Running Rust compilation check (cargo check)...');
      const { stdout, stderr } = await execAsync(
        `cd "${projectPath}" && cargo check --lib 2>&1`,
        { timeout: 120000 } // Rust compilation can be slow
      );

      const output = stdout + stderr;
      // Rust errors contain "error[E" pattern
      const passed = !output.includes('error[E') && !output.includes('error:');

      console.log(`[Worker:Validation] Rust compilation: ${passed ? 'PASSED' : 'FAILED'}`);

      return { passed, output: output.trim() || 'Compilation successful', projectType: 'rust' };

    } catch (error) {
      // cargo returns non-zero on errors
      const message = error instanceof Error ? (error as Error & { stdout?: string; stderr?: string }).stdout || (error as Error & { stderr?: string }).stderr || error.message : 'Unknown error';
      const passed = !message.includes('error[E') && !message.includes('error:');
      console.log(`[Worker:Validation] Rust compilation: ${passed ? 'PASSED' : 'FAILED'}`);
      return { passed, output: message, projectType: 'rust' };
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
  private toolBuilder: ValidationToolBuilder; // i[18]: Tool Building
  private feedbackRouter: FeedbackRouter | null = null; // Phase 6: Intelligent error routing
  private patternTracker = getPatternTracker(); // INTEGRATION-2: Direct pattern tracking for execution outcomes

  constructor(instanceId: string, tierRouter?: TierRouter) {
    this.instanceId = instanceId;
    this.codeWorker = new CodeGenerationWorker();
    this.fileWorker = new FileOperationWorker();
    this.validationWorker = new ValidationWorker();
    this.toolBuilder = createValidationToolBuilder(instanceId); // i[18]

    // Phase 6: Initialize FeedbackRouter if TierRouter provided
    if (tierRouter) {
      this.feedbackRouter = createFeedbackRouter(tierRouter, getPatternTracker());
      console.log('[Foreman:Execution] FeedbackRouter initialized (Phase 6)');
    }

    console.log('[Foreman:Execution] PatternTracker initialized (INTEGRATION-2)');
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
        compilationAttempts: 0, // i[27]
        compilationSelfHealed: false, // i[27]
        validationPassed: false, // i[18]
        notes: 'Task not found or not prepared',
        error: 'NO_CONTEXT_PACKAGE',
      };
    }

    const pkg = task.contextPackage;
    console.log(`[Foreman:Execution] Starting execution for task ${taskId}`);
    console.log(`[Foreman:Execution] Task: ${pkg.task.description.substring(0, 100)}...`);

    // Stream progress update for execution start
    webSocketStreamer.streamProgressUpdate(
      taskId,
      'execution',
      'start',
      'started',
      { taskDescription: pkg.task.description.substring(0, 100) + '...' }
    );

    // Transition to executing state
    taskManager.transitionState(taskId, 'executing', this.instanceId, 'Starting execution');

    try {
      // Phase 1: Code Generation
      console.log('\n[Foreman:Execution] Phase 1: Code Generation');
      webSocketStreamer.streamProgressUpdate(
        taskId,
        'execution',
        'code_generation',
        'started'
      );
      const codeResult = await this.codeWorker.generate(pkg, projectPath);

      if (!codeResult.success) {
        webSocketStreamer.streamProgressUpdate(
          taskId,
          'execution',
          'code_generation',
          'failed',
          undefined,
          codeResult.error
        );
        taskManager.transitionState(taskId, 'failed', this.instanceId, codeResult.error || 'Code generation failed');
        return {
          success: false,
          filesCreated: [],
          filesModified: [],
          filesRead: pkg.codeContext.mustRead.map(f => f.path),
          compilationPassed: false,
          compilationAttempts: 0, // i[27]
          compilationSelfHealed: false, // i[27]
          validationPassed: false, // i[18]
          notes: codeResult.explanation,
          error: codeResult.error,
        };
      }

      console.log(`[Foreman:Execution] Generated ${codeResult.files.length} file(s)`);
      console.log(`[Foreman:Execution] Explanation: ${codeResult.explanation}`);
      webSocketStreamer.streamProgressUpdate(
        taskId,
        'execution',
        'code_generation',
        'completed',
        {
          filesGenerated: codeResult.files.length,
          explanation: codeResult.explanation
        }
      );

      // INTEGRATION-4: Track costs
      let codeGenCost = codeResult.costUsd ?? 0;
      let selfHealCost = 0;

      // Phase 2: File Operations
      console.log('\n[Foreman:Execution] Phase 2: File Operations');
      webSocketStreamer.streamProgressUpdate(
        taskId,
        'execution',
        'file_operations',
        'started'
      );
      const fileResult = await this.fileWorker.apply(codeResult.files);

      if (fileResult.errors.length > 0) {
        const errorMsg = fileResult.errors.map(e => `${e.path}: ${e.error}`).join('; ');
        console.warn(`[Foreman:Execution] File operation errors: ${errorMsg}`);
        webSocketStreamer.streamProgressUpdate(
          taskId,
          'execution',
          'file_operations',
          'failed',
          { errors: fileResult.errors },
          errorMsg
        );
      } else {
        webSocketStreamer.streamProgressUpdate(
          taskId,
          'execution',
          'file_operations',
          'completed',
          {
            created: fileResult.created.length,
            modified: fileResult.modified.length,
            edited: fileResult.edited.length
          }
        );
      }

      // Phase 3: Compilation Validation (with self-heal loop - i[27])
      console.log('\n[Foreman:Execution] Phase 3: Compilation Validation');
      webSocketStreamer.streamProgressUpdate(
        taskId,
        'execution',
        'compilation',
        'started'
      );

      // HARDENING-13: Small delay to ensure files are fully written to disk
      // This prevents race conditions where tsc runs before file sync completes
      await new Promise(resolve => setTimeout(resolve, 100));

      let validation = await this.validationWorker.checkCompilation(projectPath);

      // i[27]: Self-heal loop - if compilation fails, try to fix it
      const MAX_COMPILATION_FIX_ATTEMPTS = 2;
      let compilationAttempts = 1;
      let compilationSelfHealed = false;
      const allModifiedFiles = [...fileResult.created, ...fileResult.modified, ...fileResult.edited];

      if (!validation.passed && allModifiedFiles.length > 0) {
        console.log('\n[Foreman:Execution] Phase 3b: Compilation Self-Heal (i[27] + Phase 6)');
        console.log(`[Foreman:Execution] Attempting to fix ${validation.output.split('error TS').length - 1} compilation error(s)...`);
        webSocketStreamer.streamProgressUpdate(
          taskId,
          'execution',
          'self_heal',
          'started',
          { errorCount: validation.output.split('error TS').length - 1 }
        );

        // Phase 6: Use FeedbackRouter for intelligent error routing if available
        let feedbackAction: FeedbackAction | null = null;
        if (this.feedbackRouter) {
          const errorCategory = this.feedbackRouter.categorizeError(validation.output);
          const errorContext: ErrorContext = {
            category: errorCategory,
            message: validation.output,
            previousAttempts: 0,
          };
          feedbackAction = await this.feedbackRouter.routeError(errorContext);
          console.log(`[Foreman:Execution] FeedbackRouter: ${errorCategory} -> ${feedbackAction.action}`);

          // If FeedbackRouter says escalate or human_sync immediately, skip self-heal
          if (feedbackAction.action === 'escalate' || feedbackAction.action === 'human_sync') {
            console.log(`[Foreman:Execution] FeedbackRouter recommends ${feedbackAction.action}: ${feedbackAction.reason}`);
            // Skip to end of self-heal loop
          }
        }

        // Only attempt self-heal if FeedbackRouter says retry (or not available)
        const shouldAttemptSelfHeal = !feedbackAction ||
          feedbackAction.action === 'retry';

        if (shouldAttemptSelfHeal) {
          for (let attempt = 0; attempt < MAX_COMPILATION_FIX_ATTEMPTS && !validation.passed; attempt++) {
            compilationAttempts++;

            // Phase 6: Update FeedbackRouter with attempt count
            if (this.feedbackRouter) {
              const errorCategory = this.feedbackRouter.categorizeError(validation.output);
              const errorContext: ErrorContext = {
                category: errorCategory,
                message: validation.output,
                previousAttempts: attempt + 1,
              };
              feedbackAction = await this.feedbackRouter.routeError(errorContext);

              // Check if we should stop retrying
              if (feedbackAction.action !== 'retry') {
                console.log(`[Foreman:Execution] FeedbackRouter says ${feedbackAction.action}: ${feedbackAction.reason}`);
                break;
              }

              // Use suggested fix from FeedbackRouter in the prompt
              if (feedbackAction.suggestedFix) {
                console.log(`[Foreman:Execution] FeedbackRouter fix hint: ${feedbackAction.suggestedFix}`);
              }
            }

            // Generate fix for compilation errors
            const fixResult = await this.codeWorker.generateWithCompilationFeedback(
              pkg,
              projectPath,
              validation.output,
              allModifiedFiles
            );

            // INTEGRATION-4: Accumulate self-heal costs
            selfHealCost += fixResult.costUsd ?? 0;

            if (!fixResult.success || fixResult.files.length === 0) {
              console.log(`[Foreman:Execution] Self-heal attempt ${attempt + 1} failed: ${fixResult.error || 'no fixes generated'}`);
              break;
            }

            // Apply the fix
            console.log(`[Foreman:Execution] Applying ${fixResult.files.length} fix(es)...`);
            const fixFileResult = await this.fileWorker.apply(fixResult.files);

            if (fixFileResult.errors.length > 0) {
              console.log(`[Foreman:Execution] Fix file operation errors: ${fixFileResult.errors.map(e => e.error).join('; ')}`);
              break;
            }

            // Track additional modifications from self-heal
            fileResult.modified.push(...fixFileResult.modified);
            fileResult.edited.push(...fixFileResult.edited);

            // Re-check compilation
            validation = await this.validationWorker.checkCompilation(projectPath);

            if (validation.passed) {
              compilationSelfHealed = true;
              console.log(`[Foreman:Execution] ✓ Self-heal succeeded! Compilation now passes.`);
              webSocketStreamer.streamProgressUpdate(
                taskId,
                'execution',
                'self_heal',
                'completed',
                { attempt: attempt + 1, healed: true }
              );

              // Phase 6: Record pattern success if FeedbackRouter available
              if (this.feedbackRouter && feedbackAction?.patternToUpdate) {
                await this.feedbackRouter.recordPatternSuccess(
                  feedbackAction.patternToUpdate,
                  'self-heal-pattern',
                  pkg.projectType
                );
              }
            } else {
              console.log(`[Foreman:Execution] Self-heal attempt ${attempt + 1}: compilation still failing`);
            }
          }
        }

        if (!validation.passed) {
          console.log(`[Foreman:Execution] Self-heal exhausted after ${compilationAttempts} attempts`);
          webSocketStreamer.streamProgressUpdate(
            taskId,
            'execution',
            'self_heal',
            'failed',
            { attempts: compilationAttempts },
            'Self-heal exhausted'
          );

          // Phase 6: Record pattern failure if FeedbackRouter available
          if (this.feedbackRouter && feedbackAction?.patternToUpdate) {
            await this.feedbackRouter.recordPatternFailure(
              feedbackAction.patternToUpdate,
              'self-heal-pattern'
            );
          }

          // HARDENING-12: Store compilation errors as learning for future runs
          await this.storeCompilationErrorLearning(validation.output, projectPath, allModifiedFiles);
        }
      }

      // Phase 4: Tool Building (i[18] - Hard Problem #5)
      // Generate and run task-specific validation tools
      console.log('\n[Foreman:Execution] Phase 4: Tool Building (i[18])');
      webSocketStreamer.streamProgressUpdate(
        taskId,
        'execution',
        'validation',
        'started'
      );
      let validationSummary: ValidationSummary | undefined;
      let validationPassed = true;

      try {
        // i[24]: Include edited files in validation
        const allFiles = [...fileResult.created, ...fileResult.modified, ...fileResult.edited];
        if (allFiles.length > 0) {
          const tools = await this.toolBuilder.buildTools(
            pkg,
            projectPath,
            fileResult.created,
            [...fileResult.modified, ...fileResult.edited]  // i[24]: edited files count as modified
          );

          if (tools.length > 0) {
            validationSummary = await this.toolBuilder.runTools(tools, projectPath);
            validationPassed = validationSummary.overallPassed;

            console.log(`[Foreman:Execution] Tool Building: ${validationSummary.passed}/${validationSummary.totalTools} validations passed`);
            webSocketStreamer.streamProgressUpdate(
              taskId,
              'execution',
              'validation',
              validationPassed ? 'completed' : 'failed',
              {
                passed: validationSummary.passed,
                total: validationSummary.totalTools
              }
            );
          } else {
            console.log('[Foreman:Execution] No validation tools generated');
            webSocketStreamer.streamProgressUpdate(
              taskId,
              'execution',
              'validation',
              'completed',
              { noToolsGenerated: true }
            );
          }
        }
      } catch (toolError) {
        console.warn('[Foreman:Execution] Tool Building error (non-fatal):', toolError);
        webSocketStreamer.streamProgressUpdate(
          taskId,
          'execution',
          'validation',
          'failed',
          undefined,
          toolError instanceof Error ? toolError.message : 'Unknown tool error'
        );
        // Tool Building failures are non-fatal - we still have compilation check
      }

      // Build result
      // i[21]: Determine specific failure reason for learning loop
      // Previously result.error was only set in catch blocks, causing 67% "unknown_failure"
      // i[26]: Now creates StructuredFailure with phase + code for proper analytics
      let failureReason: string | undefined;
      let structuredFailure: StructuredFailure | undefined;

      if (!codeResult.success) {
        failureReason = codeResult.error || 'Code generation failed';
        structuredFailure = classifyFailure(
          failureReason,
          'code_generation' as FailurePhase,
          codeResult.explanation
        );
      } else if (fileResult.errors.length > 0) {
        failureReason = `File operation failed: ${fileResult.errors.map(e => e.error).join('; ')}`;
        // Determine specific file operation failure type
        const firstError = fileResult.errors[0]?.error || '';
        structuredFailure = classifyFailure(
          firstError,
          'file_operation' as FailurePhase,
          failureReason
        );
      } else if (!validation.passed) {
        // Extract first meaningful error from compilation output
        const compileErrors = validation.output.match(/error TS\d+: [^\n]+/g);
        failureReason = compileErrors
          ? `TypeScript error: ${compileErrors[0]}`
          : `Compilation failed: ${validation.output.substring(0, 150)}`;
        structuredFailure = classifyFailure(
          failureReason,
          'compilation' as FailurePhase,
          validation.output
        );
      } else if (!validationPassed && validationSummary) {
        const failed = validationSummary.results.filter(r => !r.passed);
        failureReason = `Validation failed: ${failed.map(f => f.toolName).join(', ')}`;
        structuredFailure = classifyFailure(
          failureReason,
          'validation' as FailurePhase,
          JSON.stringify(failed.map(f => ({ name: f.toolName, error: f.error })))
        );
      }

      // i[24]: Include edited files in modified count for result
      // i[26]: Include structuredFailure for analytics
      // i[27]: Include self-heal tracking
      // INTEGRATION-4: Include cost breakdown
      const totalCost = codeGenCost + selfHealCost;
      const result: ExecutionResult = {
        success: codeResult.success && fileResult.errors.length === 0 && validation.passed,
        filesCreated: fileResult.created,
        filesModified: [...fileResult.modified, ...fileResult.edited],  // i[24]: edited files are modified
        filesRead: pkg.codeContext.mustRead.map(f => f.path),
        compilationPassed: validation.passed,
        compilationAttempts, // i[27]: Track self-heal attempts
        compilationSelfHealed, // i[27]: Did self-heal fix compilation?
        validationPassed, // i[18]
        validationSummary, // i[18]
        notes: [
          codeResult.explanation,
          fileResult.edited.length > 0 ? `Surgical edits applied: ${fileResult.edited.length} file(s)` : '',  // i[24]
          compilationSelfHealed ? `Compilation self-healed after ${compilationAttempts} attempt(s) (i[27])` : '',  // i[27]
          validation.passed ? 'TypeScript compilation passed' : `Compilation issues: ${validation.output.substring(0, 200)}`,
          validationSummary ? `Tool validation: ${validationSummary.passed}/${validationSummary.totalTools} passed` : '',
        ].filter(Boolean).join('\n'),
        error: failureReason, // i[21]: Now captures specific failure reason
        structuredFailure, // i[26]: Structured failure for analytics
        // INTEGRATION-4: Cost breakdown
        costBreakdown: {
          codeGeneration: codeGenCost,
          selfHeal: selfHealCost,
          total: totalCost,
        },
      };

      // Set execution result on task
      taskManager.setExecutionResult(taskId, {
        success: result.success,
        filesCreated: result.filesCreated,
        filesModified: result.filesModified,
        testsPassed: validationPassed, // i[18]: Now set from Tool Building
        notes: result.notes,
      });

      // Transition state
      if (result.success) {
        taskManager.transitionState(taskId, 'reviewing', this.instanceId, 'Execution complete, ready for review');
      } else {
        taskManager.transitionState(taskId, 'blocked', this.instanceId, 'Execution had issues');
      }

      // Store to Mandrel (i[18]: now includes validation results, i[24]: surgical edits, i[26]: structured failure)
      const failureInfo = structuredFailure
        ? `\nFailure Phase: ${structuredFailure.phase}\nFailure Code: ${structuredFailure.code}\nFailure Message: ${structuredFailure.message}${structuredFailure.suggestedFix ? `\nSuggested Fix: ${structuredFailure.suggestedFix}` : ''}`
        : '';

      await mandrel.storeContext(
        `Execution complete for task ${taskId}:\n` +
        `Success: ${result.success}\n` +
        `Files Created: ${result.filesCreated.join(', ') || 'none'}\n` +
        `Files Modified: ${fileResult.modified.join(', ') || 'none'}\n` +
        `Files Edited (surgical): ${fileResult.edited.join(', ') || 'none'}\n` +  // i[24]
        `Compilation: ${result.compilationPassed ? 'PASSED' : 'FAILED'}\n` +
        `Validation: ${result.validationPassed ? 'PASSED' : 'FAILED'}${validationSummary ? ` (${validationSummary.passed}/${validationSummary.totalTools} tools passed)` : ''}\n` +
        `Cost: $${totalCost.toFixed(4)} (code gen: $${codeGenCost.toFixed(4)}, self-heal: $${selfHealCost.toFixed(4)})\n` +  // INTEGRATION-4
        failureInfo +  // i[26]: Structured failure info
        `\nNotes: ${result.notes}`,
        result.success ? 'completion' : 'error',
        [
          'execution',
          result.success ? 'success' : 'failed',
          this.instanceId,
          fileResult.edited.length > 0 ? 'surgical-edit' : 'tool-building',
          ...(structuredFailure ? [`failure-phase-${structuredFailure.phase}`, `failure-code-${structuredFailure.code}`] : [])
        ]
      );

      // INTEGRATION-2: Record pattern success/failure for learning
      const patternId = `exec-${pkg.projectType}-${pkg.id.slice(0, 8)}`;
      if (result.success) {
        await this.patternTracker.recordSuccess(
          patternId,
          `${pkg.projectType} execution`,
          pkg.task.description.slice(0, 50)
        );
        console.log(`[Foreman:Execution] PatternTracker: recorded success for ${patternId}`);
      } else {
        await this.patternTracker.recordFailure(
          patternId,
          `${pkg.projectType} execution`
        );
        console.log(`[Foreman:Execution] PatternTracker: recorded failure for ${patternId}`);
      }

      // INTEGRATION-4: Log cost breakdown
      console.log(`\n[Foreman:Execution] Cost Breakdown:`);
      console.log(`  Code Generation: $${codeGenCost.toFixed(4)}`);
      if (selfHealCost > 0) {
        console.log(`  Self-Heal: $${selfHealCost.toFixed(4)}`);
      }
      console.log(`  Total Execution: $${totalCost.toFixed(4)}`);

      console.log(`\n[Foreman:Execution] Complete: ${result.success ? 'SUCCESS' : 'ISSUES FOUND'}`);
      
      // Stream final execution completion
      webSocketStreamer.streamProgressUpdate(
        taskId,
        'execution',
        'complete',
        result.success ? 'completed' : 'failed',
        {
          filesCreated: result.filesCreated.length,
          filesModified: result.filesModified.length,
          compilationPassed: result.compilationPassed,
          validationPassed: result.validationPassed
        },
        result.error
      );
      
      return result;

    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      const stack = error instanceof Error ? error.stack : undefined;
      console.error(`[Foreman:Execution] Error: ${message}`);
      
      // Stream error event
      webSocketStreamer.streamError(
        taskId,
        message,
        'execution',
        { stack: stack?.substring(0, 500) }
      );

      taskManager.transitionState(taskId, 'failed', this.instanceId, message);

      // i[26]: Classify infrastructure failure
      const infraFailure = classifyFailure(message, 'infrastructure' as FailurePhase, stack);

      // INTEGRATION-2: Record infrastructure failure pattern
      const patternId = `exec-${pkg.projectType}-${pkg.id.slice(0, 8)}`;
      await this.patternTracker.recordFailure(
        patternId,
        `${pkg.projectType} execution (infrastructure)`
      );
      console.log(`[Foreman:Execution] PatternTracker: recorded infrastructure failure for ${patternId}`);

      return {
        success: false,
        filesCreated: [],
        filesModified: [],
        filesRead: pkg.codeContext.mustRead.map(f => f.path),
        compilationPassed: false,
        compilationAttempts: 0, // i[27]
        compilationSelfHealed: false, // i[27]
        validationPassed: false, // i[18]
        notes: 'Execution failed with error',
        error: message,
        structuredFailure: infraFailure, // i[26]
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

    // i[18]: Determine if tests were actually run (Tool Building)
    const testsRan = result.validationSummary !== undefined && result.validationSummary.totalTools > 0;
    const testsPassed = result.validationPassed;

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
        testsRan, // i[18]: Now from Tool Building
        testsPassed, // i[18]: Now from Tool Building
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
        // i[27]: Add self-heal learning
        ...(result.compilationAttempts > 1 ? [{
          type: (result.compilationSelfHealed ? 'insight' : 'warning') as 'insight' | 'warning' | 'correction' | 'pattern',
          content: result.compilationSelfHealed
            ? `Compilation self-healed after ${result.compilationAttempts} attempt(s). Self-heal loop (i[27]) recovered from compilation failure.`
            : `Compilation self-heal failed after ${result.compilationAttempts} attempt(s). Original errors could not be fixed automatically.`,
          tags: ['self-heal', 'i[27]', result.compilationSelfHealed ? 'self-heal-success' : 'self-heal-failed'],
        }] : []),
        // i[18]: Add validation learning if tools were run
        ...(testsRan ? [{
          type: (testsPassed ? 'insight' : 'warning') as 'insight' | 'warning' | 'correction' | 'pattern',
          content: `Tool Building validation: ${result.validationSummary!.passed}/${result.validationSummary!.totalTools} tools passed.`,
          tags: ['tool-building', testsPassed ? 'validation-passed' : 'validation-failed'],
        }] : []),
        // i[26]: Add structured failure learning for analytics
        ...(result.structuredFailure ? [{
          type: 'correction' as 'insight' | 'warning' | 'correction' | 'pattern',
          content: `Structured failure: phase=${result.structuredFailure.phase}, code=${result.structuredFailure.code}, message=${result.structuredFailure.message}`,
          tags: [
            'structured-failure',
            `failure-phase-${result.structuredFailure.phase}`,
            `failure-code-${result.structuredFailure.code}`,
          ],
        }] : []),
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

  /**
   * HARDENING-12: Store compilation errors as learnings for future runs
   *
   * Parses common error patterns and stores them to Mandrel so the LLM
   * can learn from mistakes (e.g., wrong import locations).
   */
  private async storeCompilationErrorLearning(
    compilationOutput: string,
    projectPath: string,
    modifiedFiles: string[]
  ): Promise<void> {
    try {
      const learnings: string[] = [];
      const projectName = projectPath.split('/').pop() || 'unknown';

      // Pattern 1: Module has no exported member (wrong import location)
      // e.g., "Module '"./types.js"' has no exported member 'ExecutionTrace'"
      const exportErrorRegex = /Module '"([^"]+)"' has no exported member '([^']+)'/g;
      let match;
      while ((match = exportErrorRegex.exec(compilationOutput)) !== null) {
        const wrongModule = match[1];
        const missingExport = match[2];
        learnings.push(`❌ WRONG: import { ${missingExport} } from '${wrongModule}' - this module does NOT export ${missingExport}`);
      }

      // Pattern 2: Cannot find module (missing dependency or wrong path)
      // e.g., "Cannot find module 'ws'"
      const moduleNotFoundRegex = /Cannot find module '([^']+)'/g;
      while ((match = moduleNotFoundRegex.exec(compilationOutput)) !== null) {
        const missingModule = match[1];
        if (!missingModule.startsWith('.') && !missingModule.startsWith('/')) {
          learnings.push(`📦 MISSING DEPENDENCY: '${missingModule}' - must be installed via npm/yarn before use`);
        } else {
          learnings.push(`📁 WRONG PATH: '${missingModule}' - file does not exist at this path`);
        }
      }

      // Pattern 3: Property does not exist on type
      const propErrorRegex = /Property '([^']+)' does not exist on type '([^']+)'/g;
      while ((match = propErrorRegex.exec(compilationOutput)) !== null) {
        const prop = match[1];
        const typeName = match[2];
        learnings.push(`🔧 TYPE ERROR: '${prop}' is not a property of '${typeName}'`);
      }

      if (learnings.length === 0) {
        return; // No patterns matched, don't store
      }

      const content = `## Compilation Error Learning - ${projectName}

### Files That Caused Errors
${modifiedFiles.map(f => `- ${f}`).join('\n')}

### Learnings (DO NOT REPEAT THESE MISTAKES)
${learnings.map((l, i) => `${i + 1}. ${l}`).join('\n')}

### Raw Error Output (first 500 chars)
\`\`\`
${compilationOutput.substring(0, 500)}
\`\`\`
`;

      await centralMandrel.storeContext(
        content,
        'error',
        ['compilation-error', 'learning', projectName, this.instanceId]
      );

      console.log(`[Foreman:Execution] Stored ${learnings.length} compilation error learning(s) to Mandrel`);
    } catch (error) {
      console.warn('[Foreman:Execution] Failed to store compilation error learning:', error);
    }
  }
}

// Factory function
export function createExecutionForeman(
  instanceId: string,
  tierRouter?: TierRouter
): ExecutionForeman {
  return new ExecutionForeman(instanceId, tierRouter);
}
