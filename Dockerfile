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
# pnpm-workspace.yaml is required for pnpm 10 allowBuilds config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

# Rebuild native modules for the current Linux platform
RUN pnpm rebuild sharp youtube-dl-exec

# Copy source
COPY . .

ENV DATABASE_URL="mongodb://localhost:27017/db"

# Prisma generate (build-time only)
RUN npx prisma generate

# Build app
RUN pnpm build

# Remove dev dependencies to slim down node_modules
RUN pnpm prune --prod


# ===== RUNTIME (super clean & kecil) =====
FROM node:20-bookworm-slim AS runtime

WORKDIR /app

# Install only runtime dependencies (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips \
    openssl \
    ffmpeg \
    tini \
    && rm -rf /var/lib/apt/lists/*

# Copy the compiled build output and production node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production

# 🔥 Auto-skip the 'dev' session when loading from DB.
# Override at runtime with -e EXCLUDE_SESSIONS="" or -e INCLUDE_SESSIONS="prod,staging"
ENV EXCLUDE_SESSIONS=dev

# Use tini as PID 1 for proper signal forwarding (SIGINT/SIGTERM)
ENTRYPOINT ["/usr/bin/tini", "--"]

# Default: run all non-dev sessions from DB
# Override at runtime:
#   docker run <image> npm run start:dev      -> only dev session
#   docker run <image> npm run start:new -- --session=foo --force-clear
CMD ["node", "dist/index.js"]
