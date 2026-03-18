# Enterprise SkillHub — Sprint 拆分计划

> 版本: v1.0 | 创建时间: 2026-03-18 | 方法论: Scrum (2周/Sprint)

## 团队配置

| 角色 | 人数 | 职责 |
|------|------|------|
| 全栈工程师 A | 1 | 后端核心 (Nest.js + LDAP + 审核引擎) |
| 全栈工程师 B | 1 | 前端改造 + 部分后端 API |
| 后端工程师 C | 1 | 数据层 + K8s + DevOps |
| PM/SM | 1 | 项目管理 + 验收 (兼职) |

---

## Phase 1: MVP（Sprint 1-3，共 6 周）

### Sprint 1 (Week 1-2): 基础设施 + 骨架搭建

**Sprint Goal**: 后端骨架跑通，能用 AD 账号登录并看到首页

| Story | 描述 | 负责人 | SP |
|-------|------|--------|-----|
| S1-1 | 项目初始化：Fork ClawHub，搭建 Nest.js 后端项目结构 | A | 3 |
| S1-2 | PostgreSQL Schema 设计 + Prisma Migration（User, Skill, SkillVersion, SkillFile） | A | 5 |
| S1-3 | LDAP 认证模块：passport-ldapauth + JWT 签发 + AD 组→角色映射 | A | 8 |
| S1-4 | MinIO 部署 + 文件上传/下载 Service | C | 5 |
| S1-5 | K8s Helm Chart 骨架 + Dev 环境部署 | C | 5 |
| S1-6 | 前端登录页改造：AD 账号密码登录替代 GitHub OAuth | B | 5 |
| S1-7 | Docker Compose 本地开发环境（PG + MinIO + LDAP mock） | C | 3 |

**Sprint Velocity Target**: 34 SP
**Definition of Done**: AD 账号可登录，JWT 认证链路跑通，Dev K8s 环境可用

---

### Sprint 2 (Week 3-4): Skills CRUD + 搜索

**Sprint Goal**: 完成 Skill 发布、浏览、搜索核心流程

| Story | 描述 | 负责人 | SP |
|-------|------|--------|-----|
| S2-1 | Skills CRUD API (创建/列表/详情/更新/删除) | A | 8 |
| S2-2 | SkillVersion 发布 API (文件上传 + 元数据解析 + MinIO 存储) | A | 8 |
| S2-3 | Skill 下载 API (zip 打包 + 下载统计) | A | 3 |
| S2-4 | BGE-M3 Embedding 服务部署 + pgvector 向量搜索集成 | C | 8 |
| S2-5 | 前端 Skill 浏览页改造：接入新 API，增加部门/分类筛选器 | B | 5 |
| S2-6 | 前端 Skill 详情页：SKILL.md 渲染 + 版本历史 | B | 3 |
| S2-7 | 前端发布页（基础版）：文件上传 + 元数据填写 | B | 5 |
| S2-8 | RBAC 权限中间件：@Roles 装饰器 + 部门可见性 Guard | A | 5 |

**Sprint Velocity Target**: 45 SP
**DoD**: 可发布 Skill、浏览列表、搜索、查看详情、下载

---

### Sprint 3 (Week 5-6): 审核流程 MVP + 集成测试

**Sprint Goal**: 审核流程跑通，MVP 可 Demo

| Story | 描述 | 负责人 | SP |
|-------|------|--------|-----|
| S3-1 | 审核引擎：自动扫描 Pipeline (文件验证 + 安全扫描 + 合规检查) | A | 8 |
| S3-2 | 审核工作流 API (提交审核 → 自动扫描 → 人工审核 → 审批/驳回) | A | 8 |
| S3-3 | 审核人自动分配逻辑 (AD 组匹配 + 负载均衡) | A | 5 |
| S3-4 | 审计日志模块 (AuditLog 写入 + 查询 API) | C | 3 |
| S3-5 | 前端审核工作台 (待审核列表 + 审核详情 + 审批/驳回操作) | B | 8 |
| S3-6 | 前端 Skill 卡片增加审核状态徽章 | B | 2 |
| S3-7 | E2E 测试：完整发布→审核→上线流程 | B+C | 5 |
| S3-8 | K8s 部署 Staging 环境 + CI/CD Pipeline | C | 5 |

**Sprint Velocity Target**: 44 SP
**DoD**: 完整的 发布→自动扫描→人工审核→上线 流程可运行，Staging 环境可 Demo

---

## Phase 2: 增强功能（Sprint 4-5，共 4 周）

### Sprint 4 (Week 7-8): 审核增强 + 管理后台

