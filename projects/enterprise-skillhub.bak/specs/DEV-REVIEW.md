# DEV-REVIEW: Enterprise SkillHub Specs 技术评审报告

> 评审人: Dev Agent (全栈开发工程师)
> 评审日期: 2026-03-19
> 评审范围: SPEC-001 ~ SPEC-005 + TECH-DESIGN.md
> 技术栈: Nest.js + PostgreSQL + Prisma + MinIO + LDAP/AD + pgvector + K8s

---

## 整体评价: **NEEDS_REVISION**

五份 Spec 整体覆盖了核心业务场景，数据模型和 API 设计基本完整，但存在 **Spec 与 TECH-DESIGN.md 之间大量不一致**、**多个可编码性问题**、以及 **关键技术风险未给出落地方案**。建议在开发前统一解决 Blocker 问题，否则各模块开发者会因为模型冲突频繁返工。

---

## 一、跨 Spec 一致性问题（最严重）

### 🔴 BLOCKER-01: User 模型在 Spec-001 与 TECH-DESIGN 严重分歧

| 字段 | SPEC-001 | TECH-DESIGN |
|------|----------|-------------|
| AD 账号字段名 | `accountName` | `username` |
| 状态字段 | `status: UserStatus (ACTIVE/DISABLED)` 枚举 | `isActive: Boolean` |
| 关联关系 | `skills, reviews, downloads` | `skills, skillVersions, reviews(reviewer), submittedReviews, comments, stars, auditLogs` |
| 索引 | 无 | `@@index([department])`, `@@index([role])` |

**影响**: 这是 P0 基础模型，其他所有 Spec 都依赖 User。字段名不统一会导致所有关联模块编译失败。

**建议**: 以 TECH-DESIGN 为准，SPEC-001 需要全面对齐。`isActive: Boolean` 比枚举更简洁，对 LDAP 同步场景更友好。

### 🔴 BLOCKER-02: Skill 模型在 SPEC-002 与 TECH-DESIGN 严重分歧

| 维度 | SPEC-002 | TECH-DESIGN |
|------|----------|-------------|
| 描述字段 | `description: String` | `summary: String?` |
| Category 枚举 | 6 个值 (DEVELOPMENT/DEVOPS/DATA/SECURITY/PRODUCTIVITY/OTHER) | 11 个值 (新增 GENERAL/OFFICE/MULTIMEDIA/SEARCH/BROWSER/COMMUNICATION/CUSTOM) |
| 软删除 | `isDeleted: Boolean` | `moderationStatus: ModerationStatus (ACTIVE/HIDDEN/REMOVED)` |
| 版本快捷引用 | 无 | `latestVersionId`, `publishedVersionId` 两个快捷指针 |
| 统计字段 | `starCount, viewCount` | `downloadCount, installCount, starCount`（无 viewCount） |
| badges 类型 | `String[]` | `Json?` |

**影响**: Category 枚举不一致会导致 SPEC-004/005 中按分类过滤的逻辑对不上。软删除机制不同会影响全部列表查询的 WHERE 条件。

**建议**: 以 TECH-DESIGN 为准。`ModerationStatus` 三态比 `isDeleted` 布尔值更灵活（支持"隐藏但不删除"场景）。

### 🔴 BLOCKER-03: SkillVersion 模型分歧

| 维度 | SPEC-003 | TECH-DESIGN |
|------|----------|-------------|
| embedding 字段 | 不在 SkillVersion，单独有 SkillEmbedding 模型 (SPEC-004) | **直接放在 SkillVersion 上** `embedding Float[]? @db.Vector(1024)` |
| 审核状态 | `VersionStatus` (PENDING_REVIEW/APPROVED/REJECTED/ARCHIVED) | `ReviewStatus` 枚举（7 个状态，含 AUTO_REJECTED, PENDING_MANUAL 等） |
| parsedMeta | 无 | `parsedMeta Json?` |
| tag 字段 | 无 | `tag String?` ("latest", "stable") |
| 创建者字段 | `SkillFile.uploadedBy` | `SkillVersion.createdById` with User relation |
| 软删除 | 无 | `softDeletedAt DateTime?` |

