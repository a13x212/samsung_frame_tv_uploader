# Pinned to the Node 22.x security release (keep in sync with .nvmrc)
FROM node:22.23.4-alpine AS base
WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────────────────────
# Build toolchain for native modules lives only in deps/builder, never in runner.
FROM base AS deps
RUN apk add --no-cache libc6-compat python3 make g++
COPY package*.json ./
RUN npm ci

# ─── Builder ──────────────────────────────────────────────────────────────────
FROM deps AS builder
COPY . .
RUN npm run build

# ─── Runner ───────────────────────────────────────────────────────────────────
# Clean base: no compiler toolchain. No libc6-compat either: sharp ships
# linuxmusl prebuilds and Next's runtime uses @next/swc-linux-*-musl.
FROM node:22.23.4-alpine AS runner
ENV NODE_ENV=production

WORKDIR /app

# Copy only what's needed to run, owned by the unprivileged `node` user (uid 1000)
COPY --chown=node:node --from=deps /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/.next ./.next
COPY --chown=node:node package*.json server.ts tsconfig.json next.config.ts ./
COPY --chown=node:node src/server ./src/server
COPY --chown=node:node src/lib ./src/lib

# Runtime data directory (tokens are persisted via the tv-tokens volume).
# Owned by `node` in the image so a freshly created named volume inherits it.
RUN mkdir -p ./public /app/data && chown node:node /app ./public /app/data

USER node

EXPOSE 3000

CMD ["npm", "run", "start"]
