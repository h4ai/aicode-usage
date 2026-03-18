# Enterprise SkillHub — Spec 驱动开发（SDD）工作流 & 并行分工方案

> 版本: v1.0 | 创建时间: 2026-03-19
> 方法论: Spec-Driven Development（参考博小宝项目验证过的 SDD 流程）

---

## 一、整体开发流程（5 个阶段）

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Phase 0  │───▶│ Phase 1  │───▶│ Phase 2  │───▶│ Phase 3  │───▶│ Phase 4  │
│ 需求对齐  │    │ Spec 编写 │    │ Review   │    │ 并行编码  │    │ 验证上线  │
│ (Day 0)  │    │ (Day 1-2)│    │ (Day 3)  │    │ (Week1-12)│   │ (持续)   │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └─────────┘
```

### Phase 0: 需求对齐 & 技术验证（Day 0）— ✅ 已完成

- [x] 产品需求确认（私有化 Skills 市场）
- [x] 技术选型决策（Nest.js + PG + LDAP + K8s）
- [x] 参考系统分析（ClawHub 源码 + SkillHub 腾讯）
- [x] 技术设计文档（TECH-DESIGN.md）
- [x] Sprint 拆分计划（SPRINT-PLAN.md）

### Phase 1: Spec 编写（Day 1-2）— 🔜 下一步

编写 8 个功能 Spec，覆盖全部模块：

| Spec 编号 | 功能模块 | 优先级 | 负责 Agent |
|-----------|---------|--------|-----------|
| SPEC-001 | 用户认证 & AD 域集成 | P0 | Dev Agent |
| SPEC-002 | Skill 数据模型 & CRUD | P0 | Dev Agent |
| SPEC-003 | 版本管理 & 文件存储 | P0 | Dev Agent |
| SPEC-004 | 向量搜索 & Embedding | P1 | Dev Agent |
| SPEC-005 | 审核工作流引擎 | P0 | Dev Agent |
| SPEC-006 | 管理后台 & 审计日志 | P1 | Dev Agent |
| SPEC-007 | 前端改造（浏览/发布/审核） | P1 | Dev Agent |
| SPEC-008 | 企业 CLI & 上游同步 | P2 | Dev Agent |

### Phase 2: Spec Review（Day 3）

- 全部 Spec 提交人工 Review
- 重点检查：数据模型一致性、API 接口完整性、业务规则边界
- Review 通过后标记 `approved`，进入编码阶段

### Phase 3: 并行编码（Week 1-12）

- 按 Spec → Task 映射关系，3 个工程师并行开发
- 每个 Task 完成后必须通过端到端验证（博小宝教训）

### Phase 4: 持续验证（每个 Task 完成后）

- 三路并行检查（后端/前端/配置一致性）
- Migration 一致性校验
- 端到端 Smoke Test

---

## 二、Spec 模板（企业版，基于博小宝模板增强）

```markdown
# SPEC-{编号}: {功能名称}

> 状态: draft → review → approved → implemented → verified
> 优先级: P0 | P1 | P2
> 负责人: {编写人}
> 审核人: {Review 人}
> 关联 Task: TASK-xxx, TASK-xxx

## 1. 概述
一两句话说清楚解决什么问题，面向什么角色。

## 2. 数据模型
Prisma Schema 定义 + 字段说明 + 索引策略。

## 3. API 接口
端点 + Method + 请求体 + 响应体 + 错误码 + 权限要求。

## 4. 业务规则
约束条件、边界情况、状态机（如审核流转）。

## 5. 前端组件
页面列表 + 组件树 + 交互流程 + 设计稿链接。

## 6. 安全要求（企业增强）
认证要求、权限矩阵、数据脱敏、审计日志。

## 7. 验收标准（博小宝教训：必须含"能跑通"）
- [ ] API 端点可正常响应
- [ ] Migration 与 ORM 一致
- [ ] 端到端流程跑通
- [ ] 权限控制生效

## 8. 变更记录
| 日期 | 变更 | 变更人 |
```

---

## 三、Spec → Task 映射 & 并行分工

### 3.1 三条并行开发流水线

```
时间轴     Week1    Week2    Week3    Week4    Week5    Week6    Week7-8   Week9-10  Week11-12
          ├────────┤────────┤────────┤────────┤────────┤────────┤─────────┤─────────┤─────────┤

流水线 A   ┌─ SPEC-001 ──┐┌─ SPEC-002 ──────┐┌─ SPEC-005 ──────────────┐┌─ SPEC-006 ──────┐
(后端核心)  │ AD认证+RBAC  ││ Skill CRUD     ││ 审核引擎                 ││ 管理后台+审计   │
工程师 A   │ TASK-A1~A3  ││ TASK-A4~A6     ││ TASK-A7~A10             ││ TASK-A11~A13   │
           └─────────────┘└────────────────┘└─────────────────────────┘└────────────────┘

