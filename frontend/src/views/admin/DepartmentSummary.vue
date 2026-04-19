<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="dept-summary">
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>部门用量汇总</span>
          <template v-if="workingHoursEnabled">
            <el-radio-group v-model="timeFilter" data-testid="dept-time-filter" size="small" @change="fetchData">
            <el-radio-button value="all">全天</el-radio-button>
            <el-radio-button value="work">工作时段</el-radio-button>
            <el-radio-button value="non_work">非工作时段</el-radio-button>
          </el-radio-group>
          </template>
          <el-tag v-else type="info" size="small" style="cursor:default">全天</el-tag>
        </div>
      </template>
      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="enterprise" label="部门" />
        <el-table-column prop="user_count" label="用户数" sortable width="100" />
        <el-table-column label="月 Token" sortable prop="monthly_token">
          <template #default="{ row }">
            {{ (row.monthly_token / 1000).toFixed(1) }}K
          </template>
        </el-table-column>
        <el-table-column prop="monthly_requests" label="月请求数" sortable width="110" />
        <el-table-column prop="monthly_chats" label="月对话轮次" sortable width="120" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/api'

interface DeptRow {
  enterprise: string
  user_count: number
  monthly_token: number
  monthly_requests: number
  monthly_chats: number
  avg_token_per_user: number
}

const timeFilter = ref('all')
const workingHoursEnabled = ref(true)
const rows = ref<DeptRow[]>([])
const loading = ref(false)

async function fetchData() {
  loading.value = true
  try {
    const { data } = await api.get<DeptRow[]>(`/admin/departments?time_filter=${timeFilter.value}`)
    rows.value = data
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  try {
    const { data: whCfg } = await api.get('/metrics/working-hours-config')
    workingHoursEnabled.value = whCfg.enabled
    if (!whCfg.enabled) timeFilter.value = 'all'
  } catch {}
  fetchData()
})
</script>
