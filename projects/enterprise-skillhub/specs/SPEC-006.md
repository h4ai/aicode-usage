# SPEC-006: 项目初始化模板 (Project Template)

> 状态: draft
> 优先级: P1
> 负责人: PO Agent
> 审核人: PM

## 1. 概述
当前 SkillHub 支持单个 Skill 的上传/下载/搜索。为了让开发者在创建新项目时能一键注入完整的开发环境配置，新增“项目初始化模板”功能。模板是 Skill 的集合加上脚手架代码（包括特定于 AI 工具的目录结构，如 `.claude/`, `.cursor/`），并以类似 npm scope 的命名空间（如 `@team/template-name`）进行组织。通过 CLI 命令 `skillhub init` 一键生成项目骨架。

## 2. 数据模型（Prisma Schema）

```prisma
model Namespace {
  id          String   @id @default(uuid())
  name        String   @unique // 例如 'backend-team'
  description String?
  ownerId     String
  owner       User     @relation("NamespaceOwner", fields: [ownerId], references: [id])
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  members     NamespaceMember[]
  templates   Template[]

  @@index([name])
}

model NamespaceMember {
  id          String    @id @default(uuid())
  namespaceId String
  userId      String
  role        NamespaceRole @default(MEMBER) // ADMIN, MEMBER
  createdAt   DateTime  @default(now())

  namespace   Namespace @relation(fields: [namespaceId], references: [id], onDelete: Cascade)
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([namespaceId, userId])
}

enum NamespaceRole {
  ADMIN
  MEMBER
}

model Template {
  id          String    @id @default(uuid())
  namespaceId String
  name        String    // 例如 'java-springboot'
  description String?
  authorId    String
  isPublic    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  namespace   Namespace @relation(fields: [namespaceId], references: [id])
  author      User      @relation("TemplateAuthor", fields: [authorId], references: [id])
  versions    TemplateVersion[]

  @@unique([namespaceId, name])
  @@index([namespaceId])
}

model TemplateVersion {
  id              String   @id @default(uuid())
  templateId      String
  version         String   // 遵循 SemVer
  manifest        Json     // 模板清单，包含组合规则、变量声明、AI配置等
  fileKey         String   // MinIO 对象存储的 key，指向脚手架包（zip/tar.gz）
  status          TemplateStatus @default(DRAFT)
  publishedAt     DateTime?
  createdAt       DateTime @default(now())

  template        Template @relation(fields: [templateId], references: [id], onDelete: Cascade)
  skills          TemplateSkill[]

  @@unique([templateId, version])
}

enum TemplateStatus {
  DRAFT
  PENDING_REVIEW
  PUBLISHED
  REJECTED
  DEPRECATED
}

model TemplateSkill {
  id                String   @id @default(uuid())
  templateVersionId String
  skillName         String   // 被依赖的 Skill 名称
  versionRange      String   // 例如 '^1.2.0'
  
  templateVersion   TemplateVersion @relation(fields: [templateVersionId], references: [id], onDelete: Cascade)

  @@unique([templateVersionId, skillName])
}

model TemplateSkillLock {
  id                String   @id @default(uuid())
  templateVersionId String
  skillName         String
  declaredRange     String   // "^1.2.0"
  resolvedVersion   String   // "1.3.2" (当前实际解析版本)
  updatedAt         DateTime @updatedAt

  templateVersion   TemplateVersion @relation(fields: [templateVersionId], references: [id])
  @@unique([templateVersionId, skillName])
}
```

## 3. API 设计

### 3.1 命名空间管理 API
*   **POST** `/api/v1/namespaces`
    *   创建命名空间，默认创建者为 ADMIN。
*   **GET** `/api/v1/namespaces`
    *   列出当前用户有权访问的命名空间。
*   **POST** `/api/v1/namespaces/:id/members`
    *   添加成员并分配角色。

### 3.2 模板 CRUD API
*   **POST** `/api/v1/templates`
    *   在指定命名空间下创建模板。
*   **GET** `/api/v1/templates`
    *   分页、过滤查询模板（支持按命名空间、关键词搜索）。
    *   增加 `?namespace=xxx&tag=xxx&ai=claude` 过滤参数。
*   **GET** `/api/v1/templates/@:namespace/:name`
    *   获取模板详情（含版本列表、Skill 依赖）。
*   **POST** `/api/v1/templates/:id/versions`
    *   上传新版本的模板（包含 `manifest` 和脚手架文件）。同时支持 CLI 和 Web 上传。
*   **GET** `/api/v1/templates/:id/versions/:version`
    *   获取特定版本模板的详细信息（清单与下载链接）。
*   **POST** `/api/v1/templates/:id/versions/:version/publish`
    *   提交版本发布申请（触发审核流）。

### 3.3 模板初始化 API（核心）
*   **GET** `/api/v1/templates/resolve?name=@team/template-name&version=1.0.0`
    *   解析并返回包含模板元数据、脚手架下载 URL 及所有依赖 Skill 的确切版本和下载链接。
