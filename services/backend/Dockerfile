# ==============================================================================
# MeshAid Gateway Backend Service - Multi-Stage Node 20 Alpine Build
# Compiles TypeScript and serves dist/server.js on port 3000
# ==============================================================================

# Stage 1: Build & compilation stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package.json package-lock.json ./
COPY packages/protocol/package.json packages/protocol/
COPY services/backend/package.json services/backend/

# Install workspace dependencies including devDependencies for build
RUN npm ci --workspace=@meshaid/protocol --workspace=@meshaid/backend

# Copy source trees
COPY packages/protocol packages/protocol
COPY services/backend services/backend

# Compile protocol library and backend service
RUN npm run build --workspace=@meshaid/protocol
RUN npm run build --workspace=@meshaid/backend

# Stage 2: Production runtime stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copy root workspace manifests for production install
COPY package.json package-lock.json ./
COPY packages/protocol/package.json packages/protocol/
COPY services/backend/package.json services/backend/

# Install only production dependencies
RUN npm ci --omit=dev --workspace=@meshaid/protocol --workspace=@meshaid/backend

# Copy compiled artifacts from builder stage
COPY --from=builder /app/packages/protocol/dist packages/protocol/dist
COPY --from=builder /app/packages/protocol/src packages/protocol/src
COPY --from=builder /app/services/backend/dist services/backend/dist

# Setup data persistence directory for SQLite / telemetry store
RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

WORKDIR /app/services/backend

# Zero-downtime healthcheck
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/server.js"]
