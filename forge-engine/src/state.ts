/**
 * Task State Machine
 *
 * Manages the lifecycle of tasks as they flow through The Forge departments.
 * Enforces valid state transitions and maintains history.
 */

import { ForgeTask, TaskState, ProjectType, ContextPackage } from './types.js';
import { mandrel } from './mandrel.js';

// ============================================================================
// Valid State Transitions
// ============================================================================

const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  intake: ['classified', 'blocked', 'failed'],
  classified: ['preparing', 'blocked', 'failed'],
  preparing: ['prepared', 'blocked', 'failed'],
  prepared: ['executing', 'blocked', 'failed'],
  executing: ['reviewing', 'preparing', 'blocked', 'failed'], // can loop back
  reviewing: ['documenting', 'executing', 'blocked', 'failed'], // can reject
  documenting: ['completed', 'blocked', 'failed'],
  completed: [], // terminal
  blocked: ['intake', 'classified', 'preparing', 'prepared', 'executing', 'reviewing', 'documenting'], // can resume
  failed: [], // terminal
};

// ============================================================================
// Task Manager
// ============================================================================

export class TaskManager {
  private tasks: Map<string, ForgeTask> = new Map();

  /**
   * Create a new task from raw request
   */
  createTask(rawRequest: string): ForgeTask {
    const now = new Date();
    const task: ForgeTask = {
      id: crypto.randomUUID(),
      state: 'intake',
      created: now,
      updated: now,
      rawRequest,
      stateHistory: [],
    };
    this.tasks.set(task.id, task);
    return task;
  }

  /**
   * Get a task by ID
   */
  getTask(id: string): ForgeTask | undefined {
    return this.tasks.get(id);
  }

  /**
   * Transition task to new state
   */
  transitionState(
    taskId: string,
    newState: TaskState,
    actor: string,
    reason?: string
  ): { success: boolean; error?: string } {
    const task = this.tasks.get(taskId);
    if (!task) {
      return { success: false, error: 'Task not found' };
    }

    const validNextStates = VALID_TRANSITIONS[task.state];
    if (!validNextStates.includes(newState)) {
      return {
        success: false,
        error: `Invalid transition: ${task.state} → ${newState}. Valid: ${validNextStates.join(', ')}`,
      };
    }

    // Record history
    task.stateHistory.push({
      from: task.state,
      to: newState,
      timestamp: new Date(),
      actor,
      reason,
    });

    // Update state
    task.state = newState;
    task.updated = new Date();

    return { success: true };
  }

  /**
   * Set classification result (Plant Manager output)
   */
  setClassification(
    taskId: string,
    classification: {
      projectType: ProjectType;
      scope: 'small' | 'medium' | 'large';
      department: 'preparation' | 'r_and_d' | 'execution' | 'quality' | 'documentation';
      confidence: number;
    }
  ): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.classification = classification;
    task.updated = new Date();
    return true;
  }

  /**
   * Set context package (Preparation Department output)
   */
  setContextPackage(taskId: string, contextPackage: ContextPackage): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.contextPackage = contextPackage;
    task.updated = new Date();
    return true;
  }

  /**
   * Set escalation info (when blocked)
   */
  setEscalation(
    taskId: string,
    escalation: {
      reason: string;
      fromDepartment: string;
      suggestedAction: string;
    }
  ): boolean {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    task.escalation = escalation;
    task.updated = new Date();
    return true;
  }

  /**
   * Get task summary for logging/display
   */
  getTaskSummary(taskId: string): string {
    const task = this.tasks.get(taskId);
    if (!task) return 'Task not found';

    const lines = [
      `Task: ${task.id}`,
      `State: ${task.state}`,
      `Created: ${task.created.toISOString()}`,
      `Request: ${task.rawRequest.substring(0, 100)}...`,
    ];

    if (task.classification) {
      lines.push(`Type: ${task.classification.projectType} (${task.classification.scope})`);
      lines.push(`Confidence: ${(task.classification.confidence * 100).toFixed(0)}%`);
    }

    if (task.contextPackage) {
      lines.push(`Package: ${task.contextPackage.id}`);
    }

    if (task.escalation) {
      lines.push(`BLOCKED: ${task.escalation.reason}`);
    }

    return lines.join('\n');
  }

  /**
   * Store task state to Mandrel
   */
  async persistToMandrel(taskId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);
    if (!task) return false;

    const result = await mandrel.storeContext(
      JSON.stringify(task, null, 2),
      'planning',
      ['forge-task', `state-${task.state}`, task.classification?.projectType ?? 'unclassified']
    );

    return result.success;
  }
}

// Singleton instance
export const taskManager = new TaskManager();
