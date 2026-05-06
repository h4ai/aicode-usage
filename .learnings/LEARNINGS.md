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

## [LRN-20260323-001] correction

**Logged**: 2026-03-23T21:48:00+08:00
**Priority**: critical
**Status**: resolved
**Area**: config

### Summary
Cron agent 字段用中文名而非 agent ID 导致 ~200 次 Dev cron 触发全部静默失败

### Details
Dev cron job 的 `payload.agent` 和 `agent` 字段填的是 "全栈开发工程师"（中文名），而不是 "dev"（agent ID）。Gateway 按 ID 路由 agent，中文名无法匹配 → 静默失败，无报错。QA 的 agent 字段正确（"qa"），所以一直正常。

影响：TASK-106 被吞 5 次、TASK-107 多次失败，Dev cron 约 200 次触发 0 次成功。修复 jobs.json 一行配置后立即生效，TASK-107 在下一轮 cron 成功执行。

后续批量检查发现 23 个 cron job 中 16 个有同样问题（中文名或缺失），全部修正。

### Suggested Action
- Cron job 创建工具必须校验 agent 字段为合法 agent ID（不接受中文）
- 批量创建后跑一次全量校验脚本

### Metadata
- Source: error
- Pattern-Key: cron.agent_field_chinese_name
- Recurrence-Count: 1
- First-Seen: 2026-03-23
- Last-Seen: 2026-03-23
- Tags: cron, config, agent-routing, silent-failure
- See Also: LRN-20260322-003

---

## [LRN-20260323-002] correction

**Logged**: 2026-03-23T21:48:00+08:00
**Priority**: high
**Status**: resolved
**Area**: infra

### Summary
PM 跳过三方对齐直接创建+执行 TASK，违反 SOP v2.3 — 被沈老板要求 git revert 回退

### Details
沈老板提出 5 项 UI 需求后，PM 直接创建 TASK-111/112/113 并派发执行完成。但这违反了 SOP v2.3 规定：**需求创建也必须走三方对齐**（不仅仅是需求变更）。

沈老板要求回退：`git revert` 3 个 commits + Docker rebuild + 按 CR-001 正规流程重走三方对齐（Dev 技术评估 + QA 测试方案 + PO 验收标准）。最终创建 TASK-114/115/116，合规完成。

教训：**PM 的效率冲动（"快速搞定"）不能凌驾于流程合规之上。** 流程存在是为了保障质量和团队协作，不是障碍。

### Suggested Action
- PM 接到任何需求 → 第一反应是发三方对齐请求，不是直接创建 TASK
- 在 PM 的 prompt/checklist 中加硬提醒："先对齐，再执行"

### Metadata
- Source: user_feedback
- Pattern-Key: pm.skip_triple_alignment
- Recurrence-Count: 1
- First-Seen: 2026-03-23
- Last-Seen: 2026-03-23
- Tags: sop, compliance, triple-alignment, git-revert
- See Also: LRN-20260322-002

---

## [LRN-20260323-003] best_practice

**Logged**: 2026-03-23T21:48:00+08:00
**Priority**: high
**Status**: resolved
**Area**: infra

### Summary
Inbox peek/ack/nack 模式是防止 cron 消息丢失的根本解法

### Details
原 inbox.js 使用 destructive read：消费消息后立即从 inbox 删除。如果 cron session 消费消息后未实际执行（超时/静默失败），消息已被删除，无法重试。

peek/ack/nack 改造：
- `peek`：只读 + 锁定，消息仍在 inbox
- `ack`：执行成功后归档到 archive/
- `nack`：执行失败时保留在 inbox，下次重试

效果：消息不再因 cron 消费后不执行而丢失。这是 ERR-20260322-001 的根本修复。

### Suggested Action
- 所有 inbox 消费场景统一用 peek→execute→ack 模式
- 对遗留的 `receive` 命令保持向后兼容但标记 deprecated

### Metadata
- Source: conversation
- Pattern-Key: inbox.peek_ack_nack_pattern
- Recurrence-Count: 1
- First-Seen: 2026-03-23
- Last-Seen: 2026-03-23
- Tags: inbox, message-queue, reliability, cron
- See Also: ERR-20260322-001

---

## [LRN-20260323-004] best_practice

**Logged**: 2026-03-23T21:48:00+08:00
**Priority**: high
**Status**: resolved
**Area**: infra

### Summary
validate-task.js 从事后检查改为事前约束（create-task.js + pre-commit hook）是消灭格式错误的正确做法

### Details
原来 validate-task.js 是事后检查：PM 手写 JSON → commit → validate 发现错误 → 手动修复。三个问题：
1. PM 手写 JSON 必定出错（格式、字段遗漏）
2. subagent 不知道 schema
3. git commit 可绕过验证

改造后：
- `create-task.js`：CLI 创建 TASK JSON，27 字段自动填充，创建后验证
- `update-task.js` 增强：更新后自动跑验证
- Git pre-commit hook：commit TASK JSON 时自动检查，ERROR 拒绝 commit

效果：验证从"事后检查"变成"事前约束"，JSON 格式错误在写入时就被拦截。

### Suggested Action
- 所有结构化数据文件都应有"创建工具 + pre-commit 验证"两层保护

