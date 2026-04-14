# ===== BASE =====
FROM node:20-bookworm-slim AS base

# Install system deps (WAJIB untuk native modules)
RUN apt-get update && apt-get install -y \
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
    wget \
    && rm -rf /var/lib/apt/lists/* \
    && wget http://security.debian.org/debian-security/pool/updates/main/o/openssl/libssl1.1_1.1.1w-0+deb11u1_amd64.deb \
    && dpkg -i libssl1.1_1.1.1w-0+deb11u1_amd64.deb \
    && rm libssl1.1_1.1.1w-0+deb11u1_amd64.deb

# Enable pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# ===== DEPENDENCIES =====
FROM base AS deps

# Copy lockfile dulu (penting untuk consistency)
COPY package.json pnpm-lock.yaml ./

# Install deps (pakai cache biar cepat)
RUN pnpm install --frozen-lockfile --ignore-scripts=false

# ===== BUILD =====
FROM base AS build

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Set dummy DATABASE_URL for Prisma client generation (types only, no connection needed)
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public"

RUN pnpm prisma:generate
RUN pnpm build

# ===== RUN =====
FROM node:20-bookworm-slim

WORKDIR /app

# Copy hasil build + deps saja (image jadi kecil & clean)
COPY --from=build /app ./

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
