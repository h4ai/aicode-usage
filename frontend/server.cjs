// server.js — 替代 nginx 的 Node.js 静态文件服务 + API 反向代理
// 功能等价于原 nginx.conf：
//   - /api/ → proxy to backend (Docker 内部网络解析)
//   - /health → proxy to backend
//   - 其他 → 静态文件 + SPA fallback

const express = require('express')
const { createProxyMiddleware } = require('http-proxy-middleware')
const path = require('path')
const fs = require('fs')

const BACKEND_URL = process.env.BACKEND_URL || 'http://backend:8002'
const PORT = parseInt(process.env.PORT || '3002', 10)
const DIST_DIR = path.join(__dirname, 'dist')

const app = express()

// 写入 config.json（前端读取，backendUrl 置空表示使用相对路径）
// 相对路径 /api 由本 server 代理，不需要暴露后端地址给浏览器
fs.writeFileSync(
  path.join(DIST_DIR, 'config.json'),
  JSON.stringify({ backendUrl: '' })
)
console.log(`[server] Backend proxy target: ${BACKEND_URL}`)
console.log(`[server] config.json written (backendUrl: '' — using relative path)`)

// 反向代理：/api/ 和 /health → backend
const proxyOptions = {
  target: BACKEND_URL,
  changeOrigin: true,
  on: {
    error: (err, req, res) => {
      console.error(`[proxy] Error: ${err.message}`)
      res.status(502).json({ error: 'Backend unavailable' })
    }
  }
}

app.use('/api', createProxyMiddleware(proxyOptions))
app.use('/health', createProxyMiddleware(proxyOptions))

// 静态文件
app.use(express.static(DIST_DIR))

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(DIST_DIR, 'index.html'))
})

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Listening on port ${PORT}`)
})
