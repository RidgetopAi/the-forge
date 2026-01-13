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

import { WebSocket, WebSocketServer, type RawData } from 'ws';
import * as http from 'node:http';
import type { TaskState, ForgeTask } from './types.js';
import { SubmitTaskMessage, MandrelSwitchMessage, HumanSyncResponseMessage, type ServerResponse } from './types.js';
import type { ExecutionTrace, TraceStep } from './tracing.js';
import type { QualityEvaluation } from './llm.js';

// ============================================================================
// Types
// ============================================================================

export interface WebSocketEvent {
  type: 'phase_transition' | 'progress_update' | 'trace_step' | 'error' | 'completion' | 'human_sync_request';
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

export interface HumanSyncRequestEvent extends WebSocketEvent {
  type: 'human_sync_request';
  data: {
    requestId: string;
    trigger: string;
    question: string;
    context: string;
    options: Array<{
      id: string;
      label: string;
      description: string;
      impact?: string;
    }>;
    allowFreeform: boolean;
    urgency: 'low' | 'medium' | 'high' | 'critical';
    triggeredBy: string[];
  };
}

// ============================================================================
// WebSocket Streamer
// ============================================================================

export class WebSocketStreamer {
  private port?: number;
  private serverUrl?: string;
  private server?: http.Server;
  private wss?: WebSocketServer;
  private clientWs?: WebSocket;
  private isListening: boolean = false;
  private isClientConnected: boolean = false;
  private connectedClients: Set<WebSocket> = new Set();
  private eventQueue: WebSocketEvent[] = [];
  private maxQueueSize: number = 100;
  private mode: 'disabled' | 'server' | 'client' = 'disabled';
  private onTaskSubmittedCallback?: (projectPath: string, request: string, execute: boolean) => Promise<void>;
  private humanSyncService?: any; // Late-bound to avoid circular dependency

  constructor() {
    const portEnv = process.env.FORGE_WEBSOCKET_PORT;
    const serverUrlEnv = process.env.FORGE_WEBSOCKET_URL;

    // Priority: FORGE_WEBSOCKET_URL (client mode) > FORGE_WEBSOCKET_PORT (server mode)
    if (serverUrlEnv) {
      // Client mode: connect to existing server
      this.serverUrl = serverUrlEnv;
      this.mode = 'client';
      console.log(`[WebSocketStreamer] Client mode - will connect to ${this.serverUrl}`);
      this.connectAsClient();
    } else if (portEnv) {
      // Server mode: start our own server (only used by --serve)
      this.port = parseInt(portEnv, 10);
      this.mode = 'server';
      console.log(`[WebSocketStreamer] Server mode - starting on port ${this.port}`);
      this.startServer();
    } else {
      console.log('[WebSocketStreamer] No FORGE_WEBSOCKET_PORT or FORGE_WEBSOCKET_URL configured - streaming disabled');
    }
  }

