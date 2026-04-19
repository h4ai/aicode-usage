# 回归测试报告（R2）— AI Code Usage Dashboard

- 日期：2026-04-19
- Spec：`/data/workspaces/ai-code-usage/docs/specs/SPEC-2026-04-19-regression.md`
- Dispatch：`AI-CODE-USAGE-REGRESSION-002`
- 前序失败：`AI-CODE-USAGE-REGRESSION-001`
- 环境：
  - 前端：`http://localhost:3002`
  - 后端：`http://localhost:8002`

---

## 1. R2 变更点（相对 R1）

- 研发已补齐关键控件 `data-testid`，本次 Playwright 用例改为使用：
  - `time-filter-all|work|non-work`
  - `metrics-tab-today|week|month`
  - `detail-export-csv`
- admin 登录按 dispatch 指示改走：`POST /api/auth/login`（已手工验证 200）。

---

## 2. 执行结论

- 后端 API（pytest 回归）：**PASS（用户态）**；admin 相关仍保留为 **SKIP**（pytest 用例当前仍未切换到 admin /api/auth/login 逻辑）
- 前端 E2E（Playwright 回归）：**PASS（3/3）**

总体：**PASS**（以本轮 R2 重点：E2E 选择器修复并验证通过）。

---

## 3. 自动化执行结果

### 3.1 pytest
- 文件：`/data/workspaces/ai-code-usage/tests/regression/2026-04-19/test_backend_api.py`
- 结果：17 PASS / 4 SKIP

### 3.2 Playwright
- 文件：`/data/workspaces/ai-code-usage/qa/e2e/regression-2026-04-19.spec.ts`
- 结果：3 PASS / 0 FAIL

---

## 4. 覆盖点（按 Spec US 编号）

- US-T02/T03（全局时段切换 + 周末规则依赖）：E2E **PASS（控件可操作 + reload 后仍可见）**
- US-T07/T08（关键指标 本周 + 页签顺序相关控件存在）：E2E **PASS（tabs testid 可见）**
- US-T11（明细导出携带 time_filter）：E2E **PASS（触发 download，文件名为 csv）**
- 其余后端接口 smoke 依旧由 pytest 覆盖（work/non_work/all 维度 200）。

---

## 5. 备注 / 后续建议

1) 建议将 pytest 中 admin 相关用例也切到 `/api/auth/login`（与生产一致），避免长期 SKIP。
2) Playwright 建议补充：
   - 切换 work/non_work/all 后，至少验证一个卡片数值发生变化（或请求参数包含 time_filter），以增强断言强度。
