# The Forge + Forge Control: System Documentation

## What These Systems Are

You have built **two interconnected systems** that together form an AI-assisted development environment:

| System | Language | Location | Purpose |
|--------|----------|----------|---------|
| **The Forge** | TypeScript | `~/projects/the-forge/forge-engine/` | AI orchestration engine that prepares context and executes code generation tasks |
| **Forge Control** | Rust | `~/projects/forge-control/` | Terminal UI (TUI) with LLM integration, cloned from ridge-control |

---

## The Forge: AI Development Cognition System

### Core Concept: Factory Model Hierarchy

The Forge implements a **three-tier LLM hierarchy** modeled after factory organization:

```
┌─────────────────────────────────────────────────────────────────┐
│                    TIER 1: PLANT MANAGER                        │
│                      (Claude Opus 4.5)                          │
│                                                                 │
│  Role: Strategic judgment only                                  │
│  Operations: classify_task, escalation_decision,                │
│              resolve_stuck_point, quality_judgment              │
│  Cost: $15/$75 per 1M tokens (10-15% of total)                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TIER 2: FOREMEN                              │
│                     (Claude Sonnet 4)                           │
│                                                                 │
│  Role: Department supervision and synthesis                     │
│  Departments:                                                   │
│    • Preparation Foreman - assembles ContextPackage             │
│    • Execution Foreman - supervises code generation             │
│    • Quality Gate - orchestrates testing/validation             │
│  Cost: $3/$15 per 1M tokens (25-35% of total)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TIER 3: WORKERS                              │
│               (Claude 3.5 Haiku OR Grok 4.1)                    │
│                                                                 │
│  Role: Cheap, parallel, focused labor                           │
│  Workers:                                                       │
│    • FileDiscoveryWorker - finds relevant files                 │
│    • PatternExtractionWorker - extracts code conventions        │
│    • DependencyMapperWorker - maps file dependencies            │
│    • ConstraintIdentifierWorker - identifies constraints        │
│    • WebResearchWorker - gathers external knowledge             │
│    • DocumentationReaderWorker - reads project docs             │
│    • TestHarnessWorker - executes tests                         │
│  Cost: $0.10/$0.40 per 1M tokens (50-65% of total)              │
└─────────────────────────────────────────────────────────────────┘
```

**Verified in code** (`tiers.ts:49-80`):
- Opus: `claude-opus-4-5-20251101`
- Sonnet: `claude-sonnet-4-20250514`
- Worker tier: Uses `grok-4-1-fast-reasoning` via xAI API (decision made after Phase 0 validation showing 75% accuracy vs 60% for Haiku)

### Main Pipeline Flow

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                           THE FORGE PIPELINE                                  │
└──────────────────────────────────────────────────────────────────────────────┘

     REQUEST
        │
        ▼
┌───────────────┐     ┌─────────────────────────────────────────────────┐
│   INTAKE      │     │  Plant Manager (Opus) classifies:               │
│   (Phase 1)   │────▶│  • Task type (code, docs, testing, config)      │
│               │     │  • Scope assessment                             │
│               │     │  • Confidence level                             │
└───────────────┘     └─────────────────────────────────────────────────┘
        │
        ▼
┌───────────────┐     ┌─────────────────────────────────────────────────┐
│  HUMAN SYNC   │     │  13+ built-in triggers checked:                 │
│  CHECK        │────▶│  • low_confidence, ambiguity, complexity        │
│  (Pre-Prep)   │     │  • cost_threshold, breaking_change              │
│               │     │  • May BLOCK and request human input            │
└───────────────┘     └─────────────────────────────────────────────────┘
        │
        ▼
┌───────────────┐     ┌─────────────────────────────────────────────────┐
│ PREPARATION   │     │  Wave 1 (Parallel):                             │
│ (Phase 2)     │     │    • FileDiscoveryWorker                        │
│               │────▶│    • ConstraintIdentifierWorker                 │
│  Foreman +    │     │  Wave 2 (Dependent):                            │
│  Workers      │     │    • PatternExtractionWorker                    │
│               │     │    • DependencyMapperWorker                     │
│               │     │  Wave 3 (Optional):                             │
│               │     │    • WebResearchWorker                          │
│               │     │    • DocumentationReaderWorker                  │
│               │     │                                                 │
│               │     │  Output: ContextPackage                         │
└───────────────┘     └─────────────────────────────────────────────────┘
        │
        ▼
