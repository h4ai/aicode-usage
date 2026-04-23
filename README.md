# AI Code Usage Dashboard

> 企业 AI 编程助手用量可视化看板  
> 技术栈：Vue3 + Element Plus + ECharts + Python FastAPI + ClickHouse + PostgreSQL  
> 部署方式：Docker Compose（单机，适配内网离线环境）

---

## 功能概览

- **个人看板**：用户通过 AD 域账号登录，查看自己的 Token 消耗、对话轮次、活跃天数、趋势图、模型分布、使用明细（含 CSV 导出）
- **时段过滤**：支持全天 / 工作时段 / 非工作时段三种统计口径，工作时段定义可由管理员配置
- **配额管理**：月度 Token 上限 + 每日对话轮次上限，超限红色预警，接近预警黄色提示
- **管理后台**：
  - 用户管理（含状态指示灯、分组筛选、CSV 导出）
  - 全局趋势图（按天/按分组，支持时段过滤）
  - 分组汇总（各分组 Token 用量 & 对话轮次汇总）
  - 用量排行榜（Top N 用户排名，**点击用户名可查看个人明细弹窗**）
  - 工作时段设置（管理员配置起止时间和工作日范围）
  - 配额级别管理（L1/L2/L3 月度 Token + 日对话轮次上限）
  - **邮件通知设置**（US-017~022）：多阈值多配额项轮询通知、可配置检查间隔、邮件模板在线编辑与预览
  - **邮件记录管理**：查看所有已发邮件记录、手动重发、删除去重记录
- **PAT 外部 API**（/api/v1/）：通过 Personal Access Token 无需登录直接调用，支持个人用量查询和管理员数据查询，适合 AI Agent / 脚本集成

---

## 部署架构

```
浏览器
  └─▶ 前端容器 :3002 (Node Express)
        ├─ 静态文件 + SPA fallback
        └─ /api/* → 反向代理 → 后端容器 :8002 (FastAPI)
                                  ├─ PostgreSQL :5432 (配额/用户配置)
                                  └─ ClickHouse :8123 (用量数据，已有实例)
```

> **内网离线说明**：前后端镜像均无 `apt-get` 调用。LDAP 使用纯 Python 的 `ldap3` 库，邮件使用 `aiosmtplib`，构建时只需 pip wheel，适合无外网访问的金融内网环境。
> **基础镜像**：后端基于 `python:3.11.12-slim`，前端基于 `node:22.14-alpine`。

---

## 快速部署

### 前置条件

| 依赖 | 版本要求 | 说明 |
|------|---------|------|
| Docker | 20.x+ | 容器运行时 |
| Docker Compose | v2.x+ | 编排工具 |
| ClickHouse | 23.x+ | 已有实例，HTTP 端口 8123 |
| 企业 AD（LDAP） | 可选 | 测试环境可用内置 test-login 绕过 |

### 1. 克隆仓库

```bash
git clone https://github.com/h4ai/aicode-usage.git
cd aicode-usage
```

### 2. 配置 `backend/config.yaml`

