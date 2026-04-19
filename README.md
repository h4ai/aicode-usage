# AI Code Usage Dashboard

> 企业 AI 编程助手用量可视化看板  
> 技术栈：Vue3 + Element Plus + ECharts + Python FastAPI + ClickHouse + PostgreSQL  
> 部署方式：Docker Compose（单机）

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
git clone https://github.com/h4ai/aicode-usage.git -b ralph/ai-code-usage-dashboard
cd aicode-usage
```

### 2. 配置 `backend/config.yaml`

```yaml
database:
  clickhouse:
    host: "your-clickhouse-host"     # ClickHouse 地址（容器内用 host.docker.internal）
    port: 8123
    database: "otel"                 # 数据库名，默认 otel
    username: "default"
    password: ""                     # 无密码留空

  postgres:
    host: "postgres"                 # Docker Compose 内部服务名，勿改
    port: 5432
    database: "ai_usage"
    username: "postgres"
    password: "postgres"

ldap:
  server: "ldap://your-ad-server:389"
  base_dn: "DC=company,DC=com"
  bind_dn: "CN=svc_account,OU=Service,DC=company,DC=com"
  bind_password: "your-ldap-service-account-password"

auth:
  jwt_secret: "change-this-to-a-random-64-char-string"  # ⚠️ 必须修改
  jwt_expire_hours: 8
  admins:
    - username: "admin"
      password_hash: "$2b$12$..."    # bcrypt hash，用下方命令生成

working_hours:
  enabled: false                     # true=开启时段过滤，false=关闭
  start: "09:00"                     # 工作时段开始（HH:MM，上海时区）
  end: "18:00"                       # 工作时段结束
  weekday_only: true                 # true=仅周一至周五

smtp:
  host: ""
  port: 587
  username: ""
  password: ""
  from_addr: ""
```

**生成管理员密码 hash（bcrypt）：**

```bash
docker run --rm python:3.11-slim python3 -c \
  "import bcrypt; print(bcrypt.hashpw(b'YOUR_ADMIN_PASSWORD', bcrypt.gensalt()).decode())"
