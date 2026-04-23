# PAT (Personal Access Token) API 需求文档 v1.0

> 状态：📋 待评审 | 作者：PM | 日期：2026-04-22
> 审批人：沈老板

---

## 一、背景与目标

企业内部 AI 编程助手使用数据看板已具备 Web UI，但用户和管理员希望通过 **API 接口** 集成到自己的工作流中（如 OpenClaw Skill、CI/CD 脚本、定时报表等）。

本需求新增 **PAT（Personal Access Token）** 认证机制，提供稳定的外部 API 接口，让用户和管理员可通过 Token 方式查询使用数据。

**行业要求**：本系统部署于金融行业环境，所有安全设计必须符合金融级安全标准。

---

## 二、用户角色与权限

| 角色 | PAT 权限范围 | 说明 |
|------|-------------|------|
| **普通用户** | 查询自己的使用数据 | 个人汇总、明细、配额状态 |
| **管理员** | 查询自己 + 全局管理数据 | 个人数据 + 排行榜、用户列表、部门汇总 |

**权限边界**：
- PAT 仅用于**只读查询**，不提供任何写入/管理操作
- 普通用户 PAT 只能访问自己的数据，无法越权查看他人
- 管理员 PAT 可访问全局统计数据

---

## 三、PAT 生命周期管理

### 3.1 创建

| 属性 | 规则 |
|------|------|
| 创建者 | 普通用户和管理员均可创建自己的 PAT |
| 有效期 | 可选 3 个月 / 6 个月 / 12 个月 |
| 数量上限 | 每用户最多 **5 个** 活跃 PAT |
| 命名 | 用户自定义名称（如"我的报表脚本"），方便识别 |
| 显示规则 | **创建时仅显示一次完整 Token**，之后只显示前 8 位 + 掩码 |

### 3.2 查看

- 用户可在管理页面查看自己所有 PAT 的列表
- 列表显示：名称、创建时间、到期时间、最后使用时间、状态
- **各管各的**：用户只能看到自己的 PAT，管理员也只能管自己的 PAT

### 3.3 撤销

- 支持单个撤销（Revoke）
- 撤销后立即失效，已撤销的 PAT 保留记录但标记为"已撤销"
- 不支持恢复已撤销的 PAT

### 3.4 过期

- 到期自动失效，不自动续期
- 到期前 7 天在管理页面显示"即将过期"提醒

---

## 四、API 接口设计

### 4.1 路径规范

- 统一前缀：`/api/v1/`
- 与现有前端接口（`/api/`）物理隔离
- v1 接口承诺向后兼容，不随内部迭代变化

### 4.2 认证方式

```
Authorization: Bearer pat_xxxxxxxxxxxxxxxx
```

### 4.3 接口清单

#### 个人用户接口

| 接口 | 方法 | 说明 | 参数 |
|------|------|------|------|
| `/api/v1/usage/summary` | GET | 个人用量汇总 | `scope`=month/week/today, `time_filter`=all/work/non_work |
| `/api/v1/usage/detail` | GET | 个人使用明细 | `start`, `end`, `days`, `model`, `ide_type`, `sort_by`, `sort_order` |
| `/api/v1/usage/quota` | GET | 个人配额状态 | - |

#### 管理员接口

| 接口 | 方法 | 说明 | 参数 |
|------|------|------|------|
| `/api/v1/admin/leaderboard` | GET | 用量排行榜 | `start`, `end`, `time_filter`, `top`, `page`, `page_size` |
| `/api/v1/admin/users` | GET | 用户列表 | `page`, `page_size`, `year`, `month` |
| `/api/v1/admin/department-summary` | GET | 部门汇总 | `start`, `end`, `time_filter`, `group_by` |

### 4.4 响应格式

统一 JSON 格式，与现有内部接口返回结构保持一致，减少适配成本。

错误响应统一格式：
```json
{
  "error": "unauthorized",
  "message": "PAT has expired",
  "code": 401
}
```

---

## 五、安全要求（金融级）

### 5.1 Token 存储

- PAT 明文 **不落库**，仅存储 SHA-256 哈希值
- 创建时返回明文 Token，之后无法找回
- Token 格式：`pat_` + 40 位随机字符（字母+数字）

### 5.2 传输安全

