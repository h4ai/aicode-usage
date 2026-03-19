# SPEC-001: 用户认证 & AD 域集成

> 状态: approved
> 优先级: P0
> 负责人: PO Agent
> 审核人: PM
> 关联 Task: TASK-001

## 1. 概述
本系统作为企业级内部系统，不提供独立的注册功能。所有用户必须通过企业 AD (Active Directory) 进行 LDAP/LDAPS 认证。认证成功后，系统会同步 AD 用户信息，并基于 AD 组分配相应的系统角色（RBAC），最后签发 JWT 令牌用于后续接口的认证授权。

## 2. 数据模型（Prisma Schema）
```prisma
model User {
  id            String    @id @default(uuid())
  username      String    @unique          // AD sAMAccountName
  displayName   String                      // AD displayName
  email         String    @unique           // AD mail
  employeeId    String?                     // AD employeeNumber
  department    String?                     // AD department
  adDN          String?                     // AD distinguishedName
  adGroups      String[]                    // AD memberOf 组列表
  role          UserRole  @default(USER)    // 角色：由 AD 组映射
  avatarUrl     String?
  isActive      Boolean   @default(true)
  lastLoginAt   DateTime?
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  // Relations
  skills            Skill[]
  skillVersions     SkillVersion[]
  reviews           SkillReview[]        @relation("reviewer")
  submittedReviews  SkillReview[]        @relation("submitter")
  comments          Comment[]
  stars             Star[]
  auditLogs         AuditLog[]

  @@index([department])
  @@index([role])
}

enum UserRole {
  USER          // 普通用户：浏览 + 安装
  PUBLISHER     // 发布者：可提交 Skill
  REVIEWER      // 审核人：可审核 Skill
  MODERATOR     // 版主：管理内容
  ADMIN         // 管理员：完全控制
}
```

> **注意**：不使用 `UserStatus` 枚举。用户的启用/禁用状态通过 `isActive: Boolean` 字段控制。

## 3. API 接口（端点 + Method + 请求体 + 响应体 + 错误码 + 权限要求）

### 3.1 登录 (POST `/api/v1/auth/login`)
- **请求体**: `{ "username": "string", "password": "string" }`
- **响应体**: `{ "accessToken": "string", "user": { "id", "username", "displayName", "role", "department" } }`
- **错误码**:
  - `401 Unauthorized` — 凭证错误（不区分账号不存在 vs 密码错误）
  - `403 Forbidden` — 账号已禁用（`isActive = false`）
  - `429 Too Many Requests` — 登录失败 IP 限流触发
- **权限要求**: 无 (Public)
- **统一错误响应格式**: `{ "code": "AUTH_INVALID_CREDENTIALS", "message": "用户名或密码错误", "statusCode": 401 }`

### 3.2 登出 (POST `/api/v1/auth/logout`)
- **请求体**: 空
- **响应体**: `{ "success": true }`
- **业务逻辑**: Logout 仅前端清除 Token（LocalStorage / Cookie），后端不维护 Token 黑名单。
- **权限要求**: 需登录 (Bearer Token)

### 3.3 获取当前用户信息 (GET `/api/v1/auth/me`)
- **响应体**: `{ "id", "username", "displayName", "email", "department", "role", "avatarUrl", "lastLoginAt" }`
- **权限要求**: 需登录 (Bearer Token)

## 4. 业务规则（约束条件、边界情况、状态机）

### 4.1 认证流程
1. 用户提交 `username` + `password`
2. Backend 使用服务账号连接 LDAPS (636) 搜索用户 DN（`searchFilter: (sAMAccountName={{username}})`）
3. 使用找到的 DN + 用户密码执行 Bind 验证
4. 验证成功后提取 AD 属性：`displayName`, `mail`, `department`, `employeeNumber`, `memberOf`, `distinguishedName`
5. 检查/Upsert 数据库中的 `User` 记录
6. 根据 AD 组映射计算 `UserRole`
7. 签发 JWT Token

### 4.2 JWT 策略
- **Payload 字段**: `{ sub: userId, role: UserRole, department: string, iat: number, exp: number }`
- **过期时间**: 12 小时，过期后重新登录
- **不使用 Refresh Token**：内部系统场景，过期重登即可
- **Logout**: 仅前端清除 Token，后端无状态