```yaml
admins:
  - username: admin
    password_hash: "$2b$12$..."   # bcrypt hash，见下方生成命令

ldap:
  server: "ldap://your-ad-server:389"   # 支持 ldap:// 和 ldaps://
  base_dn: "DC=company,DC=com"
  domain: "CORP"                        # NTLM 域名（AD 环境填写）
  bind_dn: ""                           # 可选：服务账号 DN，用于搜索用户信息
  bind_password: ""                     # 可选：服务账号密码

clickhouse:
  host: "host.docker.internal"          # 宿主机 ClickHouse（Linux 填宿主机 IP）
  port: 8123                            # HTTP 端口（clickhouse_connect 使用 HTTP 协议）
  database: "otel"
  user: "default"
  password: ""

database:
  url: "postgresql://postgres:postgres@postgres:5432/ai_usage"

smtp:
  host: "mailrelay.company.com"        # ⚠️ SMTP 服务器地址（必填才能发邮件；留空或虚拟值时邮件功能禁用）
  port: 25                              # 端口：25(SMTP) / 587(STARTTLS) / 465(SSL)
  username: ""                          # 认证用户名（无需认证时留空）
  password: ""                          # 认证密码（无需认证时留空）
  from_email: "ai-usage@company.com"   # 发件人地址（字段名 from_email）
  from_name: "AI 使用助手"              # 发件人显示名
  use_tls: false                        # 是否使用 SSL/TLS（端口 465 时设 true）
  use_starttls: false                   # 是否使用 STARTTLS（端口 587 时设 true）

working_hours:
  enabled: false                        # true=开启工作时段过滤
  start: "09:00"
  end: "18:00"
  weekday_only: true

notification:
  enabled: true                         # false=关闭邮件通知（不启动 scheduler）
  check_interval_minutes: 30            # 轮询间隔（分钟）⚠️ 修改后需重启服务才生效
  thresholds: [50, 80, 100]             # 触发阈值（%）
  email_domain: ""                      # ⚠️ AD 未存邮箱时自动拼接 sam@email_domain，必须填写否则跳过所有用户
  email_batch_size: 10                  # 每批发送数量（防止 SMTP 限速）
  email_batch_delay_seconds: 2          # 批次间隔秒数
  # check_interval_minutes 和 email_domain 无前端界面，只能在此处修改，改后需重启

security:
  cors_origins:
    - "http://localhost:3002"    # 生产环境改为实际前端域名，禁止保留 "*"
    # - "https://ai-usage.company.com"

auth:
  allow_test_login: false               # ⚠️ 生产环境必须为 false！true 仅用于测试环境（LDAP 不可用时绕过认证）
```

> **注意**：`auth.allow_test_login` 在 config.yaml 中默认值为 `true`（开发默认），部署生产时必须改为 `false`。

> 注：smtp.host 未配置时邮件通知功能不生效，服务仍正常启动（只打 WARN 日志）

**生成管理员密码 hash（bcrypt）：**

```bash
docker run --rm python:3.12-slim python3 -c \
  "import bcrypt; print(bcrypt.hashpw(b'YOUR_PASSWORD', bcrypt.gensalt()).decode())"
```

### 3. 配置前端后端地址（可选）

默认前端通过 Docker 内部网络访问后端（`http://backend:8002`）。  
如后端部署在独立主机，修改 `docker-compose.yml`：

```yaml
frontend:
  environment:
    - BACKEND_URL=http://192.168.1.100:8002   # 改为后端实际地址
```

> 注意：`BACKEND_URL` 是容器到容器的内部地址，浏览器始终通过相对路径 `/api` 访问（由前端容器代理），无需暴露后端地址给客户端。

### 4. 启动服务

```bash
docker compose up -d
```

等待约 30 秒，所有容器健康后访问：

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端看板 | http://localhost:3002 | 用户/管理员登录入口 |
| 后端 API | http://localhost:8002 | FastAPI，含 /docs 接口文档 |
| 健康检查 | http://localhost:3002/health | 各依赖服务状态 |
| PostgreSQL | localhost:5434 | 配额/用户配置持久化 |

### 5. 验证部署

```bash
# 检查所有服务状态
curl http://localhost:3002/health
# 期望输出：{"clickhouse":{"status":"ok"},"postgres":{"status":"ok"},"ldap":{"status":"ok"}}

# 检查容器状态
docker compose ps
```

### 6. 登录方式

| 角色 | 登录方式 | 说明 |
|------|---------|------|
| 管理员 | 用户名 + 明文密码 | 对应 `config.yaml` admins 中的账号 |
| 普通用户 | AD 域账号 + 域密码 | 需配置 `ldap.server` |
| 测试用户 | `POST /api/auth/test-login` | LDAP 未接入时使用，验证 ClickHouse 中存在该 userId |