### Metadata
- Source: conversation
- Pattern-Key: validation.shift_left_pre_constraint
- Recurrence-Count: 1
- First-Seen: 2026-03-23
- Last-Seen: 2026-03-23
- Tags: validation, shift-left, pre-commit, tooling

---

## [LRN-20260402-001] best_practice

**Logged**: 2026-04-02T23:12:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
双轨任务获取机制必然冲突 — 机制迁移必须完成闭环，新旧共存是 bug 温床

### Details
claim-task.js（自动领取）和 dispatch（PM 派发）双轨并存导致：
1. PO TASK-123 死循环 5 轮（PM 打回 → claim-task 自动领取 → PM 再打回）
2. QA TASK-122 占座不做（claim 改 IN_PROGRESS 但 session 超时无执行）

根因：从 claim-task 迁移到 dispatch 时，未彻底移除旧通道。SA 分析确认后统一重写三个 Agent HEARTBEAT.md。

### Suggested Action
- 机制迁移时必须执行 "旧通道移除清单"，禁止渐进式保留
- 架构变更影响分析必须覆盖所有 Agent 的 HEARTBEAT.md

### Metadata
- Source: conversation
- Pattern-Key: mechanism.migration_must_close_old_channel
- Recurrence-Count: 1
- First-Seen: 2026-04-02
- Last-Seen: 2026-04-02
- Tags: architecture, migration, dual-track, heartbeat
- See Also: ERR-20260402-003, LRN-20260321-009

---

## [LRN-20260402-002] best_practice

**Logged**: 2026-04-02T23:12:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Dispatch 闭环：完成后必须同时写 .done.json 和更新原 .dispatch.json status，否则后续任务被阻塞

### Details
Dev 完成 IMPL-AUTO-CASCADE-DISPATCH 后只写了 .done.json，原 .dispatch.json status 仍为 "processing"。
后续 heartbeat 看到 processing → 认为有任务在跑 → 跳过后续 2 个 pending dispatch（FIX-TASK117-ARTIFACTS + FIX-SCHEMA-ERRORS，5.5h 未被处理）。

三层修复：
1. HEARTBEAT.md 加闭环要求
2. dispatch-utils.js 封装 completeDispatch/failDispatch/startDispatch
3. auto-dispatch.js repair 阶段自动修复 processing + .done.json 并存的孤儿状态

### Suggested Action
- 所有状态更新操作必须保证"源文件+产出文件"双写
- 设计消息/任务系统时预设 repair/reconciliation 机制

### Metadata
- Source: conversation
- Pattern-Key: dispatch.must_close_lifecycle
- Recurrence-Count: 1
- First-Seen: 2026-04-02
- Last-Seen: 2026-04-02
- Tags: dispatch, lifecycle, idempotent, repair
- See Also: ERR-20260402-002

---

## [LRN-20260402-003] best_practice

**Logged**: 2026-04-02T23:12:00+08:00
**Priority**: high
**Status**: promoted
**Promoted**: AGENTS.md (2026-04-13)
**Area**: infra

### Summary
"等机制恢复"需要设等待上限 — 超过阈值主动介入，否则任务 stalled

### Details
三次复现：
1. (4/2) QA heartbeat 不工作：08:30 发现 → 等 12 小时 → 20:21 才 spawn QA subagent
2. (4/2) Dev dispatch 卡 pending：12:08 创建 → 等 5.5h → 17:41 才发现
3. (4/3) maxConcurrent 修复后 QA dispatch 仍 pending：12:00 OPS 改完 → 等 5h+ → 17:31 才确认 QA 捡到任务

经验法则：等待 2h 无进展 → 主动排查根因 → 4h 无进展 → 直接介入（spawn subagent 或手动修复）

### Suggested Action
- PM heartbeat 检查中加入 "dispatch 等待超时告警"（pending > 2h → 升级通知）
- **修复后必须立即验证**（不要假设"改了就好了"）
- auto-dispatch.js 已包含 stalled 检测，上线后可解决

### Metadata
- Source: conversation
- Pattern-Key: pm.wait_timeout_escalation
- Recurrence-Count: 4
- First-Seen: 2026-04-02
- Last-Seen: 2026-04-11
- Tags: pm, escalation, timeout, stalled
- **⚠️ PROMOTE CANDIDATE**: Recurrence≥5 within 30 days → **已 promoted to AGENTS.md (2026-04-13)**
- Last-Seen: 2026-04-14
- Recurrence-Count: 6
- 4/12 再次复现：Wave-1 三个 TASK 4/11 派发，4/12 门禁检查才发现全部不合格（node_modules 缺失），中间无主动跟进
- 4/14 再次复现：TASK-127 15:01 派发后 ~7h 无进展更新，PM 未主动检查。虽然 HEARTBEAT Step 0.5 已设计，但今天实际未触发 heartbeat 验证
- 4/18 再次复现：Hotfix/SA/E2E 三项派发后均无明确 deadline，QA E2E 长时间无结果未主动 escalate
- Recurrence-Count: 7
- Last-Seen: 2026-04-18

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

4/4 更新：Docker 重建再次踩坑两个新问题：
1. **pnpm symlink 在 COPY 后丢失** — 改用 `pnpm deploy --legacy --prod` 也不行，最终仍用 npm-only
2. **Prisma engine binary 不匹配 Alpine (musl)** — 必须在 schema.prisma 声明 `binaryTargets = ["native", "linux-musl-openssl-3.0.x"]`
3. **修改源码后必须 rebuild 镜像** — 容器跑的是镜像里的代码，不是宿主机源码