流水线 B   ┌─ 前端骨架 ───┐┌─ SPEC-007 (浏览/搜索) ─┐┌─ SPEC-007 (发布/审核) ─┐┌─ SPEC-007 ──┐
(前端改造)  │ 登录页+框架  ││ 列表/详情/搜索页        ││ 发布向导/审核工作台     ││ 管后台+个人  │
工程师 B   │ TASK-B1~B2  ││ TASK-B3~B5             ││ TASK-B6~B8            ││ TASK-B9~B11 │
           └─────────────┘└───────────────────────┘└───────────────────────┘└────────────┘

流水线 C   ┌─ 基建+DevOps─┐┌─ SPEC-003+004 ────────┐┌─ SPEC-008 ──┐┌─ 安全+监控+上线 ────────┐
(数据层     │ Docker/K8s/  ││ MinIO存储+版本管理     ││ CLI+上游同步 ││ 安全审计+Prometheus    │
+DevOps)   │ PG+MinIO     ││ BGE-M3+pgvector搜索   ││             ││ +TLS+备份+Go-Live     │
工程师 C   │ TASK-C1~C3   ││ TASK-C4~C7            ││ TASK-C8~C10 ││ TASK-C11~C14          │
           └──────────────┘└───────────────────────┘└────────────┘└───────────────────────┘