---

## ClickHouse 数据源要求

系统读取 `otel.events` 表，需包含以下字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `userId` | String | 用户域账号（如 `zhangsan`） |
| `userNickname` | String | 显示名称 |
| `enterprise` | String | 分组/部门名称 |
| `eventCode` | LowCardinality(String) | 事件类型（`chat_request_response` 等） |
| `requestModelName` | String | 模型名称 |
| `inputToken` | Int64 | 输入 Token 数 |
| `outputToken` | Int64 | 输出 Token 数 |
| `totalToken` | Int64 | 总 Token 数 |
| `timestamp` | Int64 | 毫秒时间戳 |
| `event_date` | Date | MATERIALIZED 列（`toDate(toDateTime(timestamp/1000))`） |

---

## 项目结构

```
aicode-usage/
├── backend/                    # Python FastAPI 后端
│   ├── app/
│   │   ├── main.py
│   │   ├── routers/
│   │   │   ├── auth.py         # 登录 / JWT / test-login
│   │   │   ├── metrics.py      # 个人指标接口（含时段过滤）
│   │   │   ├── quota.py        # 配额查询
│   │   │   └── admin.py        # 管理后台接口
│   │   └── services/
│   │       ├── clickhouse.py          # ClickHouse 查询层（re-export，向后兼容）
│   │       ├── clickhouse_client.py   # 连接池 + 缓存（TTL 5min）+ 安全数值转换
│   │       ├── clickhouse_filters.py  # 查询过滤器（时段/用户/基础条件）
│   │       ├── clickhouse_user.py     # 单用户查询函数
│   │       ├── clickhouse_admin.py    # 管理端批量查询函数
│   │       ├── database.py            # PostgreSQL（配额/用户配置）
│   │       ├── ldap_service.py        # AD 认证（ldap3 纯 Python）
│   │       ├── notification.py        # 邮件通知 v1（已废弃，兼容保留）
│   │       ├── notification_v2.py     # 邮件通知 v2（多阈值/多配额项，当前使用）
│   │       └── template_renderer.py   # 邮件模板渲染（9个占位符）
│   ├── tests/                  # pytest 单元测试（362 cases）
│   ├── config.yaml             # ⚠️ 部署前必须修改
│   ├── Dockerfile              # 无 apt-get，纯 pip 构建
│   └── pyproject.toml
├── frontend/                   # Vue3 + TypeScript 前端
│   ├── src/
│   │   ├── views/              # 页面组件
│   │   └── components/         # 通用组件
│   ├── server.cjs              # Express 静态服务 + /api 反向代理（替代 nginx）
│   ├── Dockerfile              # node:22-alpine，无 nginx
│   └── package.json
├── docs/
│   ├── requirements.md         # 需求文档
│   └── specs/                  # GEARS 行为规格
├── sql/                        # ClickHouse 建表/视图 SQL
└── docker-compose.yml
```

---

## 配额级别说明

| 级别 | 月度 Token 上限 | 每日对话轮次上限 | 适用场景 |
|------|----------------|----------------|---------|
| L1 | 2,500 万 | 100 轮/天 | 普通使用者 |
| L2 | 5,000 万 | 200 轮/天 | 中度用户 |
| L3 | 1 亿 | 500 轮/天 | 重度用户 / 核心开发者 |

---

## 时段过滤说明

| 口径 | 说明 |
|------|------|
| 全天 | 不做时间限制，统计所有数据 |
| 工作时段 | 仅统计配置的起止时间内（默认 09:00-18:00，周一至周五）|
| 非工作时段 | 全天数据减去工作时段，含节假日/周末 |

---

## 开发环境

```bash
# 后端（Python 3.12+）
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8002

# 前端（Node 22+）
cd frontend
npm install
npm run dev        # Vite dev server，自动代理到 backend:8002

# 运行后端单元测试
cd backend
PYTHONPATH=. pytest tests/ -v
```

