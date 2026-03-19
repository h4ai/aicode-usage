# SkillHub 前端覆盖率审查报告

## 1. 概述
本次检查对照了 `SPEC-001` 到 `SPEC-006`，旨在识别当前 SkillHub 项目中缺失的 Web 前端页面和交互组件。目前后端 API 和 CLI 已实现核心逻辑，但 Web 界面**完全缺失**，导致用户只能通过命令行操作。

## 2. SPEC 定义的全部前端页面清单与状态对照

| 模块 | 页面/组件 | SPEC | 状态 | 备注 |
|---|---|---|---|---|
| **认证** | Login Page (LoginForm) | 001 | ❌ 未实现 | 目前无登录界面 |
| | UserProfileMenu (右上角登出) | 001 | ❌ 未实现 | |
| **Skill 市场** | Skill 市场大厅 (Marketplace) | 002 | ❌ 未实现 | 按热度/最新排序、分类/标签过滤 |
| | SkillDetail (详情页+下载趋势图) | 002 | ❌ 未实现 | 后端有接口但无前端 |
| | CategoryFilter / TagCloud | 002 | ❌ 未实现 | |
| | My Skills (我的发布) | 002 | ❌ 未实现 | |
| **发布与版本** | VersionUploader (ZIP上传+表单) | 003 | ❌ 未实现 | 含进度条、ZIP炸弹校验等 |
| | GitSourceSelector (Git仓库发布) | 002,006 | ❌ 未实现 | |
| | VisibilitySelector (可见性+部门) | 002 | ❌ 未实现 | |
| | VersionHistoryTable (历史版本表) | 003 | ❌ 未实现 | |
| | FileListView (包内文件预览) | 003 | ❌ 未实现 | |
| **搜索** | OmniSearchBar (顶部全局搜索) | 004 | ❌ 未实现 | 语义搜索入口，支持联想 |
| | SearchResults (混合结果展示) | 004 | ❌ 未实现 | |
| **审核后台** | Review Dashboard (审核工作台) | 005 | ❌ 未实现 | |
| | ScanReportView (自动扫描报告) | 005 | ❌ 未实现 | 红黄绿灯展示 |
| | CodeDiffViewer (版本Diff) | 005 | ❌ 未实现 | 进阶功能 |
| | DecisionPanel (审批决策面板) | 005 | ❌ 未实现 | Approve/Reject/Revision |
| | ReviewTimeline (审核时间线) | 005 | ❌ 未实现 | |
| **模板市场** | 模板列表页 (Templates) | 006 | ❌ 未实现 | 类似于 Skill 市场 |
| | 模板详情页 (Template Detail) | 006 | ❌ 未实现 | 一键复制安装命令 |
| | Web上传模板流程 | 006 | ❌ 未实现 | 含 `template.json` 在线编辑 |
| **管理员后台** | 管理后台总览页 (Admin Dashboard)| 002,006 | ❌ 未实现 | 后端已有 `/admin/dashboard` 接口 |
| | 使用统计页 (用户/资源多维分析) | 002,006 | ❌ 未实现 | 支持 CSV 导出（后端已支持） |

## 3. 用户操作流程分析 (当前可用性)

1. **用户上传 Skill/Template**：当前只能通过 CLI (`skillhub publish`)，且如果没有凭证或需 ZIP 发布门槛较高，**Web 端不可用**。
2. **用户搜索与发现**：当前只能通过 CLI (`skillhub search`) 看到文本列表，缺乏图文并茂的卡片展示、标签过滤、Readme 渲染，**发现效率极低**。
3. **用户下载/安装**：CLI (`skillhub install / init`) 功能可用，但用户不知道有哪些 ID 可以装，强依赖 Web 市场的展示。
4. **审核人进行审批**：目前完全没有前端界面，审核人无法方便地查看扫描报告、阅读代码或填写意见，导致 **审批流实际上无法运转**。
5. **管理员查看数据**：后端有 `/api/v1/admin/dashboard` 接口并支持 CSV 导出，但没有图表或看板页面，**管理员无法直观看到系统价值**。

## 4. 缺失项优先级排序

*   **P0 (Blocker，无法完成核心业务闭环)**：
    *   **登录页 (Login) + 全局 Layout**：没有登录就没法用 Web。
    *   **Skill 市场大厅 + 详情页 + 搜索栏**：解决“不知道有什么”的问题。
    *   **审核工作台 (Review Dashboard) + 决策面板**：解决“发布卡点”，没有界面审核人无法工作。
*   **P1 (体验缺失，必须尽快补齐)**：
    *   **我的发布 (My Skills) + VersionUploader**：降低发布门槛，支持拖拽上传 ZIP。
    *   **模板市场 (Templates)**：展现高阶功能的入口。
    *   **管理员看板 (Admin Stats)**：管理层视角的价值体现。
*   **P2 (锦上添花，可延后)**：
    *   在线 `template.json` 编辑器。
    *   CodeDiffViewer (代码变更比对)。
    *   GitSourceSelector (可先在 CLI 用)。

## 5. 补全建议

目前 `src/` 下全为 NestJS 后端和 CLI 逻辑，没有任何前端项目。

**技术选型建议**：
*   **框架**: React + Vite 或 Next.js (如果需要 SEO，但内网系统 React SPA 足矣)。
*   **UI 库**: Ant Design 或 MUI（适合中后台，带现成的表格、表单、图表组件）。
*   **状态管理**: Zustand + React Query (用于优雅处理后端 API 请求和缓存)。
*   **路由**: React Router。

**Sprint 规划 (预估 3-4 个 Sprint 补齐)**：
*   **Sprint 1 (核心发现与认证)**：搭建 React 框架，完成 LDAP 登录页、布局、Skill 市场列表、顶部搜索、简单的详情页。
*   **Sprint 2 (发布与审批闭环)**：我的发布页、拖拽上传组件、**审核工作台**（ScanReportView + DecisionPanel），打通发布到上架的流程。
*   **Sprint 3 (模板与统计)**：模板列表与详情、管理员数据看板接入后端 Dashboard API，整合 Chart.js/ECharts 渲染下载趋势图。
