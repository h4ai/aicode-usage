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
          <div class="metric-label">
            {{ scope === 'today' ? '今日 Token' : '累计 Token' }}
            <el-tooltip content="本月所有 AI 请求消耗的 Token 总量（输入 + 输出）" placement="top">
              <el-icon class="tip-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
        </div>
      </el-col>

      <el-col :span="6">
        <div class="metric-item">
          <div class="metric-value">{{ metrics.chat_count ?? 0 }}</div>
          <div class="metric-label">
            对话轮次
            <el-tooltip placement="top">
              <template #content>
                聊天对话的响应次数（一问一答算 1 轮）<br/>
                不含代码补全等非对话请求<br/>
                <span style="color:#faad14">注：当前为轮次统计，非独立会话数</span>
              </template>
              <el-icon class="tip-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
          </div>
        </div>
      </el-col>
      <template v-if="scope === 'month'">
        <el-col :span="6">
          <div class="metric-item">
            <div class="metric-value">{{ metrics.active_days ?? 0 }}</div>
            <div class="metric-label">
              活跃天数
              <el-tooltip content="本月有 AI 使用记录的自然日天数" placement="top">
                <el-icon class="tip-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </div>
          </div>
        </el-col>
        <el-col :span="6">
          <div class="metric-item">
            <div class="metric-value">{{ formatWan(metrics.daily_avg_token ?? 0) }}</div>
            <div class="metric-label">
              日均 Token
              <el-tooltip content="累计 Token ÷ 活跃天数，反映每个活跃日的平均消耗量" placement="top">
                <el-icon class="tip-icon"><QuestionFilled /></el-icon>
              </el-tooltip>
            </div>
          </div>
        </el-col>
      </template>
    </el-row>
  </el-card>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{ timeFilter?: string }>(), { timeFilter: 'all' })
import { ref, onMounted, watch } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
import api from '@/api'

interface MetricsSummary {
  total_token: number
  chat_count: number | null
  active_days: number | null
  daily_avg_token: number | null
}

const scope = ref<'month' | 'today'>('month')
const loading = ref(true)
const metrics = ref<MetricsSummary>({
  total_token: 0,
  chat_count: null,
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
      params: { scope: scope.value, time_filter: props.timeFilter },
    })
    metrics.value = data
  } finally {
    loading.value = false
  }
}

onMounted(fetchMetrics)
watch(() => props.timeFilter, fetchMetrics)
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
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}

.tip-icon {
  font-size: 13px;
  color: #c0c4cc;
  cursor: pointer;
  vertical-align: middle;
}

.tip-icon:hover {
  color: #409eff;
}
</style>
