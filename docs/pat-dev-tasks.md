# PAT API 开发任务清单

分支：feat/pat-api（已有 Ralph 完成的基础实现）

## TASK-PAT-001：补充 PAT 单元测试（P0，必须完成）

Ralph 实现了功能代码但未写测试，需补齐以满足验收标准。

### 1. PAT 管理接口测试（backend/tests/test_pat_tokens.py）

测试 `/api/tokens`：
- `test_create_pat_success`：登录用户创建 PAT，返回 token 明文 + 201
- `test_create_pat_invalid_expires`：expires_months=7 返回 422
- `test_create_pat_limit_5`：第 6 个 PAT 返回 400（超上限）
- `test_list_pats`：列出自己的 PAT，看不到他人的
- `test_revoke_pat_success`：撤销成功，状态变 revoked
- `test_revoke_other_user_pat`：撤销他人 PAT 返回 404

### 2. PAT 认证测试（backend/tests/test_pat_auth.py）

- `test_pat_auth_success`：有效 PAT 可访问 /api/v1/usage/summary
- `test_pat_expired`：过期 PAT 返回 401
- `test_pat_revoked`：已撤销 PAT 返回 401
- `test_pat_invalid`：随机字符串 PAT 返回 401
- `test_pat_rate_limit`：模拟 101 次请求，第 101 次返回 429
- `test_pat_lock_after_5_failures`：5 次失败后，正确 PAT 也返回 401（锁定中）
- `test_user_pat_cannot_access_admin`：用户 PAT 访问 /api/v1/admin/* 返回 403
- `test_admin_pat_can_access_admin`：管理员 PAT 访问 /api/v1/admin/leaderboard 返回 200

### 3. v1 接口测试（backend/tests/test_v1_api.py）

- `test_usage_summary_month`：scope=month 返回正确字段
- `test_usage_detail`：返回 list，包含 date/model/total_token 字段
- `test_usage_quota`：返回 quota_level / monthly_token 字段
- `test_admin_leaderboard_pagination`：page=1&page_size=2 返回 total + items

---

## TASK-PAT-002：前端 ApiTokens.vue 质量检查（P1）

检查并修复以下问题：
1. **状态标签判断**：到期时间 ≤ 7 天 → warning，否则 success；已撤销 → info；过期 → danger
2. **复制 Token 按钮**：创建成功后弹窗，el-input readonly + 复制到剪贴板（navigator.clipboard.writeText）+ 警告文字
3. **列表刷新**：创建/撤销后自动刷新列表
4. **管理员专属接口**：API 文档折叠面板中，管理员接口部分仅 admin 用户可见（从 authStore 判断 role）
5. **ESLint 检查**：`cd frontend && npx eslint src/views/ApiTokens.vue` 保证 warning < 10

---

## TASK-PAT-003：前端构建验证（P0，最后执行）

```bash
cd frontend && npm run build
# 确保 0 TypeScript errors
docker compose build frontend
docker compose up -d
curl -s http://localhost:8002/health
```

---

## 完成标准
- ruff 0 errors
- pytest 366+ passed（含新增 PAT 测试）
- frontend build 0 errors
- git commit -m "test(pat): add unit tests for PAT auth, tokens API, v1 endpoints"
- git push origin feat/pat-api
