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


# ===== RUNTIME (vite preview serve dist — tanpa nginx, Traefik yang proxy) =====
FROM node:24-bookworm-slim AS runtime

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules

ENV NODE_ENV=production

EXPOSE 4173

# --host wajib (default localhost tidak reachable dari luar container).
# Panggil biner vite langsung — `pnpm` di image slim hanya shim corepack
# yang gagal resolve (Cannot find module '/app/pnpm').
CMD ["./node_modules/.bin/vite", "preview", "--host", "0.0.0.0", "--port", "4173", "--strictPort"]
