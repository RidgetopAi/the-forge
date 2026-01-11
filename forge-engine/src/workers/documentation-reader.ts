/**
 * DocumentationReaderWorker - Extracts relevant information from documentation
 *
 * Phase 3: Worker Implementations
 *
 * This worker receives documentation content as input and extracts relevant
 * information for the task. It does NOT search for documentation - it receives
 * it as input from the Foreman.
 *
 * Non-exploration worker: canExplore = false, single-turn
 */

import { z } from 'zod';
import { TierRouter } from '../tiers.js';
import { BaseWorker, WorkerInput } from './base.js';

// ============================================================================
// Output Schema
// ============================================================================

/**
 * A relevant section from the documentation
 */
export const RelevantSectionSchema = z.object({
  /** Title or heading of the section */
  title: z.string(),
  /** Key points from this section */
  keyPoints: z.array(z.string()),
  /** Why this section is relevant to the task */
  relevance: z.string(),
});
export type RelevantSection = z.infer<typeof RelevantSectionSchema>;

/**
 * An API reference extracted from documentation
 */
export const ApiReferenceSchema = z.object({
  /** Name of the API (function, method, class, etc.) */
  name: z.string(),
  /** Type of API (function, class, hook, component, etc.) */
  type: z.string(),
  /** Signature or usage pattern */
  signature: z.string().optional(),
  /** Description of what it does */
  description: z.string(),
  /** Parameters or props */
  parameters: z.array(z.object({
    name: z.string(),
    type: z.string().optional(),
    description: z.string(),
    required: z.boolean().optional(),
  })).optional(),
  /** Return value description */
  returns: z.string().optional(),
});
export type ApiReference = z.infer<typeof ApiReferenceSchema>;

/**
 * A code example from the documentation
 */
export const ExampleSchema = z.object({
  /** What the example demonstrates */
  description: z.string(),
  /** The code example */
  code: z.string(),
  /** Language of the code */
  language: z.string().optional(),
});
export type Example = z.infer<typeof ExampleSchema>;

/**
 * A warning or caveat from the documentation
 */
export const WarningSchema = z.object({
  /** Type of warning (deprecated, breaking change, security, etc.) */
  type: z.string(),
  /** The warning message */
  message: z.string(),
  /** What it affects */
  affects: z.string().optional(),
});
export type Warning = z.infer<typeof WarningSchema>;

/**
 * Output schema for DocumentationReaderWorker
 */
export const DocumentationReadingOutputSchema = z.object({
  /** High-level summary of the documentation */
  summary: z.string(),
  /** Sections relevant to the task */
  relevantSections: z.array(RelevantSectionSchema),
  /** API references extracted */
  apiReferences: z.array(ApiReferenceSchema),
  /** Code examples found */
  examples: z.array(ExampleSchema),
  /** Warnings and caveats */
  warnings: z.array(WarningSchema),
  /** Worker's confidence in completeness (0-100) */
  confidence: z.number().min(0).max(100).default(50), // HARDENING-3: default if LLM omits
});
export type DocumentationReadingOutput = z.infer<typeof DocumentationReadingOutputSchema>;

// ============================================================================
// DocumentationReaderWorker
// ============================================================================

/**
 * Worker that extracts relevant information from documentation.
 *
 * This worker receives documentation content as input (not from web search)
 * and extracts the parts relevant to the task. Use it when you have
 * documentation content that needs to be analyzed.
 *
 * @example
 * ```typescript
 * const worker = new DocumentationReaderWorker(router);
 * const result = await worker.execute({
 *   task: 'Extract API info for implementing authentication',
 *   projectRoot: '/path/to/project',
 *   additionalContext: {
 *     documentation: '<documentation content here>'
 *   }
 * });
 *
 * if (result.success) {
 *   console.log('API references:', result.data.apiReferences);
 *   console.log('Examples:', result.data.examples);
 * }
 * ```
 */
export class DocumentationReaderWorker extends BaseWorker<DocumentationReadingOutput> {
  /** This worker does NOT use exploration tools */
  protected override canExplore = false;

  constructor(tierRouter: TierRouter) {
    super(tierRouter, 'documentation_reading', DocumentationReadingOutputSchema);
  }

  /**
   * System prompt for documentation reading
   */
  getSystemPrompt(): string {
    return `You are a Documentation Reader Worker in The Forge, an AI-powered software factory.

Your job is to analyze documentation content and extract information relevant to a given task.

## What You Receive

You will be given:
1. A task description (what information is needed)
2. Documentation content to analyze

## Output Requirements

Call submit_result with your extracted information:

{
  "summary": "Brief overview of what the documentation covers",
  "relevantSections": [
    {
      "title": "Authentication",
      "keyPoints": [
        "Uses JWT tokens",
        "Tokens expire after 1 hour",
        "Refresh tokens supported"
      ],
      "relevance": "Directly covers the authentication implementation we need"
    }
  ],
  "apiReferences": [
    {
      "name": "useAuth",
      "type": "hook",
      "signature": "useAuth(): AuthContext",
      "description": "Hook to access authentication state and methods",
      "parameters": [],
      "returns": "AuthContext object with user, login, logout"
    }
  ],
  "examples": [
    {
      "description": "Basic authentication setup",
      "code": "const { user, login } = useAuth();",
      "language": "typescript"
    }
  ],
  "warnings": [
    {
      "type": "security",
      "message": "Never store tokens in localStorage in production",
      "affects": "Token storage implementation"
    }
  ],
  "confidence": 85
}

## Guidelines

1. Focus on information relevant to the task
2. Extract concrete API details (signatures, parameters, return types)
3. Include practical code examples
4. Note any warnings, deprecations, or caveats
5. Summarize at a useful level of detail - not too brief, not exhaustive
6. If documentation is incomplete or unclear, note this in warnings`;
  }

  /**
   * Build user prompt for a specific task
   */
  buildUserPrompt(input: WorkerInput): string {
    const parts: string[] = [];

    // Task description
    parts.push(`## Task\n\n${input.task}`);

    // Documentation content (required for this worker)
    if (input.additionalContext?.documentation) {
      parts.push(`\n## Documentation to Analyze\n\n${input.additionalContext.documentation}`);
    } else if (input.context) {
      // Fall back to context if documentation not in additionalContext
      parts.push(`\n## Documentation to Analyze\n\n${input.context}`);
    } else {
      parts.push(`\n## Documentation\n\nNo documentation provided. Please provide documentation content to analyze.`);
    }

    parts.push(`\n## Instructions

Analyze the documentation above and extract information relevant to the task.
Focus on:
- API references and signatures
- Code examples
- Relevant sections and key points
- Any warnings or caveats

Call submit_result with your structured findings.`);

    return parts.join('\n');
  }
}
