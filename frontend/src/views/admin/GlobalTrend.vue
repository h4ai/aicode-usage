<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="global-trend">
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <span>全局趋势</span>
          <div style="display:flex;gap:8px;align-items:center">
            <el-radio-group v-model="metricType" size="small" @change="renderChart">
              <el-radio-button value="token">Token 用量</el-radio-button>
              <el-radio-button value="chat">对话轮次</el-radio-button>
            </el-radio-group>
            <el-select v-model="groupBy" style="width:140px" size="small" @change="fetchData">
              <el-option label="按总量" value="" />
              <el-option label="按模型" value="model" />
              <el-option label="按部门" value="department" />
            </el-select>
          </div>
        </div>
      </template>
      <div v-if="loading" v-loading="true" style="height:380px" />
      <div v-else ref="chartEl" style="height:380px;width:100%" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const chartEl = ref<HTMLElement>()
const groupBy = ref('')
const metricType = ref<'token' | 'chat'>('token')
const loading = ref(false)
let chart: echarts.ECharts | null = null
let rawData: any[] = []

function handleResize() {
  chart?.resize()
}

function renderChart() {
  if (!chartEl.value) return
  if (!chart) {
    chart = echarts.init(chartEl.value)
  }

  const isChat = metricType.value === 'chat'
  const yName = isChat ? '对话轮次' : 'Token'

  if (!groupBy.value) {
    // 总量模式
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: rawData.map((d: any) => d.date) },
      yAxis: { type: 'value', name: yName },
      series: [{
        name: yName,
        type: 'line',
        smooth: true,
        areaStyle: {},
        data: rawData.map((d: any) => isChat ? d.chat_count : d.total_token),
      }],
    }, true)
  } else {
    // 分组模式
    const groups = [...new Set(rawData.map((d: any) => d.group))] as string[]
    const dates = [...new Set(rawData.map((d: any) => d.date))].sort() as string[]
    const series = groups.map(g => ({
      name: g,
      type: 'line',
      smooth: true,
      data: dates.map(date => {
        const row = rawData.find((d: any) => d.date === date && d.group === g)
        return row ? (isChat ? row.chat_count : row.total_token) : 0
      }),
    }))
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: groups },
      xAxis: { type: 'category', data: dates },
      yAxis: { type: 'value', name: yName },
      series,
    }, true)
  }
}

async function fetchData() {
  if (chart) {
    chart.dispose()
    chart = null
  }
  loading.value = true
  try {
    const url = groupBy.value
      ? `/api/admin/trend?group_by=${groupBy.value}`
      : '/api/admin/trend'
    const res = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    rawData = await res.json()
  } finally {
    loading.value = false
  }
  // nextTick equivalent: wait for v-else DOM to appear
  await new Promise(r => setTimeout(r, 0))
  renderChart()
}

onMounted(() => {
  fetchData()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chart = null
})
</script>