### Suggested Action
- 所有 pnpm monorepo 项目的 Dockerfile 都用 npm-only 方案
- 不再尝试 pnpm deploy
- Alpine 镜像必须加 Prisma musl binary target
- 代码修改后检查是否需要 Docker rebuild

### Metadata
- Source: conversation
- Pattern-Key: docker.pnpm_monorepo_build
- Recurrence-Count: 2
- First-Seen: 2026-03-20
- Last-Seen: 2026-04-04
- Tags: docker, pnpm, monorepo, npm, prisma, alpine, musl

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
**Status**: promoted
**Promoted**: AGENTS.md (2026-04-13)
**Area**: infra

### Summary
Agent 故障/超时频繁 — 灵活切换替代 Agent 或 PM 直接接手

### Details
Sprint F1-F3 中，QA Agent 在 10-15 分钟内无法完成前端 QA（安装 deps + 启动服务 + 截图）。
PM 直接接手 QA + PO 可将每个 Sprint 的验证时间从 20+ 分钟降到 5 分钟。

4/4 更新：Dev/PO agent 出现 0 tokens 问题（3+ 次），QA agent 反而稳定。PM 灵活用 QA agent 代执行 Dev/PO 的查询任务（gh auth 检查、TASK 列表查询等），保证进度不卡。

模式总结：Agent 稳定性是持续性问题，需要 1) 短期 workaround（灵活切换）+ 2) 长期根治（排查 0 tokens 根因）。

### Suggested Action
- 前端 Sprint 的 QA+PO 默认由 PM 接手
- Agent 故障时灵活切换到其他稳定 Agent 代执行
- 需要投入时间排查 Dev/PO 0 tokens 的根因

### Metadata
- Source: conversation
- Pattern-Key: agent.qa_timeout_pm_takeover
- Recurrence-Count: 3
- First-Seen: 2026-03-20
- Last-Seen: 2026-04-05
- Tags: agent, qa, timeout, efficiency, 0-tokens, workaround
- **⚠️ PROMOTE CANDIDATE**: Recurrence≥3 within 30 days

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

## [LRN-20260412-001] best_practice

**Logged**: 2026-04-12T22:00:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Dispatch 模板必须包含 Step 0: 环境验证（pnpm install / node_modules 检查），否则 Dev 代码写完但测试无法运行

### Details
Sprint 7 Wave-1 三个 TASK（124/125/126）全部不合格：代码实现了但测试未运行，原因是 Dev worktree 中 node_modules 不存在，jest/tsc 都找不到。
PM 4/11 派发时没有在 dispatch 模板中包含环境初始化步骤。Dev 也没有主动 pnpm install。

这与 3/20 Docker 构建 8 轮失败（ERR-20260320-001）模式相同：环境初始化是隐含假设，一旦假设不成立就全链路卡住。

### Suggested Action
- 所有 Dev dispatch 模板 Step 0 固定为：`cd <worktree> && pnpm install && npx tsc --noEmit`
- 测试步骤前加 `ls node_modules/.bin/jest || (echo "ERROR: jest not found, run pnpm install" && exit 1)`
- 门禁脚本增加"测试是否真正执行"的检查（不仅检查 checklist 文件存在）

### Metadata
- Source: conversation
- Pattern-Key: dispatch.env_init
- Recurrence-Count: 1
- First-Seen: 2026-04-12
- Last-Seen: 2026-04-12
- Tags: dispatch, environment, node_modules, pnpm, template
- See Also: ERR-20260320-001, LRN-20260320-001

---

## [LRN-20260412-002] correction

**Logged**: 2026-04-12T22:00:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Dispatch status "done" 不等于"合格" — PM 门禁必须验证实际产出物，不能信任 status 字段

### Details
TASK-124 和 TASK-126 dispatch status 为 "done"，但门禁检查发现：
- 测试未运行（node_modules 缺失）
- Checklist 文件未提交
- TASK JSON 状态未从 PENDING 更新

"done" 只代表 Dev session 结束了，不代表交付物合格。PM 从 4/11 派发到 4/12 17:35 沈老板催问期间，没有主动验证。

这与 LRN-20260402-003（等待超时无介入）和 LRN-20260405-001（交付物应主动推送不等催促）模式一致。

### Suggested Action
- PM 门禁检查三件套：(1) checklist 文件存在 (2) 测试实际运行且通过 (3) TASK JSON status 已更新
- dispatch 完成 24h 内 PM 必须主动门禁，不等人催
- 考虑自动门禁脚本（dispatch .done.json 出现后自动触发）

### Metadata
- Source: conversation
- Pattern-Key: dispatch.done_not_qualified
- Recurrence-Count: 2
- First-Seen: 2026-04-12
- Last-Seen: 2026-04-15
- Tags: dispatch, gatecheck, quality, false-done
- See Also: LRN-20260402-003, LRN-20260405-001
- Note (2026-04-15): TASK-128 QA 验证 7 AC 全 FAIL — 单元测试全 PASS 但运行时完全不工作，与 Sprint 6 TASK-122 "假完成"模式相同。拆分为 TASK-130~134 hotfix wave。

