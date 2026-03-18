# 博小宝项目经验总结 — 可复用的 AI 全栈开发流程

> 项目: 博小宝基金诊断系统 (BoXiaoBao Fund Diagnostic System)
> 时间: 2026-03-03 ~ 2026-03-04（核心开发 2 天）
> 团队: 1 人类 (hongfushi) + 1 AI Lead Dev (Trellis Agent) + 3 AI Subagent (Doc/Test/QA)
> 成果: 全栈 MVP — 后端 30 个 Python 文件 / 前端 20 个 TS+Vue 文件 / 6 个 Spec / 6 个 Task

---

## 一、整体流程复盘

### 1.1 时间线

```
Day 0 (需求对齐)
├── 人类提出产品需求（口头/文档）
├── 确认技术栈 → MEMORY.md 记录决策
├── 数据源验证 → 发现且慢是 REST API 而非 MCP
└── 修正架构假设，避免走弯路

Day 1 (Spec + 核心开发)
├── trellis:plan → 6 个 Spec + 6 个 Task + 阶段计划
├── TASK-001 项目脚手架 → 后端+前端骨架+Docker
├── TASK-002 数据层 → 且慢 API Client + 缓存 + ORM
├── TASK-003 多智能体核心 → LangGraph 五维诊断
└── TASK-004 API 层完善 → 错误处理+限流+中间件

Day 2 (前端 + 对话 + 收尾)
├── TASK-005 移动端 H5 → 3 页面 + SSE 流式渲染
├── TASK-006 对话追问 → SSE 对话 + 安全防护
└── 全部 6 个 Task 标记 done

Day 3+ (验证)
├── 3 个 Subagent 并行验证（后端/前端/配置一致性）
├── 发现 3 个 Critical + 5 个 Warning
└── 等待集成测试
```

### 1.2 流程概览图

```
需求 → [澄清] → Spec 编写 → [人工 Review] → Task 拆分 → 编码实现 → 质量检查 → 完成
  ↑                                                         ↑
  └── 模糊就问，不猜测                              └── Subagent 并行(Doc/Test/QA)
```

---

## 二、设计阶段经验

### 2.1 Spec 驱动开发（SDD）是核心

**做对了什么：**

- **先写 6 个 Spec 再动手写代码**，每个 Spec 覆盖：数据模型、API 接口、业务规则、前端组件
- Spec 作为人机之间的「契约」，减少了返工
- 使用 `.trellis/specs/` 目录统一管理，编号清晰（SPEC-001 ~ 006）

**Spec 模板结构（已验证有效，可直接复用）：**

```markdown
# SPEC-{编号}: {功能名称}
> 状态: draft → review → approved → implemented
> 优先级: P0 | P1 | P2

## 1. 概述（一两句话说清楚解决什么问题）
## 2. 数据模型（SQL + Pydantic Schema）
## 3. API 接口（端点 + 请求/响应 + 错误码）
## 4. 业务规则（约束条件、边界情况）
## 5. 前端组件（页面 + 组件 + 交互）
## 6. 变更记录
```

**教训：**

- ❌ Spec 写得太理想化，实际实现时发现数据源协议假设错误（MCP vs REST）
- ✅ **修正方法**：先实测数据源，再写 Spec。"不要假设协议，先验证"
- ❌ Spec 中的数据模型和 Migration 后来出现不一致（Critical Bug）
- ✅ **修正方法**：Spec 更新后必须同步检查 Migration 和 ORM 模型

### 2.2 技术决策前置

所有重大技术决策在 Day 0 完成并记录到 `MEMORY.md`：

| 决策点 | 选项 | 最终选择 | 关键理由 |
|--------|------|----------|----------|
| 后端框架 | FastAPI vs Starlette | Starlette | 更轻量，人类确认 |
| 数据库 | PG+Mongo vs PG only | PG + JSONB | 简化一期架构 |
| AI 框架 | LangChain vs LangGraph | LangGraph | 支持并行 fan-out |
| 数据源 | MCP vs REST | REST API | 实测验证 |

**可复用原则：**
- 技术决策必须在写 Spec 之前完成
- 每个决策记录「选项 + 选择 + 理由」，方便回溯
- 如果人类有明确偏好（如 Starlette），优先尊重

### 2.3 需求澄清机制

```
人类说了模糊的需求
  → Agent 列出 2~5 种理解
  → 人类选择
  → 开始执行
```

