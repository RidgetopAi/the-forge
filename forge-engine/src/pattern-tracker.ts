/**
 * Pattern Tracker
 *
 * Tracks pattern success/failure rates for adaptive learning.
 * Enables the Forge to recommend patterns that have historically worked
 * and avoid patterns that have historically failed.
 *
 * Key behaviors:
 * - Records success/failure outcomes for patterns used in executions
 * - Calculates rolling success rates
 * - Persists pattern scores to Mandrel for cross-session learning
 * - Recommends patterns above 70% success threshold
 * - Tracks which task types each pattern works well for
 */

import { z } from 'zod';
import { MandrelClient, mandrel as defaultMandrel } from './mandrel.js';

// ============================================================================
// Pattern Score Schema
// ============================================================================

export const PatternScoreSchema = z.object({
  patternId: z.string(),
  name: z.string(),
  successCount: z.number(),
  failureCount: z.number(),
  lastUsed: z.string(),  // ISO timestamp
  successRate: z.number(),  // 0-1
  contexts: z.array(z.string()),  // task types where pattern succeeded
});

export type PatternScore = z.infer<typeof PatternScoreSchema>;

// ============================================================================
// Constants
// ============================================================================

const SUCCESS_RATE_THRESHOLD = 0.7;  // Only recommend patterns with 70%+ success
const PATTERN_SCORE_TAG = 'pattern_score';

// ============================================================================
// Pattern Tracker Class
// ============================================================================

export class PatternTracker {
  private mandrelClient: MandrelClient;
  private patternScores: Map<string, PatternScore> = new Map();
  private loaded: boolean = false;

  constructor(mandrelClient?: MandrelClient) {
    this.mandrelClient = mandrelClient ?? defaultMandrel;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /**
   * Record a successful pattern usage.
   *
   * @param patternId - Unique identifier for the pattern
   * @param patternName - Human-readable pattern name
   * @param context - Task type or context where the pattern succeeded
   */
  async recordSuccess(
    patternId: string,
    patternName: string,
    context: string
  ): Promise<void> {
    await this.ensureLoaded();

    const existing = this.patternScores.get(patternId) ?? this.createNewPattern(patternId, patternName);

    existing.successCount++;
    existing.lastUsed = new Date().toISOString();
    existing.successRate = this.calculateSuccessRate(existing.successCount, existing.failureCount);

    if (!existing.contexts.includes(context)) {
      existing.contexts.push(context);
    }

    this.patternScores.set(patternId, existing);
    await this.persistPattern(existing);

    console.log(`[PatternTracker] Recorded success for "${patternName}" (${patternId}). Rate: ${(existing.successRate * 100).toFixed(1)}%`);
  }

  /**
   * Record a failed pattern usage.
   *
   * @param patternId - Unique identifier for the pattern
   * @param patternName - Human-readable pattern name
   */
  async recordFailure(
    patternId: string,
    patternName: string
  ): Promise<void> {
    await this.ensureLoaded();

    const existing = this.patternScores.get(patternId) ?? this.createNewPattern(patternId, patternName);

    existing.failureCount++;
    existing.lastUsed = new Date().toISOString();
    existing.successRate = this.calculateSuccessRate(existing.successCount, existing.failureCount);

    this.patternScores.set(patternId, existing);
    await this.persistPattern(existing);

    console.log(`[PatternTracker] Recorded failure for "${patternName}" (${patternId}). Rate: ${(existing.successRate * 100).toFixed(1)}%`);
  }

  /**
   * Get recommended patterns for a given task type.
   *
   * Only returns patterns that:
   * 1. Have a success rate >= 70%
   * 2. Have been used in the given task type OR have no context restrictions
   *
   * @param taskType - The type of task being executed
   * @param limit - Maximum number of patterns to return
   * @returns Array of PatternScore objects, sorted by success rate (descending)
   */
  getRecommendedPatterns(taskType: string, limit: number = 5): PatternScore[] {
    return Array.from(this.patternScores.values())
      .filter(p => p.successRate >= SUCCESS_RATE_THRESHOLD)
      .filter(p => p.contexts.includes(taskType) || p.contexts.length === 0)
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, limit);
  }

  /**
   * Get all tracked patterns (for debugging/reporting).
   */
  getAllPatterns(): PatternScore[] {
    return Array.from(this.patternScores.values());
  }

  /**
   * Get a specific pattern by ID.
   */
  getPattern(patternId: string): PatternScore | undefined {
    return this.patternScores.get(patternId);
  }

  /**
   * Check if patterns have been loaded from Mandrel.
   */
  isLoaded(): boolean {
    return this.loaded;
  }

