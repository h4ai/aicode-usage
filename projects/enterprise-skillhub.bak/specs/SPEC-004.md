# SPEC-004: 向量搜索 & Embedding

> 状态: approved
> 优先级: P0
> 负责人: PO Agent
> 审核人: PM
> 关联 Task: TASK-004

## 1. 概述
为了提供精准的语义搜索体验，系统集成 BGE-M3 模型为 Skill 生成高维向量表示（Embeddings）。结合 PostgreSQL 的 `pgvector` 扩展，实现混合搜索（Hybrid Search：语义相似度 + 传统关键词/标签过滤）。

## 2. 数据模型

### 2.1 Embedding 存储
**不使用独立的 `SkillEmbedding` 模型**。向量直接存储在 `SkillVersion.embedding` 字段上：

```prisma
// 引用 SPEC-003 中的 SkillVersion 模型
model SkillVersion {
  // ... 其他字段
  embedding     Float[]?  @db.Vector(1024)  // BGE-M3 1024 维
  // ...
}
```

### 2.2 pgvector 索引
所有 pgvector 操作**全部使用 `$queryRaw`**，因为 Prisma 原生不支持向量操作符。

数据库迁移需显式执行：
```sql
-- 启用扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 创建 HNSW 索引（余弦距离）
CREATE INDEX idx_skill_version_embedding
ON "SkillVersion"
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

HNSW 索引参数说明：
| 参数 | 值 | 说明 |
|------|---|------|
| `m` | 16 | 每个节点的最大连接数 |
| `ef_construction` | 64 | 构建时的候选列表大小 |

## 3. BGE-M3 Embedding 服务协议

### 3.1 接口规范
- **协议**: HTTP REST
- **端点**: `POST /v1/encode`
- **请求体**:
  ```json
  {
    "texts": ["文本1", "文本2", ...]
  }
  ```
- **响应体**:
  ```json
  {
    "embeddings": [[0.123, -0.456, ...], [0.789, -0.012, ...]]
  }
  ```
- **超时**: 5 秒
- **批量上限**: 单次请求最多 32 条文本

### 3.2 文本拼接 & 截断策略
输入给 BGE-M3 的文本按以下优先级拼接：
1. **`displayName`** — 最高优先级，完整保留
2. **`tags`** — 高优先级，完整保留
3. **`summary`** — 中优先级，完整保留
4. **`SKILL.md` 正文** — 低优先级，截断以适应模型 Token 限制

截断规则：总文本长度超过模型 max_tokens 时，从 SKILL.md 正文末尾截断，确保 `displayName + tags + summary` 完整保留。

## 4. API 接口（端点 + Method + 请求体 + 响应体 + 错误码 + 权限要求）

### 4.1 语义搜索 (GET `/api/v1/search/skills`)
- **Query 参数**:
  - `q` (string, 必填): 搜索文本（自然语言）
  - `category` (string, 可选): 分类过滤
  - `department` (string, 可选): 部门过滤
  - `limit` (int, 默认 10, **最大 50**): 返回数量
- **响应体**:
  ```json
  {
    "data": [{
      "skillId": "uuid",
      "slug": "data-analyzer",
      "displayName": "Data Analyzer",
      "similarityScore": 0.85
    }]
  }
  ```
- **搜索限制**: 最大返回 50 条，**不支持深分页**（offset-based pagination）。仅支持 `limit` 参数控制返回数量
- **权限要求**: 登录用户

### 4.2 触发重算向量 (POST `/api/v1/search/skills/:slug/reindex`)
*仅供内部队列或 ADMIN 调用*
- **响应体**: `{ "success": true, "jobId": "string" }`
- **业务逻辑**: 创建 BullMQ 任务，异步重算向量

## 5. 业务规则（约束条件、边界情况、状态机）

### 5.1 Embedding 生成时机
当以下事件发生时，系统通过 **BullMQ (Redis)** 异步队列发送任务，由后台 Worker 调用 BGE-M3 服务生成/更新向量：
1. 新 SkillVersion 创建时
2. SkillVersion 审核通过（`reviewStatus=APPROVED`）时
3. Skill 核心元数据（displayName / summary / tags）更新时
4. ADMIN 手动触发重建索引时

### 5.2 混合查询实现
用户搜索时：
1. 将用户的 Query 通过 BGE-M3 转为查询向量
2. 使用 `$queryRaw` 在 PostgreSQL 中执行余弦距离查询
3. **必须**在 SQL 层结合可见性规则进行 Pre-filtering（防止搜出无权访问的 Skill）

示例 Raw SQL（参数化查询）：
```sql
SELECT sv."skillId", s.slug, s."displayName",
       1 - (sv.embedding <=> $1::vector) as "similarityScore"
