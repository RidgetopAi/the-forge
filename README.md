# The Forge - Workshop Container

A fully-equipped execution environment for AI-assisted development.

## Quick Start

```bash
# 1. Setup environment
cp .env.example .env
# Edit .env with your API keys

# 2. Build the container
docker compose build

# 3. Start the workshop
docker compose up -d

# 4. Get a shell inside
docker compose exec forge bash

# 5. Or run commands directly
docker compose exec forge node --version
docker compose exec forge claude-code --help
```

## What's Inside

**Languages:**
- Node.js 22.x + npm + pnpm
- Python 3 + pip
- TypeScript + tsx

**Tools:**
- Git, curl, wget, jq
- ripgrep, fd, fzf (fast search)
- Docker CLI (build containers from within)
- PostgreSQL client, SQLite
- tmux, vim, nano

**Pre-installed Node packages:**
- claude-code (Claude Code CLI)
- typescript, tsx
- nodemon, prettier, eslint

## Directory Structure

Inside the container:
```
/workspace/
└── projects/        # Mounted from ~/projects
    ├── the-forge/
    ├── ridge-control/
    ├── docs/
    └── ...
```

## Usage Patterns

### Interactive Shell
```bash
docker compose exec forge bash
cd /workspace/projects/your-project
# Full root access, all tools available
```

### Run Single Command
```bash
docker compose exec forge npm test
docker compose exec forge pnpm install
docker compose exec forge psql -h your-host -d your-db
```

### SSH to Mandrel VPS
```bash
docker compose exec forge ssh hetzner
# Works because ~/.ssh is mounted
```

### Run Claude Code
```bash
docker compose exec -it forge claude-code
# Or from specific directory
docker compose exec -w /workspace/projects/your-project forge claude-code
```

## Lifecycle

```bash
# Start
docker compose up -d

# Stop (preserves container)
docker compose stop

# Remove (destroys container, keeps volumes)
docker compose down

# Full reset (destroys everything)
docker compose down -v
docker compose build --no-cache
docker compose up -d
```

## Customization

### Add More Tools
Edit `Dockerfile`, then:
```bash
docker compose build
docker compose up -d
```

### Add More Mounts
Edit `docker-compose.yml` volumes section.

### Resource Limits
Uncomment and adjust the `deploy.resources` section in `docker-compose.yml`.

## Portability

This entire setup moves with you:
```bash
# On new machine
git clone <your-repo>
cd the-forge
cp .env.example .env  # Add keys
docker compose up -d
# Identical environment, anywhere
```
