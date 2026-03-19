# Enterprise SkillHub - Sprint 6-8 User Stories (模板系统 & 增强功能)

## 模块 1: 命名空间管理 (Namespace Management)

### US-001: 创建命名空间
**作为** 系统管理员或拥有权限的用户，**我想** 创建一个新的命名空间（Namespace），**以便** 团队可以隔离并管理自己的模板资源。
**验收标准：**
- [ ] AC-1: 提供 `POST /api/v1/namespaces` 接口和对应的 CLI 命令 `skillhub namespace create <name>`。
- [ ] AC-2: 命名空间名称必须全局唯一，重复时返回明确错误。
- [ ] AC-3: 创建者默认成为该命名空间的 `ADMIN` 角色。
**优先级：** P0
**估算：** S
**Sprint 建议：** Sprint 6
**关联 AC：** SPEC-006 AC-1

### US-002: 查询命名空间列表
**作为** 开发者，**我想** 查看我拥有访问权限的命名空间列表，**以便** 知道我可以把模板发布到哪里或从哪里查找团队模板。
**验收标准：**
- [ ] AC-1: 提供 `GET /api/v1/namespaces` 接口，仅返回当前用户属于 `ADMIN` 或 `MEMBER` 的命名空间，或者公开的命名空间。
**优先级：** P0
**估算：** S
**Sprint 建议：** Sprint 6
**关联 AC：** SPEC-006 AC-2

### US-003: 管理命名空间成员
**作为** 命名空间管理员，**我想** 添加或移除命名空间成员，并分配角色，**以便** 控制谁可以在本命名空间下发布模板。
**验收标准：**
- [ ] AC-1: 提供 `POST /api/v1/namespaces/:id/members` 接口，支持分配 `ADMIN` 或 `MEMBER` 角色。
- [ ] AC-2: 只有当前命名空间的 `ADMIN` 有权执行此操作。
- [ ] AC-3: 在命名空间下发布模板时（`POST /api/v1/templates`），后端拦截并校验当前用户是否为该命名空间成员。
**优先级：** P0
**估算：** M
**Sprint 建议：** Sprint 6
**关联 AC：** SPEC-006 AC-2

## 模块 2: 模板 CRUD + 版本管理

### US-004: 创建和发布模板版本 (ZIP 上传)
**作为** 模板开发者，**我想** 通过 CLI 或 Web 界面上传 ZIP 格式的脚手架文件并发布新版本，**以便** 与团队共享我的项目模板。
**验收标准：**
- [ ] AC-1: 首次上传时，自动在对应的命名空间下创建 Template 记录。
- [ ] AC-2: 解析上传的 ZIP 包中的 `manifest`（如 `template.json`），创建 TemplateVersion 记录。
- [ ] AC-3: ZIP 文件成功上传并存储到 MinIO `skillhub-templates` Bucket。
- [ ] AC-4: 发布后状态进入 `PENDING_REVIEW`，复用现有的审核工作流。
**优先级：** P0
**估算：** M
**Sprint 建议：** Sprint 6
**关联 AC：** SPEC-006 AC-1, AC-8

### US-005: 模板列表与搜索
**作为** 开发者，**我想** 搜索和浏览已发布的模板列表，**以便** 找到适合我当前开发任务的项目起点。
**验收标准：**
- [ ] AC-1: CLI 提供 `skillhub template list` 和 `skillhub template search <query>` 命令。
- [ ] AC-2: Web 端提供模板列表页，支持按命名空间、标签（Tag）、AI 工具适配（如 `--ai claude`）进行过滤。
- [ ] AC-3: 支持按热门（默认, `weeklyDownloads`）、最新、名称排序。
**优先级：** P0
**估算：** M
**Sprint 建议：** Sprint 6
**关联 AC：** SPEC-006 AC-11

### US-006: 模板详情查看
**作为** 开发者，**我想** 查看某个模板的详细信息，**以便** 了解它的功能、历史版本和包含的 Skill 依赖。
**验收标准：**
- [ ] AC-1: 提供 `GET /api/v1/templates/@:namespace/:name` 接口和 CLI `skillhub template info` 命令。
- [ ] AC-2: 返回内容包含模板描述、版本历史列表、以及当前版本的 Skill 依赖清单。
**优先级：** P0
**估算：** S
**Sprint 建议：** Sprint 6
**关联 AC：** SPEC-006 3.2节

