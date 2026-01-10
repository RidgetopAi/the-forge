# THE FORGE - Development Cognition Workshop
# A fully-equipped execution environment for AI-assisted development

FROM ubuntu:24.04

LABEL maintainer="ridgetop"
LABEL description="The Forge workshop - privileged execution environment"
LABEL version="1.0"

# Prevent interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=America/Chicago

# Core system packages
RUN apt-get update && apt-get install -y \
    # Essentials
    curl \
    wget \
    git \
    sudo \
    unzip \
    zip \
    jq \
    # Build tools
    build-essential \
    cmake \
    pkg-config \
    # Networking
    openssh-client \
    netcat-openbsd \
    dnsutils \
    # Search/navigation (the good ones)
    ripgrep \
    fd-find \
    fzf \
    tree \
    # Editors (for quick fixes)
    vim \
    nano \
    # Process management
    htop \
    tmux \
    # Python
    python3 \
    python3-pip \
    python3-venv \
    # Database clients
    postgresql-client \
    sqlite3 \
    # Misc utilities
    ca-certificates \
    gnupg \
    lsb-release \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22.x (LTS)
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm (fast, efficient package manager)
RUN npm install -g pnpm

# Install common global Node tools
RUN npm install -g \
    typescript \
    tsx \
    @anthropic-ai/claude-code \
    @sourcegraph/amp \
    nodemon \
    prettier \
    eslint

# Install Docker CLI (for building containers from within)
RUN curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list \
    && apt-get update \
    && apt-get install -y docker-ce-cli \
    && rm -rf /var/lib/apt/lists/*

# Repurpose ubuntu user (UID 1000) as forge for volume permission compatibility
# Ubuntu base image already has UID 1000 as 'ubuntu'
RUN usermod -l forge -d /home/forge -m ubuntu \
    && groupmod -n forge ubuntu \
    && echo "forge ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers

# Setup SSH directory for Mandrel/VPS access
RUN mkdir -p /home/forge/.ssh \
    && chmod 700 /home/forge/.ssh \
    && chown -R forge:forge /home/forge/.ssh

# Setup workspace directory
RUN mkdir -p /workspace \
    && chown -R forge:forge /workspace

# Python packages (commonly needed)
RUN pip3 install --break-system-packages \
    httpx \
    requests \
    pyyaml \
    python-dotenv \
    rich \
    typer

# Set default user (can override with --user root if needed)
USER forge
WORKDIR /workspace

# Default shell with good defaults
ENV SHELL=/bin/bash
ENV TERM=xterm-256color

# Keep container running for exec access
CMD ["tail", "-f", "/dev/null"]
