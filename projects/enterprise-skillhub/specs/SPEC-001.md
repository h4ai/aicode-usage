# SPEC-001: 用户认证 & AD 域集成

> 状态: draft
> 优先级: P0
> 负责人: PO Agent
> 审核人: PM
> 关联 Task: TASK-001

## 1. 概述
本系统作为企业级内部系统，不提供独立的注册功能。所有用户必须通过企业 AD (Active Directory) 进行 LDAP/LDAPS 认证。认证成功后，系统会同步 AD 用户信息，并基于 AD 组分配相应的系统角色（RBAC），最后签发 JWT 令牌用于后续接口的认证授权。

## 2. 数据模型（Prisma Schema）
```prisma
model User {
  id             String   @id @default(uuid())
  accountName    String   @unique // AD 账号名 (sAMAccountName)
  displayName    String   // 姓名
  email          String   @unique // 邮箱 (mail)
  department     String?  // 部门
  employeeNumber String?  // 工号
  role           UserRole @default(USER)
  status         UserStatus @default(ACTIVE)
  
  skills         Skill[]
  reviews        Review[]
  downloads      Download[]

  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

enum UserRole {
  ADMIN       // 超级管理员
  REVIEWER    // 审核员
  PUBLISHER   // 发布者
  MODERATOR   // 版主
  USER        // 普通用户
}

enum UserStatus {
  ACTIVE
  DISABLED
}
```

## 3. API 接口（端点 + Method + 请求体 + 响应体 + 错误码 + 权限要求）

### 3.1 登录 (POST `/api/v1/auth/login`)
- **请求体**: `{ "username": "string", "password": "password" }`
- **响应体**: `{ "accessToken": "string", "user": { "id", "displayName", "role", "department" } }`
- **错误码**: `401 Unauthorized` (凭证错误), `403 Forbidden` (账号被禁用)
- **权限要求**: 无 (Public)

### 3.2 登出 (POST `/api/v1/auth/logout`)
- **请求体**: 空
- **响应体**: `{ "success": true }`
- **权限要求**: 需登录 (Bearer Token)

### 3.3 获取当前用户信息 (GET `/api/v1/auth/me`)
- **响应体**: `{ "id", "accountName", "displayName", "email", "department", "role" }`
- **权限要求**: 需登录 (Bearer Token)

## 4. 业务规则（约束条件、边界情况、状态机）
1. **认证流程**: 用户提交账密 -> Backend 连接 LDAP 服务器做 Bind 验证 -> 验证成功后查询用户属性 (displayName, mail, department, employeeNumber, memberOf) -> 检查/更新数据库中的 `User` 记录 -> 生成 JWT。
2. **AD 组映射**: 在系统配置中维护 `AD Group <-> UserRole` 映射。例如 `CN=SkillHub_Admins,OU=Groups,DC=corp,DC=com` 映射为 `ADMIN`。登录时动态覆盖或更新用户权限。
3. **可见性隔离**: `User.department` 用于后续 Skill 可见性判断（部门可见性 Guard）。
4. **Token 管理**: JWT 过期时间建议设为 12 小时。由于是内部系统，可以不使用 Refresh Token 机制，过期后重新登录。

## 5. 前端组件（页面 + 组件 + 交互流程）
- **页面**: Login Page (仅账密输入，无注册和忘记密码入口)
- **组件**: 
  - `LoginForm` (Username/Password input, submit button)
  - `UserProfileMenu` (右上角，显示 displayName 和 department，包含 Logout 按钮)
- **交互流程**: 未认证访问受保护页面 -> 重定向到 Login -> 登录成功 -> 写入 LocalStorage/Cookie -> 重定向回原页面。

## 6. 安全要求（认证、权限矩阵、数据脱敏、审计日志）
- **认证**: 强制使用 LDAPS (LDAP over SSL) 防止密码在内网被嗅探。
- **权限矩阵**: 
  - `@Roles('ADMIN')`: 访问所有资源，配置系统。
  - `@Roles('REVIEWER')`: 访问审核面板，操作审核状态。
  - `@Roles('PUBLISHER')`: 允许发布 Skill。
  - `@Roles('USER')`: 仅能查看公开/同部门的 Skill。
- **审计日志**: 记录所有的登录成功、登录失败（包含 IP）、角色变更。
- **密码安全**: 系统**不**存储用户密码，完全委托给 AD。

## 7. 验收标准
- [ ] 能使用有效的 AD 域账号和密码成功登录。
- [ ] 登录后数据库中能正确创建/更新用户记录，包含完整的 AD 属性。
- [ ] 属于 `SkillHub_Admins` 组的 AD 用户登录后，角色被正确识别为 `ADMIN`。
- [ ] 输入错误的密码或不存在的账号，返回 `401` 并给出明确提示，不暴露具体是账号错还是密码错。

## 8. 变更记录
- 初始版本 draft。