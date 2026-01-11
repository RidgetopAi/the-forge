/**
 * ConstraintIdentifierWorker - Identifies constraints from project configuration
 *
 * Phase 3: Worker Implementations
 *
 * This worker explores config files (tsconfig, eslint, package.json, etc.)
 * to identify constraints that code must adhere to. These include type
 * constraints, lint rules, test requirements, and build configurations.
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
 * When a constraint is enforced
 */
export const EnforcementSchema = z.enum(['compile_time', 'runtime', 'lint']);
export type Enforcement = z.infer<typeof EnforcementSchema>;

/**
 * Severity level of a constraint
 */
export const SeveritySchema = z.enum(['error', 'warning', 'off']);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * A TypeScript/type system constraint
 */
export const TypeConstraintSchema = z.object({
  /** Name of the constraint (e.g., "strict mode", "no implicit any") */
  name: z.string(),
  /** What this constraint enforces */
  description: z.string(),
  /** Source file defining this constraint */
  source: z.string(),
  /** When enforced */
  enforcement: EnforcementSchema,
  /** Severity level */
  severity: SeveritySchema,
});
export type TypeConstraint = z.infer<typeof TypeConstraintSchema>;

/**
 * A test-related constraint
 */
export const TestConstraintSchema = z.object({
  /** Name of the constraint */
  name: z.string(),
  /** What this constraint requires */
  description: z.string(),
  /** Source (jest.config, vitest.config, etc.) */
  source: z.string(),
  /** Test framework being used */
  framework: z.string().optional(),
});
export type TestConstraint = z.infer<typeof TestConstraintSchema>;

/**
 * A lint rule constraint
 */
export const LintConstraintSchema = z.object({
  /** Rule name (e.g., "@typescript-eslint/no-explicit-any") */
  name: z.string(),
  /** What the rule enforces */
  description: z.string(),
  /** Source file (.eslintrc, biome.json, etc.) */
  source: z.string(),
  /** Severity level */
  severity: SeveritySchema,
});
export type LintConstraint = z.infer<typeof LintConstraintSchema>;

/**
 * A build configuration constraint
 */
export const BuildConstraintSchema = z.object({
  /** Name of the constraint */
  name: z.string(),
  /** What this constraint affects */
  description: z.string(),
  /** Source file */
  source: z.string(),
  /** Build tool (webpack, vite, esbuild, tsc, etc.) */
  tool: z.string().optional(),
});
export type BuildConstraint = z.infer<typeof BuildConstraintSchema>;

/**
 * An API constraint (from OpenAPI, GraphQL schema, etc.)
 */
export const ApiConstraintSchema = z.object({
  /** Name of the constraint */
  name: z.string(),
  /** What this constraint defines */
  description: z.string(),
  /** Source file */
  source: z.string(),
  /** API type (REST, GraphQL, gRPC, etc.) */
  apiType: z.string().optional(),
});
export type ApiConstraint = z.infer<typeof ApiConstraintSchema>;

/**
 * Output schema for ConstraintIdentifierWorker
 */
export const ConstraintIdentificationOutputSchema = z.object({
  /** TypeScript and type system constraints */
  typeConstraints: z.array(TypeConstraintSchema),
  /** Test configuration constraints */
  testConstraints: z.array(TestConstraintSchema),
  /** Lint rule constraints */
  lintConstraints: z.array(LintConstraintSchema),
  /** Build configuration constraints */
  buildConstraints: z.array(BuildConstraintSchema),
  /** API schema constraints */
  apiConstraints: z.array(ApiConstraintSchema),
  /** Worker's confidence in completeness (0-100) */
  confidence: z.number().min(0).max(100).default(50), // HARDENING-3: default if LLM omits
});
export type ConstraintIdentificationOutput = z.infer<typeof ConstraintIdentificationOutputSchema>;

// ============================================================================
// ConstraintIdentifierWorker
// ============================================================================

/**
 * Worker that identifies constraints from project configuration.
 *
 * Uses exploration tools (glob, read, grep) to find and analyze configuration
 * files. Extracts constraints that code must adhere to, including type rules,
 * lint rules, test requirements, and build configurations.
 *
 * @example
 * ```typescript
 * const worker = new ConstraintIdentifierWorker(router);
 * const result = await worker.execute({
 *   task: 'Identify constraints for the API module',
 *   projectRoot: '/path/to/project'
 * });
 *
 * if (result.success) {
 *   console.log('Type constraints:', result.data.typeConstraints);
 *   console.log('Lint rules:', result.data.lintConstraints);
 * }
 * ```
 */
