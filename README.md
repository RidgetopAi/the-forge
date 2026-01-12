# The Forge

**Development cognition system for AI-assisted software engineering**

The Forge inverts how AI instances work. Instead of starting every session fresh, each AI instance inherits prepared context, accumulated patterns, and lessons from previous instances. The system does the preparation. The system maintains knowledge. The AI arrives informed.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-2496ED?style=flat&logo=docker&logoColor=white)
![Anthropic](https://img.shields.io/badge/Anthropic-Claude-orange)
![Status](https://img.shields.io/badge/Status-Active_Research-purple)

---

## The Problem

**AI instances are discontinuous.**

Every instance starts fresh. The human carries accumulated knowledge and re-injects it every session. You explain the same patterns. You re-teach the same constraints. You repeat yourself endlessly.

This doesn't scale.

## The Solution

The Forge creates infrastructure that:

1. **Prepares context before instances arrive** — File discovery, pattern extraction, dependency mapping happen automatically
2. **Routes work to cost-appropriate models** — Judgment calls use Opus, supervision uses Sonnet, labor uses cheap models
3. **Maintains knowledge across instances** — Each instance inherits accumulated wisdom via Mandrel
4. **Provides architectural human-in-the-loop** — Human sync triggers are built into the system, not fallback

The result: Each AI instance operates at full effectiveness from moment zero.

---

## Architecture: The Factory Model

The Forge implements a three-tier LLM hierarchy modeled after factory organization:

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
│    • Preparation Foreman — assembles ContextPackage             │
│    • Execution Foreman — supervises code generation             │
│    • Quality Gate — orchestrates testing/validation             │
│  Cost: $3/$15 per 1M tokens (25-35% of total)                   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TIER 3: WORKERS                              │
│               (Grok 4.1 Fast Reasoning via xAI)                 │
│                                                                 │
│  Role: Cheap, parallel, focused labor                           │
│  Workers:                                                       │
│    • FileDiscoveryWorker — finds relevant files                 │
│    • PatternExtractionWorker — extracts code conventions        │
│    • DependencyMapperWorker — maps file dependencies            │
│    • ConstraintIdentifierWorker — identifies constraints        │
│    • WebResearchWorker — gathers external knowledge             │
│    • DocumentationReaderWorker — reads project docs             │
│    • TestHarnessWorker — executes tests                         │
│  Cost: $0.10/$0.40 per 1M tokens (50-65% of total)              │
└─────────────────────────────────────────────────────────────────┘
```

**Why this hierarchy matters:** You pay Opus prices for decisions that determine success or failure. You don't pay Opus prices to read files. The tier system optimizes cost while maintaining quality where it matters.

---

## The Pipeline

```
REQUEST → INTAKE → HUMAN SYNC CHECK → PREPARATION → QUALITY EVAL → EXECUTION
            │              │                │              │            │
            ▼              ▼                ▼              ▼            ▼
       Plant Manager   13+ triggers    Wave 1 (parallel)  0-100     Code gen
       classifies      checked:        Wave 2 (dependent) scoring   with
       task type       • ambiguity     Wave 3 (optional)  Issues    self-healing
                       • complexity                       flagged   (3 attempts)
                       • cost
                       • breaking_change
                       May BLOCK
```

### Preparation Phase (The Key Innovation)

Before any execution instance arrives, the Preparation Foreman coordinates workers:

**Wave 1 (Parallel):**
- FileDiscoveryWorker — Finds all relevant files for the task
- ConstraintIdentifierWorker — Identifies constraints from config, tests, types

**Wave 2 (Dependent on Wave 1):**
- PatternExtractionWorker — Extracts code conventions from discovered files
- DependencyMapperWorker — Maps relationships between files

**Wave 3 (Optional):**
- WebResearchWorker — Gathers external knowledge when needed
- DocumentationReaderWorker — Reads project docs

**Output:** A `ContextPackage` containing everything an execution instance needs:
- Task description with acceptance criteria
- Architecture overview with relevant components
- Must-read files with focus areas
- Patterns and conventions to follow
- Constraints to respect

---

## Key Concepts

### SIRK: Successive Instance Refinement of Knowledge

The Forge was built using SIRK — a methodology where AI instances pass knowledge to each other:

1. Each instance reads handoffs from previous instances
2. Works on the problem with that accumulated context
3. Writes a handoff for the next instance
4. Stores learnings to Mandrel for semantic retrieval

**This project has 46+ handoffs** — 39 from v1 development, 7+ from v2 redesign. Each handoff documents what was built, what was learned, and what remains.

### Human Sync Protocol

Human-in-the-loop is architectural, not fallback:

```typescript
// 13+ built-in triggers
type HumanSyncTrigger =
  | 'low_confidence'        // Plant Manager uncertain
  | 'ambiguity'             // Multiple valid interpretations
  | 'complexity'            // Scope exceeds threshold
  | 'cost_threshold'        // Projected cost too high
  | 'breaking_change'       // Changes public interfaces
  | 'security_sensitive'    // Touches auth, encryption, PII
  | 'external_dependency'   // Requires external services
  // ... 6 more
```

When triggers fire, the system BLOCKS and requests human input. This isn't error handling — it's how the system works.

### ContextPackage Schema

Every task gets a structured context package:

```typescript
interface ContextPackage {
  id: string;
  projectType: 'feature' | 'bugfix' | 'greenfield' | 'refactor' | 'research';

  task: {
    description: string;
    acceptanceCriteria: string[];
    scope: { inScope: string[]; outOfScope: string[]; };
  };

  architecture: {
    overview: string;
    relevantComponents: Component[];
    dependencies: string[];
  };

  codeContext: {
    mustRead: FileReference[];
    mustNotModify: FileReference[];
    relatedExamples: FileReference[];
  };

  patterns: {
    namingConventions: string;
    fileOrganization: string;
    testingApproach: string;
    errorHandling: string;
    codeStyle: string[];
  };

  constraints: Constraint[];
}
```

This schema was validated through 39 passes of actual use.

---

## Mandrel Integration

The Forge stores all context, decisions, and handoffs to [Mandrel](https://github.com/RidgetopAi/mandrel) — a persistent memory system for AI agents.

```bash
# From inside the container, access Mandrel via SSH + curl
ssh hetzner 'curl -s -X POST http://localhost:8080/mcp/tools/context_store \
  -H "Content-Type: application/json" \
  -d '\''{"arguments": {"content": "...", "type": "handoff", "tags": ["the-forge"]}}'\'''
```

This enables:
- Semantic search across all previous work
- Instance handoffs that survive across sessions
- Accumulated learnings available to future instances

---

## Quick Start

### Prerequisites
- Docker + Docker Compose
- Anthropic API key (for Opus/Sonnet)
- xAI API key (for Grok workers)

### Setup

```bash
git clone https://github.com/RidgetopAi/the-forge.git
cd the-forge

# Configure environment
cp .env.example .env
# Edit .env with your API keys:
#   ANTHROPIC_API_KEY=...
#   XAI_API_KEY=...

# Build and start the workshop container
docker compose build
docker compose up -d

# Get a shell inside
docker compose exec forge bash

# Run the forge engine
cd /workspace/projects/the-forge/forge-engine
npm install
npm run dev
```

### Workshop Container

The Forge includes a fully-equipped execution environment:

**Languages:** Node.js 22.x, Python 3, TypeScript
**Tools:** Git, ripgrep, fd, fzf, tmux, Docker CLI, PostgreSQL client
**Pre-installed:** claude-code, tsx, prettier, eslint

```bash
# Run Claude Code inside the container
docker compose exec -it forge claude-code

# SSH to Mandrel VPS (for context storage)
docker compose exec forge ssh hetzner
```

---

## Project Structure

```
the-forge/
├── forge-engine/           # Core orchestration engine (~21k LoC)
│   ├── src/
│   │   ├── departments/    # Preparation, Execution, Quality Gate
│   │   ├── workers/        # File discovery, pattern extraction, etc.
│   │   ├── tiers.ts        # Model routing infrastructure
│   │   ├── types.ts        # ContextPackage schema
│   │   ├── state.ts        # Task state machine
│   │   ├── human-sync.ts   # Human-in-the-loop protocol
│   │   ├── mandrel.ts      # Memory system integration
│   │   └── ...
│   └── test/               # Unit and integration tests
├── handoffs/               # 46+ instance handoff documents
├── docs/                   # Design documentation
├── special-agents/         # Specialized agent configurations
├── Dockerfile              # Workshop container definition
└── docker-compose.yml      # Container orchestration
```

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Engine | TypeScript, Node.js | Orchestration logic |
| Plant Manager | Claude Opus 4.5 | Strategic judgment |
| Foremen | Claude Sonnet 4 | Supervision, synthesis |
| Workers | Grok 4.1 (xAI) | Parallel labor |
| Memory | Mandrel (MCP) | Context persistence |
| Container | Docker | Portable execution environment |
| Validation | Zod | Runtime schema validation |
| Testing | Vitest | Unit and integration tests |

---

## Project Stats

- **~21,000 lines** of TypeScript (forge-engine)
- **46+ handoffs** documenting iterative development
- **3-tier model hierarchy** with cost optimization
- **14 operation types** mapped to tiers
- **7 worker types** for parallel preparation
- **13+ human sync triggers** for architectural review

---

## The Vision

> **"Craftsmanship at scale, not mass production."**

A solo developer (or small team) needs to produce high-quality software efficiently. AI can do the work, but AI instances don't prepare, don't learn, don't self-correct without live feedback.

The Forge creates infrastructure that:
- Prepares context before instances arrive
- Enables compound learning across instances
- Provides live feedback for self-correction
- Maintains quality through architectural gates

The result: Each AI instance inherits accumulated wisdom and operates at full effectiveness immediately.

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests (`npm test`)
4. Submit a pull request

---

## License

MIT License — See [LICENSE](LICENSE) for details.

---

Built by [RidgetopAI](https://github.com/RidgetopAi) — teaching AI to prepare before it arrives.
