/**
 * Plant Manager
 *
 * The orchestrator. Smart model (Opus-tier).
 * - Receives raw requests
 * - Classifies task type and scope
 * - Routes to appropriate department
 * - Handles escalations
 * - Makes judgment calls
 *
 * DOES NOT do labor - directs it.
 */

import { ProjectType } from '../types.js';
import { taskManager } from '../state.js';
import { mandrel } from '../mandrel.js';

// ============================================================================
// Classification Keywords (heuristic approach for prototype)
// ============================================================================

const TYPE_KEYWORDS: Record<ProjectType, string[]> = {
  feature: ['add', 'create', 'implement', 'new', 'build', 'introduce', 'enable'],
  bugfix: ['fix', 'bug', 'broken', 'error', 'issue', 'wrong', 'failing', 'crash', 'doesn\'t work'],
  greenfield: ['new project', 'from scratch', 'bootstrap', 'scaffold', 'initialize', 'setup'],
  refactor: ['refactor', 'restructure', 'reorganize', 'clean up', 'migrate', 'move', 'rename'],
  research: ['research', 'investigate', 'explore', 'spike', 'prototype', 'evaluate', 'compare'],
};

const SCOPE_INDICATORS = {
  small: ['simple', 'quick', 'minor', 'small', 'tweak', 'just'],
  medium: ['add', 'implement', 'create', 'update'],
  large: ['major', 'overhaul', 'complete', 'full', 'comprehensive', 'redesign'],
};

// ============================================================================
// Plant Manager Class
// ============================================================================

export class PlantManager {
  private instanceId: string;

  constructor(instanceId: string) {
    this.instanceId = instanceId;
  }

  /**
   * Classify a raw request into project type and scope
   *
   * In production, this would use an LLM for nuanced classification.
   * For the prototype, we use keyword matching + confidence scoring.
   */
  classify(rawRequest: string): {
    projectType: ProjectType;
    scope: 'small' | 'medium' | 'large';
    department: 'preparation' | 'r_and_d';
    confidence: number;
    reasoning: string;
  } {
    const lower = rawRequest.toLowerCase();

    // Score each project type
    const typeScores: Record<ProjectType, number> = {
      feature: 0,
      bugfix: 0,
      greenfield: 0,
      refactor: 0,
      research: 0,
    };

    for (const [type, keywords] of Object.entries(TYPE_KEYWORDS)) {
      for (const keyword of keywords) {
        if (lower.includes(keyword)) {
          typeScores[type as ProjectType] += 1;
        }
      }
    }

    // Find winner
    let bestType: ProjectType = 'feature';
    let bestScore = 0;
    for (const [type, score] of Object.entries(typeScores)) {
      if (score > bestScore) {
        bestScore = score;
        bestType = type as ProjectType;
      }
    }

    // Calculate confidence (higher score = more confident)
    const totalKeywords = Object.values(TYPE_KEYWORDS).flat().length;
    const confidence = Math.min(0.3 + (bestScore * 0.2), 0.95); // 30% base, +20% per keyword, max 95%

    // Determine scope
    let scope: 'small' | 'medium' | 'large' = 'medium';
    for (const [s, indicators] of Object.entries(SCOPE_INDICATORS)) {
      if (indicators.some(i => lower.includes(i))) {
        scope = s as 'small' | 'medium' | 'large';
        break;
      }
    }

    // Route decision: research and greenfield go to R&D first
    const department = ['research', 'greenfield'].includes(bestType) ? 'r_and_d' : 'preparation';

    const reasoning = [
      `Detected type: ${bestType} (score: ${bestScore})`,
      `Matched keywords: ${TYPE_KEYWORDS[bestType].filter(k => lower.includes(k)).join(', ')}`,
      `Scope: ${scope}`,
      `Routing to: ${department}`,
      `Confidence: ${(confidence * 100).toFixed(0)}%`,
    ].join('\n');

    return { projectType: bestType, scope, department, confidence, reasoning };
  }