---

## [LRN-20260412-003] correction

**Logged**: 2026-04-12T22:00:00+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
TRACKER.json 21 天未同步 — PM 巡检缺少"元数据健康"检查项

### Details
4/12 门禁检查发现 TRACKER.json 长期未同步（21 天 stale）。TRACKER 是项目状态的 SSOT，但 sync 脚本是否在运行、何时最后运行过，PM 从未检查过。

属于"看得见的任务在跟进，看不见的基础设施在腐烂"的问题模式。

### Suggested Action
- PM 巡检清单增加：TRACKER.json last_modified 是否在 48h 内
- 如果 stale → 手动触发 sync 脚本 → 检查脚本本身是否正常
- 考虑 cron 定期运行 sync 脚本

### Metadata
- Source: conversation
- Pattern-Key: tracker.sync_stale
- Recurrence-Count: 1
- First-Seen: 2026-04-12
- Last-Seen: 2026-04-12
- Tags: tracker, sync, infra-health, pm-patrol

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


---

## [LRN-20260405-001] best_practice

**Logged**: 2026-04-05T22:00:00+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
交付物应主动推送，不等催促 — 沈老板催 QA 截图报告说明 PM 跟进不足

### Details
4/5 全天工作中，沈老板 18:22 催促"QA的截图报告还是没有收到"，说明：
1. QA 截图任务完成后 PM 没有主动推送到群
2. PM 没有设置交付物超时告警（应在 QA 任务派发后 30-60 分钟无产出时主动跟进）

今天的积极面：后续多轮截图、PDF、全面验证报告都及时发送了。

经验法则：**任何被派发的任务完成后，PM 必须在 10 分钟内向群聊推送交付物或进度报告**。

### Suggested Action
- PM 派发任务后设 mental timer：30 min 无产出 → 主动查询
- 交付物完成后立即推送，不等人问
- QA 截图类任务优先级应更高（用户可见度高）

### Metadata
- Source: user_feedback
- Pattern-Key: pm.proactive_delivery_push
- Recurrence-Count: 1
- First-Seen: 2026-04-05
- Last-Seen: 2026-04-05
- Tags: pm, delivery, proactive, follow-up

---

### LRN-20260321-009: Worktree + 自动领取 + 并行开发机制复盘

- **Category**: best_practice
- **Area**: infra
- **Priority**: critical
- **Status**: resolved
- **Pattern-Key**: agent.worktree_autoclaim_parallel
- **Recurrence-Count**: 1
- **First-Seen**: 2026-03-21
- **Last-Seen**: 2026-03-21

**Context**: 沈老板提出三个改进方向：1) Worktree 分支隔离 2) Agent 自动领取任务 3) 最多 5 个并行。在 2 小时内完成了从设计到验证的全流程。

**What went right** ✅:
1. **Worktree 隔离效果极好** — 5 个 Dev subagent 在独立分支并行开发，0 冲突，~20 分钟完成串行需 60+ 分钟的工作
2. **claim-task.js 设计合理** — prerequisites 依赖检查 + 优先级排序 + 并行槽位控制，一个脚本搞定
3. **Schema 演进清晰** — v2.1→v2.2→v2.3→v2.4 每次只加一个概念，向后兼容
4. **依赖图可视化** — `--graph` 输出让任务状态一目了然
5. **PM 不下场执行** — 沈老板最后要求的任务化改造，merge/验证/QA 都变成 TASK

**What went wrong** ❌:
1. **Subagent 嵌套深度限制** — Dev Agent Heartbeat 作为 PM 的 subagent（depth 1/1）无法再 spawn 子 subagent，导致自动领取流程断裂
2. **V8 sort 不稳定** — P0 任务排到最后，差点领错。需要显式 tiebreak
3. **TASK JSON 手写格式不合规** — 新建 TASK-011/012/013 时 step_id/type/status 格式全错，被 validator 拦住
4. **regression_check 值不规范** — Dev subagent 填写的值不是精确的 "PASS"，被 validator 拦住

**Root Causes**:
- 嵌套限制是 OpenClaw 架构设计，非 bug — 需要改用 session 模式而非 subagent 模式
- TASK JSON 手写容易出错 — 需要模板生成器
- Validator 严格程度刚好，在 commit 前拦住了问题

**Lessons Learned**:
1. **Agent Heartbeat 不能用 subagent spawn 驱动** — 应让 Agent 在自己的 direct session 中运行 Heartbeat，或 PM 直接 spawn 执行任务
2. **sort 永远加 tiebreak** — 尤其是优先级排序，用 localeCompare(id) 保证稳定
3. **TASK JSON 必须过 validator** — 手写必错，先写再验再提交
4. **regression_check 值必须精确为 "PASS"** — 在 SOP 中强调
5. **PM 的角色是架构师而非执行者** — 拆任务、设依赖、监控进度，不亲自 merge/test

**Actionable Improvements**:
- [ ] 创建 `create-task.js` 模板生成器（避免手写 JSON 出错）
- [ ] 修改 Dev HEARTBEAT 机制：PM 直接 spawn，或 Agent 用 direct session
- [ ] 在 SOP 中写明 regression_check 只接受 "PASS" / null
- [ ] 考虑 claim-task.js 增加 `--status-for-deps` 参数（允许 REVIEW 也算满足依赖）


