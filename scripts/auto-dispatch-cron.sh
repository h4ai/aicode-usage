#!/bin/bash
# auto-dispatch-cron.sh — 方案 A: auto-dispatch.js 独立 cron
# 每 10 分钟自动扫描 PENDING/BLOCKED 任务，依赖满足时自动派发到 Agent inbox
# cron: */10 * * * * /home/azureuser/.openclaw/workspace-pm/scripts/auto-dispatch-cron.sh

WORKSPACE="/home/azureuser/.openclaw/workspace-pm/projects/enterprise-skillhub"
LOG="/data/.openclaw/logs/auto-dispatch.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# 确保日志目录存在
mkdir -p "$(dirname "$LOG")"

echo "[$TIMESTAMP] auto-dispatch starting..." >> "$LOG"

# 运行 auto-dispatch.js
RESULT=$(cd "$WORKSPACE" && node scripts/tasks/auto-dispatch.js --json 2>&1)
EXIT_CODE=$?

echo "[$TIMESTAMP] exit=$EXIT_CODE result=$RESULT" >> "$LOG"

# 如果有派发动作，写入明细
DISPATCHED=$(echo "$RESULT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    dispatched = d.get('dispatched', [])
    if dispatched:
        for item in dispatched:
            print(f\"  -> TASK {item.get('taskId')} to {item.get('targetAgent')} ({item.get('trigger')})\")
except:
    pass
" 2>/dev/null)

if [ -n "$DISPATCHED" ]; then
    echo "[$TIMESTAMP] dispatched:" >> "$LOG"
    echo "$DISPATCHED" >> "$LOG"
fi

exit $EXIT_CODE
