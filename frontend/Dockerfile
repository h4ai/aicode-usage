# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>
#
# 无 nginx 版本：适用于无法使用 nginx 的金融内网环境
# - 使用 node:22-alpine + serve 替代 nginx 做静态文件服务
# - 后端地址通过 /app/dist/config.json 运行时注入（不再硬编码在 nginx.conf）
# - API 反向代理由 serve + 环境变量 BACKEND_URL 配置

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN corepack enable && pnpm install --frozen-lockfile 2>/dev/null || npm install
COPY . .
RUN npm run build

# Stage 2: node serve (no nginx)
FROM node:22-alpine
RUN npm install -g serve@14

WORKDIR /app
COPY --from=builder /app/dist ./dist

# config.json 模板 — 运行时由 docker-compose 环境变量覆盖
# 或通过 volume mount 注入自定义 config.json
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 3002
ENTRYPOINT ["/docker-entrypoint.sh"]
