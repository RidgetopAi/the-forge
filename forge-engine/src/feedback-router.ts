/**
 * Feedback Router
 *
 * Intelligent error routing for self-correction.
 * Categorizes errors and routes them to appropriate actions:
 * retry, escalate, fail, or human_sync.
 *
 * Phase 6 of SIRK-V2 implementation.
 *
 * Key behaviors:
 * - Categorizes errors: compilation, type, test, lint, runtime, timeout, unknown
 * - Routes errors to appropriate action based on category and attempt count
 * - Max auto-retries: 3 (escalates after)
 * - Integrates with PatternTracker to record pattern failures
 * - Uses Opus tier for stuck point resolution on complex errors
 */

import { TierRouter } from './tiers.js';
import { PatternTracker } from './pattern-tracker.js';

// ============================================================================
// Task 6.2: ErrorCategory and ErrorContext Types
// ============================================================================

/**
 * Categories of errors that can occur during execution.
 * Used to route errors to appropriate handling strategies.
 */
export type ErrorCategory =
  | 'compilation_error'
  | 'type_error'
  | 'test_failure'
  | 'lint_error'
  | 'runtime_error'
  | 'timeout'
  | 'unknown';

/**
 * Context about an error for routing decisions.
 */
export interface ErrorContext {
  /** Categorized error type */
  category: ErrorCategory;
  /** The error message */
  message: string;
  /** File path where error occurred (if known) */
  file?: string;
  /** Line number of error (if known) */
  line?: number;
  /** Full stack trace (if available) */
  stackTrace?: string;
  /** Number of previous attempts to fix this error */
  previousAttempts: number;
  /** Pattern ID that was used when this error occurred (for pattern tracking) */
  patternId?: string;
  /** Pattern name for logging */
  patternName?: string;
}

// ============================================================================
// Task 6.5: FeedbackAction Response Types
// ============================================================================

/**
 * Actions that can be taken in response to an error.
 *
 * - retry: Try again with suggested fix
 * - escalate: Bump to higher tier (Opus) for judgment
 * - fail: Give up, task cannot be completed
 * - human_sync: Requires human input
 */
export type FeedbackActionType = 'retry' | 'escalate' | 'fail' | 'human_sync';

/**
 * Complete action response from the FeedbackRouter.
 */
export interface FeedbackAction {
  /** The action to take */
  action: FeedbackActionType;
  /** Human-readable reason for this decision */
  reason: string;
  /** Suggested fix approach (for retry actions) */
  suggestedFix?: string;
  /** Pattern ID to record failure for (for pattern tracking) */
  patternToUpdate?: string;
}

// ============================================================================
// Task 6.1: FeedbackRouter Class
// ============================================================================

/**
 * FeedbackRouter - Intelligent error routing for self-correction.
 *
 * Routes execution errors to appropriate actions based on:
 * - Error category (type, compilation, test, etc.)
 * - Number of previous attempts
 * - Pattern history from PatternTracker
 *
 * Uses Opus tier for complex stuck-point resolution when simple
 * retries won't work.
 */
export class FeedbackRouter {
  private tierRouter: TierRouter;
  private patternTracker: PatternTracker;
  private maxAutoRetries: number = 3;

  constructor(tierRouter: TierRouter, patternTracker: PatternTracker) {
    this.tierRouter = tierRouter;
    this.patternTracker = patternTracker;
  }

  // --------------------------------------------------------------------------
  // Task 6.3: categorizeError() Method
  // --------------------------------------------------------------------------

  /**
   * Categorize an error based on its message content.
   *
   * Uses pattern matching to identify error types:
   * - type_error: TypeScript errors (TS####)
   * - compilation_error: Syntax errors, compile failures
   * - test_failure: Test framework failures
   * - lint_error: ESLint, Prettier issues
   * - timeout: Timeout errors
   * - runtime_error: General runtime exceptions
   * - unknown: Unrecognized errors
   *
   * @param error - The error message to categorize
   * @returns The error category
   */
  categorizeError(error: string): ErrorCategory {
    // TypeScript errors (TS#### pattern)
    if (error.includes('TS') && /TS\d{4}/.test(error)) {
      return 'type_error';
    }

    // Compilation/syntax errors
    if (
      error.includes('Cannot compile') ||
      error.includes('SyntaxError') ||
      error.includes('Unexpected token') ||
      error.includes('Parse error')
    ) {
      return 'compilation_error';
    }

    // Test failures
    if (
      error.includes('FAIL') ||
      error.includes('test failed') ||
      error.includes('AssertionError') ||
      error.includes('Expected') ||
      /\d+ failing/.test(error)
    ) {
      return 'test_failure';
    }

    // Lint errors
    if (
      error.includes('ESLint') ||
      error.includes('Prettier') ||
      error.includes('eslint') ||
      error.includes('prettier')
    ) {
      return 'lint_error';
    }

    // Timeout errors
    if (
      error.includes('timeout') ||
      error.includes('ETIMEOUT') ||
      error.includes('timed out') ||
      error.includes('ETIMEDOUT')
    ) {
      return 'timeout';
    }

    // Runtime errors (general exception patterns)
    if (
      error.includes('Error:') ||
      error.includes('Exception') ||
      error.includes('undefined is not') ||
      error.includes('null is not') ||
      error.includes('cannot read property')
    ) {
      return 'runtime_error';
    }

    return 'unknown';
  }