**实际案例**：
- 人类说"MCP 数据源"→ Agent 先验证 → 发现是 REST API → 纠正后继续
- 如果没验证就按 MCP 写代码，可能浪费 1 天

---

## 三、编码阶段经验

### 3.1 Task 拆分策略

6 个 Task 按**技术层 + 依赖关系**排列：

```
TASK-001 脚手架（基础设施，所有后续 Task 的前提）
  ↓
TASK-002 数据层（数据获取能力）
  ↓
TASK-003 多智能体核心（核心业务逻辑，依赖数据层）
  ↓
TASK-004 API 层完善（生产化加固：错误处理、限流）
  ↓
TASK-005 移动端前端（依赖后端 API 稳定）
  ↓
TASK-006 对话追问（增值功能，可以最后做）
```

**可复用原则：**
- P0 先做（基础设施 + 核心逻辑），P1 后做（前端 + 增值功能）
- 每个 Task 关联一个 Spec，职责清晰
- Task 粒度：1 个 Task = 半天到一天的工作量

### 3.2 后端架构模式（可直接复用）

```
backend/
├── app/
│   ├── main.py          # 应用入口 + lifespan（启动/关闭资源）
│   ├── config.py        # pydantic-settings（所有配置从 .env 读取）
│   ├── api/             # 路由层（薄，只做参数校验和调用 service）
│   │   ├── routes.py    # 路由注册（Mount 统一前缀）
│   │   └── *.py         # 各端点
│   ├── services/        # 业务逻辑层（核心逻辑在这里）
│   ├── models/          # 数据模型层
│   │   ├── fund.py      # SQLAlchemy ORM（数据库表定义）
│   │   └── schemas.py   # Pydantic Schema（请求/响应）
│   ├── db/              # 数据库连接管理
│   │   ├── postgres.py  # Async SQLAlchemy Engine + Session
│   │   └── redis.py     # Redis 缓存 + 限流
│   ├── agents/          # AI/Agent 层（如果有的话）
│   └── utils/           # 工具函数（错误处理、安全、SSE）
├── alembic/             # 数据库迁移
└── tests/
```

**关键设计决策：**

1. **Starlette Lifespan**：在 async context manager 中初始化 DB/Redis/HTTP Client，确保优雅关闭
2. **pydantic-settings**：配置类自动从 .env 和环境变量加载，类型安全
3. **双模式降级**：核心功能有 LLM 模式和 Fallback 模式，确保无 API Key 也能运行
4. **异常隔离**：每个 Agent 节点独立 try/except，单点故障不扩散

### 3.3 前端架构模式（可直接复用）

```
frontend/src/
├── main.ts              # 入口（注册 Vant + Pinia + Router）
├── App.vue              # 根组件
├── router/index.ts      # 路由定义（懒加载）
├── pages/               # 页面组件（对应路由）
├── components/          # 通用组件（可跨页面复用）
├── composables/         # 组合式函数（业务逻辑封装）
│   ├── useSearch.ts     # 搜索逻辑 + 防抖 + 历史
│   └── useDiagnosis.ts  # SSE 流式处理
├── stores/              # Pinia 状态管理
├── api/index.ts         # API 客户端（fetch + SSE ReadableStream）
├── types/index.ts       # 全局 TypeScript 类型
└── styles/main.css      # 全局样式
```

**关键设计决策：**

1. **SSE 用 fetch + ReadableStream**（不用 EventSource，支持 POST + 自定义 header）
2. **Composable 封装业务逻辑**：页面组件只负责渲染，逻辑在 composable 里
3. **Vant 自动导入**：unplugin-vue-components + VantResolver，不需要手动 import
4. **TypeScript strict 模式**：强制类型安全

### 3.4 SSE 流式架构（核心亮点，可复用）

这个项目最值得复用的模式是 **SSE 流式多维分析**：

```
后端 (Starlette + sse-starlette)
  → LangGraph fan-out 并行多个 Agent
  → 每个 Agent 完成后立即发送 SSE event
  → 事件协议:
      session → status → dimension_start → content_delta(80字/chunk) → dimension_end → summary → done

前端 (fetch + ReadableStream)
  → 逐 chunk 解析 SSE
  → 实时渲染 Markdown (markdown-it)
  → Tab 切换已完成的维度
```

**可复用的 SSE 事件协议模板：**

