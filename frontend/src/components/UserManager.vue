<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai> -->

<template>
  <el-card class="user-manager">
    <template #header>
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">
        <span>用户管理（{{ filteredUsers.length }} 人）</span>
        <div style="display:flex;gap:8px;align-items:center">
          <el-input
            v-model="searchText"
            placeholder="搜索姓名/分组"
            clearable
            size="small"
            style="width:160px"
          />
          <el-select
            v-model="filterStatus"
            size="small"
            style="width:120px"
            placeholder="状态筛选"
          >
            <el-option
              label="全部"
              value=""
            />
            <el-option
              label="🔴 超限"
              value="red"
            />
            <el-option
              label="🟡 接近上限"
              value="yellow"
            />
            <el-option
              label="🟢 正常"
              value="green"
            />
            <el-option
              label="⚪ 未使用"
              value="gray"
            />
          </el-select>
          <el-button
            size="small"
            :loading="exporting"
            @click="exportCsv"
          >
            📥 导出 CSV
          </el-button>
        </div>
      </div>
    </template>

    <el-table
      v-loading="loading"
      :data="pagedUsers"
      border
      stripe
      size="small"
    >
      <!-- 状态指示灯 -->
      <el-table-column
        label="状态"
        width="72"
        align="center"
      >
        <template #default="{ row }">
          <el-tooltip
            :content="statusTooltip(row)"
            placement="top"
          >
            <span
              class="status-dot"
              :class="overallStatus(row)"
            ></span>
          </el-tooltip>
        </template>
      </el-table-column>

      <el-table-column
        prop="display_name"
        label="姓名"
        min-width="90"
      />
      <el-table-column
        prop="user_id"
        label="userId"
        min-width="100"
      />
      <el-table-column
        prop="enterprise"
        label="分组"
        min-width="90"
      />

      <!-- 配额级别 -->
      <el-table-column
        label="级别"
        width="110"
        align="center"
      >
        <template #default="{ row }">
          <el-select
            :model-value="row.quota_level"
            size="small"
            @change="(val: string) => changeLevel(row.user_id, val)"
          >
            <el-option
              label="L1"
              value="L1"
            />
            <el-option
              label="L2"
              value="L2"
            />
            <el-option
              label="L3"
              value="L3"
            />
          </el-select>
        </template>
      </el-table-column>

      <!-- 本月 Token -->
      <el-table-column
        label="本月限额Token"
        min-width="130"
        sortable
        :sort-method="(a: UserItem, b: UserItem) => a.monthly_token - b.monthly_token"
      >
        <template #default="{ row }">
          <span :class="'text-' + row.status_token">
            {{ formatWan(row.monthly_token) }}
          </span>
          <el-tag
            v-if="row.status_token === 'red'"
            type="danger"
            size="small"
            style="margin-left:4px"
          >
            超限
          </el-tag>
          <el-tag
            v-else-if="row.status_token === 'yellow'"
            type="warning"
            size="small"
            style="margin-left:4px"
          >
            警告
          </el-tag>
        </template>
      </el-table-column>

      <!-- 今日 Token -->
      <el-table-column
        label="今日 Token"
        min-width="110"
        sortable
        :sort-method="(a: UserItem, b: UserItem) => a.today_token - b.today_token"
      >
        <template #default="{ row }">
          <span>{{ formatWan(row.today_token) }}</span>
        </template>
      </el-table-column>

      <!-- 今日对话轮次 -->
      <el-table-column
        label="今日限额对话"
        width="110"
        sortable
        :sort-method="(a: UserItem, b: UserItem) => a.today_chats - b.today_chats"
      >
        <template #default="{ row }">
          <span :class="'text-' + row.status_chat">{{ row.today_chats }}</span>
          <el-tag
            v-if="row.status_chat === 'red'"
            type="danger"
            size="small"
            style="margin-left:4px"
          >
            超限
          </el-tag>
          <el-tag
            v-else-if="row.status_chat === 'yellow'"
            type="warning"
            size="small"
            style="margin-left:4px"
          >
            警告
          </el-tag>
        </template>
      </el-table-column>

      <!-- 本月对话轮次 -->
      <el-table-column
        label="本月对话"
        width="100"
        sortable
        :sort-method="(a: UserItem, b: UserItem) => a.monthly_chats - b.monthly_chats"
      >
        <template #default="{ row }">
          <span>{{ row.monthly_chats }}</span>
        </template>
      </el-table-column>
      <!-- 本月总Token（全天，不受时段过滤） -->
      <el-table-column
        label="本月总Token"
        min-width="120"
        sortable
        :sort-method="(a: UserItem, b: UserItem) => a.monthly_token_all - b.monthly_token_all"
      >
        <template #default="{ row }">
          <span>{{ formatWan(row.monthly_token_all ?? row.monthly_token) }}</span>
        </template>
      </el-table-column>
      <!-- 今日总对话（全天，不受时段过滤） -->
      <el-table-column
        label="今日总对话"
        width="110"
        sortable
        :sort-method="(a: UserItem, b: UserItem) => (a.today_chats_all ?? a.today_chats) - (b.today_chats_all ?? b.today_chats)"
      >
        <template #default="{ row }">
          <span>{{ row.today_chats_all ?? row.today_chats }}</span>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页 -->
    <div style="margin-top:12px;display:flex;justify-content:flex-end">
      <el-pagination
        v-model:current-page="currentPage"
        :page-size="pageSize"
        :page-sizes="[20, 50, 100]"
        layout="sizes, prev, pager, next, total"
        :total="filteredUsers.length"
        size="small"
        @size-change="(s: number) => { pageSize = s; currentPage = 1 }"
      />
    </div>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

