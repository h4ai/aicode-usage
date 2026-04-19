<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <el-card class="detail-table">
    <template #header>
      <div class="detail-header">
        <span>使用明细</span>
        <div class="detail-controls">
          <el-date-picker
            v-model="dateRange"
            data-testid="detail-date-picker"
            type="daterange"
            start-placeholder="开始日期"
            end-placeholder="结束日期"
            size="small"
            value-format="YYYY-MM-DD"
            :disabled-date="disabledDate"
            @change="onDateChange"
          />
          <el-input
            v-model="filterModel"
            placeholder="筛选模型"
            size="small"
            clearable
            style="width: 160px"
            @clear="onFilterChange"
            @keyup.enter="onFilterChange"
          />
          <el-input
            v-model="filterIdeType"
            placeholder="筛选IDE类型"
            size="small"
            clearable
            style="width: 160px"
            @clear="onFilterChange"
            @keyup.enter="onFilterChange"
          />
          <el-button size="small" @click="onFilterChange" data-testid="detail-query-btn">查询</el-button>
          <el-button size="small" type="success" @click="exportCsv" data-testid="detail-export-csv">导出CSV</el-button>
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
      <el-table-column prop="date" label="日期" sortable="custom" width="120" />
      <el-table-column prop="model" label="模型" sortable="custom" min-width="160" />
      <el-table-column prop="request_count" label="请求次数" sortable="custom" width="110" align="right" />
      <el-table-column prop="input_token" label="输入Token" sortable="custom" width="120" align="right">
        <template #default="{ row }">{{ formatNum(row.input_token) }}</template>
      </el-table-column>
      <el-table-column prop="output_token" label="输出Token" sortable="custom" width="120" align="right">
        <template #default="{ row }">{{ formatNum(row.output_token) }}</template>
      </el-table-column>
      <el-table-column prop="total_token" label="总Token" sortable="custom" width="120" align="right">
        <template #default="{ row }">{{ formatNum(row.total_token) }}</template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div class="pagination-bar">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[10, 20, 50]"
        :total="tableData.length"
        layout="total, sizes, prev, pager, next"
        small
        background
        @size-change="currentPage = 1"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
const props = withDefaults(defineProps<{ timeFilter?: string }>(), { timeFilter: 'all' })
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
const dateRange = ref<[string, string] | null>(null)
const filterModel = ref('')
const filterIdeType = ref('')
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

async function fetchDetail() {
  loading.value = true
  currentPage.value = 1
  try {
    const params: Record<string, string> = { time_filter: props.timeFilter }
    if (dateRange.value) {
      params.start = dateRange.value[0]
      params.end = dateRange.value[1]
    }
    if (filterModel.value) params.model = filterModel.value
    if (filterIdeType.value) params.ide_type = filterIdeType.value
    if (sortBy.value) {
      params.sort_by = sortBy.value
      params.sort_order = sortOrder.value
    }
    const { data } = await api.get<DetailItem[]>('/metrics/detail', { params })
    tableData.value = data
  } finally {
    loading.value = false
  }
}

function onDateChange() {
  fetchDetail()
}

function onFilterChange() {
  fetchDetail()
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
  const params = new URLSearchParams()
  if (dateRange.value) {
    params.set('start', dateRange.value[0])
    params.set('end', dateRange.value[1])
  }
  if (filterModel.value) params.set('model', filterModel.value)
  if (filterIdeType.value) params.set('ide_type', filterIdeType.value)
  params.set('time_filter', props.timeFilter)

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

onMounted(fetchDetail)
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
