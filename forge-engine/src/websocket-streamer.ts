/**
 * WebSocket Streaming for Forge Output
 *
 * Streams phase transitions and execution progress via WebSocket.
 * Optional functionality - Forge works normally when not configured.
 *
 * Features:
 * - Configurable via FORGE_WEBSOCKET_URL environment variable
 * - Streams phase transitions (intake → classified → preparing → etc.)
 * - Streams execution progress and trace updates
 * - Graceful degradation when WebSocket unavailable
 * - JSON event format for easy consumption
 */

import { WebSocket } from 'ws';
import type { TaskState, ForgeTask } from './types.js';
import type { ExecutionTrace, TraceStep } from './tracing.js';
import type { QualityEvaluation } from './llm.js';

// ============================================================================
// Types
// ============================================================================

export interface WebSocketEvent {
  type: 'phase_transition' | 'progress_update' | 'trace_step' | 'error' | 'completion';
  timestamp: string;
  taskId: string;
  data: Record<string, unknown>;
}

export interface PhaseTransitionEvent extends WebSocketEvent {
  type: 'phase_transition';
  data: {
    fromState: TaskState | null;
    toState: TaskState;
    actor: string;
    reason?: string;
    duration?: number;
  };
}

export interface ProgressUpdateEvent extends WebSocketEvent {
  type: 'progress_update';
  data: {
    phase: string;
    step: string;
    status: 'started' | 'completed' | 'failed';
    details?: Record<string, unknown>;
    error?: string;
  };
}

export interface TraceStepEvent extends WebSocketEvent {
  type: 'trace_step';
  data: {
    stepName: string;
    status: 'success' | 'failure' | 'skipped';
    durationMs: number;
    details?: Record<string, unknown>;
    error?: string;
  };
}

export interface CompletionEvent extends WebSocketEvent {
  type: 'completion';
  data: {
    success: boolean;
    stage: string;
    executionResult?: {
      success: boolean;
      filesCreated: string[];
      filesModified: string[];
      compilationPassed: boolean;
    };
    qualityEvaluation?: QualityEvaluation;
    trace?: ExecutionTrace;
  };
}

// ============================================================================
// WebSocket Streamer
// ============================================================================

export class WebSocketStreamer {
  private websocketUrl?: string;
  private ws?: WebSocket;
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private reconnectDelay: number = 1000;
  private eventQueue: WebSocketEvent[] = [];
  private maxQueueSize: number = 100;

  constructor() {
    this.websocketUrl = process.env.FORGE_WEBSOCKET_URL;
    
    if (this.websocketUrl) {
      console.log(`[WebSocketStreamer] Configured for streaming to: ${this.websocketUrl}`);
      this.connect();
    } else {
      console.log('[WebSocketStreamer] No FORGE_WEBSOCKET_URL configured - streaming disabled');
    }
  }

