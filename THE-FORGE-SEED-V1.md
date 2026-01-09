# THE FORGE: Development Cognition System
## SIRK Seed Document v1

---

## What This Document Is

This is the seed for a multi-pass iterative refinement process (SIRK). Each pass should:
1. Read all previous passes
2. Critically evaluate what's been established
3. Find edge cases, gaps, or flaws in previous thinking
4. Add genuine contribution (not repetition)
5. Leave clear handoff for next pass

After 10-15 disciplined passes, this becomes the architecture specification for The Forge.

---

## The Core Problem

**AI instances are discontinuous.**

Every time an AI instance spins up, it starts fresh. It doesn't know your codebase, your patterns, what worked last time, what failed. The human carries all accumulated knowledge and must re-inject it every session.

This is the fundamental constraint. Not intelligence. Not capability. **Continuity.**

Current state: Human does preparation work. Human maintains context. Human guides each fresh instance. The AI provides depth within a session but doesn't compound across sessions.

**The Forge inverts this.** The system does preparation. The system maintains context. The system makes each instance maximally effective from moment zero.

---

## The Vision

**Craftsmanship at scale, not mass production.**

A solo developer (or small team) needs to produce high-quality software efficiently. AI can do the work, but AI instances don't prepare, don't learn, don't self-correct without live feedback.

The Forge creates infrastructure that:
- Prepares context before instances arrive
- Enables compound learning across instances
- Provides live feedback for self-correction
- Maintains quality through architectural gates

The result: Each AI instance inherits accumulated wisdom and operates at full effectiveness immediately.

---

## Validated Patterns (From Emergence-Notes + Keymaker)

These patterns are not theoretical. They were tested across 33+ instances in emergence-notes and 26+ instances in Keymaker.

### Pattern 1: Instance Continuity Through Handoffs

**What works:**
- Explicit handoff documents at session end
- Numbered instance identity (creates accountability)
- Clear "What I Did / What Works / What Doesn't / For Next Instance" structure
- Handoffs stored persistently, retrievable by next instance

**Evidence:** 33 emergence-notes instances maintained philosophical continuity. 26+ Keymaker instances built production system through handoff chain.

### Pattern 2: Critical Review Gates

**What works:**
- Next instance validates previous work before extending
- Testing on real data, not theoretical validation
- Finding edge cases predecessors missed
- Permission to disagree with or pivot from previous direction

**Evidence:** Instance #36 tested #35's memory architecture on 1,338 real contexts, found 3 edge cases, proposed practical fixes. This is genuine compound thinking.

### Pattern 3: Pivot Permission

**What works:**
- Instances can break patterns that aren't working
- "Design accumulation" is a failure mode to detect and break
- The pivot often comes from simpler insight, not deeper analysis

**Evidence:** Keymaker instances #0-5 accumulated 1,450 lines of unused design. Instance #6 pivoted to MVK (minimum viable keymaker) and actually shipped. Key insight: "Opus diagnosed better, Sonnet acted better."

### Pattern 4: Real Validation Requirements

**What works:**
- Test on real data before proceeding
- Build read-only prototypes to validate before committing
- Measure concrete outcomes (query time, accuracy, line counts)
- "No observation has been processed" = we haven't validated anything

**Evidence:** Instance #36's SQL prototype validated performance (0.8ms vs 100ms target). Real testing on real data prevents theoretical drift.

### Pattern 5: Design Accumulation Prevention

**What works:**
- Maximum 2-3 instances before working prototype required
- Count running lines, not designed lines
- "Validate-first tasks" not "Design X tasks"
- Force execution checkpoints

**Evidence:** Keymaker had 3:1 design-to-working ratio before pivot. Post-pivot: 162 lines/instance of working code vs 242 lines/instance of unused design.

---

## The Factory Model (Proposed Architecture)

### Plant Manager (Orchestrator)
- Smart model (Opus-tier)
- Routes work based on input type
- Monitors overall flow
- Makes judgment calls at stuck points
- **Doesn't do labor - directs it**

