# Enterprise SkillHub — 测试计划 & 测试用例

> 版本: v1.0
> 编写人: QA Agent
> 编写时间: 2026-03-19
> 覆盖范围: SPEC-001 ~ SPEC-005

## 一、QA 需求 Review（疑问和建议）

### SPEC-001 疑问/建议
1. **LDAP/AD 异常码映射不完整**：仅定义了 401/403/429/503。建议补充：
   - 账户锁定、密码过期/需重置、账户禁用（AD 侧）在后端的统一表现（是否仍统一 401？还是 423 Locked/403？）
   - LDAPS 证书错误/过期、解析 DN 多结果/零结果的处理与日志。
2. **AD 属性缺失/为空的预期**：`mail/department/employeeNumber` 可能为空或缺失。需明确：
   - email 为空时是否允许登录/落库？（当前 User.email unique，若为空如何处理？）
   - department 为空时可见性隔离如何判定（是否视为“未知部门”）。
3. **AD 组映射配置来源**：引用 TECH-DESIGN.md §3.2，但本 spec 未给出默认配置样例/优先级冲突时行为（例如同时属于多个组）。建议在验收标准补充一个“多组命中最高权限”的可测例。
4. **Rate limit 维度**：
   - 登录失败 IP 限流 10次/分钟：是否按 `IP+username` 还是纯 IP？代理/内网 NAT 场景可能误伤。
   - 全局 API 100次/分钟/用户：超限后是否返回统一错误体？是否有白名单（/health）？
5. **Session/JWT 存储方式**：提到 LocalStorage/Cookie。需明确：
   - 采用 Cookie 时是否 HttpOnly/SameSite/Secure？
   - 前端是否允许同时存两种？（影响测试与安全基线）
6. **审计日志字段要求**：仅说记录登录成功/失败（含 IP）与角色变更。建议明确：userAgent、requestId、失败原因分类、是否脱敏。

### SPEC-002 疑问/建议
1. **allowedDepts 在 visibility!=DEPARTMENT 时的约束**：
   - 当 visibility=PUBLIC/PRIVATE，allowedDepts 是否必须为空数组？（否则可能造成歧义和权限漏洞）
2. **搜索参数 search 的语义**：
   - search 匹配哪些字段（displayName/summary/tags/slug/owner）？是否大小写敏感？
   - 是否支持模糊、分词（中英文）？
3. **tags 字段约束缺失**：
   - tags 数量上限、单 tag 长度、字符集、大小写归一、去重规则未定义（影响可测性与缓存 key）。
4. **badges Json 结构**：仅示例 `{ highlighted, official, deprecated }`，未明确校验规则与默认值。
5. **Redis 缓存 key 规范**：
   - 详情页 TTL 5 分钟：按 slug 还是 id？多语言/权限维度是否导致缓存穿透/串权？建议把可见性过滤在 SQL 层，缓存仅缓存“对某一用户可见”的结果或仅缓存公开部分。
6. **软删除后的行为**：REMOVED 后相关 versions/reviews/comments 是否仍可见给 ADMIN？API 是否需要 includeRemoved 才返回？

### SPEC-003 疑问/建议
1. **ZIP 解压路径安全**：未明确防护：Zip Slip（`../`）、绝对路径、同名覆盖、大小写绕过。建议加明确规则（path normalize + 拒绝危险路径）。
2. **文件类型/后缀策略**：仅强调 ZIP 炸弹、magic bytes。建议明确：
   - 是否禁止可执行文件（.exe/.dll/.so）、脚本（.sh/.ps1）？（与 SPEC-005 扫描联动）
3. **SKILL.md 必须在根目录**：明确了“根目录下的 SKILL.md”，但未定义：
   - 多层嵌套/多个 SKILL.md 怎么处理
   - frontmatter 规范（YAML key 列表、必填项）与解析失败错误码/错误信息。