## 模块 3: CLI 初始化引擎

### US-007: 执行模板初始化 (skillhub init)
**作为** 开发者，**我想** 运行 `skillhub init` 命令拉取模板，**以便** 在本地一键生成包含脚手架和配置的项目骨架。
**验收标准：**
- [ ] AC-1: 执行 `skillhub init --template @namespace/name`，成功从远端下载 ZIP 并解压到本地指定目录。
- [ ] AC-2: 在本地生成 `.skillhub/template.lock` 文件，记录当前模板及依赖 Skill 的具体版本。
**优先级：** P0
**估算：** L
**Sprint 建议：** Sprint 6
**关联 AC：** SPEC-006 AC-3

### US-008: AI 工具目录适配
**作为** 开发者，**我想** 在初始化时指定 AI 工具（如 Claude/Cursor），**以便** 脚手架自动生成匹配该 AI 工具的特定配置目录。
**验收标准：**
- [ ] AC-1: 传入 `--ai claude` 时，生成 `.claude/rules/`, `.claude/commands/`, 及 `.claude/skills/` 目录结构。
- [ ] AC-2: 传入 `--ai cursor` 时，生成 `.cursor/rules/` 和根目录 `.cursorrules` 文件。
- [ ] AC-3: 未指定时（Fallback），生成通用 `.ai/` 目录。
**优先级：** P0
**估算：** M
**Sprint 建议：** Sprint 6
**关联 AC：** SPEC-006 AC-4, AC-5

### US-009: 模板变量替换与条件文件
**作为** 模板开发者，**我想** 在模板中定义变量和条件，**以便** 用户初始化时可以动态生成定制化的项目名称和配置。
**验收标准：**
- [ ] AC-1: CLI 在下载后，解析 `manifest` 中的变量定义，提示用户输入（如 `projectName`）。
- [ ] AC-2: 根据用户输入，使用 Handlebars/EJS 正确替换目标文件（如 `pom.xml`、`package.json`）中的变量。
- [ ] AC-3: 根据 `manifest` 中的 `features` 定义（如 `docker: true`），决定是否在最终输出中保留特定文件（如 `Dockerfile`）。
**优先级：** P0
**估算：** M
**Sprint 建议：** Sprint 6
**关联 AC：** SPEC-006 AC-6

### US-010: Skill 依赖注入
**作为** 开发者，**我想** 模板初始化时自动拉取其依赖的 Skill，**以便** 开发环境直接具备所需的 AI 能力。
**验收标准：**
- [ ] AC-1: CLI 解析模板的 Skill 依赖列表，调用 SkillHub 获取对应的压缩包。
- [ ] AC-2: 将下载的 Skill 正确解压并放置到对应 AI 工具的 skills 目录下（例如 `.claude/skills/`）。
**优先级：** P0
**估算：** M
**Sprint 建议：** Sprint 6
**关联 AC：** SPEC-006 AC-7

### US-011: Post-init 钩子执行
**作为** 开发者，**我想** 模板初始化完成后自动执行特定的脚本（如 npm install），**以便** 彻底准备好开发环境。
**验收标准：**
- [ ] AC-1: CLI 解析 `manifest` 中的 `postInit` 定义。
- [ ] AC-2: 在文件生成完毕后，在目标目录下成功执行相应的 shell 命令。
**优先级：** P1
**估算：** S
**Sprint 建议：** Sprint 6
**关联 AC：** SPEC-006 5节

## 模块 4: 模板更新机制

### US-012: 模板版本更新检查与执行
**作为** 开发者，**我想** 检查并在项目中更新模板到最新版本，**以便** 获取团队最新的脚手架结构和 Skill。
**验收标准：**
- [ ] AC-1: 提供 `skillhub template outdated` 命令，对比本地 `.skillhub/template.lock` 与远端最新版本。
- [ ] AC-2: 提供 `skillhub template update` 命令，拉取新版本。
- [ ] AC-3: 只更新未被用户修改过的脚手架文件（通过对比本地文件 hash）。
- [ ] AC-4: 对于用户已修改的文件产生冲突时，在 `.skillhub/conflicts/` 下生成冲突文件供手动合并。
**优先级：** P0
**估算：** L
**Sprint 建议：** Sprint 7
**关联 AC：** SPEC-006 AC-12

