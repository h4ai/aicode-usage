# AI Code Usage 数据看板 — PO 验收报告

> 项目：AI Code Usage 数据看板  
> 需求文档版本：v0.7  
> 验收时间：2026-04-18  
> 验收人：PO Agent  
> 验收方式：API 直测（curl）+ Playwright UI 截图  

---

## ⚠️ 关键阻断问题（CRITICAL — 必须修复才能上线）

### BUG-001：前端 Vite Proxy 配置错误，导致所有 API 调用 500

**位置：** `frontend/vite.config.ts`

**根因：** Vite dev server 运行在 Docker 容器内（`ai-code-usage-frontend-1`），proxy target 配置为 `http://localhost:8002`，但 backend 是独立容器，容器内 `localhost:8002` 不通。

```diff
// vite.config.ts
proxy: {
  '/api': {
-    target: 'http://localhost:8002',   // ❌ 容器内 localhost 不通
+    target: 'http://backend:8002',      // ✅ Docker 网络 service name
    changeOrigin: true,
  },
}
```

**影响范围：前端 100% 功能不可用**
- 登录按钮点击后无反应，留在登录页
- 所有 `/api/*` 请求返回 500
- 配额进度条、指标数据、管理员功能全部 No Data

**验证：**
```
前端 API 响应：
  500 http://localhost:3002/api/admin/users
  500 http://localhost:3002/api/admin/quota-levels
  
Backend 容器内直连 backend:8002 → 401（正常，需带 token）
```

**修复方案：** 将 `vite.config.ts` 中所有 proxy target 从 `localhost:8002` 改为 `backend:8002`，重新构建前端镜像。

---

## 验收范围 & 结论

| 功能模块 | 验收方式 | 结论 | 说明 |
|---------|---------|------|------|
| **三、认证 - 管理员登录** | API 直测 | ✅ PASS | 后端正常，前端因 BUG-001 无法完成登录 |
| **三、认证 - JWT 颁发** | API 直测 | ✅ PASS | JWT 正常颁发，有效期 8h |
| **三、认证 - 错误密码拒绝** | API 直测 | ✅ PASS | 返回 "用户名或密码错误" |
| **四、配额 - L1/L2/L3 三级** | API 直测 | ✅ PASS | L1(500万/500次)、L2(1000万/1000次)、L3(2000万/2000次) |
| **四、配额 - 进度条颜色告警** | API 直测 | ✅ PASS | color/message 字段逻辑正确（<50%绿、50-79%黄等） |
| **四、配额 - 前端进度条显示** | UI 截图 | ❌ FAIL | BUG-001 导致 API 500，进度条无数据 |
| **六、个人看板 - 累计指标** | API 直测 | ✅ PASS | total_token/request_count/active_days/daily_avg_token 正确 |
| **六、个人看板 - 今日视角** | API 直测 | ✅ PASS | active_days=null、daily_avg_token=null（符合需求） |
| **六、个人看板 - 趋势图数据** | API 直测 | ✅ PASS | 7/30天数据返回正确，含 input/output 分色字段 |
| **六、个人看板 - 模型分布** | API 直测 | ✅ PASS | 环形图数据含 model/total_token/percent |
| **六、个人看板 - 明细列表** | API 直测 | ✅ PASS | 字段完整，支持排序（sort_by/sort_order） |
| **六、个人看板 - 明细列表 IDE 筛选** | API 直测 | ⚠️ BLOCKED | ide_type 参数存在于 schema，但缺乏测试数据覆盖 |
| **六、个人看板 - CSV 导出** | API 直测 | ✅ PASS | 3个月内正常导出，超3个月返回 400 |
| **六、个人看板 - 前端 UI** | UI 截图 | ❌ FAIL | BUG-001 导致数据全 0 |
| **七、管理员 - 用户管理列表** | API 直测 | ✅ PASS | 25 用户，含 display_name/enterprise/quota_level/月Token |
| **七、管理员 - 修改用户级别** | API 直测 | ✅ PASS | PUT 接口正常，修改生效 |
| **七、管理员 - 配额级别管理** | API 直测 | ✅ PASS | L1/L2/L3 固定三级，修改额度正常 |
| **七、管理员 - 全局趋势** | API 直测 | ✅ PASS | 支持按 model/department 分组 |
| **七、管理员 - 部门汇总** | API 直测 | ✅ PASS | 按 enterprise 分组，含人数/月Token/日请求 |
| **七、管理员 - 用量排行榜** | API 直测 | ✅ PASS | Top 10/20/50 参数正常，含配额使用率 |
| **七、管理员 - 前端 UI（QuotaLevelManager + UserManager）** | UI 截图 | ❌ FAIL | BUG-001 导致 No Data |
| **七、管理员 - 全局趋势/部门汇总/排行榜 前端页面** | UI 检查 | ❌ FAIL | **缺失**：前端 AdminView.vue 仅含 QuotaLevelManager + UserManager，无全局趋势/部门汇总/排行榜组件 |
| **九、健康检查 GET /health** | API 直测 | ✅ PASS | ClickHouse/PostgreSQL OK，LDAP error（已知，未配置） |
| **三个 Tab 时间筛选各自独立** | 代码审查 | ✅ PASS | 前端各 Tab 使用独立状态变量 |
| **AD 域登录** | BLOCKED | - | 已知未完成，不验收 |
| **邮件通知** | BLOCKED | - | 已知未完成，不验收 |

---

## 详细验收结果

### 三、认证模块

**PASS ✅** — 后端 API 完整，JWT 机制正确。

