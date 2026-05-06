#!/bin/bash
# Monitor Patrol Cron Script — 纯脚本巡检
# 不经过 agent session，彻底避免 systemctl 自杀问题
# 用法: 5,35 * * * * /home/azureuser/.openclaw/workspace-pm/scripts/monitor-patrol-cron.sh

set -euo pipefail

WORKSPACE="/home/azureuser/.openclaw/workspace-dev/projects/enterprise-skillhub"
GROUP_CHAT="oc_b03d3f9e04ccf155c68fdfaba7c692a0"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M')
LOG_PREFIX="[monitor-cron $TIMESTAMP]"

echo "$LOG_PREFIX Starting monitor patrol..."

# 执行巡检脚本
PATROL_RESULT=""
if [ -f "$WORKSPACE/scripts/tasks/patrol.js" ]; then
    PATROL_RESULT=$(node "$WORKSPACE/scripts/tasks/patrol.js" --json 2>/dev/null) || true
    if [ -z "$PATROL_RESULT" ]; then
        PATROL_RESULT='{"error":"patrol.js produced no output"}'
    fi
fi

# 解析结果（用独立 Python 脚本）
PARSER="$SCRIPT_DIR/parse-patrol.py"
REPORT=$(echo "$PATROL_RESULT" | python3 "$PARSER" patrol 2>/dev/null || echo "⚠️ Monitor 巡检脚本解析失败")

# 添加前缀
REPORT="【监督官·自动】$TIMESTAMP
$REPORT"

# 只在有违规时发送到群（减少刷屏）
if echo "$REPORT" | grep -qE "❌|🚨|🔴"; then
    echo "$LOG_PREFIX Sending alert..."
    openclaw message send \
        --channel feishu \
        --target "chat:$GROUP_CHAT" \
        --message "$REPORT" 2>/dev/null || echo "$LOG_PREFIX Failed to send"
else
    echo "$LOG_PREFIX All clear."
fi

echo "$LOG_PREFIX Done."
