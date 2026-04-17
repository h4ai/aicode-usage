<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <el-card class="metric-cards">
    <template #header>
      <div class="metric-header">
        <span>关键指标</span>
        <el-radio-group v-model="scope" size="small" @change="fetchMetrics">
          <el-radio-button value="month">本月</el-radio-button>
          <el-radio-button value="today">今日</el-radio-button>
        </el-radio-group>
      </div>
    </template>
    <div v-if="loading" v-loading="true" style="height: 80px" />
    <el-row v-else :gutter="16">
      <el-col :span="scope === 'today' ? 12 : 6">
        <div class="metric-item">
          <div class="metric-value">{{ formatWan(metrics.total_token) }}</div>
          <div class="metric-label">{{ scope === 'today' ? '今日 Token' : '累计 Token' }}</div>
        </div>
      </el-col>
      <el-col :span="scope === 'today' ? 12 : 6">
        <div class="metric-item">
          <div class="metric-value">{{ metrics.request_count }}</div>
          <div class="metric-label">请求次数</div>
        </div>
      </el-col>
      <template v-if="scope === 'month'">
        <el-col :span="6">
          <div class="metric-item">
            <div class="metric-value">{{ metrics.active_days ?? 0 }}</div>
            <div class="metric-label">活跃天数</div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-item">
            <div class="metric-value">{{ formatWan(metrics.daily_avg_token ?? 0) }}</div>
            <div class="metric-label">日均 Token</div>
          </div>
        </el-col>
      </template>
    </el-row>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/api'

interface MetricsSummary {
  total_token: number
  request_count: number
  active_days: number | null
  daily_avg_token: number | null
}

const scope = ref<'month' | 'today'>('month')
const loading = ref(true)
const metrics = ref<MetricsSummary>({
  total_token: 0,
  request_count: 0,
  active_days: null,
  daily_avg_token: null,
})

function formatWan(n: number): string {
  if (n >= 10000) {
    return (n / 10000).toFixed(1) + '万'
  }
  return String(n)
}

async function fetchMetrics() {
  loading.value = true
  try {
    const { data } = await api.get<MetricsSummary>('/metrics/summary', {
      params: { scope: scope.value },
    })
    metrics.value = data
  } finally {
    loading.value = false
  }
}

onMounted(fetchMetrics)
</script>

<style scoped>
.metric-cards {
  margin-bottom: 16px;
}

.metric-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.metric-item {
  text-align: center;
  padding: 12px 0;
}

.metric-value {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
}

.metric-label {
  font-size: 13px;
  color: #909399;
  margin-top: 4px;
}
</style>