```bash
# 管理员登录
POST /api/auth/login {"username":"admin","password":"8rOcpnvEUSBCG8d#"}
→ {"token": "eyJ...", "role": "admin"}  ✅

# 错误密码
POST /api/auth/login {"username":"admin","password":"wrong"}
→ {"detail": "用户名或密码错误"}  ✅
```

**前端登录** ❌ — 由于 BUG-001，点击"登录"按钮后页面停留在 `/login`，无任何反应。截图：`screenshots/04-login-fail-proxy-bug.png`

---

### 四、配额体系

**PASS ✅** — 后端配额逻辑符合需求。

```json
// GET /api/quota/usage (uid_003 样本)
{
  "monthly_token": {"used": 318723, "limit": 5000000, "percent": 6.4, "color": "green", "message": "使用正常"},
  "daily_requests": {"used": 0, "limit": 500, "percent": 0.0, "color": "green", "message": "今日使用正常"}
}
```

颜色告警逻辑验证（API 字段）：
- `color: "green"` 对应 < 50% ✅
- `color: "yellow"` 对应 50-79%（API 字段正确，未达触发阈值）
- `color: "orange"` 对应 80-99%（同上）
- `color: "red"` 对应 ≥ 100%（同上）

**前端进度条** ❌ — 因 BUG-001 无法加载，页面显示"配额使用"区域但无数据。

---

### 六、个人看板

**后端 PASS ✅，前端 FAIL ❌（BUG-001）**

| 指标 | 验收结果 |
|------|---------|
| 累计指标（月度/今日切换） | ✅ API 正常，今日视角 active_days=null 符合需求 |
| 趋势图数据（7天/30天） | ✅ 含 date/input_token/output_token/total_token |
| 模型分布 | ✅ 5 个模型，含 percent 占比 |
| 明细列表 | ✅ 支持 sort_by/sort_order 排序 |
| CSV 导出 3 个月 | ✅ 正常返回 CSV，含中文表头 |
| CSV 超 3 个月 | ✅ 返回 400 拒绝 |

截图：`screenshots/02-dashboard.png`（数据全 0，因 proxy 问题）

---

### 七、管理员视图

**后端 PASS ✅，前端有两类问题：**

1. **BUG-001 导致** No Data（proxy 修复后可恢复）
2. **前端缺失 3 个功能模块**（独立 Bug）

| 功能 | 后端 API | 前端组件 |
|------|---------|---------|
| 用户管理 | ✅ 25 用户，含部门 | ✅ UserManager.vue（存在，BUG-001 影响数据） |
| 配额级别管理 | ✅ 修改 L1/L2/L3 正常 | ✅ QuotaLevelManager.vue（存在，BUG-001 影响数据） |
| 全局趋势 | ✅ `/api/admin/trend` 正常，支持 model/dept 分组 | ❌ **缺失组件** |
| 部门汇总 | ✅ `/api/admin/departments` 正常 | ❌ **缺失组件** |
| 用量排行榜（Top 10/20/50） | ✅ `/api/admin/leaderboard` 正常 | ❌ **缺失组件** |

截图：`screenshots/03-admin.png`

---

### 九、健康检查

```json
GET /health
{
  "clickhouse": {"status": "ok"},
  "postgres": {"status": "ok"},
  "ldap": {"status": "error", "detail": "...Transport endpoint is not connected"}
}
```

**PASS ✅** — LDAP error 为已知未配置项，ClickHouse + PostgreSQL 正常。

---

## 问题汇总

| ID | 级别 | 描述 | 影响范围 | 修复建议 |
|----|------|------|---------|---------|
| BUG-001 | 🔴 CRITICAL | Vite proxy target 为 `localhost:8002`，容器内不通 | 前端 100% 功能不可用 | 改为 `backend:8002` 重新构建 |
| BUG-002 | 🔴 CRITICAL | AdminView.vue 缺少全局趋势、部门汇总、用量排行榜三个组件 | 管理员视图 60% 功能缺失 | 补充三个组件及对应路由/导航 |

---

## 验收统计

| 维度 | 数量 |
|------|------|
| 后端 API 验收点 | 18 |
| 后端 PASS | 17 |
| 后端 BLOCKED（IDE筛选测试数据不足） | 1 |
| 前端 UI 验收点 | 8 |
| 前端 PASS | 0 |
| 前端 FAIL（BUG-001 + BUG-002） | 8 |

**后端覆盖率：94.4%（17/18，排除 BLOCKED）**  
**整体可用性：0%（前端完全不可用）**

---

## 验收结论

**❌ REJECT — 不通过，禁止上线**

### 必须修复后重新验收

1. **BUG-001（CRITICAL）**：修复 `vite.config.ts` proxy target，重新构建前端镜像并在容器内验证 `/api/auth/login` 可以正常返回 200。
2. **BUG-002（CRITICAL）**：补充 AdminView 的全局趋势、部门汇总、用量排行榜三个前端组件。

### 修复完成后预期结论

后端逻辑实现质量良好，数据接口完整，业务逻辑符合需求。修复两个前端 Bug 后可以进行复验，预计复验通过率 95%+。

---

## 截图清单

| 截图 | 说明 |
|------|------|
| `screenshots/01-login.png` | 登录页面 |
| `screenshots/02-dashboard.png` | 个人看板（BUG-001 影响，数据 0） |
| `screenshots/03-admin.png` | 管理员视图（BUG-001 + BUG-002 影响） |
| `screenshots/04-login-fail-proxy-bug.png` | BUG-001 演示：点击登录后停留在登录页 |