**影响**: 
- Embedding 放在哪里直接决定 SPEC-004 的实现方案——是单独表还是 SkillVersion 字段？
- 审核状态枚举不一致会导致 SPEC-003 和 SPEC-005 的状态机完全对不上。

**建议**: 以 TECH-DESIGN 为准。Embedding 放在 SkillVersion 上更简单（减少 JOIN），但需要权衡版本数量多时的存储开销。

### 🔴 BLOCKER-04: Review 模型在 SPEC-005 与 TECH-DESIGN 分歧

| 维度 | SPEC-005 | TECH-DESIGN |
|------|----------|-------------|
| 模型名 | `Review` | `SkillReview` |
| 唯一约束 | `versionId @unique`（一个版本只能有一个 Review） | 无唯一约束（支持多轮 Review？） |
| submitter 关系 | 无 | `submitterId + submitter User @relation("submitter")` |
| skillId | 无（通过 version 间接关联） | 直接有 `skillId` 字段 |
| 时间线字段 | 仅 `createdAt, updatedAt` | `submittedAt, autoScannedAt, assignedAt, reviewedAt, approvedAt` 五个时间戳 |
| reviewScore | 无 | `reviewScore Int?` (1-5) |

**影响**: 模型名不同会导致 Prisma schema 编译就过不了。时间线字段缺失会导致超时告警功能无法实现。

### 🟡 WARNING-01: API 路径风格不一致

| 来源 | 风格 | 示例 |
|------|------|------|
| SPEC-001 | 有 `/api/v1/` 前缀 | `POST /api/v1/auth/login` |
| SPEC-003 | `skillId` 路径参数 | `POST /api/v1/skills/:skillId/versions` |
| TECH-DESIGN | `slug` 路径参数 | `POST /api/v1/skills/:slug/versions` |
| TECH-DESIGN 审核 | `PATCH` 动作 | `PATCH /api/v1/reviews/:id/approve` |
| SPEC-005 审核 | `POST` 动作 | `POST /api/v1/reviews/:id/decision` |

**建议**: 统一为 TECH-DESIGN 风格：用 `slug` 作 Skill 路径参数，审核动作拆分为独立端点 (`/approve`, `/reject`, `/request-revision`) 而非用 body 里的 `decision` 字段。

### 🟡 WARNING-02: 缺少 Star/Comment/Download 等辅助模型的 Spec

TECH-DESIGN 中定义了 `Star`, `Comment` 等模型，SPEC-002 中 Comment 模型只是简单定义，但没有任何 Spec 覆盖以下功能：
- Star/Unstar API 接口
- Comment CRUD API 接口  
- Download 记录与统计

**建议**: 要么补充 SPEC-006 覆盖社区互动功能，要么在 SPEC-002 中明确这些是 Phase 2 不实现。

---

## 二、各 Spec 具体问题

### SPEC-001: 用户认证 & AD 域集成

#### 可编码性问题

1. **缺少 Refresh Token 策略细节**: Spec 说"可以不使用 Refresh Token"，但 TECH-DESIGN 有 `POST /api/auth/refresh` 端点。两者矛盾。如果用 12h JWT 且无 Refresh，用户在工作时间内可能需要重登——**需要明确选择**。

2. **AD 组映射配置 API 缺失**: Spec 提到"在系统配置中维护 AD Group ↔ UserRole 映射"，但没有提供管理员配置这个映射的 API 或界面。是 YAML 配置文件（如 TECH-DESIGN 所述）还是数据库可配置？

3. **JWT payload 结构未定义**: Token 里除了 userId，是否包含 role、department？这影响 Guards 是每次查库还是从 Token 解析。

#### 技术风险

