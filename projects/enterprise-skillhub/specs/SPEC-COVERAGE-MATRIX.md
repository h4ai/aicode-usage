# SPEC 覆盖矩阵 — Enterprise SkillHub 全量追踪

> 版本: v1.0 | 创建: 2026-03-20
> 防线 1 产出物：PM 对每个 SPEC 的每个章节进行 Sprint 归属标注
> 原则："没有被追踪的延后，就是被遗忘的承诺"

---

## 总览

| SPEC | 模块 | 总章节 | Sprint 1-5 | Sprint 6-8 | Sprint F1-F3 | 累计覆盖 |
|------|------|--------|-----------|-----------|-------------|---------|
| 001 | 认证 & AD | 8 | 7/8 (§5延后) | - | 1/8 (§5) | **8/8 = 100%** |
| 002 | Skill CRUD & 统计 | 9 | 7/9 (§5,§5.5延后) | 1/9 (§5.5 CLI) | 1/9 (§5) | **9/9 = 100%** |
| 003 | 版本管理 | 8 | 7/8 (§5延后) | - | 1/8 (§5) | **8/8 = 100%** |
| 004 | 搜索 & Embedding | 9 | 8/9 (§6延后) | - | 1/9 (§6) | **9/9 = 100%** |
| 005 | 审核工作流 | 8 | 7/8 (§5延后) | - | 1/8 (§5) | **8/8 = 100%** |
| 006 | 模板+命名空间+CLI | 7 | - | 7/7 | - | **7/7 = 100%** |
| 007 | 前端 Web UI | 8 | - | - | 8/8 | **8/8 = 100%** |

**计划完成后总覆盖率: 57 章节 / 57 章节 = 100%**

---

## SPEC-001: 用户认证 & AD 域集成

| 章节 | 内容 | Sprint 归属 | 状态 | 备注 |
|------|------|-----------|------|------|
| §1 概述 | 功能范围定义 | Sprint 1 | ✅ 已实现 | |
| §2 数据模型 | User Prisma Schema | Sprint 1 | ✅ 已实现 | |
| §3 API 接口 | /auth/login, /auth/me, /auth/logout | Sprint 1 | ✅ 已实现 | |
| §4 业务规则 | LDAP bind + JWT + role mapping | Sprint 1 | ✅ 已实现 | |
| **§5 前端组件** | **Login Page + UserProfileMenu** | **Sprint F1** | ⏭️ 延后 | SPEC-007 AC-F1 覆盖 |
| §6 安全要求 | LDAP 注入防护 + JWT 过期 | Sprint 1 | ✅ 已实现 | |
| §7 验收标准 | AC-1~5 | Sprint 1 | ✅ 已通过 | |
| §8 变更记录 | - | Sprint 1 | ✅ | |

**本 SPEC 当前覆盖率: 7/8 = 87.5% → Sprint F1 后 100%**

---

## SPEC-002: Skill 数据模型 & CRUD & 下载统计

| 章节 | 内容 | Sprint 归属 | 状态 | 备注 |
|------|------|-----------|------|------|
| §1 概述 | Skill 管理范围 | Sprint 2 | ✅ 已实现 | |
| §2 数据模型 | Skill/Version/File/DownloadLog Schema | Sprint 2 + Sprint 8 | ✅ 已实现 | Sprint 8 补了 DownloadLog |
| §3 API 接口 | Skills CRUD + Stats + Admin | Sprint 2 + Sprint 8 | ✅ 已实现 | Sprint 8 补了统计端点 |
| §4 业务规则 | 可见性/slug/分页/缓存 | Sprint 2 | ✅ 已实现 | |
| **§5 前端组件** | **Marketplace + Detail + My Skills + Stats** | **Sprint F1-F2** | ⏭️ 延后 | SPEC-007 AC-F2 覆盖 |
| §5.5 CLI 操作 | skillhub publish --git / install --git | Sprint 6 | ✅ 已实现 | |
| §6 安全要求 | IDOR 防范 + 部门可见性 Guard | Sprint 2 | ✅ 已实现 | |
| §7 验收标准 | AC 全部 | Sprint 2+8 | ✅ 已通过 | |
| §8 变更记录 | - | Sprint 2 | ✅ | |

**本 SPEC 当前覆盖率: 8/9 = 88.9% → Sprint F1-F2 后 100%**

---

## SPEC-003: 版本管理 & 文件存储

