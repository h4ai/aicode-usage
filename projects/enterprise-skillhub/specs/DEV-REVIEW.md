# Dev Technical Review — SPEC-001 ~ SPEC-005

> 审核人: Dev Agent
> 审核时间: 2026-03-19
> 整体评价: NEEDS_REVISION

## 整体评价
5 个 Spec 已经覆盖了核心业务面，但从开发落地角度看，当前版本还不能直接无风险进入编码。主要问题集中在三类：第一，数据模型在 Spec 与 TECH-DESIGN 之间存在明显分叉，尤其是 User / Skill / Version / Review 的命名、状态枚举、关联关系不一致；第二，多个 API 只定义了 happy path，缺少请求/响应细节、错误码、分页/排序默认值、幂等与并发约束；第三，若干高风险技术点（LDAP/AD、pgvector + Prisma、MinIO 文件安全、审核状态机）提到了方向，但缺少可直接实现的约束。建议先做一轮 Spec 收敛，再进入开发。

## SPEC-001 Review
### 可实现性: 有问题
- `User` 模型基本可落地，但与 TECH-DESIGN 不一致：
  - Spec 用 `accountName` / `employeeNumber` / `status`，设计文档用 `username` / `employeeId` / `isActive`。
  - Spec 里的关联 `reviews: Review[]`、`downloads: Download[]` 当前没有统一定义；其中 `Download` 在现有 5 个 Spec 中根本不存在。
- `email String @unique` 在企业 AD 场景里有落地风险：
  - 很多 AD 用户没有 `mail`；
  - 某些历史账号共用邮箱/空邮箱；
  - 直接唯一约束会导致首次登录失败或同步失败。
- API 可实现，但不完整：
  - 只有 login/logout/me，没有 refresh，但 TECH-DESIGN 里有 `/api/auth/refresh`；
  - login 响应没有给出 token type、expiresIn、refreshToken 策略，前端实现会依赖猜测。
- `logout` 在纯 JWT 无服务端会话场景下语义不清：如果不做 token blacklist，该接口只能是前端本地删除 token，后端无需提供状态变更。
- RBAC 描述能编码，但缺少“角色优先级规则”：一个用户命中多个 AD 组时，到底取最高权限、还是取显式优先级映射，需要明确。

### 技术风险
- LDAP/AD 认证风险：
  - AD 属性不保证存在，`mail`、`department`、`employeeNumber` 都可能为空；Spec 目前把 `email` 设成必填唯一，不安全。
  - `memberOf` 可能拿不到嵌套组；如果企业权限依赖嵌套组，简单读取会导致角色丢失。
  - LDAPS 证书问题常见，TECH-DESIGN 里 `rejectUnauthorized: false` 仅适合 PoC，不建议生产默认这样做。
  - 多域控/故障切换没定义，单点 DC 不可用会导致整站无法登录。
  - 用户 DN bind 前通常要先 service account search；若 search base/filter 写死，跨 OU 场景可能漏人。
- JWT 风险：
  - 12 小时 access token 且无 refresh token，会导致权限变更/离职后失效滞后；
  - 没有定义 token 作废机制，无法立即踢出被禁用账户。
- 审计风险：
  - Spec 要求记录登录失败 IP，但未定义反向代理取真实 IP 的策略，Nginx/K8s 下容易记录错。

### 缺失细节
- 缺少错误码细分：
  - LDAP 连接失败 / TLS 握手失败 / 用户不存在 / 密码错误 / AD 账号禁用 / 用户无角色 / 本地用户禁用，应区分内部错误码，外部提示可统一。
- 缺少配置项定义：
  - LDAP URL、bind DN、search base、search filter、超时、重试、证书路径、组同步 cron。
- 缺少角色映射优先级规则：ADMIN > MODERATOR > REVIEWER > PUBLISHER > USER 是否固定。
- 缺少本地用户同步策略：
  - 是登录时 upsert，还是定时全量/增量同步；
  - 本地角色是否允许管理员手工 override，还是永远以 AD 为准。
- 缺少分页/排序：管理端用户列表后续一定需要，但 Spec 没定义。
- 缺少缓存策略：LDAP 组映射、用户 profile 是否进 Redis，多久失效，没有说明。

