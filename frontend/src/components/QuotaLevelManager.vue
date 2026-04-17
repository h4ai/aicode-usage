<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <el-card class="quota-level-manager">
    <template #header>
      <span>配额级别管理</span>
    </template>
    <el-table :data="levels" v-loading="loading" border>
      <el-table-column prop="level" label="级别" width="100" />
      <el-table-column label="月度Token限额" min-width="180">
        <template #default="{ row }">
          <template v-if="editingLevel === row.level">
            <el-input-number
              v-model="editForm.monthly_token"
              :min="0"
              :step="1000000"
              controls-position="right"
              style="width: 100%"
            />
          </template>
          <template v-else>
            {{ formatNumber(row.monthly_token) }}
          </template>
        </template>
      </el-table-column>
      <el-table-column label="日请求上限" min-width="150">
        <template #default="{ row }">
          <template v-if="editingLevel === row.level">
            <el-input-number
              v-model="editForm.daily_requests"
              :min="0"
              :step="100"
              controls-position="right"
              style="width: 100%"
            />
          </template>
          <template v-else>
            {{ row.daily_requests }}
          </template>
        </template>
      </el-table-column>
      <el-table-column prop="user_count" label="当前人数" width="100" />
      <el-table-column label="操作" width="160">
        <template #default="{ row }">
          <template v-if="editingLevel === row.level">
            <el-button type="primary" size="small" @click="saveLevel(row.level)">
              保存
            </el-button>
            <el-button size="small" @click="cancelEdit">取消</el-button>
          </template>
          <template v-else>
            <el-button type="primary" size="small" @click="startEdit(row)">
              编辑
            </el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

interface QuotaLevel {
  level: string
  monthly_token: number
  daily_requests: number
  user_count: number
}

const levels = ref<QuotaLevel[]>([])
const loading = ref(false)
const editingLevel = ref<string | null>(null)
const editForm = ref({ monthly_token: 0, daily_requests: 0 })

function formatNumber(n: number): string {
  return n.toLocaleString()
}

async function fetchLevels() {
  loading.value = true
  try {
    const { data } = await api.get<QuotaLevel[]>('/admin/quota-levels')
    levels.value = data
  } finally {
    loading.value = false
  }
}

function startEdit(row: QuotaLevel) {
  editingLevel.value = row.level
  editForm.value = {
    monthly_token: row.monthly_token,
    daily_requests: row.daily_requests,
  }
}

function cancelEdit() {
  editingLevel.value = null
}

async function saveLevel(level: string) {
  try {
    await api.put(`/admin/quota-levels/${level}`, editForm.value)
    ElMessage.success('保存成功')
    editingLevel.value = null
    await fetchLevels()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail ?? '保存失败')
  }
}

onMounted(fetchLevels)
</script>

<style scoped>
.quota-level-manager {
  margin-bottom: 20px;
}
</style>