  /**
   * Connect to WebSocket server
   */
  private async connect(): Promise<void> {
    if (!this.websocketUrl || this.isConnected) {
      return;
    }

    try {
      this.ws = new WebSocket(this.websocketUrl);

      this.ws.on('open', () => {
        console.log('[WebSocketStreamer] Connected successfully');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.flushEventQueue();
      });

      this.ws.on('close', (code, reason) => {
        console.log(`[WebSocketStreamer] Disconnected (code: ${code}, reason: ${reason})`);
        this.isConnected = false;
        this.scheduleReconnect();
      });

      this.ws.on('error', (error) => {
        console.warn(`[WebSocketStreamer] Connection error: ${error.message}`);
        this.isConnected = false;
      });

    } catch (error) {
      console.warn(`[WebSocketStreamer] Failed to connect: ${error}`);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.warn('[WebSocketStreamer] Max reconnection attempts reached - giving up');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * this.reconnectAttempts;
    
    console.log(`[WebSocketStreamer] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Send event to WebSocket or queue for later
   */
  private sendEvent(event: WebSocketEvent): void {
    if (!this.websocketUrl) {
      return; // Streaming disabled
    }

    if (this.isConnected && this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(event));
      } catch (error) {
        console.warn(`[WebSocketStreamer] Failed to send event: ${error}`);
        this.queueEvent(event);
      }
    } else {
      this.queueEvent(event);
    }
  }

  /**
   * Queue event for later transmission
   */
  private queueEvent(event: WebSocketEvent): void {
    if (this.eventQueue.length >= this.maxQueueSize) {
      // Remove oldest event to make room
      this.eventQueue.shift();
      console.warn('[WebSocketStreamer] Event queue full - dropping oldest event');
    }
    
    this.eventQueue.push(event);
  }

  /**
   * Send all queued events
   */
  private flushEventQueue(): void {
    if (!this.isConnected || this.eventQueue.length === 0) {
      return;
    }

    console.log(`[WebSocketStreamer] Flushing ${this.eventQueue.length} queued events`);
    
    const events = [...this.eventQueue];
    this.eventQueue = [];
    
    for (const event of events) {
      this.sendEvent(event);
    }
  }

  /**
   * Stream a phase transition event
   */
  streamPhaseTransition(
    taskId: string,
    fromState: TaskState | null,
    toState: TaskState,
    actor: string,
    reason?: string,
    duration?: number
  ): void {
    const event: PhaseTransitionEvent = {
      type: 'phase_transition',
      timestamp: new Date().toISOString(),
      taskId,
      data: {
        fromState,
        toState,
        actor,
        reason,
        duration,
      },
    };

    this.sendEvent(event);
  }

  /**
   * Stream a progress update event
   */
  streamProgressUpdate(
    taskId: string,
    phase: string,
    step: string,
    status: 'started' | 'completed' | 'failed',
    details?: Record<string, unknown>,
    error?: string
  ): void {
    const event: ProgressUpdateEvent = {
      type: 'progress_update',
      timestamp: new Date().toISOString(),
      taskId,
      data: {
        phase,
        step,
        status,
        details,
        error,
      },
    };

    this.sendEvent(event);
  }

  /**
   * Stream a trace step event
   */
  streamTraceStep(
    taskId: string,
    stepName: string,
    status: 'success' | 'failure' | 'skipped',
    durationMs: number,
    details?: Record<string, unknown>,
    error?: string
  ): void {
    const event: TraceStepEvent = {
      type: 'trace_step',
      timestamp: new Date().toISOString(),
      taskId,
      data: {
        stepName,
        status,
        durationMs,
        details,
        error,
      },
    };

    this.sendEvent(event);
  }

  /**
   * Stream an error event
   */
  streamError(
    taskId: string,
    error: string,
    phase?: string,
    details?: Record<string, unknown>
  ): void {
    const event: WebSocketEvent = {
      type: 'error',
      timestamp: new Date().toISOString(),
      taskId,
      data: {
        error,
        phase,
        details,
      },
    };

    this.sendEvent(event);
  }

  /**
   * Stream a completion event
   */
  streamCompletion(
    taskId: string,
    success: boolean,
    stage: string,
    executionResult?: {
      success: boolean;
      filesCreated: string[];
      filesModified: string[];
      compilationPassed: boolean;
    },
    qualityEvaluation?: QualityEvaluation,
    trace?: ExecutionTrace
  ): void {
    const event: CompletionEvent = {
      type: 'completion',
      timestamp: new Date().toISOString(),
      taskId,
      data: {
        success,
        stage,
        executionResult,
        qualityEvaluation,
        trace,
      },
    };

    this.sendEvent(event);
  }

  /**
   * Close the WebSocket connection
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.isConnected = false;
    }
  }

  /**
   * Check if streaming is enabled
   */
  isEnabled(): boolean {
    return !!this.websocketUrl;
  }

  /**
   * Check if currently connected
   */
  isStreamingConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Get connection status
   */
  getStatus(): {
    enabled: boolean;
    connected: boolean;
    url?: string;
    queuedEvents: number;
    reconnectAttempts: number;
  } {
    return {
      enabled: !!this.websocketUrl,
      connected: this.isConnected,
      url: this.websocketUrl,
      queuedEvents: this.eventQueue.length,
      reconnectAttempts: this.reconnectAttempts,
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createWebSocketStreamer(): WebSocketStreamer {
  return new WebSocketStreamer();
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const webSocketStreamer = createWebSocketStreamer();