```typescript
type SSEEvent =
  | { event: 'session', data: { session_id: string } }
  | { event: 'status', data: { message: string } }
  | { event: 'dimension_start', data: { dimension: string, title: string } }
  | { event: 'content_delta', data: { dimension: string, content: string } }
  | { event: 'dimension_end', data: { dimension: string } }
  | { event: 'summary', data: { content: string } }
  | { event: 'done', data: { session_id: string } }
  | { event: 'error', data: { message: string } }
```

### 3.5 Docker Compose 本地开发模板（可直接复用）

```yaml
version: "3.8"
services:
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes: [pg_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]

  backend:
    build: ./backend
    ports: ["8000:8000"]
    env_file: .env
    environment:
      - POSTGRES_HOST=postgres
      - REDIS_URL=redis://redis:6379/0
    depends_on:
      postgres: { condition: service_healthy }
      redis: { condition: service_healthy }
    volumes: [./backend:/app]
    command: uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

  frontend:
    build: ./frontend
    ports: ["80:80"]
    depends_on: [backend]

volumes:
  pg_data:
  redis_data:
```

**要点：**
- 用 healthcheck + depends_on condition 确保启动顺序
- env_file 加载 .env，environment 覆盖容器内专用值
- 后端挂载 volume 实现热重载
- 前端 nginx 做 SPA fallback + API 反向代理

---

## 四、测试与验证阶段经验

### 4.1 三路并行验证（可复用模式）

用 3 个 Subagent 并行做验证：

| Agent | 职责 | 耗时 | 结果 |
|-------|------|------|------|
| config-consistency-check | .env / docker-compose / alembic / nginx 交叉对比 | 58s | 2❌ 3⚠️ |
| backend-code-check | Python 语法 + 导入 + 模型一致性 + Ruff 风格 | 2m39s | 3❌ 5⚠️ |
| frontend-build-check | TS import 路径 + 类型 + 组件 + 构建预测 | ~2m | 0❌ 2⚠️ |

**发现的 3 个 Critical 问题：**

1. **ORM 模型与 Migration 不一致** — fund.py 字段定义与 001_initial_tables.py 完全不同
2. **services/report.py 字段不匹配** — save_report() 使用了 ORM 中不存在的字段名
3. **services/report.py 审计日志字段不匹配** — save_audit_log() 同理

**根因分析：**
- 开发速度快（2 天 6 个 TASK），ORM 模型经过多次迭代
- Migration 在早期生成，后续 ORM 修改时没有同步更新 Migration
- **没有跑通端到端流程**就标记 done

### 4.2 部署前验证 Checklist（每个项目必须执行）

```markdown
### 基础
- [ ] Docker Compose 能正常 up -d --build
- [ ] 所有服务 healthcheck 通过
- [ ] Alembic migration 能正常执行

### 后端
- [ ] python -c "from app.main import app" 导入成功
- [ ] ORM 模型字段与 Migration 一致
- [ ] Service 层字段与 ORM 模型一致
- [ ] API 端点能正常响应（至少 health check）

### 前端
- [ ] npm install 成功
- [ ] npm run build (vue-tsc + vite) 通过
- [ ] dist/ 目录生成正确

### 配置一致性
- [ ] .env 与 .env.example 变量覆盖完整
- [ ] docker-compose 中的环境变量与 .env 一致
- [ ] nginx.conf 的 proxy_pass 指向正确的 backend 服务

### 端到端
- [ ] 核心 API 能返回结果
- [ ] SSE 流能正常输出
- [ ] 数据能持久化到数据库
- [ ] 前端页面能正常渲染
```

---

## 五、发现的问题与教训

### 5.1 Critical — 必须避免的错误

| # | 问题 | 根因 | 预防措施 |
|---|------|------|----------|
| 1 | ORM 与 Migration 不一致 | 迭代中修改 ORM 但没重新生成 Migration | 每次改 ORM 后立即 alembic revision --autogenerate |
| 2 | Service 层字段名与 ORM 不匹配 | 复制粘贴旧版本字段名 | Service 层直接 import ORM 模型列名，不硬编码字符串 |
| 3 | 标记 done 但未跑通端到端 | 急于推进，缺少集成测试 | Task 的 done 标准必须包含「能跑通」而非「代码写完」 |

### 5.2 三条核心教训

> **"代码写完 ≠ 功能完成"**
>
> 这个项目最大的教训是：6 个 TASK 都标记了 done，但从未在真实环境中跑通过端到端流程。
> ORM 与 Migration 不一致这种 Critical Bug，只要跑一次 alembic upgrade head + 插入一条数据就能发现。