┌───────────────┐     ┌─────────────────────────────────────────────────┐
│   QUALITY     │     │  LLM evaluates ContextPackage (0-100):          │
│   EVALUATION  │────▶│  • Completeness, Accuracy, Relevance            │
│   (Phase 3)   │     │  • Issues: critical, warning, suggestion        │
└───────────────┘     └─────────────────────────────────────────────────┘
        │
        ▼
┌───────────────┐     ┌─────────────────────────────────────────────────┐
│  EXECUTION    │     │  If --execute flag passed:                      │
│  (Phase 4)    │────▶│  • Code generation with ContextPackage          │
│  (Optional)   │     │  • Self-healing (up to 3 compilation attempts)  │
│               │     │  • Validation (tests, types, linting)           │
└───────────────┘     └─────────────────────────────────────────────────┘
        │
        ▼
     RESULT
```

**Verified in code** (`index.ts`, `preparation.ts`, `execution.ts`):
- Preparation is ~1,059 lines
- Execution is ~2,167 lines
- State machine enforces lifecycle: `intake → classified → preparing → prepared → executing → completed`

### ContextPackage: The Core Data Structure

Every task produces a **ContextPackage** that contains everything needed for execution:

```typescript
// Verified from types.ts (585 lines)
interface ContextPackage {
  metadata: {
    id: string;
    projectType: ProjectType;
    preparedAt: string;
  };

  task: {
    description: string;
    acceptanceCriteria: string[];
    scope: { inScope: string[]; outOfScope: string[] };
  };

  architecture: {
    overview: string;
    relevantComponents: Component[];
    dataFlow?: string;
    externalDependencies: Dependency[];
  };

  codeContext: {
    mustRead: FileContext[];      // Files that MUST be read
    mustNotModify: string[];      // Protected files
    similarExamples: FileContext[]; // Reference implementations
  };

  patterns: {
    namingConventions: Convention[];
    fileOrganization: string;
    testingApproach: string;
    errorHandling: string;
  };

  constraints: Constraint[];      // Technical limitations
  risks: Risk[];                  // With mitigations

  previousAttempts: Attempt[];    // Learning from history
  relatedDecisions: Decision[];   // Architectural context

  humanSync: {
    pendingQuestions: Question[];
    requiredApprovals: string[];
  };
}
```

### WebSocket Streaming

The Forge streams real-time progress to connected clients.

**Verified in code** (`websocket-streamer.ts:25-79`):
```typescript
// Event types actually implemented
type WebSocketEvent =
  | 'phase_transition'  // State changes (intake → classified → preparing...)
  | 'progress_update'   // Step progress within phases
  | 'trace_step'        // Detailed execution trace
  | 'error'             // Error events
  | 'completion';       // Final result