## 模块 5: Git 仓库集成

### US-013: Git 凭证管理
**作为** 模板/Skill 开发者，**我想** 在系统中配置 Git 凭证（SSH Key/Token），**以便** 系统有权限从内部 Git 仓库拉取代码作为模板或 Skill 来源。
**验收标准：**
- [ ] AC-1: 提供 `POST /api/v1/git-credentials` 及对应的 CLI 命令。
- [ ] AC-2: 凭证（Token/Password/SSH Key）在数据库中采用 AES-256-GCM 加密存储，GET 接口不返回明文。
- [ ] AC-3: 提供 `test` 命令/接口验证凭证对指定 Git URL 的连通性。
**优先级：** P0
**估算：** M
**Sprint 建议：** Sprint 7
**关联 AC：** SPEC-006 AC-15, AC-17, AC-19

### US-014: 从 Git 仓库发布模板和 Skill 版本
**作为** 开发者，**我想** 提供一个 Git 仓库 URL 和 Tag 来发布模板或 Skill 版本，**以便** 直接利用已有的代码仓库进行版本管理。
**验收标准：**
- [ ] AC-1: 支持 `skillhub template publish --git <url> --ref <tag>` 和 `skillhub skill publish --git <url>`。
- [ ] AC-2: 服务端收到请求后，使用配置的 `GitCredential` 进行 clone（depth=1）。
- [ ] AC-3: 能够正确定位并打包整个仓库或 `subPath` 指定的子目录为 ZIP，存入 MinIO。
- [ ] AC-4: clone 操作受 60s 超时和 URL 白名单（SSRF防护）限制。
**优先级：** P0
**估算：** L
**Sprint 建议：** Sprint 7
**关联 AC：** SPEC-006 AC-14, AC-16, AC-19; SPEC-002 AC (Git Skill 发布)

### US-015: Git Webhook 自动同步发布
**作为** 开发者，**我想** 配置 Git Webhook，**以便** 当我在代码仓库打新 Tag 时，SkillHub 自动创建并提审新版本的模板/Skill。
**验收标准：**
- [ ] AC-1: 提供 `POST /api/v1/webhooks/git` endpoint 处理 Webhook payload。
- [ ] AC-2: 验证 Webhook secret 签名合法性。
- [ ] AC-3: 收到 Push Tag 事件后，自动触发基于对应 Git 凭证的异步克隆、打包和发布流程。
**优先级：** P1
**估算：** M
**Sprint 建议：** Sprint 7
**关联 AC：** SPEC-006 AC-18

## 模块 6: Skill 依赖同步

### US-016: Skill 依赖语义化版本自动同步
**作为** 模板维护者，**我想** 模板依赖的 Skill 在 Minor/Patch 更新时自动同步，**以便** 保证基于模板创建的项目始终使用安全的、修复过 Bug 的 Skill。
**验收标准：**
- [ ] AC-1: 服务端解析模板声明的 SemVer 范围（如 `^1.2.0`）。
- [ ] AC-2: 当 Skill 发布（如 `1.2.0` -> `1.3.0`）时，系统扫描引用它的模板，自动更新数据库中关联的解析版本（`resolvedVersion`）。
- [ ] AC-3: 自动更新不改变模板本身的版本号，仅影响下一次 `init` 或 `update` 拉取的 Skill 包。
**优先级：** P0
**估算：** M
**Sprint 建议：** Sprint 7
**关联 AC：** SPEC-006 AC-14

### US-017: Skill Major 变更通知
**作为** 模板维护者，**我想** 在依赖的 Skill 发生破坏性更新（Major）时收到通知，**以便** 我可以手动评估和升级模板。
**验收标准：**
- [ ] AC-1: 当 Skill 发布 Major 更新（如 `1.2.0` -> `2.0.0`），并且不在模板声明的范围内时，不自动同步。
- [ ] AC-2: 系统通过站内信（可选飞书/企微 Webhook）通知模板的 Owner 和发布者。
**优先级：** P1
**估算：** S
**Sprint 建议：** Sprint 7
**关联 AC：** SPEC-006 AC-15

