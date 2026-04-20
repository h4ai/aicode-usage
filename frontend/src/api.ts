// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

/**
 * API 客户端配置
 *
 * 后端地址优先级（由高到低）：
 *   1. /config.json 中的 backendUrl（运行时注入，适合内网部署）
 *   2. import.meta.env.VITE_BACKEND_URL（构建时环境变量）
 *   3. 默认值 '' (空字符串，使用相对路径，开发时 vite proxy 生效)
 *
 * 部署时通过 docker-entrypoint.sh 写入 /config.json，无需重新构建镜像。
 */

import axios from 'axios'
import { useAuthStore } from '@/stores/auth'

// 同步读取运行时配置（config.json 由容器启动时写入）
async function loadRuntimeConfig(): Promise<string> {
  try {
    const res = await fetch('/config.json', { cache: 'no-store' })
    if (res.ok) {
      const cfg = await res.json()
      if (cfg.backendUrl) return cfg.backendUrl.replace(/\/$/, '')
    }
  } catch {
    // config.json 不存在时使用 fallback（开发环境）
  }
  return import.meta.env.VITE_BACKEND_URL ?? ''
}

// 初始用相对路径，待 initApi() 调用后更新 baseURL
const api = axios.create({
  baseURL: (import.meta.env.VITE_BACKEND_URL ?? '') + '/api',
})

/**
 * 在 main.ts 中调用一次，读取 config.json 并更新 baseURL
 */
export async function initApi(): Promise<void> {
  const backendUrl = await loadRuntimeConfig()
  api.defaults.baseURL = backendUrl + '/api'
}

api.interceptors.request.use((config) => {
  const auth = useAuthStore()
  if (auth.token) {
    config.headers.Authorization = `Bearer ${auth.token}`
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const auth = useAuthStore()
      auth.logout()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

export default api