### Department Foremen (Domain Controllers)
- Mid-tier models (Sonnet-level)
- Own their domain: Preparation, Execution, Quality, Documentation
- Manage workers, enforce standards
- **Gate quality before handoff to next department**

### Workers (Task Agents)
- Cheap/fast models (Haiku, Flash, 4o-mini)
- Specialized, tightly scoped tasks
- Research, generation, testing, drafting
- **Supervised, not autonomous** (cheap models drift without tight scope)

### Cost Structure Rationale
You don't pay Opus prices to write boilerplate tests. You pay Opus to make judgment calls when something's stuck. The tiered model optimizes cost while maintaining quality at decision points.

---

## The Departments

### Preparation Department (THE CRITICAL ONE)
**This is the unsolved problem.**

- Context assembly for any project type
- Research, domain knowledge, constraint identification
- Output: Fully prepared context package

**Why it matters:** "Preparation IS the product. If prep is right, execution is almost mechanical."

**What needs solving:**
- How to prepare context for arbitrary project types?
- Domain-specific preparation modules?
- What goes in a "context package"?
- How to know when preparation is sufficient?

### R&D Department (Sub-department of Preparation)
- Handles raw/fuzzy ideas
- Compounding loop: generate variations → critique → synthesize → stress test
- Human checkpoint before proceeding (Human Sync)
- Output: Validated direction with alternatives documented

### Execution Department
- Actual building
- Fed by preparation, not starting cold
- Workers supervised by Foreman
- Output: Working code meeting spec

### Quality Department
- Testing, review, standards enforcement
- No spaghetti code rule lives here
- Gate before anything ships
- Output: Validated, tested, reviewed code

### Documentation Department
- Full docs as requirement, not afterthought
- Generated alongside code, not after
- Output: Complete documentation

---

## Hard Problems (Explicitly Unsolved)

These are left open for SIRK passes to address. Each pass should pick one or more and make concrete progress.

### 1. The Preparation Problem
How do you assemble the right context package for arbitrary project types? A React frontend needs different preparation than a Python data pipeline. What are the domain-specific modules? What's the preparation protocol?

### 2. Live Feedback Loop
Models need real-time information to self-correct. How do execution results flow back fast? Logs, test output, linting errors need tight feedback cycles. What's the infrastructure?

### 3. Learning System
The Forge must learn from what it does. What worked? What didn't? What patterns emerge? Database + embeddings? Graph structure? What's the storage and retrieval mechanism for accumulated wisdom?

### 4. Context Management
Context window is the hard constraint. Can't dump everything in. Must be selective. What's the injection strategy? How do you decide what's relevant? The Squire pattern (continuous thread, summarizing to backend) is one approach.

### 5. Tool Building
The Forge may need to build its own tools. Models that can create utilities for live feedback. Self-extending capability. What are the boundaries? What tools does it need to create?

### 6. Human Sync Protocol
When does the system surface uncertainties to the human? What triggers a Human Sync? What's the interface? "Clarifying session" needs concrete definition.

---

## Known Constraints (Non-Negotiables)

These emerged from real experience. Don't revisit them without strong evidence.

- **No .md file state management** - Doesn't scale, can't query, no semantics
- **Database-backed everything** - PostgreSQL + pgvector pattern proven
- **No unconstrained workers** - Cheap models need tight scope or they drift
- **No preparation skipping** - The prep IS the product
- **Human-in-the-loop is architectural** - Not fallback, design feature

---

## Execution Environment

The Forge runs in a Docker container called "the-forge" that provides a frictionless execution environment.

### Container Setup

**Location:** `~/projects/the-forge/`
```
the-forge/
├── Dockerfile           # Workshop image definition
├── docker-compose.yml   # Orchestration config
├── .env                 # API keys (gitignored)
└── README.md            # Usage documentation
```

**Pre-installed Tools:**
- Node.js 22 + npm + pnpm + TypeScript
- Python 3.12 + pip
- ripgrep, fd, fzf (fast search)
- Docker CLI (can build containers from within)
- PostgreSQL client, SQLite
- Git, curl, jq, tmux, vim
- Claude Code CLI

### Permissions Model

