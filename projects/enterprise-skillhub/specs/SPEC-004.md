# SPEC-004: 向量搜索 & Embedding

> 状态: review
> 优先级: P0
> 负责人: PO Agent
> 审核人: PM
> 关联 Task: TASK-004

## 1. 概述
为了提供精准的语义搜索体验，系统集成 BGE-M3 模型为 Skill 生成高维向量表示（Embeddings）。结合 PostgreSQL 的 `pgvector` 扩展，实现混合搜索（Hybrid Search：语义相似度 + 传统关键词/标签过滤）。

## 2. 数据模型（Prisma Schema）
```prisma
// 注意：Prisma 原生对 pgvector 支持有限，通常需要使用 Unsupported("vector(1024)") 类型和 raw SQL
model SkillEmbedding {
  id             String   @id @default(uuid())
  skillId        String   @unique
  skill          Skill    @relation(fields: [skillId], references: [id])
  
  // 存放 SKILL.md 内容和描述合并后生成的向量
  // BGE-M3 维度通常为 1024
  embedding      Unsupported("vector(1024)")? 
  
  lastUpdated    DateTime @default(now())

  @@index([embedding]) // pgvector 支持 HNSW 或 IVFFlat 索引
}
```

*说明：实际应用中，还需要编写迁移文件显式启用 `CREATE EXTENSION vector;` 并创建 HNSW 索引。*

## 3. API 接口（端点 + Method + 请求体 + 响应体 + 错误码 + 权限要求）

### 3.1 语义搜索 (GET `/api/v1/search/skills`)
- **Query参数**:
  - `q` (string): 搜索文本（自然语言）
  - `category` (string, 可选): 分类过滤
  - `department` (string, 可选): 部门过滤
  - `limit` (int, 默认 10): 返回数量
- **响应体**: `{ "data": [{ "skillId", "slug", "displayName", "similarityScore" }] }`
- **权限要求**: 登录用户

### 3.2 触发重算向量 (POST `/api/v1/search/skills/:skillId/reindex`)
*(仅供内部队列或Admin调用)*
- **响应体**: `{ "success": true }`

## 4. 业务规则（约束条件、边界情况、状态机）
1. **Embedding 生成时机**: 当一个新的 Skill 创建、核心元数据（Name/Description/Tags）更新，或者一个新的 Version 审核通过时，系统发送异步消息到消息队列，由后台 Worker 调用 BGE-M3 服务生成/更新向量。
2. **文本拼接策略**: 输入给 BGE-M3 的文本为 `DisplayName + " " + Description + " " + Tags + " " + SKILL.md 正文片段`。截断超长文本以适应模型 Token 限制。
3. **混合查询联动**: 用户搜索时，将用户的 Query 通过同一模型转为查询向量，然后在 Postgres 中使用余弦距离 (`<=>`) 进行排序。**必须**结合该用户可见性规则（`visibility` + 部门判定）在 SQL 层进行预过滤（Pre-filtering），防止搜出无权访问的私密 Skill。
4. **排序策略**: 最终得分 = (余弦相似度分数) * (权重参数) + log(下载量 + 1) * (热度权重)。

## 5. 前端组件（页面 + 组件 + 交互流程）
- **组件**:
  - `OmniSearchBar`: 顶部全局搜索框，支持 debounce 联想。
  - `SearchResults`: 结果列表，卡片可标出"Semantic Match"（语义匹配）的标记以区分纯关键词匹配。
- **交互流程**: 搜索框输入自然语言（例如"帮我分析财务报表的插件"）-> 后端向量匹配 -> 返回最相关的 Skill 列表。

## 6. 安全要求（认证、权限矩阵、数据脱敏、审计日志）
- **数据泄露防御（向量污染）**: 严禁将 `PRIVATE` 或其他部门的 `DEPARTMENT` 级 Skill 向量泄漏给未授权用户。必须在 SQL 层面执行类似 `WHERE (visibility = 'PUBLIC' OR authorId = $1 OR ...) ORDER BY embedding <=> $2`。PostgreSQL + pgvector 的过滤速度很快，完全可以支撑企业级的数据量。
- **模型服务容灾**: BGE-M3 服务如不可用，后端搜索接口应平滑降级为传统的 ILIKE/正则文本匹配。

## 7. 验收标准
- [ ] 能解析包含中英文的复杂 Query 并召回相关但关键词不完全一致的 Skill（语义匹配验证）。
- [ ] 私有 Skill 在计算出高相似度的情况下，仍不能被未授权用户通过搜索接口搜出。
- [ ] 当 BGE-M3 服务宕机时，搜索接口不报 500 崩溃，而是返回传统文本匹配结果。
- [ ] 修改 Skill 的描述后，数据库中的 `embedding` 字段能在几秒内异步更新。

## 8. 变更记录
- 初始版本 draft。- 状态更新为 review。
