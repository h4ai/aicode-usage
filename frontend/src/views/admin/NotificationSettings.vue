<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- 通知设置管理页面 -->

<template>
  <div class="notification-settings">
    <el-card>
      <template #header>
        <span>邮件通知设置</span>
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
        </el-form-item>

        <!-- 触发阈值 -->
        <el-form-item label="触发阈值">
          <el-input-number v-model="form.thresholds[0]" :min="0" :max="100" style="width: 100px" />%
          <el-input-number v-model="form.thresholds[1]" :min="0" :max="100" style="width: 100px; margin-left: 10px" />%
          <el-input-number v-model="form.thresholds[2]" :min="0" :max="100" style="width: 100px; margin-left: 10px" />%
        </el-form-item>

        <!-- 邮件域名 -->
        <el-form-item label="邮件域名">
          <el-input v-model="form.emailDomain" placeholder="example.com" style="width: 300px" />
        </el-form-item>
      </el-form>
    </el-card>

    <el-card style="margin-top: 20px">
      <template #header>
        <span>邮件模板编辑</span>
      </template>

      <el-form label-width="120px">
        <el-form-item label="邮件标题">
          <el-input v-model="template.subject" placeholder="邮件标题（支持占位符）" />
        </el-form-item>

        <el-form-item label="邮件正文">
          <el-input
            v-model="template.bodyHtml"
            type="textarea"
            :rows="8"
            placeholder="HTML 正文（支持占位符）"
          />
        </el-form-item>

        <el-form-item label="占位符列表">
          <el-tag
            v-for="v in variables"
            :key="v.name"
            style="margin-right: 8px; margin-bottom: 4px"
            type="info"
          >
            {{ '{{' + v.name + '}}' }} - {{ v.description }}
          </el-tag>
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="handlePreview">预览</el-button>
          <el-button type="success" @click="handleSave">保存模板</el-button>
          <el-button @click="handleReset">重置默认</el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <!-- 预览对话框 -->
    <el-dialog v-model="previewVisible" title="邮件预览" width="600px">
      <h4>{{ previewData.subject }}</h4>
      <div v-html="previewData.bodyHtml"></div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'

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

const DEFAULT_SUBJECT = '【AI Code Usage】您的{{quota_type_label}}用量已达 {{threshold}}'
const DEFAULT_BODY = `<p>您好 {{username}}（{{user_id}}），</p>
<p>您的 <strong>{{quota_type_label}}</strong> 在 {{period}} 已使用 <strong>{{percent}}</strong>（{{used}} / {{limit}}）。</p>
<p>当前触发阈值：{{threshold}}。</p>
<p>配额将于 {{reset_time}} 自动重置，如需提升配额请联系管理员。</p>
<p>— AI Code Usage 系统</p>`

async function loadTemplate() {
  try {
    const resp = await api.get('/api/admin/email-template')
    template.value.subject = resp.data.subject
    template.value.bodyHtml = resp.data.body_html
  } catch {
    ElMessage.error('加载模板失败')
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
  } catch {
    ElMessage.error('预览失败')
  }
}

async function handleSave() {
  try {
    await api.put('/api/admin/email-template', {
      subject: template.value.subject,
      body_html: template.value.bodyHtml,
    })
    ElMessage.success('模板保存成功')
  } catch {
    ElMessage.error('保存失败')
  }
}

function handleReset() {
  template.value.subject = DEFAULT_SUBJECT
  template.value.bodyHtml = DEFAULT_BODY
  ElMessage.success('已重置为默认模板（请点击保存生效）')
}

onMounted(() => {
  loadTemplate()
  loadVariables()
})
</script>