| 章节 | 内容 | Sprint 归属 | 状态 | 备注 |
|------|------|-----------|------|------|
| §1 概述 | 版本管理范围 | Sprint 3 | ✅ 已实现 | |
| §2 数据模型 | SkillVersion + SkillFile | Sprint 3 | ✅ 已实现 | |
| §3 API 接口 | 版本 CRUD + 文件上传/下载 | Sprint 3 | ✅ 已实现 | |
| §4 业务规则 | semver 校验 + MinIO 存储 | Sprint 3 | ✅ 已实现 | |
| **§5 前端组件** | **VersionUploader + VersionHistory + FileListView** | **Sprint F2** | ⏭️ 延后 | SPEC-007 AC-F4 覆盖 |
| §6 安全要求 | ZIP 炸弹防护 + 文件大小限制 | Sprint 3 | ✅ 已实现 | |
| §7 验收标准 | AC 全部 | Sprint 3 | ✅ 已通过 | |
| §8 变更记录 | - | Sprint 3 | ✅ | |

**本 SPEC 当前覆盖率: 7/8 = 87.5% → Sprint F2 后 100%**

---

## SPEC-004: 向量搜索 & Embedding

| 章节 | 内容 | Sprint 归属 | 状态 | 备注 |
|------|------|-----------|------|------|
| §1 概述 | 搜索功能范围 | Sprint 4 | ✅ 已实现 | |
| §2 数据模型 | pgvector 向量字段 | Sprint 4 | ✅ 已实现 | |
| §3 BGE-M3 服务协议 | Embedding API 接口 | Sprint 4 | ✅ 已实现 | |
| §4 API 接口 | /search 端点 | Sprint 4 | ✅ 已实现 | |
| §5 业务规则 | 混合搜索策略 + 权重 | Sprint 4 | ✅ 已实现 | |
| **§6 前端组件** | **OmniSearchBar + SearchResults** | **Sprint F1** | ⏭️ 延后 | SPEC-007 AC-F3 覆盖 |
| §7 安全要求 | 搜索注入防护 | Sprint 4 | ✅ 已实现 | |
| §8 验收标准 | AC 全部 | Sprint 4 | ✅ 已通过 | |
| §9 变更记录 | - | Sprint 4 | ✅ | |

**本 SPEC 当前覆盖率: 8/9 = 88.9% → Sprint F1 后 100%**

---

## SPEC-005: 审核工作流引擎

| 章节 | 内容 | Sprint 归属 | 状态 | 备注 |
|------|------|-----------|------|------|
| §1 概述 | 审核流程范围 | Sprint 5 | ✅ 已实现 | |
| §2 数据模型 | SkillReview + ReviewPolicy | Sprint 5 | ✅ 已实现 | |
| §3 API 接口 | 审核 CRUD + 审批/驳回 | Sprint 5 | ✅ 已实现 | |
| §4 业务规则 | 4 阶段扫描 + 状态机 | Sprint 5 | ✅ 已实现 | |
| **§5 前端组件** | **ReviewDashboard + ScanReport + DecisionPanel + CodeDiff + Timeline** | **Sprint F2** | ⏭️ 延后 | SPEC-007 AC-F5 覆盖 |
| §6 安全要求 | 审核人权限隔离 | Sprint 5 | ✅ 已实现 | |
| §7 验收标准 | AC 全部 | Sprint 5 | ✅ 已通过 | |
| §8 变更记录 | - | Sprint 5 | ✅ | |

**本 SPEC 当前覆盖率: 7/8 = 87.5% → Sprint F2 后 100%**

---

## SPEC-006: 模板系统 + 命名空间 + CLI + AI 适配器

| 章节 | 内容 | Sprint 归属 | 状态 | 备注 |
|------|------|-----------|------|------|
| §1 概述 | 模板+命名空间范围 | Sprint 6 | ✅ 已实现 | |
| §2 数据模型 | Namespace/Template/TemplateVersion/TemplateSkill/GitCredential | Sprint 6 | ✅ 已实现 | |
| §3 API 设计 | 命名空间+模板+Git CRUD | Sprint 6-7 | ✅ 已实现 | |
| §4 业务逻辑 | 权限+继承+SemVer 同步 | Sprint 6-7 | ✅ 已实现 | |
| §5 脚手架引擎 | CLI init + 5 种 AI 适配 | Sprint 6 | ✅ 已实现 | |
| §6 融合点 | 与 Skill 系统的关联 | Sprint 7 | ✅ 已实现 | |
| §7 验收标准 | AC 全部 | Sprint 6-8 | ✅ 已通过 | |

**本 SPEC 当前覆盖率: 7/7 = 100% ✅**
注：SPEC-006 没有独立的前端章节（模板前端页面归入 SPEC-007）

---

## SPEC-007: 前端 Web UI（新增）

