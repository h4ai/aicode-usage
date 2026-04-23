// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/dashboard',
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { public: true },
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/DashboardView.vue'),
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('@/views/AdminView.vue'),
      meta: { requiresAdmin: true },
    },
    {
      path: '/api-tokens',
      name: 'api-tokens',
      component: () => import('@/views/ApiTokens.vue'),
      meta: { requiresAuth: true },
    },
  ],
})

// 验证 token 是否仍然有效 — 用 /health 或 /api/auth/me，不依赖 ClickHouse
async function isTokenValid(token: string): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    return res.status !== 401
  } catch {
    return false
  }
}

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.public) return true

  if (!auth.token) {
    return { name: 'login' }
  }

  // 验证 token 有效性
  const valid = await isTokenValid(auth.token)
  if (!valid) {
    auth.logout()
    return { name: 'login' }
  }

  if (to.meta.requiresAdmin && auth.role !== 'admin') {
    return { name: 'dashboard' }
  }

  return true
})

export default router