*   **GET** `/api/v1/templates/:id/versions/:v/dependencies`
    *   查看已解析的依赖版本。
*   **POST** `/api/v1/templates/:id/versions/:v/dependencies/resolve`
    *   手动触发依赖重新解析。

### 3.4 CLI 命令设计
*   `skillhub namespace create <name>`
*   `skillhub template init <@namespace/template-name> [--ai <tool>] [--dir <path>]`
    *   **核心命令**: 触发初始化，拉取模板与依赖。
*   `skillhub template publish`
    *   根据目录下的 `template.json` 打包并上传新版本。
*   `skillhub template search <query> [--tag <tag>] [--ai <tool>]`
    *   搜索模板（关键词+标签）。例如：`skillhub template search "java springboot" [--tag backend] [--ai claude]`
*   `skillhub template list [--namespace <namespace>] [--page <page>] [--limit <limit>]`
    *   列出所有可用模板（支持分页）。
*   `skillhub template info <@namespace/template-name>`
    *   查看模板详情（含版本历史、依赖 Skill 列表）。
*   `skillhub template update [--version <version>] [--dry-run]`
    *   在已初始化的项目中更新模板到指定或最新版本。`--dry-run` 更新时展示 diff 预览（哪些文件会变更），需用户确认。
*   `skillhub template outdated`
    *   检查模板是否有新版本，也可查看哪些依赖有 major 更新可用。

### 3.5 Web 前端模板页面
*   **模板导航**: 网页端新增"模板"Tab，与"Skills"并列。
*   **模板列表页**: 卡片展示，支持按命名空间、语言、AI 工具筛选。
*   **模板详情页**: 展示描述、版本历史、依赖 Skill 列表、安装命令、下载量。支持一键复制安装命令：`skillhub init --template @xxx/yyy --ai claude`。
*   **Web 上传流程**: 
    *   支持网页端上传模板：选择命名空间 → 填写元数据 → 上传 ZIP → 自动解析 manifest → 提交审核。
    *   上传页面提供 `template.json` 的在线编辑器（支持 JSON Schema 校验）。
    *   上传时自动校验依赖的 Skill 是否存在于 SkillHub 中。

## 4. 业务逻辑

### 4.1 模板组合规则
模板的核心由两部分组成：
1.  **脚手架包 (Scaffold Package)**: 存储在 MinIO，包含项目的基础文件结构、代码模板（如 `src/`, `pom.xml`, `Dockerfile`）。
2.  **Manifest (清单)**: 定义了该模板依赖的 Skill 列表、需要进行变量替换的文件模式，以及针对不同 AI 工具的配置规则。

### 4.2 AI 工具适配逻辑
根据用户在 CLI 参数传入的 AI 工具（例如 `--ai claude` 或 `--ai cursor`），在本地执行 `init` 逻辑时，动态创建特定的隐藏目录并复制通用配置：
*   **Claude Code**: 生成 `.claude/rules/`, `.claude/commands/`, 并将依赖的 Agent Skills 放入 `.claude/skills/`，生成 `CLAUDE.md`。
*   **CodeBuddy**: 生成 `.codebuddy/rules.yaml`, `.codebuddy/agents/` 目录结构。
*   **Cursor**: 生成 `.cursor/rules/`, 以及项目根目录的 `.cursorrules` 文件。
*   **Windsurf**: 生成 `.windsurf/rules/`, 及 `.windsurfrules`。
*   **Fallback (通用)**: 若未指定，则生成通用的 `.ai/` 目录存放规则与技能。

### 4.3 命名空间权限
*   只有拥有 `PUBLISHER` 角色且在该命名空间内是 `ADMIN` 或 `MEMBER` 的用户才能在 `@team` 下发布模板。
*   命名空间的 `ADMIN` 可以管理成员。

### 4.4 模板继承/组合
*   允许通过 Manifest 中的 `extends` 字段引用另一个模板作为基础（Base Template）。
*   CLI 工具在拉取时，递归合并基础模板和当前模板的文件结构，遇到同名文件时，当前团队模板覆盖基础模板。

### 4.5 模板更新逻辑
*   项目初始化时在本地生成 `.skillhub/template.lock` 文件，记录当前使用的模板名、版本、Skill 依赖版本。
*   `skillhub template update` 命令读取 lock 文件，对比远端最新版本，生成文件变更 diff。
*   **更新策略**:
    *   脚手架文件：只更新未被用户修改过的文件（通过 hash 对比）。
    *   Skill 文件：始终更新到符合 SemVer 范围的最新版。
    *   用户修改过的文件：生成 `.skillhub/conflicts/` 冲突文件供手动合并。

### 4.6 Skill 依赖更新策略
**策略：语义化版本范围自动同步（类似 npm）**

模板中的依赖声明示例：
```json
{
  "skills": {
    "code-review": "^1.2.0",      // 自动同步 1.x.x（minor+patch）
    "deploy-helper": "~2.1.0",    // 自动同步 2.1.x（patch only）
    "security-scan": "3.0.0"      // 锁定版本，不自动同步
  }
}
```

