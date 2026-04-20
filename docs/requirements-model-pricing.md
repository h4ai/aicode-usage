# 模型 Token 价格管理 & 费用计算 需求文档 v0.2

> 状态：✅ 已确认 | 作者：PM | 日期：2026-04-20
> 变更：v0.1 → v0.2：沈老板确认 5 项待确认事项

---

## 一、需求背景

当前系统只统计 Token 用量，不计算费用。不同模型价格差异大，需要引入模型价格体系，让管理员和用户都能看到**实际费用**。

---

## 二、已确认决策

| # | 决策 | 说明 |
|---|------|------|
| 1 | **人民币（CNY）** | 货币单位固定为人民币 |
| 2 | **2 位小数** | 费用显示 ¥xx.xx |
| 3 | **保留价格变更历史** | 按 `effective_from` 查询历史价格 |
| 4 | **优先 input/output 分别计价** | ClickHouse 数据完整支持（2117/2168 条有 input/output），仅 51 条无数据 |
| 5 | **费用不纳入告警** | 不设费用阈值告警 |

---

## 三、费用计算公式

**优先方案（已验证可行）：**
```
费用 = (inputToken / 1,000,000) × input_price + (outputToken / 1,000,000) × output_price
```

> ClickHouse 数据验证：5 个模型全部有 inputToken/outputToken 数据，覆盖率 97.6%。

**当前已知模型（5 个）：**

| 模型 | 需管理员定价 |
|------|-------------|
| GPT-4o | ✅ |
| DeepSeek V3 | ✅ |
| Claude 3.5 Sonnet | ✅ |
| GPT-4o Mini | ✅ |
| Qwen Max | ✅ |

---

## 四、功能详解

### 4.1 管理后台 —「模型价格」页面（新增）

管理后台新增「模型价格」页签，支持 **增删改查**。

**数据模型（PostgreSQL）：**

```sql
-- 当前生效价格
CREATE TABLE IF NOT EXISTS model_pricing (
    id             SERIAL PRIMARY KEY,
    model_name     TEXT NOT NULL,
    input_price    DECIMAL(10, 4) NOT NULL DEFAULT 0,
    output_price   DECIMAL(10, 4) NOT NULL DEFAULT 0,
    currency       TEXT NOT NULL DEFAULT 'CNY',
    effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (model_name, effective_from)
);
```

> 使用 `(model_name, effective_from)` 联合唯一约束，支持价格变更历史。查询时取 `effective_from <= 目标日期` 的最新记录。

**页面功能：**

| 功能 | 说明 |
|------|------|
| 列表 | 模型名称、输入价格（¥/百万Token）、输出价格（¥/百万Token）、生效日期、操作 |
| 新增 | 弹窗：模型名称（下拉+手动输入）、输入价格、输出价格、生效日期 |
| 编辑 | 修改价格 → 新增一条记录（保留历史），或修改当前记录 |
| 删除 | 确认后删除 |
| 模型发现 | 从 ClickHouse 读取所有 `requestModelName`，显示未定价模型，一键导入 |

### 4.2 管理后台 — 用户管理界面调整

**新增列：**

| 列名 | 计算 | 格式 |
|------|------|------|
| 本月费用 | 按模型 input/output 分别计价汇总 | ¥xx.xx |
| 今日费用 | 同上，范围限今日 | ¥xx.xx |

**CSV 导出**：新增「本月费用」「今日费用」列

### 4.3 用户个人面板调整

**指标卡片区新增：**

| 指标 | 维度 | 格式 |
|------|------|------|
| 费用 | 跟随现有「本月/今日」切换 | ¥xx.xx |

**使用明细表格**：新增「费用」列（每条记录的费用）

---

## 五、涉及修改范围

### 5.1 后端（Python/FastAPI）

| 文件 | 修改 |
|------|------|
| `services/database.py` | 新增 `model_pricing` 表 DDL + CRUD |
| `routers/admin.py` | 新增 `/api/admin/model-pricing` CRUD 端点 |
| `routers/admin.py` | 用户列表 + CSV 导出新增费用字段 |
| `services/clickhouse.py` | 按模型分组查 input/output token |
| `routers/metrics.py` | 个人面板费用计算 |

### 5.2 前端（Vue 3）

| 文件 | 修改 |
|------|------|
| `views/admin/` | 新增「模型价格」管理页面 |
| `views/admin/UserManagement.vue` | 表格+CSV 新增费用列 |
| `views/Dashboard.vue` | 指标卡片+明细表新增费用 |
| `router/index.ts` | 新增路由 |
| `api/` | 新增 API 调用 |

### 5.3 数据库

- PostgreSQL 新增 `model_pricing` 表（见上方 DDL）

---

## 六、API 设计

