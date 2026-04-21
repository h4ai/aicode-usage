# OpenShift 部署指南

本目录提供两种 OpenShift 部署方案，按需选择。

---

## 前提条件

1. 已安装并登录 `oc` CLI：`oc login <cluster-url> --token=<token>`
2. 已切换到目标 namespace：`oc project <your-namespace>`
3. 已将镜像推送到内网镜像仓库：
   ```bash
   # 构建并推送后端
   docker build -t <REGISTRY>/ai-code-usage-backend:latest ./backend
   docker push <REGISTRY>/ai-code-usage-backend:latest

   # 构建并推送前端
   docker build -t <REGISTRY>/ai-code-usage-frontend:latest ./frontend
   docker push <REGISTRY>/ai-code-usage-frontend:latest
   ```

---

## 方案 A：Helm Chart（推荐）

### 安装 Helm

```bash
# 下载 helm（无网络时从内网镜像站获取）
curl -fsSL https://get.helm.sh/helm-v3.14.0-linux-amd64.tar.gz | tar xz
mv linux-amd64/helm /usr/local/bin/
```

### 修改配置

编辑 `helm/ai-code-usage/values.yaml`，替换所有 `<PLACEHOLDER>` 字段：

| 字段 | 说明 |
|------|------|
| `backend.image.repository` | 后端镜像地址 |
| `frontend.image.repository` | 前端镜像地址 |
| `clickhouse.host` | ClickHouse 服务 IP 或域名 |
| `ldap.server` | LDAP 服务地址，如 `ldap://ad.corp.com:389` |
| `ldap.domain` | AD 域名，如 `corp.example.com` |
| `ldap.base_dn` | AD 搜索根，如 `DC=corp,DC=example,DC=com` |
| `ldap.bind_dn` | 服务账号 DN |
| `ldap.bind_password` | 服务账号密码 |
| `postgres.password` | PostgreSQL 密码（生产环境请修改） |
| `auth.secret_key` | JWT 签名密钥（生产环境请修改为随机长字符串） |

### 部署

```bash
# 首次安装
helm install ai-code-usage ./helm/ai-code-usage -n <your-namespace>

# 查看部署状态
oc get pods -n <your-namespace>
oc get route ai-code-usage-frontend -n <your-namespace>

# 更新配置
helm upgrade ai-code-usage ./helm/ai-code-usage -n <your-namespace>

# 卸载
helm uninstall ai-code-usage -n <your-namespace>
```

### 获取访问地址

```bash
oc get route ai-code-usage-frontend -o jsonpath='{.spec.host}' -n <your-namespace>
# 输出示例：ai-code-usage-frontend-myproject.apps.cluster.example.com
```

---

## 方案 B：单文件 YAML（简单快速）

### 修改配置

编辑 `openshift-deploy.yaml`，替换所有 `<PLACEHOLDER>` 字段（同上）。

### 部署

```bash
# 一键部署
oc apply -f openshift-deploy.yaml -n <your-namespace>

# 查看状态
oc get all -l app=ai-code-usage -n <your-namespace>

# 获取访问地址
oc get route ai-code-usage-frontend -n <your-namespace>

# 删除所有资源
oc delete -f openshift-deploy.yaml -n <your-namespace>
```

---

## 部署后验证

```bash
# 检查 Pod 状态（三个 Pod 均应为 Running）
oc get pods -l app=ai-code-usage

# 检查后端健康
ROUTE=$(oc get route ai-code-usage-frontend -o jsonpath='{.spec.host}')
curl https://$ROUTE/api/health

# 查看后端日志
oc logs -l component=backend --tail=50

# 查看前端日志
oc logs -l component=frontend --tail=20
```

### 安全配置验证

```bash
# 验证 CORS 不是通配符
oc exec deployment/ai-code-usage-backend -- python3 -c \
  "from app.config import get_config; print(get_config().get('security', {}))"

# 验证 test-login 已关闭
curl -X POST https://$ROUTE/api/auth/test-login \
  -H "Content-Type: application/json" \
  -d '{"username":"test","password":"test"}'
  # 应返回 404（endpoint 已禁用）或 403
```

---

### Pod 启动失败：permission denied on /var/lib/postgresql/data

OpenShift 使用随机非 root UID，需要为 PostgreSQL 设置正确的 fsGroup。
`openshift-deploy.yaml` 中已配置 `securityContext.fsGroup: 999`，如仍失败，执行：

```bash
oc adm policy add-scc-to-user anyuid -z default -n <your-namespace>
```

### 镜像拉取失败（ImagePullBackOff）

确认镜像仓库已配置认证：

```bash
oc create secret docker-registry regcred \
  --docker-server=<REGISTRY> \
  --docker-username=<USER> \
  --docker-password=<PASS> \
  -n <your-namespace>

# 然后在 Deployment 中添加 imagePullSecrets（或通过 values.yaml 配置）
```

### ClickHouse 连接失败

ClickHouse 是外部服务，确认：
1. OpenShift 节点的网络策略（NetworkPolicy）允许出站到 ClickHouse 地址
2. `config.yaml` 中 `clickhouse.host` 填写的是集群内可解析的地址（IP 或 FQDN）

---

## 目录结构

```
deploy/openshift/
├── README.md                          # 本文件
├── openshift-deploy.yaml              # 方案 B：单文件部署
└── helm/
    └── ai-code-usage/
        ├── Chart.yaml
        ├── values.yaml                # ← 主要修改此文件
        └── templates/
            ├── _helpers.tpl
            ├── secret.yaml
            ├── configmap.yaml
            ├── postgres.yaml
            ├── backend.yaml
            └── frontend.yaml
```
