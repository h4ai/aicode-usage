<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <div class="login-view">
    <el-card class="login-card">
      <template #header>
        <h2>AI Code Usage - 登录</h2>
      </template>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="0"
        @submit.prevent="handleLogin"
      >
        <el-form-item prop="username">
          <el-input
            v-model="form.username"
            placeholder="用户名"
            size="large"
          />
        </el-form-item>
        <el-form-item prop="password">
          <el-input
            v-model="form.password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            @keyup.enter="handleLogin"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            size="large"
            :loading="loading"
            style="width: 100%"
            @click="handleLogin"
          >
            登录
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()

const formRef = ref<FormInstance>()
const loading = ref(false)

const form = reactive({
  username: '',
  password: '',
})

const rules: FormRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleLogin() {
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid) return

  loading.value = true
  try {
    let data: { token: string; role: string }
    try {
      const resp = await api.post<{ token: string; role: string }>(
        '/auth/login',
        { username: form.username, password: form.password },
      )
      data = resp.data
    } catch (primaryErr: unknown) {
      // 如果 LDAP 不可用，尝试测试登录端点（开发/测试环境）
      const status = (primaryErr as { response?: { status?: number } }).response?.status
      if (status === 503 || status === 500) {
        const resp = await api.post<{ token: string; role: string }>(
          '/auth/test-login',
          { username: form.username, password: form.password },
        )
        data = resp.data
      } else {
        throw primaryErr
      }
    }
    auth.setToken(data.token, data.role)

    if (data.role === 'admin') {
      await router.push('/admin')
    } else {
      await router.push('/dashboard')
    }
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { detail?: string } } }).response?.data
        ?.detail ?? '登录失败，请重试'
    ElMessage.error(msg)
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background: #f0f2f5;
}

.login-card {
  width: 400px;
}

.login-card h2 {
  margin: 0;
  text-align: center;
}
</style>
