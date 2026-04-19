FROM node:22-alpine AS base

# Install build deps for sharp (native module)
RUN apk add --no-cache libc6-compat python3 make g++

WORKDIR /app

# ─── Dependencies ─────────────────────────────────────────────────────────────
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ─── Builder ──────────────────────────────────────────────────────────────────
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ─── Runner ───────────────────────────────────────────────────────────────────
FROM base AS runner
ENV NODE_ENV=production

WORKDIR /app

# Copy only what's needed to run
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
RUN mkdir -p ./public
COPY package*.json ./
COPY server.ts ./
COPY tsconfig.json ./
COPY next.config.ts ./
COPY src/server ./src/server
COPY src/lib ./src/lib

# Runtime data directory (tokens are persisted via Docker volume)
RUN mkdir -p /app/data

EXPOSE 3000

CMD ["npm", "run", "start"]
