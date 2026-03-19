# SPEC-002: Skill 数据模型 & CRUD

> 状态: review
> 优先级: P0
> 负责人: PO Agent
> 审核人: PM
> 关联 Task: TASK-002

## 1. 概述
Skill 是本系统的核心资产。本模块负责定义 Skill 的基础元数据结构（包含唯一标识、分类、可见性控制），并提供完整的生命周期管理（CRUD）接口。支持按类别、可见性、标签等维度进行展示与筛选。

## 2. 数据模型（Prisma Schema）
```prisma
model Skill {
  id            String   @id @default(uuid())
  slug          String   @unique // 唯一标识符，如 'data-analyzer'
  displayName   String   // 显示名称
  description   String   // 简短描述
  
  category      Category // 技能分类
  visibility    Visibility @default(PUBLIC)
  allowedDepts  String[] // 仅在 visibility = DEPARTMENT 时有效，存放允许访问的部门名称
  
  ownerId      String
  owner         User     @relation(fields: [ownerId], references: [id])
  
  status        SkillStatus @default(DRAFT)
  
  tags          String[] // 标签
  badges        String[] // 徽章，如 'OFFICIAL', 'HOT'
  
  starCount     Int      @default(0)
  viewCount     Int      @default(0)
  
  versions      SkillVersion[]
  reviews       Review[]
  comments      Comment[]

  isDeleted     Boolean  @default(false) // 软删除标志
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

enum Category {
  DEVELOPMENT
  DEVOPS
  DATA
  SECURITY
  PRODUCTIVITY
  OTHER
}

enum Visibility {
  PUBLIC      // 全员可见
  DEPARTMENT  // 指定部门可见
  PRIVATE     // 仅Owner和 ADMIN 可见
}

enum SkillStatus {
  DRAFT
  PENDING_REVIEW
  PUBLISHED
  DEPRECATED
}

model Comment {
  id        String   @id @default(uuid())
  content   String
  skillId   String
  skill     Skill    @relation(fields: [skillId], references: [id])
  ownerId  String
  author    User     @relation(fields: [ownerId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

## 3. API 接口（端点 + Method + 请求体 + 响应体 + 错误码 + 权限要求）

### 3.1 创建 Skill (POST `/api/v1/skills`)
- **请求体**: `{ "slug", "displayName", "description", "category", "visibility", "allowedDepts", "tags" }`
- **响应体**: `{ "id", "slug", "status", ... }`
- **错误码**: `400 Bad Request` (slug 格式不合法), `409 Conflict` (slug 已存在)
- **权限要求**: 登录用户 (PUBLISHER 角色及以上)

### 3.2 获取 Skill 列表 (GET `/api/v1/skills`)
- **Query参数**: `page`, `limit`, `category`, `search`, `tags`
- **响应体**: `{ "total": int, "data": [Skill] }` (不包含软删除的数据，根据访问者身份过滤可见性)
- **权限要求**: 登录用户

### 3.3 获取 Skill 详情 (GET `/api/v1/skills/:slug`)
- **响应体**: `{ "id", "slug", "displayName", "author": { "displayName", "department" }, "versions": [...] }`
- **错误码**: `404 Not Found`, `403 Forbidden` (无可见性权限)
- **权限要求**: 登录用户

### 3.4 更新 Skill (PATCH `/api/v1/skills/:id`)
- **请求体**: 可选更新字段 `{ "displayName", "description", "category", "visibility", "allowedDepts", "tags" }`
- **响应体**: 更新后的 Skill 对象
- **错误码**: `403 Forbidden` (非Owner或管理员)
- **权限要求**: Skill 的Owner 或 ADMIN

### 3.5 删除 Skill (DELETE `/api/v1/skills/:id`)
- **请求体**: 无
- **响应体**: `{ "success": true }`
- **业务逻辑**: 将 `isDeleted` 设为 `true`（软删除）
- **权限要求**: Skill 的Owner 或 ADMIN

## 4. 业务规则（约束条件、边界情况、状态机）
1. **Slug 约束**: `slug` 必须是小写字母、数字和连字符的组合，一旦创建不能修改。全局唯一。
2. **可见性规则**:
   - `PUBLIC`: 所有已登录的 AD 用户均可查看和下载。
   - `DEPARTMENT`: 仅 `allowedDepts` 列表中包含的部门的用户、Skill Owner、ADMIN 可见。
   - `PRIVATE`: 仅Owner、ADMIN 可见。用于开发中或仅自用的 Skill。
3. **软删除机制**: 删除 Skill 并不是真正从数据库 DROP，而是修改 `isDeleted` 为 `true`。列表接口和详情接口默认过滤 `isDeleted = true` 的记录（ADMIN 可以选择查看）。

## 5. 前端组件（页面 + 组件 + 交互流程）
- **页面**: 
  - Skill 市场大厅 (Marketplace)
  - Skill 详情页 (Skill Detail)
  - 我的发布页 (My Skills)
- **组件**:
  - `SkillCard`: 展示名称、分类、Owner、Star 数、徽章。
  - `CategoryFilter` / `TagCloud`: 左侧过滤边栏。
  - `VisibilitySelector`: 创建/编辑时的下拉或单选组件，当选 Department 时级联显示部门多选框。

## 6. 安全要求（认证、权限矩阵、数据脱敏、审计日志）
- 必须进行越权检测（IDOR防范）：在执行 UPDATE 和 DELETE 时，必须校验当前登录用户的 ID 是否与 `skill.ownerId` 匹配，或者当前用户拥有 ADMIN 角色。
- 获取列表页时，SQL 级别必须附加针对 `visibility` 和 `department` 的过滤条件（部门可见性 Guard 的底层实现）。

## 7. 验收标准
- [ ] 能成功创建一个处于 DRAFT 状态的 Skill。
- [ ] 尝试创建已存在的 slug 时，返回友好的冲突错误。
- [ ] 将可见性设置为 DEPARTMENT="Finance"，"HR" 部门的普通用户在列表页和详情页都无法访问到该 Skill。
- [ ] 删除操作成功后，相关记录仍在数据库中，但 `isDeleted=true`。

## 8. 变更记录
- 初始版本 draft。- 修正 Skill 模型的 author/authorId 为 owner/ownerId 以对齐技术设计文档。
