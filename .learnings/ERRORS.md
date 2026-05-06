# Errors Log

## [ERR-20260402-001] edit_tool_false_success

**Logged**: 2026-04-02T22:00:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
edit 工具返回 "Successfully replaced" 但实际文件未修改（6/6 全部假成功）

### Error
```
4/1 23:46 对 TASK-117/118/119/120/121/123 执行 edit，全部返回 "Successfully replaced"
4/2 07:17 发现文件未变更，第二次执行才实际生效
```

### Context
- 6 个 TASK JSON 文件的 status 字段修改
- 第一轮 edit 全部报成功但 read 验证发现文件未改变
- 第二轮 edit 在同一 session 中执行才真正修改成功
- 可能与 LCM compaction 或文件系统缓存有关

### Suggested Fix
- **edit 后必须 read 验证**，不能信任返回值
- 考虑封装 edit+verify 函数

### Metadata
- Reproducible: yes (6/6 首次失败)
- Pattern-Key: edit.false_success
- Recurrence-Count: 1
- First-Seen: 2026-04-02
- Last-Seen: 2026-04-02
- Tags: edit-tool, reliability, verification

---

## [ERR-20260402-002] dispatch_lifecycle_broken

**Logged**: 2026-04-02T22:00:00+08:00
**Priority**: high
**Status**: resolved
**Area**: infra

### Summary
Agent 完成 dispatch 后不更新原 .dispatch.json status，导致后续 pending dispatch 被跳过

### Error
```
Dev IMPL-AUTO-CASCADE-DISPATCH 完成 → 写 .done.json → 但原 .dispatch.json status 仍为 "processing"
→ Dev heartbeat 看到 processing → 认为有任务在跑 → 跳过后续 2 个 pending dispatch
→ FIX-TASK117-ARTIFACTS + FIX-SCHEMA-ERRORS 5.5h 未被处理
```

### Context
- QA TASK-122 同样问题：claim-task.js 改 status 为 processing，但 QA 未实际执行
- 系统性问题：所有 Agent 的完成逻辑都缺少闭环

### Suggested Fix
1. ✅ HEARTBEAT.md 加闭环要求（完成后更新原 dispatch status）
2. ✅ dispatch-utils.js 三函数封装（startDispatch/completeDispatch/failDispatch）
3. ✅ auto-dispatch.js repair 阶段（扫描 processing + .done.json → 自动修复）

### Resolution
- **Resolved**: 2026-04-02T17:30:00+08:00
- **Notes**: 三层修复：HEARTBEAT.md 规范 + dispatch-utils.js 封装 + auto-dispatch repair

### Metadata
- Reproducible: yes
- Pattern-Key: dispatch.lifecycle_broken
- Recurrence-Count: 1
- First-Seen: 2026-04-02
- Last-Seen: 2026-04-02
- Tags: dispatch, lifecycle, inbox, heartbeat
- See Also: ERR-20260322-001

---

## [ERR-20260402-003] task123_po_claim_loop

**Logged**: 2026-04-02T22:00:00+08:00
**Priority**: critical
**Status**: resolved
**Area**: infra

### Summary
TASK-123 PO 死循环：PM 打回 PENDING → PO heartbeat 自动领取改回 REVIEW（5 轮）

### Error
```
PM 改 TASK-123 → PENDING
→ PO heartbeat 触发 claim-task.js → 自动改为 IN_PROGRESS → 再改 REVIEW
→ PM 发现后再打回 → PO 再领取
→ event_log 记录 5 轮循环
```

### Context
- 根因：HEARTBEAT.md 中 claim-task.js（旧通道）和 dispatch（新通道）双轨并存
- claim-task.js 不检查"为什么被打回"，只看 status=PENDING 就自动领取
- SA 分析报告（INBOX-MECHANISM-REVIEW-result.md）确认为架构性冲突

### Suggested Fix
1. ✅ 移除 PO/QA/Dev HEARTBEAT.md 中的 claim-task.js
2. ✅ dispatch 作为唯一任务获取通道
3. ✅ TASK-123 加 dependencies: ["TASK-122"] 防止提前验收

### Resolution
- **Resolved**: 2026-04-02T11:00:00+08:00
- **Notes**: 三个 Agent HEARTBEAT.md 统一重写，claim-task.js 彻底移除