| Story | 描述 | 负责人 | SP |
|-------|------|--------|-----|
| S4-1 | ReviewPolicy 管理 API (按部门/分类配置审核策略) | A | 5 |
| S4-2 | 审核超时告警 (超过 maxReviewDays 自动通知) | A | 3 |
| S4-3 | 飞书/企微通知集成 (审核结果推送 + 待审核提醒) | C | 5 |
| S4-4 | 管理后台：用户管理页 (列表 + 角色变更 + 停用) | B | 5 |
| S4-5 | 管理后台：审核策略配置页 | B | 5 |
| S4-6 | 管理后台：审计日志查看页 | B | 3 |
| S4-7 | 部门隔离完善：Skill 可见范围配置 UI + 权限验证 | B+A | 5 |
| S4-8 | AD 组定时同步 CronJob (角色自动更新) | C | 3 |

**Sprint Velocity Target**: 34 SP

---

### Sprint 5 (Week 9-10): 统计 + CLI + 上游同步

| Story | 描述 | 负责人 | SP |
|-------|------|--------|-----|
| S5-1 | 统计看板 API (Top Skills, 部门使用量, 审核效率) | A | 5 |
| S5-2 | 管理后台：统计看板页 (图表展示) | B | 5 |
| S5-3 | 企业定制 CLI：Fork clawhub CLI，指向内网 API | C | 5 |
| S5-4 | CLI: 安装/搜索/发布命令适配 (LDAP Token 认证) | C | 5 |
| S5-5 | 上游同步模块：定时从 ClawHub 拉取热门 Skills | A | 8 |
| S5-6 | 个人中心页面 (我发布的 + 我审核的 + 安装记录) | B | 5 |
| S5-7 | 性能优化：API 响应时间 <200ms, 搜索 <500ms | A+C | 3 |

**Sprint Velocity Target**: 36 SP

---

## Phase 3: 上线保障（Sprint 6，共 2 周）

### Sprint 6 (Week 11-12): 安全加固 + 生产部署

| Story | 描述 | 负责人 | SP |
|-------|------|--------|-----|
| S6-1 | 安全审计：OWASP Top 10 检查 + 渗透测试 | A+C | 8 |
| S6-2 | 生产环境 K8s 部署 + TLS 证书 + Ingress 配置 | C | 5 |
| S6-3 | PostgreSQL 主从 + 自动备份策略 | C | 3 |
| S6-4 | 监控告警：Prometheus + Grafana Dashboard | C | 5 |
| S6-5 | 用户文档：管理员手册 + 用户手册 + CLI 使用指南 | B | 5 |
| S6-6 | 种子数据：从 ClawHub 导入 Top 50 Skills | A | 3 |
| S6-7 | UAT 验收测试 + Bug Fix | ALL | 8 |
| S6-8 | 上线 Checklist + Go-Live | ALL | 3 |

**Sprint Velocity Target**: 40 SP

---

## 里程碑总览

```
Week  1  2  3  4  5  6  7  8  9  10  11  12
      ├──Sprint 1──┤──Sprint 2──┤──Sprint 3──┤
      │  基础设施   │  Skills核心 │  审核MVP   │
      │  + AD集成   │  + 搜索    │  + E2E    │
      │            │            │   ★ MVP Demo │
      │            │            │            │
      │            │            ├──Sprint 4──┤──Sprint 5──┤
      │            │            │  审核增强   │  统计+CLI  │
      │            │            │  + 管后台   │  +上游同步  │
      │            │            │            │            │
      │            │            │            ├──Sprint 6──┤
      │            │            │            │  安全+部署  │
      │            │            │            │   ★ Go-Live │
```

| 里程碑 | 时间 | 交付物 |
|--------|------|--------|
| **M1: MVP Demo** | Week 6 末 | 核心功能可演示 (登录+发布+审核+搜索) |
| **M2: Beta** | Week 10 末 | 全功能内测 (管理后台+CLI+统计) |
| **M3: Go-Live** | Week 12 末 | 生产上线 |

---

## 风险登记

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| AD 域控连接不稳定 | 中 | 高 | 本地缓存 AD 信息 + Token 有效期延长 |
| BGE-M3 推理延迟高 | 中 | 中 | GPU 加速 / 缓存热门查询 Embedding |
| ClawHub 上游 API 变更 | 低 | 中 | 上游同步走版本化 API，做兼容层 |
| K8s 集群资源不足 | 低 | 高 | 提前申请资源配额，HPA 自动伸缩 |
| 审核流程过慢导致用户体验差 | 中 | 高 | 自动审批 + 审核超时告警 + SLA 监控 |

---

## 前置依赖 (开工前需确认)

- [ ] AD 域控服务账号 (svc-skillhub) 已创建，有 LDAP 搜索权限
- [ ] AD 安全组已创建 (SkillHub-Admin/Reviewer/Publisher/Moderator)
- [ ] K8s 命名空间 + 资源配额已审批
- [ ] 内网 Docker Registry 可用
- [ ] PostgreSQL 存储卷 (PV) 已准备
- [ ] 企业内网 DNS 记录 skillhub.corp.local 已申请
- [ ] TLS 证书 (内网 CA 签发) 已准备
- [ ] GPU 节点可用 (BGE-M3 推理) 或确认用 CPU 方案
