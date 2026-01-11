/**
 * Execution Tracing
 *
 * i[29] contribution: Observability First
 *
 * The Gap: The Forge has self-improvement but operates blind.
 * When execution fails, we see the final result but not the journey.
 * Which step took how long? What decisions were made? Why did it fail?
 *
 * The Solution: Execution traces that capture:
 * 1. Every step of the pipeline with timing
 * 2. Key decisions at each step
 * 3. Intermediate state for debugging
 *
 * This enables:
 * - Fast debugging of failed executions
 * - Identifying bottlenecks (which step is slow?)
 * - Replay capability for post-mortem analysis
 *
 * Hard Problems Addressed:
 * - #3 Learning System: Better data = better insights = better self-improvement
 */

import { mandrel } from './mandrel.js';
import type { StructuredFailure } from './types.js';
import { webSocketStreamer } from './websocket-streamer.js';

// ============================================================================
// Types
// ============================================================================

export type TraceStepName =
  | 'intake'
  | 'classification'
  | 'human_sync_pre'
  | 'preparation'
  | 'quality_evaluation'
  | 'human_sync_post'
  | 'code_generation'
  | 'file_operations'
  | 'compilation'
  | 'compilation_self_heal'
  | 'validation';

export type TraceStepStatus = 'success' | 'failure' | 'skipped';

export interface TraceStep {
  name: TraceStepName;
  status: TraceStepStatus;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface ExecutionTrace {
  traceId: string;
  taskId: string;
  projectPath: string;
  taskDescription: string;
  instanceId: string;
  startedAt: Date;
  endedAt?: Date;
  totalDurationMs?: number;
  outcome: 'success' | 'failure' | 'in_progress';
  steps: TraceStep[];
  structuredFailure?: StructuredFailure;
  summary?: TraceSummary;
}

export interface TraceSummary {
  slowestStep: string;
  slowestStepMs: number;
  failedStep?: string;
  stepCount: number;
  successCount: number;
  failureCount: number;
}

// ============================================================================
// Execution Tracer
// ============================================================================

export class ExecutionTracer {
  private trace: ExecutionTrace;
  private currentStepStart: number | null = null;
  private currentStepName: TraceStepName | null = null;

  constructor(
    taskId: string,
    projectPath: string,
    taskDescription: string,
    instanceId: string
  ) {
    this.trace = {
      traceId: crypto.randomUUID(),
      taskId,
      projectPath,
      taskDescription: taskDescription.substring(0, 200),
      instanceId,
      startedAt: new Date(),
      outcome: 'in_progress',
      steps: [],
    };
  }

  /**
   * Start timing a step
   */
  startStep(name: TraceStepName): void {
    if (this.currentStepName) {
      console.warn(`[Tracer] Previous step "${this.currentStepName}" not ended before starting "${name}"`);
      this.endStep('skipped');
    }
    this.currentStepName = name;
    this.currentStepStart = Date.now();
  }

  /**
   * End the current step with a status
   */
  endStep(
    status: TraceStepStatus,
    details?: Record<string, unknown>,
    error?: string
  ): void {
    if (!this.currentStepName || !this.currentStepStart) {
      console.warn('[Tracer] endStep called without active step');
      return;
    }

    const endedAt = Date.now();
    const step: TraceStep = {
      name: this.currentStepName,
      status,
      startedAt: this.currentStepStart,
      endedAt,
      durationMs: endedAt - this.currentStepStart,
      details,
      error,
    };

    this.trace.steps.push(step);
    
    // Stream trace step
    webSocketStreamer.streamTraceStep(
      this.trace.taskId,
      step.name,
      step.status,
      step.durationMs,
      step.details,
      step.error
    );
    
    this.currentStepName = null;
    this.currentStepStart = null;
  }

  /**
   * Record a step in one call (for steps that complete immediately)
   */
  recordStep(
    name: TraceStepName,
    status: TraceStepStatus,
    durationMs: number,
    details?: Record<string, unknown>,
    error?: string
  ): void {
    const now = Date.now();
    const step = {
      name,
      status,
      startedAt: now - durationMs,
      endedAt: now,
      durationMs,
      details,
      error,
    };
    
    this.trace.steps.push(step);
    
    // Stream trace step
    webSocketStreamer.streamTraceStep(
      this.trace.taskId,
      step.name,
      step.status,
      step.durationMs,
      step.details,
      step.error
    );
  }

