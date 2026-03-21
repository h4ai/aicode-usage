# Learnings

Corrections, insights, and knowledge gaps captured during development.

**Categories**: correction | insight | knowledge_gap | best_practice
**Areas**: frontend | backend | infra | tests | docs | config
**Statuses**: pending | in_progress | resolved | wont_fix | promoted | promoted_to_skill

## Status Definitions

| Status | Meaning |
|--------|---------|
| `pending` | Not yet addressed |
| `in_progress` | Actively being worked on |
| `resolved` | Issue fixed or knowledge integrated |
| `wont_fix` | Decided not to address (reason in Resolution) |
| `promoted` | Elevated to CLAUDE.md, AGENTS.md, or copilot-instructions.md |
| `promoted_to_skill` | Extracted as a reusable skill |

## Skill Extraction Fields

When a learning is promoted to a skill, add these fields:

```markdown
**Status**: promoted_to_skill
**Skill-Path**: skills/skill-name
```

Example:
```markdown
## [LRN-20250115-001] best_practice

**Logged**: 2025-01-15T10:00:00Z
**Priority**: high
**Status**: promoted_to_skill
**Skill-Path**: skills/docker-m1-fixes
**Area**: infra

### Summary
Docker build fails on Apple Silicon due to platform mismatch
...
```

---

## [LRN-20260317-001] best_practice

**Logged**: 2026-03-17T21:48:00+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
AI 编码资讯搜索工具链可用性实测排名

### Details
实测 6 种搜索工具用于 AI 编码资讯收集：
- ⭐⭐⭐⭐⭐ xreach (X/Twitter) — 最稳定，返回 JSON 结构化，无需 API key
- ⭐⭐⭐⭐ gh CLI (GitHub) — 稳定，需 gh auth login
- ⭐⭐⭐⭐ Jina Reader — 抓网页内容很好，无需 key
- ⭐⭐⭐ miku_ai (微信公众号) — 有限流（302），5 组关键词约 2 组成功
- ❌ yt-dlp (YouTube/B站) — snap 版 SSL 错误
- ❌ web_search (Brave) — 未配置 API key

### Suggested Action
- 优先用 xreach + gh + Jina 作为主力工具链
- 配置 Brave API key 提升覆盖率
- 修复 yt-dlp SSL 问题或换非 snap 版本

### Metadata
- Source: conversation
- Pattern-Key: search.tool_chain_ranking
- Recurrence-Count: 1
- First-Seen: 2026-03-17
- Last-Seen: 2026-03-17
- Tags: search, toolchain, ai-coding, daily-report

---

## [LRN-20260317-002] knowledge_gap

**Logged**: 2026-03-17T21:48:00+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
微信公众号文章抓取受限：验证码/防爬机制绕不过

### Details
尝试多种方式抓取微信公众号全文，均失败：
- Jina Reader 被微信验证码拦截
- wechat-article-for-ai (Camoufox) 输出为空
- 直接 web_fetch 被重定向
- 最终只能用 miku_ai 获取标题+链接，全文需用户在微信搜一搜手动阅读

### Suggested Action
- 接受"标题+链接+摘要"为微信渠道的输出上限
- 引导用户在微信搜一搜中阅读全文
- 或探索配置 Exa MCP server 作为替代

### Metadata
- Source: error
- Pattern-Key: wechat.article_scrape_limit
- Recurrence-Count: 1
- First-Seen: 2026-03-17
- Last-Seen: 2026-03-17
- Tags: wechat, scraping, limitation

---

## [LRN-20260320-001] best_practice

**Logged**: 2026-03-20T21:47:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
pnpm monorepo Docker 构建：不要用 pnpm deploy，直接用 npm install + sed 替换 workspace 协议

### Details
8 轮 Dockerfile 迭代后发现：pnpm 的 symlink + .pnpm store 结构在 Docker COPY 时不保留 symlink。
`pnpm deploy --legacy` 即使带 --prod 也无法保证所有 transitive deps 被安装（tslib 缺失）。
最终方案：`sed` 替换 `"workspace:*"` → `"file:../shared"`，然后 `npm install --legacy-peer-deps`。

### Suggested Action
- 所有 pnpm monorepo 项目的 Dockerfile 都用 npm-only 方案
- 不再尝试 pnpm deploy

### Metadata
- Source: conversation
- Pattern-Key: docker.pnpm_monorepo_build
- Recurrence-Count: 1
- First-Seen: 2026-03-20
- Last-Seen: 2026-03-20
- Tags: docker, pnpm, monorepo, npm

---

## [LRN-20260320-002] best_practice

**Logged**: 2026-03-20T21:47:00+08:00
**Priority**: high
**Status**: pending
**Area**: docs

