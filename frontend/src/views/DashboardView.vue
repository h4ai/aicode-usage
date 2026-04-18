<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <div class="dashboard-view">
    <div class="page-header">
      <h1>个人看板</h1>
      <el-radio-group v-model="tf.timeFilter" size="small" class="time-filter-bar">
        <el-radio-button value="all">全天</el-radio-button>
        <el-radio-button value="work">工作时段</el-radio-button>
        <el-radio-button value="non_work">非工作时段</el-radio-button>
      </el-radio-group>
    </div>
    <QuotaProgressBar :time-filter="tf.timeFilter" />
    <MetricCards :time-filter="tf.timeFilter" />
    <TrendChart :time-filter="tf.timeFilter" />
    <ModelDistribution :time-filter="tf.timeFilter" />
    <DetailTable :time-filter="tf.timeFilter" />
  </div>
</template>

<script setup lang="ts">
import { useTimeFilterStore } from '@/stores/timeFilter'
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
  margin-bottom: 8px;
}
.page-header h1 { margin: 0; }
.time-filter-bar { flex-shrink: 0; }

.dashboard-view h1 {
  margin-bottom: 20px;
}
</style>
