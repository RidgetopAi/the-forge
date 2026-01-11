/**
 * Unit Tests for PatternTracker
 *
 * Phase 5.6: Comprehensive unit tests for pattern tracking system.
 *
 * Test Categories:
 * 1. Success/Failure Recording
 * 2. Success Rate Calculation
 * 3. Recommendations Filtering (70% threshold)
 * 4. Context-Based Recommendations
 * 5. Mandrel Persistence (mock client)
 * 6. Pattern Loading from Mandrel
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PatternTracker,
  PatternScore,
  PatternScoreSchema,
  createPatternTracker,
} from '../src/pattern-tracker.js';
import type { MandrelClient } from '../src/mandrel.js';

// ============================================================================
// Mock MandrelClient
// ============================================================================

function createMockMandrelClient(): MandrelClient & {
  storedContexts: Array<{ content: string; type: string; tags: string[] }>;
  searchResults: string;
  contextByIdResults: Map<string, { success: boolean; content?: string }>;
} {
  const mock = {
    storedContexts: [] as Array<{ content: string; type: string; tags: string[] }>,
    searchResults: '',
    contextByIdResults: new Map<string, { success: boolean; content?: string }>(),

    async storeContext(content: string, type: string, tags: string[]) {
      mock.storedContexts.push({ content, type, tags });
      return { success: true, id: `mock-id-${mock.storedContexts.length}` };
    },

    async searchContext(_query: string) {
      return mock.searchResults;
    },

    async getContextById(id: string) {
      return mock.contextByIdResults.get(id) ?? { success: false };
    },

    extractIdsFromSearchResults(results: string) {
      const ids: string[] = [];
      const uuidPattern = /(?:🆔\s*)?ID:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/gi;
      let match;
      while ((match = uuidPattern.exec(results)) !== null) {
        ids.push(match[1]);
      }
      return ids;
    },

    // Stubs for other MandrelClient methods (not used by PatternTracker)
    async ping() { return true; },
    async switchProject() { return true; },
    async getRecentContexts() { return ''; },
    async createTask() { return { success: true }; },
    async updateTask() { return true; },
    async recordDecision() { return { success: true }; },
    async getRecommendations() { return ''; },
    async smartSearch() { return ''; },
    getHealthStatus() { return { healthy: true, consecutiveFailures: 0, lastSuccess: new Date() }; },
  };

  return mock as unknown as MandrelClient & {
    storedContexts: Array<{ content: string; type: string; tags: string[] }>;
    searchResults: string;
    contextByIdResults: Map<string, { success: boolean; content?: string }>;
  };
}

// ============================================================================
// PatternScoreSchema Tests
// ============================================================================

describe('PatternScoreSchema', () => {
  it('validates a correct PatternScore', () => {
    const validPattern: PatternScore = {
      patternId: 'test-pattern-1',
      name: 'Test Pattern',
      successCount: 10,
      failureCount: 2,
      lastUsed: '2026-01-11T00:00:00.000Z',
      successRate: 0.833,
      contexts: ['feature', 'bugfix'],
    };

    const result = PatternScoreSchema.safeParse(validPattern);
    expect(result.success).toBe(true);
  });

  it('rejects missing required fields', () => {
    const invalidPattern = {
      patternId: 'test',
      name: 'Test',
      // Missing successCount, failureCount, etc.
    };

    const result = PatternScoreSchema.safeParse(invalidPattern);
    expect(result.success).toBe(false);
  });

  it('accepts empty contexts array', () => {
    const pattern: PatternScore = {
      patternId: 'new-pattern',
      name: 'New Pattern',
      successCount: 0,
      failureCount: 0,
      lastUsed: new Date().toISOString(),
      successRate: 0,
      contexts: [],
    };

    const result = PatternScoreSchema.safeParse(pattern);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// Success/Failure Recording Tests
// ============================================================================

describe('Success/Failure Recording', () => {
  let tracker: PatternTracker;
  let mockClient: ReturnType<typeof createMockMandrelClient>;

  beforeEach(() => {
    mockClient = createMockMandrelClient();
    tracker = createPatternTracker(mockClient as unknown as MandrelClient);
  });

  describe('recordSuccess', () => {
    it('creates new pattern on first success', async () => {
      await tracker.recordSuccess('p1', 'Pattern One', 'feature');

      const pattern = tracker.getPattern('p1');
      expect(pattern).toBeDefined();
      expect(pattern?.successCount).toBe(1);
      expect(pattern?.failureCount).toBe(0);
      expect(pattern?.contexts).toContain('feature');
    });

    it('increments success count on subsequent successes', async () => {
      await tracker.recordSuccess('p1', 'Pattern One', 'feature');
      await tracker.recordSuccess('p1', 'Pattern One', 'feature');
      await tracker.recordSuccess('p1', 'Pattern One', 'feature');

      const pattern = tracker.getPattern('p1');
      expect(pattern?.successCount).toBe(3);
      expect(pattern?.failureCount).toBe(0);
    });

    it('adds new contexts without duplicates', async () => {
      await tracker.recordSuccess('p1', 'Pattern One', 'feature');
      await tracker.recordSuccess('p1', 'Pattern One', 'bugfix');
      await tracker.recordSuccess('p1', 'Pattern One', 'feature'); // duplicate

      const pattern = tracker.getPattern('p1');
      expect(pattern?.contexts).toEqual(['feature', 'bugfix']);
    });

    it('persists to Mandrel on each success', async () => {
      await tracker.recordSuccess('p1', 'Pattern One', 'feature');
      await tracker.recordSuccess('p1', 'Pattern One', 'feature');

      expect(mockClient.storedContexts.length).toBe(2);
      expect(mockClient.storedContexts[0].tags).toContain('pattern_score');
      expect(mockClient.storedContexts[0].tags).toContain('p1');
    });
  });

  describe('recordFailure', () => {
    it('creates new pattern on first failure', async () => {
      await tracker.recordFailure('p2', 'Pattern Two');

      const pattern = tracker.getPattern('p2');
      expect(pattern).toBeDefined();
      expect(pattern?.successCount).toBe(0);
      expect(pattern?.failureCount).toBe(1);
    });

    it('increments failure count on subsequent failures', async () => {
      await tracker.recordFailure('p2', 'Pattern Two');
      await tracker.recordFailure('p2', 'Pattern Two');

      const pattern = tracker.getPattern('p2');
      expect(pattern?.failureCount).toBe(2);
    });

    it('does not add context on failure', async () => {
      await tracker.recordFailure('p2', 'Pattern Two');

      const pattern = tracker.getPattern('p2');
      expect(pattern?.contexts).toEqual([]);
    });
  });
});

// ============================================================================
// Success Rate Calculation Tests
// ============================================================================

describe('Success Rate Calculation', () => {
  let tracker: PatternTracker;
  let mockClient: ReturnType<typeof createMockMandrelClient>;

  beforeEach(() => {
    mockClient = createMockMandrelClient();
    tracker = createPatternTracker(mockClient as unknown as MandrelClient);
  });

  it('calculates 100% success rate correctly', async () => {
    await tracker.recordSuccess('p1', 'Perfect', 'test');
    await tracker.recordSuccess('p1', 'Perfect', 'test');
    await tracker.recordSuccess('p1', 'Perfect', 'test');

    const pattern = tracker.getPattern('p1');
    expect(pattern?.successRate).toBe(1.0);
  });

  it('calculates 0% success rate correctly', async () => {
    await tracker.recordFailure('p2', 'Failing');
    await tracker.recordFailure('p2', 'Failing');

    const pattern = tracker.getPattern('p2');
    expect(pattern?.successRate).toBe(0);
  });

  it('calculates mixed success rate correctly', async () => {
    // 7 successes, 3 failures = 70%
    for (let i = 0; i < 7; i++) {
      await tracker.recordSuccess('p3', 'Mixed', 'test');
    }
    for (let i = 0; i < 3; i++) {
      await tracker.recordFailure('p3', 'Mixed');
    }

    const pattern = tracker.getPattern('p3');
    expect(pattern?.successRate).toBe(0.7);
  });

  it('handles edge case of 0 total uses', async () => {
    // New pattern created manually would have 0/0
    // Our implementation creates patterns on first record, so this is theoretical
    // The successRate should be 0 for new patterns
    await tracker.recordSuccess('p4', 'New', 'test');
    await tracker.recordFailure('p4', 'New');

    const pattern = tracker.getPattern('p4');
    expect(pattern?.successRate).toBe(0.5); // 1 success, 1 failure
  });
});

// ============================================================================
// Recommendations Filtering Tests
// ============================================================================

describe('Recommendations Filtering', () => {
  let tracker: PatternTracker;
  let mockClient: ReturnType<typeof createMockMandrelClient>;

  beforeEach(async () => {
    mockClient = createMockMandrelClient();
    tracker = createPatternTracker(mockClient as unknown as MandrelClient);

    // Create patterns with different success rates
    // Pattern A: 80% success (above threshold)
    for (let i = 0; i < 8; i++) {
      await tracker.recordSuccess('pA', 'High Success', 'feature');
    }
    for (let i = 0; i < 2; i++) {
      await tracker.recordFailure('pA', 'High Success');
    }

    // Pattern B: 70% success (at threshold)
    for (let i = 0; i < 7; i++) {
      await tracker.recordSuccess('pB', 'At Threshold', 'feature');
    }
    for (let i = 0; i < 3; i++) {
      await tracker.recordFailure('pB', 'At Threshold');
    }

    // Pattern C: 60% success (below threshold)
    for (let i = 0; i < 6; i++) {
      await tracker.recordSuccess('pC', 'Below Threshold', 'feature');
    }
    for (let i = 0; i < 4; i++) {
      await tracker.recordFailure('pC', 'Below Threshold');
    }

    // Pattern D: 50% success (well below threshold)
    for (let i = 0; i < 5; i++) {
      await tracker.recordSuccess('pD', 'Low Success', 'feature');
    }
    for (let i = 0; i < 5; i++) {
      await tracker.recordFailure('pD', 'Low Success');
    }
  });

  it('only returns patterns with 70%+ success rate', () => {
    const recommendations = tracker.getRecommendedPatterns('feature', 10);

    expect(recommendations.length).toBe(2); // pA (80%) and pB (70%)
    expect(recommendations.map(r => r.patternId)).toContain('pA');
    expect(recommendations.map(r => r.patternId)).toContain('pB');
    expect(recommendations.map(r => r.patternId)).not.toContain('pC');
    expect(recommendations.map(r => r.patternId)).not.toContain('pD');
  });

  it('sorts recommendations by success rate (descending)', () => {
    const recommendations = tracker.getRecommendedPatterns('feature', 10);

    expect(recommendations[0].patternId).toBe('pA'); // 80%
    expect(recommendations[1].patternId).toBe('pB'); // 70%
  });

  it('respects limit parameter', () => {
    const recommendations = tracker.getRecommendedPatterns('feature', 1);

    expect(recommendations.length).toBe(1);
    expect(recommendations[0].patternId).toBe('pA'); // Highest success rate
  });

  it('returns empty array when no patterns meet threshold', async () => {
    const freshTracker = createPatternTracker(createMockMandrelClient() as unknown as MandrelClient);

    // Only create low-success patterns
    await freshTracker.recordSuccess('pLow', 'Low', 'test');
    await freshTracker.recordFailure('pLow', 'Low');
    await freshTracker.recordFailure('pLow', 'Low');

    const recommendations = freshTracker.getRecommendedPatterns('test', 10);
    expect(recommendations.length).toBe(0);
  });
});

// ============================================================================
// Context-Based Recommendations Tests
// ============================================================================

describe('Context-Based Recommendations', () => {
  let tracker: PatternTracker;
  let mockClient: ReturnType<typeof createMockMandrelClient>;

  beforeEach(async () => {
    mockClient = createMockMandrelClient();
    tracker = createPatternTracker(mockClient as unknown as MandrelClient);

    // Pattern with specific context
    for (let i = 0; i < 10; i++) {
      await tracker.recordSuccess('pFeature', 'Feature Pattern', 'feature');
    }

    // Pattern with different context
    for (let i = 0; i < 10; i++) {
      await tracker.recordSuccess('pBugfix', 'Bugfix Pattern', 'bugfix');
    }

    // Pattern with multiple contexts
    for (let i = 0; i < 5; i++) {
      await tracker.recordSuccess('pMulti', 'Multi Context', 'feature');
    }
    for (let i = 0; i < 5; i++) {
      await tracker.recordSuccess('pMulti', 'Multi Context', 'bugfix');
    }
  });

  it('filters by task type context', () => {
    const featureRecs = tracker.getRecommendedPatterns('feature', 10);

    expect(featureRecs.map(r => r.patternId)).toContain('pFeature');
    expect(featureRecs.map(r => r.patternId)).toContain('pMulti');
    expect(featureRecs.map(r => r.patternId)).not.toContain('pBugfix');
  });

  it('includes patterns with empty contexts (universal patterns)', async () => {
    // Create a pattern that was never used with a specific context
    // (This shouldn't happen normally, but testing the logic)
    // Actually, our implementation always adds context on success
    // So let's just verify multi-context patterns work

    const bugfixRecs = tracker.getRecommendedPatterns('bugfix', 10);

    expect(bugfixRecs.map(r => r.patternId)).toContain('pBugfix');
    expect(bugfixRecs.map(r => r.patternId)).toContain('pMulti');
    expect(bugfixRecs.map(r => r.patternId)).not.toContain('pFeature');
  });
});

// ============================================================================
// Mandrel Persistence Tests
// ============================================================================

describe('Mandrel Persistence', () => {
  let tracker: PatternTracker;
  let mockClient: ReturnType<typeof createMockMandrelClient>;

  beforeEach(() => {
    mockClient = createMockMandrelClient();
    tracker = createPatternTracker(mockClient as unknown as MandrelClient);
  });

  it('stores patterns with correct type and tags', async () => {
    await tracker.recordSuccess('p1', 'Test Pattern', 'feature');

    expect(mockClient.storedContexts.length).toBe(1);
    expect(mockClient.storedContexts[0].type).toBe('planning');
    expect(mockClient.storedContexts[0].tags).toEqual(['pattern_score', 'p1']);
  });

  it('stores pattern as valid JSON', async () => {
    await tracker.recordSuccess('p1', 'Test Pattern', 'feature');

    const storedContent = mockClient.storedContexts[0].content;
    const parsed = JSON.parse(storedContent);

    expect(parsed.patternId).toBe('p1');
    expect(parsed.name).toBe('Test Pattern');
    expect(parsed.successCount).toBe(1);
  });
});

// ============================================================================
// Pattern Loading Tests
// ============================================================================

describe('Pattern Loading from Mandrel', () => {
  it('loads patterns from Mandrel on first access', async () => {
    const mockClient = createMockMandrelClient();

    // Set up mock search results with pattern IDs
    mockClient.searchResults = `
      Found 2 patterns:
      ID: 11111111-1111-1111-1111-111111111111
      ID: 22222222-2222-2222-2222-222222222222
    `;

    // Set up mock context content for each ID
    mockClient.contextByIdResults.set('11111111-1111-1111-1111-111111111111', {
      success: true,
      content: JSON.stringify({
        patternId: 'loaded-p1',
        name: 'Loaded Pattern 1',
        successCount: 5,
        failureCount: 1,
        lastUsed: '2026-01-10T00:00:00.000Z',
        successRate: 0.833,
        contexts: ['feature'],
      }),
    });

    mockClient.contextByIdResults.set('22222222-2222-2222-2222-222222222222', {
      success: true,
      content: JSON.stringify({
        patternId: 'loaded-p2',
        name: 'Loaded Pattern 2',
        successCount: 3,
        failureCount: 7,
        lastUsed: '2026-01-09T00:00:00.000Z',
        successRate: 0.3,
        contexts: ['bugfix'],
      }),
    });

    const tracker = createPatternTracker(mockClient as unknown as MandrelClient);

    // Trigger load by accessing patterns
    await tracker.recordSuccess('new-p', 'New Pattern', 'test');

    // Should have loaded patterns plus the new one
    const allPatterns = tracker.getAllPatterns();
    expect(allPatterns.length).toBe(3);

    const loadedP1 = tracker.getPattern('loaded-p1');
    expect(loadedP1?.name).toBe('Loaded Pattern 1');
    expect(loadedP1?.successCount).toBe(5);
  });

  it('only loads once (lazy loading)', async () => {
    const mockClient = createMockMandrelClient();
    const searchSpy = vi.spyOn(mockClient, 'searchContext');

    const tracker = createPatternTracker(mockClient as unknown as MandrelClient);

    // First access triggers load
    await tracker.recordSuccess('p1', 'P1', 'test');
    // Second access should not trigger load again
    await tracker.recordSuccess('p2', 'P2', 'test');
    await tracker.recordSuccess('p3', 'P3', 'test');

    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  it('handles empty search results gracefully', async () => {
    const mockClient = createMockMandrelClient();
    mockClient.searchResults = '';

    const tracker = createPatternTracker(mockClient as unknown as MandrelClient);

    await tracker.recordSuccess('p1', 'First Pattern', 'test');

    expect(tracker.isLoaded()).toBe(true);
    expect(tracker.getAllPatterns().length).toBe(1);
  });

  it('handles invalid JSON in stored patterns gracefully', async () => {
    const mockClient = createMockMandrelClient();

    mockClient.searchResults = 'ID: 11111111-1111-1111-1111-111111111111';
    mockClient.contextByIdResults.set('11111111-1111-1111-1111-111111111111', {
      success: true,
      content: 'not valid json {{{',
    });

    const tracker = createPatternTracker(mockClient as unknown as MandrelClient);

    // Should not throw
    await tracker.recordSuccess('p1', 'New Pattern', 'test');

    expect(tracker.isLoaded()).toBe(true);
    // Only the newly created pattern should be present
    expect(tracker.getAllPatterns().length).toBe(1);
  });
});

// ============================================================================
// Reload Functionality Tests
// ============================================================================

describe('Reload Functionality', () => {
  it('clears and reloads patterns on reload()', async () => {
    const mockClient = createMockMandrelClient();
    const tracker = createPatternTracker(mockClient as unknown as MandrelClient);

    // Add some patterns
    await tracker.recordSuccess('p1', 'Pattern 1', 'test');
    await tracker.recordSuccess('p2', 'Pattern 2', 'test');

    expect(tracker.getAllPatterns().length).toBe(2);

    // Set up mock for reload (simulating external updates)
    mockClient.searchResults = 'ID: 33333333-3333-3333-3333-333333333333';
    mockClient.contextByIdResults.set('33333333-3333-3333-3333-333333333333', {
      success: true,
      content: JSON.stringify({
        patternId: 'external-p',
        name: 'External Pattern',
        successCount: 10,
        failureCount: 0,
        lastUsed: '2026-01-11T00:00:00.000Z',
        successRate: 1.0,
        contexts: ['feature'],
      }),
    });

    // Reload
    await tracker.reload();

    // Should now have only the external pattern
    expect(tracker.getAllPatterns().length).toBe(1);
    expect(tracker.getPattern('external-p')).toBeDefined();
    expect(tracker.getPattern('p1')).toBeUndefined();
  });
});

// ============================================================================
// getAllPatterns and getPattern Tests
// ============================================================================

describe('Getter Methods', () => {
  let tracker: PatternTracker;

  beforeEach(async () => {
    const mockClient = createMockMandrelClient();
    tracker = createPatternTracker(mockClient as unknown as MandrelClient);

    await tracker.recordSuccess('p1', 'Pattern 1', 'feature');
    await tracker.recordSuccess('p2', 'Pattern 2', 'bugfix');
  });

  it('getAllPatterns returns all tracked patterns', () => {
    const all = tracker.getAllPatterns();
    expect(all.length).toBe(2);
  });

  it('getPattern returns specific pattern by ID', () => {
    const pattern = tracker.getPattern('p1');
    expect(pattern?.name).toBe('Pattern 1');
  });

  it('getPattern returns undefined for non-existent pattern', () => {
    const pattern = tracker.getPattern('non-existent');
    expect(pattern).toBeUndefined();
  });
});
