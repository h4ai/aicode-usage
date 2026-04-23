<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <div class="admin-view">
    <NavBar title="管理员后台" />
    <el-tabs
      v-model="activeTab"
      @tab-click="onTabChange"
    >
      <el-tab-pane
        label="用户管理"
        name="users"
      >
        <UserManager />
      </el-tab-pane>
      <el-tab-pane
        label="全局趋势"
        name="trend"
      >
        <GlobalTrend />
      </el-tab-pane>
      <el-tab-pane
        label="分组汇总"
        name="dept"
      >
        <DepartmentSummary />
      </el-tab-pane>
      <el-tab-pane
        label="用量排行"
        name="leaderboard"
      >
        <Leaderboard />
      </el-tab-pane>
      <el-tab-pane
        label="工作时段"
        name="workhours"
      >
        <WorkingHoursConfig />
      </el-tab-pane>
      <el-tab-pane
        label="配额级别"
        name="quota"
      >
        <QuotaLevelManager />
      </el-tab-pane>
      <el-tab-pane
        label="通知设置"
        name="notification"
      >
        <NotificationSettings />
      </el-tab-pane>
      <el-tab-pane
        label="邮件记录"
        name="email-records"
      >
        <EmailNotifications />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import NavBar from '@/components/NavBar.vue'
import QuotaLevelManager from '@/components/QuotaLevelManager.vue'
import WorkingHoursConfig from '@/components/WorkingHoursConfig.vue'
import UserManager from '@/components/UserManager.vue'
import GlobalTrend from '@/views/admin/GlobalTrend.vue'
import DepartmentSummary from '@/views/admin/DepartmentSummary.vue'
import Leaderboard from '@/views/admin/Leaderboard.vue'
import NotificationSettings from '@/views/admin/NotificationSettings.vue'
import EmailNotifications from '@/views/admin/EmailNotifications.vue'

const VALID_TABS = ['users', 'trend', 'dept', 'leaderboard', 'workhours', 'quota', 'notification', 'email-records']
const route = useRoute()
const router = useRouter()

const initialTab = typeof route.query.tab === 'string' && VALID_TABS.includes(route.query.tab)
  ? route.query.tab
  : 'users'
const activeTab = ref(initialTab)

function onTabChange() {
  router.replace({ query: { ...route.query, tab: activeTab.value } })
  // Tab 切换后容器宽度可能还未更新，延迟触发 resize
  setTimeout(() => {
    window.dispatchEvent(new Event('resize'))
  }, 50)
}
</script>