---

## 安全配置

### CORS

生产部署前，务必修改 `backend/config.yaml` 中的 `security.cors_origins`，替换为实际前端域名：

```yaml
security:
  cors_origins:
    - "https://ai-usage.your-company.com"   # 替换为实际地址
```

通配符 `["*"]` 仅保留为代码兼容 fallback，**不得用于生产**。详见 `docs/security-cors-config.md`。

### Rate Limiting

API 已内置限速（slowapi）：
- 全局默认：200 次/分钟（per IP）
- 登录接口：20 次/分钟（per IP）

无需额外配置，限速头会随 HTTP 响应返回（`X-RateLimit-*`）。

### test-login

`auth.allow_test_login: true` 仅用于测试环境（LDAP 不可用时）。**生产必须设为 `false`**。

### JWT Secret

JWT 签发密钥在 `backend/app/services/auth.py` 中以常量形式存在：

```python
_JWT_SECRET = "ai-code-usage-secret-change-me"
```

**生产部署前必须修改**为足够强度的随机字符串（建议 ≥ 32 字节）。修改方式：

```bash
# 生成随机 secret
python3 -c "import secrets; print(secrets.token_hex(32))"
# 将输出值替换 backend/app/services/auth.py 第 15 行的 _JWT_SECRET 值
```

> ⚠️ 修改 SECRET 后所有已签发的 JWT 立即失效，用户需重新登录。

### 邮件通知配置

邮件通知所有参数均通过 `backend/config.yaml` 配置（**前端不提供修改界面**）：

```yaml
smtp:
  host: "mailrelay.company.com"    # ⚠️ 必填，留空或使用虚拟值时邮件功能禁用
  port: 25
  username: ""
  password: ""
  from_email: "ai-usage@company.com"
  from_name: "AI 使用助手"
  use_tls: false
  use_starttls: false              # 587 端口时建议 true

notification:
  enabled: true
  check_interval_minutes: 30       # 轮询间隔（分钟），仅重启生效
  thresholds: [50, 80, 100]        # 触发阈值（%）
  email_domain: ""                 # AD 未存邮箱时自动拼接 sam@email_domain，如 "corp.com"
  email_batch_size: 10             # 每批发送数量（防止 SMTP 限速）
  email_batch_delay_seconds: 2     # 批次间隔秒数
```

> 注：修改 `smtp.host` 或 `notification.check_interval_minutes` 后需 `docker compose restart backend` 才能生效（热重载不触发调度器重建）。

### 用户操作审计日志

v1.3.0 起后端自动记录所有关键操作的审计日志，无需配置：

```
[AUDIT] user=admin action=查看用量排行榜 path=/api/admin/leaderboard status=200
[AUDIT] user=张三 action=创建 API Token path=/api/tokens status=201
```

覆盖范围：登录/登出、用户管理、配额配置、邮件通知配置、数据导出、PAT 管理等 20+ 操作。日志格式与其他日志统一，可通过 `grep "\[AUDIT\]"` 过滤。

---

## 常见问题

**Q: LDAP 未配置，如何测试登录？**  
A: 使用 `POST /api/auth/test-login`，body `{"username":"uid_001","password":"<test_password>"}`，系统只验证 ClickHouse 中存在该 userId，无需 AD 认证。

**Q: ClickHouse 在宿主机而非 Docker 内，如何连接？**  
A: `config.yaml` 中 `host` 填 `host.docker.internal`（Mac/Windows）或宿主机实际 IP（Linux）。

**Q: 内网环境无法访问 DockerHub，如何构建镜像？**  
A: 在可访问外网的机器上 `docker compose build && docker save ... | docker load` 导入到内网机器，或搭建内部 Harbor 镜像仓库。

**Q: 时段过滤关闭后，用户界面如何显示？**  
A: 时段切换器隐藏，后端将所有请求降级为全天统计。

