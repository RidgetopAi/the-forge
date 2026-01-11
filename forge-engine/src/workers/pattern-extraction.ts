/**
 * PatternExtractionWorker - Extracts coding patterns and conventions from a codebase
 *
 * Phase 3: Worker Implementations
 *
 * This worker explores the codebase to identify coding patterns, conventions,
 * and anti-patterns. It reads files to understand how code is structured and
 * what patterns are consistently used.
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
 * A coding pattern found in the codebase
 */
export const PatternSchema = z.object({
  /** Name of the pattern (e.g., "Repository Pattern", "Error Boundary") */
  name: z.string(),
  /** Description of how the pattern is used */
  description: z.string(),
  /** File paths showing examples of this pattern */
  examples: z.array(z.string()),
  /** When to apply this pattern */
  applicability: z.string(),
});
export type Pattern = z.infer<typeof PatternSchema>;

/**
 * Anti-pattern or code smell found
 */
export const AntiPatternSchema = z.object({
  /** Name of the anti-pattern */
  name: z.string(),
  /** Why this is problematic */
  description: z.string(),
  /** Where this was observed */
  locations: z.array(z.string()),
  /** Suggested better approach */
  suggestion: z.string(),
});
export type AntiPattern = z.infer<typeof AntiPatternSchema>;

/**
 * Project conventions discovered
 */
export const ConventionsSchema = z.object({
  /** Naming conventions (variables, functions, files, etc.) */
  naming: z.string().optional(),
  /** How files and folders are organized */
  fileOrganization: z.string().optional(),
  /** How errors are handled */
  errorHandling: z.string().optional(),
  /** Testing patterns and conventions */
  testing: z.string().optional(),
  /** Import/export patterns */
  imports: z.string().optional(),
  /** State management approach */
  stateManagement: z.string().optional(),
  /** API/data fetching patterns */
  dataFetching: z.string().optional(),
});
export type Conventions = z.infer<typeof ConventionsSchema>;

/**
 * Output schema for PatternExtractionWorker
 */
export const PatternExtractionOutputSchema = z.object({
  /** Coding patterns found in the codebase */
  patterns: z.array(PatternSchema),
  /** Project conventions discovered */
  conventions: ConventionsSchema,
  /** Anti-patterns or code smells found */
  antiPatterns: z.array(AntiPatternSchema),
  /** Worker's confidence in completeness (0-100) */
  confidence: z.number().min(0).max(100).default(50), // HARDENING-3: default if LLM omits
});
export type PatternExtractionOutput = z.infer<typeof PatternExtractionOutputSchema>;

// ============================================================================
// PatternExtractionWorker
// ============================================================================

/**
 * Worker that extracts coding patterns and conventions from a codebase.
 *
 * Uses exploration tools (glob, read, grep) to find and analyze patterns
 * in the code. Identifies both good patterns to follow and anti-patterns
 * to avoid.
 *
 * @example
 * ```typescript
 * const worker = new PatternExtractionWorker(router);
 * const result = await worker.execute({
 *   task: 'Extract patterns for implementing a new API endpoint',
 *   projectRoot: '/path/to/project'
 * });
 *
 * if (result.success) {
 *   console.log('Patterns to follow:', result.data.patterns);
 *   console.log('Conventions:', result.data.conventions);
 * }
 * ```
 */
export class PatternExtractionWorker extends BaseWorker<PatternExtractionOutput> {
  /** This worker can use exploration tools */
  protected override canExplore = true;

  /** Maximum turns for pattern extraction */
  protected override maxTurns = 10;

  constructor(tierRouter: TierRouter) {
    super(tierRouter, 'pattern_extraction', PatternExtractionOutputSchema);
  }

  /**
   * System prompt for pattern extraction
   */
  getSystemPrompt(): string {
    return `You are a Pattern Extraction Worker in The Forge, an AI-powered software factory.

Your job is to explore a codebase and identify coding patterns, conventions, and anti-patterns. You have access to these tools:

1. **glob(pattern)** - Find files matching a pattern (e.g., "**/*.ts", "src/services/*.ts")
2. **read(path)** - Read the contents of a specific file
3. **grep(pattern, path?)** - Search for text patterns across files

## Your Process

1. Start with glob to understand the project structure
2. Read representative files from different parts of the codebase
3. Use grep to find recurring patterns (e.g., error handling, logging, validation)
4. Compare multiple files to identify consistent conventions
5. Note any anti-patterns or inconsistencies

## Output Requirements

When you have gathered enough information, call submit_result with:

{
  "patterns": [
    {
      "name": "Repository Pattern",
      "description": "Data access is abstracted through repository classes",
      "examples": ["src/repositories/UserRepository.ts", "src/repositories/OrderRepository.ts"],
      "applicability": "Use for all database operations"
    }
  ],
  "conventions": {
    "naming": "camelCase for variables/functions, PascalCase for classes/types",
    "fileOrganization": "Feature-based folders under src/",
    "errorHandling": "Custom Error classes with error codes",
    "testing": "Jest with describe/it pattern, __tests__ folders",
    "imports": "Absolute imports from src/, types imported separately",
    "stateManagement": "React Context for global state",
    "dataFetching": "Custom hooks wrapping fetch API"
  },
  "antiPatterns": [
    {
      "name": "Inconsistent error handling",
      "description": "Some files use try/catch, others let errors propagate",
      "locations": ["src/services/auth.ts", "src/api/users.ts"],
      "suggestion": "Standardize on custom Error classes with centralized handling"
    }
  ],
  "confidence": 80
}

## What to Look For

### Patterns
- Architectural patterns (MVC, Repository, Service Layer, etc.)
- Component patterns (Container/Presenter, HOCs, Render Props, Hooks)
- Error handling patterns
- Validation patterns
- Logging/monitoring patterns

### Conventions
- File and folder naming
- Variable/function/class naming
- Import/export style
- Comment and documentation style
- Test organization

### Anti-Patterns
- Inconsistent patterns across files
- Code duplication
- Overly complex abstractions
- Missing error handling
- Tight coupling`;
  }

  /**
   * Build user prompt for a specific task
   */
  buildUserPrompt(input: WorkerInput): string {
    const parts: string[] = [];

    // Task description
    parts.push(`## Task Context\n\n${input.task}`);

    // Minimal context to get started
    parts.push(`\n## Project Structure\n\n${buildMinimalContext(input.projectRoot)}`);

    // File list if provided (from FileDiscoveryWorker)
    if (input.additionalContext?.fileList) {
      parts.push(`\n## Relevant Files\n\nThese files have been identified as relevant:\n\n${input.additionalContext.fileList}`);
    }

    // Additional context
    if (input.context) {
      parts.push(`\n## Additional Context\n\n${input.context}`);
    }

    parts.push(`\n## Instructions

Extract coding patterns, conventions, and anti-patterns from this codebase.
Focus on patterns relevant to the task context above.
Use your tools (glob, read, grep) to explore, then submit_result with your findings.`);

    return parts.join('\n');
  }
}