### 4.3 AD 组映射
在系统配置中维护 `AD Group → UserRole` 映射表（见 TECH-DESIGN.md §3.2）。映射规则：
- 优先匹配最高权限组（ADMIN > MODERATOR > REVIEWER > PUBLISHER > USER）
- 默认角色: 任何通过 LDAP 认证的用户为 `USER`
- 登录时动态更新用户角色

### 4.4 LDAP 连接池
- 使用连接池管理 LDAP 连接，避免每次登录都新建连接
- 连接池大小建议: min=2, max=10
- 空闲连接超时: 5 分钟

### 4.5 域控不可用时的降级策略
- 域控不可用时，**已登录用户的 JWT 仍然有效**（JWT 验证不依赖 AD）
- 新登录请求返回 `503 Service Unavailable`，提示"域控暂不可用，请稍后重试"
- 健康检查接口 `/api/health` 包含 LDAP 连通性状态

### 4.6 可见性隔离
`User.department` 用于后续 Skill 可见性判断（部门可见性 Guard）。

## 5. 前端组件（页面 + 组件 + 交互流程）
- **页面**: Login Page（仅账密输入，无注册和忘记密码入口）
- **组件**:
  - `LoginForm`：Username / Password 输入 + Submit 按钮
  - `UserProfileMenu`：右上角，显示 displayName 和 department，包含 Logout 按钮
- **交互流程**: 未认证访问受保护页面 → 重定向到 Login → 登录成功 → 写入 LocalStorage/Cookie → 重定向回原页面。

## 6. 安全要求（认证、权限矩阵、数据脱敏、审计日志）

### 6.1 传输安全
- 强制使用 LDAPS (LDAP over SSL)，防止密码在内网被嗅探
- 系统**不**存储用户密码，完全委托给 AD

### 6.2 权限矩阵
| 角色 | 权限 |
|------|------|
| `ADMIN` | 访问所有资源，配置系统，管理用户 |
| `MODERATOR` | 管理内容，隐藏/移除 Skill |
| `REVIEWER` | 访问审核面板，操作审核状态 |
| `PUBLISHER` | 允许发布 Skill |
| `USER` | 仅能查看公开/同部门的 Skill |

### 6.3 Rate Limiting
- 使用 `@nestjs/throttler` 实现请求限流
- 登录失败 IP 限流：**10 次/分钟**，超出返回 `429 Too Many Requests`
- 全局 API 限流：100 次/分钟/用户

### 6.4 统一错误响应格式
所有 API 错误响应统一为：
```json
{
  "code": "ERROR_CODE",
  "message": "人类可读的错误描述",
  "statusCode": 401
}
```

### 6.5 审计日志
- 记录所有的登录成功、登录失败（包含 IP）、角色变更
- 写入 `AuditLog` 表，使用 `AuditAction.USER_LOGIN` / `AuditAction.USER_ROLE_CHANGE`

## 7. 验收标准
- [ ] 能使用有效的 AD 域账号（`username` 字段）和密码成功登录
- [ ] 登录后数据库中能正确创建/更新用户记录，包含完整的 AD 属性（displayName, email, department, employeeId, adDN, adGroups, avatarUrl, lastLoginAt）
- [ ] 属于 `SkillHub-Admin` 组的 AD 用户登录后，角色被正确识别为 `ADMIN`
- [ ] 输入错误的密码或不存在的账号，返回统一格式 `{ code, message, statusCode }` 的 `401` 响应，不暴露具体是账号错还是密码错
- [ ] JWT payload 包含 `sub`, `role`, `department`, `iat`, `exp` 字段
- [ ] 同一 IP 登录失败超过 10 次/分钟后，返回 `429`
- [ ] 域控不可用时，已有 JWT 的用户仍可正常访问系统

## 8. 变更记录
- 初始版本 draft。
- 修正 User 模型，补充 adGroups, adDN, avatarUrl, lastLoginAt 字段以对齐技术设计文档。
- **2026-03-19 approved**: 最终模型统一 — User 模型完全对齐 TECH-DESIGN.md（`username` 替换 `accountName`，`isActive: Boolean` 替换 `status` 枚举，删除 `UserStatus` 枚举，补全所有关联关系和索引）；补充 JWT payload 规范、LDAP 连接池、域控降级策略、IP 限流、统一错误响应格式、Rate Limiting。
