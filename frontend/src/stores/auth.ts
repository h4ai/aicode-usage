// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const role = ref<string | null>(localStorage.getItem('role'))
  const username = ref<string | null>(localStorage.getItem('username'))

  function setToken(t: string, r: string, u?: string) {
    token.value = t
    role.value = r
    if (u) {
      username.value = u
      localStorage.setItem('username', u)
    }
    localStorage.setItem('token', t)
    localStorage.setItem('role', r)
  }

  function logout() {
    token.value = null
    role.value = null
    username.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('role')
    localStorage.removeItem('username')
  }

  return { token, role, username, setToken, logout }
})
