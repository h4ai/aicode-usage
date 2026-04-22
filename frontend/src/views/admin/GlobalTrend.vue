<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="global-trend">
    <el-card>
      <template #header>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <span>全局趋势</span>
          <div style="display:flex;gap:8px;align-items:center">
            <el-radio-group
              v-model="metricType"
              size="small"
              @change="renderChart"
            >
              <el-radio-button value="token">
                Token 用量
              </el-radio-button>
              <el-radio-button value="chat">
                对话轮次
              </el-radio-button>
            </el-radio-group>
            <template v-if="workingHoursEnabled">
              <el-radio-group
                v-model="timeFilter"
                size="small"
                style="margin-right:4px"
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
              v-model="groupBy"
              style="width:140px"
              size="small"
              @change="fetchData"
            >
              <el-option
                label="按总量"
                value=""
              />
              <el-option
                label="按模型"
                value="model"
              />
              <el-option
                label="按分组"
                value="department"
              />
            </el-select>
            <el-radio-group
              v-model="rangeMode"
              size="small"
              style="margin-left:8px"
              @change="onRangeModeChange"
            >
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
      <div
        v-if="loading"
        v-loading="true"
        style="height:380px"
      ></div>
      <div
        v-else
        ref="chartEl"
        style="height:380px;width:100%"
      ></div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import api from '@/api'
import * as echarts from 'echarts'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const chartEl = ref<HTMLElement>()
const groupBy = ref('')
const timeFilter = ref('all')
const workingHoursEnabled = ref(true)
const metricType = ref<'token' | 'chat'>('token')
const loading = ref(false)
const rangeMode = ref<'7' | '30' | 'custom'>('30')
const customRange = ref<[string, string] | null>(null)
let chart: echarts.ECharts | null = null
let rawData: any[] = []

function _computeDateRange(): { start: string; end: string } {
  const today = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  if (rangeMode.value === '7') {
    return { start: fmt(new Date(today.getTime() - 6 * 86400000)), end: fmt(today) }
  } else if (rangeMode.value === '30') {
    return { start: fmt(new Date(today.getTime() - 29 * 86400000)), end: fmt(today) }
  } else if (customRange.value) {
    return { start: customRange.value[0], end: customRange.value[1] }
  }
  // fallback: last 30 days
  return { start: fmt(new Date(today.getTime() - 29 * 86400000)), end: fmt(today) }
}

function onRangeModeChange() {
  if (rangeMode.value !== 'custom') fetchData()
}

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
    const tf = timeFilter.value
    const { start, end } = _computeDateRange()
    const baseUrl = groupBy.value
      ? `/api/admin/trend?group_by=${groupBy.value}&time_filter=${tf}`
      : `/api/admin/trend?time_filter=${tf}`
    const url = `${baseUrl}&start=${start}&end=${end}`
    const res = await fetch(url, { headers: { Authorization: `Bearer ${auth.token}` } })
    rawData = await res.json()
  } finally {
    loading.value = false
  }
  // nextTick equivalent: wait for v-else DOM to appear
  await new Promise(r => setTimeout(r, 0))
  renderChart()
}

onMounted(async () => {
  try {
    const { data: whCfg } = await api.get('/metrics/working-hours-config')
    workingHoursEnabled.value = whCfg.enabled
    if (!whCfg.enabled) timeFilter.value = 'all'
  } catch {}
  fetchData()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  chart?.dispose()
  chart = null
})
</script>
