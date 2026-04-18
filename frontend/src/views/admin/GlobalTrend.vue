<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="global-trend">
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span>全局 Token 趋势</span>
          <el-select v-model="groupBy" style="width:140px" @change="fetchData">
            <el-option label="按总量" value="" />
            <el-option label="按模型" value="model" />
            <el-option label="按部门" value="department" />
          </el-select>
        </div>
      </template>
      <div ref="chartEl" style="height:380px;width:100%" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import * as echarts from 'echarts'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const chartEl = ref<HTMLElement>()
const groupBy = ref('')
let chart: echarts.ECharts | null = null

function handleResize() {
  chart?.resize()
}

async function fetchData() {
  // 销毁旧实例，避免 Tab 切换时容器宽度为 0 导致图表压缩
  if (chart) {
    chart.dispose()
    chart = null
  }
  await nextTick()
  if (!chartEl.value) return

  chart = echarts.init(chartEl.value)

  const url = groupBy.value
    ? `/api/admin/trend?group_by=${groupBy.value}`
    : '/api/admin/trend'
  const res = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
  const data = await res.json()

  if (!groupBy.value) {
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: data.map((d: any) => d.date) },
      yAxis: { type: 'value', name: 'Token' },
      series: [{ name: 'Token', type: 'line', smooth: true, areaStyle: {},
        data: data.map((d: any) => d.total_token) }]
    })
  } else {
    const groups = [...new Set(data.map((d: any) => d.group))] as string[]
    const dates = [...new Set(data.map((d: any) => d.date))].sort() as string[]
    const series = groups.map(g => ({
      name: g, type: 'line', smooth: true,
      data: dates.map(date => {
        const row = data.find((d: any) => d.date === date && d.group === g)
        return row ? row.total_token : 0
      })
    }))
    chart.setOption({
      tooltip: { trigger: 'axis' },
      legend: { data: groups },
      xAxis: { type: 'category', data: dates },
      yAxis: { type: 'value', name: 'Token' },
      series
    })
  }
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