### Metadata
- Reproducible: yes
- Pattern-Key: agent.claim_dispatch_conflict
- Recurrence-Count: 5 (5轮循环)
- First-Seen: 2026-04-02
- Last-Seen: 2026-04-02
- Tags: heartbeat, claim-task, dispatch, dual-track, deadloop
- See Also: LRN-20260321-009, ERR-20260322-001

---

## [ERR-20260320-001] docker_pnpm_monorepo

**Logged**: 2026-03-20T21:47:00+08:00
**Priority**: high
**Status**: resolved
**Area**: infra

### Summary
Docker 构建 pnpm monorepo 后端镜像失败 — 8 轮迭代

### Error
```
- v1: npx nest build → @nestjs/cli 不在 root deps
- v2: npx tsc → typescript 不在 root deps
- v3: Prisma 7.x → npx prisma generate 拉到 7.5.0 breaking change
- v4: pnpm hoisting → 模块找不到
- v5: pnpm --filter build → tsconfig 路径错误
- v6: cp -rL node_modules → tslib transitive dep 缺失
```

### Context
- pnpm monorepo（packages/backend + packages/shared + packages/frontend + packages/cli）
- Prisma 7.x 不再支持 schema 内 url（breaking change）
- pnpm deploy --legacy 不保证 transitive deps

### Suggested Fix
最终方案：npm-only Dockerfile（sed 替换 workspace:* → file:../shared，npm install --legacy-peer-deps）

### Resolution
- **Resolved**: 2026-03-20T18:05:00+08:00
- **Commit**: 1c2fced
- **Notes**: npm-only 方案成功构建，584MB 镜像，6 容器全部 healthy

### Metadata
- Reproducible: yes
- Related Files: deploy/docker/Dockerfile
- See Also: LRN-20260320-001

---

## [ERR-20260320-002] feishu_doc_replace_range

**Logged**: 2026-03-20T21:47:00+08:00
**Priority**: high
**Status**: resolved
**Area**: docs

### Summary
feishu_update_doc replace_range 跨章节导致文档损坏

### Error
```
3/20 日报补充微信链接时 replace_range 跨越 ### 1. 到 ### 3. 边界
→ 第 2 节（Claude Dispatch）完全丢失
→ 第 1 节末尾出现乱码 ](url)](url)](url)
```

### Context
- 文档 ID: GrZBdol1ToYXjlxa5ngcLVlLnUg
- 操作：尝试在第 1 节末尾追加微信链接
- 定位表达式匹配了跨章节范围

### Suggested Fix
- 大范围重写（选中 ### 1. 到 ### 3. 一次性替换）
- 未来一次只操作一个章节

### Resolution
- **Resolved**: 2026-03-20T02:44:00+08:00
- **Notes**: 用 selection_with_ellipsis 选中大范围重写修复

### Metadata
- Reproducible: yes
- Related Files: 无
- See Also: LRN-20260320-002

---


---

### ERR-20260321-001: Subagent 嵌套深度限制导致自动领取流程断裂

- **Category**: correction
- **Area**: infra
- **Priority**: high
- **Status**: resolved (workaround: PM 直接 spawn)
- **Pattern-Key**: agent.subagent_depth_limit
- **Recurrence-Count**: 1
- **First-Seen**: 2026-03-21

**Symptom**: Dev Agent 通过 Heartbeat（作为 PM 的 subagent）领取了 5 个任务（claim-task.js 正常），但无法 spawn 子 subagent 执行（depth 1/1 限制），5 个任务卡在 IN_PROGRESS 无人执行。

**Root Cause**: OpenClaw subagent 最大嵌套深度为 1。PM spawn Dev Agent（depth 1）→ Dev Agent 想再 spawn subagent（depth 2）→ 被拒绝。

**Fix**: PM 直接 spawn 5 个 Dev subagent（PM→Dev subagent，depth 1），绕过 Dev Agent 中间层。

**Permanent Solution**: 
1. 让 Dev/QA/PO Agent 的 Heartbeat 在 direct session 中运行（非 subagent）
2. 或者把 claim + execute 合并到同一个 subagent 中（不需要再 spawn）
3. 或者 OpenClaw 提供 depth > 1 的配置

---

