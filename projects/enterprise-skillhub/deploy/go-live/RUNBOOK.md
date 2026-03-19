# 运维手册 (Runbook) — Enterprise SkillHub

> 版本: 1.0
> 最后更新: 2026-03-19

---

## 目录

1. [日常运维操作](#1-日常运维操作)
2. [故障排查流程](#2-故障排查流程)
3. [应急联系人](#3-应急联系人)

---

## 1. 日常运维操作

### 1.1 查看服务状态

```bash
# 查看所有 Pod
kubectl get pods -n skillhub -o wide

# 查看 Pod 日志
kubectl logs -n skillhub -l app=skillhub-backend --tail=100 -f

# 查看特定 Pod 日志
kubectl logs -n skillhub <pod-name> --tail=200

# 查看事件
kubectl get events -n skillhub --sort-by='.lastTimestamp'
```

### 1.2 扩缩容

```bash
# 手动扩容
kubectl scale deployment/skillhub-backend -n skillhub --replicas=5

# 查看 HPA 状态
kubectl get hpa -n skillhub

# 恢复自动伸缩（HPA 会接管）
kubectl scale deployment/skillhub-backend -n skillhub --replicas=3
```

### 1.3 数据库操作

```bash
# 进入 PostgreSQL
kubectl exec -it -n skillhub \
  $(kubectl get pod -n skillhub -l app=skillhub-postgres -o jsonpath='{.items[0].metadata.name}') \
  -- psql -U skillhub -d skillhub

# 执行 Migration
kubectl exec -n skillhub deployment/skillhub-backend -- npx prisma migrate deploy

# 手动备份
bash deploy/scripts/backup.sh

# 从备份恢复
# 1. 下载备份文件
mc cp backup/skillhub-backups/postgres/<backup-file>.sql.gz /tmp/
# 2. 解压并恢复
gunzip -c /tmp/<backup-file>.sql.gz | kubectl exec -i -n skillhub \
  $(kubectl get pod -n skillhub -l app=skillhub-postgres -o jsonpath='{.items[0].metadata.name}') \
  -- psql -U skillhub -d skillhub
```

### 1.4 部署与回滚

```bash
# 部署新版本
bash deploy/scripts/deploy.sh v1.2.0

# 查看部署历史
kubectl rollout history deployment/skillhub-backend -n skillhub

# 回滚到上一版本
bash deploy/scripts/rollback.sh

# 回滚到指定版本
bash deploy/scripts/rollback.sh 3
```

### 1.5 查看监控

- **Grafana**: http://grafana.internal.company.com
  - Dashboard: SkillHub — Overview
  - Dashboard: SkillHub — API Performance
- **Prometheus**: http://prometheus.internal.company.com
- **Alertmanager**: http://alertmanager.internal.company.com

### 1.6 清理操作

```bash
# 清理已完成的 backup Job
kubectl delete jobs -n skillhub \
  -l component=backup --field-selector=status.successful=1

# 清理旧的 ReplicaSet
kubectl get rs -n skillhub --no-headers | awk '{if ($2==0) print $1}' | \
  xargs -r kubectl delete rs -n skillhub
```

---

## 2. 故障排查流程

### 2.1 API 不可用

**症状**: 用户报告无法访问 SkillHub

```
排查步骤:
1. 检查 Ingress
   kubectl get ingress -n skillhub
   kubectl describe ingress skillhub-ingress -n skillhub

2. 检查 Backend Pod 状态
   kubectl get pods -n skillhub -l app=skillhub-backend
   
3. 检查 Pod 日志
   kubectl logs -n skillhub -l app=skillhub-backend --tail=50
   
4. 检查 Health 端点
   kubectl port-forward -n skillhub svc/skillhub-backend 13000:3000
   curl http://localhost:13000/api/v1/health/ready
   
5. 检查 Service
   kubectl get svc -n skillhub
   kubectl get endpoints -n skillhub skillhub-backend
```

**常见原因及解决**:
| 原因 | 解决方案 |
|------|----------|
| Pod CrashLoopBackOff | 查看日志 → 修复配置/代码 → 重新部署 |
| OOMKilled | 增加内存 limit → 检查内存泄漏 |
| Ingress 配置错误 | 检查 TLS 证书 → 检查 Service selector |
| DNS 未生效 | 检查 DNS 记录 → 等待传播 |

### 2.2 LDAP 连接失败

**症状**: 用户无法登录，报 "Authentication failed"

```
排查步骤:
1. 检查 AD 域控连通性
   kubectl exec -n skillhub deployment/skillhub-backend -- \
     nc -zv ad.internal.company.com 636

2. 检查 LDAP 配置
   kubectl get configmap skillhub-backend-config -n skillhub -o yaml | \
     grep -A5 LDAP

3. 检查 Secret 是否正确
   kubectl get secret skillhub-secrets -n skillhub

4. 查看后端登录日志
   kubectl logs -n skillhub -l app=skillhub-backend --tail=50 | grep -i ldap
```

**常见原因及解决**:
| 原因 | 解决方案 |
|------|----------|
| 域控不可达 | 检查 NetworkPolicy → 检查防火墙 → 联系 AD 管理员 |
| Bind 密码过期 | 更新 Secret → 重启 Pod |
| 证书过期（LDAPS） | 更新域控证书 → 检查 TLS 配置 |
| Search Base 错误 | 验证 OU 路径 → 更新 ConfigMap |

### 2.3 搜索降级

**症状**: 搜索只返回关键词结果，语义搜索失效

```
排查步骤:
1. 检查 BGE-M3 服务状态
   kubectl get pods -n skillhub -l app=skillhub-bge-m3
   
2. 检查 BGE-M3 健康
   kubectl port-forward -n skillhub svc/skillhub-bge-m3 18080:8080
   curl http://localhost:18080/health

3. 检查 GPU 节点（如果使用 GPU）
   kubectl get nodes -l gpu=true
   
4. 检查 pgvector 扩展
   kubectl exec -it -n skillhub <pg-pod> -- \
     psql -U skillhub -c "SELECT * FROM pg_extension WHERE extname='vector'"
```

**常见原因及解决**:
| 原因 | 解决方案 |
|------|----------|
| BGE-M3 Pod 崩溃 | 检查日志 → 检查内存 → 重启 Pod |
| GPU 节点不可用 | 切换到 CPU 模式 → 增加超时时间 |
| pgvector 连接超时 | 检查 DB 负载 → 增加连接池 |
| 模型加载失败 | 检查模型缓存 → 重新拉取模型 |

### 2.4 磁盘空间不足

**症状**: 告警 "Disk usage > 85%"

```
排查步骤:
1. 查看 PVC 使用情况
   kubectl get pvc -n skillhub
   kubectl exec -n skillhub <pg-pod> -- df -h /var/lib/postgresql/data

2. 检查 MinIO 存储
   kubectl exec -n skillhub <minio-pod> -- df -h /data

3. 清理旧数据
   - 清理旧备份: mc rm --older-than 30d backup/skillhub-backups/postgres/
   - 清理已删除 skill 的文件: 管理面板 → 存储清理
```

### 2.5 Pod 频繁重启

**症状**: 告警 "Pod restart > 3 times/5min"

```
排查步骤:
1. 查看重启原因
   kubectl describe pod <pod-name> -n skillhub | grep -A10 "Last State"

2. 查看之前的日志
   kubectl logs <pod-name> -n skillhub --previous

3. 检查资源使用
   kubectl top pod -n skillhub
```

---

## 3. 应急联系人

| 角色 | 姓名 | 电话 | 飞书/企微 |
|------|------|------|-----------|
| 后端开发 | TBD | TBD | TBD |
| DBA | TBD | TBD | TBD |
| 运维 | TBD | TBD | TBD |
| 安全 | TBD | TBD | TBD |
| 产品经理 | TBD | TBD | TBD |

### 升级路径

```
L1: 运维值班 → 15分钟内响应
    ↓ 无法解决
L2: 后端开发 → 30分钟内响应
    ↓ 涉及安全/数据
L3: 安全/DBA → 即时响应
```

### 通知渠道

- 飞书群: 「SkillHub 运维告警」
- 邮件组: skillhub-ops@company.com
