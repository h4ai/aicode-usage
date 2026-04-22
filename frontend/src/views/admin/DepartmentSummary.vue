<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="dept-summary">
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>分组用量汇总</span>
          <div style="display:flex;gap:8px;align-items:center">
            <template v-if="workingHoursEnabled">
              <el-radio-group
                v-model="timeFilter"
                data-testid="dept-time-filter"
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
            <el-radio-group
              v-model="rangeMode"
              size="small"
              style="margin-left:8px"
              @change="onRangeModeChange"
            >
              <el-radio-button value="month">
                本月
              </el-radio-button>
              <el-radio-button value="7">
                近7天
              </el-radio-button>
              <el-radio-button value="30">
                近30天
              </el-radio-button>
              <el-radio-button value="custom">
                自定义
              </el-radio-button>
            </el-radio-group>
            <el-date-picker
              v-if="rangeMode === 'custom'"
              v-model="customRange"
              type="daterange"
              size="small"
              style="margin-left:8px;width:220px"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              @change="fetchData"
            />
          </div>
        </div>
      </template>
      <el-table
        v-loading="loading"
        :data="rows"
        stripe
      >
        <el-table-column
          prop="enterprise"
          label="分组"
        />
        <el-table-column
          prop="user_count"
          label="用户数"
          sortable
          width="100"
        />
        <el-table-column
          label="月 Token"
          sortable
          prop="monthly_token"
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
        />
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
const rangeMode = ref<'month' | '7' | '30' | 'custom'>('month')
const customRange = ref<[string, string] | null>(null)

function _computeDateRange(): { start: string | null; end: string | null } {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (rangeMode.value === '7') {
    return { start: fmt(new Date(today.getTime() - 6 * 86400000)), end: fmt(today) }
  } else if (rangeMode.value === '30') {
    return { start: fmt(new Date(today.getTime() - 29 * 86400000)), end: fmt(today) }
  } else if (rangeMode.value === 'custom' && customRange.value) {
    return { start: customRange.value[0], end: customRange.value[1] }
  }
  return { start: null, end: null }
}

function onRangeModeChange() {
  if (rangeMode.value !== 'custom') fetchData()
}

async function fetchData() {
  loading.value = true
  try {
    const { start, end } = _computeDateRange()
    let url = `/admin/departments?time_filter=${timeFilter.value}`
    if (start && end) url += `&start=${start}&end=${end}`
    const { data } = await api.get<DeptRow[]>(url)
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
