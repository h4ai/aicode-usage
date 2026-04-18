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
      <div ref="chartEl" style="height:380px" />
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import * as echarts from 'echarts'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const chartEl = ref<HTMLElement>()
const groupBy = ref('')
let chart: echarts.ECharts | null = null

async function fetchData() {
  const url = groupBy.value
    ? `/api/admin/trend?group_by=${groupBy.value}`
    : '/api/admin/trend'
  const res = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
  const data = await res.json()

  if (!chart) chart = echarts.init(chartEl.value!)

  if (!groupBy.value) {
    chart.setOption({
      tooltip: { trigger: 'axis' },
      xAxis: { type: 'category', data: data.map((d: any) => d.date) },
      yAxis: { type: 'value', name: 'Token' },
      series: [{ name: 'Token', type: 'line', smooth: true, data: data.map((d: any) => d.total_token) }]
    })
  } else {
    // group_by: [{date, group, total_token}]
    const groups = [...new Set(data.map((d: any) => d.group))] as string[]
    const dates = [...new Set(data.map((d: any) => d.date))].sort() as string[]
    const series = groups.map(g => ({
      name: g,
      type: 'line',
      smooth: true,
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

onMounted(fetchData)
</script>
