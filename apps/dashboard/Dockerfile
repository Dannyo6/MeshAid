# ==============================================================================
# MeshAid Incident Dashboard - Multi-Stage Build
# Compiles Vite React output and serves via Nginx Alpine on ports 80/5173
# ==============================================================================

# Stage 1: Build & bundle Vite React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root workspace manifests
COPY package.json package-lock.json ./
COPY apps/dashboard/package.json apps/dashboard/

# Install dashboard dependencies
RUN npm ci --workspace=@meshaid/dashboard

# Copy dashboard source code
COPY apps/dashboard apps/dashboard

WORKDIR /app/apps/dashboard

# Build production bundle with TypeScript and Vite
RUN npm run build

# Stage 2: Production Nginx web server
FROM nginx:alpine AS runner

# Remove default nginx static web pages
RUN rm -rf /usr/share/nginx/html/*

# Copy compiled static assets from builder stage
COPY --from=builder /app/apps/dashboard/dist /usr/share/nginx/html

# Copy custom Nginx configuration with reverse proxy for /api and /ws
COPY apps/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80 5173

# Zero-downtime healthcheck
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]