### 建议
- 将 `email` 改为可空，并使用部分唯一索引或取消唯一约束；真正身份键建议使用 `accountName`/`adDN`。
- 统一字段命名：建议全项目固定 `username` or `accountName` 二选一、`employeeId` or `employeeNumber` 二选一、`isActive` or `status` 二选一。
- 明确 JWT 策略：
  - 方案 A：短 access token + refresh token；
  - 方案 B：仅 access token，但缩短到 1~2 小时，并加用户状态/version 校验。
- 增加内部错误码，如 `AUTH_LDAP_CONNECT_FAILED`、`AUTH_INVALID_CREDENTIALS`、`AUTH_USER_DISABLED`。
- 明确 AD 组映射优先级和嵌套组支持方式。
- 生产环境禁止默认 `rejectUnauthorized: false`，应支持企业 CA 证书注入。

## SPEC-002 Review
### 可实现性: 有问题
- `Skill` 模型可实现，但与 TECH-DESIGN 明显不一致：
  - `description` vs 技术设计中的 `summary`；
  - `Category` 枚举只有 6 项，而设计文档 `SkillCategory` 有 11 项；
  - `badges` 在 Spec 是 `String[]`，设计文档是 `Json?`；
  - `status SkillStatus` 在 Spec 表示内容生命周期，但设计文档使用 `moderationStatus` 管内容可见性，审核状态在 `SkillVersion.reviewStatus`；语义冲突。
- 关联定义不完整：
  - `reviews Review[]` 使用的是 `Review`，但设计文档实体名是 `SkillReview`；
  - `comments Comment[]` 有定义，但 `Star[]`、安装/下载记录未定义；
  - `Comment.author` 对应字段名是 `ownerId`，命名不一致，后续 service/DTO 容易混乱。
- CRUD API 不统一：
  - `GET /skills/:slug` 用 slug；
  - `PATCH /skills/:id`、`DELETE /skills/:id` 用 id；
  - 技术设计整体更偏向 slug 路由。当前前后不一致会增加实现和前端状态管理复杂度。
- 列表接口只定义了 `page/limit/category/search/tags`，但没有 `visibility/status/sort/order/includeDeleted`，管理端和市场端都不够用。
- `allowedDepts String[]` 可落地，但如果未来部门名变更，会有数据漂移问题；更稳妥是存 department code。

### 技术风险
- `isDeleted Boolean` 软删方案有风险：
  - slug 全局唯一，如果软删后仍保留唯一约束，无法复用 slug；
  - 如果允许复用，则需要部分唯一索引，Prisma 标准 schema 不直接表达，需要 migration raw SQL。
- 可见性过滤风险：
  - 仅靠应用层 guard 不够，列表查询必须在 SQL where 条件内预过滤，否则容易在 total 计数、搜索建议、聚合统计中泄漏数据。
- 枚举扩展风险：
  - Category 过于精简，后续从上游 ClawHub 同步时会出现映射损失。
- 统计字段风险：
  - `starCount/viewCount` 为冗余计数，若无事务更新/异步补偿，容易不一致。

### 缺失细节
- 缺少索引策略：至少应有 `@@index([ownerId])`、`@@index([category])`、`@@index([visibility])`、`@@index([status])`、`@@index([isDeleted])`。
- 缺少 slug 校验规则细节：最大长度、是否允许连续 `--`、是否保留系统关键字。
- 缺少列表默认排序：按 `updatedAt desc`、`starCount desc` 还是 `publishedAt desc` 未定义。
- 缺少分页默认值/上限：page 默认 1、limit 默认多少、最大多少未写。
- 缺少 PATCH 的字段级约束：
  - 是否允许修改 visibility 后立即生效；
  - 若从 `DEPARTMENT` 改成 `PUBLIC` 是否需重新审核。
- 缺少删除约束：
  - 已发布且有安装记录的 Skill 是否允许 owner 删除；
  - 删除后版本与文件是否一并隐藏。
- 缺少错误码：`403/404/409` 太粗，不足以支持前端细分提示。
- 缺少缓存策略：热门列表、详情页、分类标签云都适合 Redis 缓存。

### 建议
- 统一 Skill 核心语义：
  - `Skill` 只承载元信息和可见性；
  - 审核状态放 `SkillVersion` / `Review`；
  - 内容下架/隐藏状态再单独定义 moderation 字段。
