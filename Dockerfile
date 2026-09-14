# ===== BASE BUILD (heavy, temporary) =====
FROM node:24-bookworm AS builder

RUN apt-get update && apt-get install -y \
    python3 \
    build-essential \
    libvips-dev \
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

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


# ===== RUNTIME (super clean & minimal) =====
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

# Install only runtime dependencies (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    libvips \
    openssl \
    ffmpeg \
    tini \
    && rm -rf /var/lib/apt/lists/*

RUN python3 -m venv /opt/gallery-dl \
    && /opt/gallery-dl/bin/pip install --no-cache-dir --upgrade pip gallery-dl \
    && /opt/gallery-dl/bin/pip install --no-cache-dir --upgrade --pre "yt-dlp[default]"

ENV PATH="/opt/gallery-dl/bin:${PATH}"

# Copy the compiled build output and production node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production

# Dashboard API (Fastify, same process as the bot). Port follows $PORT (default 3001).
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# ─── Session autoload filter ─────────────────────────────────────────
# Default: load ALL sessions that have credentials in the DB (dashboard lists all).
# To restrict, set at runtime (never bake into the image):
#   docker run -e INCLUDE_SESSIONS="prod" ...        (prod only)
#   docker run -e EXCLUDE_SESSIONS="dev" ...         (everything except dev)
# ─── Instagram Cookies (yt-dlp) ──────────────────────────────────────
# On Coolify / Docker, mount cookies.txt as a file mount:
#   Host path:  /var/coolify/cookies.txt (or the path of your uploaded file)
#   Container:  /app/cookies.txt
# Then set the env var:
#   INSTAGRAM_DL_COOKIES=/app/cookies.txt
# Or set the default path right here:
ENV INSTAGRAM_DL_COOKIES=/app/cookies.txt

# Use tini as PID 1 for proper signal forwarding (SIGINT/SIGTERM)
ENTRYPOINT ["/usr/bin/tini", "--"]

# Default: run all non-dev sessions from DB
# Override at runtime:
#   docker run <image> npm run start:dev      -> only dev session
#   docker run <image> npm run start:new -- --session=foo --force-clear
CMD ["node", "dist/index.js"]
