# Enterprise SkillHub — 技术设计文档

> 版本: v1.0 | 创建时间: 2026-03-18 | 状态: Draft

## 1. 项目概述

基于 ClawHub（MIT 开源）Fork 改造，构建企业级私有化 AI Skills 市场，支持 LDAP 认证、发布审核流程、K8s 部署。

### 1.1 技术选型确认

| 维度 | 选型 | 理由 |
|------|------|------|
| 后端框架 | **Nest.js + TypeScript** | 企业级框架，模块化、DI、装饰器，适合复杂业务逻辑 |
| 数据库 | **PostgreSQL 16** | 关系型数据 + JSONB + 全文检索 + pgvector 向量扩展 |
| ORM | **Prisma** | 类型安全、Migration 管理、生态成熟 |
| 对象存储 | **MinIO** (S3 兼容) | 企业内网部署，存储 Skill 包文件 |
| 认证 | **LDAP/LDAPS 直连** | 对接企业 AD 域控 |
| 向量搜索 | **pgvector** | 无需额外服务，PostgreSQL 原生扩展 |
| Embedding | **BGE-M3** (私有化部署) | 中英文双语，无需外部 API |
| 前端 | **TanStack Start (React)** | 沿用 ClawHub 前端，减少改造量 |
| 部署 | **K8s (Helm Chart)** | 企业内网 K8s 集群 |
| CI/CD | **GitLab CI / Jenkins** | 企业标准流水线 |

### 1.2 系统架构图

```
                    ┌─────────────────────┐
                    │   Ingress (Nginx)   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐ ┌──────▼───────┐ ┌──────▼───────┐
     │  Web Frontend  │ │  API Server  │ │  CLI Client  │
     │  (React SSR)   │ │  (Nest.js)   │ │  (企业定制)   │
     │  Port: 3000    │ │  Port: 4000  │ │              │
     └────────────────┘ └──────┬───────┘ └──────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
  ┌──────▼───────┐   ┌────────▼────────┐   ┌────────▼────────┐
  │  PostgreSQL   │   │     MinIO       │   │   AD Domain     │
  │  + pgvector   │   │  (S3 Storage)   │   │  Controller     │
  │  Port: 5432   │   │  Port: 9000     │   │  LDAPS: 636     │
  └──────────────┘   └─────────────────┘   └─────────────────┘
         │
  ┌──────▼───────┐
  │  BGE-M3      │
  │  Embedding   │
  │  Service     │
  │  Port: 8080  │
  └──────────────┘
```

---

## 2. 数据模型设计（Prisma Schema）

### 2.1 用户与认证

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

### 2.2 Skill 核心模型

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
```

### 2.3 版本与文件

```prisma
model SkillVersion {
  id            String    @id @default(uuid())
  skillId       String
  skill         Skill     @relation("skillVersions", fields: [skillId], references: [id])
  version       String                      // semver: 1.0.0
  changelog     String?
  tag           String?                     // 如 "latest", "stable"

  // 文件
  files         SkillFile[]

  // 解析的元数据
  parsedMeta    Json?                       // 从 SKILL.md frontmatter 提取

  // 向量搜索
  embedding     Float[]?  @db.Vector(1024)  // BGE-M3 维度

  // 审核
  reviewStatus  ReviewStatus @default(PENDING_AUTO)

  // 自动扫描结果
  autoScanResult Json?     // { security, compliance, quality, dependencies }

  createdById   String
  createdBy     User      @relation(fields: [createdById], references: [id])
  createdAt     DateTime  @default(now())
  softDeletedAt DateTime?

  // Back relations
  latestOf      Skill?    @relation("latestVersion")
  publishedOf   Skill?    @relation("publishedVersion")
  reviews       SkillReview[]

  @@unique([skillId, version])
  @@index([reviewStatus])
}

model SkillFile {
  id            String    @id @default(uuid())
  versionId     String
  version       SkillVersion @relation(fields: [versionId], references: [id])
  path          String                      // 文件相对路径
  size          Int                         // 字节
  sha256        String
  storageKey    String                      // MinIO object key
  createdAt     DateTime  @default(now())

  @@index([versionId])
}
```

### 2.4 审核工作流

```prisma
model SkillReview {
  id              String        @id @default(uuid())
  skillId         String
  skill           Skill         @relation(fields: [skillId], references: [id])
  versionId       String
  version         SkillVersion  @relation(fields: [versionId], references: [id])

  // 审核状态
  status          ReviewStatus  @default(PENDING_AUTO)

  // 自动扫描
  autoScanPassed  Boolean?
  autoScanDetail  Json?         // 详细扫描报告

  // 人工审核
  reviewerId      String?
  reviewer        User?         @relation("reviewer", fields: [reviewerId], references: [id])
  reviewComment   String?
  reviewScore     Int?          // 1-5 质量评分

  // 提交人
  submitterId     String
  submitter       User          @relation("submitter", fields: [submitterId], references: [id])

  // 审核策略
  policyId        String?
  policy          ReviewPolicy? @relation(fields: [policyId], references: [id])

  // 时间线
  submittedAt     DateTime  @default(now())
  autoScannedAt   DateTime?
  assignedAt      DateTime?
  reviewedAt      DateTime?
  approvedAt      DateTime?

  @@index([status])
  @@index([reviewerId])
  @@index([skillId])
}