> **"先验证假设，再写代码"**
>
> 且慢 API 一开始被假设为 MCP 协议，实测后才发现是标准 REST API。
> 如果没有验证就按 MCP 架构写了一天代码，浪费的不只是时间，还有信心。

> **"双模式降级是生产级系统的必备"**
>
> LangGraph 模式 (LLM) + Fallback 模式 (数据直出) 的双轨设计非常成功。
> 即使 LLM API 挂了/没配置，系统仍然可用。这个模式值得在所有 AI 产品中复用。

---

## 六、可复用的项目模板

### 6.1 新项目初始化 Checklist

```
Step 1: 需求与技术决策（Day 0）
- [ ] 明确产品需求和目标用户
- [ ] 确认技术栈（前端/后端/数据库/AI）
- [ ] 验证外部数据源/API（先实测，不假设）
- [ ] 记录所有决策到 MEMORY.md

Step 2: Spec 编写（Day 0~1）
- [ ] 按功能模块拆分 Spec
- [ ] 每个 Spec: 数据模型 + API + 业务规则 + 前端组件
- [ ] 人工 Review 并 approve

Step 3: Task 拆分（Day 1）
- [ ] 每个 Spec 对应 1~2 个 Task
- [ ] 按依赖排序：基础设施 → 数据层 → 核心逻辑 → API → 前端 → 增值功能
- [ ] 每个 Task 定义验收标准（含「能跑通」）

Step 4: 编码实现（Day 1~N）
- [ ] 按 Task 顺序执行
- [ ] 每个 Task 完成后跑通端到端流程
- [ ] 同步更新 Migration

Step 5: 验证（每个 Task 完成后）
- [ ] 3 路并行检查（后端/前端/配置一致性）
- [ ] 端到端 smoke test
- [ ] 标记 done 的前提是「能跑通」

Step 6: 部署
- [ ] Docker Compose 启动正常
- [ ] Migration 执行成功
- [ ] 前端构建+部署正常
- [ ] 端到端验证通过
```

### 6.2 可复用的文件结构

```
project-root/
├── .trellis/                    # Trellis SDD 管理
│   ├── config.yaml              # 项目配置
│   ├── WORKFLOW.md              # 工作流程
│   ├── specs/                   # 功能规范 (SPEC-001, 002...)
│   ├── tasks/                   # 开发任务 (TASK-001, 002...)
│   ├── checks/checklist.md      # 质量检查清单
│   └── templates/               # Spec/Task 模板
├── backend/                     # Python 后端
│   ├── app/{main,config,api,services,models,db,utils,agents}/
│   ├── alembic/
│   ├── tests/
│   └── pyproject.toml
├── frontend/                    # Vue 3 前端
│   ├── src/{pages,components,composables,stores,api,types,styles}/
│   ├── nginx.conf
│   └── package.json
├── docker-compose.yml
├── .env / .env.example
├── MEMORY.md
├── AGENTS.md
├── SOUL.md
└── README.md
```

---

## 七、给下一个项目的 7 条建议

1. **加入「端到端验证」门禁** — Task 的 done 条件必须包含：docker compose up 后能跑通核心流程
2. **Migration 自动化检查** — 每次改 ORM 后运行 alembic check 确认无 pending change
3. **真正执行 Subagent 流程** — Doc → Test → Code → QA 四步，不要跳过 Test 和 QA
4. **写 memory** — 每天写工作日志，Session 启动时先读上下文，保证连续性
5. **双模式降级** — 所有依赖外部 AI 服务的功能都要有 Fallback，这是生产级系统标配
6. **配置单一来源** — .env 是唯一真相源，docker-compose / alembic.ini 引用变量，不硬编码
7. **先验证再编码** — 外部 API、数据格式、协议类型，先实测再写 Spec，杜绝假设

---

## 八、项目指标

| 指标 | 数值 |
|------|------|
| 核心开发时间 | ~2 天 |
| Spec 数量 | 6 个 |
| Task 数量 | 6 个 |
| 后端文件数 | 30 个 .py |
| 前端文件数 | 20 个 .ts/.vue |
| 后端代码行数 | ~2500 行 |
| 前端代码行数 | ~2600 行 |
| API 端点 | 5 个 |
| 数据库表 | 4 张 |
| 外部 API 对接 | 14 个方法 |
| Docker 服务 | 4 个 |
| Critical Bugs（验证发现）| 3 个 |
| Warning Issues | 8 个 |

---

*本文档由 Trellis Agent 编写于 2026-03-18，可作为后续项目的参考模板和流程复用指南。*
