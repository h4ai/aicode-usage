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
            <el-button
              size="small"
              :loading="exporting"
              @click="exportCsv"
            >
              导出 CSV
            </el-button>
          </div>
        </div>
      </template>
      <el-table
        v-loading="loading"
        :data="pagedRows"
        stripe
      >
        <el-table-column
          label="排名"
          width="70"
        >
          <template #default="{ $index }">
            {{ (currentPage - 1) * pageSize + $index + 1 }}
          </template>
        </el-table-column>
        <el-table-column
          prop="display_name"
          label="姓名"
        >
          <template #default="{ row }">
            <el-link
              type="primary"
              @click="openDetail(row)"
            >
              {{ row.display_name }}
            </el-link>
          </template>
        </el-table-column>
        <el-table-column
          prop="enterprise"
          label="分组"
        />
        <el-table-column
          label="Token 用量"
          prop="monthly_token"
          sortable
        >
          <template #default="{ row }">
            {{ (row.monthly_token / 1000).toFixed(1) }}K
          </template>
        </el-table-column>
        <el-table-column
          prop="monthly_chats"
          label="对话轮次"
          sortable
          width="120"
          align="right"
        />
        <el-table-column
          prop="monthly_requests"
          label="请求数"
          sortable
          width="110"
        />
      </el-table>
      <div style="margin-top:12px;display:flex;justify-content:flex-end">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[20, 50, 100]"
          :total="rows.length"
          layout="total, sizes, prev, pager, next"
          background
        />
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="`${detailUser.displayName} 使用明细`"
      width="80%"
      destroy-on-close
    >
      <DetailTable
        :time-filter="timeFilter"
        :user-id="detailUser.username"
        :initial-start="detailDateRange.start"
        :initial-end="detailDateRange.end"
      />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'
import DetailTable from '@/components/DetailTable.vue'

const auth = useAuthStore()
const rows = ref<any[]>([])
const loading = ref(false)
const exporting = ref(false)
const timeFilter = ref('all')
const workingHoursEnabled = ref(true)
const currentPage = ref(1)
const pageSize = ref(20)
const rangeMode = ref<'month' | '7' | '30' | 'custom'>('month')
const customRange = ref<[string, string] | null>(null)

const dialogVisible = ref(false)
const detailUser = reactive({ username: '', displayName: '' })

function openDetail(row: any) {
  detailUser.username = row.username
  detailUser.displayName = row.display_name || row.username
  dialogVisible.value = true
}

const detailDateRange = computed(() => _computeDateRange())

const pagedRows = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return rows.value.slice(start, start + pageSize.value)
})

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
    let url = `/api/admin/leaderboard?time_filter=${timeFilter.value}`
    if (start && end) url += `&start=${start}&end=${end}`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${auth.token}` }
    })
    rows.value = await res.json()
  } finally {
    loading.value = false
  }
}

async function exportCsv() {
  exporting.value = true
  try {
    const { start, end } = _computeDateRange()
    let url_path = `/api/admin/leaderboard/export-csv?top=500&time_filter=${timeFilter.value}`
    if (start && end) url_path += `&start=${start}&end=${end}`
    const resp = await fetch(url_path, {
      headers: { Authorization: `Bearer ${auth.token}` }
    })
    const blob = await resp.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const suffix = start && end ? `${start}_${end}` : new Date().toISOString().slice(0, 10)
    a.download = `leaderboard_export_${suffix}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    console.error('导出失败')
  } finally {
    exporting.value = false
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
