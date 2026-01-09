/**
 * Learning Retriever
 *
 * The mechanism that makes instances compound their learning.
 *
 * Key insight from i[4]: The prototype STORES to Mandrel but never RETRIEVES.
 * This module closes the loop by querying Mandrel during preparation to find:
 * - Previous attempts at similar tasks
 * - Related decisions made in this project
 * - Patterns that worked or failed
 * - Files frequently modified together
 *
 * Without this, every preparation starts from zero. With it, preparations
 * are informed by accumulated wisdom.
 */

import { HistoricalContext } from './types.js';
import { mandrel } from './mandrel.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// ============================================================================
// Learning Retriever
// ============================================================================

export class LearningRetriever {
  private instanceId: string;
  private projectPath: string | null = null;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  /**
   * Check if a file exists within the current project.
   * Used to filter out cross-project contamination.
   * (Added by i[5] to fix contamination bug)
   */
  private async fileExistsInProject(filePath: string): Promise<boolean> {
    if (!this.projectPath) return false;

    // Handle both absolute and relative paths
    const absolutePath = path.isAbsolute(filePath)
      ? filePath
      : path.join(this.projectPath, filePath);

    // Verify path is within project
    if (!absolutePath.startsWith(this.projectPath)) {
      return false;
    }

    try {
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Filter file paths to only include files that exist in the project.
   * (Added by i[5] to fix contamination bug)
   */
  private async filterExistingFiles(files: string[]): Promise<string[]> {
    const results = await Promise.all(
      files.map(async (f) => ({
        path: f,
        exists: await this.fileExistsInProject(f),
      }))
    );
    return results.filter(r => r.exists).map(r => r.path);
  }

  /**
   * Retrieve historical context relevant to a task description.
   *
   * This is the core learning function. It queries Mandrel to find
   * context that can inform preparation.
   *
   * Updated by i[5]: Now stores projectPath and filters results
   * to prevent cross-project contamination.
   */
  async retrieve(
    taskDescription: string,
    projectPath: string
  ): Promise<HistoricalContext> {
    // Store project path for file validation (i[5] fix)
    this.projectPath = projectPath;

    console.log(`[LearningRetriever] Searching for relevant history: "${taskDescription.substring(0, 50)}..."`);
    console.log(`[LearningRetriever] Project path set to: ${projectPath} (i[5] contamination fix)`);

    const [
      previousAttempts,
      relatedDecisions,
      patternHistory,
      coModificationPatterns,
    ] = await Promise.all([
      this.findPreviousAttempts(taskDescription),
      this.findRelatedDecisions(taskDescription),
      this.findPatternHistory(projectPath),
      this.findCoModificationPatterns(projectPath),
    ]);

    // Post-process: Filter previousAttempts to only include files that exist (i[5])
    const filteredAttempts = await Promise.all(
      previousAttempts.map(async (attempt) => ({
        ...attempt,
        keyFiles: await this.filterExistingFiles(attempt.keyFiles),
      }))
    );

    // Post-process: Filter coModificationPatterns to only include existing files (i[5])
    const filteredCoMod = await Promise.all(
      coModificationPatterns.map(async (pattern) => ({
        ...pattern,
        files: await this.filterExistingFiles(pattern.files),
      }))
    );

    // Remove entries with no files after filtering
    const cleanedAttempts = filteredAttempts.filter(a => a.keyFiles.length > 0);
    const cleanedCoMod = filteredCoMod.filter(p => p.files.length > 0);

    const context: HistoricalContext = {
      previousAttempts: cleanedAttempts,
      relatedDecisions,
      patternHistory,
      coModificationPatterns: cleanedCoMod,
    };

    const totalItems = cleanedAttempts.length + relatedDecisions.length +
      patternHistory.length + cleanedCoMod.length;
    console.log(`[LearningRetriever] Found ${totalItems} historical context items (after contamination filter)`);

    return context;
  }

  /**
   * Find previous attempts at similar tasks.
   *
   * Uses Mandrel's smart_search to find semantically similar tasks.
   * Parses the response to extract structured information.
   */
  private async findPreviousAttempts(
    taskDescription: string
  ): Promise<HistoricalContext['previousAttempts']> {
    try {
      // Extract key terms for search
      const keywords = this.extractKeyTerms(taskDescription);
      const searchQuery = `task ${keywords.join(' ')}`;

      const response = await mandrel.smartSearch(searchQuery);
      if (!response) return [];

      // Parse response to extract previous attempts
      const attempts = this.parsePreviousAttempts(response, taskDescription);
      console.log(`[LearningRetriever] Found ${attempts.length} previous attempts`);
      return attempts;
    } catch (error) {
      console.warn('[LearningRetriever] Error finding previous attempts:', error);
      return [];
    }
  }

  /**
   * Find related technical decisions.
   *
   * Searches Mandrel for decisions that might be relevant to this task.
   *
   * Updated by i[5]: Now uses smartSearch (project-scoped) instead of
   * searchContext (global) to prevent cross-project contamination.
   */
  private async findRelatedDecisions(
    taskDescription: string
  ): Promise<HistoricalContext['relatedDecisions']> {
    try {
      const keywords = this.extractKeyTerms(taskDescription);
      const searchQuery = `decision ${keywords.slice(0, 3).join(' ')}`;

      // i[5]: Use smartSearch instead of searchContext
      // smartSearch is project-scoped, searchContext is global
      const response = await mandrel.smartSearch(searchQuery);
      if (!response) return [];

      // Parse response to extract decisions
      const decisions = this.parseDecisions(response);
      console.log(`[LearningRetriever] Found ${decisions.length} related decisions (via smart_search)`);
      return decisions;
    } catch (error) {
      console.warn('[LearningRetriever] Error finding decisions:', error);
      return [];
    }
  }

  /**
   * Find pattern history from previous executions.
   *
   * Looks for patterns that were followed or violated in past work.
   *
   * Updated by i[5]: Now uses smartSearch (project-scoped) instead of
   * searchContext (global) to prevent cross-project contamination.
   */
  private async findPatternHistory(
    projectPath: string
  ): Promise<HistoricalContext['patternHistory']> {
    try {
      // Search for pattern-related contexts
      const projectName = projectPath.split('/').pop() || 'unknown';
      // i[5]: Use smartSearch instead of searchContext
      const response = await mandrel.smartSearch(`pattern ${projectName}`);
      if (!response) return [];

      // Parse response to extract patterns
      const patterns = this.parsePatterns(response);
      console.log(`[LearningRetriever] Found ${patterns.length} pattern history items (via smart_search)`);
      return patterns;
    } catch (error) {
      console.warn('[LearningRetriever] Error finding pattern history:', error);
      return [];
    }
  }

  /**
   * Find files that are frequently modified together.
   *
   * This helps identify related files that should be considered together.
   *
   * Updated by i[5]: Now uses smartSearch (project-scoped) instead of
   * searchContext (global) to prevent cross-project contamination.
   * Also filters results to only include files that exist in project.
   */
  private async findCoModificationPatterns(
    projectPath: string
  ): Promise<HistoricalContext['coModificationPatterns']> {
    try {
      // Search for execution feedback that mentions file modifications
      const projectName = projectPath.split('/').pop() || 'unknown';
      // i[5]: Use smartSearch instead of searchContext
      const response = await mandrel.smartSearch(`files modified ${projectName}`);
      if (!response) return [];

      // Parse response to extract co-modification patterns
      const patterns = this.parseCoModifications(response);
      console.log(`[LearningRetriever] Found ${patterns.length} co-modification patterns (via smart_search, before file filter)`);
      return patterns;
    } catch (error) {
      console.warn('[LearningRetriever] Error finding co-modification patterns:', error);
      return [];
    }
  }

  /**
   * Extract key terms from task description for search.
   */
  private extractKeyTerms(description: string): string[] {
    const stopWords = new Set([
      'a', 'an', 'the', 'to', 'and', 'or', 'but', 'in', 'on', 'at', 'for',
      'is', 'are', 'was', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'must',
      'i', 'me', 'my', 'we', 'our', 'you', 'your', 'it', 'its',
      'this', 'that', 'these', 'those', 'please', 'want', 'need',
    ]);

    return description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopWords.has(w))
      .slice(0, 5);
  }

  /**
   * Parse Mandrel response to extract previous attempts.
   */
  private parsePreviousAttempts(
    response: string,
    currentTask: string
  ): HistoricalContext['previousAttempts'] {
    const attempts: HistoricalContext['previousAttempts'] = [];

    // Look for completion or handoff contexts that describe tasks
    const lines = response.split('\n');
    let currentAttempt: {
      taskDescription?: string;
      outcome?: 'success' | 'partial' | 'failed';
      keyFiles: string[];
      lesson?: string;
    } | null = null;

    for (const line of lines) {
      // Look for task descriptions
      if (line.includes('Task:') || line.includes('task:')) {
        if (currentAttempt?.taskDescription && currentAttempt?.lesson) {
          attempts.push({
            taskDescription: currentAttempt.taskDescription,
            outcome: currentAttempt.outcome || 'success',
            keyFiles: currentAttempt.keyFiles,
            lesson: currentAttempt.lesson,
            relevanceScore: this.calculateRelevance(currentAttempt.taskDescription, currentTask),
          });
        }
        currentAttempt = { keyFiles: [] };
        currentAttempt.taskDescription = line.replace(/.*Task:?\s*/i, '').trim();
      }

      // Look for outcome indicators
      if (line.toLowerCase().includes('success')) {
        if (currentAttempt) currentAttempt.outcome = 'success';
      } else if (line.toLowerCase().includes('failed') || line.toLowerCase().includes('error')) {
        if (currentAttempt) currentAttempt.outcome = 'failed';
      } else if (line.toLowerCase().includes('partial')) {
        if (currentAttempt) currentAttempt.outcome = 'partial';
      }

      // Look for file paths
      const fileMatch = line.match(/([\/\w-]+\.(ts|js|tsx|jsx|md))/);
      if (fileMatch && currentAttempt) {
        currentAttempt.keyFiles.push(fileMatch[1]);
      }

      // Look for lessons or insights
      if (line.includes('lesson') || line.includes('insight') || line.includes('learned')) {
        if (currentAttempt) {
          currentAttempt.lesson = line.replace(/.*lesson:?\s*/i, '').trim();
        }
      }
    }

    // Add last attempt if valid
    if (currentAttempt?.taskDescription && currentAttempt?.lesson) {
      attempts.push({
        taskDescription: currentAttempt.taskDescription,
        outcome: currentAttempt.outcome || 'success',
        keyFiles: currentAttempt.keyFiles,
        lesson: currentAttempt.lesson,
        relevanceScore: this.calculateRelevance(currentAttempt.taskDescription, currentTask),
      });
    }

    // Sort by relevance and limit
    return attempts
      .sort((a, b) => b.relevanceScore - a.relevanceScore)
      .slice(0, 5);
  }

  /**
   * Parse Mandrel response to extract decisions.
   */
  private parseDecisions(response: string): HistoricalContext['relatedDecisions'] {
    const decisions: HistoricalContext['relatedDecisions'] = [];

    // Look for decision patterns in the response
    const decisionBlocks = response.split(/(?=\*\*decision\*\*|Decision:|DECISION:)/i);

    for (const block of decisionBlocks) {
      if (block.length < 20) continue;

      const titleMatch = block.match(/(?:title|decision)[:\s]+([^\n]+)/i);
      const rationaleMatch = block.match(/(?:rationale|reason|because)[:\s]+([^\n]+)/i);

      if (titleMatch) {
        decisions.push({
          title: titleMatch[1].trim().substring(0, 100),
          decision: block.substring(0, 200).trim(),
          rationale: rationaleMatch?.[1]?.trim() || 'No rationale captured',
          tags: this.extractKeyTerms(block).slice(0, 3),
        });
      }
    }

    return decisions.slice(0, 5);
  }

  /**
   * Parse Mandrel response to extract pattern history.
   */
  private parsePatterns(response: string): HistoricalContext['patternHistory'] {
    const patterns: HistoricalContext['patternHistory'] = [];

    // Look for pattern mentions
    const patternMatches = response.matchAll(/pattern[:\s]+([^\n]+)/gi);
    for (const match of patternMatches) {
      patterns.push({
        pattern: match[1].trim().substring(0, 100),
        successRate: 0.8, // Default - would be calculated from feedback
        lastUsed: new Date(),
        context: response.substring(0, 100),
      });
    }

    // Also look for convention mentions
    const conventionMatches = response.matchAll(/(?:naming|convention|style)[:\s]+([^\n]+)/gi);
    for (const match of conventionMatches) {
      patterns.push({
        pattern: match[1].trim().substring(0, 100),
        successRate: 0.9,
        lastUsed: new Date(),
        context: 'Coding convention',
      });
    }

    return patterns.slice(0, 5);
  }

  /**
   * Parse Mandrel response to extract co-modification patterns.
   */
  private parseCoModifications(response: string): HistoricalContext['coModificationPatterns'] {
    const patterns: HistoricalContext['coModificationPatterns'] = [];

    // Look for groups of files mentioned together
    const fileMatches = [...response.matchAll(/([\/\w-]+\.(ts|js|tsx|jsx))/g)];
    if (fileMatches.length >= 2) {
      // Group files from same response as co-modified
      const files = fileMatches.map(m => m[1]).slice(0, 5);
      patterns.push({
        files,
        frequency: 1,
        typicalTask: 'Related files from historical context',
      });
    }

    return patterns;
  }

  /**
   * Calculate relevance score between two task descriptions.
   *
   * Simple term overlap for now. Would use embeddings in production.
   */
  private calculateRelevance(task1: string, task2: string): number {
    const terms1 = new Set(this.extractKeyTerms(task1));
    const terms2 = new Set(this.extractKeyTerms(task2));

    if (terms1.size === 0 || terms2.size === 0) return 0;

    let overlap = 0;
    for (const term of terms1) {
      if (terms2.has(term)) overlap++;
    }

    return overlap / Math.max(terms1.size, terms2.size);
  }
}

// ============================================================================
// Feedback Recorder
// ============================================================================

/**
 * Records execution feedback to Mandrel.
 *
 * This is the other half of the learning loop:
 * - LearningRetriever queries historical context
 * - FeedbackRecorder stores new execution results
 */
export class FeedbackRecorder {
  private instanceId: string;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  /**
   * Record execution feedback to Mandrel.
   *
   * Call this after executing a task to store the results
   * for future preparations to learn from.
   */
  async recordFeedback(params: {
    taskId: string;
    contextPackageId: string;
    success: boolean;
    filesModified: string[];
    filesRead: string[];
    predictedMustRead: string[];
    testsPassed?: boolean;
    compilationPassed: boolean;
    learnings: string[];
  }): Promise<{ success: boolean; id?: string }> {
    // Calculate accuracy delta
    const predictedSet = new Set(params.predictedMustRead);
    const actualSet = new Set(params.filesRead);

    const missed = params.filesRead.filter(f => !predictedSet.has(f));
    const unnecessary = params.predictedMustRead.filter(f => !actualSet.has(f));

    const feedback = {
      taskId: params.taskId,
      contextPackageId: params.contextPackageId,
      executedBy: this.instanceId,
      outcome: {
        success: params.success,
        filesActuallyModified: params.filesModified,
        filesActuallyRead: params.filesRead,
        compilationPassed: params.compilationPassed,
        testsPassed: params.testsPassed,
      },
      accuracy: {
        mustReadAccuracy: {
          predicted: params.predictedMustRead,
          actual: params.filesRead,
          missed,
          unnecessary,
        },
        patternsFollowed: [],
        patternsViolated: [],
      },
      learnings: params.learnings.map(l => ({
        type: 'insight' as const,
        content: l,
        tags: this.extractTags(l),
      })),
    };

    // Store to Mandrel as completion context
    const result = await mandrel.storeContext(
      `ExecutionFeedback for task ${params.taskId}:\n` +
      `Success: ${params.success}\n` +
      `Files modified: ${params.filesModified.join(', ')}\n` +
      `Accuracy: ${missed.length} files missed, ${unnecessary.length} unnecessary\n` +
      `Learnings:\n${params.learnings.map(l => `  - ${l}`).join('\n')}\n` +
      `\nFull feedback:\n${JSON.stringify(feedback, null, 2)}`,
      'completion',
      ['execution-feedback', params.success ? 'success' : 'failed', this.instanceId]
    );

    if (result.success) {
      console.log(`[FeedbackRecorder] Recorded feedback for task ${params.taskId}`);
    }

    return result;
  }

  private extractTags(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 3)
      .slice(0, 3);
  }
}

// Factory functions
export function createLearningRetriever(instanceId: string): LearningRetriever {
  return new LearningRetriever(instanceId);
}

export function createFeedbackRecorder(instanceId: string): FeedbackRecorder {
  return new FeedbackRecorder(instanceId);
}