export class ConstraintIdentifierWorker extends BaseWorker<ConstraintIdentificationOutput> {
  /** This worker can use exploration tools */
  protected override canExplore = true;

  /** Maximum turns for constraint identification */
  protected override maxTurns = 8;

  constructor(tierRouter: TierRouter) {
    super(tierRouter, 'constraint_identification', ConstraintIdentificationOutputSchema);
  }

  /**
   * System prompt for constraint identification
   */
  getSystemPrompt(): string {
    return `You are a Constraint Identifier Worker in The Forge, an AI-powered software factory.

Your job is to analyze a codebase's configuration files and identify constraints that code must follow. You have access to these tools:

1. **glob(pattern)** - Find files matching a pattern
2. **read(path)** - Read the contents of a specific file
3. **grep(pattern, path?)** - Search for text patterns across files

## Key Configuration Files to Check

- **TypeScript**: tsconfig.json, tsconfig.*.json
- **Linting**: .eslintrc.*, eslint.config.*, biome.json, .prettierrc
- **Testing**: jest.config.*, vitest.config.*, playwright.config.*
- **Build**: webpack.config.*, vite.config.*, rollup.config.*, package.json scripts
- **API**: openapi.yaml, schema.graphql, .proto files

## CRITICAL: Module System Detection (HARDENING-4)

When checking tsconfig.json, PAY SPECIAL ATTENTION to module settings:

- If \`"module": "NodeNext"\` or \`"module": "Node16"\` → ESM with Node.js conventions
- If \`"moduleResolution": "NodeNext"\` or \`"moduleResolution": "Node16"\` → Same

**When NodeNext/Node16 is detected, you MUST add these constraints:**

1. **Type constraint**: "ESM namespace imports required for Node.js built-ins"
   - Description: "Node.js built-in modules must use namespace imports: \`import * as fs from 'node:fs'\`, NOT default imports like \`import fs from 'fs'\`"
   - Source: tsconfig.json
   - Enforcement: compile_time
   - Severity: error

2. **Type constraint**: "Node protocol prefix required"
   - Description: "Node.js built-in modules should use the 'node:' protocol prefix (node:fs, node:path, node:os, node:crypto, node:http, node:https, node:url, node:util, node:child_process, etc.)"
   - Source: tsconfig.json
   - Enforcement: compile_time
   - Severity: error

These constraints are CRITICAL because Node.js built-ins have no default exports in ESM mode.

## Your Process

1. Use glob to find configuration files
2. Read each config file to extract constraints
3. Focus on constraints that affect how code should be written:
   - Type strictness settings
   - Lint rules (especially errors, not just warnings)
   - Test coverage requirements
   - Build target requirements
   - API contract requirements

## Output Requirements

When you have gathered enough information, call submit_result with:

{
  "typeConstraints": [
    {
      "name": "strict mode",
      "description": "All strict type checking options enabled",
      "source": "tsconfig.json",
      "enforcement": "compile_time",
      "severity": "error"
    }
  ],
  "testConstraints": [
    {
      "name": "coverage threshold",
      "description": "Minimum 80% code coverage required",
      "source": "jest.config.js",
      "framework": "jest"
    }
  ],
  "lintConstraints": [
    {
      "name": "@typescript-eslint/no-explicit-any",
      "description": "Disallow explicit 'any' type",
      "source": ".eslintrc.js",
      "severity": "error"
    }
  ],
  "buildConstraints": [
    {
      "name": "ES2020 target",
      "description": "Code must compile to ES2020",
      "source": "tsconfig.json",
      "tool": "tsc"
    }
  ],
  "apiConstraints": [
    {
      "name": "REST API v2",
      "description": "Must conform to OpenAPI 3.0 schema",
      "source": "openapi.yaml",
      "apiType": "REST"
    }
  ],
  "confidence": 85
}

## Enforcement Types

- **compile_time**: Checked during TypeScript compilation
- **runtime**: Checked at runtime (e.g., validation)
- **lint**: Checked by linter

## Severity Levels

- **error**: Blocks build/commit
- **warning**: Warns but doesn't block
- **off**: Rule disabled`;
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

    // Config files if pre-identified
    if (input.additionalContext?.configFiles) {
      parts.push(`\n## Configuration Files\n\n${input.additionalContext.configFiles}`);
    }

    // Additional context
    if (input.context) {
      parts.push(`\n## Additional Context\n\n${input.context}`);
    }

    parts.push(`\n## Instructions

Identify all constraints that affect how code should be written in this project.
Focus on constraints relevant to the task context above.
Use your tools (glob, read, grep) to find and analyze config files, then submit_result with your findings.`);

    return parts.join('\n');
  }
}
