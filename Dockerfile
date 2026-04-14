# ===== BASE =====
FROM node:20-bookworm AS base

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
    openssl \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# ===== DEPENDENCIES =====
FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# ===== BUILD =====
FROM base AS build

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV DATABASE_URL="postgresql://user:password@localhost:5432/db?schema=public"

# 🔥 penting: generate sesuai openssl 3
RUN npx prisma generate

RUN pnpm build

# ===== RUN =====
FROM base AS runner

WORKDIR /app

COPY --from=build /app ./

ENV NODE_ENV=production

CMD ["node", "dist/index.js"]
