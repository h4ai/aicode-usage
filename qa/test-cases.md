# AI Code Usage — E2E 测试用例（草案）

> 来源：`docs/requirements.md` + `inbox/AI-CODE-USAGE-E2E-QA.dispatch.json`
> 说明：LDAP（AD）当前不可用，AD 登录相关用例按需求标记为 **SKIP**（需真实 AD 环境）。

## Suite A — 认证与权限

- A-001 管理员登录成功，返回 JWT（role=admin）
- A-002 管理员错误密码登录返回 401
- A-003 未携带 Token 访问受保护接口返回 401
- A-004 前端登录页：正确账号密码登录后跳转到 Dashboard
- A-005 前端登录页：错误密码显示错误提示
- A-006 前端刷新页面 JWT 仍有效（localStorage 持久化）

## Suite B — 个人 Dashboard（普通用户视图）

- B-001 配额进度条 API：GET `/api/quota/usage?user_id=uid_016` 返回 used/limit/percent + color/message
- B-002 配额进度条前端：月 Token + 今日请求 两个进度条正确渲染
- B-003 指标卡片 API：GET `/api/metrics/summary?user_id=uid_016`
- B-004 趋势图 API：GET `/api/metrics/trend?user_id=uid_016&start=...&end=...`
- B-005 趋势图前端：ECharts 折线图渲染正常（截图）
- B-006 模型分布 API：GET `/api/metrics/model-distribution`（按实现可能要求 user_id/时间范围）
- B-007 模型分布前端：ECharts 饼/环图渲染正常（截图）
- B-008 明细列表 API：GET `/api/metrics/detail` 分页 + 按 model 过滤 + 日期范围
- B-009 明细列表前端：表格渲染 + 日期范围选择
- B-010 CSV 导出 API：GET `/api/metrics/export.csv` 返回合法 CSV
- B-011 CSV 导出超过 90 天返回 400

## Suite C — 管理员功能

- C-001 用户列表 API：GET `/api/admin/users`
- C-002 更新配额级别 API：PUT `/api/admin/users/{user_id}/level`
- C-003 配额级别 API：GET `/api/admin/quota-levels`
- C-004 全局趋势 API：GET `/api/admin/trend`
- C-005 全局趋势按模型分组：`group_by=model`
- C-006 全局趋势按部门分组：`group_by=department`
- C-007 部门汇总 API：GET `/api/admin/departments`
- C-008 用量排行榜 API：GET `/api/admin/leaderboard?top=10`
- C-009 管理员前端：全局趋势渲染（截图）
- C-010 管理员前端：部门汇总表格渲染（截图）
- C-011 管理员前端：用量排行榜渲染（截图）

## Suite D — 安全与行级权限

- D-001 普通用户 JWT（role=user）访问 `/api/admin/*` 返回 403
- D-002 普通用户只能查看自己的数据（user_id 不可被覆盖）
- D-003 JWT 过期后访问返回 401
- D-004 修改 `config.yaml` 后旧 JWT 失效（cfg fingerprint 机制）