interface UserItem {
  user_id: string
  display_name: string
  enterprise: string
  quota_level: string
  monthly_token: number       // 限额统计用（受time_filter影响）
  monthly_token_all: number   // 全天本月总量
  today_token: number
  today_chats: number         // 限额统计用（受time_filter影响）
  today_chats_all: number     // 全天今日总对话
  monthly_chats: number
  daily_requests: number
  status_token: string
  status_chat: string
}

// 用户管理固定全天，不做时段过滤
const users = ref<UserItem[]>([])
const loading = ref(false)
const exporting = ref(false)
const searchText = ref('')
const filterStatus = ref('')
const currentPage = ref(1)
const pageSize = ref(20)

function formatWan(n: number): string {
  if (n >= 100000000) return (n / 100000000).toFixed(1) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return n.toLocaleString()
}

function overallStatus(row: UserItem): string {
  if (row.status_token === 'red' || row.status_chat === 'red') return 'dot-red'
  if (row.status_token === 'yellow' || row.status_chat === 'yellow') return 'dot-yellow'
  if (row.status_token === 'green' || row.status_chat === 'green') return 'dot-green'
  return 'dot-gray'
}

function statusTooltip(row: UserItem): string {
  const parts: string[] = []
  const labels: Record<string, string> = { red: '超限', yellow: '接近上限', green: '正常', gray: '未使用' }
  parts.push('Token: ' + (labels[row.status_token] ?? '-'))
  parts.push('今日对话: ' + (labels[row.status_chat] ?? '-'))
  return parts.join(' | ')
}

const filteredUsers = computed(() => {
  let list = users.value
  if (searchText.value) {
    const kw = searchText.value.toLowerCase()
    list = list.filter(u =>
      u.display_name.toLowerCase().includes(kw) ||
      u.enterprise.toLowerCase().includes(kw) ||
      u.user_id.toLowerCase().includes(kw)
    )
  }
  if (filterStatus.value) {
    const s = filterStatus.value
    list = list.filter(u => u.status_token === s || u.status_chat === s)
  }
  return list
})

const pagedUsers = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return filteredUsers.value.slice(start, start + pageSize.value)
})

async function fetchUsers() {
  loading.value = true
  try {
    const { data } = await api.get<UserItem[]>(`/admin/users?time_filter=all`)
    // 默认按状态+月 Token 排序
    const order = { red: 0, yellow: 1, green: 2, gray: 3 }
    data.sort((a, b) => {
      const sa = Math.min(order[a.status_token as keyof typeof order] ?? 4, order[a.status_chat as keyof typeof order] ?? 4)
      const sb = Math.min(order[b.status_token as keyof typeof order] ?? 4, order[b.status_chat as keyof typeof order] ?? 4)
      if (sa !== sb) return sa - sb
      return b.monthly_token - a.monthly_token
    })
    users.value = data
  } finally {
    loading.value = false
  }
}

async function changeLevel(userId: string, level: string) {
  try {
    await api.put(`/admin/users/${userId}/level`, { level })
    ElMessage.success('级别修改成功')
    await fetchUsers()
  } catch (e: unknown) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail ?? '修改失败')
  }
}

async function exportCsv() {
  exporting.value = true
  try {
    const { data } = await api.get(`/admin/users/export-csv?time_filter=all`, { responseType: 'blob' })
    const url = URL.createObjectURL(data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `users_export_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  } catch {
    ElMessage.error('导出失败')
  } finally {
    exporting.value = false
  }
}


onMounted(fetchUsers)
</script>

<style scoped>
.user-manager {
  margin-bottom: 20px;
}

.status-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
.dot-red    { background: #f56c6c; box-shadow: 0 0 4px #f56c6c; }
.dot-yellow { background: #e6a23c; box-shadow: 0 0 4px #e6a23c; }
.dot-green  { background: #67c23a; }
.dot-gray   { background: #c0c4cc; }

.text-red    { color: #f56c6c; font-weight: 600; }
.text-yellow { color: #e6a23c; font-weight: 600; }
.text-green  { color: #67c23a; }
.text-gray   { color: #c0c4cc; }
</style>
