<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <el-card class="user-manager">
    <template #header>
      <span>用户管理</span>
    </template>
    <el-table :data="users" v-loading="loading" border>
      <el-table-column prop="display_name" label="显示名" min-width="120" />
      <el-table-column prop="user_id" label="userId" min-width="120" />
      <el-table-column prop="enterprise" label="部门" min-width="100" />
      <el-table-column label="当前级别" width="150">
        <template #default="{ row }">
          <el-select
            :model-value="row.quota_level"
            @change="(val: string) => changeLevel(row.user_id, val)"
            size="small"
          >
            <el-option label="L1" value="L1" />
            <el-option label="L2" value="L2" />
            <el-option label="L3" value="L3" />
          </el-select>
        </template>
      </el-table-column>
      <el-table-column prop="monthly_token" label="本月Token" min-width="120">
        <template #default="{ row }">
          {{ row.monthly_token.toLocaleString() }}
        </template>
      </el-table-column>
      <el-table-column prop="daily_requests" label="今日请求次数" min-width="120">
        <template #default="{ row }">
          {{ row.daily_requests.toLocaleString() }}
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

interface UserItem {
  user_id: string
  display_name: string
  enterprise: string
  quota_level: string
  monthly_token: number
  daily_requests: number
}

const users = ref<UserItem[]>([])
const loading = ref(false)

async function fetchUsers() {
  loading.value = true
  try {
    const { data } = await api.get<UserItem[]>('/admin/users')
    users.value = data
  } finally {
    loading.value = false
  }
}

async function changeLevel(userId: string, level: string) {
  try {
    await api.put(`/admin/users/${userId}/level`, { level })
    ElMessage.success('级别修改成功')
    await fetchUsers()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail ?? '修改失败')
  }
}

onMounted(fetchUsers)
</script>

<style scoped>
.user-manager {
  margin-bottom: 20px;
}
</style>
