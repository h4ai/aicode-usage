# 回归测试报告 — AI Code Usage Dashboard

- 日期：2026-04-19
- Spec：`/data/workspaces/ai-code-usage/docs/specs/SPEC-2026-04-19-regression.md`
- Dispatch：`AI-CODE-USAGE-REGRESSION-001`
- 环境：
  - 前端：`http://localhost:3002`
  - 后端：`http://localhost:8002`

> 备注：今天是周六，`weekday_only=true` 时 **work 统计应为 0**（属于正确行为）。

---

## 1. 执行结论

- 后端 API（用户态）回归：**PASS（基础接口可用）**
- 后端 API（管理员态）回归：**SKIP（本环境 admin 账号无法登录）**
- 前端 E2E 回归：**FAIL（关键 UI 元素定位失败：时段切换器/指标页签）**

总体：**FAIL**（前端 E2E 未通过，需修复或更新选择器/页面结构后重测）。

---

## 2. 用例与结果（按 Spec US 编号）

### US-T01 工作时段配置（Admin）
- 覆盖：接口 `GET/PUT /api/admin/working-hours`
- 结果：**SKIP**（admin 账号在当前 localhost 环境无法通过 `/api/auth/test-login` 登录）

### US-T02 时段过滤全局切换器（个人看板）
- 覆盖：E2E `US-T02/T03: global time filter toggle works and persists`
- 结果：**FAIL**（未找到“工作时段/非工作时段/全天”切换按钮）
- 证据截图：
  - `qa/screenshots/regression-2026-04-19/US-T02-T03-time-filter-toggle-not-found.png`

### US-T03 周末视为非工作时段
- 覆盖：同 US-T02（切换器不可见导致无法验证）
- 结果：**FAIL（阻塞于 UI 元素缺失/定位失败）**

### US-T04 管理后台三 Tab 独立切换器（Admin UI）
- 覆盖：未执行（依赖 admin UI 登录）
- 结果：**SKIP**

### US-T05 模型分布图接入 time_filter（API）
- 覆盖：`GET /api/metrics/model-distribution?time_filter=...`
- 结果：**PASS**（200）

### US-T06 使用明细列表接入 time_filter（API）
- 覆盖：`GET /api/metrics/detail?time_filter=...`
- 结果：**PASS**（200）

### US-T07 关键指标新增「本周」维度（UI）
- 覆盖：E2E `US-T07/T08: key metrics tabs order and week tab exists`
- 结果：**FAIL**（未找到 tabs：今日/本周/本月）
- 证据截图：
  - `qa/screenshots/regression-2026-04-19/US-T07-T08-tabs-missing.png`

### US-T08 关键指标页签顺序调整（UI）
- 覆盖：同 US-T07
- 结果：**FAIL**

### US-T09 管理后台用户管理列字段调整（Admin）
- 覆盖：未执行（依赖 admin 登录）
- 结果：**SKIP**

### US-T10 管理后台 CSV 导出字段同步（Admin）
- 覆盖：`GET /api/admin/users/export-csv?time_filter=...`
- 结果：**SKIP**（admin 登录失败）

### US-T11 使用明细 CSV 导出携带 time_filter（UI+API）
- 覆盖：
  - API：`GET /api/metrics/export.csv?time_filter=...` → **PASS**（200，csv）
  - UI：E2E `US-T11: detail export respects time_filter (smoke)` → **FAIL**（未找到切换器/导出入口）
- 证据截图：
  - `qa/screenshots/regression-2026-04-19/US-T11-export-btn-or-toggle-not-found.png`

### US-T12 时区修复（API）
- 覆盖：`GET /api/metrics/summary?scope=today|week&time_filter=...`
- 结果：**PASS（接口 200）**

---

## 3. 自动化产物

### 3.1 生成的用例文件
- pytest：`/data/workspaces/ai-code-usage/tests/regression/2026-04-19/test_backend_api.py`
- Playwright：
  - 原始生成：`/data/workspaces/ai-code-usage/tests/regression/2026-04-19/test_frontend_e2e.spec.ts`
  - 运行入口（按项目配置 testDir）：`/data/workspaces/ai-code-usage/qa/e2e/regression-2026-04-19.spec.ts`

### 3.2 执行结果摘要
- pytest：17 PASS / 4 SKIP
- Playwright：0 PASS / 3 FAIL

### 3.3 截图证据
- `qa/screenshots/regression-2026-04-19/US-T02-T03-time-filter-toggle-not-found.png`
- `qa/screenshots/regression-2026-04-19/US-T07-T08-tabs-missing.png`
- `qa/screenshots/regression-2026-04-19/US-T11-export-btn-or-toggle-not-found.png`

---

## 4. 主要问题与建议

1) **P0：前端 E2E 无法定位关键控件**
- 现象：登录后页面未出现（或选择器无法匹配）时段切换器、关键指标 tabs
- 建议：
  - 确认登录后路由是否正确进入“个人看板”
  - 给时段切换器、关键指标 tabs 增加稳定的 `data-testid`（例如 `time-filter-all/work/non_work`, `metrics-tab-today/week/month`）
  - 或在 QA 用例中补充跳转到明确 URL（需要产品/研发提供个人看板的固定路径）

2) **Admin 账号在本机环境不可用**
- 现象：`/api/auth/test-login` 对 `admin` 返回 用户不存在/密码错误
- 影响：US-T01/US-T04/US-T09/US-T10 无法验证
- 建议：OPS/研发提供可用的 admin 测试账号，或在 test env 初始化 admin。