4. **50MB 限制的定义**：是压缩包大小还是请求体大小？nginx/ingress 也需对齐限制。
5. **解压超时 30s 的环境差异**：在 K8s 限制 CPU 下可能误拒绝。建议将阈值可配置，并记录超时审计。
6. **ARCHIVED 状态与模型不一致风险**：本 spec §4.5 提到 ARCHIVED，但 ReviewStatus 枚举不含 ARCHIVED。需要明确：
   - ARCHIVED 是 tag？还是独立字段？还是通过 `softDeletedAt`/tag=archived 表示？否则实现/测试无法落地。

### SPEC-004 疑问/建议
1. **最终得分公式与权重未定义**：
   - `weight_semantic/weight_popularity` 未给具体值与可配置性；验收难以量化。
2. **降级检索的具体实现**：
   - ILIKE/全文检索（tsvector）二选一？与 `search` 参数是否复用？返回排序规则？
3. **权限过滤维度不够完整**：SQL 示例只处理 PUBLIC/OWNER/DEPARTMENT，但未提到：
   - Skill.moderationStatus=HIDDEN/REMOVED 对搜索结果的影响（仅 owner/admin？）
4. **embedding 生成对象**：如果仅对 `publishedVersionId` 做搜索，未通过审核的版本是否需要 embedding？（生成时机包含“新版本创建时”与“审核通过时”，可能造成重复计算）建议定义：
   - 仅对 APPROVED 的版本生成/保留 embedding，或保留但搜索只用 published。
5. **BGE-M3 服务认证**：协议未提鉴权（API key/mTLS）与请求追踪ID。建议明确，避免内网滥用。
6. **索引构建/迁移**：HNSW index 创建在大表上可能耗时，需明确上线迁移策略与回滚。

### SPEC-005 疑问/建议
1. **requiredApprovers>1 的实现缺失**：
   - 目前 decision API 看起来是单人决策；未说明多审核人如何投票/达成通过。
   - 需要明确：并行/串行、每个 reviewer 是否需提交 comment/score、最终态判定规则。
2. **自动审批 autoApproveEnabled 的落地**：
   - autoScanMinScore/自动扫描分数如何计算？与 quality 评分（reviewScore 1-5）关系？
3. **状态机与版本联动边界**：
   - REVISION_REQUESTED 后作者发新版本，“当前版本自动 REJECTED”：是否自动创建新 review 工单？旧工单如何显示？
4. **认领/转派的并发一致性**：
   - 多人同时 assign 同一单，如何防重（乐观锁/事务）？预期错误码？
5. **告警通知失败重试**：
   - webhook 失败是否重试/降噪（避免告警风暴）？
6. **职责分离校验范围**：
   - 规则写了 `reviewerId != submitterId` 且 `reviewerId != skill.ownerId`，需要明确：submitter 是否一定就是 owner？如果允许“代发布”，会出现不同人。

## 二、测试策略

### 测试类型
- 功能测试
- 接口测试（API）
- 安全测试
- 性能测试
- 兼容性测试

### 测试环境要求
1. **基础环境**：
   - K8s 测试集群（1 套）+ PostgreSQL（含 pgvector）+ Redis（用于 BullMQ/缓存/分布式锁）+ MinIO
   - Ingress/Nginx 配置与生产一致（特别是上传大小限制、超时）
2. **LDAP/AD**：
   - 可控测试域（或 AD 测试 OU）
   - 覆盖账号：正常/禁用/锁定/密码过期/无邮箱/无部门/多组角色混合
   - 域控故障注入：断网/端口阻断/证书错误
3. **BGE-M3**：
   - 可用的 embedding 服务（真服务或 stub）
   - 故障注入：超时、500、返回维度不符、返回空数组
4. **对象存储**：
   - MinIO bucket & policy（禁止前端直传/直下）
   - 预签名 URL 有效期可观测（5 分钟）