4. **LDAP 连接池**: 高并发登录时，每次 LDAP Bind 都是 TCP 连接。建议使用 `ldapjs` 的连接池或 `passport-ldapauth` 的 pool 配置，否则可能打满 AD 域控连接数。

5. **AD 域控不可用时的降级策略缺失**: 如果 LDAP 服务器宕机，整个系统无法登录。建议增加：已登录用户的 JWT 仍可使用，仅新登录受影响。

6. **AD 属性同步频率**: Spec 只说登录时同步。如果用户部门变了但没重新登录，权限会过期。TECH-DESIGN 提到 `cronjob-ad-sync.yaml`（每小时同步），但 Spec 未提及。

#### 缺失细节

7. **登录失败锁定机制**: 未定义连续失败 N 次后的处理（IP 限流？账号临时锁定？还是完全依赖 AD 侧的策略？）。
8. **`/api/v1/auth/logout` 实现细节**: JWT 是无状态的，logout 是否需要服务端黑名单？如果不做服务端失效，logout 只是前端清除 Token，安全性降低。

---

### SPEC-002: Skill 数据模型 & CRUD

#### 可编码性问题

1. **Comment 模型的 `ownerId` 关联名为 `author`**: 
   ```prisma
   ownerId  String
   author   User @relation(fields: [ownerId], references: [id])
   ```
   Prisma 多关联冲突——User 已有 `skills` 关联，Comment 的 `author` 会与 TECH-DESIGN 中的 `comments Comment[]` 冲突，需要在 User 侧用 `@relation` 名称区分。

2. **分页默认值未定义**: GET `/api/v1/skills` 的 `page` 和 `limit` 默认值是什么？建议 `page=1, limit=20, maxLimit=100`。

3. **搜索 `search` 参数的实现方式未说明**: 是 `ILIKE %keyword%` 还是 PostgreSQL 全文搜索（`tsvector`）？还是走 SPEC-004 的向量搜索？需要明确。

4. **slug 格式校验正则未给出**: 说"小写字母、数字和连字符"，建议明确为 `/^[a-z0-9][a-z0-9-]*[a-z0-9]$/`，最小 3 字符，最大 64 字符。

#### 缺失细节

5. **Update Skill 时 status 字段能否被修改**: 如果 Skill 已 PUBLISHED，Owner 修改描述后是否需要重新审核？还是只有新 Version 需要审核？
6. **ADMIN 查看软删除记录的 API 设计**: 是 `GET /api/v1/skills?includeDeleted=true` 还是独立端点？
7. **批量操作接口缺失**: ADMIN 批量删除、批量修改分类等管理需求无对应接口。

---

### SPEC-003: 版本管理 & 文件存储

#### 技术风险

1. **🔴 ZIP 炸弹防护未给出具体方案**: Spec 提到"在内存中解压寻找 SKILL.md"——如果上传一个 42.zip（压缩比极端的 ZIP 炸弹），内存中解压会 OOM。**必须**做以下防护：
   - 解压前检查 ZIP 中声明的 uncompressed size
   - 设置单个文件解压上限（如 200MB）
   - 设置 ZIP 内文件数上限（如 1000）
   - 使用流式解压，不要一次性 load 到内存
   - 设置解压超时

2. **大文件上传的超时和分片**: 50MB 文件上传在企业内网可能需要几十秒。Nest.js 默认 body parser 限制需要调整。建议：
   - 使用 `@nestjs/platform-express` 的 multer 配置
   - 设置 `fileSize: 50 * 1024 * 1024` 
   - 考虑分片上传 API（对于未来更大文件）

3. **SHA-256 计算时机**: 是上传时同步计算还是异步？50MB 文件 SHA-256 大约需要 0.5-1 秒，同步计算可以接受，但需要在响应中确认。

#### 缺失细节

4. **SkillFile 与 SkillVersion 是一对多，但上传 API 只接收一个文件**: 3.1 接口定义为 `file (文件)`（单数），但模型是一对多。是一次上传一个 ZIP 自动解压为多个 SkillFile，还是允许多次上传？**需要澄清**。