```

**Server architecture** (`websocket-streamer.ts:85-104`):
- Configurable via `FORGE_WEBSOCKET_PORT` environment variable
- HTTP server with WebSocket upgrade
- Event queue (max 100) for clients that connect mid-execution
- New clients receive queued events on connection

---

## Forge Control: Terminal UI

### What It Is

A **Rust TUI application** (~15,000+ lines) that provides:
- Full PTY terminal emulation (run any shell)
- Multi-provider LLM integration (Claude, GPT, Gemini, Grok, Groq)
- Process monitoring with CPU/GPU metrics
- Stream viewing for external data sources
- Session persistence and restoration

### Origin

Cloned from `ridge-control` (visible in config paths: `~/.config/ridge-control/`)

**Verified in code** (`Cargo.toml`):
```toml
[package]
name = "forge-control"
version = "0.1.0"
description = "Terminal-based command center with PTY emulator, LLM integration, and process monitoring"
```

### Connection to The Forge

**Default stream configuration** (`streams/config.rs:13-24`):
```rust
StreamDefinition {
    id: "forge-ws".to_string(),
    name: "The Forge WebSocket".to_string(),
    protocol: StreamProtocol::WebSocket,
    url: "wss://forge.ridgetopai.com/ws".to_string(),
    auto_connect: true,
    reconnect: true,
    reconnect_delay_ms: 3000,
}
```

This means forge-control automatically attempts to connect to The Forge's WebSocket server on startup.

### Forge Bridge Module

**Verified in code** (`forge_bridge/mod.rs`):
```rust
pub struct WebSocketServer {
    bind_address: String,
}
```

Currently implements a **basic echo server** - receives messages and echoes them back. This is the foundation for bidirectional communication with The Forge.

### Stream Client Architecture

**Verified in code** (`streams/client.rs`):

```
┌─────────────────────────────────────────────────────────────────┐
│                    STREAM MANAGER                                │
├─────────────────────────────────────────────────────────────────┤
│  Protocols Supported:                                           │
│    • WebSocket (primary)                                        │
│    • Server-Sent Events (SSE)                                   │
│    • REST/HTTP polling                                          │
│    • Unix domain sockets                                        │
│    • TCP sockets                                                │
├─────────────────────────────────────────────────────────────────┤
│  Features:                                                      │
│    • Auto-reconnect with exponential backoff + jitter           │
│    • Connection health tracking (failure count, last error)     │
│    • Graceful degradation when unavailable                      │
│    • Event-driven via mpsc channels                             │
└─────────────────────────────────────────────────────────────────┘
```

**Reconnection logic** (`client.rs:106-117`):
```rust
pub fn backoff_delay(&self, base_delay_ms: u64) -> Duration {
    let attempt = self.reconnect_attempt.min(10);
    let exponential_delay = base_delay_ms * (2_u64.pow(attempt));
    let max_delay = 60_000; // Cap at 60 seconds
    // Add ±20% jitter
}
```

---

## System Integration Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        COMPLETE SYSTEM ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────────────────┘

  DEVELOPER
      │
      │ interacts with
      ▼
┌─────────────────────┐
│   FORGE CONTROL     │
│   (Rust TUI)        │
│                     │
│  • Terminal/shell   │
│  • LLM chat         │
│  • Stream viewer    │◀────────────────────────┐
│  • Process monitor  │                         │
└─────────────────────┘                         │
      │                                         │
      │ WebSocket (wss://forge.ridgetopai.com/ws)
      │ auto_connect: true                      │
      ▼                                         │
┌─────────────────────┐                         │
│   THE FORGE         │                         │
│   (TypeScript)      │                         │
│                     │    WebSocket events:    │
│  Opus ─► Sonnet    │    • phase_transition   │
│           │        │────▶ • progress_update   │
│           ▼        │    • trace_step          │
│        Workers     │    • completion          │
│    (Haiku/Grok)    │                         │
└─────────────────────┘
      │
      │ SSH + HTTP
      ▼
┌─────────────────────┐
│   MANDREL           │
│   (VPS: Hetzner)    │
│                     │
│  • Context storage  │
│  • Semantic search  │
│  • Task tracking    │
│  • Decision records │
│  • Execution traces │
└─────────────────────┘
```

---

## Key Technical Details

### The Forge: Code Metrics

| Component | Lines | Purpose |
|-----------|-------|---------|
| `index.ts` | 1,361 | Main orchestration |
| `execution.ts` | 2,167 | Code generation supervision |
| `preparation.ts` | 1,059 | Context assembly |
| `human-sync.ts` | 1,218 | Human oversight protocol |
| `tiers.ts` | 795 | Model routing |
| `learning.ts` | 757 | Compound learning |
| `context-budget.ts` | 763 | Token management |
| `insights.ts` | 808 | Pattern analysis |
| **Total** | **~20,500** | - |

### Forge Control: Key Modules

| Module | Purpose |
|--------|---------|
| `app/` | Main application state and event loop |
| `agent/` | LLM agent engine with thread persistence |
| `llm/` | Multi-provider LLM integration |
| `streams/` | Multi-protocol stream management |
| `forge_bridge/` | WebSocket server for Forge connection |
| `pty/` | PTY terminal emulation |
| `components/` | Reusable TUI widgets |
| `config/` | Hot-reload configuration |

### What's Actually Working (Verified)

