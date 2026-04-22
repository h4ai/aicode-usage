# API 全量接口验证测试报告

**项目**: AI Code Usage  
**测试时间**: 2026-04-21 16:37 CST  
**后端地址**: http://127.0.0.1:8002  
**容器**: ai-code-usage-backend-1  

---

## 概览

| 指标 | 值 |
|------|----|
| 总端点数 | 27 |
| PASS | **27** |
| FAIL | **0** |
| SKIP | 0 |
| 通过率 | **100%** |
| 测试耗时 | 1.55s |

## 详细结果

### 认证 (2/2 PASS)

| # | 端点 | 方法 | 状态码 | 结果 |
|---|------|------|--------|------|
| 1 | `/api/auth/login` | POST | 200 | ✅ PASS |
| 2 | `/api/auth/test-login` | POST | 200 | ✅ PASS |

### 健康检查 (1/1 PASS)

| # | 端点 | 方法 | 状态码 | 结果 |
|---|------|------|--------|------|
| 3 | `/health` | GET | 200 | ✅ PASS |

### 个人指标 — uid_001 (6/6 PASS)

| # | 端点 | 方法 | 状态码 | 结果 |
|---|------|------|--------|------|
| 4 | `/api/metrics/summary` | GET | 200 | ✅ PASS |
| 5 | `/api/metrics/trend?range=7` | GET | 200 | ✅ PASS |
| 6 | `/api/metrics/model-distribution` | GET | 200 | ✅ PASS |
| 7 | `/api/metrics/detail` | GET | 200 | ✅ PASS |
| 8 | `/api/metrics/export.csv` | GET | 200 | ✅ PASS |
| 9 | `/api/metrics/working-hours-config` | GET | 200 | ✅ PASS |

### 配额 (1/1 PASS)

| # | 端点 | 方法 | 状态码 | 结果 |
|---|------|------|--------|------|
| 10 | `/api/quota/usage` | GET | 200 | ✅ PASS |

### 管理员 (17/17 PASS)

| # | 端点 | 方法 | 状态码 | 结果 |
|---|------|------|--------|------|
| 11 | `/api/admin/quota-levels` | GET | 200 | ✅ PASS |
| 12 | `/api/admin/quota-levels/{level}` | PUT | 200 | ✅ PASS (原值还原) |
| 13 | `/api/admin/users` | GET | 200 | ✅ PASS |
| 14 | `/api/admin/users/{id}/level` | PUT | 200 | ✅ PASS (原值还原) |
| 15 | `/api/admin/trend` | GET | 200 | ✅ PASS |
| 16 | `/api/admin/departments` | GET | 200 | ✅ PASS |
| 17 | `/api/admin/leaderboard` | GET | 200 | ✅ PASS |
| 18 | `/api/admin/users/export-csv` | GET | 200 | ✅ PASS |
| 19 | `/api/admin/leaderboard/export-csv` | GET | 200 | ✅ PASS |
| 20 | `/api/admin/working-hours` | GET | 200 | ✅ PASS |
| 21 | `/api/admin/working-hours` | PUT | 200 | ✅ PASS (原值还原) |
| 22 | `/api/admin/email-template` | GET | 200 | ✅ PASS |
| 23 | `/api/admin/email-template` | PUT | 200 | ✅ PASS (原值还原) |
| 24 | `/api/admin/email-template/preview` | POST | 200 | ✅ PASS |
| 25 | `/api/admin/email-template/variables` | GET | 200 | ✅ PASS |
| 26 | `/api/admin/notification-config` | GET | 200 | ✅ PASS |
| 27 | `/api/admin/notification-config` | PUT | 200 | ✅ PASS (原值还原) |

## 后端日志分析

### 测试期间日志摘要

- **测试请求**：全部 200，无 4xx/5xx
- **已知问题（非本次测试触发）**：

| 问题 | 严重度 | 说明 |
|------|--------|------|
| ClickHouse 并发 session 错误 | ⚠️ Medium | `ProgrammingError: Attempt to execute concurrent queries within the same session` — 前端并发请求触发，metrics/detail、model-distribution、summary、admin/trend 等端点返回 500。**根因**：`clickhouse_connect` client 单例在多线程下共享 session，需改为 per-request 或连接池模式。 |
| LDAP 不可达 | ℹ️ Low | LDAP 127.0.0.1:389 连接被拒 — 测试环境无 LDAP 服务，test-login 走 fallback 逻辑正常。 |
| JWT key 长度警告 | ℹ️ Low | HMAC key 30 bytes < 推荐 32 bytes — 功能不受影响，建议升级密钥长度。 |

### ClickHouse 并发 Bug 详情

后端日志中出现 **5 次 500 错误**（均为前端并发请求触发，非本次 pytest 触发）：
- `GET /api/metrics/detail` × 3
- `GET /api/metrics/model-distribution` × 1  
- `GET /api/metrics/summary` × 1
- `GET /api/admin/trend` × 1

**建议修复**：将 `clickhouse_connect` 客户端从全局单例改为 per-request 创建或使用线程安全的连接池。

## 结论

### ✅ PASS — 全部 27 个 API 端点通过验证

所有端点返回预期状态码，响应体结构正确，PUT 操作均已还原原值。后端存在一个已知的 ClickHouse 并发 session bug（与本次测试无关，由前端并发访问触发），建议后续修复。