5. **可观测性**：
   - AuditLog 可查询
   - 统一错误码/traceId
   - BullMQ dashboard 或日志可定位 job 状态

## 三、测试用例

### 3.1 SPEC-001: 用户认证 & AD 域集成

#### 功能测试

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-001-001 | AD 域账号正常登录 | AD 中存在有效用户 zhangsan；isActive=true | 1) POST /auth/login 填 zhangsan/正确密码 2) 调用 /auth/me | 1) 200 返回 accessToken 与 user 基础信息 2) /me 返回完整用户信息，lastLoginAt 更新 | P0 |
| TC-001-002 | 错误密码登录 | AD 中存在用户 zhangsan | 1) POST /auth/login 填 zhangsan/错误密码 | 401，统一错误体 code=AUTH_INVALID_CREDENTIALS，不暴露是账号还是密码错 | P0 |
| TC-001-003 | 不存在账号登录 | AD 中不存在用户 nosuch | 1) POST /auth/login 填 nosuch/任意密码 | 401，错误体与 TC-001-002 一致（防枚举） | P0 |
| TC-001-004 | 被禁用账号登录（系统侧） | DB User.isActive=false（可通过后台或直改） | 1) POST /auth/login 使用该用户正确密码 | 403，提示账号已禁用；AuditLog 记录登录失败原因（不含明文密码） | P0 |
| TC-001-005 | AD 组映射为 ADMIN | 用户属于 SkillHub-Admin 组 | 1) 登录 2) /auth/me | role=ADMIN；JWT payload role=ADMIN | P0 |
| TC-001-006 | 多 AD 组命中最高权限 | 同时属于 Reviewer+Admin 组 | 1) 登录 2) /auth/me | role 取最高（ADMIN）且每次登录动态刷新 | P1 |
| TC-001-007 | Logout 行为（无 token 黑名单） | 已登录获得 token | 1) POST /auth/logout 2) 继续带旧 token 访问 /auth/me | 1) logout 返回 success 2) 旧 token 仍可用直到过期（符合 spec） | P1 |
| TC-001-008 | JWT 过期后需重新登录 | token 过期（可缩短 exp 或等待） | 1) 带过期 token 调用 /auth/me | 401/403（按实现），前端被引导重新登录；错误体统一 | P0 |
| TC-001-009 | 域控不可用时新登录降级 | 注入 LDAP 连接失败 | 1) POST /auth/login | 503，message="域控暂不可用"；/api/health 显示 ldap=down | P0 |
| TC-001-010 | 域控不可用但已有 JWT 可继续访问 | 获取 token 后断开 LDAP | 1) 断 LDAP 2) 带 token 调用受保护接口（如 GET /skills） | 200 正常访问（JWT 验证不依赖 AD） | P0 |

#### 安全测试

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-001-011 | 登录失败 IP 限流 | 同一 IP | 1) 连续 11 次错误密码登录 | 前 10 次 401，第 11 次返回 429；错误体统一；限流窗口 1 分钟 | P0 |
| TC-001-012 | 防用户名枚举（响应一致性） | 无 | 1) 对存在/不存在用户名分别登录失败 2) 对比响应码/错误体/耗时 | 响应码与错误体一致；耗时差异不明显（避免侧信道） | P1 |
| TC-001-013 | JWT 伪造/篡改 | 已拿到 token | 1) 篡改 token payload role=ADMIN 2) 调用 ADMIN 接口（如 includeRemoved=true） | 401/403 拒绝；签名校验生效 | P0 |

#### 边界测试

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-001-014 | 用户邮箱为空的处理 | AD 用户 mail 为空 | 1) 登录 | 明确预期：a) 若不允许则 400/500 不合格；b) 若允许，DB email unique 不冲突且 /me 返回 email=null | P0 |
| TC-001-015 | department 为空的可见性基础 | AD 用户 department 为空 | 1) 登录 2) GET /skills | 不发生 500；系统按定义策略过滤（建议：空部门仅可见 PUBLIC+自己） | P0 |