## 模块 7: 下载统计 + 用户追踪

### US-018: 记录资源下载日志与防刷
**作为** 产品运营，**我想** 记录每次 Skill 和模板的下载行为，**以便** 了解资源的使用情况和热度。
**验收标准：**
- [ ] AC-1: 用户执行 `init` 或拉取 Skill 时，写入一条 `DownloadLog` 记录，并增加 `downloadCount`。
- [ ] AC-2: 同一用户在 1 小时内对同一资源同一版本的重复下载只增加一次统计（Redis 去重）。
**优先级：** P1
**估算：** M
**Sprint 建议：** Sprint 8
**关联 AC：** SPEC-006 AC-20, AC-22; SPEC-002 AC (下载计数)

### US-019: 计算每周热门资源
**作为** 开发者，**我想** 看到热门的 Skill 和模板推荐，**以便** 发现对团队有价值的优质资产。
**验收标准：**
- [ ] AC-1: 定时任务定期计算过去 7 天的下载量，更新资源的 `weeklyDownloads` 字段。
- [ ] AC-2: 列表页默认按 `weeklyDownloads` 降序排列。
**优先级：** P1
**估算：** S
**Sprint 建议：** Sprint 8
**关联 AC：** SPEC-006 AC-20; SPEC-002 4.4节

### US-020: 管理员下载日志审计
**作为** 系统管理员，**我想** 查询系统内各个资源的下载明细和用户下载历史，**以便** 进行安全审计和利用率分析。
**验收标准：**
- [ ] AC-1: 提供 `GET /api/v1/admin/download-logs` 和 `GET /api/v1/stats/user-downloads` 接口。
- [ ] AC-2: 只有拥有 ADMIN 角色的用户可以访问全量日志接口。
- [ ] AC-3: 支持导出日志为 CSV 格式。
**优先级：** P1
**估算：** M
**Sprint 建议：** Sprint 8
**关联 AC：** SPEC-006 AC-21; SPEC-002 AC (下载日志)

## 模块 8: Web 前端

### US-021: 模板市场 Web 页面
**作为** 开发者，**我想** 在浏览器中查看和搜索模板，**以便** 直观地浏览可用资产。
**验收标准：**
- [ ] AC-1: 新增"模板"主导航 Tab。
- [ ] AC-2: 列表页以卡片形式展示模板，支持搜索、命名空间/AI工具筛选、排序切换。
- [ ] AC-3: 模板详情页展示描述、安装命令（一键复制）、包含的 Skill 依赖及版本历史。
**优先级：** P1
**估算：** M
**Sprint 建议：** Sprint 8
**关联 AC：** SPEC-006 3.7节

### US-022: Web 端上传发布模板
**作为** 模板开发者，**我想** 直接在网页上通过表单和上传 ZIP 的方式发布模板，**以便** 在不方便使用 CLI 时也能轻松操作。
**验收标准：**
- [ ] AC-1: 提供"发布模板"页面，支持选择目标命名空间。
- [ ] AC-2: 支持上传 ZIP，系统自动解析并预填 `manifest` 内容。
- [ ] AC-3: 提供包含 JSON Schema 校验的在线 `template.json` 编辑器。
- [ ] AC-4: 提交前自动校验依赖的 Skill 在 SkillHub 中是否存在。
**优先级：** P1
**估算：** M
**Sprint 建议：** Sprint 8
**关联 AC：** SPEC-006 AC-13

### US-023: 资源趋势看板与统计页面
**作为** 平台运营，**我想** 在管理后台查看系统使用统计的可视化图表，**以便** 汇报平台的落地成效。
**验收标准：**
- [ ] AC-1: 管理后台新增"使用统计"页面，展示总下载量、活跃用户数、热门资源 Top 10 看板。
- [ ] AC-2: 资源详情页展示近 30 天下载量趋势图。
- [ ] AC-3: 支持按时间范围、部门维度筛选数据。
**优先级：** P2
**估算：** L
**Sprint 建议：** Sprint 8
**关联 AC：** SPEC-006 3.7节; SPEC-002 5节