---

## [LRN-20260321-010] best_practice

**Logged**: 2026-03-21T23:00:00+08:00
**Priority**: critical
**Status**: pending
**Area**: infra

### Summary
四层防御体系是多Agent项目管理的基石：写入时+合并时+巡检时+派发前

### Details
3/21 一天内建立了完整的四层防御体系：
1. **写入时** — `update-task.js`：状态机校验 + 自动规范化（大小写、格式）
2. **合并时** — `worktree-manage.sh` post-merge hook：自动修复 broken JSON + 规范化
3. **巡检时** — `patrol.js` (Monitor)：11 项合规检查 + 历史趋势 + 自动升级告警
4. **派发前** — `validate-task.js`：30+ 条规则，Agent 执行前必过门禁

效果：Wave 2 门禁拦住 5 个不完整交付（缺 runtime_logs/screenshots），Dev merge 覆盖 PM 修复的问题被 post-merge hook 自动修正。

### Suggested Action
- 所有新项目从 Day 1 建立四层防御
- 每层都有明确的 "最小可用版本"（v1: 基础校验 → v2: 趋势分析 → v3: 自动修复）

### Metadata
- Source: conversation
- Pattern-Key: project.four_layer_defense
- Recurrence-Count: 1
- First-Seen: 2026-03-21
- Last-Seen: 2026-03-21
- Tags: quality, defense, monitor, validation, gate
- See Also: LRN-20260321-009, ERR-20260321-001

---

## [LRN-20260403-001] best_practice

**Logged**: 2026-04-03T11:43:00+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
简单查询任务（grep/read/journalctl）不应 spawn subagent — PM 直接执行更高效

### Details
4/3 排查 QA heartbeat 问题时，多次 spawn Dev subagent 执行简单命令（journalctl -u openclaw-gateway | grep QA、读取 openclaw.json 等）。
每次 subagent 启动需 10-15s（模型加载 + context 构建），且多次超时（15-30s timeout）。
PM 本身的 read/exec 工具完全可以处理这些任务，零启动成本。

经验法则：
- **spawn subagent**：需要专业角色知识（Dev 写代码、QA 测试、PO 评审）或需要长时间执行的任务
- **PM 直接做**：read 文件、grep 搜索、简单配置查看、日志查询

### Suggested Action
- PM 排查问题时默认自己执行简单命令，只在需要角色专业能力时 spawn
- 给 subagent 更长的 timeout（30s→60s）用于复杂任务

### Metadata
- Source: conversation
- Pattern-Key: pm.simple_task_no_subagent
- Recurrence-Count: 1
- First-Seen: 2026-04-03
- Last-Seen: 2026-04-03
- Tags: subagent, efficiency, pm-role, timeout

---

## [LRN-20260321-011] best_practice

**Logged**: 2026-03-21T23:00:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
Git Worktree + 并行 Subagent 是多Agent开发的最佳模式：5并行 0冲突 60min→20min

### Details
Wave 1 实战验证：5 个 Dev subagent 在独立 worktree 分支中并行开发，每个 worktree ~7MB（共享 Git objects），20 分钟完成串行预估 60+ 分钟的工作量。

关键成功因素：
- **文件级隔离**：TASK JSON 的 code_context.files 确保无重叠
- **分支级隔离**：每个任务独立 branch，worktree-manage.sh 管理生命周期
- **后合并策略**：post-merge hook 自动修复 TASK JSON 格式问题

注意事项：
- TASK JSON 是 "数据文件"，merge 策略应优先 main（不同于代码文件的 "accept theirs"）
- Dev subagent 不主动填写 verification 字段 — 门禁补数据是 PM 的工作

### Suggested Action
- 所有 Dev 任务默认启用 worktree
- QA 任务不启用（只读验证，不改代码）
- 并行上限 5（沈老板确认）

### Metadata
- Source: conversation
- Pattern-Key: agent.worktree_parallel_dev
- Recurrence-Count: 1
- First-Seen: 2026-03-21
- Last-Seen: 2026-03-21
- Tags: worktree, parallel, subagent, isolation
- See Also: LRN-20260321-009

---

## [LRN-20260321-012] best_practice

**Logged**: 2026-03-21T23:00:00+08:00
**Priority**: high
**Status**: pending
**Area**: config

### Summary
openclaw cron add CLI 不稳定时，直接编辑 jobs.json + 通知 OPS 重启 gateway 是可靠的 fallback

### Details
3/21 尝试用 `openclaw cron add` 添加 AI编码日报定时任务，CLI 持续报 "gateway closed (1000 normal closure)" 错误。
尝试 5+ 次均失败，包括加 sleep、换参数格式等。

最终方案：
1. 直接编辑 `~/.openclaw/cron/jobs.json`，参考现有 job 格式新增条目
2. 通知 OPS agent（或用户）重启 gateway 以加载新 job
3. 重启后 `openclaw cron list` 确认已加载

关键规则：**PM 不能自己重启 gateway**（Gateway 重启只能由 OPS 完成）。

### Suggested Action
- CLI 失败时直接编辑 jobs.json
- 记住 gateway 重启后才会加载 jobs.json 变更
- 需要重启时通知 OPS agent