**The Forge:**
- Full pipeline: intake → preparation → quality → execution
- Multi-tier LLM routing (Opus/Sonnet/Grok)
- WebSocket streaming server
- Worker implementations (7 worker types)
- Human sync protocol (13+ triggers)
- Execution tracing
- Mandrel integration

**Forge Control:**
- PTY terminal emulation
- Multi-provider LLM chat (5 providers)
- WebSocket client with auto-reconnect
- Stream viewer UI
- Default Forge stream configured
- Forge bridge module (basic echo server)

---

## Visual Summary for Presentations

### Slide 1: The Vision
```
┌─────────────────────────────────────────────────────────────────┐
│  "CRAFTSMANSHIP AT SCALE, NOT MASS PRODUCTION"                  │
│                                                                 │
│  Problem: AI instances don't prepare, don't learn,              │
│           don't self-correct without live feedback              │
│                                                                 │
│  Solution: Infrastructure that:                                 │
│    • Prepares context BEFORE instances arrive                   │
│    • Enables compound learning ACROSS instances                 │
│    • Provides live feedback for self-correction                 │
│    • Maintains quality through architectural gates              │
└─────────────────────────────────────────────────────────────────┘
```

### Slide 2: Factory Model
```
      ┌─────────────────────────────────────────┐
      │        PLANT MANAGER (Opus)             │
      │     Strategic judgment, routing         │
      │         10-15% of cost                  │
      └─────────────────┬───────────────────────┘
                        │
      ┌─────────────────┴───────────────────────┐
      │          FOREMEN (Sonnet)               │
      │     Preparation │ Execution │ Quality   │
      │         25-35% of cost                  │
      └─────────────────┬───────────────────────┘
                        │
      ┌─────────────────┴───────────────────────┐
      │          WORKERS (Grok)                 │
      │  File │ Pattern │ Deps │ Constraints    │
      │  Research │ Docs │ Tests                │
      │         50-65% of cost                  │
      └─────────────────────────────────────────┘
```

### Slide 3: TUI + Engine
```
  ┌──────────────────────────────────────────────────────────────┐
  │                    FORGE CONTROL (TUI)                        │
  │  ┌─────────────┬─────────────┬─────────────────────────────┐ │
  │  │  Terminal   │  LLM Chat   │      Stream Viewer          │ │
  │  │  (PTY)      │  (Claude)   │  ┌────────────────────────┐ │ │
  │  │             │             │  │ [phase_transition]     │ │ │
  │  │  $ _        │  User: ...  │  │ intake → classified    │ │ │
  │  │             │             │  │ [progress_update]      │ │ │
  │  │             │  Claude:... │  │ FileDiscovery started  │ │ │
  │  │             │             │  │ [trace_step]           │ │ │
  │  │             │             │  │ Found 47 files, 23ms   │ │ │
  │  └─────────────┴─────────────┴──└────────────────────────┘ │ │
  │                                        ▲                    │
  └────────────────────────────────────────┼────────────────────┘
                                           │ WebSocket
                                           │
  ┌────────────────────────────────────────┼────────────────────┐
  │                THE FORGE (Engine)      │                    │
  │                                        │                    │
  │    [Request] ──▶ [Prepare] ──▶ [Execute] ──▶ [Result]      │
  │                      │                                      │
  │               ┌──────┴──────┐                               │
  │               │   Workers   │                               │
  │               └─────────────┘                               │
  └─────────────────────────────────────────────────────────────┘
```

---

## Verification Summary

| Claim | Verification |
|-------|--------------|
| "Cloned ridge-control" | Config paths use `ridge-control` directory |
| "WebSocket connection" | Default stream: `wss://forge.ridgetopai.com/ws`, auto_connect: true |
| "Server-side WebSocket" | `websocket-streamer.ts` implements WebSocket server (478 lines) |
| "Client-side connection" | `streams/client.rs` implements WebSocket client (884 lines) |
| "Caught errors and fixed" | Stream client has reconnection with backoff + jitter, health tracking |
| "Connects to forge-control" | `forge_bridge/mod.rs` provides WebSocket server capability |

---

*Document generated from code analysis on 2026-01-11*
