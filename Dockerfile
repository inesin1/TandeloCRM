# Syntax=docker/dockerfile:1

# ------------------------------------------------------------------------------
# Stage 1: Base image with Node 26 and pnpm 12.8.1
# ------------------------------------------------------------------------------
FROM node:26-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@12.8.1 --activate
WORKDIR /app

# ------------------------------------------------------------------------------
# Stage 2: Builder image (compiles API and Web with Nx)
# ------------------------------------------------------------------------------
FROM base AS builder

# Install build essentials for native module compilation if required
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency configuration and lockfile
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./

# Install workspace dependencies deterministically
RUN pnpm install --frozen-lockfile

# Copy configuration and source files
COPY nx.json tsconfig.base.json eslint.config.mjs* vitest.config.mts* ./
COPY .release-please-manifest.json ./
COPY apps ./apps
COPY libs ./libs
COPY packages ./packages
COPY tools ./tools

# Build NestJS API and Angular Web application
RUN pnpm nx run-many -t build -p api web

# ------------------------------------------------------------------------------
# Stage 3: Dedicated tooling image for migrations and admin bootstrap
# ------------------------------------------------------------------------------
FROM builder AS tooling
WORKDIR /app
CMD ["pnpm", "db:migrate"]

# ------------------------------------------------------------------------------
# Stage 4: Production dependencies for API
# ------------------------------------------------------------------------------
FROM base AS api-deps
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/dist/apps/api/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

# ------------------------------------------------------------------------------
# Stage 5: Production API runtime (NestJS)
# ------------------------------------------------------------------------------
FROM node:26-bookworm-slim AS api
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy runtime node_modules with prebuilt native dependencies
COPY --from=api-deps --chown=node:node /app/node_modules ./node_modules
# Copy compiled API artifact
COPY --from=builder --chown=node:node /app/dist/apps/api ./

USER node
EXPOSE 3000

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["node", "main.js"]

# ------------------------------------------------------------------------------
# Stage 6: Production Web runtime (Nginx unprivileged)
# ------------------------------------------------------------------------------
FROM nginxinc/nginx-unprivileged:alpine AS web

COPY nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist/apps/web/browser /usr/share/nginx/html

EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/ || exit 1
