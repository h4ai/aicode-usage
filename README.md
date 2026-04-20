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
  - 用量排行榜（Top N 用户排名）
  - 工作时段设置（管理员配置起止时间和工作日范围）
  - 配额级别管理（L1/L2/L3 月度 Token + 日对话轮次上限）

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
  port: 19000                           # Native 协议端口（HTTP 用 8123）
  database: "otel"
  user: "default"
  password: ""

database:
  url: "postgresql://postgres:postgres@postgres:5432/ai_usage"

smtp:
  host: "mailrelay.company.com"         # 内网邮件中继，留空则禁用邮件通知
  port: 25
  username: ""                          # 无需认证的 relay 留空
  password: ""
  from_name: "AI Code Usage"
  from_email: "ai-usage@company.com"

working_hours:
  enabled: false                        # true=开启时段过滤
  start: "09:00"
  end: "18:00"
  weekday_only: true
```

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
│   │       ├── clickhouse.py   # ClickHouse 查询层
│   │       ├── database.py     # PostgreSQL（配额/用户配置）
│   │       ├── ldap_service.py # AD 认证（ldap3 纯 Python）
│   │       └── notification.py # 邮件通知（aiosmtplib + APScheduler）
│   ├── tests/                  # pytest 单元测试（264 cases）
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

## 许可证

Apache 2.0
