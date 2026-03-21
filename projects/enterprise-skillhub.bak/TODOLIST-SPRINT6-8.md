# Enterprise SkillHub — Sprint 6~8 任务管理

> 创建时间: 2026-03-20 02:22
> PM: 项目经理 Agent
> 状态: 📋 规划中

---

## 📌 Sprint 总览

| Sprint | 主题 | 预计时间 | 状态 |
|--------|------|---------|------|
| Sprint 6 | 核心：命名空间 + 模板 CRUD + CLI init + AI 适配 | P0 | 📋 规划中 |
| Sprint 7 | 完善：Git 集成 + 模板更新 + Skill 同步 | P0 | 📋 待排 |
| Sprint 8 | 增强：下载统计 + 管理后台 + Web 前端 | P1 | 📋 待排 |

---

## Sprint 6: 核心模板系统

### 模块 1: 命名空间管理
- [ ] **NS-1** Prisma Schema: Namespace + NamespaceMember 模型 `[S]`
- [ ] **NS-2** POST /api/v1/namespaces — 创建命名空间 `[S]`
- [ ] **NS-3** GET /api/v1/namespaces — 列出我的命名空间 `[S]`
- [ ] **NS-4** POST /namespaces/:id/members — 添加/管理成员 `[M]`
- [ ] **NS-5** 权限控制: ADMIN/MEMBER 角色 + 保留命名空间拦截 `[M]`
- [ ] **NS-6** 单元测试 + e2e 测试 `[M]`

### 模块 2: 模板 CRUD + 版本管理
- [ ] **TPL-1** Prisma Schema: Template + TemplateVersion + TemplateSkill `[S]`
- [ ] **TPL-2** POST /api/v1/templates — 创建模板 `[M]`
- [ ] **TPL-3** GET /api/v1/templates — 列表+搜索+过滤 `[M]`
- [ ] **TPL-4** POST /templates/:id/versions — 上传版本 (ZIP) `[L]`
- [ ] **TPL-5** GET /templates/:id/versions/:v — 版本详情 `[S]`
- [ ] **TPL-6** POST /templates/:id/versions/:v/publish — 提交审核（复用 SPEC-005） `[M]`
- [ ] **TPL-7** GET /templates/resolve — 解析模板+依赖 `[M]`
- [ ] **TPL-8** 模板继承（extends）逻辑 `[L]`
- [ ] **TPL-9** 单元测试 + e2e 测试 `[L]`

### 模块 3: CLI 初始化引擎
- [ ] **CLI-1** `skillhub init` 命令框架（Commander/Yargs） `[M]`
- [ ] **CLI-2** 模板下载 + 解压引擎 `[M]`
- [ ] **CLI-3** AI 工具适配器 — Claude Code (.claude/) `[M]`
- [ ] **CLI-4** AI 工具适配器 — Cursor (.cursor/) `[S]`
- [ ] **CLI-5** AI 工具适配器 — CodeBuddy (.codebuddy/) `[S]`
- [ ] **CLI-6** AI 工具适配器 — Windsurf (.windsurf/) `[S]`
- [ ] **CLI-7** AI 工具适配器 — 通用 fallback (.ai/) `[S]`
- [ ] **CLI-8** 模板变量替换引擎 (Handlebars) `[M]`
- [ ] **CLI-9** 条件文件包含（feature flags） `[M]`
- [ ] **CLI-10** Post-init hooks 执行 `[M]`
- [ ] **CLI-11** Skill 依赖自动安装到 AI 工具目录 `[L]`
- [ ] **CLI-12** `skillhub template list/search/info` 命令 `[M]`
- [ ] **CLI-13** `skillhub template publish` 命令 `[M]`
- [ ] **CLI-14** CLI 测试（单元 + 集成） `[L]`

### Sprint 6 统计
- 任务数: 23
- 预估: 6S + 10M + 5L = ~20 人天

---

## Sprint 7: Git 集成 + 更新机制

### 模块 4: Git 仓库集成
- [ ] **GIT-1** Prisma Schema: GitCredential + SourceType `[S]`
- [ ] **GIT-2** Git 凭证 CRUD API `[M]`
- [ ] **GIT-3** 凭证连通性测试 API `[M]`
- [ ] **GIT-4** 凭证 AES-256 加密存储 `[M]`
- [ ] **GIT-5** Git clone + 打包引擎（shallow clone → ZIP → MinIO） `[L]`
- [ ] **GIT-6** Git subPath 支持（monorepo） `[M]`
- [ ] **GIT-7** clone SSRF 防护（URL 白名单） `[M]`
- [ ] **GIT-8** clone 超时限制 (60s) + 大小限制 (500MB) `[S]`
- [ ] **GIT-9** Webhook 端点 (POST /webhooks/git) `[L]`
- [ ] **GIT-10** Webhook secret 签名验证 `[M]`
- [ ] **GIT-11** CLI: `skillhub init --git` 直接从 Git 初始化 `[M]`
- [ ] **GIT-12** CLI: `skillhub git-credential add/list/test` `[M]`
- [ ] **GIT-13** 单元测试 + e2e 测试 `[L]`

