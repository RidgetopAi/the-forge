/**
 * LLM Client for The Forge
 *
 * i[7] contribution: Breaking the intelligence deferral pattern.
 *
 * This module provides LLM intelligence for:
 * - Task classification (PlantManager)
 * - ContextPackage quality evaluation
 * - Acceptance criteria verification
 *
 * Design:
 * - Uses Anthropic Claude API when ANTHROPIC_API_KEY is valid
 * - Falls back to heuristics when no API available
 * - All prompts are structured for consistency
 *
 * Key insight: When running in Claude Code, the agent IS an LLM.
 * The structured prompts can be consumed by the running agent even
 * when API calls aren't available.
 */

import Anthropic from '@anthropic-ai/sdk';
import { ProjectType, type ContextPackage } from './types.js';

// ============================================================================
// Types
// ============================================================================

export interface ClassificationResult {
  projectType: ProjectType;
  scope: 'small' | 'medium' | 'large';
  department: 'preparation' | 'r_and_d';
  confidence: number;
  reasoning: string;
  method: 'llm' | 'heuristic';
}

export interface QualityEvaluation {
  score: number;  // 0-100
  passed: boolean;
  issues: Array<{
    severity: 'critical' | 'warning' | 'suggestion';
    area: string;
    description: string;
    recommendation: string;
  }>;
  strengths: string[];
  reasoning: string;
  method: 'llm' | 'heuristic';
}

export interface AcceptanceCriteriaResult {
  criterion: string;
  met: boolean;
  confidence: number;
  evidence: string;
  method: 'llm' | 'heuristic';
}

// ============================================================================
// LLM Client Class
// ============================================================================