enum ReviewStatus {
  PENDING_AUTO        // 等待自动扫描
  AUTO_REJECTED       // 自动扫描未通过
  PENDING_MANUAL      // 等待人工审核
  IN_REVIEW           // 审核中
  APPROVED            // 已通过
  REJECTED            // 已驳回
  REVISION_REQUESTED  // 要求修改
}

model ReviewPolicy {
  id                  String    @id @default(uuid())
  name                String    @unique
  category            SkillCategory?        // 适用的技能类别，null=全局
  department          String?               // 适用的部门，null=全局

  // 策略规则
  autoApproveEnabled  Boolean   @default(false)  // 自动扫描通过后是否自动审批
  autoApproveMinScore Int       @default(90)     // 自动审批最低分
  requiredApprovers   Int       @default(1)      // 需要几个审核人
  reviewerAdGroups    String[]                   // 有权审核的 AD 组
  maxReviewDays       Int       @default(3)      // 最长审核天数（超时告警）

  // 自动扫描配置
  blockOnSecurityFail Boolean   @default(true)   // 安全扫描失败直接拒绝
  blockOnLicenseFail  Boolean   @default(true)   // 许可证不合规直接拒绝
  requiredFiles       String[]  @default(["SKILL.md"])  // 必须包含的文件

  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  reviews             SkillReview[]
}
```

### 2.5 审计日志

```prisma
model AuditLog {
  id            String    @id @default(uuid())
  actorId       String
  actor         User      @relation(fields: [actorId], references: [id])
  action        AuditAction
  targetType    String                    // "skill", "version", "review", "user"
  targetId      String
  metadata      Json?                     // 操作详情
  ipAddress     String?
  createdAt     DateTime  @default(now())

  @@index([actorId])
  @@index([targetType, targetId])
  @@index([action])
  @@index([createdAt])
}

enum AuditAction {
  // Skill
  SKILL_CREATE
  SKILL_UPDATE
  SKILL_DELETE
  SKILL_PUBLISH
  // Version
  VERSION_CREATE
  VERSION_DELETE
  // Review
  REVIEW_SUBMIT
  REVIEW_APPROVE
  REVIEW_REJECT
  REVIEW_REQUEST_REVISION
  // User
  USER_LOGIN
  USER_ROLE_CHANGE
  USER_DEACTIVATE
  // Admin
  BADGE_SET
  BADGE_UNSET
  POLICY_UPDATE
}
```

---

## 3. LDAP/AD 集成设计

### 3.1 认证流程

```
用户输入 username + password
        │
        ▼
┌──────────────────────┐
│ Nest.js AuthGuard    │
│ (passport-ldapauth)  │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ LDAPS Bind (636)     │  ← 用服务账号搜索用户 DN
│ 1. searchBase:       │
│    DC=corp,DC=local  │
│ 2. searchFilter:     │
│    (sAMAccountName=  │
│     {{username}})    │
└──────────┬───────────┘
           │ 找到用户 DN
           ▼
┌──────────────────────┐
│ 用户 DN Bind         │  ← 用用户凭证验证密码
│ (验证密码正确性)       │
└──────────┬───────────┘
           │ 验证通过
           ▼
┌──────────────────────┐
│ 提取 AD 属性          │
│ - displayName        │
│ - mail               │
│ - department         │
│ - employeeNumber     │
│ - memberOf (组列表)   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ 角色映射              │
│ memberOf → UserRole  │
│ 签发 JWT Token       │
│ 同步/创建本地 User    │
└──────────────────────┘
```

### 3.2 AD 组 → 角色映射配置

```yaml
# config/ldap.yaml
ldap:
  url: ldaps://dc01.corp.local:636
  bindDN: CN=svc-skillhub,OU=ServiceAccounts,DC=corp,DC=local
  bindCredentials: ${LDAP_BIND_PASSWORD}
  searchBase: DC=corp,DC=local
  searchFilter: (sAMAccountName={{username}})
  tlsOptions:
    rejectUnauthorized: false  # 内网自签证书