服务端逻辑：
*   当 Skill 发布新版本时，系统扫描所有引用该 Skill 的 Template。
*   如果新版本在 SemVer 范围内（如 `^1.2.0` 匹配 `1.3.0`）→ **自动更新**模板的 resolved 版本。
*   如果新版本是 major 变更（如 `^1.2.0` 不匹配 `2.0.0`）→ **通知模板作者**，不自动更新。
*   通知方式：SkillHub 站内通知 + 可选飞书/企微 Webhook。
*   `skillhub template outdated` 命令可查看哪些依赖有 major 更新可用。

## 5. 脚手架引擎 (CLI 端实现)

*   **模板变量替换**:
    CLI 下载模板后，提示用户输入（或通过命令行参数传入） `projectName`, `packageName`, `port` 等变量。
    使用 Handlebars 或 EJS 语法处理匹配模式（如 `*.java`, `*.xml`, `*.md`）的文件内容替换。
*   **条件文件包含**:
    在 manifest 中定义 `features`（如 `docker: true`），CLI 据此决定是否保留包内的 `Dockerfile` 及相关目录。
*   **后置钩子 (Post-init Hooks)**:
    在文件生成完成后，CLI 依据 manifest 的 `postInit` 定义执行相关命令（例如 `npm install`, `git init`, `mvn clean install`）。

## 6. 与现有 Skill 系统的融合点

*   **依赖安装**: `skillhub init` 时，解析模板依赖的 Skill 列表，直接复用现有的 Skill 拉取 API，按 AI 工具适配逻辑组装到本地（如放入 `.claude/skills/`）。
*   **存储复用**: 模板的脚手架 zip 文件上传直接复用 MinIO 对象存储，Bucket 可隔离为 `skillhub-templates`。
*   **审核流程**: 模板版本的发布状态（`PENDING_REVIEW` -> `PUBLISHED`）完全复用 SPEC-005 的审核工作流与通知机制。
*   **搜索复用**: 模板的搜索接入 pgvector 或 PostgreSQL 的全文检索，与 SPEC-004 的搜索引擎保持一致（通过统一搜索接口或独立的 `/api/v1/templates/search` 但底层复用模块）。

## 7. 验收标准 (AC)

1.  **AC-1 (数据模型)**: 数据库 Schema 包含 `Namespace`, `Template`, `TemplateVersion`，且关联关系正确。
2.  **AC-2 (命名空间权限)**: 用户只能在自己所属且有权限的命名空间（例如 `@backend-team`）下成功发布模板，非成员发布返回 403 Forbidden。
3.  **AC-3 (CLI 初始化)**: 执行 `skillhub init --template @backend-team/java-springboot` 能够成功下载脚手架文件，并展开到本地目录。
4.  **AC-4 (AI 适配 - Claude)**: 使用 `--ai claude` 初始化时，本地生成 `.claude/rules/`, `.claude/commands/`, 及 `.claude/skills/` 目录结构。
5.  **AC-5 (AI 适配 - Cursor)**: 使用 `--ai cursor` 初始化时，本地生成 `.cursor/rules/` 和 `.cursorrules` 文件。
6.  **AC-6 (变量替换)**: CLI 提示输入 `projectName` 后，生成的 `pom.xml` 或 `package.json` 中的相应变量（如 `{{projectName}}`）被正确替换。
7.  **AC-7 (Skill 集成)**: 模板清单中包含的 Skill 依赖，在初始化完成后，相关的 Skill 文件已正确放置在 AI 工具对应的 `skills` 目录下。
8.  **AC-8 (审核流复用)**: 模板发布提交后，状态变更为 `PENDING_REVIEW`，审批通过后方可被其他用户搜索和 `init` 拉取。
9.  **AC-11 (模板列表查询)**: CLI `skillhub template list` 和网页端均能展示可用模板列表，支持按命名空间和关键词过滤。
10. **AC-12 (模板更新)**: 在已初始化项目中执行 `skillhub template update`，能正确更新未修改的文件，保留用户修改的文件，并在 `.skillhub/conflicts/` 中生成冲突文件。
11. **AC-13 (Web 上传)**: 通过网页端上传模板 ZIP 后，系统自动解析 manifest 并校验依赖 Skill 存在性，不存在则返回错误提示。
12. **AC-14 (Skill 自动同步)**: 当 Skill `code-review` 从 `1.2.0` 更新到 `1.3.0` 时，声明了 `^1.2.0` 的模板自动更新 resolvedVersion 为 `1.3.0`。
13. **AC-15 (Major 变更通知)**: 当 Skill `code-review` 发布 `2.0.0` 时，系统不自动更新，但向模板作者发送站内通知。

---
## 变更记录
* 0.1 | PM | 初始草案
* 0.2 | Tech Lead | 补充 CLI 设计与数据模型
* 0.3 | PO | 补充模板查询/更新/Web端/Skill同步 5 个场景