### Summary
feishu_update_doc replace_range 跨章节操作极其危险，一次只操作一个章节

### Details
3/20 日报修复时，replace_range 选中了跨越 ### 1. 到 ### 3. 的范围，导致第 2 节完全丢失 + 乱码。
修复方案：大范围重写（选中多个章节一次性替换）比小范围修补更可靠。
最佳实践：用 `selection_by_title` 比 `selection_with_ellipsis` 更安全。

### Suggested Action
- 飞书文档更新一次只操作一个章节
- 优先用 selection_by_title
- 如文档已损坏，用大范围重写

### Metadata
- Source: error
- Pattern-Key: feishu.doc_replace_range_danger
- Recurrence-Count: 1
- First-Seen: 2026-03-20
- Last-Seen: 2026-03-20
- Tags: feishu, document, update, replace_range

---

## [LRN-20260320-003] best_practice

**Logged**: 2026-03-20T21:47:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
QA Agent 超时频繁 — 前端 Sprint QA 由 PM 直接接手更高效

### Details
Sprint F1-F3 中，QA Agent 在 10-15 分钟内无法完成前端 QA（安装 deps + 启动服务 + 截图）。
PM 直接接手 QA + PO 可将每个 Sprint 的验证时间从 20+ 分钟降到 5 分钟。
Dev workspace 已有测试结果，PM 只需生成 report 文件。

### Suggested Action
- 前端 Sprint 的 QA+PO 默认由 PM 接手
- 后端 Sprint 仍然可以分发给独立 Agent

### Metadata
- Source: conversation
- Pattern-Key: agent.qa_timeout_pm_takeover
- Recurrence-Count: 1
- First-Seen: 2026-03-20
- Last-Seen: 2026-03-20
- Tags: agent, qa, timeout, efficiency

---

## [LRN-20260320-004] best_practice

**Logged**: 2026-03-20T21:47:00+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
搜狗+miku_ai+Camoufox 三工具组合流程是微信公众号搜索最佳方案

### Details
实测发现：搜狗微信搜索无限流、可发现标题+摘要+公众号名；miku_ai 精准取链（命中率 80%+）；Camoufox 读全文。
精准狙击策略：搜狗先行跑全量关键词 → 挑 Top 3 → miku_ai 取链 → Camoufox 读全文。
比广撒网（6 关键词全用 miku_ai，50-67% 成功率）效率提升 30%+。

### Suggested Action
- 日报流程固定用三工具组合
- miku_ai 只用于精准狙击，不广撒网

### Metadata
- Source: conversation
- Pattern-Key: wechat.three_tool_combo
- Recurrence-Count: 1
- First-Seen: 2026-03-20
- Last-Seen: 2026-03-20
- Tags: wechat, search, miku_ai, sogou, camoufox
- See Also: LRN-20260317-002

---

## [LRN-20260320-005] best_practice

**Logged**: 2026-03-20T21:47:00+08:00
**Priority**: medium
**Status**: pending
**Area**: config

### Summary
ESM 环境下不能直接 import shared 包的 TypeScript enum — 用本地 const 对象替代

### Details
@skillhub/shared 的 enum（ReviewDecision, ReviewStatus, UserRole）在 tsx ESM 运行时 import 失败。
根因：shared 包 moduleResolution: "bundler" + main: ./src/index.ts，ESM 不自动解析无扩展名的相对 import。
修复：CLI 用本地 const 对象 + type alias 替代 enum import。

### Suggested Action
- monorepo shared 包不要用 TypeScript enum，改用 const object + type union
- 或确保 shared 包有正确的 ESM 导出配置

### Metadata
- Source: error
- Pattern-Key: esm.shared_enum_import
- Recurrence-Count: 1
- First-Seen: 2026-03-20
- Last-Seen: 2026-03-20
- Tags: esm, typescript, enum, monorepo

---

## [LRN-20260317-003] best_practice

**Logged**: 2026-03-17T21:48:00+08:00
**Priority**: low
**Status**: pending
**Area**: infra

### Summary
PDF 生成方案：weasyprint 可用，Playwright/Chrome headless 受 snap 限制不可用

### Details
需要将飞书文档内容导出为 PDF：
- weasyprint (pip install) 可用，中文字体有限但简化 HTML 后成功
- Playwright/Chrome headless 不可用（snap 版限制）
- 最终产出 108KB PDF，效果可接受

### Suggested Action
- 后续 PDF 生成统一用 weasyprint
- 如需更好的中文排版，考虑安装额外中文字体包

### Metadata
- Source: conversation
- Pattern-Key: pdf.generation_weasyprint
- Recurrence-Count: 1
- First-Seen: 2026-03-17
- Last-Seen: 2026-03-17
- Tags: pdf, weasyprint, export

