# Iteration 003 — 管理员后台

> 优先级：3 | 依赖：Iteration 001（认证）+ Iteration 002（看板基础查询）| 预计迭代数：4~5

---

## 目标

实现管理员后台全部功能：用户管理、配额级别管理、全局趋势、部门汇总、用量排行榜。

---

## User Stories

### US-011: 配额级别管理 API + 前端
As an admin, I want to view and edit quota level limits.

**Acceptance Criteria:**
- [ ] `GET /api/admin/quota-levels` 返回 L1/L2/L3 三级配置（名称/月Token限额/日请求上限/当前人数）
- [ ] `PUT /api/admin/quota-levels/{level}` 修改额度，立即生效
- [ ] 固定三级，不支持新增/删除（API 拒绝此类请求）
- [ ] 前端：表格展示 + 行内编辑
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-012: 用户管理 API + 前端
As an admin, I want to view all users and change their quota levels.

**Acceptance Criteria:**
- [ ] `GET /api/admin/users` 返回：显示名/userId/enterprise/当前级别/本月Token/今日请求次数
- [ ] 显示名：`userNickname` 优先，取不到用 `username`；enterprise 为空显示"未知"
- [ ] `PUT /api/admin/users/{userId}/level` 修改用户级别
- [ ] 前端：表格 + 级别下拉修改
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-013: 全局趋势 API + 前端
As an admin, I want to see the overall token usage trend across all users.

**Acceptance Criteria:**
- [ ] `GET /api/admin/trend` 返回所有用户汇总的每日 Token 趋势
- [ ] 支持按模型/部门分组参数
- [ ] 前端：ECharts 折线图/柱状图，支持分组切换
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-014: 部门汇总 API + 前端
As an admin, I want to see usage breakdown by department.

**Acceptance Criteria:**
- [ ] `GET /api/admin/departments` 按 `enterprise` 字段分组，NULL/空值归"未知"
- [ ] 返回：部门/人数/本月Token/本月请求次数/人均Token
- [ ] 前端：表格展示
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-015: 用量排行榜 API + 前端
As an admin, I want to see a leaderboard of top users by token consumption.

**Acceptance Criteria:**
- [ ] `GET /api/admin/leaderboard?top=10|20|50` 按本月Token排序
- [ ] 返回：排名/显示名/部门/级别/Token用量/请求次数/配额使用率
- [ ] 非管理员调用返回 403
- [ ] 前端：表格 + Top N 切换，管理员菜单中可见，普通用户不可见
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill

### US-016: 邮件通知服务
As a system, I need an automated email alert when users reach 80% of monthly quota.

**Acceptance Criteria:**
- [ ] APScheduler 每小时轮询所有用户月度用量
- [ ] 首次达到80%时发送邮件（同月内只发一次，状态存 PostgreSQL）
- [ ] 邮件收件人从 AD `mail` 属性获取，取不到则跳过记录日志
- [ ] SMTP 发送失败不标记已发送，下次重试
- [ ] SMTP 配置从 config.yaml 热加载
- [ ] Typecheck passes
