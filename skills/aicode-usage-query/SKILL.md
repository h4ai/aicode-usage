---
name: aicode-usage-query
description: |
  Query AI code usage data via PAT (Personal Access Token) API for the ai-code-usage system.
  Use when user asks about their own AI usage statistics (tokens, requests, quota), admin queries
  leaderboard/user list/department summary, or user wants to check quota status or usage trends.
  Supports both personal users and admins. Configure PAT via AICODE_PAT env var or config file.
  Triggers on: 查询AI用量, 我的token使用, 配额还剩多少, 排行榜, 用量统计, usage query,
  check my quota, AI code usage, how many tokens did I use, show leaderboard.
---

# AI Code Usage Query Skill

Query personal or admin AI usage data via PAT API.

## Configuration

Set PAT before use. Two options:

**Option A — Environment variable:**
```bash
export AICODE_PAT="pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
export AICODE_BASE_URL="http://your-server:8002"  # default: http://localhost:8002
```

**Option B — Config file (`~/.aicode-usage.conf`):**
```
PAT=pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
BASE_URL=http://your-server:8002
```

To get a PAT: log in to the web UI → top-right dropdown → "API Token" → create token.

## Execution — Always Use Scripts

**Never write inline HTTP code.** Always call the bundled scripts for deterministic execution:

```bash
# Personal usage summary (scope: month/week/today)
python3 scripts/query.py summary --scope month

# Quota status
python3 scripts/query.py quota

# Usage detail (last N days, optional filters)
python3 scripts/query.py detail --days 30 --sort-by total_token

# Usage detail with date range
python3 scripts/query.py detail --start 2026-04-01 --end 2026-04-23

# Admin: leaderboard top 10
python3 scripts/query.py leaderboard --top 10

# Admin: user list
python3 scripts/query.py users

# Admin: department summary
python3 scripts/query.py department-summary
```

Scripts read `AICODE_PAT` and `AICODE_BASE_URL` from environment or `~/.aicode-usage.conf`.  
Output is formatted JSON printed to stdout. Non-zero exit on error.

## Error Handling

| Code | Meaning | Action |
|------|---------|--------|
| 401 | Invalid/expired PAT | Re-generate PAT in web UI |
| 403 | Admin-only endpoint | Use admin PAT |
| 429 | Rate limit (100 req/min) | Wait 60s, retry |

## API Reference

See `references/api.md` for full endpoint specs and response schemas.