- 路由统一使用 slug 或 id，建议对外全用 slug，对内 DB 用 id。
- `badges` 建议改为 enum 数组或结构化 JSON schema，避免任意字符串污染。
- 为软删设计明确策略：推荐“slug 永不复用”，实现最简单、审计也最清晰。
- 列表接口补充 `sortBy/sortOrder/status/visibility`，并定义默认值。
- 部门字段建议改为 `allowedDeptCodes`，显示名走映射表。

## SPEC-003 Review
### 可实现性: 有问题
- `SkillVersion` / `SkillFile` 主体可落地，但与 TECH-DESIGN 冲突较多：
  - Spec 用 `status VersionStatus`，设计文档用 `reviewStatus ReviewStatus`；
  - Spec 有 `downloads Int`，设计文档把下载量放在 `Skill.downloadCount`；
  - Spec 没有 `createdById`、`parsedMeta`、`softDeletedAt`，设计文档有；
  - `SkillFile` 缺少 `path` 字段，无法表达 ZIP 内相对路径，也不利于审计扫描。
- `uploadedBy String` 没有关联到 `User`，Prisma 可写但不完整，后续做审计/权限回溯不方便。
- “ZIP 上传后在内存中解压”这条不可直接接受：
  - 大文件和 ZIP 炸弹会直接打爆内存；
  - 应改成流式检查或写入临时受限目录再扫描。
- API 粒度偏粗：
  - 只有发布、下载、版本列表，没有版本详情、删除/归档、获取解析结果、重试扫描、查看上传校验失败原因。
- 路由依然不统一：这里用 `:skillId`，TECH-DESIGN 用 `:slug`。

### 技术风险
- MinIO 上传安全边界不足：
  - 没写 zip slip（`../` 路径穿越）校验；
  - 没写最大解压后文件数、总解压体积、单文件大小限制；
  - 没写 MIME sniffing，单靠后缀 `.zip` 不可靠；
  - 没写恶意软链接/硬链接条目处理策略；
  - 没写临时文件清理和隔离目录策略。
- 预签名下载风险：
  - 下载计数如果在签发 URL 时 +1，会被刷；
  - 如果在对象下载完成后 +1，MinIO 侧不一定有回调，需要明确统计口径。
- SemVer 风险：
  - 是否允许 prerelease/build metadata（如 `1.0.0-beta.1`、`1.0.0+001`）未说明；
  - `latest/stable` tag 与 version 关系未定义。
- 数据一致性风险：
  - 上传文件到 MinIO 成功但 DB 事务失败，或相反，存在孤儿对象/孤儿记录问题。

### 缺失细节
- 缺少状态流转定义：`PENDING_REVIEW -> APPROVED/REJECTED/ARCHIVED` 是否允许从 REJECTED 重传同版、是否允许 ARCHIVED 恢复。
- 缺少文件表索引：至少 `@@index([versionId])`、`@@index([sha256])`。
- 缺少上传限制明细：
  - 最大 ZIP 大小；
  - 最大解压后总大小；
  - 最大文件数；
  - 禁止扩展名列表；
  - 允许目录深度。
- 缺少事务方案：上传、解析、建版本、建 review 如何保证原子性。
- 缺少错误码：
  - `FILE_TOO_LARGE`、`INVALID_ARCHIVE`、`MISSING_REQUIRED_FILE`、`SEMVER_INVALID`、`VERSION_ALREADY_EXISTS`、`STORAGE_UPLOAD_FAILED` 等。
- 缺少分页/排序：版本列表默认按 `createdAt desc` 还是语义版本倒序未定义。
- 缺少缓存策略：下载链接不能缓存，但版本列表/详情可以缓存短 TTL。

### 建议
- 增加 `createdById`、`parsedMeta`、`softDeletedAt`，并和 Review 模型打通。
- 不要“内存解压”，改为：
  - 先落临时隔离目录；
  - 只读取 central directory / 流式扫描；
  - 校验 zip slip、解压体积、文件数、后缀白名单。
- 明确 storage key 规范，并保留原始文件名仅作展示，不参与对象路径。
- 设计“文件上传完成 -> 创建版本 -> 创建审核单”的事务补偿机制。
- 下载量建议以版本维度与 Skill 聚合维度同时保留，或定义单一权威来源。
- 若允许多文件清单，`SkillFile` 应表达 ZIP 内文件相对路径，不仅是 archive.zip 本身。

