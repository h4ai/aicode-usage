<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- 通知设置管理页面 -->

<template>
  <div class="notification-settings">
    <el-card>
      <template #header>
        <span>邮件通知设置</span>
        <el-button type="primary" size="small" style="float: right" @click="handleSaveConfig">保存配置</el-button>
      </template>

      <el-form label-width="120px">
        <!-- 通知开关 -->
        <el-form-item label="邮件通知">
          <el-switch v-model="form.enabled" />
        </el-form-item>

        <!-- 检查间隔 -->
        <el-form-item label="检查间隔">
          <el-select v-model="form.checkInterval" style="width: 200px">
            <el-option :value="30" label="30 分钟" />
            <el-option :value="60" label="60 分钟" />
            <el-option :value="120" label="120 分钟" />
          </el-select>
          <span style="margin-left: 8px; color: #909399; font-size: 12px">（修改后需重启服务生效）</span>
        </el-form-item>

        <!-- 触发阈值 -->
        <el-form-item label="触发阈值">
          <el-input-number v-model="form.thresholds[0]" :min="0" :max="100" style="width: 100px" />%
          <el-input-number v-model="form.thresholds[1]" :min="0" :max="100" style="width: 100px; margin-left: 10px" />%
          <el-input-number v-model="form.thresholds[2]" :min="0" :max="100" style="width: 100px; margin-left: 10px" />%
          <span style="margin-left: 8px; color: #909399; font-size: 12px">（0 表示忽略该档）</span>
        </el-form-item>

        <!-- 邮件域名 -->
        <el-form-item label="邮件域名">
          <el-input v-model="form.emailDomain" placeholder="example.com（AD mail 为空时自动拼接）" style="width: 300px" />
          <el-tooltip placement="top" content="当 AD 中没有配置用户 mail 属性时，系统会用「sAMAccountName@邮件域名」构造收件地址。如已有 AD mail 则此项无需填写。">
            <el-icon style="margin-left: 6px; cursor: pointer; color: #909399"><QuestionFilled /></el-icon>
          </el-tooltip>
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 20px">
      <template #header>
        <span>邮件模板编辑</span>
        <el-tooltip placement="top" content="在标题和正文中使用双大括号包裹占位符名称插入动态内容，点击下方占位符可快速复制">
          <el-tag type="warning" size="small" style="margin-left: 8px">支持占位符</el-tag>
        </el-tooltip>
      </template>

      <el-form label-width="120px">
        <el-form-item label="邮件标题">
          <el-input v-model="template.subject" placeholder="例：【AI Code Usage】您的{{quota_type_label}}用量已达 {{threshold}}" />
        </el-form-item>

        <el-form-item label="邮件正文">
          <el-input
            v-model="template.bodyHtml"
            type="textarea"
            :rows="8"
            placeholder="支持 HTML 格式，使用双大括号包裹占位符名插入动态内容"
          />
        </el-form-item>

        <el-form-item label="可用占位符">
          <div style="line-height: 2">
            <el-tooltip
              v-for="v in variables"
              :key="v.name"
              :content="`点击复制 {{${v.name}}}  —  ${v.description}`"
              placement="top"
            >
              <el-tag
                style="margin-right: 8px; margin-bottom: 6px; cursor: pointer"
                type="info"
                @click="copyPlaceholder(v.name)"
              >
                <span v-text="`{{${v.name}}}`"></span>
              </el-tag>
            </el-tooltip>
            <div style="margin-top: 4px; color: #909399; font-size: 12px">
              点击占位符即可复制到剪贴板，然后粘贴到标题或正文中
            </div>
          </div>
        </el-form-item>

        <!-- 占位符说明表 -->
        <el-form-item label="">
          <el-collapse>
            <el-collapse-item title="占位符说明（点击展开）" name="vars">
              <el-table :data="variables" size="small" border style="width: 100%">
                <el-table-column prop="name" label="占位符" width="220">
                  <template #default="{ row }">
                    <code><span v-text="`{{${row.name}}}`"></span></code>
                  </template>
                </el-table-column>
                <el-table-column prop="description" label="说明" />
                <el-table-column label="示例值" width="160">
                  <template #default="{ row }">
                    <span style="color: #67c23a">{{ SAMPLE_VALUES[row.name] || '—' }}</span>
                  </template>
                </el-table-column>
              </el-table>
            </el-collapse-item>
          </el-collapse>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handlePreview">预览效果</el-button>
          <el-button type="success" @click="handleSave">保存模板</el-button>
          <el-button @click="handleReset">重置默认</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 预览对话框 -->
    <el-dialog v-model="previewVisible" title="邮件预览（使用示例数据渲染）" width="640px">
      <el-alert type="info" :closable="false" style="margin-bottom: 16px">
        以下为使用示例数据渲染的预览效果：用量 80%、月度 Token、用户张三
      </el-alert>
      <div style="border: 1px solid #e4e7ed; border-radius: 4px; padding: 16px">
        <div style="font-weight: bold; margin-bottom: 12px; font-size: 14px">
          主题：{{ previewData.subject }}
        </div>
        <el-divider style="margin: 8px 0" />
        <div v-html="previewData.bodyHtml"></div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { QuestionFilled } from '@element-plus/icons-vue'
