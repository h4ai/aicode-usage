# SPEC-002: Skill 数据模型 & CRUD

> 状态: approved
> 优先级: P0
> 负责人: PO Agent
> 审核人: PM
> 关联 Task: TASK-002

## 1. 概述
Skill 是本系统的核心资产。本模块负责定义 Skill 的基础元数据结构（包含唯一标识、分类、可见性控制），并提供完整的生命周期管理（CRUD）接口。支持按类别、可见性、标签等维度进行展示与筛选。

## 2. 数据模型（Prisma Schema）
```prisma
model Skill {
  id              String          @id @default(uuid())
  slug            String          @unique
  displayName     String
  summary         String?
  category        SkillCategory   @default(GENERAL)
  ownerId         String
  owner           User            @relation(fields: [ownerId], references: [id])

  // 版本管理
  latestVersionId     String?     @unique
  latestVersion       SkillVersion? @relation("latestVersion", fields: [latestVersionId], references: [id])
  publishedVersionId  String?     @unique   // 最新已审核通过的版本
  publishedVersion    SkillVersion? @relation("publishedVersion", fields: [publishedVersionId], references: [id])

  // 可见性
  visibility      SkillVisibility @default(DEPARTMENT)
  allowedDepts    String[]        // visibility=DEPARTMENT 时，允许访问的部门列表

  // 审核状态
  moderationStatus  ModerationStatus @default(ACTIVE)

  // 统计
  downloadCount   Int     @default(0)
  installCount    Int     @default(0)
  starCount       Int     @default(0)

  // 标签
  tags            String[]
  badges          Json?           // { highlighted, official, deprecated }

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  // Relations
  versions        SkillVersion[]  @relation("skillVersions")
  reviews         SkillReview[]
  comments        Comment[]
  stars           Star[]

  @@index([category])
  @@index([visibility])
  @@index([ownerId])
  @@index([downloadCount(sort: Desc)])
}

enum SkillCategory {
  GENERAL
  DEVELOPMENT
  DEVOPS
  DATA
  SECURITY
  OFFICE
  MULTIMEDIA
  SEARCH
  BROWSER
  COMMUNICATION
  CUSTOM
}

enum SkillVisibility {
  PUBLIC          // 全公司可见
  DEPARTMENT      // 仅指定部门可见
  PRIVATE         // 仅本人可见（草稿）
}

enum ModerationStatus {
  ACTIVE
  HIDDEN
  REMOVED
}

model Comment {
  id        String   @id @default(uuid())
  content   String
  skillId   String
  skill     Skill    @relation(fields: [skillId], references: [id])
  ownerId   String
  author    User     @relation(fields: [ownerId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

> **注意**：不使用 `SkillStatus` 枚举。Skill 的管理状态通过 `moderationStatus: ModerationStatus` 控制（ACTIVE / HIDDEN / REMOVED），不再使用 `isDeleted` 布尔字段。

## 3. API 接口（端点 + Method + 请求体 + 响应体 + 错误码 + 权限要求）

### 3.0 通用规范
- **路径参数**：所有 Skill 资源的路径参数统一使用 `slug`（非 `id`）
- **分页默认值**：`page=1, limit=20, maxLimit=100`
- **统一错误响应**：`{ "code": "ERROR_CODE", "message": "描述", "statusCode": 400 }`

### 3.1 创建 Skill (POST `/api/v1/skills`)
- **请求体**: `{ "slug", "displayName", "summary", "category", "visibility", "allowedDepts", "tags" }`
- **响应体**: `{ "id", "slug", "moderationStatus", ... }`
- **错误码**: `400 Bad Request` (slug 格式不合法), `409 Conflict` (slug 已存在)
- **权限要求**: 登录用户 (PUBLISHER 角色及以上)

### 3.2 获取 Skill 列表 (GET `/api/v1/skills`)
- **Query 参数**: `page`(默认1), `limit`(默认20, 最大100), `category`, `search`, `tags`, `visibility`
- **响应体**: `{ "total": int, "page": int, "limit": int, "data": [Skill] }`
- **业务逻辑**: 不包含 `moderationStatus=REMOVED` 的数据（ADMIN 可通过 `includeRemoved=true` 查看）；根据访问者身份过滤可见性
- **权限要求**: 登录用户
- **缓存策略**: 热门列表（无筛选条件时）使用 Redis 缓存，TTL 5 分钟

### 3.3 获取 Skill 详情 (GET `/api/v1/skills/:slug`)
- **响应体**: `{ "id", "slug", "displayName", "summary", "owner": { "displayName", "department" }, "versions": [...], "publishedVersion": {...} }`
- **错误码**: `404 Not Found`, `403 Forbidden` (无可见性权限)
- **权限要求**: 登录用户

### 3.4 更新 Skill (PATCH `/api/v1/skills/:slug`)
- **请求体**: 可选更新字段 `{ "displayName", "summary", "category", "visibility", "allowedDepts", "tags" }`
- **响应体**: 更新后的 Skill 对象
- **错误码**: `403 Forbidden` (非 Owner 或管理员)
- **权限要求**: Skill 的 Owner 或 ADMIN
- **缓存操作**: 更新成功后清除该 Skill 相关的 Redis 缓存

### 3.5 删除 Skill (DELETE `/api/v1/skills/:slug`)
- **请求体**: 无
- **响应体**: `{ "success": true }`
- **业务逻辑**: 将 `moderationStatus` 设为 `REMOVED`（软删除）
- **权限要求**: Skill 的 Owner 或 ADMIN

## 4. 业务规则（约束条件、边界情况、状态机）

### 4.1 Slug 约束
- 正则校验: `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`
- 长度: 3-64 字符
- 一旦创建不能修改，全局唯一
- 不允许连续连字符 `--`

### 4.2 可见性规则
- `PUBLIC`: 所有已登录的 AD 用户均可查看和下载
- `DEPARTMENT`: 仅 `allowedDepts` 列表中包含的部门的用户、Skill Owner、ADMIN 可见
- `PRIVATE`: 仅 Owner、ADMIN 可见。用于开发中或仅自用的 Skill

### 4.3 Moderation 状态
- `ACTIVE`: 正常可见（受可见性规则约束）
- `HIDDEN`: 仅 Owner 和 ADMIN 可见（违规临时隐藏）
- `REMOVED`: 软删除，仅 ADMIN 可查看

### 4.4 Redis 缓存策略
- 热门 Skill 列表（按 downloadCount 排序，无额外筛选条件）: TTL 5 分钟
- Skill 详情页: TTL 5 分钟
- 缓存失效: 任何写操作（创建/更新/删除）后主动清除相关缓存 key

## 5. 前端组件（页面 + 组件 + 交互流程）
- **页面**:
  - Skill 市场大厅 (Marketplace)
  - Skill 详情页 (Skill Detail)
  - 我的发布页 (My Skills)
- **组件**:
  - `SkillCard`: 展示名称、分类、Owner、Star 数、badges（Json 渲染）
  - `CategoryFilter` / `TagCloud`: 左侧过滤边栏（11 个分类）
  - `VisibilitySelector`: 创建/编辑时的下拉或单选组件，当选 DEPARTMENT 时级联显示部门多选框

## 6. 安全要求（认证、权限矩阵、数据脱敏、审计日志）
- 必须进行越权检测（IDOR 防范）：在执行 UPDATE 和 DELETE 时，必须校验当前登录用户的 ID 是否与 `skill.ownerId` 匹配，或者当前用户拥有 ADMIN 角色
- 获取列表页时，SQL 级别必须附加针对 `visibility` 和 `department` 的过滤条件（部门可见性 Guard 的底层实现）
- 所有写操作记录 AuditLog

## 7. 验收标准
- [ ] 能成功创建一个 `moderationStatus=ACTIVE` 的 Skill
- [ ] slug 不符合正则 `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/` 或长度不在 3-64 字符范围内时，返回 `400`
- [ ] 尝试创建已存在的 slug 时，返回友好的 `409` 冲突错误
- [ ] 将可见性设置为 `DEPARTMENT=["Finance"]`，"HR" 部门的普通用户在列表页和详情页都无法访问到该 Skill
- [ ] 删除操作成功后，`moderationStatus=REMOVED`，ADMIN 可查看，普通用户不可见
- [ ] 分页参数 `limit` 超过 100 时自动截断为 100
- [ ] 热门列表在 5 分钟内返回 Redis 缓存结果

## 8. 变更记录
- 初始版本 draft。
- 修正 Skill 模型的 author/authorId 为 owner/ownerId 以对齐技术设计文档。
- **2026-03-19 approved**: 最终模型统一 — Skill 模型完全对齐 TECH-DESIGN.md（`summary` 替换 `description`，`moderationStatus: ModerationStatus` 替换 `isDeleted` + `SkillStatus`，补 `latestVersionId/publishedVersionId`，Category 扩展为 11 个枚举值，`badges: Json?`，统计字段改为 `downloadCount/installCount/starCount`，补全索引）；API 路径参数统一用 `slug`；补充分页默认值、slug 校验正则、Redis 缓存策略。
