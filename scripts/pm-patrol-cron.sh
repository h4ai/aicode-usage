#!/bin/bash
# PM Patrol Cron Script — 项目管理巡检
# 职责：门禁推进 + 任务派发 + 阻塞跟进 + 反思 cron 监控
# 不包含合规检查（那是 Monitor 的活）
# 用法: 0 11,17 * * * /home/azureuser/.openclaw/workspace-pm/scripts/pm-patrol-cron.sh

set -euo pipefail

WORKSPACE="/home/azureuser/.openclaw/workspace-dev/projects/enterprise-skillhub"
GROUP_CHAT="oc_b03d3f9e04ccf155c68fdfaba7c692a0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
LOG_PREFIX="[pm-patrol $TIMESTAMP]"

echo "$LOG_PREFIX Starting PM patrol..."
PARSER="$SCRIPT_DIR/parse-patrol.py"

# Step 1: 门禁 + 派发检测（PM 核心职责）
HEARTBEAT_RESULT=""
if [ -f "$WORKSPACE/scripts/tasks/pm-heartbeat.js" ]; then
    HEARTBEAT_RESULT=$(node "$WORKSPACE/scripts/tasks/pm-heartbeat.js" --json 2>/dev/null) || true
    if [ -z "$HEARTBEAT_RESULT" ]; then
        HEARTBEAT_RESULT='{"error":"pm-heartbeat.js produced no output"}'
    fi
    echo "$LOG_PREFIX pm-heartbeat.js done"
fi
GATE_INFO=$(echo "$HEARTBEAT_RESULT" | python3 "$PARSER" heartbeat 2>/dev/null || echo "门禁检测解析失败")

# Step 2: 任务状态概览（从 TASK JSON 直接统计，不调 patrol.js）
TASK_SUMMARY=$(python3 "$PARSER" task_summary 2>/dev/null || echo "任务统计失败")
echo "$LOG_PREFIX task summary done"

# Step 3: 每日反思 cron 状态检查
RETRO_INFO=$(python3 "$PARSER" retro 2>/dev/null || echo "⚠️ 反思状态检查失败")
echo "$LOG_PREFIX retro check done"

# Step 4: 组装报告
MESSAGE="【PM巡检·自动】$TIMESTAMP
$TASK_SUMMARY
$GATE_INFO
$RETRO_INFO"

# 只在有待办或异常时发送（避免刷屏）
if echo "$GATE_INFO" | grep -qE "📋|✅|❌" || echo "$RETRO_INFO" | grep -qE "❌|🚨" || echo "$TASK_SUMMARY" | grep -qE "⚠️|🔴"; then
    echo "$LOG_PREFIX Sending report to group..."
    openclaw message send \
        --channel feishu \
        --target "chat:$GROUP_CHAT" \
        --message "$MESSAGE" 2>/dev/null || echo "$LOG_PREFIX Failed to send message"
else
    echo "$LOG_PREFIX All clear, no report needed."
fi

echo "$LOG_PREFIX Done."