```

### 3.2 详细 Task 清单

#### 流水线 A：后端核心（工程师 A）

| Task | Spec | 描述 | 前置依赖 | Week |
|------|------|------|---------|------|
| **TASK-A1** | SPEC-001 | Nest.js 项目骨架 + Module/Controller/Service 结构 | 无 | W1 |
| **TASK-A2** | SPEC-001 | LDAP 认证：passport-ldapauth + JWT + AD 组映射 | A1 | W1-2 |
| **TASK-A3** | SPEC-001 | RBAC 权限系统：@Roles Guard + 部门可见性 Guard | A2 | W2 |
| **TASK-A4** | SPEC-002 | Skill CRUD API：创建/列表/详情/更新/软删除 | A1, C1 | W3 |
| **TASK-A5** | SPEC-002 | Prisma Schema + Migration（User/Skill/Version/File） | A1 | W3 |
| **TASK-A6** | SPEC-002 | Skill 分类/标签/徽章/统计模块 | A4 | W4 |
| **TASK-A7** | SPEC-005 | 审核数据模型：SkillReview + ReviewPolicy | A5 | W5 |
| **TASK-A8** | SPEC-005 | 自动扫描 Pipeline：4 阶段扫描引擎 | A7 | W5-6 |
| **TASK-A9** | SPEC-005 | 人工审核 API：审批/驳回/要求修改/转派 | A7 | W6 |
| **TASK-A10** | SPEC-005 | 审核人自动分配 + 超时告警 + 通知推送 | A9, A2 | W7 |
| **TASK-A11** | SPEC-006 | 审计日志模块：AuditLog 写入 + 查询 API | A1 | W8 |
| **TASK-A12** | SPEC-006 | 管理 API：用户管理 + 角色变更 + 策略配置 | A3, A11 | W8 |
| **TASK-A13** | SPEC-006 | 统计 API：Top Skills / 部门用量 / 审核效率指标 | A4, A9 | W9 |

#### 流水线 B：前端改造（工程师 B）

| Task | Spec | 描述 | 前置依赖 | Week |
|------|------|------|---------|------|
| **TASK-B1** | SPEC-007 | Fork ClawHub 前端 + 去除 Convex 依赖 + 接入 REST API | 无 | W1 |
| **TASK-B2** | SPEC-007 | 登录页：AD 账号密码表单 + JWT 存储 + 鉴权拦截器 | B1, A2 | W2 |
| **TASK-B3** | SPEC-007 | Skill 浏览页：列表卡片 + 部门/分类/状态筛选器 | B1, A4 | W3 |
| **TASK-B4** | SPEC-007 | Skill 详情页：SKILL.md 渲染 + 版本历史 + 评论/Star | B3, A4 | W4 |
| **TASK-B5** | SPEC-007 | 搜索页：向量搜索 + 实时建议 + 筛选联动 | B3, C5 | W4 |
| **TASK-B6** | SPEC-007 | 发布向导：分步表单（上传→元数据→预览→提交审核） | B1, A4, C4 | W5 |
| **TASK-B7** | SPEC-007 | 审核工作台：待审核列表 + 审核详情 + Diff 视图 | B1, A9 | W6 |
| **TASK-B8** | SPEC-007 | 审核操作：审批/驳回/评论 + 审核状态徽章 | B7, A9 | W7 |
| **TASK-B9** | SPEC-007 | 管理后台：用户管理 + 角色配置 + 审核策略 | B1, A12 | W8 |
| **TASK-B10** | SPEC-007 | 管理后台：审计日志查看 + 统计看板（图表） | B9, A11, A13 | W9 |
| **TASK-B11** | SPEC-007 | 个人中心：我的发布 / 我的审核 / 安装记录 | B1, A4 | W10 |

#### 流水线 C：数据层 + DevOps（工程师 C）

| Task | Spec | 描述 | 前置依赖 | Week |
|------|------|------|---------|------|
| **TASK-C1** | — | Docker Compose 本地开发环境（PG + MinIO + OpenLDAP mock） | 无 | W1 |
| **TASK-C2** | — | K8s Helm Chart 骨架 + Dev Namespace 部署 | 无 | W1 |
| **TASK-C3** | — | CI/CD Pipeline：GitLab CI（lint → test → build → deploy-dev） | C2 | W2 |
| **TASK-C4** | SPEC-003 | MinIO 文件服务：上传/下载/zip打包 + 预签名 URL | C1 | W3 |
| **TASK-C5** | SPEC-004 | BGE-M3 Embedding 服务容器化部署 | C2 | W3 |
| **TASK-C6** | SPEC-004 | pgvector 扩展 + 向量搜索 Nest.js Service | C5, A5 | W4 |
| **TASK-C7** | SPEC-003 | 版本管理：semver 验证 + tag 管理 + 下载统计 | C4, A4 | W4 |
| **TASK-C8** | SPEC-008 | 企业 CLI：Fork clawhub CLI + 指向内网 API + LDAP Token | C4 | W7 |
| **TASK-C9** | SPEC-008 | CLI：install/search/publish 命令适配 | C8, A4 | W8 |
| **TASK-C10** | SPEC-008 | 上游同步：定时从 ClawHub 拉取 + 本地化入库 | C4, A4 | W9 |
| **TASK-C11** | — | 安全加固：OWASP Top 10 检查 + 网络策略 | ALL | W10 |
| **TASK-C12** | — | 生产 K8s 部署：TLS + Ingress + PG 主从 + 备份 | C2 | W11 |
| **TASK-C13** | — | 监控告警：Prometheus + Grafana Dashboard | C12 | W11 |
| **TASK-C14** | — | Go-Live：种子数据 + UAT + Checklist | ALL | W12 |

---

## 四、依赖关系图（关键路径）

```
                           ┌──────────┐
                           │ TASK-A1  │ Nest.js 骨架
                           │ (Week 1) │
                           └────┬─────┘
                    ┌───────────┼───────────┐
                    ▼           ▼           ▼
              ┌──────────┐┌──────────┐┌──────────┐
              │ TASK-A2  ││ TASK-A5  ││ TASK-B1  │
              │ LDAP认证  ││ Prisma   ││ 前端Fork │
              │ (W1-2)   ││ Schema   ││ (W1)     │
              └────┬─────┘│ (W3)     │└────┬─────┘
                   │      └────┬─────┘     │
                   ▼           ▼           ▼
              ┌──────────┐┌──────────┐┌──────────┐
              │ TASK-A3  ││ TASK-A4  ││ TASK-B2  │
              │ RBAC     ││Skill CRUD││ 登录页   │
              │ (W2)     ││ (W3)     ││ (W2)     │
              └──────────┘└────┬─────┘└──────────┘
                               │
                    ┌──────────┼──────────┐
                    ▼          ▼          ▼
              ┌──────────┐┌──────────┐┌──────────┐
              │ TASK-A7  ││ TASK-B3  ││ TASK-C7  │
              │ 审核模型  ││ 浏览页   ││ 版本管理  │
              │ (W5)     ││ (W3)     ││ (W4)     │
              └────┬─────┘└──────────┘└──────────┘
                   │
              ┌────▼─────┐
              │ TASK-A8  │
              │ 扫描引擎  │ ◄── 关键路径！
              │ (W5-6)   │
              └────┬─────┘
                   │
              ┌────▼─────┐
              │ TASK-A9  │
              │ 审核 API  │
              │ (W6)     │
              └────┬─────┘
                   │
              ┌────▼─────┐
              │ TASK-B7  │
              │ 审核工作台 │
              │ (W6)     │
              └──────────┘
