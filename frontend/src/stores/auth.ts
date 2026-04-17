// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useAuthStore = defineStore('auth', () => {
  const token = ref<string | null>(localStorage.getItem('token'))
  const role = ref<string | null>(null)

  function setToken(t: string, r: string) {
    token.value = t
    role.value = r
    localStorage.setItem('token', t)
  }

  function logout() {
    token.value = null
    role.value = null
    localStorage.removeItem('token')
  }

  return { token, role, setToken, logout }
})
