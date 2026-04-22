<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <el-card class="detail-table">
    <template #header>
      <div class="detail-header">
        <span>使用明细</span>
        <div class="detail-controls">
          <el-radio-group
            v-model="rangeMode"
            size="small"
            @change="onRangeChange"
          >
            <el-radio-button value="7">
              最近7天
            </el-radio-button>
            <el-radio-button value="30">
              最近30天
            </el-radio-button>
            <el-radio-button value="month">
              本月
            </el-radio-button>
            <el-radio-button value="custom">
              自定义
            </el-radio-button>
          </el-radio-group>
          <el-date-picker
            v-if="rangeMode === 'custom'"
            v-model="customRange"
            type="daterange"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            size="small"
            value-format="YYYY-MM-DD"
            :disabled-date="disabledDate"
            data-testid="detail-date-picker"
            @change="fetchDetail"
          />
          <el-button
            size="small"
            type="success"
            data-testid="detail-export-csv"
            @click="exportCsv"
          >
            导出CSV
          </el-button>
        </div>
      </div>
    </template>

    <el-table
      v-loading="loading"
      :data="pagedData"
      stripe
      :default-sort="{ prop: 'date', order: 'descending' }"
      @sort-change="onSortChange"
    >
      <el-table-column
        prop="date"
        label="日期"
        sortable="custom"
        width="120"
      />
      <el-table-column
        prop="model"
        label="模型"
        sortable="custom"
        min-width="160"
      />
      <el-table-column
        prop="request_count"
        label="对话轮次"
        sortable="custom"
        width="110"
        align="right"
      />
      <el-table-column
        prop="input_token"
        label="输入Token"
        sortable="custom"
        width="120"
        align="right"
      >
        <template #default="{ row }">
          {{ formatNum(row.input_token) }}
        </template>
      </el-table-column>
      <el-table-column
        prop="output_token"
        label="输出Token"
        sortable="custom"
        width="120"
        align="right"
      >
        <template #default="{ row }">
          {{ formatNum(row.output_token) }}
        </template>
      </el-table-column>
      <el-table-column
        prop="total_token"
        label="总Token"
        sortable="custom"
        width="120"
        align="right"
      >
        <template #default="{ row }">
          {{ formatNum(row.total_token) }}
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="tableData.length"
        layout="total, sizes, prev, pager, next, jumper"
        small
        background
        @size-change="currentPage = 1"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
const props = withDefaults(defineProps<{ timeFilter?: string; userId?: string; initialStart?: string; initialEnd?: string }>(), { timeFilter: 'all', userId: '', initialStart: '', initialEnd: '' })
import api from '@/api'

interface DetailItem {
  date: string
  model: string
  request_count: number
  input_token: number
  output_token: number
  total_token: number
}

const loading = ref(true)
const tableData = ref<DetailItem[]>([])
const rangeMode = ref<'7' | '30' | 'month' | 'custom'>('month')
const customRange = ref<[string, string] | null>(null)
const sortBy = ref<string | null>(null)
const sortOrder = ref<string>('desc')

// 分页
const currentPage = ref(1)
const pageSize = ref(20)
const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return tableData.value.slice(start, start + pageSize.value)
})

function formatNum(n: number): string {
  return n.toLocaleString()
}

/** 禁用 90 天以前及未来的日期 */
function disabledDate(date: Date): boolean {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  ninetyDaysAgo.setHours(0, 0, 0, 0)
  return date < ninetyDaysAgo || date > new Date()
}

/** 构建当前查询参数（导出复用此函数保证一致性） */
function buildParams(): Record<string, string> {
  const params: Record<string, string> = { time_filter: props.timeFilter }
  if (props.userId) params.user_id = props.userId
  if (rangeMode.value === 'custom' && customRange.value) {
    params.start = customRange.value[0]
    params.end = customRange.value[1]
  } else if (rangeMode.value === 'month') {
    const now = new Date()
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    const fmt = (d: Date) => d.toISOString().slice(0, 10)
    params.start = fmt(firstDay)
    params.end = fmt(now)
  } else {
    params.days = rangeMode.value
  }
  if (sortBy.value) {
    params.sort_by = sortBy.value
    params.sort_order = sortOrder.value
  }
  return params
}

async function fetchDetail() {
  loading.value = true
  currentPage.value = 1
  try {
    const { data } = await api.get<DetailItem[]>('/metrics/detail', { params: buildParams() })
    tableData.value = data
  } finally {
    loading.value = false
  }
}

function onRangeChange() {
  if (rangeMode.value !== 'custom') {
    fetchDetail()
  }
}

function onSortChange({ prop, order }: { prop: string; order: string | null }) {
  if (!order) {
    sortBy.value = null
  } else {
    sortBy.value = prop
    sortOrder.value = order === 'ascending' ? 'asc' : 'desc'
  }
  fetchDetail()
}

function exportCsv() {
  // 导出参数与页面显示完全一致
  const params = new URLSearchParams(buildParams() as Record<string, string>)
  const token = localStorage.getItem('token')
  const baseURL = api.defaults.baseURL || '/api'
  const url = `${baseURL}/metrics/export.csv?${params.toString()}`

  fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    .then((res) => {
      if (!res.ok) {
        return res.json().then((err: { detail?: string }) => {
          throw new Error(err.detail || '导出失败')
        })
      }
      return res.blob()
    })
    .then((blob) => {
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = 'usage_detail.csv'
      link.click()
      URL.revokeObjectURL(link.href)
    })
    .catch((err: Error) => {
      alert(err.message)
    })
}

onMounted(() => {
  if (props.initialStart && props.initialEnd) {
    rangeMode.value = 'custom'
    customRange.value = [props.initialStart, props.initialEnd]
  }
  fetchDetail()
})
watch(() => props.timeFilter, fetchDetail)
</script>

<style scoped>
.detail-table {
  margin-bottom: 16px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.detail-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.pagination-bar {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