**Q: 如何新增管理员账号？**  
A: 在 `config.yaml` 的 `admins` 列表中添加条目（生成 bcrypt hash），然后 `docker compose restart backend`。

**Q: 前端容器用的什么做静态服务？**  
A: `Express + http-proxy-middleware v2`（替代 nginx），`/api/*` 在容器内代理到后端，无需在宿主机暴露后端端口给浏览器。

---

## PostgreSQL 表结构

系统启动时后端会自动执行 `CREATE TABLE IF NOT EXISTS`，**无需手动建表**。

自动创建的五张表：

| 表名 | 用途 |
|------|------|
| `users` | 用户信息 + 配额等级（首次 AD 登录时自动写入） |
| `quota_levels` | L1/L2/L3 配额配置（含默认值，启动时 INSERT OR UPDATE）|
| `email_alerts` | 配额预警邮件发送记录 v1（兼容保留） |
| `email_notifications` | 配额预警邮件发送记录 v2（按 user/quota_type/threshold/period_key 去重） |
| `email_templates` | 可管理的邮件模板（默认模板在启动时自动 seed，`ON CONFLICT DO NOTHING`） |

**验证表是否已创建：**

```bash
# 进入 postgres 容器
docker exec -it ai-code-usage-postgres-1 psql -U postgres -d ai_usage

# 查看所有表
\dt

# 查看表结构
\d users
\d quota_levels

# 退出
\q
```

**手动触发建表（如容器重建后数据库为空）：**

```bash
docker exec ai-code-usage-backend-1 python3 -c \
  "from app.services.database import init_db; init_db(); print('done')"
```

---

## PAT API（外部接口）

通过 Personal Access Token 可无需登录直接调用 API，适合 AI Agent、脚本、BI 工具集成。

### 获取 PAT

登录 Web UI → 右上角下拉菜单 → **API Token** → 新建 Token（有效期 3/6/12 个月）

> ⚠️ Token 创建后**仅显示一次**，请立即复制保存。

### 认证方式

所有 `/api/v1/` 接口均使用 Bearer Token：

```bash
curl -H "Authorization: Bearer pat_xxxxxxxx..." \
  http://your-server:8002/api/v1/usage/summary
```

### 接口清单

#### 个人接口（任意用户 PAT）

| 接口 | 说明 |
|------|------|
| `GET /api/v1/usage/summary?scope=month\|week\|today` | 用量汇总 |
| `GET /api/v1/usage/detail` | 使用明细（支持日期范围、模型过滤、排序）|
| `GET /api/v1/usage/quota` | 配额状态（已用/上限/百分比）|

#### 管理员接口（需管理员 PAT）

| 接口 | 说明 |
|------|------|
| `GET /api/v1/admin/leaderboard` | 用量排行榜（支持分页）|
| `GET /api/v1/admin/users` | 用户列表（支持分页）|
| `GET /api/v1/admin/department-summary` | 部门汇总 |

### 安全说明

- Token 明文不落库，只存 SHA-256 哈希
- 每用户最多 5 个活跃 Token
- 连续 5 次认证失败自动锁定 10 分钟
- 100 次/分钟 速率限制

### aicode-usage-query Skill

项目内置 `skills/aicode-usage-query/` Skill，让 AI Agent 直接通过自然语言查询用量数据。

**配置：**
```bash
export AICODE_PAT="pat_xxxxxxxx..."
export AICODE_BASE_URL="http://your-server:8002"
```

**使用：**
```bash
# 个人用量
python3 skills/aicode-usage-query/scripts/query.py summary --scope month
python3 skills/aicode-usage-query/scripts/query.py quota
python3 skills/aicode-usage-query/scripts/query.py detail --days 7 --sort-by total_token

# 管理员
python3 skills/aicode-usage-query/scripts/query.py leaderboard --top 10
```

或直接问 AI Agent：「查询我本月的 token 用量」、「我的配额还剩多少」

---

## 许可证

Apache 2.0
