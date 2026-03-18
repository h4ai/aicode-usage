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