### ERR-20260321-002: V8 Array.sort 不稳定导致 P0 任务排到最后

- **Category**: correction
- **Area**: infra
- **Priority**: medium
- **Status**: resolved
- **Pattern-Key**: js.sort_stability

**Symptom**: claim-task.js 优先级排序后 P0 TASK-001 出现在 P1 任务之后。

**Root Cause**: 某些 V8 版本的 `Array.sort` 对相同值的元素不保证稳定排序，简单的 `(a-b)` 比较可能产生意外结果。

**Fix**: 添加 `localeCompare(id)` 作为 tiebreak，确保排序完全确定性。


---

## [ERR-20260321-003] openclaw_cron_add_websocket

**Logged**: 2026-03-21T23:00:00+08:00
**Priority**: medium
**Status**: resolved
**Area**: config

### Summary
openclaw cron add CLI 持续报 "gateway closed (1000 normal closure)" 无法添加 cron job

### Error
```
gateway connect failed: Error: gateway closed (1000): 
Error: gateway closed (1000 normal closure): no close reason
Gateway target: ws://127.0.0.1:11789
```

### Context
- Gateway 进程正常运行（PID 可见，端口 11789 监听中）
- 所有 `openclaw cron add` 和其他 CLI 命令均失败
- 重试 5+ 次，加 sleep、换参数格式均无效
- 可能与 gateway 内部 websocket 连接管理有关

### Suggested Fix
直接编辑 `~/.openclaw/cron/jobs.json` + 通知 OPS 重启 gateway

### Resolution
- **Resolved**: 2026-03-21T23:01:00+08:00
- **Notes**: 直接编辑 jobs.json 添加 job，OPS 重启 gateway 后 cron list 确认加载成功

### Metadata
- Reproducible: yes (在同一 session 中 5+ 次)
- Related Files: ~/.openclaw/cron/jobs.json
- See Also: LRN-20260321-012

---

## [ERR-20260322-001] cron_consume_not_execute

**Logged**: 2026-03-22T21:45:00+08:00
**Priority**: critical
**Status**: promoted
**Promoted**: AGENTS.md (2026-03-22)
**Area**: infra

### Summary
Cron isolated session 消费 inbox 消息但不实际执行任务（Dev/QA 均复现）

### Error
```
Agent cron 触发 → inbox receive 消费消息 → 消息进入 archive
→ 但任务未执行（无 commit、无产出）→ HEARTBEAT_OK 返回
→ 消息已删除无法重新消费 → 任务 stalled
```

### Context
- TASK-019 (QA): 消费了但只返回 HEARTBEAT_OK
- TASK-022 (QA): 同样模式
- TASK-102/103/104 (Dev): 11:51~12:10 消费，6+ 小时无进展
- 全页面截图任务 (QA): cron 消费后 6-10 秒返回，未执行 Playwright
- 根因：isolated session 中 CWD 不正确 / exec 返回空 / prompt 未被正确加载（gateway 未重启）

### Suggested Fix
1. inbox.js 改为 peek → execute → ack 模式（防消息丢失）
2. 僵尸任务检测：IN_PROGRESS + inbox 已消费 + N分钟无进展 → stalled → 自动 requeue
3. TASK JSON 增加 `last_progress_at` 字段

### Metadata
- Reproducible: yes
- Related Files: scripts/tasks/inbox.js, scripts/tasks/dispatch-task.js
- Pattern-Key: cron.consume_not_execute
- Recurrence-Count: 4
- First-Seen: 2026-03-22
- Last-Seen: 2026-03-22
- Tags: inbox, cron, stalled, message-loss

---

## [ERR-20260403-001] fix_without_verify

**Logged**: 2026-04-03T22:00:00+08:00
**Priority**: high
**Status**: pending
**Area**: infra

### Summary
OPS 修改配置后 PM 未立即验证，导致假设"已修复"而实际问题仍在

### Error
```
1. OPS 改 QA exec security: allowlist → full, ask: off → Gateway 重启
2. PM 未立即 spawn QA 验证 → 假设修好了
3. 数小时后再测 → QA 仍然 0 tokens
4. 进一步排查：不是 exec 问题（对比 Dev/PO 全通过，QA 全失败）
5. 真正根因未定位（可能是 Gateway 对 QA agent 的内部状态异常）
```

