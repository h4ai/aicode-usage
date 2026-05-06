<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <el-card class="quota-card">
    <template #header>
      <span>配额使用</span>
    </template>
    <div
      v-if="loading"
      v-loading="true"
      style="height: 80px"
    ></div>
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
        <el-tooltip
          :content="quota.monthly_token.message"
          placement="top"
        >
          <el-tag
            :type="tagType(quota.monthly_token.color)"
            size="small"
          >
            {{ quota.monthly_token.message }}
          </el-tag>
        </el-tooltip>
      </div>
      <div class="quota-bar-row">
        <span class="quota-label">当日 Token
          <el-tooltip
            :content="!quota.is_quota_period ? '当前为非限额时段，此时段使用不计入当日配额' : quotaPeriodText"
            placement="top"
          >
            <el-icon style="font-size:12px;color:#c0c4cc;margin-left:2px;vertical-align:middle"><QuestionFilled /></el-icon>
          </el-tooltip>
        </span>
        <el-progress
          :percentage="Math.min(quota.daily_token.percent, 100)"
          :color="colorMap[quota.daily_token.color]"
          :stroke-width="18"
          :text-inside="true"
          :format="() => formatKM(quota!.daily_token.used) + ' / ' + formatKM(quota!.daily_token.limit)"
        />
        <el-tooltip
          :content="quota.daily_token.message"
          placement="top"
        >
          <el-tag
            :type="tagType(quota.daily_token.color)"
            size="small"
          >
            {{ quota.daily_token.message }}
          </el-tag>
        </el-tooltip>
      </div>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { QuestionFilled } from '@element-plus/icons-vue'
const props = withDefaults(defineProps<{ timeFilter?: string }>(), { timeFilter: 'all' })
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
  daily_token: QuotaBar
  daily_requests: QuotaBar
  is_quota_period: boolean
}

const loading = ref(true)
const quota = ref<QuotaUsage | null>(null)
const quotaPeriodText = ref('工作日限额时段内的Token使用量')

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

function formatKM(n: number): string {
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1) + 'M'
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(0) + 'K'
  }
  return String(n)
}

onMounted(async () => {
  try {
    const [quotaRes, whRes] = await Promise.all([
      api.get<QuotaUsage>(`/quota/usage?time_filter=${props.timeFilter}`),
      api.get('/metrics/working-hours-config'),
    ])
    quota.value = quotaRes.data
    const periods: {start:string, end:string}[] = whRes.data.periods || []
    if (periods.length) {
      quotaPeriodText.value = '仅统计工作日限额时段（' + periods.map((p: {start:string,end:string}) => `${p.start}-${p.end}`).join('、') + '）内的Token使用量'
    }
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
  width: 80px;
  font-size: 14px;
  color: #606266;
}

.quota-bar-row .el-progress {
  flex: 1;
}
</style>