FROM "SkillVersion" sv
JOIN "Skill" s ON sv.id = s."publishedVersionId"
WHERE s."moderationStatus" = 'ACTIVE'
  AND (s.visibility = 'PUBLIC'
       OR s."ownerId" = $2
       OR (s.visibility = 'DEPARTMENT' AND s."allowedDepts" && ARRAY[$3]))
  AND sv.embedding IS NOT NULL
ORDER BY sv.embedding <=> $1::vector
LIMIT $4;
```

> **安全声明**: 所有 Raw SQL 均使用参数化查询（`$1`, `$2`, ...），防止 SQL 注入。禁止拼接用户输入到 SQL 字符串中。

### 5.3 排序策略
最终得分 = `(余弦相似度分数) * weight_semantic + log(downloadCount + 1) * weight_popularity`

### 5.4 BGE-M3 降级策略
当 BGE-M3 服务不可用时：
- 搜索接口平滑降级为传统的 `ILIKE` / 全文检索匹配
- 降级模式下，响应中 `similarityScore` 返回 `null`
- 健康检查接口 `/api/health` 包含 BGE-M3 连通性状态
- 降级不影响已有向量数据，服务恢复后自动使用向量搜索

### 5.5 异步队列
- 使用 **BullMQ (Redis)** 作为异步任务队列
- 队列名称: `embedding-generation`
- 重试策略: 最多 3 次，指数退避（1s, 4s, 16s）
- 死信队列: 3 次失败后转入死信队列，ADMIN 可手动重试

## 6. 前端组件（页面 + 组件 + 交互流程）
- **组件**:
  - `OmniSearchBar`: 顶部全局搜索框，支持 debounce 联想（300ms）
  - `SearchResults`: 结果列表，当有 `similarityScore` 时显示相似度百分比；降级模式下不显示相似度
- **交互流程**: 搜索框输入自然语言（例如"帮我分析财务报表的插件"）→ 后端向量匹配 → 返回最相关的 Skill 列表

## 7. 安全要求（认证、权限矩阵、数据脱敏、审计日志）
- **数据泄露防御（向量维度）**: 严禁将 `PRIVATE` 或其他部门的 `DEPARTMENT` 级 Skill 向量泄漏给未授权用户。必须在 SQL 层面执行可见性过滤
- **Raw SQL 安全**: 所有 `$queryRaw` 调用必须使用参数化查询，禁止字符串拼接
- **模型服务隔离**: BGE-M3 仅部署在内网，不暴露公网端口

## 8. 验收标准
- [ ] 能解析包含中英文的复杂 Query 并召回相关但关键词不完全一致的 Skill（语义匹配验证）
- [ ] 私有 Skill 在计算出高相似度的情况下，仍不能被未授权用户通过搜索接口搜出
- [ ] 当 BGE-M3 服务宕机时，搜索接口不报 500 崩溃，而是返回传统文本匹配结果，`similarityScore` 为 `null`
- [ ] 修改 Skill 的 summary 后，BullMQ 任务被创建并在几秒内异步更新 embedding
- [ ] 搜索最大返回 50 条，`limit` > 50 时自动截断
- [ ] 所有 pgvector 查询使用 `$queryRaw` 参数化查询，无 SQL 注入风险

## 9. 变更记录
- 初始版本 draft。
- 状态更新为 review。
- **2026-03-19 approved**: 最终模型统一 — 删除独立 `SkillEmbedding` 模型，改为引用 `SkillVersion.embedding`；明确 pgvector 全部用 `$queryRaw`；HNSW 索引参数 `m=16, ef_construction=64`；BGE-M3 协议规范（HTTP REST POST /v1/encode，超时 5s，批量上限 32）；降级时 similarityScore 返回 null；异步队列用 BullMQ (Redis)；截断策略优先保留 displayName + tags；搜索最大 50 条不支持深分页；Raw SQL 参数化查询安全声明。