The container runs as user `forge` (UID 1000) with:
- Full sudo access (no password)
- Matching UID to host for volume permissions
- No sandbox restrictions

This eliminates the sudo friction that blocks normal Claude Code sessions.

### Volume Mounts

| Host Path | Container Path | Purpose |
|-----------|---------------|---------|
| ~/projects | /workspace/projects | All project files |
| ~/.ssh | /home/forge/.ssh (ro) | SSH keys for Mandrel |
| ~/.gitconfig | /home/forge/.gitconfig (ro) | Git identity |
| /var/run/docker.sock | /var/run/docker.sock | Docker-in-Docker |

### Usage

```bash
# Start the workshop (if not running)
cd ~/projects/the-forge && docker compose up -d

# Run Claude Code in the workshop
forge-claude

# Run any command in workshop
forge <command>
forge bash                    # Interactive shell
forge npm test                # Run tests
forge ssh hetzner '...'       # Access Mandrel VPS
```

### Mandrel Access

From inside the container, Mandrel tools are accessed via SSH:
```bash
ssh hetzner 'curl -s -X POST http://localhost:8080/mcp/tools/<tool_name> \
  -H "Content-Type: application/json" \
  -d '\''{"arguments": {<params>}}'\'''
```

### Network

Container uses host network mode - full network access, SSH works naturally.

### Lifecycle

```bash
docker compose up -d      # Start
docker compose stop       # Stop (preserves state)
docker compose down       # Remove container
docker compose down -v    # Full reset (removes volumes)
```

### Portability

The Dockerfile + docker-compose.yml can be moved to any machine with Docker:
- Local development machine
- Hetzner VPS
- Any cloud provider
- Another developer's machine

The capability travels. Work product stays in git/mounted volumes.

---

## SIRK Pass Protocol

Each pass through this document should:

### 1. Read Everything First
Read all previous passes completely. Understand what's been established, what's been tried, what failed.

### 2. Critical Evaluation
Don't accept previous work uncritically. Look for:
- Assumptions that weren't tested
- Edge cases not considered
- Simpler approaches overlooked
- Contradictions between sections

### 3. Pick a Problem
Choose one or more Hard Problems to address. Make concrete progress:
- Propose specific solutions
- Identify sub-problems
- Design testable experiments
- Write pseudo-code or schemas

### 4. Find Edge Cases
What did previous passes miss? The most valuable contribution is often finding the gap in previous thinking.

### 5. Leave Clear Handoff
Document:
- What you contributed
- What you validated
- What you found problematic
- What the next pass should focus on

### 6. Don't Repeat
If previous passes covered something adequately, don't re-explain it. Build on it or challenge it.

---

## What Success Looks Like

After 10-15 SIRK passes, this document should contain:

1. **Concrete architecture** - Not concepts, but schemas, APIs, data flows
2. **Solved preparation problem** - At least for 2-3 project types
3. **Defined feedback loops** - Specific infrastructure
4. **Learning system design** - Storage + retrieval + accumulation
5. **Human Sync protocol** - When, what, how
6. **Implementation phases** - Ordered, testable steps
7. **Validation criteria** - How we know it works

---

## For Pass #1

You're the first pass after the seed. Your job:

1. **Validate the factory model** - Is the Plant Manager / Foreman / Worker hierarchy right? What's missing?

2. **Attack the Preparation Problem** - This is the hardest. What would a "context package" actually contain? Pick one project type (e.g., "add feature to existing codebase") and design the preparation protocol.

3. **Find what I missed** - I wrote this seed from emergence-notes and Keymaker patterns. What edge cases or failure modes did I not capture?

4. **Be concrete** - If you propose something, make it specific enough to implement or test.

Don't try to solve everything. Pick 1-2 areas and go deep. Leave the rest for future passes.

---

## Lineage

- **Seed Author:** Claude Opus 4.5, January 2026
- **Context Sources:** emergence-notes (33 instances), Keymaker (26+ instances), THE-FORGE-2-0-IDEA.md
- **Pass Count:** 0 (this is the seed)

---

*The Forge is infrastructure for compound thinking. Each pass compounds on previous passes. The document evolves toward implementation through disciplined iteration.*