  /**
   * Connect to an existing WebSocket server as a client
   */
  private async connectAsClient(): Promise<void> {
    if (!this.serverUrl || this.isClientConnected) {
      return;
    }

    try {
      this.clientWs = new WebSocket(this.serverUrl);

      this.clientWs.on('open', () => {
        console.log(`[WebSocketStreamer] ✓ Connected to server at ${this.serverUrl}`);
        this.isClientConnected = true;
        this.flushEventQueue();
      });

      this.clientWs.on('close', (code) => {
        console.log(`[WebSocketStreamer] ✗ Disconnected from server (code: ${code})`);
        this.isClientConnected = false;
        // Try to reconnect after a delay
        setTimeout(() => this.connectAsClient(), 2000);
      });

      this.clientWs.on('error', (error) => {
        console.warn(`[WebSocketStreamer] Connection error: ${error.message}`);
        this.isClientConnected = false;
      });

    } catch (error) {
      console.warn(`[WebSocketStreamer] Failed to connect as client: ${error}`);
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

        // Handle messages from clients (bidirectional communication)
        ws.on('message', (data) => {
          this.handleIncomingMessage(data, ws, clientId);
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
    if (this.mode === 'disabled') {
      return; // Streaming disabled
    }

    if (this.mode === 'client') {
      // Client mode: send to server
      if (this.isClientConnected && this.clientWs?.readyState === WebSocket.OPEN) {
        try {
          this.clientWs.send(JSON.stringify(event));
        } catch (error) {
          console.warn(`[WebSocketStreamer] Failed to send to server: ${error}`);
          this.queueEvent(event);
        }
      } else {
        this.queueEvent(event);
      }
    } else {
      // Server mode: broadcast to connected clients
      if (this.isListening && this.connectedClients.size > 0) {
        this.broadcastToClients(event);
      } else {
        this.queueEvent(event);
      }
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
   * Send all queued events to connected clients or server
   */
  private flushEventQueue(): void {
    if (this.eventQueue.length === 0) {
      return;
    }

    if (this.mode === 'client') {
      // Client mode: send to server
      if (!this.isClientConnected || this.clientWs?.readyState !== WebSocket.OPEN) {
        return;
      }
      console.log(`[WebSocketStreamer] Flushing ${this.eventQueue.length} queued events to server`);
      const events = [...this.eventQueue];
      this.eventQueue = [];
      for (const event of events) {
        try {
          this.clientWs!.send(JSON.stringify(event));
        } catch (error) {
          console.warn(`[WebSocketStreamer] Failed to flush event to server: ${error}`);
        }
      }
    } else {
      // Server mode: broadcast to clients
      if (!this.isListening || this.connectedClients.size === 0) {
        return;
      }
      console.log(`[WebSocketStreamer] Flushing ${this.eventQueue.length} queued events to ${this.connectedClients.size} client(s)`);
      const events = [...this.eventQueue];
      this.eventQueue = [];
      for (const event of events) {
        this.broadcastToClients(event);
      }
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
   * Stop the WebSocket server/client and close all connections
   */
  disconnect(): void {
    if (this.mode === 'client') {
      // Client mode: close connection to server
      if (this.clientWs) {
        console.log('[WebSocketStreamer] Closing client connection...');
        this.clientWs.close();
        this.clientWs = undefined;
      }
      this.isClientConnected = false;
    } else if (this.mode === 'server') {
      // Server mode: close server
      if (this.wss) {
        console.log('[WebSocketStreamer] Closing WebSocket server...');
        for (const client of this.connectedClients) {
          client.close();
        }
        this.connectedClients.clear();
        this.wss.close();
      }
      if (this.server) {
        this.server.close();
      }
      this.isListening = false;
    }
  }

  /**
   * Check if streaming is enabled
   */
  isEnabled(): boolean {
    return this.mode !== 'disabled';
  }

  /**
   * Check if connected (server listening or client connected)
   */
  isStreamingConnected(): boolean {
    if (this.mode === 'client') {
      return this.isClientConnected;
    }
    return this.isListening;
  }

  /**
   * Get number of connected clients (server mode only)
   */
  getConnectedClientCount(): number {
    return this.connectedClients.size;
  }

  /**
   * Register callback for task submission
   */
  onTaskSubmitted(callback: (projectPath: string, request: string, execute: boolean) => Promise<void>): void {
    this.onTaskSubmittedCallback = callback;
  }

  /**
   * Set Human Sync service for WebSocket response handling
   */
  setHumanSyncService(service: any): void {
    this.humanSyncService = service;
    
    // Register self as response handler with the service
    if (service.registerWebSocketResponseHandler) {
      service.registerWebSocketResponseHandler(async (requestId: string, optionId: string, notes?: string) => {
        console.log(`[WebSocketStreamer] Handling human sync response: ${requestId} -> ${optionId}`);
        // The response is already processed by the service's handler
        // This is just for logging/monitoring
      });
    }
  }

  /**
   * Send event to connected clients (exposed for HumanSyncService)
   * Note: Renamed to broadcastEvent to avoid collision with private sendEvent
   */
  broadcastEvent(event: WebSocketEvent): void {
    // Call the private sendEvent method
    this['sendEvent'](event);
  }

  /**
   * Handle incoming message from WebSocket client
   */
  private async handleIncomingMessage(data: RawData, ws: WebSocket, clientId: string): Promise<void> {
    try {
      const messageStr = data.toString();
      console.log(`[WebSocketStreamer] Message from client ${clientId}: ${messageStr.slice(0, 200)}${messageStr.length > 200 ? '...' : ''}`);
      
      const messageData = JSON.parse(messageStr);
      
      // Route by message type
      switch (messageData.type) {
        case 'submit_task':
          await this.handleSubmitTask(messageData, ws);
          break;
        case 'mandrel_switch':
          await this.handleMandrelSwitch(messageData, ws);
          break;
        case 'human_sync_response':
          await this.handleHumanSyncResponse(messageData, ws);
          break;
        default:
          this.sendToClient(ws, {
            type: 'server_response',
            messageType: messageData.type || 'unknown',
            success: false,
            error: `Unknown message type: ${messageData.type}`
          });
      }
    } catch (error) {
      console.warn(`[WebSocketStreamer] Failed to handle message from client ${clientId}:`, error);
      this.sendToClient(ws, {
        type: 'server_response',
        messageType: 'unknown',
        success: false,
        error: 'Failed to parse message'
      });
    }
  }

  /**
   * Handle submit_task message
   */
  private async handleSubmitTask(message: any, ws: WebSocket): Promise<void> {
    try {
      // Validate message structure
      const parsed = SubmitTaskMessage.parse(message);
      
      if (!this.onTaskSubmittedCallback) {
        this.sendToClient(ws, {
          type: 'server_response',
          messageType: 'submit_task',
          success: false,
          error: 'Task handler not registered'
        });
        return;
      }
      
      // Send confirmation
      this.sendToClient(ws, {
        type: 'server_response',
        messageType: 'submit_task',
        success: true,
        message: 'Task received, processing...'
      });
      
      // Execute task handler asynchronously
      this.onTaskSubmittedCallback(parsed.projectPath, parsed.request, parsed.execute)
        .catch(error => {
          console.error('[WebSocketStreamer] Task execution failed:', error);
          this.sendToClient(ws, {
            type: 'server_response',
            messageType: 'submit_task',
            success: false,
            error: `Task execution failed: ${error.message}`
          });
        });
        
    } catch (error) {
      this.sendToClient(ws, {
        type: 'server_response',
        messageType: 'submit_task',
        success: false,
        error: `Invalid submit_task message: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * Handle mandrel_switch message
   */
  private async handleMandrelSwitch(message: any, ws: WebSocket): Promise<void> {
    try {
      // Validate message structure
      const parsed = MandrelSwitchMessage.parse(message);
      
      // Set environment variable for Mandrel project switching
      process.env.FORGE_MANDREL_PROJECT = parsed.project;
      
      this.sendToClient(ws, {
        type: 'server_response',
        messageType: 'mandrel_switch',
        success: true,
        message: `Switched to project: ${parsed.project}`
      });
      
    } catch (error) {
      this.sendToClient(ws, {
        type: 'server_response',
        messageType: 'mandrel_switch',
        success: false,
        error: `Invalid mandrel_switch message: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * Handle human_sync_response message
   */
  private async handleHumanSyncResponse(message: any, ws: WebSocket): Promise<void> {
    try {
      // Validate message structure
      const parsed = HumanSyncResponseMessage.parse(message);
      
      console.log(`[WebSocketStreamer] Human sync response: ${parsed.requestId} -> ${parsed.optionId}`);
      
      // Route to Human Sync Service if available
      if (this.humanSyncService && this.humanSyncService.webSocketResponseHandler) {
        await this.humanSyncService.webSocketResponseHandler(
          parsed.requestId,
          parsed.optionId,
          parsed.notes
        );
        
        this.sendToClient(ws, {
          type: 'server_response',
          messageType: 'human_sync_response',
          success: true,
          message: 'Human sync response processed'
        });
      } else {
        // Late-bind to avoid circular dependency
        try {
          const { loadRequestFromMandrel, markRequestResponded } = await import('./human-sync.js');
          
          // Process the response directly
          const loaded = await loadRequestFromMandrel(parsed.requestId);
          if (loaded.success && loaded.request) {
            // Determine action from option
            const optionLower = parsed.optionId.toLowerCase();
            let action: 'proceed' | 'modify' | 'abort' | 'retry';
            
            if (optionLower.includes('abort') || optionLower.includes('cancel')) {
              action = 'abort';
            } else if (optionLower.includes('proceed') || optionLower.includes('execute')) {
              action = 'proceed';
            } else if (optionLower.includes('clarify') || optionLower.includes('expand') ||
                       optionLower.includes('specify') || optionLower.includes('modify')) {
              action = 'modify';
            } else {
              action = 'proceed';
            }
            
            await markRequestResponded(
              parsed.requestId,
              loaded.request.taskId,
              parsed.optionId,
              action,
              parsed.notes
            );
            
            this.sendToClient(ws, {
              type: 'server_response',
              messageType: 'human_sync_response',
              success: true,
              message: `Human sync response recorded with action: ${action}`
            });
          } else {
            this.sendToClient(ws, {
              type: 'server_response',
              messageType: 'human_sync_response',
              success: false,
              error: 'Could not find original request'
            });
          }
        } catch (importError) {
          console.error('[WebSocketStreamer] Failed to process human sync response:', importError);
          this.sendToClient(ws, {
            type: 'server_response',
            messageType: 'human_sync_response',
            success: false,
            error: 'Failed to process response'
          });
        }
      }
      
    } catch (error) {
      this.sendToClient(ws, {
        type: 'server_response',
        messageType: 'human_sync_response',
        success: false,
        error: `Invalid human_sync_response message: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }

  /**
   * Send message to a specific WebSocket client
   */
  private sendToClient(ws: WebSocket, response: ServerResponse): void {
    if (ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify(response));
      } catch (error) {
        console.warn(`[WebSocketStreamer] Failed to send response to client:`, error);
      }
    }
  }

  /**
   * Get streamer status
   */
  getStatus(): {
    enabled: boolean;
    connected: boolean;
    mode: 'disabled' | 'server' | 'client';
    port?: number;
    serverUrl?: string;
    connectedClients: number;
    queuedEvents: number;
  } {
    return {
      enabled: this.mode !== 'disabled',
      connected: this.isStreamingConnected(),
      mode: this.mode,
      port: this.port,
      serverUrl: this.serverUrl,
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