  /**
   * Process an incoming request
   *
   * Creates task, classifies it, transitions state, routes to department.
   */
  async intake(rawRequest: string): Promise<{
    taskId: string;
    classification: ReturnType<PlantManager['classify']>;
    needsHumanSync: boolean;
    humanSyncReason?: string;
  }> {
    // Create task
    const task = taskManager.createTask(rawRequest);
    console.log(`[PlantManager] Created task: ${task.id}`);

    // Classify
    const classification = this.classify(rawRequest);
    console.log(`[PlantManager] Classification:\n${classification.reasoning}`);

    // Set classification on task
    taskManager.setClassification(task.id, {
      projectType: classification.projectType,
      scope: classification.scope,
      department: classification.department,
      confidence: classification.confidence,
    });

    // Transition to classified state
    const transition = taskManager.transitionState(
      task.id,
      'classified',
      this.instanceId,
      `Classified as ${classification.projectType} (${classification.scope})`
    );

    if (!transition.success) {
      console.error(`[PlantManager] Transition failed: ${transition.error}`);
    }

    // Check if human sync needed (low confidence)
    const needsHumanSync = classification.confidence < 0.5;
    const humanSyncReason = needsHumanSync
      ? `Low classification confidence (${(classification.confidence * 100).toFixed(0)}%). Please confirm task type.`
      : undefined;

    // Store to Mandrel
    await mandrel.storeContext(
      `Task ${task.id} classified by Plant Manager:\n${classification.reasoning}`,
      'planning',
      ['plant-manager', 'classification', classification.projectType]
    );

    return {
      taskId: task.id,
      classification,
      needsHumanSync,
      humanSyncReason,
    };
  }

  /**
   * Handle escalation from a department
   */
  async handleEscalation(
    taskId: string,
    fromDepartment: string,
    reason: string,
    suggestedOptions: string[]
  ): Promise<{
    action: 'retry' | 'reroute' | 'humanSync' | 'fail';
    detail: string;
  }> {
    const task = taskManager.getTask(taskId);
    if (!task) {
      return { action: 'fail', detail: 'Task not found' };
    }

    console.log(`[PlantManager] Escalation from ${fromDepartment}: ${reason}`);

    // Set escalation info
    taskManager.setEscalation(taskId, {
      reason,
      fromDepartment,
      suggestedAction: suggestedOptions[0] ?? 'Human review required',
    });

    // Transition to blocked
    taskManager.transitionState(taskId, 'blocked', this.instanceId, reason);

    // For prototype, always escalate to human
    await mandrel.storeContext(
      `Escalation: Task ${taskId}\nFrom: ${fromDepartment}\nReason: ${reason}\nOptions: ${suggestedOptions.join(', ')}`,
      'error',
      ['escalation', 'human-sync-needed']
    );

    return {
      action: 'humanSync',
      detail: `Task blocked. Reason: ${reason}. Options: ${suggestedOptions.join(', ')}`,
    };
  }

  /**
   * Resume a blocked task after human intervention
   */
  async resumeTask(
    taskId: string,
    humanDecision: string,
    resumeToState: 'intake' | 'classified' | 'preparing'
  ): Promise<boolean> {
    const task = taskManager.getTask(taskId);
    if (!task || task.state !== 'blocked') {
      return false;
    }

    const transition = taskManager.transitionState(
      taskId,
      resumeToState,
      this.instanceId,
      `Human decision: ${humanDecision}`
    );

    if (transition.success) {
      await mandrel.storeContext(
        `Task ${taskId} resumed by human decision: ${humanDecision}`,
        'decision',
        ['human-sync', 'resumed']
      );
    }

    return transition.success;
  }
}

// Factory function
export function createPlantManager(instanceId: string): PlantManager {
  return new PlantManager(instanceId);
}
