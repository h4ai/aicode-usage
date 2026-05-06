#!/bin/bash
# cascade-retry-cron.sh — 方案 B: QA 失败 → Dev hotfix 自动闭环 cron
# 每 10 分钟扫描 failed dispatch，自动向 Dev 发 hotfix 任务
# cron: */10 * * * * /home/azureuser/.openclaw/workspace-pm/scripts/cascade-retry-cron.sh

WORKSPACE="/home/azureuser/.openclaw/workspace-pm/projects/enterprise-skillhub"
LOG="/data/.openclaw/logs/cascade-retry.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$(dirname "$LOG")"

echo "[$TIMESTAMP] cascade-retry starting..." >> "$LOG"

RESULT=$(cd "$WORKSPACE" && node scripts/tasks/cascade-retry.js --json 2>&1)
EXIT_CODE=$?

echo "[$TIMESTAMP] exit=$EXIT_CODE result=$RESULT" >> "$LOG"

HOTFIXED=$(echo "$RESULT" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    items = d.get('hotfix_dispatched', [])
    if items:
        for item in items:
            print(f\"  -> TASK {item.get('taskId')} from {item.get('fromAgent')} to Dev hotfix\")
except:
    pass
" 2>/dev/null)

if [ -n "$HOTFIXED" ]; then
    echo "[$TIMESTAMP] hotfix dispatched:" >> "$LOG"
    echo "$HOTFIXED" >> "$LOG"
fi

exit $EXIT_CODE