### 模型价格管理

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/admin/model-pricing` | 获取所有模型当前定价 |
| POST | `/api/admin/model-pricing` | 新增定价 |
| PUT | `/api/admin/model-pricing/{id}` | 更新定价 |
| DELETE | `/api/admin/model-pricing/{id}` | 删除定价 |
| GET | `/api/admin/model-pricing/discover` | 发现未定价模型 |
| GET | `/api/admin/model-pricing/history/{model_name}` | 查看价格变更历史 |

### 费用查询（扩展现有接口）

| 接口 | 新增字段 |
|------|----------|
| `GET /api/admin/users` | `monthly_cost`, `today_cost` |
| `GET /api/admin/export/csv` | 「本月费用」「今日费用」列 |
| `GET /api/metrics/summary` | `cost` 字段 |
| `GET /api/metrics/detail` | 每条记录 `cost` 字段 |

---

## 七、管理后台页签顺序

```
用户管理(默认) → 全局趋势 → 用量排行 → 分组汇总 → 模型价格(新增) → 工作时段 → 配额管理
```

---

## 八、未定价模型处理

- 费用显示 `¥0.00`，标记 ⚠️ 提示
- 模型价格页面顶部提示「X 个未定价模型」

---

## 九、优先级

| 优先级 | 功能 |
|--------|------|
| P0 | model_pricing 表 + CRUD API + 管理页面 |
| P0 | 费用计算逻辑 |
| P0 | 用户管理费用列 + CSV |
| P0 | 个人面板费用 |
| P1 | 模型自动发现 |
| P1 | 明细表费用列 |
| P2 | 价格变更历史查看页面 |

---

## 十、技术评估补充（2026-04-20 OPS 评估）

### 10.1 各页面 input/output Token 支持现状

| 页面/模块 | input_token | output_token | total_token | 费用计算可行性 | 所需改动 |
|-----------|-------------|--------------|-------------|----------------|----------|
| 个人看板 - 趋势图 (TrendChart) | ✅ 已有 | ✅ 已有 | ✅ 已有 | ✅ **直接支持** | 无 |
| 个人看板 - 使用明细 (DetailTable) | ✅ 已有 | ✅ 已有 | ✅ 已有 | ✅ **直接支持** | 无 |
| 管理后台 - 全局趋势 (GlobalTrend) | ✅ 后端已返回 | ✅ 后端已返回 | ✅ 已有 | ✅ **直接支持** | 无 |
| 个人看板 - 指标卡 (MetricCards) | ❌ 只有 total_token | ❌ | ✅ | ⚠️ **需扩展 API** | summary 接口新增 `cost` 字段（今日/本周/本月） |
| 管理后台 - 用户管理 (UserManager) | ❌ 只有 total 汇总 | ❌ | ✅ | ⚠️ **需新增函数** | 新增按模型分组的 input/output 聚合查询 |
| 管理后台 - 分组汇总 (DepartmentSummary) | ❌ 只有 monthly_token | ❌ | ✅ | ⚠️ **需扩展** | 新增费用聚合列 |
| 管理后台 - 排行榜 (Leaderboard) | ❌ 只有 monthly_token | ❌ | ✅ | ⚠️ **需扩展** | 新增费用列 |
| 模型分布 (ModelDistribution) | ❌ 只有 total_token | ❌ | ✅ | ⚠️ **需扩展** | 按模型返回 input/output（精确计费用） |

> ClickHouse 数据验证：inputToken / outputToken / totalToken 三个字段均存在，覆盖率 97.6%（2117+2168 条有效，51 条无 input/output 数据）。

### 10.2 后端额外改动清单

| 文件 | 需新增/修改 | 说明 |
|------|------------|------|
| `services/clickhouse.py` | 新增 `get_all_users_monthly_cost()` | 按 user_id + model 分组查 input/output，与 model_pricing 联算费用 |
| `services/clickhouse.py` | 新增 `get_all_users_today_cost()` | 同上，范围限今日 |
| `services/clickhouse.py` | 升级 `get_model_distribution()` | 新增返回 input_token / output_token（当前只有 total） |
| `routers/metrics.py` | `MetricsSummaryResponse` 新增 `cost` 字段 | 今日/本周/本月各维度费用 |
| `routers/admin.py` | `UserItem` 新增 `monthly_cost` / `today_cost` | 用户列表及 CSV 导出 |

### 10.3 前端额外改动清单（补充）

| 文件 | 需新增/修改 |
|------|------------|
| `MetricCards.vue` | 新增费用卡片（跟随今日/本周/本月切换） |
| `DetailTable.vue` | 新增「费用」列（已有 input/output，直接计算） |
| `UserManager.vue` | 新增「本月费用」「今日费用」列 |
| `ModelDistribution.vue` | 新增 input/output 接收，支持按模型精确计费 |
| `DepartmentSummary.vue` | 新增费用聚合列 |
| `Leaderboard.vue` | 新增费用排行列（可选） |

### 10.4 不需要改动的模块

- 个人趋势图（TrendChart）：已有 input/output/total，直接可展示
- 使用明细（DetailTable）：已有 input/output/total，加费用列即可
- 全局趋势（GlobalTrend）：后端已返回 input/output/total

---

## 十一、Ralph 开发方式说明（2026-04-20）

### 11.1 建议的 User Story 拆分

当正式开始开发时，将以下 US 追加到 `scripts/ralph/prd.json`：

| US ID | 标题 | 优先级 | 说明 |
|-------|------|--------|------|
| US-017 | model_pricing 表 DDL + CRUD API | P0 | PG 建表、5 个基础端点、数据库服务层 |
| US-018 | 管理后台「模型价格」管理页面 | P0 | Vue 新页面、AdminView 新增页签 |
| US-019 | ClickHouse 费用计算函数（按模型 input/output 聚合）| P0 | 新增费用查询函数、集成到用户/个人 API |
| US-020 | 用户管理新增费用列 + CSV 导出 | P0 | UserManager.vue + admin.py + export |
| US-021 | 个人面板费用指标卡 + 明细费用列 | P0 | MetricCards.vue + DetailTable.vue |
| US-022 | 未定价模型自动发现 + ⚠️ 提示 | P1 | discover 端点 + 前端提示横幅 |

### 11.2 Codebase Patterns（供 Ralph Agent 使用）

开发前需将以下内容追加到 `scripts/ralph/progress.txt` 的 `## Codebase Patterns` 节：

