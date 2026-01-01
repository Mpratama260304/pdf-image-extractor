# Multi-stage Dockerfile for PDF Image Extractor
# Supports deployment on Railway, Render, PhalaCloud, and any Docker host

# ============================================
# Stage 1: Builder
# ============================================
FROM node:20-slim AS builder

# Install build dependencies for native modules (@napi-rs/canvas, argon2)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
COPY server/package*.json ./server/

# Install all dependencies (including devDependencies for build)
RUN npm ci
RUN cd server && npm ci

# Copy prisma schema and generate client
COPY server/prisma ./server/prisma
RUN cd server && npx prisma generate

# Copy source files
COPY . .

# Build frontend (Vite) and server (TypeScript)
RUN npm run build:client
RUN npm run build:server

# ============================================
# Stage 2: Production Runtime
# ============================================
FROM node:20-slim AS runtime

# Install runtime dependencies for native modules and PDF processing
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Required for @napi-rs/canvas
    libfontconfig1 \
    libfreetype6 \
    # Required for sharp/image processing (if used)
    libvips42 \
    # CA certificates for HTTPS
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy package files
COPY package*.json ./
COPY server/package*.json ./server/

# Install production dependencies only
RUN npm ci --omit=dev
RUN cd server && npm ci --omit=dev

# Copy prisma schema and generated client from builder
COPY --from=builder /app/server/prisma ./server/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy built artifacts
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server/dist ./server/dist

# Copy entrypoint script
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Create data directories and set permissions
RUN mkdir -p /data/storage /data/db && \
    chown -R appuser:nodejs /app /data

# Switch to non-root user
USER appuser

# Environment defaults
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV DATABASE_URL=file:/data/db/prod.db
ENV STORAGE_DIR=/data/storage

# Expose port (Railway/Render will use PORT env var)
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "fetch('http://localhost:${PORT:-3001}/api/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Start via entrypoint script (runs migrations then server)
ENTRYPOINT ["/app/docker-entrypoint.sh"]
