# Go-Live Checklist — Enterprise SkillHub

> Target Date: TBD
> Environment: Production (`skillhub` namespace)
> URL: https://skillhub.internal.company.com

---

## 环境准备

- [ ] K8s namespace `skillhub` 创建
- [ ] Sealed Secrets 加密并部署（LDAP_BIND_PASSWORD, JWT_SECRET, PG_PASSWORD, MINIO_SECRET_KEY）
- [ ] TLS 证书签发（cert-manager + Let's Encrypt / 企业内部 CA）
- [ ] AD 域控连通性测试（telnet ad.internal.company.com 636）
- [ ] DNS 配置（skillhub.internal.company.com → Ingress LB IP）
- [ ] Container registry 镜像推送成功
- [ ] NetworkPolicy 生效验证

## 数据准备

- [ ] PostgreSQL Migration 执行（`npx prisma migrate deploy`）
- [ ] pgvector 扩展安装验证（`SELECT * FROM pg_extension WHERE extname='vector'`）
- [ ] 种子数据导入（默认 Admin 用户 + ReviewPolicy + 默认分类）
- [ ] MinIO Bucket 创建（`skillhub-packages`, `skillhub-backups`）
- [ ] BGE-M3 模型加载验证（`curl http://skillhub-bge-m3:8080/health`）
- [ ] Redis 连接测试

## 功能验证

- [ ] LDAP 登录测试 — Admin 角色（AD 组: SkillHub-Admins）
- [ ] LDAP 登录测试 — Reviewer 角色（AD 组: SkillHub-Reviewers）
- [ ] LDAP 登录测试 — User 角色（普通用户）
- [ ] Skill 发布全流程：上传 → 自动扫描 → 审核分配 → 审核通过 → 发布
- [ ] Skill 发布全流程：上传 → 扫描 → 审核拒绝 → 修改重提
- [ ] 搜索功能 — 关键词搜索
- [ ] 搜索功能 — 语义搜索（BGE-M3）
- [ ] 权限隔离 — PUBLIC Skill 所有人可见
- [ ] 权限隔离 — DEPARTMENT Skill 仅同部门可见
- [ ] 权限隔离 — PRIVATE Skill 仅作者可见
- [ ] CLI 登录（`skillhub login`）
- [ ] CLI 搜索（`skillhub search <keyword>`）
- [ ] CLI 安装（`skillhub install <skill-name>`）
- [ ] CLI 发布（`skillhub publish`）
- [ ] 上游同步首次执行（手动触发 + 验证数据同步）
- [ ] 审计日志查询（Admin 面板）
- [ ] 统计仪表盘数据正确

## 性能基线

- [ ] API p99 < 500ms（使用 k6/wrk 基准测试）
- [ ] 搜索 p99 < 1s（关键词 + 语义搜索）
- [ ] 并发 100 用户压测通过（k6 script）
- [ ] 文件上传 50MB 以内 < 10s

## 监控就绪

- [ ] Prometheus 采集正常（targets 全部 UP）
- [ ] Grafana Overview Dashboard 数据正确
- [ ] Grafana API Dashboard 数据正确
- [ ] 告警通知测试 — 飞书 Webhook 收到测试告警
- [ ] 告警通知测试 — 告警恢复通知正常

## 回滚方案

- [ ] 回滚脚本测试通过（`deploy/scripts/rollback.sh`）
- [ ] DB 备份已验证可恢复
- [ ] 手动备份脚本测试通过（`deploy/scripts/backup.sh`）
- [ ] CronJob 自动备份验证（检查 MinIO skillhub-backups/postgres/）

## 安全验证

- [ ] Helmet 头部检查（`curl -I https://skillhub.internal.company.com`）
- [ ] NetworkPolicy 验证（Pod 间隔离正确）
- [ ] Rate Limiting 验证（超限返回 429）
- [ ] 非授权访问返回 401

## 文档就绪

- [ ] RUNBOOK.md 运维手册已 review
- [ ] 运维团队培训完成
- [ ] 应急联系人名单确认

---

## Sign-Off

| 角色 | 姓名 | 签字 | 日期 |
|------|------|------|------|
| 开发负责人 | | | |
| 测试负责人 | | | |
| 运维负责人 | | | |
| 安全负责人 | | | |
| 产品负责人 | | | |