### Context
- QA 0 tokens 问题贯穿全天下午（18:45~20:36）
- 排除了 exec config、model、agentDir 三个假设
- 重启前 QA 成功过一次（20:17），重启后全部失败

### Suggested Fix
- **修复后必须立即验证**：OPS 改完配置 → PM 立即跑最简单的验证测试
- 验证通过后再继续后续任务
- "改了就假设好了" = 浪费时间

### Metadata
- Reproducible: yes
- Pattern-Key: pm.fix_without_verify
- Recurrence-Count: 1
- First-Seen: 2026-04-03
- Last-Seen: 2026-04-03
- Tags: verification, ops, qa, config-change

---

## [ERR-20260322-002] pm_patrol_gateway_restart

**Logged**: 2026-03-22T21:45:00+08:00
**Priority**: critical
**Status**: resolved
**Area**: infra

### Summary
PM 巡检 cron 持续执行 systemctl --user stop openclaw-gateway（自杀悖论）

### Error
```
PM 巡检 cron (b7ffaf03) 每 10-15 分钟执行一次 systemctl --user stop openclaw-gateway
今天 20 次（14:02~19:13）
Prompt 层禁令（前 5 行铁律）被模型忽略
根因：prompt 第 10-12 行 "技术问题自己解决" 被理解为授权重启 gateway
```

### Context
- agentId 配错为 `po`（不是 pm）
- Prompt 禁令不是 100% 可靠 — LLM 有能力无视指令
- 需要 exec allowlist 技术硬拦截

### Suggested Fix
1. ✅ 删除 "技术问题自己解决" 授权
2. ✅ 改为纯只读脚本 pm-patrol.sh
3. ✅ 修正 agentId: po → pm
4. 🔲 需要 exec allowlist 在 OpenClaw 层面拦截 systemctl

### Resolution
- **Resolved**: 2026-03-22T20:40:00+08:00
- **Commit**: dd89264 (pm-patrol.sh)
- **Notes**: 纯只读巡检脚本 + agentId 修正 + 频率改为 */10

### Metadata
- Reproducible: yes
- Related Files: pm-patrol.sh
- Pattern-Key: pm.patrol_gateway_restart
- Recurrence-Count: 1
- First-Seen: 2026-03-22
- Last-Seen: 2026-03-22
- Tags: cron, gateway, self-destruct, prompt-safety

---

## [ERR-20260415-001] infra_permission_drift_breaks_automation

**Logged**: 2026-04-15T22:00:00+08:00
**Priority**: high
**Status**: resolved
**Area**: infra

### Summary
PM agent 的 tools.deny 包含 exec，导致 HEARTBEAT.md 中所有 node 脚本（pm-heartbeat.js、auto-dispatch.js）成为死代码，主动巡检 24h 完全失效。

### Details
沈老板 04-15 07:46 发现 PM 昨晚承诺的主动巡检没有执行（8 小时无消息）。排查发现：
1. PM agent 的 tools.deny 包含 exec/process，heartbeat 脚本无法运行
2. dispatch-tracker.json 停在 04-14 07:47，24h 未更新
3. "PM 巡检" 和 "PM inbox check" 两个 cron 都被禁用
4. maxConcurrent=1 可能导致 heartbeat 竞争

### Root Cause
权限配置 drift — 某次 gateway 配置变更时 exec 被加入 deny list，但无人验证 heartbeat 脚本是否仍可运行。**配置变更后缺少端到端验证。**

### Fix Applied
- OPS 移除 exec from tools.deny（只保留 process）
- maxConcurrent 1→8
- Gateway 11:48 重启生效
- 11:53 验证 pm-heartbeat.js + auto-dispatch.js 均正常

### Suggested Action
- 配置变更后必须端到端验证关键自动化流程（heartbeat、dispatch、巡检）
- 考虑 healthcheck cron：定期检查 agent 的关键能力（exec、file read/write）是否正常
- tools.deny 变更应有 changelog 记录

### Metadata
- Source: conversation
- Reproducible: yes
- Pattern-Key: infra.permission_drift
- Recurrence-Count: 1
- First-Seen: 2026-04-15
- Last-Seen: 2026-04-15
- Tags: infra, permissions, heartbeat, automation, config-drift