### 模块 5: 模板更新机制
- [ ] **UPD-1** .skillhub/template.lock 文件生成 `[M]`
- [ ] **UPD-2** `skillhub template update` — hash 对比 + 选择性更新 `[L]`
- [ ] **UPD-3** 冲突文件生成 (.skillhub/conflicts/) `[M]`
- [ ] **UPD-4** `skillhub template update --dry-run` 预览 `[M]`
- [ ] **UPD-5** `skillhub template outdated` 版本检查 `[M]`
- [ ] **UPD-6** 单元测试 + e2e 测试 `[L]`

### 模块 6: Skill 依赖同步
- [ ] **SYNC-1** Prisma Schema: TemplateSkillLock `[S]`
- [ ] **SYNC-2** SemVer 范围解析引擎 (^/~/精确) `[M]`
- [ ] **SYNC-3** Skill 新版本发布时扫描关联 Template `[M]`
- [ ] **SYNC-4** 自动更新 resolvedVersion（范围内） `[M]`
- [ ] **SYNC-5** Major 变更通知（站内 + Webhook） `[M]`
- [ ] **SYNC-6** 依赖查询/手动重解析 API `[S]`
- [ ] **SYNC-7** 单元测试 + e2e 测试 `[L]`

### Sprint 7 统计
- 任务数: 26
- 预估: 4S + 14M + 5L + 0XL = ~23 人天

---

## Sprint 8: 统计 + Web 增强

### 模块 7: 下载统计 + 用户追踪
- [ ] **STAT-1** Prisma Schema: DownloadLog + downloadCount/weeklyDownloads `[S]`
- [ ] **STAT-2** 下载时写入 DownloadLog + downloadCount++ `[M]`
- [ ] **STAT-3** Redis 去重（同用户同版本 1h） `[M]`
- [ ] **STAT-4** 定时任务: 每周刷新 weeklyDownloads `[M]`
- [ ] **STAT-5** GET /stats/top-skills + top-templates `[M]`
- [ ] **STAT-6** GET /stats/user-downloads — 用户下载历史 `[M]`
- [ ] **STAT-7** GET /admin/download-logs — 明细日志 + CSV 导出 `[L]`
- [ ] **STAT-8** GET /admin/usage-report — 使用报告 `[L]`
- [ ] **STAT-9** 单元测试 + e2e 测试 `[L]`

### 模块 8: Web 前端增强
- [ ] **WEB-1** 模板 Tab + 列表页（卡片 + 筛选 + 排序） `[L]`
- [ ] **WEB-2** 模板详情页（版本历史 + 依赖 + 安装命令 + 趋势图） `[L]`
- [ ] **WEB-3** Web 端上传模板（ZIP + manifest 在线编辑） `[XL]`
- [ ] **WEB-4** Git 来源选择器（Web 端配置 Git URL） `[M]`
- [ ] **WEB-5** 管理后台 — 统计总览看板 `[L]`
- [ ] **WEB-6** 管理后台 — 用户下载明细页 `[L]`
- [ ] **WEB-7** 管理后台 — 资源使用分析页 `[L]`
- [ ] **WEB-8** 列表默认热门排序 (weeklyDownloads DESC) `[S]`
- [ ] **WEB-9** 前端测试 `[L]`

### Sprint 8 统计
- 任务数: 18
- 预估: 2S + 5M + 8L + 1XL = ~24 人天

---

## 📊 全局统计

| 维度 | 数量 |
|------|------|
| 总任务数 | **67** |
| Sprint 6 | 23 任务 (~20 人天) |
| Sprint 7 | 26 任务 (~23 人天) |
| Sprint 8 | 18 任务 (~24 人天) |
| **总预估** | **~67 人天** |
| Spec AC 覆盖 | SPEC-006: 22 条 + SPEC-002: 10 条 = **32 条** |

---

## 🔗 依赖关系

```
Sprint 6 (基础)
  NS-* → TPL-* → CLI-*
         ↓
Sprint 7 (扩展)
  GIT-* → UPD-* → SYNC-*
                    ↓
Sprint 8 (增强)
  STAT-* → WEB-*
```

---

## 📋 文档清单

| 文档 | 状态 |
|------|------|
| SPEC-006.md (模板系统) | ✅ v0.4 approved |
| SPEC-002.md (Skill 管理更新) | ✅ v0.2 approved |
| USER-STORIES-SPRINT6-8.md | 🔄 PO 编写中 |
| TEST-PLAN-SPRINT6-8.md | 🔄 QA 编写中 |
| TODOLIST-SPRINT6-8.md (本文件) | ✅ 已创建 |

---

## 变更记录

| 日期 | 变更 | 作者 |
|------|------|------|
| 2026-03-20 | 初始创建，67 个任务 | PM Agent |
