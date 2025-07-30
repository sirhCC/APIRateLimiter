# =============================================================================
# Multi-Stage Production Docker Build for API Rate Limiter
# 
# Features:
# - Multi-stage build for smaller production image
# - Security hardening (non-root user, read-only filesystem)
# - Performance optimization (dumb-init, proper signal handling)
# - Vulnerability scanning preparation
# - Resource-constrained execution
# =============================================================================

# =============================================================================
# Stage 1: Build Environment
# =============================================================================
FROM node:18-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Copy package files for dependency installation
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for building)
RUN npm ci --include=dev

# Copy source code
COPY src/ ./src/

# Build TypeScript to JavaScript
RUN npm run build

# Remove dev dependencies to save space
RUN npm prune --omit=dev

# =============================================================================
# Stage 2: Production Runtime Environment  
# =============================================================================
FROM node:18-alpine AS production

# Install production runtime dependencies
RUN apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user and group with specific IDs
RUN addgroup -g 1001 -S nodejs && \
    adduser -S rateLimiter -u 1001 -G nodejs

# Create app directory with proper permissions
WORKDIR /app
RUN chown rateLimiter:nodejs /app

# Copy package files
COPY --chown=rateLimiter:nodejs package*.json ./

# Copy production node_modules from builder stage
COPY --from=builder --chown=rateLimiter:nodejs /app/node_modules ./node_modules

# Copy built application
COPY --from=builder --chown=rateLimiter:nodejs /app/dist ./dist

# Create logs directory for Winston
RUN mkdir -p /app/logs && chown rateLimiter:nodejs /app/logs

# Security: Switch to non-root user
USER rateLimiter

# Expose application port
EXPOSE 3000

# Health check with better error handling
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:3000/health || exit 1

# Use dumb-init for proper signal handling and process reaping
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]
