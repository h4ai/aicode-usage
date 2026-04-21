# CORS 跨域配置说明

## 背景

本项目使用 [FastAPI CORSMiddleware](https://fastapi.tiangolo.com/tutorial/cors/) 管控跨域请求。
CORS 来源白名单通过 `backend/config.yaml` 的 `security.cors_origins` 字段配置，**不需要修改代码**。

---

## 配置方式

编辑 `backend/config.yaml`，在 `security` 段设置允许的前端来源：

```yaml
security:
  cors_origins:
    - "http://localhost:3002"          # 本地开发
    - "https://ai-usage.example.com"  # 生产域名
```

> ⚠️ **严禁使用 `["*"]`**（通配符）作为生产配置。通配符会允许任意来源的跨域请求，存在 CSRF 安全风险。

---

## 各环境参考值

| 环境 | 典型配置 |
|------|----------|
| 本地开发 | `http://localhost:3002` |
| 内网 IP 部署 | `http://192.168.1.100:3002` |
| 域名 + HTTPS | `https://ai-usage.your-company.com` |
| 域名 + HTTP | `http://ai-usage.your-company.com` |

> 注意：`http://` 和 `https://` 是不同 origin，按实际访问协议填写。

---

## 生效机制

`config.yaml` 在后端启动时读取（`app/config.py` 中 `get_config()` 函数）。  
修改配置后需要**重启后端容器**：

```bash
docker compose restart backend
```

---

## 相关代码位置

- 读取逻辑：`backend/app/main.py` 第 33–38 行
- 配置加载：`backend/app/config.py`
- 测试用例：`backend/tests/test_p0_security.py`

---

## OpenShift Helm 部署

在 `deploy/openshift/helm/ai-code-usage/values.yaml` 中配置：

```yaml
security:
  corsOrigins:
    - "https://your-route-host.apps.cluster.example.com"
```

Helm template 会自动将此列表写入后端 ConfigMap，挂载到 `config.yaml`。
