<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div class="navbar">
    <span class="navbar-title">{{ title }}</span>
    <div class="navbar-right">
      <el-dropdown trigger="click" @command="handleCommand">
        <span class="user-info">
          <el-avatar :size="28" :style="{ background: '#409eff', fontSize: '13px' }">
            {{ avatarText }}
          </el-avatar>
          <span class="username">{{ auth.username || auth.role || '用户' }}</span>
          <el-icon class="arrow"><ArrowDown /></el-icon>
        </span>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item disabled style="font-size:12px;color:#999;">
              已登录：{{ auth.username || '—' }}
            </el-dropdown-item>
            <el-dropdown-item divided command="logout">
              <el-icon><SwitchButton /></el-icon> 退出登录
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowDown, SwitchButton } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

defineProps<{ title?: string }>()

const auth = useAuthStore()
const router = useRouter()

const avatarText = computed(() => {
  const name = auth.username || ''
  return name ? name.slice(-2) : 'U'
})

function handleCommand(cmd: string) {
  if (cmd === 'logout') {
    auth.logout()
    router.push('/login')
  }
}
</script>

<style scoped>
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  height: 52px;
  background: #fff;
  border-bottom: 1px solid #e8e8e8;
  box-shadow: 0 1px 4px rgba(0,0,0,.06);
  margin-bottom: 16px;
}

.navbar-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.navbar-right {
  display: flex;
  align-items: center;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #303133;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 6px;
  transition: background .15s;
}

.user-info:hover {
  background: #f5f7fa;
}

.username {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.arrow {
  font-size: 12px;
  color: #909399;
}

.role-badge {
  display: inline-block;
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 10px;
  margin-left: 6px;
  font-weight: 500;
}

.role-badge.admin {
  background: #fdf6ec;
  color: #e6a23c;
}

.role-badge.user {
  background: #ecf5ff;
  color: #409eff;
}
</style>
