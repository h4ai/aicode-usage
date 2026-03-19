########################################################
# Enterprise SkillHub — Multi-stage Dockerfile
# Stage 1: Build | Stage 2: Production
########################################################

# ========================
# Stage 1: Build
# ========================
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Copy package files first (Docker layer cache optimization)
COPY package.json package-lock.json ./
COPY prisma/ ./prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci --no-audit --no-fund

# Generate Prisma client
RUN npx prisma generate

# Copy source code
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src/ ./src/

# Build
RUN npm run build

# Prune devDependencies
RUN npm prune --production

# ========================
# Stage 2: Production
# ========================
FROM node:20-alpine AS production

# Security: non-root user
RUN addgroup -g 1000 -S skillhub && \
    adduser -u 1000 -S skillhub -G skillhub

WORKDIR /app

# Install runtime dependencies only
RUN apk add --no-cache tini dumb-init curl

# Copy built artifacts from builder
COPY --from=builder --chown=skillhub:skillhub /app/dist ./dist
COPY --from=builder --chown=skillhub:skillhub /app/node_modules ./node_modules
COPY --from=builder --chown=skillhub:skillhub /app/prisma ./prisma
COPY --from=builder --chown=skillhub:skillhub /app/package.json ./

# Environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health/live || exit 1

# Switch to non-root user
USER skillhub

# Use tini as init process (proper signal handling)
ENTRYPOINT ["tini", "--"]

# Start application
CMD ["node", "dist/main.js"]