### 3.2 SPEC-002: Skill 数据模型 & CRUD

#### 功能测试

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-002-001 | PUBLISHER 创建 Skill 成功 | 登录用户角色=PUBLISHER | 1) POST /skills 提交合法 slug/displayName/visibility/tags | 201/200 创建成功；moderationStatus=ACTIVE；ownerId=当前用户 | P0 |
| TC-002-002 | USER 角色禁止创建 | 登录角色=USER | 1) POST /skills | 403 Forbidden；错误体统一 | P0 |
| TC-002-003 | slug 正则校验失败 | 登录 PUBLISHER | 1) slug=Abc 或 slug="--a" 或以-结尾 | 400；code 指示 slug 不合法 | P0 |
| TC-002-004 | slug 长度边界 | 登录 PUBLISHER | 1) slug 长度=2/3/64/65 分别创建 | 2/65 => 400；3/64 => 成功 | P1 |
| TC-002-005 | 重复 slug 冲突 | 已存在 slug=demo-skill | 1) 再次创建 demo-skill | 409 Conflict；提示友好 | P0 |
| TC-002-006 | 可见性：PUBLIC 可见 | 存在 PUBLIC skill | 1) 其他部门用户 GET /skills 与 /skills/:slug | 列表与详情均可见；无 403 | P0 |
| TC-002-007 | 可见性：DEPARTMENT 隔离 | skill.allowedDepts=["Finance"]；访问者 dept=HR | 1) GET /skills 2) GET /skills/:slug | 列表中无该 skill；详情 403 或 404（按定义）但需一致 | P0 |
| TC-002-008 | 可见性：PRIVATE 仅 owner/admin | skill.visibility=PRIVATE | 1) 非 owner 调用详情 | 403/404；owner/admin 可见 | P0 |
| TC-002-009 | 更新 Skill（owner） | 已创建 skill；当前用户为 owner | 1) PATCH /skills/:slug 更新 displayName/tags | 200；字段更新；清理缓存 key 生效（可通过两次 GET 验证） | P0 |
| TC-002-010 | 更新 Skill（非 owner 非 admin）禁止 | skill.owner=Alice；当前用户 Bob | 1) PATCH /skills/:slug | 403 Forbidden | P0 |
| TC-002-011 | 删除 Skill 软删除 | owner 或 admin | 1) DELETE /skills/:slug 2) 普通用户 GET 列表 | 1) 返回 success 2) 普通用户不可见；ADMIN includeRemoved=true 可见 | P0 |

#### 安全测试

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-002-012 | IDOR 越权防御（更新/删除） | 存在他人 skill | 1) 使用非 owner token 调用 PATCH/DELETE | 403；不会修改数据；AuditLog 记录越权尝试（若有） | P0 |
| TC-002-013 | 缓存串权检查（部门隔离） | Finance-only skill；HR 用户 | 1) HR 用户请求列表 2) Finance 用户请求列表 3) 再次 HR 请求 | HR 永远看不到 Finance-only skill（即使缓存命中） | P0 |

#### 边界测试

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-002-014 | limit 超过 100 截断 | 无 | 1) GET /skills?limit=1000 | 响应 limit=100；数据条数<=100 | P1 |
| TC-002-015 | tags 去重与大小写归一 | 创建/更新时 tags 包含重复/大小写混排 | 1) POST/PATCH tags=["AI","ai","AI"] | 按约定处理（需定义）：要么保留原样，要么统一小写并去重；不可导致搜索异常 | P2 |

### 3.3 SPEC-003: 版本管理 & 文件存储