  /**
   * Set the final outcome and compute summary
   */
  finalize(
    outcome: 'success' | 'failure',
    structuredFailure?: StructuredFailure
  ): ExecutionTrace {
    this.trace.endedAt = new Date();
    this.trace.totalDurationMs =
      this.trace.endedAt.getTime() - this.trace.startedAt.getTime();
    this.trace.outcome = outcome;
    this.trace.structuredFailure = structuredFailure;
    this.trace.summary = this.computeSummary();
    return this.trace;
  }

  /**
   * Get the current trace (even if not finalized)
   */
  getTrace(): ExecutionTrace {
    return this.trace;
  }

  /**
   * Compute summary statistics from steps
   */
  private computeSummary(): TraceSummary {
    const steps = this.trace.steps;

    if (steps.length === 0) {
      return {
        slowestStep: 'none',
        slowestStepMs: 0,
        stepCount: 0,
        successCount: 0,
        failureCount: 0,
      };
    }

    const slowest = steps.reduce((a, b) =>
      a.durationMs > b.durationMs ? a : b
    );

    const failed = steps.find((s) => s.status === 'failure');

    return {
      slowestStep: slowest.name,
      slowestStepMs: slowest.durationMs,
      failedStep: failed?.name,
      stepCount: steps.length,
      successCount: steps.filter((s) => s.status === 'success').length,
      failureCount: steps.filter((s) => s.status === 'failure').length,
    };
  }

