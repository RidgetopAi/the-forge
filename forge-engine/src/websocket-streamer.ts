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

import { WebSocket, WebSocketServer } from 'ws';
import * as http from 'node:http';
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
  private port?: number;
  private server?: http.Server;
  private wss?: WebSocketServer;
  private isListening: boolean = false;
  private connectedClients: Set<WebSocket> = new Set();
  private eventQueue: WebSocketEvent[] = [];
  private maxQueueSize: number = 100;

  constructor() {
    const portEnv = process.env.FORGE_WEBSOCKET_PORT;
    this.port = portEnv ? parseInt(portEnv, 10) : undefined;
    
    if (this.port) {
      console.log(`[WebSocketStreamer] Starting WebSocket server on port ${this.port}`);
      this.startServer();
    } else {
      console.log('[WebSocketStreamer] No FORGE_WEBSOCKET_PORT configured - streaming disabled');
    }
  }

  /**
   * Start WebSocket server
   */
  private async startServer(): Promise<void> {
    if (!this.port || this.isListening) {
      return;
    }

    try {
      // Create HTTP server
      this.server = http.createServer();
      
      // Create WebSocket server
      this.wss = new WebSocketServer({ server: this.server });

      // Handle new connections
      this.wss.on('connection', (ws: WebSocket, request) => {
        const clientId = crypto.randomUUID().slice(0, 8);
        const clientAddr = request.socket.remoteAddress || 'unknown';
        console.log(`[WebSocketStreamer] ✓ Client ${clientId} connected from ${clientAddr}`);
        
        this.connectedClients.add(ws);
        
        // Send queued events to new client
        this.sendQueuedEventsToClient(ws);

        // Handle client disconnect
        ws.on('close', (code, reason) => {
          console.log(`[WebSocketStreamer] ✗ Client ${clientId} disconnected (code: ${code})`);
          this.connectedClients.delete(ws);
        });

        ws.on('error', (error) => {
          console.warn(`[WebSocketStreamer] Client ${clientId} error: ${error.message}`);
          this.connectedClients.delete(ws);
        });

        // Optional: Handle messages from clients (for future bidirectional communication)
        ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString());
            console.log(`[WebSocketStreamer] Message from client ${clientId}:`, message);
          } catch {
            // Ignore malformed messages
          }
        });
      });

      // Start listening
      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.port, () => {
          console.log(`[WebSocketStreamer] Server listening on port ${this.port}`);
          this.isListening = true;
          resolve();
        });
        
        this.server!.on('error', (error) => {
          console.warn(`[WebSocketStreamer] Server error: ${error.message}`);
          reject(error);
        });
      });

    } catch (error) {
      console.warn(`[WebSocketStreamer] Failed to start server: ${error}`);
    }
  }

  /**
   * Send event to all connected clients or queue for later
   */
  private sendEvent(event: WebSocketEvent): void {
    if (!this.port) {
      return; // Streaming disabled
    }

    if (this.isListening && this.connectedClients.size > 0) {
      this.broadcastToClients(event);
    } else {
      this.queueEvent(event);
    }
  }

  /**
   * Broadcast event to all connected clients
   */
  private broadcastToClients(event: WebSocketEvent): void {
    const eventData = JSON.stringify(event);
    const disconnectedClients: WebSocket[] = [];

    for (const client of this.connectedClients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(eventData);
        } catch (error) {
          console.warn(`[WebSocketStreamer] Failed to send to client: ${error}`);
          disconnectedClients.push(client);
        }
      } else {
        disconnectedClients.push(client);
      }
    }

    // Clean up disconnected clients
    for (const client of disconnectedClients) {
      this.connectedClients.delete(client);
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
   * Send all queued events to connected clients
   */
  private flushEventQueue(): void {
    if (!this.isListening || this.eventQueue.length === 0 || this.connectedClients.size === 0) {
      return;
    }

    console.log(`[WebSocketStreamer] Flushing ${this.eventQueue.length} queued events to ${this.connectedClients.size} client(s)`);
    
    const events = [...this.eventQueue];
    this.eventQueue = [];
    
    for (const event of events) {
      this.broadcastToClients(event);
    }
  }

  /**
   * Send queued events to a specific new client
   */
  private sendQueuedEventsToClient(client: WebSocket): void {
    if (this.eventQueue.length === 0 || client.readyState !== WebSocket.OPEN) {
      return;
    }

    console.log(`[WebSocketStreamer] Sending ${this.eventQueue.length} queued events to new client`);
    
    for (const event of this.eventQueue) {
      try {
        client.send(JSON.stringify(event));
      } catch (error) {
        console.warn(`[WebSocketStreamer] Failed to send queued event to new client: ${error}`);
        break;
      }
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
   * Stop the WebSocket server and close all connections
   */
  disconnect(): void {
    if (this.wss) {
      console.log('[WebSocketStreamer] Closing WebSocket server...');
      
      // Close all client connections
      for (const client of this.connectedClients) {
        client.close();
      }
      this.connectedClients.clear();
      
      // Close the WebSocket server
      this.wss.close();
    }
    
    if (this.server) {
      this.server.close();
    }
    
    this.isListening = false;
  }

  /**
   * Check if streaming is enabled
   */
  isEnabled(): boolean {
    return !!this.port;
  }

  /**
   * Check if server is currently listening
   */
  isStreamingConnected(): boolean {
    return this.isListening;
  }

  /**
   * Get number of connected clients
   */
  getConnectedClientCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Get server status
   */
  getStatus(): {
    enabled: boolean;
    connected: boolean;
    port?: number;
    connectedClients: number;
    queuedEvents: number;
  } {
    return {
      enabled: !!this.port,
      connected: this.isListening,
      port: this.port,
      connectedClients: this.connectedClients.size,
      queuedEvents: this.eventQueue.length,
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
