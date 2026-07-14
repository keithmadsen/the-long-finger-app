# syntax=docker/dockerfile:1

# Multi-stage build: stage 1 installs deps + builds the web SPA; stage 2 ships a
# single image where Fastify serves the built SPA AND the API from one origin.
#
# node:24-slim (Debian/glibc) in BOTH stages: matches .nvmrc / engines>=24, and
# better-sqlite3 v12 ships prebuilt N-API binaries for Node 24 on glibc, so
# `npm ci` needs no C++ toolchain. Same base in both stages keeps the native
# better-sqlite3 binary copied across stages ABI/arch-compatible. (Do NOT switch
# to Alpine/musl — it lacks matching prebuilds. If a prebuilt binary is ever
# unavailable for the build arch, add `python3 make g++` to the builder stage.)

# ---- Stage 1: builder ---------------------------------------------------------
FROM node:24-slim AS builder
WORKDIR /app

# Copy manifests first so the npm ci layer caches across source-only changes.
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
COPY packages/contracts/package.json ./packages/contracts/package.json

# Full install (dev deps included): the web build needs Vite/tsc, and the
# runtime runs the API via tsx. .dockerignore keeps host node_modules out, so
# the native better-sqlite3 binary is built/fetched for the container arch.
RUN npm ci

# Copy the rest of the repo and build the web SPA → apps/web/dist.
COPY . .
RUN npm run build --workspace apps/web

# ---- Stage 2: runner ----------------------------------------------------------
FROM node:24-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080
ENV DATABASE_PATH=/data/todos.db

# Copy only what the runtime needs from the builder:
#   - node_modules: workspaces hoist to the root; the better-sqlite3 native
#     binary here was built for the container arch in stage 1.
#   - manifests, packages/contracts (TS source — consumed directly), apps/api
#     (TS source — run via tsx), apps/web/dist (the only web artifact needed).
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/packages/contracts ./packages/contracts
COPY --from=builder /app/apps/api ./apps/api
COPY --from=builder /app/apps/web/dist ./apps/web/dist

EXPOSE 8080

# SQLite durability across restarts (AC 5). connection.ts mkdir's the parent of
# DATABASE_PATH, so a fresh /data volume initialises cleanly and a reused volume
# retains todos.db (+ the *.db-wal / *.db-shm WAL sidecars). /data is created
# and chowned BEFORE VOLUME so a fresh named volume inherits node-ownership —
# required because the process runs as the non-root `node` user (uid 1000).
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]
USER node

# Orchestrator-facing liveness: Node 24's global fetch against the API's own
# /health route — node:24-slim ships no curl/wget, and this avoids adding one.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]

# Exec-form direct invocation so PID 1 is node itself (Story 3.5): npm as PID 1
# does not reliably forward SIGTERM, so `docker stop` used to wait the full 10s
# grace period and SIGKILL. `node --import tsx` is tsx v4's single-process
# loader form (the `tsx` bin would re-spawn node as a child — same problem).
# index.ts handles SIGTERM/SIGINT with app.close() (checkpoints the WAL) and is
# cwd-independent: webDist resolves via import.meta.url, DATABASE_PATH is
# absolute. tsx executes the TS source directly and resolves the @tlf/contracts
# TS-source workspace, so no api/contracts build step is needed.
CMD ["node", "--import", "tsx", "apps/api/src/index.ts"]