5. **版本号比较和排序**: SemVer 的字符串排序不等于版本排序（"2.0.0" < "10.0.0" 字符串排序会错）。需要存储 `major/minor/patch` 整数字段或使用专门的排序逻辑。

6. **ARCHIVED 状态的触发条件**: Spec 定义了 ARCHIVED 状态但没说谁在什么时候触发它。是手动操作还是发布新版本后自动归档旧版本？

7. **Pre-signed URL 的具体参数**: 有效期 5 分钟是否写死？需要可配置。另外需要限制单 IP 频繁生成 Pre-signed URL（防盗链/防爬）。

---

### SPEC-004: 向量搜索 & Embedding

#### 技术风险

1. **🔴 Prisma + pgvector 的已知限制**: 
   - Prisma 不原生支持 `vector` 类型的查询操作符（`<=>`, `<->`, `<#>`）
   - **必须使用 `$queryRaw` / `$executeRaw`** 编写混合搜索 SQL
   - Prisma 的 `Unsupported` 类型字段无法通过标准 CRUD API 读写
   - **HNSW 索引创建必须用 raw SQL migration**，Prisma Migrate 不会自动生成
   
   **建议**: 在 Spec 中明确 "向量搜索模块全部使用 Raw SQL，绕过 Prisma Client 的类型系统"，避免开发者花时间尝试用 Prisma ORM 方式操作向量。

2. **BGE-M3 服务的调用协议未定义**: 
   - 是 HTTP REST API 还是 gRPC？
   - 请求体格式是什么？`{ "texts": ["..."] }` → `{ "embeddings": [[...]] }` ？
   - 超时设置多少？单次编码 1024 维向量约需 100-500ms
   - 批量编码上限？

3. **降级搜索的具体实现**: Spec 说"降级为 ILIKE/正则"，但 GET `/api/v1/search/skills` 的响应体包含 `similarityScore`——降级时这个字段怎么处理？返回 null？固定值？

#### 缺失细节

4. **HNSW 索引参数**: 未指定 `m` (连接数) 和 `ef_construction` (构建时搜索宽度)。建议：
   ```sql
   CREATE INDEX ON skill_embedding USING hnsw (embedding vector_cosine_ops) 
   WITH (m = 16, ef_construction = 64);
   ```

5. **向量更新的异步队列选型**: 是用 BullMQ (Redis)？PostgreSQL LISTEN/NOTIFY？还是 K8s CronJob？需要明确。

6. **文本截断策略**: "截断超长文本以适应模型 Token 限制"——BGE-M3 的 max tokens 是 8192。拼接策略的优先级是什么？如果文本超长，是截断 SKILL.md 正文还是截断 Description？

7. **搜索结果分页**: 3.1 接口有 `limit` 但没有 `offset/page`。向量搜索的分页用 offset 性能极差（pgvector 不支持 cursor-based pagination for ANN），需要说明分页策略或限制最大返回数量。

---

### SPEC-005: 审核工作流引擎

#### 可编码性问题

1. **状态机转换图缺失**: Spec 描述了 7 个状态和部分转换，但没有完整的状态机图。以下转换需要明确：

   ```
   PENDING_AUTO → AUTO_REJECTED (扫描发现 FATAL)
   PENDING_AUTO → PENDING_MANUAL (扫描通过)
   PENDING_MANUAL → IN_REVIEW (审核员认领)
   IN_REVIEW → APPROVED
   IN_REVIEW → REJECTED
   IN_REVIEW → REVISION_REQUESTED
   REVISION_REQUESTED → ??? (作者修改后重新提交，是新建 Review 还是回到 PENDING_AUTO？)
   AUTO_REJECTED → ??? (作者能否申诉？)
   REJECTED → ??? (最终态？能否重新提交？)
   ```
   
   **REVISION_REQUESTED 的后续流程是最大的状态机漏洞**——作者修改后是修改当前版本（违反不可变原则）还是必须发布新版本？

