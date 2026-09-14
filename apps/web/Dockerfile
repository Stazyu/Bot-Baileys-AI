# ===== BUILD (Vite → static dist) =====
FROM node:24-bookworm AS builder

RUN corepack enable

WORKDIR /app

# Deps dulu (cache friendly)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Source + build. build-only (= vite build) sengaja dipakai di image
# agar build hermetik — tanpa vue-tsc / playwright / vitest.
COPY . .

# Build-time only: di-embed ke bundle oleh Vite. Default = backend lokal.
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=${VITE_API_URL}

RUN pnpm build-only


# ===== RUNTIME (Caddy static + SPA fallback) =====
# CMD bawaan image sudah `caddy run --config /etc/caddy/Caddyfile
# --adapter caddyfile`, jadi tidak perlu dideklarasikan ulang.
FROM caddy:2-alpine AS runtime

COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=builder /app/dist /srv

EXPOSE 80
