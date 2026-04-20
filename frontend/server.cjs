// server.cjs — 替代 nginx 的 Node.js 静态文件服务 + API 反向代理
// 使用 http-proxy-middleware v2（稳定版，无破坏性 API 变更）
// 功能等价于原 nginx.conf：
//   - /api/* → proxy to backend
//   - /health → proxy to backend
//   - 其他  → 静态文件 + SPA fallback

const express = require('express')
const { createProxyMiddleware } = require('http-proxy-middleware')
const path = require('path')
const fs = require('fs')

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8002'
const PORT = parseInt(process.env.PORT || '3002', 10)
const DIST_DIR = path.join(__dirname, 'dist')

const app = express()

// 写入 config.json（前端用空字符串 = 相对路径，由本 server 代理）
fs.writeFileSync(
  path.join(DIST_DIR, 'config.json'),
  JSON.stringify({ backendUrl: '' })
)
console.log(`[server] Backend proxy target: ${BACKEND_URL}`)

// http-proxy-middleware v2 API
const proxy = createProxyMiddleware({
  target: BACKEND_URL,
  changeOrigin: true,
  onError: (err, req, res) => {
    console.error(`[proxy] Error: ${err.message}`)
    res.status(502).json({ error: 'Backend unavailable' })
  }
})

app.use('/api', proxy)
app.use('/health', proxy)

// 静态文件
app.use(express.static(DIST_DIR))

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Listening on port ${PORT}`)
})