- 建议生产环境使用 HTTPS，但不强制（由部署环境决定）
- 响应头包含 `X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`

### 5.3 速率限制

- **100 请求/分钟/Token**
- 超限返回 429 Too Many Requests，Header 包含 `Retry-After`
- 速率限制按 Token 粒度（非用户粒度），一个用户多个 Token 分别计数

### 5.4 审计日志

- 所有 PAT 操作记录审计日志：创建、撤销、认证成功、认证失败
- 日志包含：时间戳、操作类型、用户 ID、Token ID（前 8 位）、IP 地址
- 连续 5 次认证失败自动锁定该 PAT 10 分钟

### 5.5 Token 安全

- PAT 不记录在应用日志中（logging filter 过滤 `pat_` 开头字符串）
- API 响应不泄露其他用户信息（普通用户接口严格隔离）
- 已过期/已撤销 PAT 返回统一 401，不区分失败原因（防信息泄露）

---

## 六、前端界面

### 6.1 入口

- 顶栏用户名旁新增 **"API Token"** 链接（与退出按钮并列）
- 点击进入 PAT 管理页面

### 6.2 管理页面

**Token 列表：**
- 表格展示：名称、Token 前 8 位、创建时间、到期时间、最后使用时间、状态
- 状态标签：🟢 活跃 / 🟡 即将过期（≤7天） / 🔴 已过期 / ⚫ 已撤销
- 操作：撤销按钮（带确认弹窗）

**创建 Token：**
- 弹窗表单：名称（必填）、有效期（下拉选择 3/6/12 个月）
- 创建成功后弹窗显示完整 Token + 复制按钮 + 警告文案："请立即复制保存，关闭后无法再次查看"

**API 文档入口：**
- 管理页面底部提供 **"API 接口说明"** 链接或折叠面板
- 内容：认证方式、接口列表、请求/响应示例、错误码说明
- 示例用当前用户的 Token 前缀填充（`pat_xxxxxxxx...`）

---

## 七、数据库设计

### 7.1 新增表：`personal_access_tokens`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| user_id | VARCHAR | 所属用户 ID |
| name | VARCHAR(100) | Token 名称 |
| token_hash | VARCHAR(64) | SHA-256 哈希值 |
| token_prefix | VARCHAR(8) | Token 前 8 位（用于展示） |
| role | VARCHAR(10) | 创建时用户角色（user/admin） |
| expires_at | TIMESTAMP | 过期时间 |
| last_used_at | TIMESTAMP | 最后使用时间 |
| created_at | TIMESTAMP | 创建时间 |
| revoked_at | TIMESTAMP | 撤销时间（NULL 表示未撤销） |
| is_locked | BOOLEAN | 是否被锁定（连续失败） |
| locked_until | TIMESTAMP | 锁定解除时间 |
| failed_attempts | INT | 连续失败次数 |

### 7.2 新增表：`pat_audit_log`

| 字段 | 类型 | 说明 |
|------|------|------|
| id | SERIAL | 主键 |
| token_id | INT | 关联 PAT ID |
| user_id | VARCHAR | 用户 ID |
| action | VARCHAR(20) | 操作类型：create/revoke/auth_success/auth_fail |
| ip_address | VARCHAR(45) | 客户端 IP |
| details | TEXT | 附加信息 |
| created_at | TIMESTAMP | 时间戳 |

---

## 八、非功能性要求

| 维度 | 要求 |
|------|------|
| 性能 | API 响应 P95 < 500ms |
| 可用性 | PAT 认证不依赖 LDAP（避免 AD 故障影响 API） |
| 兼容性 | v1 接口向后兼容，字段只增不删 |
| 监控 | API 调用量、错误率纳入现有监控 |

---

## 九、验收标准

- [ ] 普通用户可创建/查看/撤销自己的 PAT
- [ ] 管理员可创建/查看/撤销自己的 PAT
- [ ] PAT 认证可访问对应权限的 v1 接口
- [ ] 越权访问返回 403
- [ ] Token 过期/撤销后返回 401
- [ ] 速率限制 100 req/min 生效
- [ ] 连续 5 次失败自动锁定 10 分钟
- [ ] 审计日志完整记录所有操作
- [ ] 创建后 Token 仅显示一次
- [ ] 前端管理页面功能完整
- [ ] API 文档在前端可访问