## SPEC-004 Review
### 可实现性: 有问题
- Spec 已意识到 Prisma 对 pgvector 支持有限，这一点是正确的；但当前 schema 仍不可直接编码：
  - `@@index([embedding])` 不能直接表达 HNSW/IVFFlat 参数；
  - 实际需要 raw SQL migration 和 raw query，Spec 里没有定义清楚。
- `SkillEmbedding` 单独建表是可行方案，但与 TECH-DESIGN 冲突：设计文档把 `embedding` 放在 `SkillVersion` 上，而本 Spec 放在 `Skill` 上。
- 绑定对象不清晰：
  - 如果 embedding 基于 `DisplayName + Description + Tags + SKILL.md 正文`，那么显然和“版本内容”强相关；
  - 但 `SkillEmbedding.skillId @unique` 表示一个 Skill 只有一条向量，这会丢失版本差异。
- 搜索 API 可以实现，但返回体不够用：没有高亮摘要、版本信息、过滤原因、分页 token/offset。
- `department` 作为 query 参数不应信任前端传入，应使用当前登录用户上下文做权限过滤。

### 技术风险
- pgvector + Prisma 集成风险：
  - Prisma 对 vector 列的 schema/migrate/query 支持仍不完整，向量检索大概率要走 `prisma.$queryRaw`；
  - raw SQL 一旦拼接不慎会引入 SQL 注入风险，尤其是动态 where/order/filter。
- 向量索引风险：
  - HNSW/IVFFlat 需要根据数据规模调参，Spec 没定义使用哪种索引、何时 rebuild；
  - 小数据量时全表扫描可能更简单，大数据量时索引构建成本高。
- 维度风险：
  - BGE-M3 实际部署维度、归一化方式、输入模板必须固定；否则 query vector 与 stored vector 不一致。
- 降级风险：
  - BGE-M3 宕机时降级为 ILIKE 可做，但如果 query embedding 生成失败，接口延迟和超时策略要明确，否则容易整体超时。
- 权限过滤风险：
  - 必须先过滤可见集合再做 ANN 检索；如果先全库 topK 再在应用层过滤，可能导致结果为空且泄漏排序 side channel。

### 缺失细节
- 缺少统一建模决策：embedding 到底挂 Skill 还是 SkillVersion。
- 缺少重建策略：
  - 创建/更新/审核通过后由谁触发；
  - 重复事件是否幂等；
  - 失败重试次数和死信队列策略。
- 缺少搜索默认值：limit 默认 10 写了，但最大值、排序公式权重、最低相似度阈值未定义。
- 缺少分页：语义搜索是否支持 offset/cursor 未说明。
- 缺少缓存策略：热门 query、suggestion、embedding 结果缓存没有定义。
- 缺少 observability：向量生成耗时、召回率、索引命中情况、降级比例未纳入指标。
- 缺少错误码：`SEARCH_EMBEDDING_UNAVAILABLE`、`SEARCH_REINDEX_IN_PROGRESS` 等。

### 建议
- 先做架构决策：建议 embedding 挂在 `SkillVersion`，并由 `Skill.publishedVersionId` 指向当前搜索主版本；这样兼顾内容版本化和检索稳定性。
- 把 pgvector 落地方式写进 Spec：
  - migration raw SQL 创建 extension；
  - raw SQL 创建 HNSW/IVFFlat 索引；
  - 服务层统一封装 queryRaw，禁止业务层散落 SQL。
- 定义异步任务模型：如 `EmbeddingJob` 或通用队列表，支持状态、重试、错误原因。
- 明确“权限预过滤 + ANN 检索”的 SQL 模式。
- 增加最大 limit、超时和降级路径说明。

## SPEC-005 Review
### 可实现性: 有问题
- 主体流程可实现，但当前状态机和数据模型不足以支撑企业审核场景完整落地。
- `Review` 模型与 TECH-DESIGN 的 `SkillReview` 差异较大：
  - 缺少 `skillId`、`submitterId`、`policyId`、`assignedAt`、`reviewedAt`、`approvedAt`、`autoScannedAt`；
  - 只有 `versionId @unique`，意味着一个版本只能有一条审核记录，无法表达“驳回后重新提交流转历史”或多轮 review。
- `requiredApprovers Int` 已出现在 `ReviewPolicy`，但 `Review` 模型只有单个 `reviewerId` 和单个 `comments`，无法实现多人会签。
- API 设计不完整：
  - `/reviews/pending`、`/assign`、`/decision` 只够最简流程；
  - 缺少审核详情、扫描详情、历史轨迹、重新触发扫描、撤回、取消分配、批量分配、超时升级等接口。
- 业务规则里写“每小时定时任务自动分配 reviewerId”，但若工单已被人工认领/转派，没有并发锁和幂等规则会互相覆盖。

### 技术风险
- 状态机遗漏风险：
  - 缺少“提交后撤回”“审核中退回待分配”“审批通过后重新下架复审”“自动拒绝后申诉/重提”等路径；
  - `REVISION_REQUESTED` 后下一次提交是复用原 Review，还是创建新 Review，未明确。
- 多审核人风险：
  - `requiredApprovers > 1` 无法用现有单 reviewer 字段实现；
  - 若多人并行审核，需要 ReviewStep / ReviewDecision 子表。
- 自动扫描风险：
  - 只写了四阶段，没有定义规则来源、规则版本、扫描器超时、沙箱隔离、失败重试；
  - “代码结构复杂度评分”对 Skill 包未必有统一语义，容易引入噪音分。
- 自审绕过风险：
  - 规则写了 `ReviewerId != Skill.ownerId`，但如果 submitter 不是 owner（如代发布），还要校验 `reviewerId != submitterId`。
- 通知风险：
  - 飞书/企微提醒需要幂等和去重，否则超时 cron 会反复轰炸。

### 缺失细节
- 缺少完整状态迁移表：每个状态允许的下一步、操作者、前置条件、 side effect 未定义。
- 缺少审核历史模型：评论、决策日志、扫描结果快照最好拆表，不宜全塞 JSON。
- 缺少错误码：
  - `REVIEW_ALREADY_ASSIGNED`、`REVIEW_INVALID_STATE`、`REVIEW_SELF_REVIEW_FORBIDDEN`、`REVIEW_DECISION_COMMENT_REQUIRED` 等。
- 缺少分页/排序默认值：审核列表按创建时间、优先级、超时程度怎么排未定义。
- 缺少优先级/SLA 机制：P0 安全审核单是否插队，没写。
- 缺少缓存策略：审核列表通常不建议重缓存，但 policy、reviewer group mapping 可缓存。
- 缺少并发控制：assign/decision 需要 optimistic lock 或状态条件更新。

### 建议
- 将 `Review` 扩展为主单据，新增子表：
  - `ReviewAssignment` / `ReviewDecision` / `ReviewEvent`，用于多人会签、历史留痕、审计。
- 明确“修改后重提”策略：推荐每次提交新版本都创建新 Review，旧 Review 归档，不复用。
- 用显式状态机表述：
  - `PENDING_AUTO -> AUTO_REJECTED | PENDING_MANUAL`
  - `PENDING_MANUAL -> IN_REVIEW | CANCELLED`
  - `IN_REVIEW -> APPROVED | REJECTED | REVISION_REQUESTED | PENDING_MANUAL`
  - 以及重提后的新单创建规则。
- 将 `requiredApprovers` 落地为可实现模型，不要只放在 policy。
- assign / decision 接口增加版本号或 `updatedAt` 条件，避免并发覆盖。
- 扫描结果建议拆出结构化字段（严重级别计数、总分、fatal 标记、规则版本），JSON 仅存明细。

## 跨 Spec 一致性检查
- **User 命名不一致**：
  - TECH-DESIGN：`username` / `employeeId` / `isActive`
  - SPEC-001：`accountName` / `employeeNumber` / `status`
- **Review 实体命名不一致**：
  - TECH-DESIGN：`SkillReview`
  - SPEC-002/005：`Review`
- **Skill 描述字段不一致**：
  - TECH-DESIGN：`summary`
  - SPEC-002：`description`