  // --------------------------------------------------------------------------
  // Task 6.4: routeError() Decision Logic
  // --------------------------------------------------------------------------

  /**
   * Route an error to the appropriate action.
   *
   * Decision tree:
   * 1. If max retries exceeded -> escalate
   * 2. Based on category:
   *    - type_error/compilation_error: retry with fix hint
   *    - test_failure: retry
   *    - lint_error: retry (usually auto-fixable)
   *    - timeout: escalate (may need human intervention)
   *    - runtime_error: escalate after 1 attempt
   *    - unknown: use Opus for judgment
   *
   * @param context - Error context with category, message, attempts
   * @returns Action to take
   */
  async routeError(context: ErrorContext): Promise<FeedbackAction> {
    // Quick exit: max retries exceeded
    if (context.previousAttempts >= this.maxAutoRetries) {
      // Record pattern failure if we have a pattern
      if (context.patternId && context.patternName) {
        await this.patternTracker.recordFailure(context.patternId, context.patternName);
      }

      return {
        action: 'escalate',
        reason: `Max retries (${this.maxAutoRetries}) exceeded`,
        patternToUpdate: context.patternId,
      };
    }

    // Category-specific routing
    switch (context.category) {
      case 'type_error':
        return {
          action: 'retry',
          reason: 'TypeScript error detected - can be fixed with type corrections',
          suggestedFix: this.extractTypeErrorFix(context.message),
        };

      case 'compilation_error':
        return {
          action: 'retry',
          reason: 'Compilation error detected - syntax issue can be corrected',
          suggestedFix: this.extractCompilationFix(context.message),
        };

      case 'test_failure':
        return {
          action: 'retry',
          reason: 'Test failed - implementation may need adjustment',
          suggestedFix: 'Review test expectations and implementation logic',
        };

      case 'lint_error':
        return {
          action: 'retry',
          reason: 'Lint error - usually auto-fixable',
          suggestedFix: 'Run linter with --fix or apply formatting corrections',
        };

      case 'timeout':
        return {
          action: 'escalate',
          reason: 'Timeout error - may indicate infinite loop or network issue',
        };

      case 'runtime_error':
        // Runtime errors are trickier - escalate after first attempt
        if (context.previousAttempts >= 1) {
          return {
            action: 'escalate',
            reason: 'Runtime error persists after retry - needs deeper analysis',
          };
        }
        return {
          action: 'retry',
          reason: 'Runtime error - may be fixable with null checks or validation',
          suggestedFix: this.extractRuntimeFix(context.message),
        };

      case 'unknown':
      default:
        // For unknown errors, use Opus to make judgment call
        return this.resolveStuckPoint(context);
    }
  }

  // --------------------------------------------------------------------------
  // Helper Methods for Fix Suggestions
  // --------------------------------------------------------------------------

  /**
   * Extract a fix suggestion from a TypeScript error.
   */
  private extractTypeErrorFix(message: string): string {
    // TS2304: Cannot find name 'X'
    if (message.includes('TS2304')) {
      const match = message.match(/Cannot find name '([^']+)'/);
      if (match) {
        return `Import or declare '${match[1]}'`;
      }
    }

    // TS2322: Type 'X' is not assignable to type 'Y'
    if (message.includes('TS2322')) {
      return 'Check type compatibility and add type assertion or fix type mismatch';
    }

    // TS2339: Property 'X' does not exist on type 'Y'
    if (message.includes('TS2339')) {
      const match = message.match(/Property '([^']+)' does not exist on type '([^']+)'/);
      if (match) {
        return `Add property '${match[1]}' to type '${match[2]}' or check for typo`;
      }
    }

    // TS2345: Argument type mismatch
    if (message.includes('TS2345')) {
      return 'Check function argument types and provide correct type';
    }

