<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div style="max-width: 900px; margin: 0 auto; padding: 24px;">
    <el-card>
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 18px; font-weight: 600;">API Token 管理</span>
          <el-button type="primary" @click="showCreate = true">新建 Token</el-button>
        </div>
      </template>

      <el-table :data="tokens" v-loading="loading" empty-text="暂无 Token">
        <el-table-column label="名称" prop="name" min-width="120" />
        <el-table-column label="Token" min-width="140">
          <template #default="{ row }">
            <code>{{ row.token_prefix }}...</code>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.created_at) }}</template>
        </el-table-column>
        <el-table-column label="到期时间" min-width="160">
          <template #default="{ row }">{{ formatTime(row.expires_at) }}</template>
        </el-table-column>
        <el-table-column label="最后使用" min-width="160">
          <template #default="{ row }">{{ row.last_used_at ? formatTime(row.last_used_at) : '从未' }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="statusType(row)" size="small">{{ statusLabel(row) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-popconfirm
              title="确定撤销此 Token？撤销后无法恢复。"
              @confirm="handleRevoke(row.id)"
              v-if="!row.revoked_at"
            >
              <template #reference>
                <el-button type="danger" size="small" link :disabled="!!row.revoked_at">撤销</el-button>
              </template>
            </el-popconfirm>
            <el-tag v-else type="info" size="small">已撤销</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- Create Dialog -->
    <el-dialog v-model="showCreate" title="新建 API Token" width="460px" :close-on-click-modal="false">
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称" required>
          <el-input v-model="form.name" placeholder="如：报表脚本" maxlength="100" />
        </el-form-item>
        <el-form-item label="有效期" required>
          <el-select v-model="form.expires_months" style="width: 100%;">
            <el-option :value="3" label="3 个月" />
            <el-option :value="6" label="6 个月" />
            <el-option :value="12" label="12 个月" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showCreate = false">取消</el-button>
        <el-button type="primary" @click="handleCreate" :loading="creating">创建</el-button>
      </template>
    </el-dialog>

    <!-- Token Display Dialog -->
    <el-dialog v-model="showToken" title="Token 已创建" width="520px" :close-on-click-modal="false">
      <el-alert type="error" :closable="false" style="margin-bottom: 16px;">
        请立即复制保存，关闭后无法再次查看！
      </el-alert>
      <el-input v-model="newToken" readonly>
        <template #append>
          <el-button @click="copyToken">复制</el-button>
        </template>
      </el-input>
      <template #footer>
        <el-button type="primary" @click="showToken = false">我已保存</el-button>
      </template>
    </el-dialog>

    <!-- API Documentation -->
    <el-card style="margin-top: 20px;">
      <el-collapse>
        <el-collapse-item title="API 接口说明" name="docs">
          <div class="api-docs">
            <h4>认证方式</h4>
            <p>在请求头中添加：</p>
            <pre><code>Authorization: Bearer pat_xxxxxxxx...</code></pre>

            <h4>个人接口</h4>
            <el-table :data="userApis" size="small" :show-header="true" style="margin-bottom: 16px;">
              <el-table-column label="接口" prop="path" width="260" />
              <el-table-column label="说明" prop="desc" />
            </el-table>

            <template v-if="auth.role === 'admin'">
              <h4>管理员接口</h4>
              <el-table :data="adminApis" size="small" :show-header="true" style="margin-bottom: 16px;">
                <el-table-column label="接口" prop="path" width="320" />
                <el-table-column label="说明" prop="desc" />
              </el-table>
            </template>

            <h4>示例</h4>
            <p><strong>curl：</strong></p>
            <pre><code>{{ curlExample }}</code></pre>

            <p><strong>Python：</strong></p>
            <pre><code>{{ pythonExample }}</code></pre>
          </div>
        </el-collapse-item>
      </el-collapse>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import api from '@/api'
import { useAuthStore } from '@/stores/auth'