import api from '@/api'

// 占位符示例值（与后端 sample_context 对齐）
const SAMPLE_VALUES: Record<string, string> = {
  username: '张三',
  user_id: 'zhangsan',
  quota_type_label: '月度 Token',
  used: '8,000,000',
  limit: '10,000,000',
  percent: '80.00%',
  threshold: '80%',
  period: '2026年4月',
  reset_time: '每月1日重置',
}

const form = ref({
  enabled: true,
  checkInterval: 60,
  thresholds: [50, 80, 100],
  emailDomain: '',
})

const template = ref({
  subject: '',
  bodyHtml: '',
})

const variables = ref<{ name: string; description: string }[]>([])
const previewVisible = ref(false)
const previewData = ref({ subject: '', bodyHtml: '' })

const PH = (k: string) => `\x7b\x7b${k}\x7d\x7d`
const DEFAULT_SUBJECT = `【AI Code Usage】您的${PH('quota_type_label')}用量已达 ${PH('threshold')}`
const DEFAULT_BODY = [
  `<p>您好 ${PH('username')}（${PH('user_id')}），</p>`,
  `<p>您的 <strong>${PH('quota_type_label')}</strong> 在 ${PH('period')} 已使用 <strong>${PH('percent')}</strong>（${PH('used')} / ${PH('limit')}）。</p>`,
  `<p>当前触发阈值：${PH('threshold')}。</p>`,
  `<p>配额将于 ${PH('reset_time')} 自动重置，如需提升配额请联系管理员。</p>`,
  `<p>— AI Code Usage 系统</p>`,
].join('\n')

async function copyPlaceholder(name: string) {
  const text = `\x7b\x7b${name}\x7d\x7d`
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success(`已复制 ${text}`)
  } catch {
    ElMessage.info(`占位符：${text}`)
  }
}

async function loadConfig() {
  try {
    const resp = await api.get('/api/admin/notification-config')
    const d = resp.data
    form.value.enabled = d.enabled ?? true
    form.value.checkInterval = d.check_interval_minutes ?? 60
    form.value.thresholds = d.thresholds ?? [50, 80, 100]
    form.value.emailDomain = d.email_domain ?? ''
  } catch {
    // use defaults
  }
}

async function handleSaveConfig() {
  try {
    await api.put('/api/admin/notification-config', {
      enabled: form.value.enabled,
      check_interval_minutes: form.value.checkInterval,
      thresholds: form.value.thresholds,
      email_domain: form.value.emailDomain,
    })
    ElMessage.success('配置已保存（间隔/开关修改需重启服务生效）')
  } catch {
    ElMessage.error('保存配置失败，请检查网络或登录状态')
  }
}

async function loadTemplate() {
  try {
    const resp = await api.get('/api/admin/email-template')
    template.value.subject = resp.data.subject
    template.value.bodyHtml = resp.data.body_html
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } }).response?.status
    if (status === 401) {
      ElMessage.error('登录已过期，请重新登录')
    } else {
      ElMessage.error('加载模板失败，请刷新页面重试')
    }
  }
}

async function loadVariables() {
  try {
    const resp = await api.get('/api/admin/email-template/variables')
    variables.value = resp.data
  } catch {
    // ignore
  }
}

async function handlePreview() {
  try {
    const resp = await api.post('/api/admin/email-template/preview', {
      subject: template.value.subject,
      body_html: template.value.bodyHtml,
    })
    previewData.value = { subject: resp.data.subject, bodyHtml: resp.data.body_html }
    previewVisible.value = true
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } }).response?.status
    ElMessage.error(status === 401 ? '登录已过期，请重新登录' : '预览失败，请检查模板内容')
  }
}

async function handleSave() {
  try {
    await api.put('/api/admin/email-template', {
      subject: template.value.subject,
      body_html: template.value.bodyHtml,
    })
    ElMessage.success('模板保存成功')
  } catch (e: unknown) {
    const status = (e as { response?: { status?: number } }).response?.status
    ElMessage.error(status === 401 ? '登录已过期，请重新登录' : '保存失败，请稍后重试')
  }
}

function handleReset() {
  template.value.subject = DEFAULT_SUBJECT
  template.value.bodyHtml = DEFAULT_BODY
  ElMessage.success('已重置为默认模板（请点击"保存模板"生效）')
}

onMounted(() => {
  loadConfig()
  loadTemplate()
  loadVariables()
})
</script>
