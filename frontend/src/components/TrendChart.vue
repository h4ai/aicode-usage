<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <el-card class="trend-chart" data-testid="trend-chart-card">
    <template #header>
      <div class="trend-header">
        <span>Token 趋势</span>
        <div class="trend-controls">
          <el-radio-group v-model="chartType" size="small">
            <el-radio-button value="bar">柱状图</el-radio-button>
            <el-radio-button value="line">折线图</el-radio-button>
          </el-radio-group>
          <el-radio-group v-model="rangeMode" size="small" @change="onRangeChange">
            <el-radio-button value="7">最近7天</el-radio-button>
            <el-radio-button value="30">最近30天</el-radio-button>
            <el-radio-button value="custom">自定义</el-radio-button>
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
            @change="fetchTrend"
          />
        </div>
      </div>
    </template>
    <div v-if="loading" v-loading="true" style="height: 320px" />
    <div v-else ref="chartRef" style="height: 320px" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, onBeforeUnmount } from 'vue'
const props = withDefaults(defineProps<{ timeFilter?: string }>(), { timeFilter: 'all' })
import * as echarts from 'echarts'
import api from '@/api'

interface TrendItem {
  date: string
  input_token: number
  output_token: number
  total_token: number
}

const chartType = ref<'bar' | 'line'>('bar')
const rangeMode = ref<'7' | '30' | 'custom'>('7')
const customRange = ref<[string, string] | null>(null)
const loading = ref(true)
const trendData = ref<TrendItem[]>([])
const chartRef = ref<HTMLElement | null>(null)
let chartInstance: echarts.ECharts | null = null

/** 禁用 90 天以前的日期 */
function disabledDate(date: Date): boolean {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  ninetyDaysAgo.setHours(0, 0, 0, 0)
  return date < ninetyDaysAgo || date > new Date()
}

function buildOption(): echarts.EChartsOption {
  const dates = trendData.value.map((d) => d.date)
  const inputTokens = trendData.value.map((d) => d.input_token)
  const outputTokens = trendData.value.map((d) => d.output_token)

  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['输入 Token', '输出 Token'] },
    xAxis: { type: 'category', data: dates },
    yAxis: { type: 'value' },
    series: [
      {
        name: '输入 Token',
        type: chartType.value,
        stack: 'total',
        data: inputTokens,
        itemStyle: { color: '#409EFF' },
      },
      {
        name: '输出 Token',
        type: chartType.value,
        stack: 'total',
        data: outputTokens,
        itemStyle: { color: '#67C23A' },
      },
    ],
  }
}

function renderChart() {
  if (!chartRef.value) return
  if (!chartInstance) {
    chartInstance = echarts.init(chartRef.value)
  }
  chartInstance.setOption(buildOption(), true)
}

async function fetchTrend() {
  if (chartInstance) {
    chartInstance.dispose()
    chartInstance = null
  }
  loading.value = true
  try {
    const params: Record<string, string> = { time_filter: props.timeFilter }
    if (rangeMode.value === 'custom' && customRange.value) {
      params.start = customRange.value[0]
      params.end = customRange.value[1]
    } else {
      params.days = rangeMode.value === '30' ? '30' : '7'
    }
    const { data } = await api.get<TrendItem[]>('/metrics/trend', { params })
    trendData.value = data
  } finally {
    loading.value = false
  }
  await nextTick()
  renderChart()
}

function onRangeChange() {
  if (rangeMode.value !== 'custom') {
    fetchTrend()
  }
}

watch(chartType, () => {
  renderChart()
})

onMounted(fetchTrend)
watch(() => props.timeFilter, fetchTrend)

onBeforeUnmount(() => {
  chartInstance?.dispose()
})
</script>

<style scoped>
.trend-chart {
  margin-bottom: 16px;
}

.trend-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.trend-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