#### 功能测试

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-003-001 | 上传合法 ZIP 创建版本成功 | 已有 skill；当前用户为 owner | 1) POST /skills/:slug/versions 上传 zip + version=1.0.0 | 返回 versionId；reviewStatus=PENDING_AUTO；files 列表有 path/size/sha256；MinIO 存在对象 | P0 |
| TC-003-002 | 版本号 SemVer 校验失败（带 v 前缀） | owner | 1) version=v1.0.0 上传 | 400 Bad Request | P0 |
| TC-003-003 | 版本号冲突 | 已存在 1.0.0 | 1) 再次上传 version=1.0.0 | 400/409（按实现）且提示友好；DB 保持一致不产生重复文件 | P0 |
| TC-003-004 | 非 ZIP 文件上传 | owner | 1) 上传 .tar/.txt | 400，提示非 ZIP | P0 |
| TC-003-005 | ZIP > 50MB 拒绝 | owner | 1) 上传 51MB zip | 413 Payload Too Large | P0 |
| TC-003-006 | 缺少根目录 SKILL.md | owner | 1) 上传 zip 不含 SKILL.md | 400；不创建 SkillVersion/SkillFile 记录；MinIO 不应残留对象（或应清理） | P0 |
| TC-003-007 | 版本列表排序正确 | 存在 1.0.0/1.2.0/2.0.0 | 1) GET /skills/:slug/versions | 返回按 major/minor/patch DESC | P1 |
| TC-003-008 | 仅 APPROVED 可下载 | 有 PENDING_MANUAL/APPROVED 的版本 | 1) GET /download 对未批准版本 2) 对批准版本 | 1) 403/404 拒绝 2) 返回 302/200 并生成 5 分钟预签名 URL | P0 |
| TC-003-009 | 下载统计 downloadCount+1 | 有 APPROVED 版本 | 1) 连续下载 2 次 | Skill.downloadCount 增加 2；并发下最终值正确（建议原子更新） | P1 |
| TC-003-010 | 预签名 URL 过期 | 有 APPROVED 版本 | 1) 获取预签名 URL 2) 等待>5分钟再访问 | URL 过期不可用；重新调用 download 可获取新 URL | P2 |

#### 安全测试（重点：ZIP 炸弹/路径穿越/恶意文件）

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-003-011 | ZIP 炸弹：解压后大小 >200MB | owner | 1) 上传高压缩比 zip（解压>200MB） | 400；提示 ZIP 炸弹检测触发；无 DB 脏数据 | P0 |
| TC-003-012 | ZIP 炸弹：文件数 >1000 | owner | 1) 上传包含 1001 文件 zip | 400；拒绝 | P0 |
| TC-003-013 | ZIP 解压超时 | owner；构造慢解压 zip | 1) 上传并触发解压>30s | 400；超时中断；资源回收（无持续 CPU/内存飙升） | P0 |
| TC-003-014 | Magic Bytes 校验失败 | owner | 1) 伪装 .zip 的非 zip 文件 | 400；拒绝 | P0 |
| TC-003-015 | Zip Slip 路径穿越防护 | owner | 1) zip 内含 ../a 或 /etc/passwd 路径 | 400；拒绝；不会写出到目标目录以外；AuditLog 记录 | P0 |

#### 边界测试

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-003-016 | 同路径文件覆盖冲突 | zip 内含重复 path（大小写差异） | 1) 上传 zip | 明确策略：拒绝或后者覆盖；需可测且安全（建议拒绝） | P1 |
| TC-003-017 | storageKey 生成正确 | 有多文件版本 | 1) 上传后检查 MinIO object key | key=skills/{slug}/{version}/{path} 且 path 已 normalize | P2 |

### 3.4 SPEC-004: 向量搜索 & Embedding

