# 测试目录结构说明

本项目测试分为三层：

## `backend/tests/` — 单元 & 集成测试（pytest）

- 覆盖 FastAPI 路由、服务层、数据模型
- 使用 mock 替代真实 ClickHouse/PostgreSQL 连接
- 运行命令：`cd backend && python -m pytest tests/ -q`
- CI 强制通过，PR 不允许降低覆盖率

## `tests/` — API 集成测试

- `test_api_full.py`：面向真实后端服务的黑盒 API 测试
- `regression/`：历史回归用例
- 需要真实服务运行（`docker compose up`），不纳入 CI 单元测试阶段

## `qa/` — E2E 测试 & 报告（Playwright）

- `e2e/`：Playwright 端到端测试（浏览器级别）
- `run_e2e_tests.py`、`screenshots_playwright*.py`：E2E 执行脚本
- `*.md / *.pdf`：QA 验收报告，不是可执行测试
- 运行命令：`python run_e2e_tests.py`（需要完整服务栈）

## 层次关系

```
backend/tests/   →  快速，mock 依赖，CI 必跑
tests/           →  中速，真实 API，集成验证
qa/              →  慢，真实浏览器，验收阶段
```