export class LLMClient {
  private client: Anthropic | null = null;
  private available: boolean = false;
  private model: string = 'claude-sonnet-4-20250514'; // Fast, capable model for workers

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (apiKey && apiKey !== 'your-anthropic-key' && apiKey.startsWith('sk-ant-')) {
      try {
        this.client = new Anthropic({ apiKey });
        this.available = true;
        console.log('[LLMClient] Anthropic API initialized');
      } catch (error) {
        console.warn('[LLMClient] Failed to initialize Anthropic client:', error);
        this.available = false;
      }
    } else {
      console.log('[LLMClient] No valid API key found. Using heuristics.');
      this.available = false;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  // ==========================================================================
  // Task Classification
  // ==========================================================================

  /**
   * Classify a task using LLM intelligence.
   *
   * This is the function that was deferred for 5 passes.
   * Now it's real.
   */
  async classify(rawRequest: string): Promise<ClassificationResult> {
    if (this.available && this.client) {
      return this.classifyWithLLM(rawRequest);
    }
    return this.classifyWithHeuristics(rawRequest);
  }

  private async classifyWithLLM(rawRequest: string): Promise<ClassificationResult> {
    const prompt = this.buildClassificationPrompt(rawRequest);

    try {
      const response = await this.client!.messages.create({
        model: this.model,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      return this.parseClassificationResponse(text, rawRequest);
    } catch (error) {
      console.warn('[LLMClient] Classification API call failed, falling back to heuristics:', error);
      return this.classifyWithHeuristics(rawRequest);
    }
  }

  private buildClassificationPrompt(rawRequest: string): string {
    return `You are a task classifier for a software development system called The Forge.

Classify this development request into one of these types:
- feature: Adding new capability to existing system
- bugfix: Fixing broken behavior
- greenfield: New project from scratch
- refactor: Changing structure without changing behavior
- research: Exploratory work, investigation, or prototyping

Also determine:
- Scope: small (quick tweak), medium (typical task), large (major undertaking)
- Department: "preparation" for most tasks, "r_and_d" for research/greenfield

REQUEST: "${rawRequest}"

Respond in this exact JSON format:
{
  "projectType": "feature|bugfix|greenfield|refactor|research",
  "scope": "small|medium|large",
  "department": "preparation|r_and_d",
  "confidence": 0.0-1.0,
  "reasoning": "Brief explanation of classification"
}`;
  }

  private parseClassificationResponse(text: string, rawRequest: string): ClassificationResult {
    try {
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate projectType
      const validTypes = ['feature', 'bugfix', 'greenfield', 'refactor', 'research'];
      const projectType = validTypes.includes(parsed.projectType)
        ? parsed.projectType as ProjectType
        : 'feature';

      // Validate scope
      const validScopes = ['small', 'medium', 'large'];
      const scope = validScopes.includes(parsed.scope)
        ? parsed.scope as 'small' | 'medium' | 'large'
        : 'medium';

      // Validate department
      const department = parsed.department === 'r_and_d' ? 'r_and_d' : 'preparation';

      return {
        projectType,
        scope,
        department,
        confidence: Math.min(Math.max(parsed.confidence || 0.8, 0), 1),
        reasoning: parsed.reasoning || 'LLM classification',
        method: 'llm',
      };
    } catch (error) {
      console.warn('[LLMClient] Failed to parse classification response:', error);
      return this.classifyWithHeuristics(rawRequest);
    }
  }

  private classifyWithHeuristics(rawRequest: string): ClassificationResult {
    // Original keyword matching from PlantManager
    const lower = rawRequest.toLowerCase();

    const TYPE_KEYWORDS: Record<string, string[]> = {
      feature: ['add', 'create', 'implement', 'new', 'build', 'introduce', 'enable'],
      bugfix: ['fix', 'bug', 'broken', 'error', 'issue', 'wrong', 'failing', 'crash', "doesn't work"],
      greenfield: ['new project', 'from scratch', 'bootstrap', 'scaffold', 'initialize', 'setup'],
      refactor: ['refactor', 'restructure', 'reorganize', 'clean up', 'migrate', 'move', 'rename'],
      research: ['research', 'investigate', 'explore', 'spike', 'prototype', 'evaluate', 'compare'],
    };

    const SCOPE_INDICATORS = {
      small: ['simple', 'quick', 'minor', 'small', 'tweak', 'just'],
      medium: ['add', 'implement', 'create', 'update'],
      large: ['major', 'overhaul', 'complete', 'full', 'comprehensive', 'redesign'],
    };

    // Score each type
    const typeScores: Record<string, number> = {
      feature: 0, bugfix: 0, greenfield: 0, refactor: 0, research: 0,
    };

    for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          typeScores[type] += 1;
        }
      }
    }

    // Find winner
    let bestType = 'feature';
    let bestScore = 0;
    for (const [type, score] of Object.entries(typeScores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }

    // Calculate confidence based on CLARITY of match (i[8] fix)
    // Key insight: single unambiguous match is clearer than multiple competing matches
    let confidence: number;

    // Count how many types got any matches
    const typesWithMatches = Object.values(typeScores).filter(s => s > 0).length;

    // Find second-best score for margin calculation
    const sortedScores = Object.values(typeScores).sort((a, b) => b - a);
    const secondBest = sortedScores[1] || 0;

    if (bestScore === 0) {
      // No keyword matches at all - low confidence, needs human
      confidence = 0.25;
    } else if (typesWithMatches === 1) {
      // UNAMBIGUOUS: only one type matched - this is actually clear!
      // "add a README" → only 'feature' matches → confident
      confidence = Math.min(0.55 + (bestScore * 0.10), 0.75);
    } else {
      // AMBIGUOUS: multiple types matched - confidence based on margin
      // "fix the broken add button" → bugfix: 3, feature: 1 → margin = 2
      const margin = bestScore - secondBest;
      confidence = Math.min(0.35 + (margin * 0.15), 0.65);
    }

    // Determine scope
    let scope: 'small' | 'medium' | 'large' = 'medium';
    for (const [s, indicators] of Object.entries(SCOPE_INDICATORS)) {
      if (indicators.some(i => lower.includes(i))) {
        scope = s as 'small' | 'medium' | 'large';
        break;
      }
    }

    // Route decision
    const department = ['research', 'greenfield'].includes(bestType) ? 'r_and_d' : 'preparation';

    const matchedKeywords = TYPE_KEYWORDS[bestType].filter(k => lower.includes(k));

    // Build reasoning with clarity info
    const clarityNote = typesWithMatches === 1
      ? 'Unambiguous match (only one type matched).'
      : typesWithMatches === 0
        ? 'No keywords matched.'
        : `Competing matches across ${typesWithMatches} types (margin: ${bestScore - secondBest}).`;

    return {
      projectType: bestType as ProjectType,
      scope,
      department,
      confidence,
      reasoning: `Heuristic classification. Matched: ${matchedKeywords.join(', ') || 'none'}. ${clarityNote}`,
      method: 'heuristic',
    };
  }

  // ==========================================================================
  // ContextPackage Quality Evaluation
  // ==========================================================================

  /**
   * Evaluate the quality of a ContextPackage.
   *
   * This is NEW functionality from i[7].
   * Answers the question: "Is this preparation actually good?"
   */
  async evaluateContextPackage(
    pkg: ContextPackage,
    projectPath: string
  ): Promise<QualityEvaluation> {
    if (this.available && this.client) {
      return this.evaluateWithLLM(pkg, projectPath);
    }
    return this.evaluateWithHeuristics(pkg);
  }

  private async evaluateWithLLM(
    pkg: ContextPackage,
    projectPath: string
  ): Promise<QualityEvaluation> {
    const prompt = this.buildEvaluationPrompt(pkg, projectPath);

    try {
      const response = await this.client!.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      return this.parseEvaluationResponse(text, pkg);
    } catch (error) {
      console.warn('[LLMClient] Evaluation API call failed, falling back to heuristics:', error);
      return this.evaluateWithHeuristics(pkg);
    }
  }

  private buildEvaluationPrompt(pkg: ContextPackage, projectPath: string): string {
    return `You are a quality evaluator for The Forge, a Development Cognition System.

Evaluate this ContextPackage - a preparation document that guides AI execution of a development task.

PROJECT: ${projectPath}
TASK TYPE: ${pkg.projectType}

CONTEXT PACKAGE:
${JSON.stringify(pkg, null, 2)}

Evaluate the quality of this preparation. Consider:
1. COMPLETENESS: Does it have enough context for execution?
2. SPECIFICITY: Are file paths, components, and patterns concrete?
3. ACTIONABILITY: Could an AI execute this without asking questions?
4. ACCURACY: Do the mustRead files seem relevant? Are patterns realistic?
5. RISKS: Are the identified risks and mitigations sensible?

Respond in this exact JSON format:
{
  "score": 0-100,
  "passed": true/false (pass threshold is 70),
  "issues": [
    {
      "severity": "critical|warning|suggestion",
      "area": "task|architecture|codeContext|patterns|constraints|risks|humanSync",
      "description": "What's wrong",
      "recommendation": "How to fix it"
    }
  ],
  "strengths": ["What's good about this preparation"],
  "reasoning": "Overall assessment"
}`;
  }

  private parseEvaluationResponse(text: string, pkg: ContextPackage): QualityEvaluation {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        score: Math.min(Math.max(parsed.score || 50, 0), 100),
        passed: parsed.passed ?? (parsed.score >= 70),
        issues: Array.isArray(parsed.issues) ? parsed.issues : [],
        strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
        reasoning: parsed.reasoning || 'LLM evaluation',
        method: 'llm',
      };
    } catch (error) {
      console.warn('[LLMClient] Failed to parse evaluation response:', error);
      return this.evaluateWithHeuristics(pkg);
    }
  }

  private evaluateWithHeuristics(pkg: ContextPackage): QualityEvaluation {
    const issues: QualityEvaluation['issues'] = [];
    const strengths: string[] = [];
    let score = 100;

    // Check task completeness
    if (!pkg.task.description || pkg.task.description.length < 20) {
      issues.push({
        severity: 'critical',
        area: 'task',
        description: 'Task description is too brief',
        recommendation: 'Provide a more detailed task description',
      });
      score -= 20;
    }

    if (pkg.task.acceptanceCriteria.length === 0) {
      issues.push({
        severity: 'critical',
        area: 'task',
        description: 'No acceptance criteria defined',
        recommendation: 'Add specific, testable acceptance criteria',
      });
      score -= 15;
    } else {
      strengths.push(`${pkg.task.acceptanceCriteria.length} acceptance criteria defined`);
    }

    // Check architecture
    if (pkg.architecture.relevantComponents.length === 0) {
      issues.push({
        severity: 'warning',
        area: 'architecture',
        description: 'No relevant components identified',
        recommendation: 'Identify which components will be affected',
      });
      score -= 10;
    } else {
      strengths.push(`${pkg.architecture.relevantComponents.length} relevant components identified`);
    }

    // Check code context
    if (pkg.codeContext.mustRead.length === 0) {
      issues.push({
        severity: 'warning',
        area: 'codeContext',
        description: 'No mustRead files specified',
        recommendation: 'Identify files that must be read before execution',
      });
      score -= 10;
    } else {
      strengths.push(`${pkg.codeContext.mustRead.length} mustRead files identified`);
    }

    // Check patterns
    if (!pkg.patterns.namingConventions || pkg.patterns.namingConventions === 'Unknown') {
      issues.push({
        severity: 'suggestion',
        area: 'patterns',
        description: 'Naming conventions not analyzed',
        recommendation: 'Analyze and document project naming conventions',
      });
      score -= 5;
    }

    // Check risks
    if (pkg.risks.length === 0 && pkg.projectType !== 'research') {
      issues.push({
        severity: 'suggestion',
        area: 'risks',
        description: 'No risks identified',
        recommendation: 'Consider potential risks and mitigations',
      });
      score -= 5;
    } else if (pkg.risks.length > 0) {
      strengths.push(`${pkg.risks.length} risks identified with mitigations`);
    }

    // Check human sync
    if (pkg.humanSync.ambiguities.length > 0) {
      strengths.push('Ambiguities explicitly identified for human review');
    }

    // Ensure score stays in bounds
    score = Math.max(score, 0);

    return {
      score,
      passed: score >= 70,
      issues,
      strengths,
      reasoning: `Heuristic evaluation based on completeness checks. Score: ${score}/100. ` +
        `${issues.length} issues found, ${strengths.length} strengths identified. ` +
        `Consider LLM evaluation for semantic quality assessment.`,
      method: 'heuristic',
    };
  }

  // ==========================================================================
  // Acceptance Criteria Verification
  // ==========================================================================

  /**
   * Verify if acceptance criteria are met after execution.
   *
   * This is used by QualityGate for semantic verification.
   */
  async verifyAcceptanceCriteria(
    criteria: string[],
    executionResult: {
      filesModified: string[];
      success: boolean;
      notes?: string;
    }
  ): Promise<AcceptanceCriteriaResult[]> {
    if (this.available && this.client) {
      return this.verifyWithLLM(criteria, executionResult);
    }
    return this.verifyWithHeuristics(criteria, executionResult);
  }

  private async verifyWithLLM(
    criteria: string[],
    executionResult: {
      filesModified: string[];
      success: boolean;
      notes?: string;
    }
  ): Promise<AcceptanceCriteriaResult[]> {
    const prompt = `You are verifying if acceptance criteria were met after a development task.

EXECUTION RESULT:
- Success: ${executionResult.success}
- Files Modified: ${executionResult.filesModified.join(', ') || 'none'}
- Notes: ${executionResult.notes || 'none'}

ACCEPTANCE CRITERIA:
${criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}

For each criterion, determine if it was likely met based on the execution result.
Note: You cannot see the actual code, only the metadata. Be conservative in your assessment.

Respond with a JSON array:
[
  {
    "criterion": "the criterion text",
    "met": true/false,
    "confidence": 0.0-1.0,
    "evidence": "why you think it was/wasn't met"
  }
]`;

    try {
      const response = await this.client!.messages.create({
        model: this.model,
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].type === 'text'
        ? response.content[0].text
        : '';

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No JSON array found');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return parsed.map((r: Record<string, unknown>) => ({
        criterion: String(r.criterion),
        met: Boolean(r.met),
        confidence: Number(r.confidence) || 0.5,
        evidence: String(r.evidence),
        method: 'llm' as const,
      }));
    } catch (error) {
      console.warn('[LLMClient] Criteria verification failed:', error);
      return this.verifyWithHeuristics(criteria, executionResult);
    }
  }

  private verifyWithHeuristics(
    criteria: string[],
    executionResult: {
      filesModified: string[];
      success: boolean;
      notes?: string;
    }
  ): AcceptanceCriteriaResult[] {
    // Simple heuristic: if execution succeeded, assume criteria are met
    // This is a weak signal - LLM verification is much better
    return criteria.map(criterion => ({
      criterion,
      met: executionResult.success,
      confidence: 0.3, // Low confidence for heuristic
      evidence: executionResult.success
        ? 'Execution reported success (heuristic assumption)'
        : 'Execution reported failure',
      method: 'heuristic' as const,
    }));
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const llmClient = new LLMClient();

// Factory function for testing
export function createLLMClient(): LLMClient {
  return new LLMClient();
}