#### 功能测试

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-004-001 | 语义搜索正常返回 | BGE-M3 可用；存在相关 skill | 1) GET /search/skills?q=自然语言 | 200；返回 data 数组；similarityScore 为数值且排序合理 | P0 |
| TC-004-002 | limit 边界（>50 截断） | 无 | 1) GET /search/skills?q=x&limit=100 | 返回至多 50 条；响应中 limit 被截断或至少条数<=50 | P1 |
| TC-004-003 | 不支持深分页（offset） | 无 | 1) 尝试传 offset/page 参数 | 被忽略或 400（按实现），行为明确且文档化 | P2 |
| TC-004-004 | 元数据更新触发重算 embedding | 已有 APPROVED skill | 1) PATCH /skills/:slug 更新 summary 2) 观察队列 job | BullMQ 创建 job；worker 完成后 embedding 更新（可通过 DB 验证） | P0 |
| TC-004-005 | 审核通过触发 embedding | 某版本从 PENDING->APPROVED | 1) 完成审核 approve 2) 观察 job | 产生 embedding-generation job；完成后可搜索召回 | P0 |
| TC-004-006 | reindex 仅 ADMIN/内部可调用 | 非 admin 用户 | 1) POST /search/skills/:slug/reindex | 403；ADMIN 调用成功返回 jobId | P0 |

#### 安全测试（重点：权限过滤/SQL 注入）

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-004-007 | 搜索权限过滤：跨部门不可见 | Finance-only skill；HR 用户 | 1) HR 发起语义搜索（即使 query 非常相关） | 返回结果不包含该 skill | P0 |
| TC-004-008 | 搜索权限过滤：PRIVATE 不泄露 | 存在 PRIVATE skill | 1) 非 owner 搜索 | 结果不包含 PRIVATE skill | P0 |
| TC-004-009 | Raw SQL 参数化防注入 | 无 | 1) q 包含 `' OR 1=1 --` 2) category 含异常字符 | 200/400 但不应返回越权数据；DB 无错误堆栈泄露；无 SQL 注入迹象 | P0 |

#### 降级/容灾测试

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-004-010 | BGE-M3 宕机降级 ILIKE/全文检索 | 关闭 BGE-M3 | 1) GET /search/skills?q=xxx | 接口不 500；返回文本匹配结果；similarityScore=null；/health 显示 bge=down | P0 |
| TC-004-011 | BGE-M3 超时重试与死信 | 模拟 encode 超时 | 1) 触发 embedding job 2) 观察重试次数 | job 最多重试 3 次（1s/4s/16s）；失败进死信；可被 ADMIN 重试 | P1 |

### 3.5 SPEC-005: 审核工作流引擎

#### 功能测试（状态机全路径覆盖）

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-005-001 | 上传后进入 PENDING_AUTO | 发布新版本成功 | 1) 上传版本 1.0.0 | 生成 SkillReview；status=PENDING_AUTO；submittedAt 有值 | P0 |
| TC-005-002 | 自动扫描失败→AUTO_REJECTED（最终态） | 构造含恶意后缀/敏感信息包 | 1) 上传版本 | 1 分钟内 status=AUTO_REJECTED；autoScanDetail 含原因；不可回退 | P0 |
| TC-005-003 | 自动扫描通过→PENDING_MANUAL | 合法包，策略不自动审批 | 1) 上传 2) 等待扫描 | status=PENDING_MANUAL；autoScanPassed=true；autoScannedAt 有值 | P0 |
| TC-005-004 | 认领任务→IN_REVIEW | 登录 REVIEWER | 1) POST /reviews/:id/assign（不传 assigneeId） | reviewerId=自己；status=IN_REVIEW；assignedAt 更新 | P0 |
| TC-005-005 | 非 assignee 决策被拒 | review 已被 Alice 认领 | 1) Bob 调用 decision | 403 Forbidden | P0 |
| TC-005-006 | APPROVE 决策联动 Skill/Version | review IN_REVIEW | 1) decision=APPROVE + comment + score | status=APPROVED；approvedAt 有值；SkillVersion.reviewStatus=APPROVED；Skill.publishedVersionId 更新；可下载 | P0 |
| TC-005-007 | REJECT 为最终态不可回退 | review IN_REVIEW | 1) decision=REJECT 2) 再次尝试 APPROVE | 1) status=REJECTED 2) 409/400 拒绝状态回退 | P0 |
| TC-005-008 | REVISION_REQUESTED 后作者发新版本旧版变 REJECTED | review 状态=REVISION_REQUESTED | 1) 作者上传新版本 1.0.1 | 旧版本 review/版本 reviewStatus 自动变为 REJECTED；新版本产生新工单进入 PENDING_AUTO | P0 |
| TC-005-009 | 转派给他人 | ADMIN 或 REVIEWER | 1) POST /reviews/:id/assign 传 assigneeId=另一个 reviewer | reviewerId 更新；status=IN_REVIEW；审计日志记录转派 | P1 |
| TC-005-010 | ReviewPolicy 匹配优先级 | 配置 4 类策略 | 1) 提交不同 category/department skill | 命中的 policyId 按 category+dept > category > dept > global | P0 |

