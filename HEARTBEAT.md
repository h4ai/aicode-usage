# HEARTBEAT.md — PM Agent

## 优先级（严格按顺序执行）

```
优先级 1: 扫描文件 inbox（每 10 分钟，最高优先级！）
优先级 2: 门禁检查（REVIEW → DONE 推进）
优先级 3: 自动派发（依赖满足的任务自动写 dispatch）
优先级 4: 任务状态跟进（催促 blocked/超时任务）
优先级 5: 无事可做 → HEARTBEAT_OK
```

## Step 0: 扫描文件 Inbox（最高优先级！）

扫描 `inbox/` 目录下所有 `*.dispatch.json` 文件：

```
目录: /home/azureuser/.openclaw/workspace-pm/inbox/
文件: *.dispatch.json
```

**扫描逻辑：**
1. 用 `read` tool 读取 `inbox/` 目录，找所有 `.dispatch.json` 文件
2. 按 `created_at` 时间排序（先进先出）
3. 对每个 dispatch 文件：
   a. 读取 dispatch JSON，获取任务内容
   b. 将 dispatch 文件中 `status` 改为 `"processing"`
   c. 执行任务（可能是门禁通知、打回通知、Dev 完成通知等）
   d. 完成后：用 `write` 写 `.done.json` 文件
   e. 失败时：用 `write` 写 `.failed.json` 文件

**典型 inbox 消息类型：**
- `task_done` — Dev/QA 完成任务通知 → PM 执行门禁检查
- `gate_fail` — 门禁失败通知 → PM 打回任务
- `review_request` — 请求 PM 审查
- `escalation` — Monitor 违规升级通知

## Step 0.5: 跨 Agent Dispatch 状态追踪（主动巡检！）

**目的：主动发现 Dev/QA/PO 任务完成，立即行动（门禁/派发/汇报）。不等人催！**

**扫描目录：**
- `/home/azureuser/.openclaw/workspace-dev/inbox/*.dispatch.json`
- `/home/azureuser/.openclaw/workspace-qa/inbox/*.dispatch.json`
- `/home/azureuser/.openclaw/workspace-po/inbox/*.dispatch.json`

**对每个 dispatch 文件，检查 status 字段：**

| dispatch status | 行动 |
|----------------|------|
| `done` | 立即执行门禁检查（Step 1），通过则推进 TASK status，失败则写打回 dispatch |
| `failed` | 读取失败原因，评估是否需要重派或升级 |
| `processing` | 检查 `processing_at` 是否超过 2 小时，超时则标记告警 |
| `pending` | 正常，等待 Agent 拾取 |

**状态对比（检测变化）：**
1. 读取 `memory/dispatch-tracker.json`（上次各 dispatch 的 status 快照）
2. 对比当前 status，找出**状态变化**的 dispatch
3. 有变化 → 执行对应行动 + 在群聊汇报
4. 无变化 → 跳过，继续下一步
5. 更新 `memory/dispatch-tracker.json` 为当前快照

**汇报格式（发到群聊）：**
```
【PM巡检】检测到 dispatch 状态变化：
• TASK-XXX [Dev] pending → done ✅ → 门禁检查中...
• TASK-YYY [QA] pending → processing 🔄
```

**⚠️ 核心原则：有变化就行动+汇报，没变化就安静跳过。**

## Step 1: 门禁检查

```bash
node projects/enterprise-skillhub/scripts/tasks/pm-heartbeat.js --json
```

- `gate_passed` → 推进 TASK status 为 DONE
- `gate_failed` → 打回 TASK，通过 dispatch 文件通知 Dev
- `dispatchable` → 有可派发的新任务

## Step 2: 自动派发（跨 Agent 依赖编排）

运行 auto-dispatch 脚本，自动检查 PENDING/BLOCKED 任务的依赖是否满足，满足则自动写 dispatch 到对应 Agent 的 inbox：

```bash
node projects/enterprise-skillhub/scripts/tasks/auto-dispatch.js --json
```

**脚本逻辑（已由 Dev 实现，commit 21c103a）：**
1. 扫描所有 TASK JSON，找 status=PENDING 或 BLOCKED
2. 按 priority (P0>P1>P2) + created_at 排序
3. 检查每个任务的 dependencies 是否全部 DONE
4. 依赖满足 → 写 dispatch 到 `workspace-${assignee}/inbox/`
5. **防重复**：inbox 中已有同 taskId 的 active dispatch 则跳过

**输出解读：**
- `dispatched` 数组 → 本轮自动派发的任务（记录到 memory）
- `skipped` 数组 → 已有 dispatch 或依赖未满足的任务
- `errors` 数组 → 如有错误，记录到 memory 并通知群聊

> 💡 这是兜底机制（Layer 1）。Agent 完成任务时 cascade-dispatch.js 会零延迟触发下游（Layer 2）。
> 两层不冲突：cascade 先写 dispatch，auto-dispatch 检查到已有则跳过。

## Step 3: 任务状态跟进

检查 IN_PROGRESS 任务是否超时或阻塞。

## Step 4: 无事可做

回复 HEARTBEAT_OK

## PM session key
```
agent:pm:feishu:group:oc_b03d3f9e04ccf155c68fdfaba7c692a0
```

## ⚠️ 绝对禁止
- 禁止执行 `systemctl` 相关命令
- 禁止执行 `openclaw gateway restart/stop`
