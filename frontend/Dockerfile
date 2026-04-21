# SPDX-License-Identifier: Apache-2.0
# Stage 1: build
FROM node:22.14-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile 2>/dev/null || npm install
COPY . .
RUN npm run build

# Stage 2: node express server (no nginx)
# - /api/* 和 /health 反向代理到后端（由 BACKEND_URL 控制）
# - 其余请求服务静态文件 + SPA fallback
FROM node:22.14-alpine
WORKDIR /app

# 只安装生产依赖（express + http-proxy-middleware）
COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY server.cjs ./server.cjs

EXPOSE 3002
CMD ["node", "server.cjs"]
