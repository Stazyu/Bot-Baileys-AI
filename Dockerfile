# ===== BASE BUILD (heavy, temporary) =====
FROM node:20-bookworm AS builder

RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    libvips-dev \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.33.4 --activate

WORKDIR /app

# Copy only deps first (cache friendly)
COPY package.json pnpm-lock.yaml ./

# builder stage
RUN pnpm install --frozen-lockfile

# 🔥 WAJIB: rebuild sharp di environment Linux
RUN pnpm rebuild sharp

# Copy source
COPY . .

ENV DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public"

# Prisma generate (build-time only)
RUN npx prisma generate

# Build app
RUN pnpm build

# 🔥 buang dev deps
RUN pnpm prune --prod


# ===== RUNTIME (super clean & kecil) =====
FROM node:20-bookworm-slim

WORKDIR /app

# install only runtime deps (tanpa build tools)
RUN apt-get update && apt-get install -y \
    libvips \
    openssl \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# copy hasil final saja
COPY --from=builder /app ./

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
