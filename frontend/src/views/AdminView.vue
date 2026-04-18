<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <div class="admin-view">
    <div class="page-header">
      <h1>管理员后台</h1>
      <el-radio-group v-model="tf.timeFilter" size="small" class="time-filter-bar">
        <el-radio-button value="all">全天</el-radio-button>
        <el-radio-button value="work">工作时段</el-radio-button>
        <el-radio-button value="non_work">非工作时段</el-radio-button>
      </el-radio-group>
    </div>
    <el-tabs v-model="activeTab" @tab-click="onTabChange">
      <el-tab-pane label="配额级别" name="quota">
        <QuotaLevelManager />
      </el-tab-pane>
      <el-tab-pane label="工作时段" name="workhours">
        <WorkingHoursConfig />
      </el-tab-pane>
      <el-tab-pane label="用户管理" name="users">
        <UserManager :time-filter="tf.timeFilter" />
      </el-tab-pane>
      <el-tab-pane label="全局趋势" name="trend">
        <GlobalTrend />
      </el-tab-pane>
      <el-tab-pane label="部门汇总" name="dept">
        <DepartmentSummary :time-filter="tf.timeFilter" />
      </el-tab-pane>
      <el-tab-pane label="用量排行" name="leaderboard">
        <Leaderboard :time-filter="tf.timeFilter" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useTimeFilterStore } from '@/stores/timeFilter'
const tf = useTimeFilterStore()
import QuotaLevelManager from '@/components/QuotaLevelManager.vue'
import WorkingHoursConfig from '@/components/WorkingHoursConfig.vue'
import UserManager from '@/components/UserManager.vue'
import GlobalTrend from '@/views/admin/GlobalTrend.vue'
import DepartmentSummary from '@/views/admin/DepartmentSummary.vue'
import Leaderboard from '@/views/admin/Leaderboard.vue'

const activeTab = ref('quota')

function onTabChange() {
  // Tab 切换后容器宽度可能还未更新，延迟触发 resize
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'))
  }, 50)
}
</script>
