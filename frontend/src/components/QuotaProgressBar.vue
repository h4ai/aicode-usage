<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <el-card class="quota-card">
    <template #header>
      <span>配额使用</span>
    </template>
    <div v-if="loading" v-loading="true" style="height: 80px" />
    <template v-else-if="quota">
      <div class="quota-bar-row">
        <span class="quota-label">月度 Token</span>
        <el-progress
          :percentage="Math.min(quota.monthly_token.percent, 100)"
          :color="colorMap[quota.monthly_token.color]"
          :stroke-width="18"
          :text-inside="true"
          :format="() => formatWan(quota!.monthly_token.used) + ' / ' + formatWan(quota!.monthly_token.limit)"
        />
        <el-tooltip :content="quota.monthly_token.message" placement="top">
          <el-tag :type="tagType(quota.monthly_token.color)" size="small">
            {{ quota.monthly_token.message }}
          </el-tag>
        </el-tooltip>
      </div>
      <div class="quota-bar-row">
        <span class="quota-label">月度对话</span>
        <el-progress
          :percentage="Math.min(quota.monthly_chats.percent, 100)"
          :color="colorMap[quota.monthly_chats.color]"
          :stroke-width="18"
          :text-inside="true"
          :format="() => quota!.monthly_chats.used + ' / ' + quota!.monthly_chats.limit + ' 轮'"
        />
        <el-tooltip :content="quota.monthly_chats.message" placement="top">
          <el-tag :type="tagType(quota.monthly_chats.color)" size="small">
            {{ quota.monthly_chats.message }}
          </el-tag>
        </el-tooltip>
      </div>
      <div class="quota-bar-row">
        <span class="quota-label">今日请求</span>
        <el-progress
          :percentage="Math.min(quota.daily_requests.percent, 100)"
          :color="colorMap[quota.daily_requests.color]"
          :stroke-width="18"
          :text-inside="true"
          :format="() => quota!.daily_requests.used + ' / ' + quota!.daily_requests.limit"
        />
        <el-tooltip :content="quota.daily_requests.message" placement="top">
          <el-tag :type="tagType(quota.daily_requests.color)" size="small">
            {{ quota.daily_requests.message }}
          </el-tag>
        </el-tooltip>
      </div>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import api from '@/api'

interface QuotaBar {
  used: number
  limit: number
  percent: number
  color: string
  message: string
}

interface QuotaUsage {
  monthly_token: QuotaBar
  monthly_chats: QuotaBar
  daily_requests: QuotaBar
}

const loading = ref(true)
const quota = ref<QuotaUsage | null>(null)

const colorMap: Record<string, string> = {
  green: '#67c23a',
  yellow: '#e6a23c',
  orange: '#f56c6c',
  red: '#f56c6c',
}

function tagType(color: string): '' | 'success' | 'warning' | 'danger' {
  if (color === 'green') return 'success'
  if (color === 'yellow') return 'warning'
  return 'danger'
}

function formatWan(n: number): string {
  if (n >= 10000) {
    return (n / 10000).toFixed(1) + '万'
  }
  return String(n)
}

onMounted(async () => {
  try {
    const { data } = await api.get<QuotaUsage>('/quota/usage')
    quota.value = data
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.quota-card {
  margin-bottom: 16px;
}

.quota-bar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.quota-bar-row:last-child {
  margin-bottom: 0;
}

.quota-label {
  flex-shrink: 0;
  width: 70px;
  font-size: 14px;
  color: #606266;
}

.quota-bar-row .el-progress {
  flex: 1;
}
</style>
