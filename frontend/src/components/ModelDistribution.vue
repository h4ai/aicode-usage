<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <el-card class="model-distribution" data-testid="model-dist-card">
    <template #header>
      <div class="dist-header">
        <span>模型分布</span>
        <div class="dist-controls">
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
            @change="fetchData"
          />
        </div>
      </div>
    </template>
    <div v-if="loading" v-loading="true" style="height: 320px" />
    <div v-else ref="chartRef" style="height: 320px" />
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick, onBeforeUnmount, watch } from 'vue'
const props = withDefaults(defineProps<{ timeFilter?: string }>(), { timeFilter: 'all' })
import * as echarts from 'echarts'
import api from '@/api'

interface DistItem {
  model: string
  total_token: number
  percent: number
}

const rangeMode = ref<'7' | '30' | 'custom'>('30')
const customRange = ref<[string, string] | null>(null)
const loading = ref(true)
const distData = ref<DistItem[]>([])
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
  return {
    tooltip: {
      trigger: 'item',
      formatter: '{b}: {c} Token ({d}%)',
    },
    legend: {
      orient: 'vertical',
      left: 'left',
      top: 'middle',
    },
    series: [
      {
        type: 'pie',
        radius: ['40%', '70%'],
        center: ['60%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: {
          borderRadius: 6,
          borderColor: '#fff',
          borderWidth: 2,
        },
        label: {
          formatter: '{b}\n{d}%',
        },
        data: distData.value.map((d) => ({
          name: d.model,
          value: d.total_token,
        })),
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

async function fetchData() {
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
    const { data } = await api.get<DistItem[]>('/metrics/model-distribution', { params })
    distData.value = data
  } finally {
    loading.value = false
  }
  await nextTick()
  renderChart()
}

function onRangeChange() {
  if (rangeMode.value !== 'custom') {
    fetchData()
  }
}

onMounted(fetchData)
watch(() => props.timeFilter, fetchData)

onBeforeUnmount(() => {
  chartInstance?.dispose()
})
</script>

<style scoped>
.model-distribution {
  margin-bottom: 16px;
}

.dist-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.dist-controls {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
