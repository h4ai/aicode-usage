# Iteration 002 — 个人看板

> 优先级：2 | 依赖：Iteration 001（认证模块）| 预计迭代数：4~5

---

## 目标

实现普通用户的核心看板功能：配额进度条、指标卡片、趋势图、列表、模型分布。

---

## User Stories

### US-005: 配额进度条 API
As a backend, I need quota usage API so that the frontend can display progress bars.

**Acceptance Criteria:**
- [ ] `GET /api/quota/usage` 返回：月度Token用量/限额、今日请求次数/限额、颜色状态
- [ ] 从 ClickHouse 查询当前自然月 `totalToken` 之和（WHERE userId = current_user）
- [ ] 从 PostgreSQL 读取用户配额级别及对应限额
- [ ] 5分钟 TTLCache 缓存 ClickHouse 查询结果
- [ ] Typecheck passes

### US-006: 指标卡片 API
As a backend, I need metrics summary API for the dashboard header cards.

**Acceptance Criteria:**
- [ ] `GET /api/metrics/summary?scope=month|today` 返回：累计Token / 请求次数 / 活跃天数 / 日均Token
- [ ] today 视角返回：今日Token / 今日请求次数（不返回活跃天数/日均）
- [ ] Typecheck passes

### US-007: 配额进度条 + 指标卡片前端
As a user, I want to see my quota usage and key metrics at a glance on the dashboard.

**Acceptance Criteria:**
- [ ] 月度Token进度条：绿/黄/橙/红四色，显示"已用X万/限额Y万"
- [ ] 今日请求次数进度条：绿/橙/红三色
- [ ] 四个指标卡片，支持"本月/今日"切换
- [ ] 今日视角隐藏"活跃天数"，显示"今日Token"
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-008: 趋势图 API + 前端
As a user, I want to see my daily token trend chart.

**Acceptance Criteria:**
- [ ] `GET /api/metrics/trend?days=7|30&start=&end=` 返回按日期分组的 inputToken/outputToken/totalToken
- [ ] 前端：ECharts 柱状图（默认）/ 折线图（切换），输入/输出分色叠加
- [ ] 时间筛选：最近7天 / 最近30天 / 自定义区间
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-009: 明细列表 API + 前端（含导出）
As a user, I want to view detailed usage records and export them.

**Acceptance Criteria:**
- [ ] `GET /api/metrics/detail` 支持时间范围/模型/IDE类型筛选，按日期+模型分组
- [ ] 字段：日期/模型/请求次数/输入Token/输出Token/总Token
- [ ] 支持按列排序
- [ ] `GET /api/metrics/export.csv` 导出CSV，超过3个月返回400
- [ ] 前端：表格 + 筛选器 + 导出按钮
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-010: 模型分布图 API + 前端
As a user, I want to see how my token usage is distributed across models.

**Acceptance Criteria:**
- [ ] `GET /api/metrics/model-distribution` 返回各模型Token占比
- [ ] 前端：ECharts 环形图，支持时间范围筛选
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill
