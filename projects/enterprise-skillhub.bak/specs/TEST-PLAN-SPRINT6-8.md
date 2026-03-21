# 测试计划: Sprint 6-8（模板系统 + Git 集成 + 统计）

> 依据：SPEC-006（项目初始化模板）+ SPEC-002（Skill 管理更新部分：Git 凭证/下载日志/统计/安全）
> 目标：覆盖命名空间、模板全链路、CLI 初始化与更新、Git 集成、依赖 SemVer 同步、统计审计与 Web 页面，并补齐安全/性能/兼容性方面的关键风险用例。

## 0. 测试策略概览

### 0.1 测试层级
- **单元测试（UT）**：
  - SemVer 匹配与解析（^/~ /精确版本），依赖解析/锁定逻辑
  - manifest 解析（variables/features/postInit/extends/ai 适配），文件 hash 计算与 diff
  - Git URL 校验（SSRF 规则、白名单、协议限制），Webhook 签名校验
- **集成测试（IT）**：
  - API：Namespace/Template/Version/Resolve/Dependencies/GitCredential/Stats/Admin
  - MinIO：ZIP 上传、下载链接可用性、对象 key 正确性
  - Redis：热门列表缓存（若模板侧引入同策略）、下载去重 1h
  - Git：clone/ref/subPath/凭证/超时 60s
- **端到端（E2E）**：
  - Web：模板列表/详情/上传/审核状态可见性（复用 SPEC-005 流程）
  - CLI：init/template update/outdated/search/info/git-credential 流程

### 0.2 环境与数据准备
- 用户与权限：
  - U1：PUBLISHER + Namespace A ADMIN
  - U2：PUBLISHER + Namespace A MEMBER
  - U3：PUBLISHER 非成员
  - U4：普通登录用户（非 PUBLISHER）
  - U5：平台 ADMIN（系统管理员）
- 命名空间：
  - nsA：backend-team（正常）
  - nsSystem：system（用于保留命名空间校验）
- 模板：
  - T1：@backend-team/java-springboot（ZIP 版本 v1.0.0、v1.1.0）
  - T2：@backend-team/java-springboot-pro（extends T1，覆盖同名文件）
  - T3：Git 来源模板（同上但 sourceType=GIT）
- Skills：
  - S1：code-review 版本 1.2.0、1.3.0、2.0.0
  - S2：deploy-helper 版本 2.1.0、2.1.5、2.2.0
  - S3：security-scan 版本 3.0.0、3.0.1

### 0.3 关键风险（优先验证）
1. **权限与越权（IDOR）**：非成员发布/查看私有资源、非 ADMIN 访问 admin API
2. **Git SSRF / 凭证泄漏**：内网地址、file://、ssh:// 等协议绕过；GET 返回明文/日志泄漏
3. **更新/冲突策略正确性**：hash 识别误判导致覆盖用户改动；conflicts 目录生成不全
4. **SemVer 自动同步一致性**：resolvedVersion 与 TemplateSkillLock 不一致；major 误自动更新
5. **下载去重与统计一致性**：downloadCount/weeklyDownloads 与 DownloadLog 不一致、刷榜绕过

---

## 1. 测试范围

### 1.1 功能测试
- 命名空间管理
- 模板 CRUD + 版本管理
- CLI 初始化引擎（5 种 AI 工具适配）
- 模板更新 + 冲突处理
- Git 仓库集成 + 凭证管理
- Skill 依赖 SemVer 同步
- 下载统计 + 用户追踪
- Web 前端模板页面

### 1.2 非功能测试
- 安全测试（Git 凭证加密、SSRF 防护、权限越权、SQL 注入）
- 性能测试（大模板下载、Git clone 超时、并发统计写入）
- 兼容性测试（5 种 AI 工具目录结构、跨平台路径/换行）

---

## 2. 测试用例

> 编号规则：TC-001 起连续编号；每条用例给出 1 个主关联 AC（必要时可写多个）。

### 命名空间（5）

### TC-001: 创建命名空间成功
- **模块**: 命名空间
- **优先级**: P0
- **前置条件**: U1 已登录
- **测试步骤**:
  1. 调用 `POST /api/v1/namespaces`，body：`{name:"backend-team", description:"..."}`
  2. 调用 `GET /api/v1/namespaces`
- **期望结果**:
  - 创建成功返回 201，Namespace.name 唯一
  - 创建者在该 namespace 中自动成为 ADMIN（成员表可见）
- **关联 AC**: SPEC-006 AC-1

### TC-002: 非成员发布模板返回 403
- **模块**: 命名空间
- **优先级**: P0
- **前置条件**: nsA 已存在；U3 非 nsA 成员；U3 具备 PUBLISHER
- **测试步骤**:
  1. U3 调用 `POST /api/v1/templates` 指定 namespaceId=nsA
- **期望结果**:
  - 返回 403 Forbidden
  - 不产生 Template 记录
- **关联 AC**: SPEC-006 AC-2

### TC-003: 保留命名空间 @system 创建返回 403
- **模块**: 命名空间
- **优先级**: P1
- **前置条件**: U1 已登录
- **测试步骤**:
  1. `POST /api/v1/namespaces` 创建 name="system" 或 "@system"（按实现约束任选）
- **期望结果**:
  - 返回 403 或 400（按产品定义），错误码清晰表明保留命名空间不可创建
- **关联 AC**: SPEC-006 AC-2（权限/约束类）

### TC-004: 成员角色权限验证（ADMIN vs MEMBER）
- **模块**: 命名空间
- **优先级**: P0
- **前置条件**: U1 为 nsA ADMIN；U2 为 nsA MEMBER
- **测试步骤**:
  1. U2 调用 `POST /api/v1/namespaces/:id/members` 添加成员
  2. U1 调用同接口添加成员
- **期望结果**:
  - MEMBER（U2）被拒绝（403）
  - ADMIN（U1）成功添加
- **关联 AC**: SPEC-006 AC-2

### TC-005: 命名空间名称格式校验
- **模块**: 命名空间
- **优先级**: P1
- **前置条件**: U1 已登录
- **测试步骤**:
  1. name 传入非法值（含空格/中文/超长/前后符号等）创建
  2. name 传入重复值创建
- **期望结果**:
  - 非法格式返回 400（含可读 message）
  - 重复返回 409 Conflict
- **关联 AC**: SPEC-006 AC-1

---

### 模板 CRUD + 版本（8）

### TC-006: 创建模板成功
- **模块**: 模板
- **优先级**: P0
- **前置条件**: U1 为 nsA 成员（ADMIN/MEMBER 均可，按规则需满足“在命名空间内且具备 PUBLISHER”）
- **测试步骤**:
  1. `POST /api/v1/templates` 创建 `{namespaceId:nsA, name:"java-springboot", isPublic:true}`
  2. 再次创建相同 name
- **期望结果**:
  - 首次成功；二次返回 409（unique (namespaceId,name)）
- **关联 AC**: SPEC-006 AC-1

### TC-007: 上传 ZIP 版本成功
- **模块**: 模板
- **优先级**: P0
- **前置条件**: Template(T1)存在；U1 有发布权限
- **测试步骤**:
  1. `POST /api/v1/templates/:id/versions` 上传 zip + manifest（sourceType=ZIP）
  2. `GET /api/v1/templates/:id/versions/:version`
- **期望结果**:
  - 返回版本信息，fileKey 非空、manifest 入库
  - 可获取下载链接（若接口返回）且能下载解压
- **关联 AC**: SPEC-006 AC-3

### TC-008: Git 来源版本成功
- **模块**: 模板
- **优先级**: P0
- **前置条件**: 准备可访问 Git repo；存在可用 GitCredential
- **测试步骤**:
  1. `POST /api/v1/templates/:id/versions` body 传 `sourceType=GIT, gitUrl, gitRef, gitSubPath, credentialId`
  2. 查询版本状态/下载
- **期望结果**:
  - 服务端 clone + 打包入 MinIO 成功，生成 ZIP 产物并关联 fileKey
- **关联 AC**: SPEC-006 AC-16

### TC-009: SemVer 版本号校验
- **模块**: 模板
- **优先级**: P0
- **前置条件**: T1 存在
- **测试步骤**:
  1. 提交版本号 "1.0"/"v1.0.0"/"1.0.0-beta"（按产品定义）
  2. 提交非法版本 "1..0"/"abc"/-1 等
- **期望结果**:
  - 合法 SemVer 通过；非法返回 400，错误信息明确
- **关联 AC**: SPEC-006 AC-1

### TC-010: 重复版本冲突 409
- **模块**: 模板
- **优先级**: P0
- **前置条件**: T1 已存在 v1.0.0
- **测试步骤**:
  1. 再次上传 v1.0.0
- **期望结果**:
  - 返回 409 Conflict（unique (templateId,version)）
- **关联 AC**: SPEC-006 AC-1

### TC-011: 模板搜索+过滤
- **模块**: 模板
- **优先级**: P1
- **前置条件**: 至少 3 个模板分布在不同 namespace/标签/AI 适配清单
- **测试步骤**:
  1. `GET /api/v1/templates?namespace=backend-team&ai=claude&sort=popular`
  2. `GET /api/v1/templates?sort=newest` 与 `sort=name`
- **期望结果**:
  - 支持过滤参数生效
  - popular 默认按 weeklyDownloads DESC 排序
- **关联 AC**: SPEC-006 AC-11

### TC-012: 模板详情含版本历史
- **模块**: 模板
- **优先级**: P1
- **前置条件**: T1 至少 2 个版本
- **测试步骤**:
  1. `GET /api/v1/templates/@:namespace/:name`
- **期望结果**:
  - 返回模板元数据 + versions 列表 + 依赖 Skill 列表（若已解析/或声明）
- **关联 AC**: SPEC-006 AC-11

### TC-013: 模板继承（extends）覆盖规则
- **模块**: 模板
- **优先级**: P0
- **前置条件**: 基础模板 T1 已发布；派生模板 T2 manifest 中 `extends=@backend-team/java-springboot@1.0.0`
- **测试步骤**:
  1. CLI 执行 `skillhub template init @backend-team/java-springboot-pro --ai claude`
  2. 校验同名文件（例如 README.md / rules 文件）最终内容
- **期望结果**:
  - 递归合并成功；同名文件以当前模板覆盖基础模板
  - 合并结果可重复（幂等）
- **关联 AC**: SPEC-006 AC-3

---

### CLI 初始化（10）

### TC-014: `--ai claude` 生成 .claude/ 目录结构
- **模块**: CLI
- **优先级**: P0
- **前置条件**: 模板已发布且包含 ai=claude 适配项；本地空目录
- **测试步骤**:
  1. `skillhub init --template @backend-team/java-springboot --ai claude --dir ./demo`
  2. 检查 demo 下目录
- **期望结果**:
  - 存在 `.claude/rules/`、`.claude/commands/`、`.claude/skills/`、`CLAUDE.md`
- **关联 AC**: SPEC-006 AC-4

### TC-015: `--ai cursor` 生成 .cursor/ + .cursorrules
- **模块**: CLI
- **优先级**: P0
- **前置条件**: 同上
- **测试步骤**:
  1. `skillhub init --template ... --ai cursor`
- **期望结果**:
  - 存在 `.cursor/rules/` 与根目录 `.cursorrules`
- **关联 AC**: SPEC-006 AC-5

### TC-016: `--ai codebuddy` 生成 .codebuddy/ 结构
- **模块**: CLI
- **优先级**: P1
- **前置条件**: 模板含 codebuddy 适配
- **测试步骤**:
  1. `skillhub init ... --ai codebuddy`
- **期望结果**:
  - `.codebuddy/rules.yaml`、`.codebuddy/agents/` 存在
- **关联 AC**: SPEC-006 AC-3

### TC-017: `--ai windsurf` 生成 .windsurf/ + .windsurfrules
- **模块**: CLI
- **优先级**: P1
- **前置条件**: 模板含 windsurf 适配
- **测试步骤**:
  1. `skillhub init ... --ai windsurf`
- **期望结果**:
  - `.windsurf/rules/` 与 `.windsurfrules` 存在
- **关联 AC**: SPEC-006 AC-3

### TC-018: 默认不指定 `--ai` 生成 .ai/
- **模块**: CLI
- **优先级**: P1
- **前置条件**: 模板支持 fallback
- **测试步骤**:
  1. `skillhub init --template ...`（不传 --ai）
- **期望结果**:
  - `.ai/` 目录存在（规则与 skills 放入其中）
- **关联 AC**: SPEC-006 AC-3

### TC-019: 模板变量替换（{{projectName}} → 实际值）
- **模块**: CLI
- **优先级**: P0
- **前置条件**: 模板包含可替换变量（pom.xml/package.json/README 等）
- **测试步骤**:
  1. init 过程中输入 projectName=demo-app
  2. 打开目标文件检查
- **期望结果**:
  - 变量被替换为 demo-app；未声明变量不应被替换（避免误替换）
- **关联 AC**: SPEC-006 AC-6

### TC-020: 条件文件包含（docker feature flag）
- **模块**: CLI
- **优先级**: P1
- **前置条件**: manifest 含 features.docker，可控制 Dockerfile/目录
- **测试步骤**:
  1. init 时选择 docker=true
  2. init 时选择 docker=false
- **期望结果**:
  - true：Dockerfile 被保留；false：Dockerfile 不存在（或被删除）
- **关联 AC**: SPEC-006 AC-3

### TC-021: Post-init hooks 执行
- **模块**: CLI
- **优先级**: P1
- **前置条件**: manifest 定义 postInit（如 `git init`、`npm install`）
- **测试步骤**:
  1. init
  2. 查看命令执行日志与产物（如 .git/、node_modules/ 视配置而定）
- **期望结果**:
  - hooks 顺序执行；失败时有明确错误输出且中止/回滚策略符合设计（至少不吞错）
- **关联 AC**: SPEC-006 AC-3

### TC-022: template.lock 文件生成
- **模块**: CLI
- **优先级**: P0
- **前置条件**: init 成功
- **测试步骤**:
  1. 检查 `.skillhub/template.lock`
- **期望结果**:
  - 记录模板名、版本、依赖 Skill resolvedVersion 等
  - 文件内容 JSON/YAML 格式合法
- **关联 AC**: SPEC-006 AC-12

### TC-023: Skill 依赖自动安装到对应目录
- **模块**: CLI
- **优先级**: P0
- **前置条件**: manifest 声明依赖 skills，如 `code-review:^1.2.0`
- **测试步骤**:
  1. init（--ai claude / cursor 各跑一轮）
  2. 检查 skills 目录内容
- **期望结果**:
  - 依赖 Skill 被拉取并放入 AI 对应 skills 目录
  - resolvedVersion 与 resolve API 返回一致
- **关联 AC**: SPEC-006 AC-7

---

### 模板更新（5）

### TC-024: `skillhub template update` 更新未修改文件
- **模块**: CLI
- **优先级**: P0
- **前置条件**: 已 init 为 v1.0.0；远端有 v1.1.0；本地未改动模板文件
- **测试步骤**:
  1. 执行 `skillhub template update`
  2. 比较关键文件 hash
- **期望结果**:
  - 文件被更新到 v1.1.0 内容
  - template.lock 更新记录版本
- **关联 AC**: SPEC-006 AC-12

### TC-025: 用户修改过的文件生成 conflicts/
- **模块**: CLI
- **优先级**: P0
- **前置条件**: init v1.0.0；手动修改一个脚手架文件；远端 v1.1.0 修改同文件
- **测试步骤**:
  1. `skillhub template update`
  2. 检查 `.skillhub/conflicts/`
- **期望结果**:
  - 原文件保留用户版本不被覆盖
  - conflicts 目录下生成冲突文件（含新版本内容或三方合并信息），便于人工合并
- **关联 AC**: SPEC-006 AC-12

### TC-026: `--dry-run` 只预览不修改
- **模块**: CLI
- **优先级**: P1
- **前置条件**: 同 TC-024
- **测试步骤**:
  1. `skillhub template update --dry-run`
- **期望结果**:
  - 输出变更 diff/文件列表
  - 工作区文件与 template.lock 均不发生变化
- **关联 AC**: SPEC-006 AC-12

### TC-027: `skillhub template outdated` 显示可用更新
- **模块**: CLI
- **优先级**: P1
- **前置条件**: 当前 lock 为旧版本；存在新版本
- **测试步骤**:
  1. `skillhub template outdated`
- **期望结果**:
  - 显示模板可更新版本与依赖更新提示（特别是 major）
- **关联 AC**: SPEC-006 AC-15

### TC-028: 跨 major 版本更新提示
- **模块**: CLI
- **优先级**: P2
- **前置条件**: 当前 v1.x；远端 v2.0.0 存在
- **测试步骤**:
  1. `skillhub template update --version 2.0.0`
- **期望结果**:
  - 明确提示 major 升级风险并要求确认（或默认拒绝，按产品策略）
- **关联 AC**: SPEC-006 AC-12

---

### Git 集成（8）

### TC-029: Git TOKEN 凭证创建+测试连通性
- **模块**: Git
- **优先级**: P0
- **前置条件**: U1 已登录；可访问 Git server；准备有效 token 与无效 token
- **测试步骤**:
  1. `POST /api/v1/git-credentials` 创建 TOKEN 凭证（url 指向 git server 前缀）
  2. `POST /api/v1/git-credentials/:id/test`（有效 token）
  3. 再创建一条无效 token，test
- **期望结果**:
  - 有效 token 返回成功；无效 token 返回认证失败（4xx）并含可读错误
- **关联 AC**: SPEC-006 AC-17

### TC-030: SSH_KEY 凭证创建
- **模块**: Git
- **优先级**: P1
- **前置条件**: U1 已登录；准备 Ed25519/RSA key；准备 DSA key
- **测试步骤**:
  1. 创建 SSH_KEY 凭证（Ed25519 或 RSA）
  2. 创建 SSH_KEY 凭证（DSA）
- **期望结果**:
  - Ed25519/RSA 通过；DSA 被拒绝（400）
- **关联 AC**: SPEC-006 AC-19

### TC-031: Git clone 发布模板成功（shallow clone + ref）
- **模块**: Git
- **优先级**: P0
- **前置条件**: repo 有 tag v1.0.0；credential 可用
- **测试步骤**:
  1. 通过 `skillhub template publish --git <url> --ref v1.0.0` 或 API 创建 GIT 版本
- **期望结果**:
  - clone 成功、切 ref 成功、打包 ZIP 成功，进入审核流
- **关联 AC**: SPEC-006 AC-16

### TC-032: Git subPath（monorepo）支持
- **模块**: Git
- **优先级**: P0
- **前置条件**: repo 为 monorepo；子路径含 template.json
- **测试步骤**:
  1. 发布时携带 `gitSubPath=templates/springboot`
- **期望结果**:
  - 能正确定位子目录并解析 template.json/manifest
- **关联 AC**: SPEC-006 AC-16

### TC-033: Webhook 自动触发发版（签名校验）
- **模块**: Git
- **优先级**: P1
- **前置条件**: 已配置 webhook secret；repo push tag 事件可模拟
- **测试步骤**:
  1. `POST /api/v1/webhooks/git` 发送正确签名 payload
  2. 发送错误签名 payload
- **期望结果**:
  - 正确签名触发新版本流程
  - 错误签名返回 401/403 且不触发发版
- **关联 AC**: SPEC-006 AC-18

### TC-034: clone 超时 60s 返回错误
- **模块**: Git
- **优先级**: P0
- **前置条件**: 通过 mock 或指向超大/慢 repo 触发超时
- **测试步骤**:
  1. 发起 Git 来源发布/拉取
- **期望结果**:
  - 60s 后终止并返回可识别错误码；不产生半成品 version（或状态标记失败）
- **关联 AC**: SPEC-006 AC-19

### TC-035: 凭证 GET 不返回明文
- **模块**: Git
- **优先级**: P0
- **前置条件**: 已创建 GitCredential
- **测试步骤**:
  1. `GET /api/v1/git-credentials`
- **期望结果**:
  - 响应不包含 credential 明文（可只返回 masked，如 "****"）
- **关联 AC**: SPEC-006 AC-19

### TC-036: SSRF 防护（内网地址拒绝）
- **模块**: Git
- **优先级**: P0
- **前置条件**: SSRF 白名单策略已定义（如仅允许 gitlab.company.com）
- **测试步骤**:
  1. 使用 `gitUrl=http://127.0.0.1:...` / `http://169.254.169.254/...` / 内网域名
  2. 使用 `file:///etc/passwd`、`ssh://` 等协议尝试
- **期望结果**:
  - 全部被拒绝（400/403），错误信息说明违反安全策略
- **关联 AC**: SPEC-006 AC-19

---

### Skill 依赖同步（5）

### TC-037: `^1.2.0` 自动同步到 `1.3.0`
- **模块**: 模板
- **优先级**: P0
- **前置条件**: 模板依赖声明 `code-review:^1.2.0`；当前 resolved=1.2.0
- **测试步骤**:
  1. 发布 Skill `code-review@1.3.0`
  2. 触发服务端扫描（事件/定时/手动 resolve）
  3. `GET /api/v1/templates/:id/versions/:v/dependencies`
- **期望结果**:
  - resolvedVersion 更新为 1.3.0；TemplateSkillLock 中同步更新
- **关联 AC**: SPEC-006 AC-14

### TC-038: `~2.1.0` 只同步 patch
- **模块**: 模板
- **优先级**: P0
- **前置条件**: 声明 `deploy-helper:~2.1.0`，resolved=2.1.0
- **测试步骤**:
  1. 发布 2.1.5
  2. 发布 2.2.0
  3. 观察 resolved
- **期望结果**:
  - 自动到 2.1.5
  - 不自动到 2.2.0
- **关联 AC**: SPEC-006 AC-14

### TC-039: 精确版本不同步
- **模块**: 模板
- **优先级**: P1
- **前置条件**: 声明 `security-scan:3.0.0`
- **测试步骤**:
  1. 发布 `security-scan@3.0.1`
  2. 触发解析
- **期望结果**:
  - resolvedVersion 仍为 3.0.0
- **关联 AC**: SPEC-006 AC-14

### TC-040: major 变更通知不自动更新
- **模块**: 模板
- **优先级**: P0
- **前置条件**: 声明 `code-review:^1.2.0`；作者为 U1
- **测试步骤**:
  1. 发布 `code-review@2.0.0`
  2. 触发解析
  3. 查看通知（站内通知；可选 webhook）
- **期望结果**:
  - resolvedVersion 不变
  - 作者收到 major 更新通知
- **关联 AC**: SPEC-006 AC-15

### TC-041: TemplateSkillLock 更新正确
- **模块**: 模板
- **优先级**: P1
- **前置条件**: 依赖解析已发生过至少一次
- **测试步骤**:
  1. `POST /api/v1/templates/:id/versions/:v/dependencies/resolve`
  2. 再次 GET dependencies
- **期望结果**:
  - declaredRange/resolvedVersion/updatedAt 正确刷新
  - 幂等：重复 resolve 结果一致
- **关联 AC**: SPEC-006 AC-14

---

### 下载统计（6）

### TC-042: 下载后 downloadCount +1
- **模块**: 统计
- **优先级**: P0
- **前置条件**: T1 已发布；downloadCount 初始值可查询
- **测试步骤**:
  1. U4 执行一次 `skillhub init --template ...`
  2. 查询模板详情/列表中的 downloadCount
  3. 查询 DownloadLog（管理员或专用接口）
- **期望结果**:
  - downloadCount +1
  - 写入 DownloadLog，resourceType=TEMPLATE，version 正确，source=CLI
- **关联 AC**: SPEC-006 AC-20

### TC-043: 同一用户 1h 内重复下载只计 1 次
- **模块**: 统计
- **优先级**: P0
- **前置条件**: 去重策略使用 Redis TTL 1h
- **测试步骤**:
  1. 同一用户在 1h 内重复 init 同模板同版本 2 次
  2. 查询 downloadCount 与 DownloadLog 数量
- **期望结果**:
  - downloadCount 仅增加 1
  - DownloadLog 仅新增 1 条（或新增标记为去重不计数，按实现；但统计不应增加）
- **关联 AC**: SPEC-006 AC-22

### TC-044: 热门排序（weeklyDownloads DESC）
- **模块**: 统计
- **优先级**: P1
- **前置条件**: 多模板在一周内产生不同下载量；weeklyDownloads 已刷新或可触发刷新
- **测试步骤**:
  1. `GET /api/v1/templates?sort=popular`
  2. Web 列表页查看默认排序
- **期望结果**:
  - 结果按 weeklyDownloads DESC
- **关联 AC**: SPEC-006 AC-20

### TC-045: 管理员查询用户下载历史
- **模块**: 统计
- **优先级**: P0
- **前置条件**: U5 为 ADMIN；已有 DownloadLog
- **测试步骤**:
  1. `GET /api/v1/admin/download-logs?resourceType=TEMPLATE&startDate=...&endDate=...`
- **期望结果**:
  - 返回明细含资源名称、版本、时间、来源
  - 非 ADMIN 访问同接口返回 403
- **关联 AC**: SPEC-006 AC-21

### TC-046: 使用报告 API
- **模块**: 统计
- **优先级**: P1
- **前置条件**: U5 为 ADMIN
- **测试步骤**:
  1. `GET /api/v1/admin/usage-report`
- **期望结果**:
  - 返回活跃用户数、总下载量、按部门统计等字段
- **关联 AC**: SPEC-006 AC-21

### TC-047: CSV 导出
- **模块**: 统计
- **优先级**: P2
- **前置条件**: admin 下载日志接口支持导出
- **测试步骤**:
  1. 以导出参数（如 `format=csv` 或 `Accept:text/csv`）调用下载日志
  2. 校验响应头与内容可被表格软件打开
- **期望结果**:
  - 返回 CSV 文件，字段齐全且编码正确（UTF-8）
- **关联 AC**: SPEC-006 AC-21

---

### Web 前端模板页面（6）

### TC-048: 模板 Tab 入口可见且与 Skills 并列
- **模块**: Web
- **优先级**: P2
- **前置条件**: 用户已登录
- **测试步骤**:
  1. 打开 Web 首页/导航
- **期望结果**:
  - “模板”Tab 可见，点击进入列表页
- **关联 AC**: SPEC-006 AC-11

### TC-049: Web 模板列表筛选与排序
- **模块**: Web
- **优先级**: P1
- **前置条件**: 存在多模板
- **测试步骤**:
  1. 按命名空间/语言/AI 工具筛选
  2. 切换热门/最新/名称排序
- **期望结果**:
  - 筛选排序与 API 一致
- **关联 AC**: SPEC-006 AC-11

### TC-050: Web 模板详情展示版本历史与依赖列表
- **模块**: Web
- **优先级**: P1
- **前置条件**: T1 有版本与依赖
- **测试步骤**:
  1. 打开模板详情页
- **期望结果**:
  - 展示描述、版本历史、依赖 Skill 列表、安装命令、下载量与趋势图
- **关联 AC**: SPEC-006 AC-11

### TC-051: Web 一键复制安装命令
- **模块**: Web
- **优先级**: P2
- **前置条件**: 模板详情页有复制按钮
- **测试步骤**:
  1. 点击复制
  2. 粘贴到文本框
- **期望结果**:
  - 命令包含 `skillhub init --template @xxx/yyy --ai claude`（或当前选择 AI）
- **关联 AC**: SPEC-006 AC-3

### TC-052: Web 上传 ZIP 自动解析 manifest + 校验 Skill 依赖存在性
- **模块**: Web
- **优先级**: P0
- **前置条件**: U1 有发布权限；准备一个依赖不存在 Skill 的模板包
- **测试步骤**:
  1. Web 上传模板 ZIP
  2. 观察在线 editor 的 JSON Schema 校验
  3. 提交审核
