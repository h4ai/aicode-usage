#!/bin/bash
# update-dispatch-tracker.sh — 方案 C: dispatch-tracker.json 脚本化更新
# 每 10 分钟扫描 Dev/QA/PO/SA inbox，更新 dispatch-tracker.json
# cron: */10 * * * * /home/azureuser/.openclaw/workspace-pm/scripts/update-dispatch-tracker.sh

TRACKER="/home/azureuser/.openclaw/workspace-pm/memory/dispatch-tracker.json"
LOG="/data/.openclaw/logs/dispatch-tracker.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

mkdir -p "$(dirname "$LOG")"

echo "[$TIMESTAMP] updating dispatch-tracker..." >> "$LOG"

python3 - << 'PYEOF'
import json, os, glob, sys
from datetime import datetime, timezone, timedelta

tracker_path = "/home/azureuser/.openclaw/workspace-pm/memory/dispatch-tracker.json"
agents = ['dev', 'qa', 'po', 'sa']

# 加载旧 tracker（保留历史摘要字段）
old_tracker = {}
if os.path.exists(tracker_path):
    try:
        old_tracker = json.load(open(tracker_path))
    except:
        pass

# 扫描各 agent inbox
dispatches = {}
total_pending = 0
total_done = 0
total_failed = 0

for agent in agents:
    inbox = f'/home/azureuser/.openclaw/workspace-{agent}/inbox'
    dispatches[agent] = {}
    if not os.path.isdir(inbox):
        continue
    for f in sorted(glob.glob(f'{inbox}/*.dispatch.json')):
        fname = os.path.basename(f)
        try:
            d = json.load(open(f))
            status = d.get('status', 'unknown')
            dispatches[agent][fname] = {
                'status': status,
                'taskId': d.get('taskId', d.get('id', '')),
                'title': d.get('title', '')[:60],
                'created_at': d.get('created_at', ''),
            }
            if status in ('pending', 'processing'):
                total_pending += 1
            elif status == 'done':
                total_done += 1
            elif status == 'failed':
                total_failed += 1
        except Exception as e:
            dispatches[agent][fname] = {'status': 'parse_error', 'error': str(e)}

# 写入新 tracker
tz_cst = timezone(timedelta(hours=8))
new_tracker = {
    'last_updated': datetime.now(tz_cst).strftime('%Y-%m-%dT%H:%M:%S+08:00'),
    'summary': {
        'total_pending': total_pending,
        'total_done': total_done,
        'total_failed': total_failed,
    },
    'dispatches': dispatches,
}

json.dump(new_tracker, open(tracker_path, 'w'), indent=2, ensure_ascii=False)
print(f"OK: updated {tracker_path}, pending={total_pending} done={total_done} failed={total_failed}")
PYEOF

EXIT_CODE=$?
echo "[$TIMESTAMP] exit=$EXIT_CODE" >> "$LOG"
exit $EXIT_CODE