roleMapping:
  admin:
    - CN=SkillHub-Admin,OU=Groups,DC=corp,DC=local
  reviewer:
    - CN=SkillHub-Reviewer,OU=Groups,DC=corp,DC=local
    - CN=Tech-Lead,OU=Groups,DC=corp,DC=local
  publisher:
    - CN=SkillHub-Publisher,OU=Groups,DC=corp,DC=local
    - CN=Developer,OU=Groups,DC=corp,DC=local
  moderator:
    - CN=SkillHub-Moderator,OU=Groups,DC=corp,DC=local
  # 默认: USER (任何通过 LDAP 认证的用户)

# AD 组同步 (定时任务, 每小时)
syncSchedule: "0 * * * *"
```

### 3.3 Nest.js 模块结构

```
src/
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts       # POST /auth/login
│   ├── auth.service.ts
│   ├── ldap.strategy.ts          # passport-ldapauth strategy
│   ├── jwt.strategy.ts           # JWT 验证
│   ├── role-mapping.service.ts   # AD 组 → 角色映射
│   ├── guards/
│   │   ├── jwt-auth.guard.ts
│   │   ├── roles.guard.ts        # @Roles(UserRole.REVIEWER)
│   │   └── department.guard.ts   # 部门级权限控制
│   └── decorators/
│       ├── roles.decorator.ts
│       └── current-user.decorator.ts
```

---

## 4. 审核引擎设计

### 4.1 自动扫描 Pipeline

```
提交 Skill Version
        │
        ▼
┌─── Stage 1: 文件验证 ──────────────────────────┐
│ - SKILL.md 存在且可解析                          │
│ - 总大小 ≤ 50MB                                 │
│ - 无二进制文件                                   │
│ - 必需文件齐全（按 ReviewPolicy 配置）             │
└──────────────────────────┬─────────────────────┘
                           │
┌─── Stage 2: 安全扫描 ──────────────────────────┐
│ - 敏感信息检测 (API keys, passwords, tokens)     │
│ - Shell 命令风险评估 (rm, curl 外发等)            │
│ - 依赖来源检查 (是否引用外部未审批资源)            │
│ - 网络请求审计 (是否有外发数据行为)               │
└──────────────────────────┬─────────────────────┘
                           │
┌─── Stage 3: 合规检查 ──────────────────────────┐
│ - 许可证兼容性 (MIT/Apache/GPL 等)              │
│ - 企业安全策略合规                               │
│ - 内容合规 (无违禁词)                            │
└──────────────────────────┬─────────────────────┘
                           │
┌─── Stage 4: 质量评估 ──────────────────────────┐
│ - 文档完整性评分 (description, 示例, 参数说明)    │
│ - 代码规范评分                                   │
│ - 综合质量分 (0-100)                             │
└──────────────────────────┬─────────────────────┘
                           │
                    输出 AutoScanResult
                    { passed: bool, score: int, details: {...} }
```

### 4.2 审核分配策略

```typescript
// 审核人自动分配逻辑
async assignReviewer(review: SkillReview): Promise<User> {
  const policy = await this.getPolicy(review);

  // 1. 找到有权审核的用户 (AD 组匹配)
  const eligibleReviewers = await this.userRepo.find({
    where: {
      adGroups: { hasSome: policy.reviewerAdGroups },
      isActive: true,
      id: Not(review.submitterId),  // 不能审核自己的
    },
  });

  // 2. 按部门优先 (同部门技术负责人优先)
  const sameDept = eligibleReviewers.filter(
    r => r.department === review.submitter.department
  );

  // 3. 按当前审核负载均衡
  const leastBusy = await this.findLeastBusyReviewer(
    sameDept.length > 0 ? sameDept : eligibleReviewers
  );

  return leastBusy;
}
```

---

## 5. K8s 部署架构

### 5.1 Helm Chart 结构

```
helm/enterprise-skillhub/
├── Chart.yaml
├── values.yaml
├── values-prod.yaml
├── templates/
│   ├── deployment-api.yaml        # Nest.js API (3 replicas)
│   ├── deployment-web.yaml        # React SSR (2 replicas)
│   ├── deployment-embedding.yaml  # BGE-M3 服务 (1-2 replicas, GPU)
│   ├── deployment-scanner.yaml    # 自动扫描 Worker (2 replicas)
│   ├── statefulset-postgres.yaml  # PostgreSQL (主从)
│   ├── statefulset-minio.yaml     # MinIO (4 节点)
│   ├── service-*.yaml
│   ├── ingress.yaml
│   ├── configmap.yaml
│   ├── secret.yaml
│   ├── hpa.yaml                   # 自动伸缩
│   ├── pdb.yaml                   # Pod 中断预算
│   └── cronjob-ad-sync.yaml      # AD 组定时同步
```

### 5.2 资源规划

```yaml
# values-prod.yaml
api:
  replicas: 3
  resources:
    requests: { cpu: 500m, memory: 512Mi }
    limits:   { cpu: 2000m, memory: 2Gi }