| 章节 | 内容 | Sprint 归属 | 状态 | 备注 |
|------|------|-----------|------|------|
| §1 概述 | 前端 Web UI 范围 | Sprint F1 | 🆕 待开发 | |
| §2 技术选型 | TanStack Start + React + Tailwind | Sprint F1 | 🆕 待开发 | 框架搭建 |
| §3 页面清单 & 路由 | 10 页面完整路由表 | Sprint F1-F3 | 🆕 待开发 | |
| §4 组件设计 | 全局+业务组件 | Sprint F1-F3 | 🆕 待开发 | |
| §5 数据层 | Axios + TanStack Query + Zustand | Sprint F1 | 🆕 待开发 | |
| §6 安全要求 | JWT Cookie + CSRF + XSS + 路由守卫 | Sprint F1 | 🆕 待开发 | |
| §7 验收标准 | AC-F1~F6 | Sprint F1-F3 | 🆕 待开发 | |
| §8 Sprint 拆分 | F1(1w) + F2(1.5w) + F3(1w) | - | 📋 规划文档 | |

**本 SPEC 当前覆盖率: 0/8 = 0% → Sprint F1-F3 后 100%**

---

## 前端 Sprint 详细覆盖计划

### Sprint F1: 发现与认证闭环 (1 周)

| 来源 SPEC | 章节 | 要实现的内容 | AC |
|----------|------|-----------|-----|
| SPEC-001 §5 | Login Page + UserProfileMenu | AC-F1 |
| SPEC-002 §5 | Marketplace 列表 + SkillCard + CategoryFilter | AC-F2 |
| SPEC-002 §5 | Skill 详情页 | AC-F2 |
| SPEC-004 §6 | OmniSearchBar + SearchResults | AC-F3 |
| SPEC-007 §2 | 框架搭建 + 项目结构 + Axios Client | - |
| SPEC-007 §5 | 数据层（TanStack Query + Zustand） | - |
| SPEC-007 §6 | JWT 拦截器 + 路由守卫 | - |

**Sprint F1 覆盖率增量**: +4 章节 (SPEC-001§5 + SPEC-002§5 + SPEC-004§6 + SPEC-007 基础)

### Sprint F2: 发布与审核闭环 (1.5 周)

| 来源 SPEC | 章节 | 要实现的内容 | AC |
|----------|------|-----------|-----|
| SPEC-003 §5 | VersionUploader + VersionHistory + FileListView | AC-F4 |
| SPEC-005 §5 | ReviewDashboard + ScanReportView + DecisionPanel | AC-F5 |
| SPEC-002 §5 | My Skills (我的发布) | AC-F2 扩展 |

**Sprint F2 覆盖率增量**: +2 章节 (SPEC-003§5 + SPEC-005§5)

### Sprint F3: 模板与管理后台 (1 周)

| 来源 SPEC | 章节 | 要实现的内容 | AC |
|----------|------|-----------|-----|
| SPEC-007 §3 | 模板市场 + 模板详情 | AC-F6 扩展 |
| SPEC-007 §3 | Admin Dashboard + 用户管理 | AC-F6 |
| SPEC-005 §5 | CodeDiffViewer (P2, 进阶) | - |

**Sprint F3 覆盖率增量**: 剩余 SPEC-007 章节全部完成

---

## 覆盖率趋势

| 时间点 | 已覆盖章节 | 总章节 | 覆盖率 |
|--------|----------|--------|--------|
| Sprint 1-5 完成 | 43 | 57 | **75.4%** |
| Sprint 6-8 完成 | 51 | 57 | **89.5%** |
| Sprint F1 完成后 | 55 | 57 | **96.5%** |
| Sprint F2 完成后 | 57 | 57 | **100%** |
| Sprint F3 完成后 | 57 | 57 | **100% + P2 增强** |

---

## 延后项追踪（全量）

| # | 延后项 | 原始 SPEC | 原计划 Sprint | 实际延后到 | Owner | 状态 |
|---|--------|----------|-------------|----------|-------|------|
| 1 | Login Page + UserProfileMenu | SPEC-001 §5 | Sprint 1 | Sprint F1 | Dev (前端) | 🆕 待开发 |
| 2 | Marketplace + Detail + My Skills | SPEC-002 §5 | Sprint 2 | Sprint F1-F2 | Dev (前端) | 🆕 待开发 |
| 3 | VersionUploader + History + FileList | SPEC-003 §5 | Sprint 3 | Sprint F2 | Dev (前端) | 🆕 待开发 |
| 4 | OmniSearchBar + SearchResults | SPEC-004 §6 | Sprint 4 | Sprint F1 | Dev (前端) | 🆕 待开发 |
| 5 | ReviewDashboard + ScanReport + Decision | SPEC-005 §5 | Sprint 5 | Sprint F2 | Dev (前端) | 🆕 待开发 |
| 6 | Template Pages + Admin Dashboard | SPEC-007 §3 | 首次定义 | Sprint F3 | Dev (前端) | 🆕 待开发 |

**延后项总计: 6 项，全部有明确目标 Sprint，无"待定"项 ✅**