- **期望结果**:
  - manifest 自动解析并校验
  - 若依赖 Skill 不存在，返回明确错误提示并阻止提交
- **关联 AC**: SPEC-006 AC-13

### TC-053: 审核流复用：PENDING_REVIEW → PUBLISHED 后可被搜索与 init
- **模块**: Web
- **优先级**: P0
- **前置条件**: 有一条模板版本提交审核
- **测试步骤**:
  1. 提交发布，检查状态为 PENDING_REVIEW
  2. 审批通过后状态变为 PUBLISHED
  3. 普通用户搜索并 init
- **期望结果**:
  - 未发布版本不可被普通用户搜索/下载
  - 发布后可见可 init
- **关联 AC**: SPEC-006 AC-8

---

### 安全测试（5）

### TC-054: 非 ADMIN 访问管理员 API 返回 403
- **模块**: 安全
- **优先级**: P0
- **前置条件**: U4 非 ADMIN
- **测试步骤**:
  1. 调用 `/api/v1/admin/download-logs`
  2. 调用 `/api/v1/admin/usage-report`
- **期望结果**:
  - 均返回 403 Forbidden
- **关联 AC**: SPEC-006 AC-21

### TC-055: 非命名空间成员发布返回 403（回归）
- **模块**: 安全
- **优先级**: P0
- **前置条件**: 同 TC-002
- **测试步骤**:
  1. 非成员尝试创建模板和上传版本
- **期望结果**:
  - 均返回 403
- **关联 AC**: SPEC-006 AC-2

### TC-056: ZIP > 50MB 返回 400
- **模块**: 安全
- **优先级**: P1
- **前置条件**: 准备 >50MB 模板 zip（按网关限制设置）
- **测试步骤**:
  1. 上传版本（ZIP）
- **期望结果**:
  - 返回 400/413（按实现），错误信息提示大小限制
- **关联 AC**: SPEC-006 AC-13

### TC-057: Git 凭证 AES-256 加密验证
- **模块**: 安全
- **优先级**: P0
- **前置条件**: 已创建 GitCredential
- **测试步骤**:
  1. 直接查看数据库字段（测试环境）或通过内部 debug 接口（若有）
  2. 检查 credential 字段非明文（应为密文/含 IV/tag）
- **期望结果**:
  - 凭证在持久层为密文；应用日志不打印明文
- **关联 AC**: SPEC-006 AC-19

### TC-058: SQL 注入测试（搜索参数）
- **模块**: 安全
- **优先级**: P1
- **前置条件**: API 支持 search/query 参数
- **测试步骤**:
  1. `GET /api/v1/templates?search=' OR 1=1 --`（或等效 payload）
  2. 对 skills 搜索（若涉及 SPEC-002 搜索参数）同测
- **期望结果**:
  - 不报 500；不返回越权数据；输入被安全处理
- **关联 AC**: SPEC-006 AC-11

---

## 3. 测试统计

### 3.1 用例总数
- **总用例数**: 58

### 3.2 按优先级分布
- **P0**: 24
- **P1**: 25
- **P2**: 9

### 3.3 按模块分布
- 命名空间：5
- 模板 CRUD + 版本：8
- CLI 初始化：10
- 模板更新：5
- Git 集成：8
- Skill 依赖同步：5
- 下载统计：6
- Web：6
- 安全：5

### 3.4 自动化覆盖建议
- **优先自动化 P0**：
  - API 集成：权限/403、409、resolve、依赖解析、download 去重
  - Git：SSRF 校验、cred 脱敏、clone 超时（可用 mock git server）
  - CLI：init 目录结构、变量替换、lock 生成、update 冲突策略
- **契约测试**：前后端对 templates 列表/详情字段结构（versions/weeklyDownloads 等）
- **定时任务/统计**：weeklyDownloads 刷新建议用可触发的 job endpoint 便于 e2e
- **安全扫描**：对 search 参数做 SAST/DAST；对 webhook 签名与 URL 校验做 fuzz
