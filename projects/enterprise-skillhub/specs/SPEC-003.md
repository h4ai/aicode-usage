# SPEC-003: 版本管理 & 文件存储

> 状态: review
> 优先级: P0
> 负责人: PO Agent
> 审核人: PM
> 关联 Task: TASK-003

## 1. 概述
Skill 是有生命周期的代码包/配置文件。本模块管理 Skill 的具体版本迭代（SemVer 规范），并负责处理实际的物理文件存储。文件统一存储在 MinIO 对象存储集群中，业务数据库记录文件的元数据（大小、哈希、存储路径）。同时包含针对 `SKILL.md` 等配置文件的元数据解析。

## 2. 数据模型（Prisma Schema）
```prisma
model SkillVersion {
  id             String   @id @default(uuid())
  skillId        String
  skill          Skill    @relation(fields: [skillId], references: [id])
  
  version        String   // 语义化版本，如 '1.0.0'
  changelog      String?  // 更新日志
  
  files          SkillFile[]
  
  
  status         VersionStatus @default(PENDING_REVIEW)
  downloads      Int      @default(0)
  
  createdAt      DateTime @default(now())
  
  @@unique([skillId, version]) // 同一 skill 下 version 必须唯一
}

model SkillFile {
  id           String   @id @default(uuid())
  storageKey   String   // MinIO 对象键，如 'skills/data-analyzer/v1.0.0/archive.zip'
  filename     String   // 原始文件名
  size         Int      // 文件大小 (bytes)
  sha256       String   // 文件内容哈希，防篡改和校验
  mimeType     String   @default("application/zip")
  
  versionId    String
  version      SkillVersion @relation(fields: [versionId], references: [id])

  uploadedBy   String
  uploadedAt   DateTime @default(now())
}

enum VersionStatus {
  PENDING_REVIEW // 等待审核
  APPROVED       // 审核通过（可下载）
  REJECTED       // 审核拒绝
  ARCHIVED       // 归档（不再推荐使用，但可下载）
}
```

## 3. API 接口（端点 + Method + 请求体 + 响应体 + 错误码 + 权限要求）

### 3.1 发布新版本 (POST `/api/v1/skills/:skillId/versions`)
- **请求类型**: `multipart/form-data`
- **请求体**: `file` (文件), `version` (版本号), `changelog` (更新说明)
- **响应体**: `{ "versionId", "status": "PENDING_REVIEW", "file": { "size", "sha256" } }`
- **错误码**: `400 Bad Request` (非 ZIP 文件/版本号不符合 SemVer/版本冲突)
- **权限要求**: Skill 的作者

### 3.2 下载 Skill (GET `/api/v1/skills/:skillId/versions/:version/download`)
- **响应**: 返回文件流 (通常重定向到 MinIO 预签名 URL)
- **业务逻辑**: 触发下载量 `downloads + 1` 统计。
- **权限要求**: 根据对应 Skill 的可见性规则判定

### 3.3 获取版本列表 (GET `/api/v1/skills/:skillId/versions`)
- **响应体**: `[{ "version", "createdAt", "changelog", "status", "downloads" }]`
- **权限要求**: 根据对应 Skill 的可见性规则判定

## 4. 业务规则（约束条件、边界情况、状态机）
1. **文件校验**: 上传的文件必须是 `.zip` 格式，大小限制默认 50MB。在后台计算 SHA-256 并持久化。
2. **元数据解析**: ZIP 上传后，系统会在内存中解压，寻找根目录下的 `SKILL.md`。解析其 Frontmatter (YAML/JSON格式)，验证必须字段（如定义的入口指令、适用模型等）。若解析失败，立刻返回 `400`，不创建版本记录。
3. **不可变原则**: 一旦一个版本被创建并处于 `APPROVED` 状态，该版本的物理文件不可修改。如需修复，必须发布新的 version。
4. **存储策略**: `storageKey` 按照约定格式生成：`skills/{slug}/{version}/{uuid}.zip`，避免文件名冲突。

## 5. 前端组件（页面 + 组件 + 交互流程）
- **组件**:
  - `VersionUploader`: 拖拽上传区域，集成进度条。表单包含 Version (自动自增建议) 和 Changelog。
  - `VersionHistoryTable`: 在 Skill 详情页展示所有历史版本，包含版本号、发布时间、日志、下载按钮。
- **交互流程**: 点击"发布新版本" -> 选择 ZIP 文件 -> 填写版本号 -> 提交 -> 显示审核中状态。

## 6. 安全要求（认证、权限矩阵、数据脱敏、审计日志）
- **存储隔离**: 前端不能直接操作 MinIO。所有上传必须通过后端进行中转和校验，严禁开放前台直传（避免恶意文件上传绕过后端扫描）。
- **下载越权防御**: 即使知道了 MinIO 的对象 URL，也无法直接下载。所有的下载必须经过 `/download` 接口，后端鉴定可见性权限后，生成临时的 MinIO Pre-signed URL (例如 5分钟有效) 返回给客户端。

## 7. 验收标准
- [ ] 能上传符合要求的 ZIP 包并成功解析出 `SKILL.md` 中的元数据。
- [ ] 对于不符合 SemVer (如 'v1', 'latest') 的版本号，后端抛出 `400` 错误。
- [ ] 多次发布同一版本号（如重复发布 '1.0.0'），数据库级别抛出唯一性冲突并转化为友好的前端提示。
- [ ] 只有拥有下载权限的用户调用下载接口，才能获得有效的重定向链接，并导致 `downloads` 计数 +1。

## 8. 变更记录
- 初始版本 draft。- 修正 SkillVersion 和 SkillFile 为一对多关系，并统一 authorId 为 ownerId。
