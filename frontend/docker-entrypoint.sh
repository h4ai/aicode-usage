#!/bin/sh
# docker-entrypoint.sh — 运行时将后端地址写入 config.json
# 环境变量：
#   BACKEND_URL  — 后端地址，默认 http://backend:8002
#                  金融内网部署时改为实际后端 IP/域名

BACKEND_URL="${BACKEND_URL:-http://backend:8002}"

# 生成运行时配置文件，前端通过 /config.json 读取
cat > /app/dist/config.json <<EOF
{
  "backendUrl": "${BACKEND_URL}"
}
EOF

echo "[entrypoint] Backend URL: ${BACKEND_URL}"
echo "[entrypoint] Config written to /app/dist/config.json"

# 启动静态文件服务（serve -s = SPA 模式，单页应用 fallback）
exec serve -s /app/dist -l 3002