```

将输出的 hash 字符串填入 `config.yaml` 的 `password_hash` 字段。

### 3. 启动服务

```bash
docker compose up -d
```

等待约 30 秒，所有容器健康后访问：

| 服务 | 地址 | 说明 |
|------|------|------|
| 前端看板 | http://localhost:3002 | 用户登录入口 |
| 后端 API | http://localhost:8002 | FastAPI，含 /docs 接口文档 |
| PostgreSQL | localhost:5434 | 配额/用户配置持久化 |

### 4. ClickHouse 数据源配置

系统读取 ClickHouse `otel.events` 表，需包含以下字段：

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

如使用 SubLang 等标准埋点，表结构已兼容，无需额外处理。

### 5. 创建 ClickHouse 视图（可选，提升查询性能）

```bash
# 进入 sql/ 目录，执行建视图 SQL
cat sql/views.sql | curl -s "http://your-clickhouse:8123/" --data-binary @-
```

### 6. 登录验证

- **管理员**：使用 `config.yaml` 中配置的 `username` + 对应明文密码
- **普通用户**：企业 AD 域账号（LDAP 需配置）
- **测试模式**（LDAP 未接入时）：
  - 接口：`POST /api/auth/test-login`，body `{"username": "<userId>", "password": "<test_password>"}`
  - 系统验证 ClickHouse 中存在该 userId 即允许登录，密码固定为 `config.yaml` 中 `test_login_password` 字段（默认值见配置）

---

## 项目结构

```
aicode-usage/
├── backend/                    # Python FastAPI 后端
│   ├── app/
│   │   ├── main.py             # 应用入口
│   │   ├── routers/
│   │   │   ├── auth.py         # 登录 / JWT / test-login
│   │   │   ├── metrics.py      # 个人指标接口
│   │   │   ├── quota.py        # 配额查询
│   │   │   └── admin.py        # 管理后台接口
│   │   └── services/
│   │       ├── clickhouse.py   # ClickHouse 查询层（含时段过滤）
│   │       ├── database.py     # PostgreSQL ORM（配额/用户配置）
│   │       └── email.py        # 邮件通知（APScheduler）
│   ├── tests/                  # pytest 单元测试（TDD）
│   ├── config.yaml             # ⚠️ 部署前必须修改
│   └── requirements.txt
├── frontend/                   # Vue3 + TypeScript 前端
│   ├── src/
│   │   ├── views/
│   │   │   ├── LoginView.vue
│   │   │   ├── DashboardView.vue   # 个人看板
│   │   │   └── AdminView.vue       # 管理后台（含6个子页签）
│   │   ├── views/admin/            # 管理后台子页面
│   │   │   ├── GlobalTrend.vue
│   │   │   ├── DepartmentSummary.vue
│   │   │   ├── Leaderboard.vue
│   │   │   └── WorkingHours.vue
│   │   ├── components/
│   │   │   ├── MetricCards.vue     # 今日/本周/本月指标卡片
│   │   │   ├── QuotaProgressBar.vue
│   │   │   ├── TrendChart.vue
│   │   │   ├── ModelDistribution.vue
│   │   │   ├── DetailTable.vue     # 使用明细（含CSV导出）
│   │   │   ├── UserManager.vue
│   │   │   ├── QuotaLevelManager.vue
│   │   │   └── NavBar.vue
│   │   └── stores/
│   │       ├── auth.ts             # JWT + 用户信息
│   │       └── timeFilter.ts       # 时段过滤全局状态
│   └── nginx.conf
├── docs/
│   ├── requirements.md             # 需求文档
│   ├── requirements-changelog.md   # 需求变更日志
│   └── requirements-mapping.md     # 需求追踪矩阵
├── sql/                            # ClickHouse 建表/视图 SQL
└── docker-compose.yml
```

---

## 配额级别说明

系统内置三个配额等级，管理员可在「配额级别」页签调整：

| 级别 | 月度 Token 上限 | 每日对话轮次上限 | 适用场景 |
|------|----------------|----------------|---------|
| L1 | 2,500 万 | 100 轮/天 | 普通使用者 |
| L2 | 5,000 万 | 200 轮/天 | 中度用户 |
| L3 | 1 亿 | 500 轮/天 | 重度用户 / 核心开发者 |

---

## 时段过滤说明

管理员在「工作时段」页签启用后，全系统支持三种统计口径：

| 口径 | 说明 |
|------|------|
| 全天 | 不做时间限制，统计所有数据 |
| 工作时段 | 仅统计配置的起止时间内（默认 09:00-18:00，周一至周五）|
| 非工作时段 | 全天数据减去工作时段，含节假日/周末 |

> 工作时段 + 非工作时段 = 全天，数据不重叠、不遗漏。

---

## 开发环境

```bash
# 后端（Python 3.11+）
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8002

# 前端（Node 18+）
cd frontend
npm install
npm run dev        # Vite dev server，自动代理到 backend:8002

# 运行后端单元测试
cd backend
pytest tests/ -v
```

---

## 常见问题

**Q: LDAP 未配置，如何测试登录？**  
A: 使用 `POST /api/auth/test-login`，系统只验证 ClickHouse 中存在该 userId，无需 AD 认证。

**Q: ClickHouse 在宿主机而非 Docker 内，如何连接？**  
A: `config.yaml` 中 `host` 填 `host.docker.internal`（Mac/Windows）或宿主机 IP（Linux）。

**Q: 时段过滤关闭后，用户界面如何显示？**  
A: 切换器隐藏，显示「全天」标签，后端同步将所有请求降级为全天统计。

**Q: 如何新增管理员账号？**  
A: 在 `config.yaml` 的 `auth.admins` 列表中添加，生成 bcrypt hash 后重启后端容器。

---

## 许可证

Apache 2.0