  /**
   * Force reload patterns from Mandrel.
   * Useful for testing or when external updates may have occurred.
   */
  async reload(): Promise<void> {
    this.loaded = false;
    this.patternScores.clear();
    await this.loadPatterns();
  }

  // --------------------------------------------------------------------------
  // Persistence Layer
  // --------------------------------------------------------------------------

  /**
   * Load patterns from Mandrel.
   *
   * Uses context_search to find all stored pattern_score contexts,
   * then fetches full content for each and populates the in-memory map.
   */
  async loadPatterns(): Promise<void> {
    if (this.loaded) return;

    console.log('[PatternTracker] Loading patterns from Mandrel...');

    try {
      // Search for pattern_score contexts
      const searchResults = await this.mandrelClient.searchContext(PATTERN_SCORE_TAG);

      if (!searchResults) {
        console.log('[PatternTracker] No patterns found in Mandrel.');
        this.loaded = true;
        return;
      }

      // Extract IDs from search results
      const contextIds = this.mandrelClient.extractIdsFromSearchResults(searchResults);
      console.log(`[PatternTracker] Found ${contextIds.length} pattern contexts to load.`);

      // Fetch and parse each pattern
      for (const id of contextIds) {
        const fullContext = await this.mandrelClient.getContextById(id);

        if (!fullContext.success || !fullContext.content) continue;

        const pattern = this.parsePatternFromContent(fullContext.content);
        if (pattern) {
          this.patternScores.set(pattern.patternId, pattern);
        }
      }

      console.log(`[PatternTracker] Loaded ${this.patternScores.size} patterns.`);
      this.loaded = true;
    } catch (error) {
      console.warn('[PatternTracker] Error loading patterns:', error);
      this.loaded = true;  // Mark as loaded to prevent infinite retry loops
    }
  }

  /**
   * Persist a pattern score to Mandrel.
   *
   * Stores the pattern as a planning context with tags for retrieval.
   */
  private async persistPattern(pattern: PatternScore): Promise<void> {
    try {
      const content = JSON.stringify(pattern, null, 2);

      await this.mandrelClient.storeContext(
        content,
        'planning',
        [PATTERN_SCORE_TAG, pattern.patternId]
      );

      console.log(`[PatternTracker] Persisted pattern "${pattern.name}" to Mandrel.`);
    } catch (error) {
      console.warn(`[PatternTracker] Failed to persist pattern "${pattern.name}":`, error);
    }
  }

  // --------------------------------------------------------------------------
  // Helper Methods
  // --------------------------------------------------------------------------

  /**
   * Ensure patterns are loaded before any read/write operation.
   */
  private async ensureLoaded(): Promise<void> {
    if (!this.loaded) {
      await this.loadPatterns();
    }
  }

  /**
   * Create a new pattern score with default values.
   */
  private createNewPattern(patternId: string, patternName: string): PatternScore {
    return {
      patternId,
      name: patternName,
      successCount: 0,
      failureCount: 0,
      lastUsed: new Date().toISOString(),
      successRate: 0,
      contexts: [],
    };
  }

  /**
   * Calculate success rate from counts.
   */
  private calculateSuccessRate(successCount: number, failureCount: number): number {
    const total = successCount + failureCount;
    if (total === 0) return 0;
    return successCount / total;
  }

  /**
   * Parse a PatternScore from stored content.
   *
   * Content is stored as JSON, so we parse and validate.
   */
  private parsePatternFromContent(content: string): PatternScore | null {
    try {
      // Try to extract JSON from content (may be wrapped in markdown or other text)
      const jsonMatch = content.match(/\{[\s\S]*"patternId"[\s\S]*\}/);
      if (!jsonMatch) return null;

      const parsed = JSON.parse(jsonMatch[0]);
      const validated = PatternScoreSchema.safeParse(parsed);

      if (validated.success) {
        return validated.data;
      }

      console.warn('[PatternTracker] Invalid pattern format:', validated.error);
      return null;
    } catch (error) {
      console.warn('[PatternTracker] Failed to parse pattern content:', error);
      return null;
    }
  }
}

// ============================================================================
// Singleton and Factory
// ============================================================================

let defaultTracker: PatternTracker | null = null;

/**
 * Get the default PatternTracker instance.
 * Uses the default MandrelClient.
 */
export function getPatternTracker(): PatternTracker {
  if (!defaultTracker) {
    defaultTracker = new PatternTracker();
  }
  return defaultTracker;
}

/**
 * Create a new PatternTracker with a custom MandrelClient.
 * Useful for testing with mock clients.
 */
export function createPatternTracker(mandrelClient: MandrelClient): PatternTracker {
  return new PatternTracker(mandrelClient);
}