const auth = useAuthStore()
const tokens = ref<any[]>([])
const loading = ref(false)
const showCreate = ref(false)
const showToken = ref(false)
const newToken = ref('')
const creating = ref(false)
const form = ref({ name: '', expires_months: 6 })

const baseUrl = window.location.origin

const curlExample = computed(() =>
  `curl -H "Authorization: Bearer pat_xxxxxxxx..." \\\n  ${baseUrl}/api/v1/usage/summary?scope=month`
)

const pythonExample = computed(() =>
  `import requests\n\nresp = requests.get(\n    "${baseUrl}/api/v1/usage/summary",\n    params={"scope": "month"},\n    headers={"Authorization": "Bearer pat_xxxxxxxx..."},\n)\nprint(resp.json())`
)

const userApis = [
  { path: 'GET /api/v1/usage/summary', desc: '个人用量汇总（scope=month/week/today）' },
  { path: 'GET /api/v1/usage/detail', desc: '个人使用明细' },
  { path: 'GET /api/v1/usage/quota', desc: '个人配额状态' },
]

const adminApis = [
  { path: 'GET /api/v1/admin/leaderboard', desc: '用量排行榜' },
  { path: 'GET /api/v1/admin/users', desc: '用户列表' },
  { path: 'GET /api/v1/admin/department-summary', desc: '部门汇总' },
]

function formatTime(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function statusType(row: any): '' | 'success' | 'warning' | 'danger' | 'info' {
  if (row.revoked_at) return 'info'
  const now = Date.now()
  const exp = new Date(row.expires_at).getTime()
  if (exp < now) return 'danger'
  if (exp - now < 7 * 86400000) return 'warning'
  return 'success'
}

function statusLabel(row: any): string {
  if (row.revoked_at) return '已撤销'
  const now = Date.now()
  const exp = new Date(row.expires_at).getTime()
  if (exp < now) return '已过期'
  if (exp - now < 7 * 86400000) return '即将过期'
  return '活跃'
}

async function fetchTokens() {
  loading.value = true
  try {
    const res = await api.get('/tokens')
    tokens.value = res.data
  } catch {
    ElMessage.error('获取 Token 列表失败')
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  if (!form.value.name.trim()) {
    ElMessage.warning('请输入 Token 名称')
    return
  }
  creating.value = true
  try {
    const res = await api.post('/tokens', form.value)
    newToken.value = res.data.token
    showCreate.value = false
    showToken.value = true
    form.value = { name: '', expires_months: 6 }
    fetchTokens()
  } catch (e: any) {
    ElMessage.error(e.response?.data?.detail || '创建失败')
  } finally {
    creating.value = false
  }
}

async function handleRevoke(id: number) {
  try {
    await api.delete(`/tokens/${id}`)
    ElMessage.success('Token 已撤销')
    fetchTokens()
  } catch {
    ElMessage.error('撤销失败')
  }
}

function copyToken() {
  const text = newToken.value
  // Clipboard API 需要 HTTPS，内网 HTTP 环境降级用 execCommand
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(() => {
      ElMessage.success('已复制到剪贴板')
    }).catch(() => fallbackCopy(text))
  } else {
    fallbackCopy(text)
  }
}

function fallbackCopy(text: string) {
  const el = document.createElement('textarea')
  el.value = text
  el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
  document.body.appendChild(el)
  el.focus()
  el.select()
  const ok = document.execCommand('copy')
  document.body.removeChild(el)
  if (ok) {
    ElMessage.success('已复制到剪贴板')
  } else {
    ElMessage.warning('自动复制失败，请手动选中文本复制')
  }
}

onMounted(fetchTokens)
</script>

<style scoped>
.api-docs h4 {
  margin: 16px 0 8px;
  font-size: 14px;
  color: #303133;
}
.api-docs h4:first-child {
  margin-top: 0;
}
.api-docs pre {
  background: #f5f7fa;
  padding: 12px;
  border-radius: 4px;
  font-size: 13px;
  overflow-x: auto;
}
.api-docs p {
  margin: 4px 0;
  font-size: 13px;
  color: #606266;
}
</style>
