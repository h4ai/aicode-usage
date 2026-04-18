<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="dept-summary">
    <el-card header="部门用量汇总">
      <el-table :data="rows" v-loading="loading" stripe>
        <el-table-column prop="enterprise" label="部门" />
        <el-table-column prop="user_count" label="用户数" sortable width="100" />
        <el-table-column label="月 Token" sortable prop="monthly_token">
          <template #default="{ row }">
            {{ (row.monthly_token / 1000).toFixed(1) }}K
          </template>
        </el-table-column>
        <el-table-column prop="monthly_requests" label="月请求数" sortable width="110" />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
const props = withDefaults(defineProps<{ timeFilter?: string }>(), { timeFilter: 'all' })
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const rows = ref<any[]>([])
const loading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const res = await fetch('/api/admin/departments', {
      headers: { Authorization: `Bearer ${auth.token}` }
    })
    rows.value = await res.json()
  } finally {
    loading.value = false
  }
})
</script>
