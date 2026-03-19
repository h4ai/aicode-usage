# 夜间任务计划 — 2026-03-19 23:40
创建时间: 2026-03-19 23:40

## 目标
完成 3 项修复 + e2e 验证 + Skill 打包上传功能验证 + ClawHub 热门 Skill 下载上传测试，截图保存。

## 任务拆分

### 🔧 Task A: 修复 + 单元测试全绿（派给 Dev）
- [ ] A1: 修复路由双重前缀 bug（4 个 Controller：admin, stats, sync, audit）
- [ ] A2: 移除 docker-compose `version: '3.8'`
- [ ] A3: 跑完整 Jest 单元测试 → 目标 44/44 Suites 全绿
- [ ] A4: 截图保存测试结果到 `screenshots/unit-test-result.txt`

### 🧪 Task B: e2e 测试验证（派给 QA）
- [ ] B1: Docker 基础设施确认 UP
- [ ] B2: 跑 e2e 测试 `npx jest --config jest-e2e.config.ts --forceExit`
- [ ] B3: 截图/日志保存到 `screenshots/e2e-test-result.txt`
- [ ] B4: 汇报通过/失败数

### 📦 Task C: Skill 打包上传功能验证（派给 Dev）
- [ ] C1: 创建 3 个示例 Skill 工程（含 SKILL.md + 代码 + 测试）
- [ ] C2: 用 CLI `skillhub publish` 或 API 打包上传到本地 SkillHub
- [ ] C3: 验证审核流程触发（自动扫描 + 状态流转）
- [ ] C4: 截图保存结果

### 🌐 Task D: ClawHub 热门 Skill 下载 + 上传验证（派给 Dev）
- [ ] D1: 从 ClawHub (clawhub.com) 获取 10 个热门 Skill 的 ZIP 包
- [ ] D2: 上传到本地 SkillHub 验证
- [ ] D3: 验证搜索/安装功能
- [ ] D4: 截图保存结果

## 依赖关系
- Task A 完成后 → Task B 可以开始（需要修复后的代码）
- Task C + D 需要应用运行中（依赖 Docker 基础设施）
- Task A 和 Task C/D 可以并行（C/D 不需要等单元测试）

## 执行策略
1. 先派 Dev 做 Task A（修复），同时 Dev 也开始 Task C（创建示例工程）
2. Task A 完成后派 QA 做 Task B（e2e）
3. Dev 并行做 Task D（ClawHub 下载上传）
4. 全部完成后 PM 汇总报告

## Git 规范（新增）
- 每次代码修改必须 git commit（有意义的 commit message）
- 完成 Sprint 或重要节点时 push 到 GitHub
- PM 每小时检查各任务完成情况

## PM 巡检机制
- 每小时检查 subagent 状态 + git log
- 巡检内容：任务进度、git commit 数、阻塞项
- 通过 HEARTBEAT.md 触发定时检查

## 当前进度
正在执行: Task A（Dev-1 修复+测试）+ Task C+D（Dev-2 Skill 上传验证）并行
