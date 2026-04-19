<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <div class="dashboard-view">
    <NavBar title="个人看板" />
    <div class="page-header">
      <div class="time-filter-wrapper">
        <el-tooltip placement="bottom-end" effect="light" :width="320">
          <template #content>
            <div class="filter-tooltip">
              <strong>时段过滤说明</strong>
              <ul>
                <li><b>全天</b>：统计当日/本周/本月所有时间段的数据，不做任何限制。</li>
                <li><b>工作时段</b>：仅统计 08:30~18:00（工作日，周一至周五）内产生的数据。</li>
                <li><b>非工作时段</b>：仅统计工作时间以外（含周六/周日全天）产生的数据。</li>
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
import NavBar from '@/components/NavBar.vue'
import { useTimeFilterStore } from '@/stores/timeFilter'
import { QuestionFilled } from '@element-plus/icons-vue'
const tf = useTimeFilterStore()
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
.page-header h1 { margin: 0; }

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