- **Skill 分类枚举不一致**：
  - TECH-DESIGN 有 GENERAL / OFFICE / MULTIMEDIA / SEARCH / BROWSER / COMMUNICATION / CUSTOM 等；
  - SPEC-002 只有 DEVELOPMENT / DEVOPS / DATA / SECURITY / PRODUCTIVITY / OTHER；
  - SPEC-005 `ReviewPolicy.category` 还引用 `Category`，与技术设计的 `SkillCategory` 不是同一套。
- **Skill 状态体系不一致**：
  - TECH-DESIGN：`moderationStatus`（ACTIVE/HIDDEN/REMOVED）+ `SkillVersion.reviewStatus`
  - SPEC-002：`SkillStatus`（DRAFT/PENDING_REVIEW/PUBLISHED/DEPRECATED）
  - SPEC-003：`VersionStatus`
  - SPEC-005：`ReviewStatus`
  当前一共有 4 套状态体系，且语义有重叠。
- **版本审核状态不一致**：
  - SPEC-003 用 `VersionStatus`
  - TECH-DESIGN / SPEC-005 用 `ReviewStatus`
- **向量归属不一致**：
  - TECH-DESIGN：`SkillVersion.embedding`
  - SPEC-004：`SkillEmbedding.skillId @unique`
- **路由标识不一致**：
  - TECH-DESIGN 和部分 Spec 用 `slug`
  - SPEC-002/003/005 多处用 `id` / `skillId`
- **关联模型缺失**：
  - `Download`、`Star` 在多个位置被引用，但 5 个 Spec 中未正式定义。
- **Badge 类型不一致**：
  - TECH-DESIGN：`Json?`
  - SPEC-002：`String[]`
- **评论字段命名不一致**：
  - `Comment.author` 对应字段却叫 `ownerId`，与 Skill owner 概念混淆。

## 开发前必须澄清的问题（Blocker）
- `User` 以哪个字段作为统一登录名与唯一身份键：`username`、`accountName`、还是 `adDN`？
- `email` 是否允许为空、是否要求唯一？如果 AD 中缺失或重复邮箱，系统如何处理？
- 角色来源最终以 AD 为准，还是允许管理员在本地 override？冲突时谁优先？
- Skill 的生命周期状态到底采用哪一套：`SkillStatus`、`moderationStatus`、还是仅靠 `ReviewStatus + publishedVersionId`？
- 向量到底挂在 Skill 还是 SkillVersion？搜索结果展示当前发布版还是每个版本？
- 审核是否支持多人会签（`requiredApprovers > 1`）？如果支持，数据模型必须重设计。
- `REVISION_REQUESTED` 后的“修改重提”是复用同一个 Review，还是创建新 Review/新 Version？
- 对外 API 路由统一使用 slug 还是 id？必须全项目统一。
- 软删除后 slug 是否允许复用？这会影响唯一索引和历史审计。
- 下载量/浏览量/收藏量的权威来源在哪：Skill 聚合表、Version 表，还是事件表异步汇总？
- LDAP 生产策略是否允许 `rejectUnauthorized: false`？如果不允许，企业 CA 证书如何分发到 K8s。
- 审核超时通知集成哪种 IM（飞书/企微/邮件）？失败重试与去重规则是什么？

## 建议但不阻塞的改进（Nice-to-have）
- 增加统一错误码规范文档，前后端共享枚举。
- 增加统一分页/排序约定：默认页长、最大页长、默认排序字段。
- 引入 Redis 用于：
  - LDAP 组映射/用户 profile 短缓存；
  - 热门 Skill 列表缓存；
  - 搜索结果短缓存；
  - 审核策略缓存。
- 审核/上传/搜索相关异步任务建议统一走消息队列（BullMQ / RabbitMQ），不要只靠 cron。
- 为 MinIO 对象和本地临时文件增加病毒扫描/内容类型双重校验。
- 为审核、下载、搜索建立审计事件表而不是只存聚合值，后续 BI 和溯源更方便。
- 搜索可补充混合检索细节：`tsvector` + vector rerank，而不只依赖 ILIKE 降级。
- 增加 OpenAPI 示例与 DTO 校验规则，减少前后端联调歧义。
- 在 Prisma migration 之外保留 raw SQL 目录，专门承载 pgvector / partial index / advanced index。
- 对 LDAP、MinIO、BGE-M3 增加健康检查与熔断降级说明，便于 K8s readiness/liveness 落地。
