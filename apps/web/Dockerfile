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

# Build-time only: di-embed ke bundle oleh Vite. Default = backend compose lokal.
ARG VITE_API_URL=http://localhost:3001
ENV VITE_API_URL=${VITE_API_URL}

RUN pnpm build-only


# ===== RUNTIME (nginx static + SPA fallback) =====
FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80