web:
  replicas: 2
  resources:
    requests: { cpu: 250m, memory: 256Mi }
    limits:   { cpu: 1000m, memory: 1Gi }

embedding:
  replicas: 1
  resources:
    requests: { cpu: 2000m, memory: 4Gi }   # 或 GPU: nvidia.com/gpu: 1
    limits:   { cpu: 4000m, memory: 8Gi }

scanner:
  replicas: 2
  resources:
    requests: { cpu: 500m, memory: 512Mi }
    limits:   { cpu: 1000m, memory: 1Gi }

postgresql:
  primary:
    resources:
      requests: { cpu: 1000m, memory: 2Gi }
      limits:   { cpu: 4000m, memory: 8Gi }
    persistence:
      size: 100Gi
      storageClass: ceph-rbd   # 按企业存储类调整
  replica:
    replicaCount: 1

minio:
  replicas: 4
  persistence:
    size: 200Gi
```

### 5.3 网络拓扑

```
                    企业 DNS
                       │
           skillhub.corp.local
                       │
                ┌──────▼──────┐
                │   Ingress    │  (Nginx Ingress Controller)
                │   Controller │
                └──────┬──────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
   /api/*         /           /scanner/*
        │              │              │
   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
   │ API Svc │   │ Web Svc │   │ Scanner │
   │ (4000)  │   │ (3000)  │   │ Worker  │
   └─────────┘   └─────────┘   └─────────┘
        │                            │
        ├────────── Internal ────────┤
        │                            │
   ┌────▼────────────────────────────▼────┐
   │         Cluster Internal Network     │
   │  PostgreSQL:5432  MinIO:9000         │
   │  BGE-M3:8080      AD:ldaps://636     │
   └──────────────────────────────────────┘
```

---

## 6. API 设计 (核心接口)

### 6.1 认证

```
POST   /api/auth/login          # LDAP 登录 → JWT
POST   /api/auth/refresh        # 刷新 Token
GET    /api/auth/me             # 当前用户信息
```

### 6.2 Skills CRUD

```
GET    /api/v1/skills                    # 列表 (分页+筛选+搜索)
GET    /api/v1/skills/:slug              # 详情
POST   /api/v1/skills                    # 创建 Skill
PATCH  /api/v1/skills/:slug              # 更新元数据
DELETE /api/v1/skills/:slug              # 软删除

GET    /api/v1/skills/:slug/versions     # 版本列表
POST   /api/v1/skills/:slug/versions     # 发布新版本 (触发审核)
GET    /api/v1/skills/:slug/versions/:v  # 版本详情

GET    /api/v1/search?q=...              # 向量搜索
GET    /api/v1/download?slug=...&v=...   # 下载 Skill 包 (zip)
```

### 6.3 审核

```
GET    /api/v1/reviews                   # 审核列表 (审核人视角)
GET    /api/v1/reviews/:id               # 审核详情
PATCH  /api/v1/reviews/:id/approve       # 审核通过
PATCH  /api/v1/reviews/:id/reject        # 审核驳回
PATCH  /api/v1/reviews/:id/request-revision  # 要求修改
POST   /api/v1/reviews/:id/reassign      # 转派审核人
```

### 6.4 管理

```
GET    /api/v1/admin/users               # 用户管理
PATCH  /api/v1/admin/users/:id/role      # 角色变更
GET    /api/v1/admin/audit-logs          # 审计日志
GET    /api/v1/admin/policies            # 审核策略管理
POST   /api/v1/admin/policies            # 创建策略
GET    /api/v1/admin/dashboard           # 统计面板
POST   /api/v1/admin/sync-upstream       # 从 ClawHub 同步
```

---

## 7. 前端改造要点

### 7.1 保留的 ClawHub 页面
- Skills 浏览/搜索页
- Skill 详情页（SKILL.md 渲染）
- 版本历史页

### 7.2 新增页面
- 登录页（AD 域账号密码）
- 审核工作台（待审核列表、审核详情、批量操作）
- 发布向导（分步提交：上传 → 元数据 → 预览 → 提交审核）
- 管理后台（用户管理、策略配置、审计日志、统计面板）
- 个人中心（我发布的、我审核的、我的安装记录）

### 7.3 改造的组件
- 导航栏：替换 GitHub 登录 → AD 账号登录
- Skill 卡片：增加审核状态徽章、部门可见性标签
- 搜索筛选：增加部门、审核状态、分类筛选器