#### 安全测试（职责分离/并发/通知安全）

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-005-011 | 职责分离：不能审核自己的提交 | 提交人同时有 REVIEWER 角色 | 1) 提交人尝试 assign/decision 自己的 review | 403 Forbidden；自动分配也不会分给提交人 | P0 |
| TC-005-012 | 认领并发防重 | 多个 reviewer 同时操作 | 1) 两人并发 POST assign 同一 review | 只有 1 人成功；另一人收到 409/403；reviewerId 唯一 | P0 |
| TC-005-013 | Webhook URL 不泄露给前端 | 有告警配置 | 1) 打开前端/抓包 2) 查看接口响应 | 响应/前端资源中不出现 webhook URL；配置仅服务端持有 | P1 |

#### 边界/非功能测试

| 用例编号 | 用例名称 | 前置条件 | 测试步骤 | 预期结果 | 优先级 |
|---------|---------|---------|---------|---------|-------|
| TC-005-014 | 分布式锁防重复执行 | K8s 多副本 | 1) 同时启动 2 个实例的定时任务 | 每小时只执行一次分配/告警；Redis lock:review-assignment 生效 | P1 |
| TC-005-015 | 超时告警触发与降噪 | review 超过 maxReviewDays | 1) 模拟超期 2) 触发检查 | 发送通知一次（或按策略频率）；失败可重试但避免风暴 | P2 |

## 四、测试用例统计

| 模块 | P0 用例数 | P1 用例数 | P2 用例数 | 总计 |
|------|----------|----------|----------|------|
| SPEC-001 | 12 | 2 | 0 | 14 |
| SPEC-002 | 11 | 2 | 2 | 15 |
| SPEC-003 | 12 | 3 | 2 | 17 |
| SPEC-004 | 9 | 3 | 0 | 12 |
| SPEC-005 | 12 | 2 | 3 | 17 |
| **总计** | **56** | **12** | **7** | **75** |

## 五、测试风险
1. **需求残留歧义**：如 SPEC-003 的 ARCHIVED 状态与枚举不一致、SPEC-005 多审批人规则缺失，会直接影响实现与用例预期。
2. **测试环境不可控**：缺少可控 AD 测试域与故障注入（锁定/过期/证书）会导致 LDAP 场景无法覆盖。
3. **非功能阈值与生产差异**：ZIP 解压超时 30s、HNSW 索引构建、BullMQ 重试等在不同资源配额下结果差异大。
4. **权限隔离+缓存串权风险**：Redis 缓存若不按权限维度设计，容易出现跨部门数据泄露。
5. **对象存储残留与清理**：上传失败流程（SKILL.md 缺失/扫描拒绝）若未清理 MinIO 对象，可能造成存储膨胀与泄露风险。
6. **安全扫描能力未落地**：SPEC-005 自动扫描细节依赖外部扫描器实现；如规则不稳定会造成大量误报/漏报。
