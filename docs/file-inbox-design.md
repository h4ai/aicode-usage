# 文件 Inbox 机制设计 v1.0

> 决策时间: 2026-03-24 23:02
> 决策人: 沈老板
> 原则: 文件 inbox > 消息 inbox，技术手段 > prompt 规范

## 架构

```
PM 派发任务:
  1. 创建 TASK-XXX.json（已有）
  2. 写 dispatch 文件到目标 Agent 的 inbox/ 目录

Agent Heartbeat:
  1. 扫描自己的 inbox/ 目录
  2. 发现 .dispatch.json 文件 → 读取任务信息
  3. 执行任务
  4. 完成后重命名: .dispatch.json → .done.json
  5. 失败时重命名: .dispatch.json → .failed.json
```

## 目录结构

```
~/.openclaw/workspace-dev/inbox/
  TASK-117.dispatch.json    ← 待执行
  TASK-117.done.json        ← 已完成
  TASK-117.failed.json      ← 失败

~/.openclaw/workspace-qa/inbox/
  TASK-118.dispatch.json    ← 待执行

~/.openclaw/workspace-po/inbox/
  TASK-119.dispatch.json    ← 待执行

~/.openclaw/workspace-monitor/inbox/
  （Monitor 改为纯脚本，不用文件 inbox）

~/.openclaw/workspace-pm/inbox/
  （PM 改为纯脚本巡检，不用文件 inbox）
```

## Dispatch 文件格式

```json
{
  "taskId": "TASK-117",
  "dispatchedAt": "2026-03-24T23:00:00+08:00",
  "dispatchedBy": "pm",
  "targetAgent": "dev",
  "taskFile": "projects/enterprise-skillhub/tasks/TASK-117.json",
  "summary": "一句话任务描述",
  "priority": "normal"
}
```

## Agent Heartbeat 扫描逻辑

每个 Agent 的 HEARTBEAT.md 添加:
```
### 文件 Inbox 检查
1. 扫描 inbox/ 目录下所有 *.dispatch.json 文件
2. 按 dispatchedAt 时间排序（先进先出）
3. 读取 dispatch 文件 → 读取对应 TASK JSON → 执行任务
4. 执行完毕 → 重命名为 .done.json（包含完成时间和结果摘要）
5. 执行失败 → 重命名为 .failed.json（包含错误信息）
```

## 改造范围

| Agent | Heartbeat | Inbox |
|-------|-----------|-------|
| PM | 禁用 cron → 纯脚本 | 不需要 inbox |
| Monitor | 禁用 cron → 纯脚本 | 不需要 inbox |
| Dev | 保留 heartbeat 10m | 文件 inbox |
| QA | 保留 heartbeat 10m | 文件 inbox |
| PO | 保留 heartbeat 10m | 文件 inbox |
| SA | 保留 heartbeat 30m | 文件 inbox |
| OPS | 保留 heartbeat 10m | 不变 |

## 优势
- 文件不因 Gateway 重启丢失
- 无 destructive read 问题
- 可追溯（.done/.failed 文件留痕）
- PM 只需文件写入权限
- 简单可靠
