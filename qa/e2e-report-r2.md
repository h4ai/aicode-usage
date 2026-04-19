# AI Code Usage 数据看板 — E2E 测试报告（R2）

- 任务：`AI-CODE-USAGE-E2E-QA-R2`
- 目标：前端 Bug 修复后全量重测（本轮按指示 **跳过需要前端截图的用例**，完成可用 API 验证并输出报告 + 闭环 dispatch）
- 后端：`http://74.226.48.15:8002`
- 前端：`http://74.226.48.15:3002`
- 执行时间：2026-04-18

## 1. 结论

- API 侧核心链路：**PASS（已覆盖认证/鉴权、个人看板主要指标、导出、管理端聚合与榜单、健康检查）**
- 前端 E2E（页面渲染/路由守卫/截图证据）：**SKIP（原因：browser 工具 snapshot 超时不可用；按指示跳过截图用例）**

## 2. 用例结果汇总（本轮可执行范围）

### Suite A — 认证与鉴权
- A-001 管理员登录成功：PASS
- A-002 管理员错误密码：PASS（401）
- A-003 未携带 Token 访问受保护接口：PASS（401）
- A-005 伪造/失效 Token：PASS（401）
- A-004 普通用户 test-login：PASS（用于替代 LDAP，符合已知 skip/降级策略）

### Suite B — 个人 Dashboard（API 验证）
- B-001 配额进度条：PASS
- B-003 指标卡片 summary：PASS
- B-004 趋势：PASS
- B-005 model distribution：PASS
- B-006 明细：PASS
- B-007 CSV 导出：PASS（`text/csv; charset=utf-8`）

### Suite C — 管理端聚合（API 验证）
- C-001 部门汇总：PASS
- C-002 排行榜：PASS

### Suite D — 健康检查
- D-001 /health：PASS
  - clickhouse: ok
  - postgres: ok
  - ldap: error（预期内：known_skip AD/LDAP 未配置）

## 3. 风险与问题清单

### P1（可接受但需记录）
- 前端截图证据缺失：browser 工具不可用导致无法自动化截图；本轮按指示跳过。

### P2（观察项）
- /health 中 ldap 状态为 error：与 known_skip 一致，但建议在前端/文档中明确“AD 登录不可用时的降级路径”。

## 4. 证据（API 摘要）

> 说明：为避免泄露敏感 token，本报告不粘贴 JWT 原文，仅记录状态码与关键字段。

- `/api/auth/login` admin → 200, role=admin
- `/api/auth/login` wrong password → 401
- `/api/metrics/summary` no token → 401
- `/api/metrics/summary` bad token → 401
- `/api/auth/test-login` uid_016 → 200, role=user
- `/api/quota/usage?user_id=uid_016` → 200, monthly_token.percent=97.4
- `/api/metrics/trend?user_id=uid_016&days=7` → 200
- `/api/metrics/model-distribution?user_id=uid_016&days=30` → 200
- `/api/metrics/detail?user_id=uid_016&days=30` → 200
- `/api/metrics/export.csv?user_id=uid_016&days=30` → 200
- `/api/admin/departments` → 200
- `/api/admin/leaderboard?top=10` → 200
- `/health` → 200