```
- model_pricing 表在 PostgreSQL，DDL 已在 docs/requirements-model-pricing.md §4.1
- 费用计算公式：(inputToken/1_000_000)*input_price + (outputToken/1_000_000)*output_price，人民币 2 位小数
- 费用查询需从 ClickHouse 按 (user_id, requestModelName) 分组取 sum(inputToken)/sum(outputToken)，再与 PG model_pricing JOIN 算费
- 已有 input/output 的接口：get_daily_trend, get_detail_records, get_global_trend, get_global_trend_by_model
- 需要新增 input/output 的接口：get_model_distribution（当前只有 total_token）
- 汇总类函数（get_all_users_monthly_tokens 等）只取 totalToken，费用计算需新增独立函数，不改原函数签名
- model_pricing 查询时取 effective_from <= 目标日期 的最新记录（最近一条）
- 未定价模型费用显示 ¥0.00，前端加 ⚠️ 标记
- 费用不纳入告警（不设阈值）
- 管理后台页签顺序：用户管理 → 全局趋势 → 用量排行 → 分组汇总 → 模型价格(新) → 工作时段 → 配额管理
```

---

## 十二、PM 评审意见（2026-04-20）

### 12.1 风险项

| # | 风险 | 缓解措施 |
|---|------|----------|
| 1 | **费用计算 N+1 性能** — 用户管理列表对所有用户做「按模型分组→查价格→汇总」，用户多+模型多时可能慢 | 批量查询：一次 ClickHouse 查全部用户的模型分组 token，一次 PG 查全部价格，Python 内存 JOIN 计算，避免逐用户查询 |
| 2 | **改动面比初估大** — 原估 5 后端+6 前端文件，实际 5 后端函数新增/修改 + 6 前端文件改动 + 1 全新 Vue 页面 | 工作量适中但不可轻估，US 拆分已合理，按顺序逐个交付 |
| 3 | **未定价模型静默为 ¥0.00** — 可能导致管理员以为费用真的是 0 | 前端 ⚠️ 标记 + 模型价格页顶部「X 个未定价模型」横幅提醒 |

### 12.2 建议开发顺序

```
US-017（建表+CRUD API）
  → US-019（费用计算函数）
    → US-018（管理页面）
      → US-020（用户管理费用列+CSV）
        → US-021（个人面板费用）
          → US-022（自动发现，P1）
```

> 理由：先有表和 API（017），再有计算逻辑（019），然后管理页面让管理员可以录入价格（018），最后才是展示端（020/021）。022 是 P1 可最后做。

### 12.3 验收标准（PM 定义）

| US | 验收条件 |
|----|----------|
| US-017 | model_pricing 表存在 + 5 个 CRUD API 返回正确 + 单测覆盖 |
| US-018 | 管理后台可见「模型价格」页签 + 增删改查操作正常 + 页面响应 <1s |
| US-019 | 费用计算函数返回正确（手动验算 2 个用户） + 单测覆盖 |
| US-020 | 用户管理表格显示费用列 + CSV 包含费用列 + 数据与 US-019 一致 |
| US-021 | 个人面板显示费用卡片 + 明细表有费用列 + 数据正确 |
| US-022 | 未定价模型列表正确 + 一键导入功能正常 |
