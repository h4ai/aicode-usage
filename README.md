# AI Code Usage Dashboard

> 企业 AI 编程助手用量可视化看板  
> 技术栈：Vue3 + Element Plus + ECharts + Python FastAPI + ClickHouse + PostgreSQL  
> 部署方式：Docker Compose（单机）

---

## 功能概览

- **个人看板**：每位用户通过 AD 域账号登录，查看自己的 Token 消耗、对话轮次、活跃天数、趋势图
- **配额管理**：月度 Token 上限 + 每日对话轮次上限，超限红色预警
- **管理后台**：用户列表（含状态指示灯）、配额级别编辑、全局趋势图、部门汇总、用量排行榜
- **CSV 导出**：管理员可导出用户用量明细

---

## 快速部署

### 前置条件

| 依赖 | 版本要求 |
|------|---------|
| Docker + Docker Compose | 20.x + |
| ClickHouse | 已有实例，HTTP 端口 8123 |
| 企业 AD（LDAP） | 可选，测试环境可用 test-login 绕过 |

### 1. 克隆仓库

```bash
git clone https://github.com/h4ai/aicode-usage.git
cd aicode-usage
```

### 2. 配置

编辑 `backend/config.yaml`：

```yaml
database:
  clickhouse:
    host: "your-clickhouse-host"   # ClickHouse 地址
    port: 8123
    database: "otel"
    username: "default"
    password: ""                   # 无密码留空

  postgres:
    host: "postgres"
    port: 5432
    database: "ai_usage"
    username: "postgres"
    password: "postgres"

ldap:
  server: "ldap://your-ad-server:389"   # 企业 AD 地址
  base_dn: "DC=company,DC=com"
  bind_dn: "CN=svc_account,OU=Service,DC=company,DC=com"
  bind_password: "your-service-account-password"

auth:
  jwt_secret: "change-this-to-a-random-string"
  jwt_expire_hours: 8
  admins:
    - username: "admin"
      password_hash: "$2b$12$..."   # bcrypt hash，用下方命令生成

smtp:
  host: ""
  port: 587
  username: ""
  password: ""
  from_addr: ""
```

**生成管理员密码 hash：**

```bash
docker run --rm python:3.11-slim python3 -c \
  "import bcrypt; print(bcrypt.hashpw(b'your-password', bcrypt.gensalt()).decode())"
```

### 3. 启动

```bash
docker compose up -d
```

| 服务 | 地址 |
|------|------|
| 前端 | http://localhost:3002 |
| 后端 API | http://localhost:8002 |
| PostgreSQL | localhost:5434 |

### 4. 初始化数据

首次启动后端会自动创建 PostgreSQL 表并写入默认配额等级：

| 级别 | 月度 Token 上限 | 每日对话轮次上限 |
|------|----------------|----------------|
| L1 | 2,500 万 | 100 轮 |
| L2 | 5,000 万 | 200 轮 |
| L3 | 1 亿 | 500 轮 |

### 5. 登录

- **管理员**：使用 `config.yaml` 中配置的账号
- **普通用户**：企业 AD 域账号（或测试环境用 `/api/auth/test-login`）
- **测试账号**（需 ClickHouse 中有对应 userId 的数据）：任意 userId，密码 `test123`

---

## ClickHouse 数据表要求

系统读取 `otel.events` 表，关键字段：

| 字段 | 类型 | 说明 |
|------|------|------|
| `userId` | String | 用户域账号（如 `zhangsan`） |
| `username` | String | 域账号 |
| `userNickname` | String | 显示名 |
| `enterprise` | String | 部门名称 |
| `eventCode` | String | 事件类型（`chat_request_response` / `code_completion_response` 等） |
| `requestModelName` | String | 模型名称 |
| `inputToken` | Int64 | 输入 Token 数 |
| `outputToken` | Int64 | 输出 Token 数 |
| `totalToken` | Int64 | 总 Token 数 |
| `timestamp` | Int64 | 毫秒时间戳 |
| `event_date` | Date | MATERIALIZED 列（由 timestamp 推导） |

---

## 项目结构

```
aicode-usage/
├── backend/                  # Python FastAPI 后端
│   ├── app/
│   │   ├── routers/          # API 路由（auth/metrics/quota/admin）
│   │   └── services/         # 数据层（clickhouse/database/email）
│   ├── config.yaml           # 配置文件
│   └── requirements.txt
├── frontend/                 # Vue3 前端
│   ├── src/
│   │   ├── views/            # 页面（LoginView/DashboardView/AdminView）
│   │   └── components/       # 组件（MetricCards/QuotaProgressBar/...）
│   └── nginx.conf
├── docs/                     # 需求文档 & 截图
├── specs/                    # User Stories & 规格说明
├── sql/                      # ClickHouse 建表/视图 SQL
├── qa/                       # E2E 测试（Playwright）
└── docker-compose.yml
```

---

## 环境变量（可选，覆盖 config.yaml）

在 `backend/.env` 中可覆盖 config.yaml 的值（优先级更高）：

```env
CLICKHOUSE_HOST=localhost
CLICKHOUSE_PORT=8123
JWT_SECRET=your-secret
```

---

## 开发说明

```bash
# 后端开发
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8002

# 前端开发
cd frontend
npm install
npm run dev   # vite dev server, 代理到 8002
```

---

## 许可证

Apache 2.0
