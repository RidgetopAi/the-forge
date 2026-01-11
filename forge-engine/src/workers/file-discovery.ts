/**
 * FileDiscoveryWorker - Discovers relevant files for a task
 *
 * Phase 3: Worker Implementations
 *
 * This worker explores the codebase to find files relevant to a given task.
 * It uses glob/read/grep tools to autonomously discover files, then returns
 * a prioritized list of relevant files and suggestions for new files.
 *
 * Exploration worker: canExplore = true, multi-turn with tools
 */

import { z } from 'zod';
import { TierRouter } from '../tiers.js';
import { BaseWorker, WorkerInput } from './base.js';
import { buildMinimalContext } from './tools.js';

// ============================================================================
// Output Schema
// ============================================================================

/**
 * Priority levels for discovered files
 */
export const FilePrioritySchema = z.enum(['must_read', 'should_read', 'may_read']);
export type FilePriority = z.infer<typeof FilePrioritySchema>;

/**
 * A discovered relevant file
 */
export const RelevantFileSchema = z.object({
  /** Relative path to the file */
  path: z.string(),
  /** Why this file is relevant to the task */
  reason: z.string(),
  /** Priority level for reading this file */
  priority: FilePrioritySchema,
});
export type RelevantFile = z.infer<typeof RelevantFileSchema>;

/**
 * A suggested new file to create
 */
export const SuggestedFileSchema = z.object({
  /** Relative path where the file should be created */
  path: z.string(),
  /** Purpose of this new file */
  purpose: z.string(),
});
export type SuggestedFile = z.infer<typeof SuggestedFileSchema>;

/**
 * Output schema for FileDiscoveryWorker
 */
export const FileDiscoveryOutputSchema = z.object({
  /** Files discovered as relevant to the task */
  relevantFiles: z.array(RelevantFileSchema),
  /** Suggested new files to create for this task */
  suggestedNewFiles: z.array(SuggestedFileSchema),
  /** Worker's confidence in completeness (0-100) */
  confidence: z.number().min(0).max(100).default(50), // HARDENING-3: default if LLM omits
});
export type FileDiscoveryOutput = z.infer<typeof FileDiscoveryOutputSchema>;

// ============================================================================
// FileDiscoveryWorker
// ============================================================================

/**
 * Worker that discovers files relevant to a task.
 *
 * Uses exploration tools (glob, read, grep) to autonomously find files
 * that are relevant to the given task. Returns a prioritized list with
 * reasons for each file's relevance.
 *
 * @example
 * ```typescript
 * const worker = new FileDiscoveryWorker(router);
 * const result = await worker.execute({
 *   task: 'Add user authentication to the API',
 *   projectRoot: '/path/to/project'
 * });
 *
 * if (result.success) {
 *   console.log('Must-read files:', result.data.relevantFiles
 *     .filter(f => f.priority === 'must_read'));
 * }
 * ```
 */
export class FileDiscoveryWorker extends BaseWorker<FileDiscoveryOutput> {
  /** This worker can use exploration tools */
  protected override canExplore = true;

  /** Maximum turns for file discovery */
  protected override maxTurns = 10;

  constructor(tierRouter: TierRouter) {
    super(tierRouter, 'file_discovery', FileDiscoveryOutputSchema);
  }

  /**
   * System prompt for file discovery
   */
  getSystemPrompt(): string {
    return `You are a File Discovery Worker in The Forge, an AI-powered software factory.

Your job is to explore a codebase and identify files relevant to a given task. You have access to these tools:

1. **glob(pattern)** - Find files matching a pattern (e.g., "**/*.ts", "src/routes/*.tsx")
2. **read(path)** - Read the contents of a specific file
3. **grep(pattern, path?)** - Search for text patterns across files

## Your Process

1. Start by using glob to understand the project structure
2. Use grep to find files containing relevant keywords, function names, or patterns
3. Read key files to understand their purpose and relevance
4. Build a comprehensive list of relevant files

## Output Requirements

When you have gathered enough information, call submit_result with:

{
  "relevantFiles": [
    {
      "path": "src/routes/users.ts",
      "reason": "Contains user-related API endpoints that will need modification",
      "priority": "must_read"  // must_read | should_read | may_read
    }
  ],
  "suggestedNewFiles": [
    {
      "path": "src/middleware/auth.ts",
      "purpose": "New middleware for authentication logic"
    }
  ],
  "confidence": 85  // 0-100, your confidence in completeness
}

## Priority Guidelines

- **must_read**: Files that definitely need to be modified or are critical to understand
- **should_read**: Files that provide important context or may need changes
- **may_read**: Files that might be useful for reference but aren't essential

## Best Practices

- Cast a wide net initially, then narrow down
- Look for entry points, route definitions, and configuration files
- Find existing patterns that the task should follow
- Consider test files if they provide useful context
- Don't just list every file - be selective and explain relevance
- Aim for 5-15 must_read files, more for should_read`;
  }

  /**
   * Build user prompt for a specific task
   */
  buildUserPrompt(input: WorkerInput): string {
    const parts: string[] = [];

    // Task description
    parts.push(`## Task\n\n${input.task}`);

    // Minimal context to get started
    parts.push(`\n## Project Context\n\n${buildMinimalContext(input.projectRoot)}`);

    // Additional context if provided
    if (input.additionalContext?.projectContext) {
      parts.push(`\n## Additional Project Context\n\n${input.additionalContext.projectContext}`);
    }

    if (input.context) {
      parts.push(`\n## Context\n\n${input.context}`);
    }

    parts.push(`\n## Instructions

Explore this codebase to find files relevant to the task described above.
Use your tools (glob, read, grep) to discover files, then submit_result with your findings.`);

    return parts.join('\n');
  }
}
