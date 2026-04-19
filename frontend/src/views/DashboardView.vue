<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <div class="dashboard-view">
    <div class="page-header">
      <h1 class="page-title">个人看板</h1>
      <div class="header-right">
        <div class="time-filter-wrapper">
          <!-- 时段限制已关闭时，显示提示并固定全天 -->
          <template v-if="!workingHoursEnabled">
            <el-tooltip content="管理员已关闭时段过滤，当前统计全天数据" placement="bottom">
              <el-tag type="info" size="default" style="cursor:default">
                <el-icon style="margin-right:4px"><InfoFilled /></el-icon>全天（时段过滤已关闭）
              </el-tag>
            </el-tooltip>
          </template>
          <!-- 时段限制开启时，显示完整切换器 -->
          <template v-else>
            <el-tooltip placement="bottom-end" effect="light" :width="320">
              <template #content>
                <div class="filter-tooltip">
                  <strong>时段过滤说明</strong>
                  <ul>
                    <li><b>全天</b>：统计当日/本周/本月所有时间段的数据，不做任何限制。</li>
                    <li><b>工作时段</b>：仅统计 {{ workStart }}~{{ workEnd }}{{ weekdayOnly ? "（工作日，周一至周五）" : "" }}内产生的数据。</li>
                    <li><b>非工作时段</b>：仅统计工作时间以外{{ weekdayOnly ? "（含周六/周日全天）" : "" }}产生的数据。</li>
                  </ul>
                  <p class="tooltip-scope"><b>生效范围：</b>指标卡片、配额进度条、Token 趋势图、模型分布图、使用明细列表（含 CSV 导出）。<br/>不影响活跃天数和配额上限值。</p>
                  <p class="tooltip-note">⚙️ 工作时段起止时间可由管理员在「系统设置」中调整。</p>
                </div>
              </template>
              <el-icon class="filter-help-icon"><QuestionFilled /></el-icon>
            </el-tooltip>
            <el-radio-group v-model="tf.timeFilter" size="default" class="time-filter-bar" data-testid="time-filter-group">
              <el-radio-button value="all" data-testid="time-filter-all">全天</el-radio-button>
              <el-radio-button value="work" data-testid="time-filter-work">工作时段</el-radio-button>
              <el-radio-button value="non_work" data-testid="time-filter-non-work">非工作时段</el-radio-button>
            </el-radio-group>
          </template>
        </div>
        <div class="header-divider"></div>
        <el-dropdown trigger="click" @command="handleLogout">
          <span class="user-badge">
            <el-avatar :size="26" :style="{ background: '#409eff', fontSize: '12px' }">{{ avatarText }}</el-avatar>
            <span class="username-text">{{ auth.username || '用户' }}</span>
            <el-icon style="font-size:11px;color:#909399"><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item disabled style="font-size:12px;color:#999">已登录：{{ auth.username || '—' }}</el-dropdown-item>
              <el-dropdown-item divided command="logout"><el-icon><SwitchButton /></el-icon> 退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
    <QuotaProgressBar :time-filter="tf.timeFilter" />
    <MetricCards :time-filter="tf.timeFilter" />
    <TrendChart :time-filter="tf.timeFilter" />
    <ModelDistribution :time-filter="tf.timeFilter" />
    <DetailTable :time-filter="tf.timeFilter" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTimeFilterStore } from '@/stores/timeFilter'
import { useAuthStore } from '@/stores/auth'
import { QuestionFilled, ArrowDown, SwitchButton, InfoFilled } from '@element-plus/icons-vue'
import api from '@/api'
const tf = useTimeFilterStore()
const auth = useAuthStore()
const router = useRouter()
const avatarText = computed(() => (auth.username || '').slice(-2) || 'U')
function handleLogout(cmd: string) {
  if (cmd === 'logout') { auth.logout(); router.push('/login') }
}

const workStart = ref('08:30')
const workEnd = ref('18:00')
const weekdayOnly = ref(true)
const workingHoursEnabled = ref(true)

onMounted(async () => {
  try {
    const { data } = await api.get('/metrics/working-hours-config')
    workStart.value = data.start
    workEnd.value = data.end
    weekdayOnly.value = data.weekday_only
    workingHoursEnabled.value = data.enabled
    // 若时段限制已关闭，强制重置为全天
    if (!data.enabled) tf.timeFilter = 'all'
  } catch {}
})
import QuotaProgressBar from '@/components/QuotaProgressBar.vue'
import MetricCards from '@/components/MetricCards.vue'
import TrendChart from '@/components/TrendChart.vue'
import ModelDistribution from '@/components/ModelDistribution.vue'
import DetailTable from '@/components/DetailTable.vue'
</script>

<style scoped>
.dashboard-view {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.page-title { margin: 0; font-size: 22px; font-weight: 700; color: #303133; }

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-divider {
  width: 1px;
  height: 24px;
  background: #dcdfe6;
  flex-shrink: 0;
}

.user-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 6px;
  font-size: 14px;
  color: #303133;
  white-space: nowrap;
}

.user-badge:hover {
  background: #f5f7fa;
}

.username-text {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.time-filter-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-help-icon {
  font-size: 18px;
  color: #909399;
  cursor: pointer;
  flex-shrink: 0;
}
.filter-help-icon:hover {
  color: #409EFF;
}

/* 时段切换器加大加色 */
.time-filter-bar {
  flex-shrink: 0;
}
.time-filter-bar :deep(.el-radio-button__inner) {
  font-size: 14px;
  padding: 8px 18px;
  font-weight: 500;
}
/* 工作时段 — 绿色 */
.time-filter-bar :deep(.el-radio-button:nth-child(2) .el-radio-button__inner) {
  color: #67C23A;
  border-color: #b3e19d;
}
.time-filter-bar :deep(.el-radio-button:nth-child(2).is-active .el-radio-button__orig-radio:checked + .el-radio-button__inner) {
  background-color: #67C23A;
  border-color: #67C23A;
  box-shadow: -1px 0 0 0 #67C23A;
  color: #fff;
}
/* 非工作时段 — 橙色 */
.time-filter-bar :deep(.el-radio-button:nth-child(3) .el-radio-button__inner) {
  color: #E6A23C;
  border-color: #f5dab1;
}
.time-filter-bar :deep(.el-radio-button:nth-child(3).is-active .el-radio-button__orig-radio:checked + .el-radio-button__inner) {
  background-color: #E6A23C;
  border-color: #E6A23C;
  box-shadow: -1px 0 0 0 #E6A23C;
  color: #fff;
}

.filter-tooltip ul {
  margin: 6px 0 8px;
  padding-left: 16px;
  font-size: 13px;
  line-height: 1.8;
}
.filter-tooltip strong {
  font-size: 14px;
}
.tooltip-scope {
  font-size: 12px;
  color: #606266;
  margin: 6px 0 4px;
  line-height: 1.6;
}
.tooltip-note {
  font-size: 12px;
  color: #909399;
  margin: 0;
}
</style>