    // TS7006: Parameter implicitly has 'any' type
    if (message.includes('TS7006')) {
      return 'Add explicit type annotation to parameter';
    }

    return 'Review TypeScript error and add appropriate types/imports';
  }

  /**
   * Extract a fix suggestion from a compilation error.
   */
  private extractCompilationFix(message: string): string {
    if (message.includes('Unexpected token')) {
      return 'Check for missing semicolons, brackets, or syntax issues';
    }

    if (message.includes('Cannot compile')) {
      return 'Review file for syntax errors near the indicated line';
    }

    return 'Check syntax and ensure all brackets/parentheses are balanced';
  }

  /**
   * Extract a fix suggestion from a runtime error.
   */
  private extractRuntimeFix(message: string): string {
    if (message.includes('undefined is not') || message.includes('null is not')) {
      return 'Add null/undefined checks before accessing properties';
    }

    if (message.includes('cannot read property')) {
      return 'Verify object exists before accessing nested properties';
    }

    return 'Add defensive checks and error handling';
  }

  // --------------------------------------------------------------------------
  // Opus Judgment for Stuck Points
  // --------------------------------------------------------------------------

  /**
   * Use Opus tier to resolve stuck points.
   *
   * For unknown or complex errors that simple retries won't fix,
   * we escalate to Opus for deeper analysis and judgment.
   *
   * @param context - Error context
   * @returns Action based on Opus judgment
   */
  private async resolveStuckPoint(context: ErrorContext): Promise<FeedbackAction> {
    console.log(`[FeedbackRouter] Invoking Opus for stuck point resolution...`);

    try {
      const result = await this.tierRouter.call({
        operation: 'resolve_stuck_point',
        systemPrompt: `You are an expert debugger analyzing a stuck execution.
Evaluate whether this error can be retried with a different approach,
should be escalated to a human, or should fail the task.

Output your decision as JSON:
{
  "action": "retry" | "escalate" | "fail" | "human_sync",
  "reason": "explanation",
  "suggestedFix": "optional fix approach"
}`,
        userPrompt: `Error Category: ${context.category}
Error Message: ${context.message}
Previous Attempts: ${context.previousAttempts}
File: ${context.file || 'unknown'}
Line: ${context.line || 'unknown'}
Stack Trace: ${context.stackTrace || 'not available'}

Analyze this error and decide the best course of action.`,
        maxTokens: 500,
        temperature: 0,
      });

      // Parse Opus response
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const judgment = JSON.parse(jsonMatch[0]) as {
          action?: string;
          reason?: string;
          suggestedFix?: string;
        };

        const validActions: FeedbackActionType[] = ['retry', 'escalate', 'fail', 'human_sync'];
        const action = validActions.includes(judgment.action as FeedbackActionType)
          ? (judgment.action as FeedbackActionType)
          : 'human_sync';

        return {
          action,
          reason: judgment.reason || 'Opus judgment',
          suggestedFix: judgment.suggestedFix,
          patternToUpdate: context.patternId,
        };
      }

      // Fallback if parsing fails
      return {
        action: 'human_sync',
        reason: 'Unknown error category - requires human review',
      };

    } catch (error) {
      console.warn(`[FeedbackRouter] Opus call failed:`, error);
      return {
        action: 'human_sync',
        reason: 'Error analysis failed - requires human review',
      };
    }
  }

  // --------------------------------------------------------------------------
  // Pattern Tracking Integration
  // --------------------------------------------------------------------------

  /**
   * Record a pattern failure after routing decision.
   * Called when an error leads to escalation or failure.
   */
  async recordPatternFailure(
    patternId: string,
    patternName: string
  ): Promise<void> {
    await this.patternTracker.recordFailure(patternId, patternName);
  }

  /**
   * Record a pattern success after successful retry.
   * Called when a retry fixes the issue.
   */
  async recordPatternSuccess(
    patternId: string,
    patternName: string,
    context: string
  ): Promise<void> {
    await this.patternTracker.recordSuccess(patternId, patternName, context);
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  /**
   * Get the maximum number of auto-retries.
   */
  getMaxAutoRetries(): number {
    return this.maxAutoRetries;
  }

  /**
   * Set the maximum number of auto-retries.
   */
  setMaxAutoRetries(max: number): void {
    this.maxAutoRetries = max;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a FeedbackRouter with the provided dependencies.
 */
export function createFeedbackRouter(
  tierRouter: TierRouter,
  patternTracker: PatternTracker
): FeedbackRouter {
  return new FeedbackRouter(tierRouter, patternTracker);
}
