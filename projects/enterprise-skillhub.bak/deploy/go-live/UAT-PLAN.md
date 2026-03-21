# UAT 测试计划 — Enterprise SkillHub

> 版本: 1.0
> 环境: Staging / Pre-Production
> 测试周期: 3 个工作日

---

## 1. 测试范围

### 1.1 核心功能

| 编号 | 模块 | 测试场景 | 优先级 |
|------|------|----------|--------|
| UAT-01 | 认证 | LDAP 登录（Admin/Reviewer/User） | P0 |
| UAT-02 | 认证 | 登录失败场景（错误密码/不存在用户/账户锁定） | P0 |
| UAT-03 | 认证 | JWT Token 过期自动失效 | P1 |
| UAT-04 | Skill 管理 | 创建 Skill（填写元信息） | P0 |
| UAT-05 | Skill 管理 | 上传 Skill 版本（ZIP 包） | P0 |
| UAT-06 | Skill 管理 | 更新 Skill 元信息 | P1 |
| UAT-07 | Skill 管理 | 删除 Skill | P1 |
| UAT-08 | 审核 | 提交审核 → 自动扫描 → 分配审核人 | P0 |
| UAT-09 | 审核 | 审核通过 → 发布 | P0 |
| UAT-10 | 审核 | 审核拒绝 → 修改 → 重新提交 | P0 |
| UAT-11 | 审核 | 扫描发现安全问题 → 自动标记 | P1 |
| UAT-12 | 搜索 | 关键词搜索 | P0 |
| UAT-13 | 搜索 | 语义搜索 | P0 |
| UAT-14 | 搜索 | 分类/标签筛选 | P1 |
| UAT-15 | 权限 | PUBLIC Skill 所有人可见 | P0 |
| UAT-16 | 权限 | DEPARTMENT Skill 仅同部门可见 | P0 |
| UAT-17 | 权限 | PRIVATE Skill 仅作者可见 | P0 |
| UAT-18 | CLI | `skillhub login` | P0 |
| UAT-19 | CLI | `skillhub search` | P0 |
| UAT-20 | CLI | `skillhub install` | P0 |
| UAT-21 | CLI | `skillhub publish` | P0 |
| UAT-22 | CLI | `skillhub whoami` | P1 |
| UAT-23 | 管理 | Admin 查看审计日志 | P1 |
| UAT-24 | 管理 | Admin 管理用户角色 | P1 |
| UAT-25 | 管理 | Admin 配置审核策略 | P1 |
| UAT-26 | 同步 | 上游 Skill 同步 | P1 |
| UAT-27 | 统计 | 下载量/安装量统计 | P2 |

### 1.2 非功能需求

| 编号 | 类别 | 测试场景 | 验收标准 |
|------|------|----------|----------|
| NFR-01 | 性能 | API 响应时间 | p99 < 500ms |
| NFR-02 | 性能 | 搜索响应时间 | p99 < 1s |
| NFR-03 | 性能 | 并发用户 | 100 并发用户正常使用 |
| NFR-04 | 安全 | 未授权访问 | 返回 401 |
| NFR-05 | 安全 | Rate Limiting | 超限返回 429 |
| NFR-06 | 可靠性 | Pod 重启 | 服务自动恢复，无数据丢失 |
| NFR-07 | 备份 | 数据恢复 | 备份文件可成功恢复 |

---

## 2. 测试环境

| 组件 | 配置 |
|------|------|
| K8s 集群 | Staging namespace |
| PostgreSQL | 与生产同版本 (PG16 + pgvector) |
| Redis | Redis 7 |
| MinIO | 独立实例 |
| BGE-M3 | 共享 staging 实例 |
| LDAP | Staging AD 域控 |

---

## 3. 测试角色

| 角色 | 人数 | 职责 |
|------|------|------|
| Admin 测试员 | 1 | 测试管理功能、审计日志、用户管理 |
| Reviewer 测试员 | 2 | 测试审核全流程 |
| User 测试员 | 3 | 测试 Skill 上传/搜索/安装 |
| CLI 测试员 | 1 | 测试所有 CLI 命令 |

---

## 4. 测试时间表

| 日期 | 内容 | 负责 |
|------|------|------|
| Day 1 | 环境验证 + 核心功能 (P0) | 全体 |
| Day 2 | 完整流程 + 权限 + CLI + P1 场景 | 全体 |
| Day 3 | 性能测试 + 安全验证 + 回归 + Bug 修复验证 | 全体 |

---

## 5. Bug 分级

| 级别 | 定义 | SLA |
|------|------|-----|
| Blocker | 核心功能不可用，无法上线 | 立即修复 |
| Critical | 主要功能有严重缺陷 | 上线前修复 |
| Major | 功能有明显缺陷但有绕过方案 | 上线后 1 周内修复 |
| Minor | 体验问题、文案等 | 下个版本修复 |

---

## 6. 准入/准出标准

### 准入标准
- [ ] Staging 环境部署完成
- [ ] 所有 P0 功能在开发环境验证通过
- [ ] 测试数据（种子数据）已导入
- [ ] 测试账号已创建

### 准出标准
- [ ] 所有 P0 测试用例通过
- [ ] 90% 以上 P1 测试用例通过
- [ ] 无 Blocker/Critical 级别 Bug
- [ ] 性能基线达标
- [ ] 安全验证通过
