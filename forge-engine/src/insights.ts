/**
 * Insight Generator
 *
 * i[20] contribution: Makes learning ACTUALLY compound.
 *
 * The Gap: The Forge stores execution feedback but doesn't analyze it for patterns.
 * LearningRetriever searches past contexts but doesn't extract statistical insights.
 *
 * InsightGenerator fills this gap by:
 * 1. Collecting ALL execution feedback for a project
 * 2. Computing statistical patterns (success rates, accuracy metrics)
 * 3. Identifying common failure modes
 * 4. Generating actionable recommendations
 *
 * This addresses Hard Problem #3 (Learning System) at its root.
 */

import { mandrel } from './mandrel.js';

// ============================================================================
// Types
// ============================================================================

export interface ExecutionFeedbackData {
  taskId: string;
  contextPackageId: string;
  executedBy: string;
  timestamp?: string;
  outcome: {
    success: boolean;
    filesActuallyModified: string[];
    filesActuallyRead: string[];
    testsRan?: boolean;
    testsPassed?: boolean;
    compilationPassed: boolean;
  };
  accuracy: {
    mustReadAccuracy: {
      predicted: string[];
      actual: string[];
      missed: string[];
      unnecessary: string[];
    };
    patternsFollowed: string[];
    patternsViolated: string[];
  };
  learnings: Array<{
    type: string;
    content: string;
    tags: string[];
  }>;
}

export interface InsightSummary {
  totalExecutions: number;
  successRate: number;
  compilationPassRate: number;
  testPassRate: number;

  mustReadAccuracy: {
    averagePredicted: number;
    averageActual: number;
    averageMissed: number;
    averageUnnecessary: number;
    overPredictionRate: number;  // How often we predict more than needed
  };

  failureModes: Array<{
    mode: string;
    count: number;
    percentage: number;
    examples: string[];
  }>;

  successPatterns: Array<{
    pattern: string;
    successRate: number;
    sampleSize: number;
  }>;

  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    category: string;
    recommendation: string;
    evidence: string;
  }>;

  byExecutor: Record<string, {
    executions: number;
    successRate: number;
    avgUnnecessaryFiles: number;
  }>;
}

// ============================================================================
// Insight Generator
// ============================================================================

export class InsightGenerator {
  private instanceId: string;
  private projectPath: string | null = null;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  /**
   * Generate insights from accumulated execution feedback.
   *
   * This is the main entry point. It:
   * 1. Queries Mandrel for all execution-feedback contexts
   * 2. Parses and validates the data
   * 3. Computes statistical patterns
   * 4. Generates recommendations
   */
  async generateInsights(projectPath?: string): Promise<InsightSummary> {
    this.projectPath = projectPath || null;
    console.log(`[InsightGenerator] Analyzing execution feedback...`);

    // Step 1: Collect all execution feedback
    const feedbackData = await this.collectExecutionFeedback();
    console.log(`[InsightGenerator] Collected ${feedbackData.length} execution records`);

    if (feedbackData.length === 0) {
      return this.emptyInsights();
    }

    // Step 2: Compute statistics
    const summary = this.computeStatistics(feedbackData);

    // Step 3: Identify failure modes
    summary.failureModes = this.identifyFailureModes(feedbackData);

    // Step 4: Identify success patterns
    summary.successPatterns = this.identifySuccessPatterns(feedbackData);

    // Step 5: Generate recommendations
    summary.recommendations = this.generateRecommendations(summary, feedbackData);

    // Step 6: Compute per-executor stats
    summary.byExecutor = this.computeByExecutor(feedbackData);

    return summary;
  }