  /**
   * Store the trace to Mandrel for later retrieval
   */
  async storeToMandrel(): Promise<void> {
    const trace = this.trace;
    const summary = trace.summary || this.computeSummary();

    const content = [
      `Execution Trace for ${trace.taskId}:`,
      `Trace ID: ${trace.traceId}`,
      `Instance: ${trace.instanceId}`,
      `Outcome: ${trace.outcome.toUpperCase()}`,
      `Duration: ${trace.totalDurationMs ?? 'in progress'}ms`,
      `Task: ${trace.taskDescription}`,
      `Project: ${trace.projectPath}`,
      '',
      'Steps:',
      ...trace.steps.map(
        (s) =>
          `  ${s.status === 'success' ? '✓' : s.status === 'failure' ? '✗' : '○'} ${s.name}: ${s.durationMs}ms${s.error ? ` (${s.error})` : ''}`
      ),
      '',
      `Slowest Step: ${summary.slowestStep} (${summary.slowestStepMs}ms)`,
      summary.failedStep ? `Failed Step: ${summary.failedStep}` : '',
      '',
      trace.structuredFailure
        ? `Failure: phase=${trace.structuredFailure.phase}, code=${trace.structuredFailure.code}`
        : '',
      '',
      `TRACE_JSON:${JSON.stringify(trace)}`,
    ]
      .filter(Boolean)
      .join('\n');

    await mandrel.storeContext(content, 'completion', [
      'execution-trace',
      `trace-${trace.traceId.slice(0, 8)}`,
      `task-${trace.taskId.slice(0, 8)}`,
      trace.outcome,
      trace.instanceId,
    ]);
  }
}

// ============================================================================
// Trace Retrieval
// ============================================================================

/**
 * Retrieve a trace from Mandrel by task ID
 */
export async function getTraceByTaskId(
  taskId: string
): Promise<ExecutionTrace | null> {
  // Search for traces containing this task ID
  const searchResults = await mandrel.searchContext(
    `TRACE_JSON taskId ${taskId}`,
    10
  );

  if (!searchResults) return null;

  const ids = mandrel.extractIdsFromSearchResults(searchResults);

  for (const id of ids) {
    const context = await mandrel.getContextById(id);
    if (!context.success || !context.content) continue;

    const jsonMatch = context.content.match(/TRACE_JSON:(.+)$/);
    if (jsonMatch) {
      try {
        const trace = JSON.parse(jsonMatch[1]) as ExecutionTrace;
        // Match full task ID or partial (first 8 chars)
        if (trace.taskId === taskId || trace.taskId.startsWith(taskId.slice(0, 8))) {
          return trace;
        }
      } catch {
        continue;
      }
    }
  }

  return null;
}

/**
 * Retrieve recent traces for analysis
 */
export async function getRecentTraces(
  limit: number = 10
): Promise<ExecutionTrace[]> {
  const searchResults = await mandrel.searchContext('TRACE_JSON traceId taskId instanceId', limit * 2);

  if (!searchResults) return [];

  const ids = mandrel.extractIdsFromSearchResults(searchResults);
  const traces: ExecutionTrace[] = [];

  for (const id of ids) {
    if (traces.length >= limit) break;
    
    const context = await mandrel.getContextById(id);
    if (!context.success || !context.content) continue;

    const jsonMatch = context.content.match(/TRACE_JSON:(.+)$/);
    if (jsonMatch) {
      try {
        traces.push(JSON.parse(jsonMatch[1]) as ExecutionTrace);
      } catch {
        continue;
      }
    }
  }

  return traces;
}

/**
 * Format a trace for display
 */
export function formatTrace(trace: ExecutionTrace): string {
  const lines: string[] = [];

  lines.push('═'.repeat(60));
  lines.push(`EXECUTION TRACE - ${trace.outcome.toUpperCase()}`);
  lines.push('═'.repeat(60));

  lines.push(`\nTask ID: ${trace.taskId}`);
  lines.push(`Trace ID: ${trace.traceId}`);
  lines.push(`Instance: ${trace.instanceId}`);
  lines.push(`Project: ${trace.projectPath}`);
  lines.push(`Task: ${trace.taskDescription}`);
  lines.push(`Duration: ${trace.totalDurationMs ?? 'N/A'}ms`);

  lines.push('\n' + '─'.repeat(40));
  lines.push('STEPS');
  lines.push('─'.repeat(40));

  for (const step of trace.steps) {
    const icon =
      step.status === 'success'
        ? '✓'
        : step.status === 'failure'
          ? '✗'
          : '○';
    const duration = `${step.durationMs}ms`.padStart(6);
    lines.push(`  ${icon} ${step.name.padEnd(25)} ${duration}`);

    if (step.error) {
      lines.push(`      Error: ${step.error.substring(0, 60)}...`);
    }

    if (step.details && Object.keys(step.details).length > 0) {
      for (const [key, value] of Object.entries(step.details)) {
        const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
        lines.push(`      ${key}: ${valueStr.substring(0, 50)}`);
      }
    }
  }

  if (trace.summary) {
    lines.push('\n' + '─'.repeat(40));
    lines.push('SUMMARY');
    lines.push('─'.repeat(40));
    lines.push(`  Slowest Step: ${trace.summary.slowestStep} (${trace.summary.slowestStepMs}ms)`);
    lines.push(`  Steps: ${trace.summary.successCount}/${trace.summary.stepCount} succeeded`);

    if (trace.summary.failedStep) {
      lines.push(`  Failed At: ${trace.summary.failedStep}`);
    }
  }

  if (trace.structuredFailure) {
    lines.push('\n' + '─'.repeat(40));
    lines.push('FAILURE DETAILS');
    lines.push('─'.repeat(40));
    lines.push(`  Phase: ${trace.structuredFailure.phase}`);
    lines.push(`  Code: ${trace.structuredFailure.code}`);
    lines.push(`  Message: ${trace.structuredFailure.message.substring(0, 100)}`);

    if (trace.structuredFailure.suggestedFix) {
      lines.push(`  Suggested Fix: ${trace.structuredFailure.suggestedFix}`);
    }
  }

  lines.push('\n' + '═'.repeat(60));

  return lines.join('\n');
}

// Factory function
export function createExecutionTracer(
  taskId: string,
  projectPath: string,
  taskDescription: string,
  instanceId: string
): ExecutionTracer {
  return new ExecutionTracer(taskId, projectPath, taskDescription, instanceId);
}
