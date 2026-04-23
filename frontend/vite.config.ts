import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import * as http from 'node:http'

const version = (() => {
  try { return readFileSync(resolve(__dirname, 'VERSION'), 'utf-8').trim() } catch {
    try { return readFileSync(resolve(__dirname, '../VERSION'), 'utf-8').trim() } catch { return 'dev' }
  }
})()

const keepAliveAgent = new http.Agent({ keepAlive: true, family: 4 })

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3002,
    proxy: {
      '/api': {
        target: 'http://172.23.0.3:8002',
        changeOrigin: true,
        agent: keepAliveAgent,
      },
      '/health': {
        target: 'http://172.23.0.3:8002',
        changeOrigin: true,
        agent: keepAliveAgent,
      },
    },
  },
})