  /**
   * Collect all execution feedback from Mandrel.
   *
   * Uses two-phase retrieval:
   * 1. Search for execution-feedback contexts
   * 2. Fetch full content and parse JSON
   *
   * i[21] fix: Changed search query from 'execution-feedback' to match actual
   * JSON content structure. The old query used semantic similarity to "execution-feedback"
   * but the actual feedback JSON contains "filesActuallyModified", "outcome", etc.
   * This caused 97% data loss (only 3 of 101 contexts parsed).
   */
  private async collectExecutionFeedback(): Promise<ExecutionFeedbackData[]> {
    const feedbackData: ExecutionFeedbackData[] = [];

    try {
      // i[21]: Search using actual JSON field names instead of tag name
      // Old query 'execution-feedback' found 101 results but only 3 parsed
      // because semantic search matched unrelated content
      const searchResults = await mandrel.searchContext(
        'filesActuallyModified filesActuallyRead compilationPassed outcome accuracy mustReadAccuracy',
        100
      );
      if (!searchResults) return [];

      // Extract context IDs
      const contextIds = mandrel.extractIdsFromSearchResults(searchResults);
      console.log(`[InsightGenerator] Found ${contextIds.length} execution feedback contexts`);

      // Fetch and parse each
      for (const id of contextIds) {
        const fullContext = await mandrel.getContextById(id);
        if (!fullContext.success || !fullContext.content) continue;

        // Filter by project if specified
        if (this.projectPath) {
          if (!fullContext.content.includes(this.projectPath) &&
              !fullContext.content.includes(this.projectPath.split('/').pop()!)) {
            continue;
          }
        }

        // Parse the JSON from the content
        const parsed = this.parseExecutionFeedback(fullContext.content);
        if (parsed) {
          feedbackData.push(parsed);
        }
      }
    } catch (error) {
      console.warn('[InsightGenerator] Error collecting feedback:', error);
    }

    return feedbackData;
  }

  /**
   * Parse execution feedback JSON from context content.
   *
   * The content format is typically:
   * "Execution feedback for taskId:\n{JSON object}"
   * or
   * "ExecutionFeedback for task taskId:\n...\nFull feedback:\n{JSON object}"
   */
  private parseExecutionFeedback(content: string): ExecutionFeedbackData | null {
    try {
      // Look for JSON object with "outcome" field
      const jsonMatch = content.match(/\{[\s\S]*"outcome"[\s\S]*"accuracy"[\s\S]*\}/);
      if (!jsonMatch) return null;

      const data = JSON.parse(jsonMatch[0]);

      // Validate required fields
      if (!data.outcome || !data.accuracy) return null;

      return {
        taskId: data.taskId || 'unknown',
        contextPackageId: data.contextPackageId || 'unknown',
        executedBy: data.executedBy || 'unknown',
        timestamp: data.timestamp,
        outcome: {
          success: data.outcome.success ?? false,
          filesActuallyModified: data.outcome.filesActuallyModified || [],
          filesActuallyRead: data.outcome.filesActuallyRead || [],
          testsRan: data.outcome.testsRan,
          testsPassed: data.outcome.testsPassed,
          compilationPassed: data.outcome.compilationPassed ?? false,
        },
        accuracy: {
          mustReadAccuracy: {
            predicted: data.accuracy.mustReadAccuracy?.predicted || [],
            actual: data.accuracy.mustReadAccuracy?.actual || [],
            missed: data.accuracy.mustReadAccuracy?.missed || [],
            unnecessary: data.accuracy.mustReadAccuracy?.unnecessary || [],
          },
          patternsFollowed: data.accuracy.patternsFollowed || [],
          patternsViolated: data.accuracy.patternsViolated || [],
        },
        learnings: data.learnings || [],
      };
    } catch {
      return null;
    }
  }

  /**
   * Compute basic statistics from the feedback data.
   */
  private computeStatistics(data: ExecutionFeedbackData[]): InsightSummary {
    const total = data.length;
    const successes = data.filter(d => d.outcome.success).length;
    const compilationPasses = data.filter(d => d.outcome.compilationPassed).length;
    const testsRan = data.filter(d => d.outcome.testsRan);
    const testsPassed = testsRan.filter(d => d.outcome.testsPassed).length;

    // mustRead accuracy
    let totalPredicted = 0;
    let totalActual = 0;
    let totalMissed = 0;
    let totalUnnecessary = 0;
    let overPredictions = 0;

    for (const d of data) {
      const predicted = d.accuracy.mustReadAccuracy.predicted.length;
      const actual = d.accuracy.mustReadAccuracy.actual.length;
      const unnecessary = d.accuracy.mustReadAccuracy.unnecessary.length;
      const missed = d.accuracy.mustReadAccuracy.missed.length;

      totalPredicted += predicted;
      totalActual += actual;
      totalMissed += missed;
      totalUnnecessary += unnecessary;

      if (unnecessary > 0) overPredictions++;
    }

    return {
      totalExecutions: total,
      successRate: total > 0 ? successes / total : 0,
      compilationPassRate: total > 0 ? compilationPasses / total : 0,
      testPassRate: testsRan.length > 0 ? testsPassed / testsRan.length : 0,

      mustReadAccuracy: {
        averagePredicted: total > 0 ? totalPredicted / total : 0,
        averageActual: total > 0 ? totalActual / total : 0,
        averageMissed: total > 0 ? totalMissed / total : 0,
        averageUnnecessary: total > 0 ? totalUnnecessary / total : 0,
        overPredictionRate: total > 0 ? overPredictions / total : 0,
      },

      failureModes: [],
      successPatterns: [],
      recommendations: [],
      byExecutor: {},
    };
  }

