/**
 * WebResearchWorker - Provides knowledge from LLM training data
 *
 * Phase 3: Worker Implementations
 *
 * This worker answers research questions using the LLM's training knowledge.
 * It does NOT have actual web access - it uses the model's pre-trained knowledge
 * about frameworks, libraries, best practices, and patterns.
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
 * Relevance level of a finding
 */
export const RelevanceSchema = z.enum(['high', 'medium', 'low']);
export type Relevance = z.infer<typeof RelevanceSchema>;

/**
 * A research finding
 */
export const FindingSchema = z.object({
  /** Topic of this finding */
  topic: z.string(),
  /** The finding/information */
  content: z.string(),
  /** Relevance to the research query */
  relevance: RelevanceSchema,
  /** Caveats or limitations of this knowledge */
  caveats: z.string().optional(),
});
export type Finding = z.infer<typeof FindingSchema>;

/**
 * A recommendation based on research
 */
export const RecommendationSchema = z.object({
  /** What is being recommended */
  recommendation: z.string(),
  /** Why this is recommended */
  rationale: z.string(),
  /** Trade-offs or considerations */
  tradeoffs: z.string().optional(),
});
export type Recommendation = z.infer<typeof RecommendationSchema>;

/**
 * Something the worker doesn't know or is uncertain about
 */
export const UnknownSchema = z.object({
  /** Topic that couldn't be fully answered */
  topic: z.string(),
  /** Why this is unknown or uncertain */
  reason: z.string(),
  /** Where to find more authoritative information */
  suggestedSources: z.array(z.string()).optional(),
});
export type Unknown = z.infer<typeof UnknownSchema>;

/**
 * Output schema for WebResearchWorker
 */
export const WebResearchOutputSchema = z.object({
  /** Research findings */
  findings: z.array(FindingSchema),
  /** Recommendations based on findings */
  recommendations: z.array(RecommendationSchema),
  /** Topics that couldn't be fully answered */
  unknowns: z.array(UnknownSchema),
  /** Worker's confidence in completeness (0-100) */
  confidence: z.number().min(0).max(100).default(50), // HARDENING-3: default if LLM omits
});
export type WebResearchOutput = z.infer<typeof WebResearchOutputSchema>;

// ============================================================================
// WebResearchWorker
// ============================================================================

/**
 * Worker that provides research using LLM training knowledge.
 *
 * IMPORTANT: This worker does NOT have actual web access. It uses the
 * LLM's pre-trained knowledge to answer questions about frameworks,
 * libraries, best practices, and patterns.
 *
 * Use this worker for:
 * - "What's the best way to do X in React?"
 * - "How does library Y handle Z?"
 * - "What are common patterns for problem P?"
 *
 * Do NOT use this worker for:
 * - Current documentation (may be outdated)
 * - Latest versions of packages
 * - Real-time information
 *
 * @example
 * ```typescript
 * const worker = new WebResearchWorker(router);
 * const result = await worker.execute({
 *   task: 'Research best practices for JWT authentication in Express',
 *   projectRoot: '/path/to/project'
 * });
 *
 * if (result.success) {
 *   console.log('Findings:', result.data.findings);
 *   console.log('Recommendations:', result.data.recommendations);
 * }
 * ```
 */
export class WebResearchWorker extends BaseWorker<WebResearchOutput> {
  /** This worker does NOT use exploration tools */
  protected override canExplore = false;

  constructor(tierRouter: TierRouter) {
    super(tierRouter, 'web_research', WebResearchOutputSchema);
  }

  /**
   * System prompt for web research
   */
  getSystemPrompt(): string {
    return `You are a Web Research Worker in The Forge, an AI-powered software factory.

Your job is to provide research findings based on your training knowledge. You answer questions about:
- Frameworks and libraries
- Best practices and patterns
- Common solutions to technical problems
- API designs and conventions

## IMPORTANT LIMITATIONS

You do NOT have actual web access. Your knowledge comes from training data with a cutoff date.
- Be honest about what you don't know
- Flag information that might be outdated
- Suggest authoritative sources for verification

## Output Requirements

Call submit_result with your findings:

{
  "findings": [
    {
      "topic": "JWT Best Practices",
      "content": "JWTs should be stored in httpOnly cookies for web apps, not localStorage...",
      "relevance": "high",
      "caveats": "Security best practices evolve - verify against current OWASP guidelines"
    }
  ],
  "recommendations": [
    {
      "recommendation": "Use short-lived access tokens with refresh token rotation",
      "rationale": "Limits exposure window if token is compromised",
      "tradeoffs": "Requires more complex token refresh logic"
    }
  ],
  "unknowns": [
    {
      "topic": "Latest passport.js version",
      "reason": "Cannot verify current version numbers from training data",
      "suggestedSources": ["npmjs.com/package/passport", "passportjs.org"]
    }
  ],
  "confidence": 75
}

## Relevance Levels

- **high**: Directly answers the research question
- **medium**: Provides useful context or related information
- **low**: Tangentially related, might be useful

## Guidelines

1. Be comprehensive but focused on the research query
2. Clearly separate facts from opinions
3. Acknowledge uncertainty - don't make up information
4. Provide practical, actionable findings
5. Include trade-offs and caveats where applicable`;
  }

  /**
   * Build user prompt for a specific task
   */
  buildUserPrompt(input: WorkerInput): string {
    const parts: string[] = [];

    // Research query
    parts.push(`## Research Query\n\n${input.task}`);

    // Research queries if provided
    if (input.additionalContext?.researchQueries) {
      parts.push(`\n## Specific Questions\n\n${input.additionalContext.researchQueries}`);
    }

    // Project context if relevant
    if (input.additionalContext?.projectContext) {
      parts.push(`\n## Project Context\n\n${input.additionalContext.projectContext}`);
    }

    // Additional context
    if (input.context) {
      parts.push(`\n## Additional Context\n\n${input.context}`);
    }

    parts.push(`\n## Instructions

Based on your training knowledge, research the query above and provide:
1. Relevant findings with explanations
2. Practical recommendations
3. Any unknowns or areas of uncertainty

Call submit_result with your structured research findings.`);

    return parts.join('\n');
  }
}
