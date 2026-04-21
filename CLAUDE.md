# CLAUDE.md — AI Code Usage Dashboard

## 项目概述
AI Code Usage 数据看板，用于监控和管理 AI 编码工具的 token 使用量。

## 技术栈
- 后端: Python/FastAPI + ClickHouse + PostgreSQL
- 前端: Vue 3 + Element Plus + ECharts
- 部署: Docker Compose

## 开发规范
- 每次修改后端代码后，必须运行单元测试确认无回归：
  ```bash
  cd backend && python -m pytest tests/ -v --tb=short
  ```
- 全部 PASS 才允许 git commit
- commit 格式: `type(scope): description`，如 `fix(P1-5): split clickhouse.py`

## 测试命令
- 单元测试: `cd backend && python -m pytest tests/ -v`
- API 接口测试: `cd qa && python3 run_e2e_tests.py`
- UI 截图测试: `cd qa && python3 screenshots_playwright_v2.py`

## 环境
- 后端: http://127.0.0.1:8002
- 前端: http://127.0.0.1:3002
- ClickHouse: 127.0.0.1:19000, database: otel
- PostgreSQL: 127.0.0.1:5434, database: ai_usage

## 关键文件
- 后端入口: backend/app/main.py
- ClickHouse 服务: backend/app/services/clickhouse*.py
- 管理路由: backend/app/routers/admin.py
- 测试用例文档: qa/full-e2e-test-cases-with-ac.md
