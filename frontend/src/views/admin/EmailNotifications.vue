<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- 邮件发送记录管理页面 -->

<template>
  <div class="email-notifications">
    <!-- 筛选栏 -->
    <el-card style="margin-bottom: 16px">
      <el-form :inline="true" @submit.prevent="loadData">
        <el-form-item label="用户ID">
          <el-input v-model="filters.userId" placeholder="按用户ID过滤" clearable style="width: 160px" />
        </el-form-item>
        <el-form-item label="配额类型">
          <el-select v-model="filters.quotaType" placeholder="全部" clearable style="width: 160px">
            <el-option value="monthly_token" label="月度Token" />
            <el-option value="daily_chats" label="日对话" />
          </el-select>
        </el-form-item>
        <el-form-item label="周期">
          <el-input v-model="filters.periodKey" placeholder="如 2026-04" clearable style="width: 140px" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="loadData">查询</el-button>
          <el-button type="danger" @click="showResetDialog = true">批量重置</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 数据表格 -->
    <el-card>
      <el-table :data="items" v-loading="loading" stripe border style="width: 100%">
        <el-table-column prop="user_id" label="用户ID" width="140" />
        <el-table-column prop="quota_type" label="配额类型" width="120">
          <template #default="{ row }">
            {{ row.quota_type === 'monthly_token' ? '月度Token' : '日对话' }}
          </template>
        </el-table-column>
        <el-table-column prop="threshold" label="阈值" width="80">
          <template #default="{ row }">{{ row.threshold }}%</template>
        </el-table-column>
        <el-table-column prop="period_key" label="周期" width="110" />
        <el-table-column prop="over_limit" label="是否超限" width="90">
          <template #default="{ row }">
            <el-tag :type="row.over_limit ? 'danger' : 'success'" size="small">
              {{ row.over_limit ? '是' : '否' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="sent_at" label="发送时间" width="180">
          <template #default="{ row }">{{ formatTime(row.sent_at) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link size="small" @click="handleResend(row)">重发</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > 0"
        style="margin-top: 16px; justify-content: flex-end"
        background
        layout="total, prev, pager, next"
        :total="total"
        :page-size="pageSize"
        :current-page="page"
        @current-change="onPageChange"
      />
    </el-card>

    <!-- 批量重置对话框 -->
    <el-dialog v-model="showResetDialog" title="批量重置通知记录" width="440px">
      <el-form label-width="80px">
        <el-form-item label="用户ID">
          <el-input v-model="resetForm.userId" placeholder="留空则不限" clearable />
        </el-form-item>
        <el-form-item label="周期">
          <el-input v-model="resetForm.periodKey" placeholder="留空则不限" clearable />
        </el-form-item>
        <el-alert type="warning" :closable="false" style="margin-top: 8px">
          两项都留空将清空所有通知记录，请谨慎操作。
        </el-alert>
      </el-form>
      <template #footer>
        <el-button @click="showResetDialog = false">取消</el-button>
        <el-button type="danger" @click="handleReset">确认重置</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import api from '@/api'

interface NotificationRecord {
  id: number
  user_id: string
  quota_type: string
  threshold: number
  period_key: string
  over_limit: boolean
  sent_at: string
}

const items = ref<NotificationRecord[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 20
const loading = ref(false)

const filters = ref({
  userId: '',
  quotaType: '',
  periodKey: '',
})

const showResetDialog = ref(false)
const resetForm = ref({ userId: '', periodKey: '' })

function formatTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { hour12: false })
}

async function loadData() {
  loading.value = true
  try {
    const params: Record<string, string | number> = { page: page.value, page_size: pageSize }
    if (filters.value.userId) params.user_id = filters.value.userId
    if (filters.value.quotaType) params.quota_type = filters.value.quotaType
    if (filters.value.periodKey) params.period_key = filters.value.periodKey
    const resp = await api.get('/admin/email-notifications', { params })
    items.value = resp.data.items
    total.value = resp.data.total
  } catch {
    ElMessage.error('加载通知记录失败')
  } finally {
    loading.value = false
  }
}

function onPageChange(p: number) {
  page.value = p
  loadData()
}

async function handleResend(row: NotificationRecord) {
  try {
    await ElMessageBox.confirm(
      `确认重新发送邮件给 ${row.user_id}（${row.quota_type === 'monthly_token' ? '月度Token' : '日对话'} ${row.threshold}%）？`,
      '重发确认',
    )
  } catch {
    return
  }
  try {
    await api.post('/admin/email-notifications/resend', {
      user_id: row.user_id,
      quota_type: row.quota_type,
      threshold: row.threshold,
      period_key: row.period_key,
    })
    ElMessage.success('邮件已发送')
    loadData()
  } catch (e: unknown) {
    const detail = (e as { response?: { data?: { detail?: string } } }).response?.data?.detail
    ElMessage.error(detail || '发送失败')
  }
}

async function handleReset() {
  try {
    await api.delete('/admin/email-notifications', {
      data: {
        user_id: resetForm.value.userId || null,
        period_key: resetForm.value.periodKey || null,
      },
    })
    ElMessage.success('重置成功')
    showResetDialog.value = false
    resetForm.value = { userId: '', periodKey: '' }
    loadData()
  } catch {
    ElMessage.error('重置失败')
  }
}

onMounted(() => {
  loadData()
})
</script>
