<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <el-card class="working-hours-card">
    <template #header>
      <div style="display:flex;align-items:center;gap:8px">
        <span>工作时段配置</span>
        <el-tooltip content="仅统计该时段内的今日对话轮次和今日Token，月度Token不受影响" placement="top">
          <el-icon style="color:#909399;cursor:pointer"><QuestionFilled /></el-icon>
        </el-tooltip>
      </div>
    </template>

    <div v-if="loading" v-loading="true" style="height:80px" />
    <template v-else>
      <el-form :model="form" label-width="120px" size="default">
        <el-form-item label="启用时段限制">
          <el-switch
            v-model="form.enabled"
            active-text="仅统计工作时段"
            inactive-text="统计全天 00:00~23:59"
          />
        </el-form-item>
        <template v-if="form.enabled">
          <el-form-item label="开始时间">
            <el-time-select
              v-model="form.start"
              start="00:00"
              step="00:30"
              end="23:30"
              placeholder="开始时间"
              style="width:140px"
            />
          </el-form-item>
          <el-form-item label="结束时间">
            <el-time-select
              v-model="form.end"
              start="00:30"
              step="00:30"
              end="24:00"
              placeholder="结束时间"
              style="width:140px"
            />
          </el-form-item>
        </template>
        <el-form-item>
          <el-button type="primary" @click="save" :loading="saving">保存</el-button>
          <span style="margin-left:12px;color:#909399;font-size:12px">
            当前：{{ currentDesc }}
          </span>
        </el-form-item>
      </el-form>
    </template>
  </el-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import api from '@/api'

interface WorkingHoursConfig {
  enabled: boolean
  start: string
  end: string
}

const loading = ref(false)
const saving = ref(false)
const form = ref<WorkingHoursConfig>({ enabled: true, start: '08:30', end: '18:00' })

const currentDesc = computed(() => {
  if (!form.value.enabled) return '全天统计（00:00 ~ 23:59）'
  return `工作时段 ${form.value.start} ~ ${form.value.end}`
})

async function fetchConfig() {
  loading.value = true
  try {
    const { data } = await api.get<WorkingHoursConfig>('/admin/working-hours')
    form.value = { ...data }
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    await api.put('/admin/working-hours', form.value)
    ElMessage.success('工作时段配置已保存，统计将在下次查询时生效')
  } catch (e: unknown) {
    const err = e as { response?: { data?: { detail?: string } } }
    ElMessage.error(err.response?.data?.detail ?? '保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(fetchConfig)
</script>

<style scoped>
.working-hours-card {
  margin-bottom: 16px;
}
</style>
