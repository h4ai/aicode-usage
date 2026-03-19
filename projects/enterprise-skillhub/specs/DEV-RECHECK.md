# Dev Recheck — SPEC-001 ~ SPEC-005（修正后）

> 审核人: Dev Agent
> 审核时间: 2026-03-19
> 基于: DEV-REVIEW.md 中 10 个 Blocker 的修正结果

## 一、Blocker 解决状态

| # | Blocker | 状态 | 备注 |
|---|---------|------|------|
| B1 | User 模型以 SPEC-001 还是 TECH-DESIGN 为准？ | ✅ 已解决 | SPEC-001 User 模型已完全对齐 TECH-DESIGN：`username` 替换 `accountName`，`isActive: Boolean` 替换 `status` 枚举，关联关系（skills, skillVersions, reviews, submittedReviews, comments, stars, auditLogs）齐全，`@@index([department])` 和 `@@index([role])` 索引已补上。 |
| B2 | Skill 模型以 SPEC-002 还是 TECH-DESIGN 为准？ | ✅ 已解决 | SPEC-002 Skill 模型已完全对齐 TECH-DESIGN：`summary` 替换 `description`，`moderationStatus: ModerationStatus` 替换 `isDeleted`，补了 `latestVersionId/publishedVersionId` 快捷指针，统计字段改为 `downloadCount/installCount/starCount`，`badges: Json?`，索引齐全。 |
| B3 | Category 枚举统一为 6 个还是 11 个？ | ✅ 已解决 | SPEC-002 已扩展为 11 个枚举值（GENERAL, DEVELOPMENT, DEVOPS, DATA, SECURITY, OFFICE, MULTIMEDIA, SEARCH, BROWSER, COMMUNICATION, CUSTOM），与 TECH-DESIGN 完全一致。SPEC-005 中 ReviewPolicy 引用 `SkillCategory?` 也自动对齐。 |
| B4 | Embedding 放在 SkillVersion 上还是独立 SkillEmbedding 表？ | ✅ 已解决 | SPEC-003 和 SPEC-004 均确认 embedding 直接存储在 `SkillVersion.embedding Float[]? @db.Vector(1024)` 上，不使用独立 `SkillEmbedding` 模型。SPEC-004 §2.1 明确声明引用 SPEC-003 的 SkillVersion 模型。 |
| B5 | 审核状态枚举 VersionStatus vs ReviewStatus 统一 | ✅ 已解决 | SPEC-003 和 SPEC-005 统一使用 `ReviewStatus`（7 态：PENDING_AUTO, AUTO_REJECTED, PENDING_MANUAL, IN_REVIEW, APPROVED, REJECTED, REVISION_REQUESTED），与 TECH-DESIGN 完全一致。SkillVersion 上使用 `reviewStatus: ReviewStatus`。 |
| B6 | REVISION_REQUESTED 后的流程是什么？ | ✅ 已解决 | SPEC-005 §4.2 明确定义：REVISION_REQUESTED 是非最终态；作者需发布新版本，当前版本自动流转为 REJECTED。遵循不可变原则——不修改已有版本，必须发新版本。状态机图也完整展示了此流转路径。 |
| B7 | Refresh Token 做不做？ | ✅ 已解决 | SPEC-001 §4.2 明确选择"不使用 Refresh Token"，JWT 12 小时过期后重新登录。TECH-DESIGN 中的 `POST /api/auth/refresh` 端点需视为保留设计，SPEC-001 作为可编码规格以 SPEC 为准。建议后续从 TECH-DESIGN 中移除该端点以避免歧义（非 Blocker，仅建议）。 |
| B8 | ZIP 炸弹防护的具体方案 | ✅ 已解决 | SPEC-003 §4.3 详细定义了 ZIP 炸弹防护方案：Uncompressed size < 200MB，文件数 < 1000，流式解压，解压超时 30 秒，Magic Bytes 校验（`PK\x03\x04` / `PK\x05\x06`）。每项都有明确阈值和动作，可直接编码。 |
| B9 | API 路径参数统一用 `slug` 还是 `id`/`skillId` | ✅ 已解决 | SPEC-002 §3.0、SPEC-003 §3.0 均明确声明"Skill 资源路径参数统一使用 `slug`"。SPEC-003 的接口定义也统一为 `/api/v1/skills/:slug/versions`。 |
| B10 | BGE-M3 服务的 API 协议和调用规范 | ✅ 已解决 | SPEC-004 §3 完整定义了 BGE-M3 服务协议：HTTP REST `POST /v1/encode`，请求体 `{ "texts": [...] }` → 响应体 `{ "embeddings": [[...]] }`，超时 5 秒，批量上限 32 条。可以直接编写 HTTP Client 对接。 |

**结论**: 10 个 Blocker 全部解决。

## 二、新发现的问题或疑问

### 2.1 SPEC-001 vs TECH-DESIGN: Refresh Token 端点残留（低优先级）

