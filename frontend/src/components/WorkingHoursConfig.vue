<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <el-card class="working-hours-card">
    <template #header>
      <div style="display:flex;align-items:center;gap:8px">
        <span>工作时段配置</span>
        <el-tooltip
          content="工作时段 = 周一至周五 各时段；周六日全天视为非工作时段；月度Token不受影响"
          placement="top"
        >
          <el-icon style="color:#909399;cursor:pointer">
            <QuestionFilled />
          </el-icon>
        </el-tooltip>
      </div>
    </template>

    <div
      v-if="loading"
      v-loading="true"
      style="height:80px"
    ></div>
    <template v-else>
      <el-form
        :model="form"
        label-width="120px"
        size="default"
      >
        <el-form-item label="启用时段限制">
          <el-switch
            v-model="form.enabled"
            active-text="仅统计工作时段（周一至周五）"
            inactive-text="统计全天（含周末）"
          />
        </el-form-item>
        <template v-if="form.enabled">
          <el-form-item
            v-for="(period, index) in form.periods"
            :key="index"
            :label="`时段 ${index + 1}`"
          >
            <div style="display:flex;align-items:center;gap:8px">
              <el-time-select
                v-model="period.start"
                start="00:00"
                step="00:30"
                end="23:30"
                placeholder="开始时间"
                style="width:130px"
              />
              <span>至</span>
              <el-time-select
                v-model="period.end"
                start="00:30"
                step="00:30"
                end="24:00"
                placeholder="结束时间"
                style="width:130px"
              />
              <el-button
                v-if="form.periods.length > 1"
                type="danger"
                size="small"
                link
                @click="removePeriod(index)"
              >
                删除
              </el-button>
            </div>
          </el-form-item>
          <el-form-item label=" ">
            <el-button
              size="small"
              @click="addPeriod"
            >
              + 添加时段
            </el-button>
          </el-form-item>
        </template>
        <el-form-item>
          <el-button
            type="primary"
            :loading="saving"
            @click="save"
          >
            保存
          </el-button>
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

interface TimePeriod {
  start: string
  end: string
}

interface WorkingHoursConfig {
  enabled: boolean
  weekday_only: boolean
  periods: TimePeriod[]
}

const loading = ref(false)
const saving = ref(false)
const form = ref<WorkingHoursConfig>({
  enabled: true,
  weekday_only: true,
  periods: [
    { start: '09:00', end: '12:00' },
    { start: '13:00', end: '18:00' },
  ],
})

const currentDesc = computed(() => {
  if (!form.value.enabled) return '全天统计（00:00 ~ 23:59）'
  const parts = form.value.periods.map(p => `${p.start}~${p.end}`)
  return `工作时段 ${parts.join('，')}`
})

function addPeriod() {
  form.value.periods.push({ start: '09:00', end: '18:00' })
}

function removePeriod(index: number) {
  form.value.periods.splice(index, 1)
}

async function fetchConfig() {
  loading.value = true
  try {
    const { data } = await api.get<WorkingHoursConfig>('/admin/working-hours')
    // Normalize: support old single start/end format from server
    if (data.periods && data.periods.length > 0) {
      form.value = {
        enabled: data.enabled,
        weekday_only: data.weekday_only ?? true,
        periods: data.periods,
      }
    } else if ((data as any).start && (data as any).end) {
      form.value = {
        enabled: data.enabled,
        weekday_only: data.weekday_only ?? true,
        periods: [{ start: (data as any).start, end: (data as any).end }],
      }
    }
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