  /**
   * Identify common failure modes from the data.
   *
   * i[21] enhancement: Better categorization using structured error messages
   * from execution.ts. Previously 67% of failures were "unknown_failure"
   * because error details weren't being captured.
   */
  private identifyFailureModes(data: ExecutionFeedbackData[]): InsightSummary['failureModes'] {
    const failures = data.filter(d => !d.outcome.success);
    if (failures.length === 0) return [];

    const modes: Record<string, { count: number; examples: string[] }> = {};

    for (const f of failures) {
      // Categorize by failure type
      let mode: string;

      if (!f.outcome.compilationPassed) {
        mode = 'compilation_failure';
      } else if (f.outcome.testsRan && !f.outcome.testsPassed) {
        mode = 'test_failure';
      } else {
        // i[21]: Check learnings for structured error hints
        // New format: "Task had issues: TypeScript error: TS2345..."
        // or "Task had issues: Validation failed: tool1, tool2"
        const learningContent = f.learnings.map(l => l.content.toLowerCase()).join(' ');

        if (learningContent.includes('typescript error') || learningContent.includes('error ts')) {
          mode = 'type_error';
        } else if (learningContent.includes('validation failed')) {
          mode = 'validation_failure';
        } else if (learningContent.includes('code generation failed')) {
          mode = 'code_generation_failure';
        } else if (learningContent.includes('file operation failed')) {
          mode = 'file_operation_failure';
        } else if (learningContent.includes('compilation failed')) {
          mode = 'compilation_failure';
        } else if (learningContent.includes('json') || learningContent.includes('parse')) {
          mode = 'json_parsing_error';
        } else if (learningContent.includes('timeout')) {
          mode = 'timeout';
        } else {
          mode = 'unknown_failure';
        }
      }

      if (!modes[mode]) {
        modes[mode] = { count: 0, examples: [] };
      }
      modes[mode].count++;
      if (modes[mode].examples.length < 3) {
        modes[mode].examples.push(f.taskId.slice(0, 8));
      }
    }

    // Convert to array and calculate percentages
    const totalFailures = failures.length;
    return Object.entries(modes)
      .map(([mode, { count, examples }]) => ({
        mode,
        count,
        percentage: count / totalFailures,
        examples,
      }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Identify patterns that correlate with success.
   */
  private identifySuccessPatterns(data: ExecutionFeedbackData[]): InsightSummary['successPatterns'] {
    const patterns: InsightSummary['successPatterns'] = [];

    // Pattern 1: Low unnecessary file count correlates with success
    const lowUnnecessary = data.filter(d => d.accuracy.mustReadAccuracy.unnecessary.length <= 2);
    if (lowUnnecessary.length >= 3) {
      const successRate = lowUnnecessary.filter(d => d.outcome.success).length / lowUnnecessary.length;
      patterns.push({
        pattern: 'mustRead accuracy (≤2 unnecessary files)',
        successRate,
        sampleSize: lowUnnecessary.length,
      });
    }

    // Pattern 2: Zero missed files correlates with success
    const zeroMissed = data.filter(d => d.accuracy.mustReadAccuracy.missed.length === 0);
    if (zeroMissed.length >= 3) {
      const successRate = zeroMissed.filter(d => d.outcome.success).length / zeroMissed.length;
      patterns.push({
        pattern: 'Perfect mustRead prediction (0 missed)',
        successRate,
        sampleSize: zeroMissed.length,
      });
    }

    // Pattern 3: Compilation pass as prerequisite
    const compilationPassed = data.filter(d => d.outcome.compilationPassed);
    if (compilationPassed.length >= 3) {
      const successRate = compilationPassed.filter(d => d.outcome.success).length / compilationPassed.length;
      patterns.push({
        pattern: 'Compilation passed',
        successRate,
        sampleSize: compilationPassed.length,
      });
    }

    return patterns.sort((a, b) => b.successRate - a.successRate);
  }

  /**
   * Generate actionable recommendations based on the analysis.
   */
  private generateRecommendations(
    summary: InsightSummary,
    data: ExecutionFeedbackData[]
  ): InsightSummary['recommendations'] {
    const recommendations: InsightSummary['recommendations'] = [];

    // Recommendation 1: If over-prediction is high, suggest preparation improvement
    if (summary.mustReadAccuracy.overPredictionRate > 0.5) {
      recommendations.push({
        priority: 'high',
        category: 'preparation',
        recommendation: 'Reduce mustRead file predictions - preparation over-predicts needed files',
        evidence: `${(summary.mustReadAccuracy.overPredictionRate * 100).toFixed(0)}% of executions had unnecessary files in mustRead. Average ${summary.mustReadAccuracy.averageUnnecessary.toFixed(1)} unnecessary files per execution.`,
      });
    }

    // Recommendation 2: If success rate is low, identify primary failure mode
    if (summary.successRate < 0.5 && summary.failureModes.length > 0) {
      const primaryMode = summary.failureModes[0];
      recommendations.push({
        priority: 'high',
        category: 'execution',
        recommendation: `Address primary failure mode: ${primaryMode.mode.replace(/_/g, ' ')}`,
        evidence: `${primaryMode.count} failures (${(primaryMode.percentage * 100).toFixed(0)}% of all failures). Examples: ${primaryMode.examples.join(', ')}`,
      });
    }

    // Recommendation 3: If JSON parsing is a common failure, suggest tool_use
    const jsonFailures = summary.failureModes.find(m => m.mode === 'json_parsing_error');
    if (jsonFailures && jsonFailures.percentage > 0.2) {
      recommendations.push({
        priority: 'medium',
        category: 'architecture',
        recommendation: 'Consider using Anthropic tool_use for structured code output',
        evidence: `JSON parsing errors account for ${(jsonFailures.percentage * 100).toFixed(0)}% of failures. Tool use provides guaranteed valid JSON.`,
      });
    }

    // Recommendation 4: If compilation pass rate is high but success rate is low
    if (summary.compilationPassRate > 0.7 && summary.successRate < 0.5) {
      recommendations.push({
        priority: 'medium',
        category: 'validation',
        recommendation: 'Compilation passes but tasks still fail - add more validation tools',
        evidence: `Compilation passes ${(summary.compilationPassRate * 100).toFixed(0)}% but overall success only ${(summary.successRate * 100).toFixed(0)}%. More validation needed beyond compilation.`,
      });
    }

    // Recommendation 5: If test coverage is low
    const testsRan = data.filter(d => d.outcome.testsRan).length;
    if (testsRan < data.length * 0.3) {
      recommendations.push({
        priority: 'low',
        category: 'testing',
        recommendation: 'Increase test coverage in validation',
        evidence: `Only ${testsRan} of ${data.length} executions ran tests (${(testsRan / data.length * 100).toFixed(0)}%).`,
      });
    }

    // Recommendation 6: If sample size is small
    if (data.length < 10) {
      recommendations.push({
        priority: 'low',
        category: 'data',
        recommendation: 'Run more executions to improve insight accuracy',
        evidence: `Only ${data.length} execution records available. Statistical patterns may not be reliable with small sample size.`,
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 0, medium: 1, low: 2 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  /**
   * Compute statistics grouped by executor (instance).
   */
  private computeByExecutor(data: ExecutionFeedbackData[]): InsightSummary['byExecutor'] {
    const byExecutor: InsightSummary['byExecutor'] = {};

    for (const d of data) {
      const executor = d.executedBy || 'unknown';
      if (!byExecutor[executor]) {
        byExecutor[executor] = {
          executions: 0,
          successRate: 0,
          avgUnnecessaryFiles: 0,
        };
      }
      byExecutor[executor].executions++;
    }

    // Calculate rates for each executor
    for (const executor of Object.keys(byExecutor)) {
      const executorData = data.filter(d => d.executedBy === executor);
      const successes = executorData.filter(d => d.outcome.success).length;
      const totalUnnecessary = executorData.reduce(
        (sum, d) => sum + d.accuracy.mustReadAccuracy.unnecessary.length,
        0
      );

      byExecutor[executor].successRate = successes / executorData.length;
      byExecutor[executor].avgUnnecessaryFiles = totalUnnecessary / executorData.length;
    }

    return byExecutor;
  }

  /**
   * Return empty insights when no data is available.
   */
  private emptyInsights(): InsightSummary {
    return {
      totalExecutions: 0,
      successRate: 0,
      compilationPassRate: 0,
      testPassRate: 0,
      mustReadAccuracy: {
        averagePredicted: 0,
        averageActual: 0,
        averageMissed: 0,
        averageUnnecessary: 0,
        overPredictionRate: 0,
      },
      failureModes: [],
      successPatterns: [],
      recommendations: [{
        priority: 'high',
        category: 'data',
        recommendation: 'No execution feedback found. Run The Forge with --execute to generate data.',
        evidence: '0 execution records in Mandrel.',
      }],
      byExecutor: {},
    };
  }

  /**
   * Format insights for display.
   */
  formatInsights(insights: InsightSummary): string {
    const lines: string[] = [];

    lines.push('═'.repeat(60));
    lines.push('THE FORGE - Insight Generator (i[20])');
    lines.push('═'.repeat(60));

    // Summary Statistics
    lines.push('\n' + '─'.repeat(40));
    lines.push('EXECUTION STATISTICS');
    lines.push('─'.repeat(40));
    lines.push(`Total Executions: ${insights.totalExecutions}`);
    lines.push(`Success Rate: ${(insights.successRate * 100).toFixed(1)}%`);
    lines.push(`Compilation Pass Rate: ${(insights.compilationPassRate * 100).toFixed(1)}%`);
    if (insights.testPassRate > 0) {
      lines.push(`Test Pass Rate: ${(insights.testPassRate * 100).toFixed(1)}%`);
    }

    // mustRead Accuracy
    lines.push('\n' + '─'.repeat(40));
    lines.push('MUSTREAD ACCURACY');
    lines.push('─'.repeat(40));
    lines.push(`Avg Files Predicted: ${insights.mustReadAccuracy.averagePredicted.toFixed(1)}`);
    lines.push(`Avg Files Actually Read: ${insights.mustReadAccuracy.averageActual.toFixed(1)}`);
    lines.push(`Avg Missed Files: ${insights.mustReadAccuracy.averageMissed.toFixed(1)}`);
    lines.push(`Avg Unnecessary Files: ${insights.mustReadAccuracy.averageUnnecessary.toFixed(1)}`);
    lines.push(`Over-Prediction Rate: ${(insights.mustReadAccuracy.overPredictionRate * 100).toFixed(1)}%`);

    // Failure Modes
    if (insights.failureModes.length > 0) {
      lines.push('\n' + '─'.repeat(40));
      lines.push('FAILURE MODES');
      lines.push('─'.repeat(40));
      for (const mode of insights.failureModes) {
        lines.push(`  ${mode.mode.replace(/_/g, ' ')}: ${mode.count} (${(mode.percentage * 100).toFixed(0)}%)`);
      }
    }

    // Success Patterns
    if (insights.successPatterns.length > 0) {
      lines.push('\n' + '─'.repeat(40));
      lines.push('SUCCESS PATTERNS');
      lines.push('─'.repeat(40));
      for (const pattern of insights.successPatterns) {
        lines.push(`  ${pattern.pattern}: ${(pattern.successRate * 100).toFixed(0)}% success (n=${pattern.sampleSize})`);
      }
    }

    // By Executor
    const executors = Object.entries(insights.byExecutor);
    if (executors.length > 0) {
      lines.push('\n' + '─'.repeat(40));
      lines.push('BY EXECUTOR');
      lines.push('─'.repeat(40));
      for (const [executor, stats] of executors) {
        lines.push(`  ${executor}: ${stats.executions} executions, ${(stats.successRate * 100).toFixed(0)}% success`);
      }
    }

    // Recommendations
    if (insights.recommendations.length > 0) {
      lines.push('\n' + '─'.repeat(40));
      lines.push('RECOMMENDATIONS');
      lines.push('─'.repeat(40));
      for (const rec of insights.recommendations) {
        const icon = rec.priority === 'high' ? '!' : rec.priority === 'medium' ? '→' : '○';
        lines.push(`\n[${icon}] ${rec.category.toUpperCase()}: ${rec.recommendation}`);
        lines.push(`    Evidence: ${rec.evidence}`);
      }
    }

    lines.push('\n' + '═'.repeat(60));

    return lines.join('\n');
  }
}

// Factory function
export function createInsightGenerator(instanceId: string): InsightGenerator {
  return new InsightGenerator(instanceId);
}