2. **决策 API 的 `REVISE` 值与枚举 `REVISION_REQUESTED` 不一致**: 3.3 接口请求体 `decision: "APPROVE|REJECT|REVISE"`，但枚举值是 `REVISION_REQUESTED`。需要统一。

#### 技术风险

3. **自动扫描的执行环境**: 扫描 ZIP 包内容涉及安全风险——如果 ZIP 中包含恶意的符号链接（symlink attack）、超深目录嵌套等。建议在隔离的容器（TECH-DESIGN 中的 scanner worker）中执行，并限制文件系统访问。

4. **定时任务的并发控制**: "每小时定时任务自动分配审核员"——如果 K8s 中有多个 API replica，CronJob 会不会重复分配？需要分布式锁（Redis SETNX）或确保只在一个实例上执行。

5. **ReviewPolicy 的优先级冲突**: 同时配置了 `category=DEVELOPMENT` 和 `department=Engineering` 的两条策略，哪个优先？Spec 未定义策略匹配优先级和冲突解决规则。

#### 缺失细节

6. **自动扫描的具体正则规则库**: 安全扫描"正则检查是否硬编码密码、Token"——正则规则是硬编码在代码中还是可配置？是否参考 GitHub Secret Scanning 的规则库？

7. **通知机制的接口**: 超时告警"通过企业 IM 发送提醒"——是调用飞书/企微 Webhook 还是集成消息队列？通知模板是什么？需要独立的 Notification Service 还是内联实现？

8. **质量评估分数的算法**: "根据代码结构复杂度给出质量参考分"——这是静态分析（AST 解析）还是简单的启发式规则（文件数、代码行数、注释率）？对于 Skill 这种可能是 Markdown + YAML 的场景，"代码复杂度"的定义需要明确。

---

## 三、开发前必须澄清的 Blocker 列表

| # | 问题 | 影响范围 | 建议 |
|---|------|---------|------|
| B1 | User 模型以 SPEC-001 还是 TECH-DESIGN 为准？ | 全部 Spec | 以 TECH-DESIGN 为准，更新 SPEC-001 |
| B2 | Skill 模型以 SPEC-002 还是 TECH-DESIGN 为准？ | SPEC-002/003/004/005 | 以 TECH-DESIGN 为准，更新 SPEC-002 |
| B3 | Category 枚举统一为 6 个还是 11 个？ | SPEC-002/004/005 | 以 TECH-DESIGN 的 11 个为准 |
| B4 | Embedding 放在 SkillVersion 上还是独立 SkillEmbedding 表？ | SPEC-003/004 | 建议放 SkillVersion 上（TECH-DESIGN 方案） |
| B5 | 审核状态枚举 VersionStatus vs ReviewStatus 统一 | SPEC-003/005 | 以 TECH-DESIGN 的 ReviewStatus (7 态) 为准 |
| B6 | REVISION_REQUESTED 后的流程是什么？ | SPEC-005 | 必须定义：新版本 or 原版本修改 |
| B7 | Refresh Token 做不做？ | SPEC-001 | 明确选择并统一 SPEC-001 和 TECH-DESIGN |
| B8 | ZIP 炸弹防护的具体方案 | SPEC-003 | 必须在 Spec 中明确防护策略 |
| B9 | API 路径参数统一用 `slug` 还是 `id`/`skillId` | SPEC-002/003 | 统一为 `slug`（TECH-DESIGN 风格） |
| B10 | BGE-M3 服务的 API 协议和调用规范 | SPEC-004 | 需要补充接口定义 |

---

## 四、建议但不阻塞的改进

### 工程实践

1. **统一错误响应格式**: 所有 Spec 的错误码只有 HTTP Status，建议统一为：
   ```json
   { "code": "SLUG_CONFLICT", "message": "Skill slug already exists", "statusCode": 409 }
   ```