```

**关键路径**: A1 → A2 → A5 → A4 → A7 → A8 → A9 → B7

关键路径上全部是后端核心任务，工程师 A 是瓶颈点。缓解措施：
- A5 (Prisma Schema) 可以和 A2 (LDAP) 并行
- A8 (扫描引擎) 是最复杂的单任务，预留 2 周
- B/C 流水线无阻塞，保持全速并行

---

## 五、集成点 & 联调时间窗

三条流水线需要在特定时间点对齐联调：

| 联调点 | 时间 | 参与方 | 验证内容 |
|--------|------|--------|---------|
| **INT-1: 登录联调** | W2 末 | A + B | 前端登录页 → 后端 LDAP → JWT → 页面跳转 |
| **INT-2: CRUD 联调** | W4 末 | A + B + C | 前端发布 → 后端 API → MinIO 存储 → 列表展示 |
| **INT-3: 搜索联调** | W4 末 | A + B + C | 前端搜索 → 后端 API → pgvector → BGE-M3 |
| **INT-4: 审核联调** | W7 末 | A + B | 提交审核 → 自动扫描 → 审核工作台 → 审批/驳回 |
| **INT-5: CLI 联调** | W9 末 | A + C | CLI login → search → install → publish |
| **INT-6: 全链路** | W10 末 | A + B + C | 端到端完整流程 + 性能验收 |

---

## 六、每个 Task 的 DoD（Definition of Done）

吸取博小宝教训，**所有 Task 必须满足以下条件才能标记 done**：

### 后端 Task DoD
- [ ] API 端点可正常响应（Postman / curl 验证）
- [ ] Prisma Migration 已生成且与 Schema 一致
- [ ] 单元测试覆盖核心逻辑（≥70%）
- [ ] 权限控制已验证（不同角色测试）
- [ ] 审计日志已记录
- [ ] API 文档已更新（Swagger/OpenAPI）

### 前端 Task DoD
- [ ] 页面可正常渲染（dev server 验证）
- [ ] TypeScript 编译通过（tsc --noEmit）
- [ ] 对接后端 API 联调通过
- [ ] 移动端响应式适配
- [ ] Loading / Error / Empty 三态处理

### DevOps Task DoD
- [ ] Docker build 成功
- [ ] K8s deploy + rollback 验证
- [ ] Health check 通过
- [ ] 配置变量与 .env 一致（配置一致性检查）
- [ ] 文档更新（部署手册）

### 通用 DoD（每个 Task 必须）
- [ ] 🔴 **端到端能跑通**（不是"代码写完"）
- [ ] 🔴 **Migration 与 ORM 一致**（每次改 Schema 后验证）
- [ ] Code Review 通过
- [ ] 提交 Git + 写 commit message

---

## 七、验证机制（三路并行检查）

每个 Sprint 结束时，执行三路并行验证：

```
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│ Check-A: 后端    │  │ Check-B: 前端    │  │ Check-C: 配置    │
│                 │  │                 │  │                 │
│ - Prisma Schema │  │ - TS 编译       │  │ - .env 变量覆盖  │
│   vs Migration  │  │ - import 路径    │  │ - docker-compose │
│ - Service 字段  │  │ - API 类型匹配   │  │   vs .env       │
│   vs ORM       │  │ - build 预测     │  │ - K8s ConfigMap  │
│ - 依赖导入     │  │                 │  │   vs .env       │
│ - Ruff lint    │  │                 │  │ - Helm values    │
└─────────────────┘  └─────────────────┘  └─────────────────┘
         │                   │                     │
         └───────────────────┼─────────────────────┘
                             ▼
                    ┌─────────────────┐
                    │ 汇总报告         │
                    │ Critical / Warn │
                    │ → 修复后才能进   │
                    │   入下一 Sprint  │
                    └─────────────────┘
```

---

## 八、风险缓冲 & 并行度优化

### 8.1 缓冲策略

| 风险场景 | 缓冲方案 |
|---------|---------|
| 工程师 A 成为瓶颈（关键路径集中） | W3 起 B 承接部分后端 API（如评论/Star 等非核心 API） |
| LDAP 对接遇到 AD 域控兼容问题 | 先用 OpenLDAP mock 开发，W2 再切真实 AD |
| BGE-M3 GPU 资源审批延迟 | 先用 CPU 推理（慢但可用），GPU 到位后切换 |
| 审核流程需求变更 | SPEC-005 预留扩展点，状态机设计可插拔 |

### 8.2 最大并行度窗口

```
Week 1-2:  3 人全部并行（A:认证, B:前端骨架, C:基建）     → 并行度 100%
Week 3-4:  3 人全部并行（A:CRUD, B:浏览页, C:存储+搜索）  → 并行度 100%
Week 5-6:  A 关键路径（审核引擎）, B+C 可并行              → 并行度 67%+
Week 7-8:  3 人再次全并行（A:管理API, B:管后台, C:CLI）   → 并行度 100%
Week 9-10: 3 人并行收尾 + 联调                            → 并行度 80%
Week 11-12: 集中上线保障                                   → 并行度 70%
```

**平均并行度: ~90%，闲置浪费极少。**