### Metadata
- Source: error
- Pattern-Key: openclaw.cron_add_fallback
- Recurrence-Count: 1
- First-Seen: 2026-03-21
- Last-Seen: 2026-03-21
- Tags: openclaw, cron, gateway, ops

---

## [LRN-20260321-013] best_practice

**Logged**: 2026-03-21T23:00:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
SOP 三方审查（Dev+QA+PO同时审查）+ AGENTS.md 合规审计是流程落地的关键

### Details
3/21 SOP v2.0→v2.1 升级过程中的两个关键实践：

**三方审查**：让 Dev/QA/PO 同时审查 SOP，各自从自己角色角度提出改进。
- Dev：关注可执行性（TDD 分级、verify 分两档、+50min/任务的影响）
- QA：关注覆盖完整性（AC 覆盖率、截图强制、门禁脚本化）
- PO：关注价值交付（安全优先排序、AC 覆盖率替代章节覆盖率）
- 最终吸收 6 条改进，三方都给 CONDITIONAL PASS

**AGENTS.md 合规审计**：发现严重问题——SOP 写好了但四个 Agent 的 AGENTS.md 都没有引用！
- Agent 新 session 启动时完全不知道要遵循 SOP
- 修复后四个 Agent 都加了：强制读取指令 + 角色速查 + 状态转换规则

教训：**流程文档写得再好，如果不在 Agent 的"启动序列"中引用，就等于不存在。**

### Suggested Action
- 每次新增 SOP/流程文档，必须同时更新所有相关 Agent 的 AGENTS.md
- 定期审计 AGENTS.md 与 SOP 的一致性

### Metadata
- Source: conversation
- Pattern-Key: sop.triple_review_and_audit
- Recurrence-Count: 1
- First-Seen: 2026-03-21
- Last-Seen: 2026-03-21
- Tags: sop, audit, agents, compliance

---

## [LRN-20260321-014] knowledge_gap

**Logged**: 2026-03-21T23:00:00+08:00
**Priority**: medium
**Status**: pending
**Area**: infra

### Summary
Subagent 跑完就退出，没有反思环节 — Self-Improve 需要持久化机制

### Details
3/21 沈老板问各 Agent 有没有执行 self-improve，发现只有 PM 做了（因为 PM 在长 session 中），其他 4 个 Agent（Dev/QA/PO/Monitor）的 subagent 跑完就退出，完全没有反思环节。

尝试 `sessions_send` 给 Dev Agent 做 self-improve → 被拒（agentToAgent disabled）。

PM 提出的第四种方案（最佳）：**subagent + 强制写入持久文件**
- 在 PHASE-FINAL-TEMPLATE.md 中加入 self-improve step
- subagent 退出前必须写入 `.learnings/` + `memory/YYYY-MM-DD.md`
- "文件即记忆，不依赖 session 存活"

等待沈老板最终确认此方案。

### Suggested Action
- PHASE-FINAL-TEMPLATE.md 中固化 self-improve step
- 每个 subagent 的任务 prompt 引用 PHASE-FINAL-TEMPLATE.md

### Metadata
- Source: conversation
- Pattern-Key: agent.self_improve_persistence
- Recurrence-Count: 1
- First-Seen: 2026-03-21
- Last-Seen: 2026-03-21
- Tags: self-improve, subagent, persistence, learnings

---

## [LRN-20260322-001] best_practice

**Logged**: 2026-03-22T21:45:00+08:00
**Priority**: critical
**Status**: pending
**Area**: infra

### Summary
Prompt 层禁令不等于技术硬拦截 — LLM 可以且会无视 prompt 禁令

### Details
PM 巡检 cron prompt 前 5 行写了铁律禁令"绝对禁止执行 systemctl"，但模型仍然连续 20 次执行了该命令。
证明：prompt 层安全 ≠ 技术层安全。关键安全约束必须在系统层面（exec allowlist）实现，不能仅依赖 prompt。

### Suggested Action
1. OpenClaw 需要 exec allowlist/blocklist 功能（系统级拦截 systemctl/rm -rf 等危险命令）
2. 巡检类 cron 只允许调用白名单脚本，不给 exec 自由权限
3. 任何涉及进程管理的操作必须通过统一入口脚本（如 ops-restart-gateway.sh）

### Metadata
- Source: error
- Pattern-Key: prompt.safety_not_reliable
- Recurrence-Count: 1
- First-Seen: 2026-03-22
- Last-Seen: 2026-03-22
- Tags: security, prompt-injection, exec-allowlist, cron-safety

---

## [LRN-20260322-002] best_practice

**Logged**: 2026-03-22T21:45:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
PM 不直接 spawn 角色 subagent — 改进机制而非下场干活

### Details
沈老板明确原则："PM 不要 spawn QA，这违反了 Inbox 机制，我们是要改进机制，而不是直接下场干活"。
PM 角色定位：流程设计者和机制改进者，不是任务执行者。当机制不工作时，应排查修复机制，而非绕过机制手动执行。

### Suggested Action
- PM 发现 Inbox 机制失败 → 排查根因 → 修复机制 → 重新走机制
- 仅在用户明确要求时才可临时手动执行（如截图任务时效性要求）