2. **补充 Rate Limiting 策略**: 登录接口、搜索接口、下载接口都应该有限流。建议使用 `@nestjs/throttler`。

3. **Redis 缓存策略缺失**: 以下场景建议缓存：
   - 热门 Skill 列表（TTL 5min）
   - 用户角色/部门信息（TTL 1h，登录时刷新）
   - 搜索热词联想（TTL 10min）

4. **数据库索引建议**: SPEC-002/003 的 Prisma Schema 没有定义索引，实际需要：
   ```prisma
   @@index([category])
   @@index([visibility])
   @@index([ownerId])
   @@index([status])       // Skill 和 SkillVersion
   @@index([createdAt])    // 排序
   ```

5. **审计日志模型缺失**: SPEC-001 提到"记录登录成功、登录失败"的审计日志，但没有对应的数据模型。TECH-DESIGN 中有 `AuditLog` 模型，应该在 Spec 中引用。

### 产品体验

6. **Skill 详情页的版本 Diff 功能**: SPEC-005 提到 `CodeDiffViewer` 组件，但如何获取两个版本的 diff？需要后端 API 支持（`GET /api/v1/skills/:slug/versions/:v1/diff/:v2`）。

7. **搜索结果高亮**: SPEC-004 没有说明搜索结果中是否返回匹配片段的高亮。语义搜索天然不支持关键词高亮——需要后处理或者混合关键词搜索结果。

8. **批量 Star/Tag 操作**: 作为企业场景，管理员可能需要批量操作（置顶、打标、下架）。

### 安全加固

9. **CORS 配置**: 未在任何 Spec 中提及。企业内网也需要配置允许的 Origin。

10. **文件类型白名单**: SPEC-003 说"必须是 .zip 格式"，建议同时校验 Magic Bytes（ZIP 文件头 `PK\x03\x04`），不能仅靠扩展名。

11. **SQL 注入防护**: SPEC-004 使用 Raw SQL 做向量搜索时，必须使用参数化查询，严禁字符串拼接。建议在 Spec 中显式声明。

---

## 五、建议的开发顺序

```
Week 1: 统一数据模型 → Prisma Schema 定稿 → DB Migration
  └── 解决所有 BLOCKER 问题
  
Week 2: SPEC-001 认证模块（LDAP + JWT + Guards）
  └── 这是所有模块的前置依赖
  
Week 3: SPEC-002 Skill CRUD + SPEC-003 版本管理 & MinIO 集成
  └── 可以并行开发，共用 Skill 模型
  
Week 4: SPEC-005 审核工作流引擎
  └── 依赖 SPEC-003 的版本上传流程
  
Week 5: SPEC-004 向量搜索
  └── 依赖 Skill 数据已存在 + BGE-M3 服务部署就绪
```

---

## 六、总结

| Spec | 评价 | 关键问题数 |
|------|------|-----------|
| SPEC-001 | NEEDS_REVISION | 模型不一致 + Refresh Token 矛盾 + LDAP 降级缺失 |
| SPEC-002 | NEEDS_REVISION | 模型不一致 + Category 枚举冲突 + 分页/搜索细节缺失 |
| SPEC-003 | PASS_WITH_COMMENTS | ZIP 炸弹防护需补充 + 一对多文件语义需澄清 |
| SPEC-004 | PASS_WITH_COMMENTS | Prisma + pgvector 限制需显式声明 + BGE-M3 协议缺失 |
| SPEC-005 | NEEDS_REVISION | 状态机不完整 + REVISION_REQUESTED 后续流程未定义 |
| **整体** | **NEEDS_REVISION** | **10 个 Blocker 需优先解决** |

核心问题是 **Spec 与 TECH-DESIGN 之间的模型不一致**。建议 PM 先主导一轮模型统一（以 TECH-DESIGN 为权威来源），更新 5 份 Spec 中的 Prisma Schema，然后再进入开发。否则开发过程中会频繁因为字段名、枚举值、关联关系的不一致而返工。
