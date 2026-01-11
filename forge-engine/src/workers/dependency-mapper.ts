/**
 * DependencyMapperWorker - Maps dependencies between files in a codebase
 *
 * Phase 3: Worker Implementations
 *
 * This worker explores the codebase to map import/export relationships,
 * identify entry points, and detect circular dependencies.
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
 * Type of dependency relationship
 */
export const DependencyTypeSchema = z.enum(['import', 'type', 'runtime', 'test']);
export type DependencyType = z.infer<typeof DependencyTypeSchema>;

/**
 * A dependency relationship between files
 */
export const DependencySchema = z.object({
  /** File that has the import */
  from: z.string(),
  /** File being imported */
  to: z.string(),
  /** Type of dependency */
  type: DependencyTypeSchema,
  /** What is being imported (named exports, default, etc.) */
  imports: z.array(z.string()).optional(),
});
export type Dependency = z.infer<typeof DependencySchema>;

/**
 * An external (npm) dependency
 */
export const ExternalDependencySchema = z.object({
  /** Package name */
  name: z.string(),
  /** Files that import this package */
  usedBy: z.array(z.string()),
  /** Whether it's a dev dependency */
  isDev: z.boolean().optional(),
});
export type ExternalDependency = z.infer<typeof ExternalDependencySchema>;

/**
 * An entry point in the application
 */
export const EntryPointSchema = z.object({
  /** Path to the entry point file */
  path: z.string(),
  /** Type of entry point (main, test, script, etc.) */
  type: z.string(),
  /** Description of what this entry point does */
  description: z.string(),
});
export type EntryPoint = z.infer<typeof EntryPointSchema>;

/**
 * A circular dependency chain
 */
export const CircularDependencySchema = z.object({
  /** Files involved in the cycle */
  cycle: z.array(z.string()),
  /** Severity: warning or error */
  severity: z.enum(['warning', 'error']),
});
export type CircularDependency = z.infer<typeof CircularDependencySchema>;

/**
 * Output schema for DependencyMapperWorker
 */
export const DependencyMappingOutputSchema = z.object({
  /** Internal file-to-file dependencies */
  dependencies: z.array(DependencySchema),
  /** External npm package dependencies */
  externalDependencies: z.array(ExternalDependencySchema),
  /** Application entry points */
  entryPoints: z.array(EntryPointSchema),
  /** Detected circular dependencies */
  circularDependencies: z.array(CircularDependencySchema),
  /** Worker's confidence in completeness (0-100) */
  confidence: z.number().min(0).max(100).default(50), // HARDENING-3: default if LLM omits
});
export type DependencyMappingOutput = z.infer<typeof DependencyMappingOutputSchema>;

// ============================================================================
// DependencyMapperWorker
// ============================================================================

/**
 * Worker that maps dependencies between files in a codebase.
 *
 * Uses exploration tools (glob, read, grep) to analyze import statements
 * and build a dependency graph. Identifies entry points and circular dependencies.
 *
 * @example
 * ```typescript
 * const worker = new DependencyMapperWorker(router);
 * const result = await worker.execute({
 *   task: 'Map dependencies for the authentication module',
 *   projectRoot: '/path/to/project'
 * });
 *
 * if (result.success) {
 *   console.log('Entry points:', result.data.entryPoints);
 *   if (result.data.circularDependencies.length > 0) {
 *     console.warn('Circular dependencies found!');
 *   }
 * }
 * ```
 */
export class DependencyMapperWorker extends BaseWorker<DependencyMappingOutput> {
  /** This worker can use exploration tools */
  protected override canExplore = true;

  /** Maximum turns for dependency mapping */
  protected override maxTurns = 10;

  constructor(tierRouter: TierRouter) {
    super(tierRouter, 'dependency_mapping', DependencyMappingOutputSchema);
  }

  /**
   * System prompt for dependency mapping
   */
  getSystemPrompt(): string {
    return `You are a Dependency Mapper Worker in The Forge, an AI-powered software factory.

Your job is to analyze a codebase and map the dependencies between files. You have access to these tools:

1. **glob(pattern)** - Find files matching a pattern (e.g., "**/*.ts", "src/**/*.tsx")
2. **read(path)** - Read the contents of a specific file
3. **grep(pattern, path?)** - Search for text patterns across files

## Your Process

1. Use glob to find all source files
2. Use grep to find import/require statements
3. Read key files to understand import patterns
4. Build a dependency map focusing on:
   - Internal file-to-file imports
   - External npm packages used
   - Entry points (main, test runners, scripts)
   - Circular dependencies (A imports B imports A)

## Output Requirements

When you have gathered enough information, call submit_result with:

{
  "dependencies": [
    {
      "from": "src/services/auth.ts",
      "to": "src/utils/crypto.ts",
      "type": "import",  // import | type | runtime | test
      "imports": ["hashPassword", "verifyToken"]
    }
  ],
  "externalDependencies": [
    {
      "name": "express",
      "usedBy": ["src/server.ts", "src/routes/index.ts"],
      "isDev": false
    }
  ],
  "entryPoints": [
    {
      "path": "src/index.ts",
      "type": "main",
      "description": "Main application entry point"
    },
    {
      "path": "src/cli.ts",
      "type": "script",
      "description": "CLI tool entry point"
    }
  ],
  "circularDependencies": [
    {
      "cycle": ["src/a.ts", "src/b.ts", "src/a.ts"],
      "severity": "warning"
    }
  ],
  "confidence": 75
}

## Dependency Types

- **import**: Standard ES/CommonJS import
- **type**: TypeScript type-only import
- **runtime**: Dynamic import or require
- **test**: Import only used in test files

## Tips

- Focus on the files relevant to the task context
- Look at package.json for external dependencies
- Entry points are often in package.json "main", "bin", or "scripts"
- Check for barrel files (index.ts) that re-export
- Look for import cycles that could cause issues`;
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
      parts.push(`\n## Relevant Files\n\nFocus dependency mapping on these files:\n\n${input.additionalContext.fileList}`);
    }

    // Additional context
    if (input.context) {
      parts.push(`\n## Additional Context\n\n${input.context}`);
    }

    parts.push(`\n## Instructions

Map the dependencies for this codebase, focusing on files relevant to the task.
Use your tools (glob, read, grep) to analyze imports, then submit_result with your findings.`);

    return parts.join('\n');
  }
}
