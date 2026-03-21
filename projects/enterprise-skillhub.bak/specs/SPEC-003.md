# SPEC-003: 版本管理 & 文件存储

> 状态: approved
> 优先级: P0
> 负责人: PO Agent
> 审核人: PM
> 关联 Task: TASK-003

## 1. 概述
Skill 是有生命周期的代码包/配置文件。本模块管理 Skill 的具体版本迭代（SemVer 规范），并负责处理实际的物理文件存储。文件统一存储在 MinIO 对象存储集群中，业务数据库记录文件的元数据（大小、哈希、存储路径）。同时包含针对 `SKILL.md` 等配置文件的元数据解析。

## 2. 数据模型（Prisma Schema）
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
  path          String                      // 文件相对路径（ZIP 解压后的路径）
  size          Int                         // 字节
  sha256        String
  storageKey    String                      // MinIO object key
  createdAt     DateTime  @default(now())

  @@index([versionId])
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
```

> **注意**：
> - 不使用 `VersionStatus` 枚举。版本的审核状态通过 `reviewStatus: ReviewStatus`（7 态）控制。
> - `SkillFile` 使用 `path`（文件在 ZIP 内的相对路径）替代 `filename`；移除 `uploadedBy`、`uploadedAt`、`mimeType`；`createdAt` 由数据库自动管理。
> - `embedding` 字段直接存储在 `SkillVersion` 上，无需独立的 `SkillEmbedding` 模型。

## 3. API 接口（端点 + Method + 请求体 + 响应体 + 错误码 + 权限要求）

### 3.0 通用规范
- **路径参数**：Skill 资源统一使用 `slug`（非 `skillId`）
- **分页默认值**：`page=1, limit=20, maxLimit=100`

### 3.1 发布新版本 (POST `/api/v1/skills/:slug/versions`)
- **请求类型**: `multipart/form-data`
- **请求体**: `file` (ZIP 文件), `version` (版本号), `changelog` (更新说明)
- **响应体**: `{ "versionId", "reviewStatus": "PENDING_AUTO", "files": [{ "path", "size", "sha256" }] }`
- **业务逻辑**: 一次上传 ZIP 文件 → 后端解压为多个 `SkillFile` 记录（每个解压出的文件对应一条记录）
- **错误码**:
  - `400 Bad Request` — 非 ZIP 文件 / 版本号不符合 SemVer / 版本冲突 / ZIP 炸弹检测触发
  - `413 Payload Too Large` — ZIP 文件超过 50MB
- **权限要求**: Skill 的 Owner（`PUBLISHER` 角色及以上）

### 3.2 下载 Skill (GET `/api/v1/skills/:slug/versions/:version/download`)
- **响应**: 返回文件流（重定向到 MinIO 预签名 URL，有效期 5 分钟）
- **业务逻辑**: 仅 `reviewStatus=APPROVED` 的版本可下载；触发 `Skill.downloadCount + 1` 统计
- **权限要求**: 根据对应 Skill 的可见性规则判定

### 3.3 获取版本列表 (GET `/api/v1/skills/:slug/versions`)
- **响应体**: `[{ "version", "createdAt", "changelog", "reviewStatus", "tag", "files": [...] }]`
- **权限要求**: 根据对应 Skill 的可见性规则判定

## 4. 业务规则（约束条件、边界情况、状态机）

### 4.1 ZIP 上传 & 解压流程
1. 用户上传单个 ZIP 文件
2. 后端先进行 ZIP 炸弹防护检查（见 §4.3）
3. 检查通过后，**流式解压** ZIP 为多个文件
4. 每个文件创建一条 `SkillFile` 记录，`path` 为文件在 ZIP 内的相对路径
5. 每个文件上传到 MinIO，`storageKey` 格式: `skills/{slug}/{version}/{path}`
6. 解析根目录下的 `SKILL.md` frontmatter，存入 `parsedMeta`
7. 若 `SKILL.md` 不存在或解析失败，返回 `400`，不创建版本记录

### 4.2 SemVer 规范 & 排序
- 版本号必须符合 SemVer 2.0.0 格式: `major.minor.patch`（如 `1.0.0`，`2.3.1`）
- 数据库存储 `version` 字符串，同时提取 `major`、`minor`、`patch` 整数用于排序
- 排序时按 `major DESC, minor DESC, patch DESC`
- 不接受前缀 `v`（如 `v1.0.0` → 400 Bad Request）

### 4.3 ZIP 炸弹防护
上传 ZIP 文件时，必须执行以下安全检查：
| 检查项 | 阈值 | 动作 |
|--------|------|------|
| Uncompressed size | < 200 MB | 超出则拒绝 |
| 文件数量 | < 1000 | 超出则拒绝 |
| 解压方式 | 流式解压 | 禁止一次性全部解压到内存 |
| 解压超时 | 30 秒 | 超时则中断并拒绝 |
| Magic Bytes | ZIP 文件头校验 | `PK\x03\x04` 或 `PK\x05\x06` |

### 4.4 不可变原则
一旦一个版本被创建并 `reviewStatus=APPROVED`，该版本的物理文件不可修改。如需修复，必须发布新的 version。

### 4.5 ARCHIVED 状态
- `ARCHIVED` 不再推荐使用，但仍可下载
- **仅 ADMIN 手动触发** ARCHIVED 操作，非自动流转
- ARCHIVED 版本不会出现在默认版本列表中（需 `includeArchived=true`）

### 4.6 存储策略
- `storageKey` 按约定格式生成: `skills/{slug}/{version}/{path}`
- 避免文件名冲突

## 5. 前端组件（页面 + 组件 + 交互流程）
- **组件**:
  - `VersionUploader`: 拖拽上传区域，集成进度条。表单包含 Version（自动自增建议）和 Changelog
  - `VersionHistoryTable`: 在 Skill 详情页展示所有历史版本，包含版本号、发布时间、日志、reviewStatus 状态徽章、下载按钮
  - `FileListView`: 展示单个版本内解压出的所有文件列表（path + size）
- **交互流程**: 点击"发布新版本" → 选择 ZIP 文件 → 填写版本号 → 提交 → 显示"等待自动扫描"状态

## 6. 安全要求（认证、权限矩阵、数据脱敏、审计日志）
- **存储隔离**: 前端不能直接操作 MinIO。所有上传必须通过后端进行中转和校验，严禁开放前台直传（避免恶意文件上传绕过后端扫描）
- **下载越权防御**: 即使知道了 MinIO 的对象 URL，也无法直接下载。所有下载必须经过 `/download` 接口，后端鉴定可见性权限后，生成临时的 MinIO Pre-signed URL（5 分钟有效）返回给客户端
- **ZIP 安全**: 参见 §4.3 ZIP 炸弹防护

## 7. 验收标准
- [ ] 能上传符合要求的 ZIP 包，后端解压为多个 `SkillFile` 记录，并成功解析出 `SKILL.md` 中的元数据存入 `parsedMeta`
- [ ] 对于不符合 SemVer（如 `v1`、`latest`）的版本号，后端抛出 `400` 错误
- [ ] 多次发布同一版本号（如重复发布 `1.0.0`），数据库级别抛出唯一性冲突并转化为友好的前端提示
- [ ] 只有 `reviewStatus=APPROVED` 的版本可被下载，下载会触发 `downloadCount + 1`
- [ ] ZIP 解压后 uncompressed size > 200MB 时返回 `400`
- [ ] ZIP 内文件数 > 1000 时返回 `400`
- [ ] ZIP Magic Bytes 不匹配时返回 `400`
- [ ] 仅 ADMIN 可将版本标记为 ARCHIVED

## 8. 变更记录
- 初始版本 draft。
- 修正 SkillVersion 和 SkillFile 为一对多关系，并统一 authorId 为 ownerId。
- **2026-03-19 approved**: 最终模型统一 — SkillVersion 完全对齐 TECH-DESIGN.md（`reviewStatus: ReviewStatus` 7 态替换 `VersionStatus`，补 `parsedMeta`、`tag`、`createdById`、`softDeletedAt`、`embedding Float[]? @db.Vector(1024)`）；SkillFile 对齐（加 `path`，去 `uploadedBy/uploadedAt/mimeType`）；补充 ZIP 炸弹防护、SemVer 排序整数存储、ARCHIVED 仅 ADMIN 触发、API 路径用 slug、一次上传 ZIP 解压为多个 SkillFile。
