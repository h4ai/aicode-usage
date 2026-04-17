# Iteration 001 — 项目初始化 & 认证模块

> 优先级：1（最高）| 依赖：无 | 预计迭代数：2~3

---

## 目标

搭建项目骨架，实现登录/登出 + JWT 认证，后续所有功能的基础。

---

## User Stories

### US-001: 项目脚手架
As a developer, I need a working project skeleton so that subsequent stories have a base to build on.

**Acceptance Criteria:**
- [ ] 后端：FastAPI 项目结构（app/、routers/、models/、services/、data_schema.py）
- [ ] 前端：Vue3 + Element Plus + Vue Router + Pinia 项目结构（src/views/、src/components/、src/stores/）
- [ ] Docker Compose 文件：frontend(3002) + backend(8002) + postgres
- [ ] `GET /health` 返回 ClickHouse / PostgreSQL / LDAP 连接状态 JSON
- [ ] `data_schema.py` 定义所有 ClickHouse 字段常量
- [ ] Typecheck passes

### US-002: 管理员登录
As an admin, I want to log in with username/password from config.yaml so that I can access the admin dashboard.

**Acceptance Criteria:**
- [ ] `POST /api/auth/login` 接受 `{username, password}`
- [ ] 验证 bcrypt hash，成功返回 JWT（有效期8小时，含 role=admin）
- [ ] 失败返回 401 + "用户名或密码错误"
- [ ] config.yaml 修改 password_hash 后，旧 JWT 立即失效
- [ ] Typecheck passes

### US-003: AD 用户登录
As a regular user, I want to log in with my AD domain account or display name so that I can see my usage data.

**Acceptance Criteria:**
- [ ] LDAP 连接企业 AD（参数从 config.yaml 读取）
- [ ] 支持 `sAMAccountName` 或 `userNickname` 匹配 ClickHouse `userId` 字段
- [ ] 首次登录自动在 PostgreSQL 创建用户记录，分配 L1 级别
- [ ] 成功返回 JWT（含 userId、role=user）
- [ ] LDAP 不可用时返回友好错误提示
- [ ] Typecheck passes

### US-004: 前端登录页 + 路由守卫
As a user, I want a login page and automatic redirect so that I land on the right page after login.

**Acceptance Criteria:**
- [ ] 登录页：用户名/密码输入框 + 登录按钮
- [ ] 登录成功：普通用户跳转 /dashboard，管理员跳转 /admin
- [ ] 未登录访问受保护页面自动跳转登录页
- [ ] JWT 存 localStorage，失效后自动清除并跳转登录页
- [ ] Typecheck passes
- [ ] Verify in browser using dev-browser skill
