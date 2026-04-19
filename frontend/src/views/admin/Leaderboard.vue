<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="leaderboard">
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>用量排行榜</span>
          <div style="display:flex;gap:8px;align-items:center">
            <template v-if="workingHoursEnabled">
              <el-radio-group
                v-model="timeFilter"
                data-testid="leaderboard-time-filter"
                size="small"
                @change="fetchData"
              >
                <el-radio-button value="all">
                  全天
                </el-radio-button>
                <el-radio-button value="work">
                  工作时段
                </el-radio-button>
                <el-radio-button value="non_work">
                  非工作时段
                </el-radio-button>
              </el-radio-group>
            </template>
            <el-tag
              v-else
              type="info"
              size="small"
              style="cursor:default"
            >
              全天
            </el-tag>
            <el-select
              v-model="top"
              style="width:100px"
              @change="fetchData"
            >
              <el-option
                label="Top 10"
                :value="10"
              />
              <el-option
                label="Top 20"
                :value="20"
              />
              <el-option
                label="Top 50"
                :value="50"
              />
            </el-select>
          </div>
        </div>
      </template>
      <el-table
        v-loading="loading"
        :data="rows"
        stripe
      >
        <el-table-column
          label="排名"
          width="70"
        >
          <template #default="{ $index }">
            {{ $index + 1 }}
          </template>
        </el-table-column>
        <el-table-column
          prop="display_name"
          label="姓名"
        />
        <el-table-column
          prop="enterprise"
          label="分组"
        />
        <el-table-column
          label="月 Token"
          prop="monthly_token"
          sortable
        >
          <template #default="{ row }">
            {{ (row.monthly_token / 1000).toFixed(1) }}K
          </template>
        </el-table-column>
        <el-table-column
          prop="monthly_requests"
          label="月请求数"
          sortable
          width="110"
        />
        <el-table-column
          prop="monthly_chats"
          label="月对话轮次"
          sortable
          width="120"
          align="right"
        />
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const rows = ref<any[]>([])
const loading = ref(false)
const timeFilter = ref('all')
const workingHoursEnabled = ref(true)
const top = ref(10)

async function fetchData() {
  loading.value = true
  try {
    const res = await fetch(`/api/admin/leaderboard?top=${top.value}&time_filter=${timeFilter.value}`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    })
    rows.value = await res.json()
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
