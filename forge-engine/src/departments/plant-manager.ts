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
 *
 * i[7] update: Now uses LLM intelligence for classification when available.
 * This breaks the "intelligence deferral pattern" that persisted for 5 passes.
 */

import { ProjectType } from '../types.js';
import { taskManager } from '../state.js';
import { mandrel } from '../mandrel.js';
import { llmClient, type ClassificationResult } from '../llm.js';

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
   * i[7] update: Now uses LLM intelligence when available.
   * Falls back to heuristics when API key not configured.
   *
   * This function was the subject of the "intelligence deferral pattern" -
   * 5 consecutive passes recommended LLM classification but deferred it.
   * That pattern ends here.
   */
  async classify(rawRequest: string): Promise<ClassificationResult> {
    const result = await llmClient.classify(rawRequest);

    // Log the method used
    if (result.method === 'llm') {
      console.log('[PlantManager] Using LLM classification');
    } else {
      console.log('[PlantManager] Using heuristic classification (no API key)');
    }

    return result;
  }

  /**
   * Process an incoming request
   *
   * Creates task, classifies it, transitions state, routes to department.
   */
  async intake(rawRequest: string): Promise<{
    taskId: string;
    classification: ClassificationResult;
    needsHumanSync: boolean;
    humanSyncReason?: string;
  }> {
    // Create task
    const task = taskManager.createTask(rawRequest);
    console.log(`[PlantManager] Created task: ${task.id}`);

    // Classify (now async - uses LLM when available)
    const classification = await this.classify(rawRequest);
    console.log(`[PlantManager] Classification (${classification.method}):\n${classification.reasoning}`);

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