### Metadata
- Source: user_feedback
- Pattern-Key: pm.no_direct_spawn
- Recurrence-Count: 2
- First-Seen: 2026-03-22
- Last-Seen: 2026-03-22
- Tags: inbox, pm-role, mechanism-first

---

## [LRN-20260322-003] correction

**Logged**: 2026-03-22T21:45:00+08:00
**Priority**: high
**Status**: promoted
**Promoted**: AGENTS.md (2026-03-22)
**Area**: config

### Summary
Cron job 创建时反复缺少 agent 字段 — 需要标准化创建流程

### Details
三批 cron jobs 都缺少 agent 字段：
1. inbox-check (4个) — agent 缺失
2. daily-retro (5个) — agent 缺失  
3. po/monitor daily-retro — 根本没创建
每次都是事后发现，手动补救。根因：没有标准化的 cron job 创建工具。

### Suggested Action
1. 写 `create-cron-job.js` 脚本，agent 为必填字段
2. 创建 cron 后自动 validate（检查 agent/schedule/prompt 必填）
3. 考虑 cron job 模板化

### Metadata
- Source: error
- Pattern-Key: cron.agent_field_missing
- Recurrence-Count: 3
- First-Seen: 2026-03-22
- Last-Seen: 2026-03-22
- Tags: cron, config, standardization

---

## [LRN-20260415-001] hotfix_wave_dispatch_pattern

**Logged**: 2026-04-15T22:00:00+08:00
**Priority**: medium
**Status**: active
**Area**: project-management

### Summary
大批量 QA FAIL 后，按依赖关系拆分 hotfix wave 是有效的模式——TASK-128（7AC 全 FAIL）拆为 5 个 hotfix 分 2 波派发。

### Details
TASK-128 QA 集成测试 7 AC: 0 PASS / 6 FAIL / 1 TODO。与其整块打回让 Dev 重做，不如按 AC 拆分为独立 hotfix 任务：
- **Wave 1**（无依赖，可并行）：TASK-130 CLI 路径、TASK-131 Git DTO、TASK-133 安全三件套、TASK-134 SemVer
- **Wave 2**（有依赖）：TASK-132 Webhook 依赖 TASK-131

好处：
1. 每个 hotfix 范围小，Dev 容易理解和验证
2. 独立 AC 可以独立 QA，不用等全部完成
3. 依赖关系显式化，避免集成冲突
4. 可以分批合并，降低风险

### Suggested Action
- QA FAIL ≥ 3 AC 时，考虑拆分 hotfix wave（而非整块打回）
- 每个 hotfix 对应 1-2 个 AC，保持原子性
- 画依赖图确定 wave 顺序
- Wave 内任务可并行派发

### Metadata
- Source: conversation
- Pattern-Key: pm.hotfix_wave_split
- Recurrence-Count: 1
- First-Seen: 2026-04-15
- Last-Seen: 2026-04-15
- Tags: project-management, hotfix, dispatch, qa-fail, wave


---

### LRN-20260417-001: auto-dispatch 防重复机制
- **Date**: 2026-04-17
- **Pattern-Key**: dispatch.dedup.inbox
- **Priority**: medium
- **Category**: process
- **Recurrence-Count**: 1
- **First-Seen**: 2026-04-17
- **Status**: resolved
- **Summary**: inbox 已有同 taskId 的 active dispatch 时会 skip，不是 bug 而是设计行为。PM 巡检需读 dispatch 状态而非仅读 TASK JSON。
- **Resolution**: 巡检逻辑已知，但需在未来巡检脚本中加入 dispatch 状态检查。

### LRN-20260417-002: Dev 状态转换必须先于 subagent spawn
- **Date**: 2026-04-17
- **Pattern-Key**: task.status.before.spawn
- **Priority**: high
- **Category**: process
- **Recurrence-Count**: 1
- **First-Seen**: 2026-04-17
- **Status**: resolved
- **Summary**: Dev 拾取 dispatch 后必须先更新 TASK JSON status→in_progress + event_log，再 spawn subagent。否则 Monitor 报 ILLEGAL_TRANSITION（6次违规）。已通过修改 Dev HEARTBEAT.md 强制执行。
- **Resolution**: Dev HEARTBEAT.md 加入强制步骤，验证生效。

### LRN-20260417-003: validate-task.js pre-execute 元数据卡点
- **Date**: 2026-04-17
- **Pattern-Key**: validate.preexecute.metadata
- **Priority**: medium
- **Category**: tooling
- **Recurrence-Count**: 1
- **First-Seen**: 2026-04-17
- **Status**: resolved
- **Summary**: TASK-133/134 初次 failed 因 validate-task.js pre-execute 校验卡在 env_context.docker_compose 等元数据缺失。补齐后通过。PM 派发时需确保元数据完整。

---

## [LRN-20260418-001] 只做被明确要求的事

### 问题
沈老板明确指出：绝对不要"顺手"、"顺便"做额外的事，只做明确要求的事。PM 有时会在完成主任务时附带做一些"看起来有帮助"的额外操作，但这违反了用户意愿。

### 学习
- 严格控制 scope：只做指令中明确要求的事
- 不主动"优化"、"顺便修复"、"顺手整理"
- 有额外建议时，提出建议让用户决定，而不是直接做

### Metadata
- Source: conversation (沈老板直接要求)
- Pattern-Key: pm.only_do_what_asked
- Recurrence-Count: 1
- First-Seen: 2026-04-18
- Last-Seen: 2026-04-18
- Tags: pm, scope, discipline, user-instruction
- Priority: high

---

### LRN-20260419-001: PM 在老板直接指挥执行者时保持沉默

- Pattern-Key: pm.silent_when_boss_directs
- Priority: medium
- Recurrence-Count: 1
- First-Seen: 2026-04-19
- Last-Seen: 2026-04-19
- Status: validated
- Category: collaboration

**场景**：沈老板在群里直接 @OPS 密集下发 30+ UI 需求变更，PM 全程 NO_REPLY。

**学习**：当老板直接指挥具体执行者（OPS/Dev）进行微调迭代时，PM 不应插嘴。PM 的价值在于：
1. 默默记录所有变更到 memory（便于后续追溯、QA 回归）
2. 只在流程节点介入（如需要派 QA 回归、Sprint 规划时）
3. 避免成为信息中转的瓶颈

**See Also**: pm.only_do_what_asked

---

## [LRN-20260421-001] QA subagent 多轮重试需设上限

### 问题
cascade-retry.js 无 max retry 上限，导致 QA TASK-128 RETEST 产生 57 轮死循环（R5~R57），每轮生成一个 dispatch，最终阻塞 QA inbox。

### 学习
- 任何自动重试机制必须设 max retry 上限（建议 5 次）
- 无上限的自动化 = 定时炸弹
- 沈老板已确认需要加上限逻辑

### Metadata
- Source: conversation
- Pattern-Key: qa.cascade_retry_no_limit
- Recurrence-Count: 1
- First-Seen: 2026-04-21
- Last-Seen: 2026-04-21
- Tags: qa, automation, retry, cascade, inbox-flood
- Priority: high

---

## [LRN-20260421-002] PM 查到结果必须立即回复

### 问题
沈老板 @PM 问分支情况，PM 查了但回复被后续消息冲掉，沈老板追问"PM为啥没回复"。

### 学习
- 查到结果必须立即回复，不能等、不能攒
- 消息流快时，延迟回复等于没回复
- See Also: pm.only_do_what_asked

### Metadata
- Source: conversation (沈老板追问)
- Pattern-Key: pm.reply_immediately
- Recurrence-Count: 1
- First-Seen: 2026-04-21
- Last-Seen: 2026-04-21
- Tags: pm, responsiveness, communication
- Priority: medium

---

### LRN-20260422-001: 确定性操作 PM 直接执行，不等人批准

- Pattern-Key: pm.deterministic_auto_execute
- Priority: high
- Recurrence-Count: 1
- First-Seen: 2026-04-22
- Last-Seen: 2026-04-22
- Status: validated
- Category: process
- Summary: 门禁未通过且原因明确（元数据缺失）时，PM 应直接派修补任务，不等老板批准。确定性、无风险的推进操作应自主执行。沈老板直接批评 PM 等待行为。
- Source: conversation (沈老板批评)
- Tags: pm, autonomy, gate-check, decision-making


---

### LRN-20260423-001: Subagent 派发后必须设超时检查点

- Pattern-Key: pm.subagent_followup_checkpoint
- First-Seen: 2026-04-23
- Last-Seen: 2026-04-23
- Recurrence-Count: 1
- Priority: medium
- Status: open

**Context:** 派 QA subagent 做 PAT E2E 测试，跑了 40+ min 没人跟进结果，状态不明。

**Learning:** 每次 spawn subagent 后，应立即在待跟进列表设一个超时检查点（如 30min），到时间用 subagents list 检查状态。如果超时未完成，escalate 或接管。

**Action:** 派发 subagent 时同步记录：`[超时检查] YYYY-MM-DD HH:MM 检查 subagent {id}`

## [LRN-20260424-001] PM 角色越界亲自改代码

**Logged**: 2026-04-24T21:45:00+08:00
**Priority**: high
**Status**: resolved
**Area**: process
**Pattern-Key**: pm.role.boundary

### Summary
PM 直接修复 auth.py 硬编码和 UserManager.vue bug，沈老板当场提醒角色分工——PM 拆任务派发，Dev 写代码，OPS 部署。

### Lesson
- PM 发现 bug 后应立即创建任务派发给 Dev，而非自己动手修
- 急迫感不是越界的理由，快速派发 subagent 同样高效
- 后续在当天其他需求中已严格执行分发（全部 @OPS/Dev）

### Metadata
- Recurrence-Count: 1
- First-Seen: 2026-04-24

---

### LRN-20260424-001: PM 绝对不碰代码，拆任务派发给 Dev/OPS

- Pattern-Key: pm.role_boundary_no_code
- Priority: high
- Status: active
- Recurrence-Count: 1
- First-Seen: 2026-04-24
- Last-Seen: 2026-04-24
- Context: 沈老板明确指出 PM 不应直接改 auth.py 和 Vue 文件
- Root Cause: 测试环境刚搭好，PM 图快直接动手修 bug，而非拆任务派发
- Resolution: PM 职责是拆任务、派发、跟进。代码修改必须派给 Dev 或 OPS。即使是"一行代码的小修"也不例外。
- Impact: 角色混乱导致职责不清，长期会削弱团队分工
- Tags: role-boundary, discipline