SPEC-001 明确选择不使用 Refresh Token，但 TECH-DESIGN §6.1 仍列有 `POST /api/auth/refresh`。这不影响开发（以 SPEC 为准），但建议 PM 后续更新 TECH-DESIGN 移除该端点，保持文档一致性。

**严重程度**: 💡 建议（不阻塞）

### 2.2 SPEC-005: 审核决策 API 路径风格与 TECH-DESIGN 不一致

| 来源 | 设计 |
|------|------|
| TECH-DESIGN §6.3 | 拆分为独立端点：`PATCH /reviews/:id/approve`、`PATCH /reviews/:id/reject`、`PATCH /reviews/:id/request-revision` |
| SPEC-005 §3.3 | 统一为 `POST /reviews/:id/decision`，body 中用 `decision` 字段区分 |

两种方案都可以实现，但需要明确选择一种。SPEC-005 的单端点方案更简洁（一个 Controller 方法），TECH-DESIGN 的拆分方案更 RESTful（每个动作独立语义）。

**建议**: 以 SPEC-005 的 `POST /decision` 方案为准（更适合状态机统一处理），但需在 TECH-DESIGN 中同步标注。

**严重程度**: 🟡 WARNING — 开发前需明确选择，否则前后端对接会走弯路

### 2.3 SPEC-003: SemVer 排序的存储方案未完全定义

SPEC-003 §4.2 提到"同时提取 `major`、`minor`、`patch` 整数用于排序"，但 Prisma Schema 中 SkillVersion 模型并未包含 `major`、`minor`、`patch` 三个 Int 字段。开发时需要自行决定：

- **方案 A**: 在 SkillVersion 模型中新增 `major Int, minor Int, patch Int` 三个字段（需更新 Schema）
- **方案 B**: 不加字段，排序时使用 SQL 函数在查询时实时解析 `string_to_array(version, '.')::int[]`

**建议**: 方案 A 更简单高效，推荐在 Schema 中补上三个整数字段。

**严重程度**: 🟡 WARNING — 不阻塞但开发时需做决策

### 2.4 SPEC-002: Star 和 Comment 的辅助 API 仍未定义

DEV-REVIEW WARNING-02 提到的问题在本轮修正中未被覆盖。SPEC-002 定义了 Comment 模型但没有 CRUD API，Star 模型完全缺失（仅有 Skill.starCount 统计字段）。

**建议**: 在 SPEC-002 中明确标注 "Star CRUD 和 Comment CRUD 为 Phase 2 范围，本期不实现"，避免开发者产生疑问。

**严重程度**: 💡 建议（不阻塞，但需明确标注 Phase 边界）

### 2.5 SPEC-005: 自动扫描的正则规则来源

SPEC-005 §4.3 提到安全扫描检测"API keys, passwords, tokens"等敏感信息，但未定义具体的正则规则来源。开发时需要决定：
- 硬编码在代码中的正则列表？
- 可配置的规则文件（YAML/JSON）？
- 参考 GitHub Secret Scanning / TruffleHog 的开源规则库？

**建议**: 首期采用硬编码正则 + YAML 配置相结合，正则规则参考 TruffleHog 的开源规则集。这不需要写进 Spec，开发时自行决策即可。

**严重程度**: 💡 建议（不阻塞）

## 三、开发前仍需澄清的问题

### 3.1 【需 PM 确认】审核决策 API 路径选择

如上 §2.2 所述，SPEC-005 用 `POST /decision` 统一端点，TECH-DESIGN 用拆分端点。**请 PM 明确以哪个为准**，开发团队不做二次猜测。

**建议答案**: 以 SPEC-005 为准（`POST /reviews/:id/decision`），TECH-DESIGN §6.3 做标注。

### 3.2 【需 PM 确认】SemVer 排序是否需要在 Schema 加字段

SPEC-003 §4.2 提到提取 major/minor/patch 整数排序，但 Schema 中未体现。**请确认是否需要在 SkillVersion 模型中补充三个 Int 字段**。

**建议答案**: 补充 `major Int, minor Int, patch Int` 字段，在创建版本时从 version 字符串自动解析。

### 3.3 【需 PM 确认】Star/Comment API 是否为 Phase 2

请在 SPEC-002 中明确标注 Star CRUD 和 Comment CRUD 的范围边界（Phase 1 还是 Phase 2），避免开发排期误判。

## 四、整体评价

**PASS_WITH_COMMENTS**

所有 10 个 Blocker 已全部解决，5 份 Spec 的数据模型与 TECH-DESIGN 已完全统一。Spec 质量显著提升，核心流程（认证、CRUD、版本管理、向量搜索、审核工作流）的可编码性已达到开发标准。

剩余 3 个需确认的问题（审核 API 路径、SemVer 字段、Phase 边界）均为非阻塞性质，可以在开发启动会上快速决策。**建议进入开发阶段**，同步在 Sprint Planning 中解决上述 3 个确认项。
