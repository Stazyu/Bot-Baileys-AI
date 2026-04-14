FROM node:20-bookworm-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    libjemalloc2 \
    git \
    python3 \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libvips-dev \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Enable pnpm + yarn (INI KUNCI FIX)
RUN corepack enable && \
    corepack prepare pnpm@latest --activate && \
    corepack prepare yarn@4.9.2 --activate

# Setup pnpm environment (fix ENOENT error)
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

# Fix permission store (penting banget)
RUN mkdir -p /pnpm/store && chmod -R 777 /pnpm

WORKDIR /app

# Copy dependency files dulu
COPY package.json ./
COPY pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install

# Copy source
COPY . .

# Build
RUN pnpm build

# Create sessions dir
RUN mkdir -p sessions

# Optional performance
ENV LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libjemalloc.so.2

CMD ["pnpm", "start"]
