# AI Code Usage API Reference

Base URL: `$AICODE_BASE_URL` (default: `http://localhost:8002`)  
Auth: `Authorization: Bearer <PAT>`  
All responses: JSON. Errors: `{"error": "...", "message": "...", "code": N}`

---

## Personal Endpoints (any valid PAT)

### GET /api/v1/usage/summary

用量汇总。

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| scope | string | month | `month` / `week` / `today` |
| time_filter | string | all | `all` / `work` / `non_work` |

**Response (month):**
```json
{
  "total_token": 123456,
  "request_count": 890,
  "active_days": 18,
  "daily_avg_token": 6858,
  "chat_count": 234
}
```

**Response (today/week):** `total_token`, `request_count`, `chat_count`（week 含 `daily_avg_token`）

---

### GET /api/v1/usage/detail

使用明细列表（按日期+模型分组）。

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| start | date | 30天前 | YYYY-MM-DD |
| end | date | 今天 | YYYY-MM-DD |
| days | int | 30 | start/end 未指定时的回溯天数 |
| model | string | — | 过滤模型名 |
| ide_type | string | — | 过滤 IDE 类型 |
| sort_by | string | — | `date`/`model`/`request_count`/`input_token`/`output_token`/`total_token` |
| sort_order | string | desc | `asc` / `desc` |

**Response:** 数组，每项：
```json
{
  "date": "2026-04-22",
  "model": "claude-sonnet-4",
  "ide_type": "cursor",
  "request_count": 45,
  "input_token": 80000,
  "output_token": 20000,
  "total_token": 100000
}
```

---

### GET /api/v1/usage/quota

配额状态。

**Response:**
```json
{
  "quota_level": "L2",
  "monthly_token_used": 123456,
  "monthly_token_limit": 500000,
  "monthly_token_pct": 24.7,
  "daily_requests_used": 45,
  "daily_requests_limit": 200,
  "daily_requests_pct": 22.5
}
```

`monthly_token_limit=0` 表示不限制。

---

## Admin Endpoints (admin PAT only)

### GET /api/v1/admin/leaderboard

排行榜（分页）。

| 参数 | 默认 | 说明 |
|------|------|------|
| top | — | 只返回前N名 |
| time_filter | all | `all`/`work`/`non_work` |
| start/end | — | 日期范围 |
| page | 1 | 页码 |
| page_size | 50 | 每页条数（最大500）|

**Response:** `{"total": N, "page": 1, "page_size": 50, "items": [...]}`

---

### GET /api/v1/admin/users

用户列表（分页）。

| 参数 | 默认 | 说明 |
|------|------|------|
| page | 1 | 页码 |
| page_size | 50 | 每页条数 |
| year | — | 年份筛选 |
| month | — | 月份筛选 |

**Response:** `{"total": N, "page": 1, "page_size": 50, "items": [...]}`

---

### GET /api/v1/admin/department-summary

部门用量汇总。

| 参数 | 默认 | 说明 |
|------|------|------|
| time_filter | all | `all`/`work`/`non_work` |
| start/end | — | 日期范围 |
| group_by | — | 分组字段 |

**Response:** 数组，每项包含部门名 + 用量统计。

---

## PAT Management

### POST /api/tokens

创建 PAT（需要 JWT 登录，不支持 PAT 认证）。

```json
// Request
{"name": "my-agent-token", "expires_months": 3}

// Response (token 仅显示一次)
{"id": 1, "name": "my-agent-token", "token": "pat_Abc123...", "role": "user", "expires_at": "2026-07-23T..."}
```

### GET /api/tokens

列出我的 PAT（不返回明文 token）。

### DELETE /api/tokens/{id}

撤销 PAT（立即失效）。

---

## Python Helper

```python
import os, json
from urllib.request import Request, urlopen
from urllib.error import HTTPError

def aicode_query(path: str, params: dict = None) -> dict:
    """Query AI Code Usage API with PAT auth."""
    base = os.environ.get("AICODE_BASE_URL", "http://localhost:8002")
    pat = os.environ.get("AICODE_PAT") or _load_config_pat()
    if not pat:
        raise RuntimeError("Set AICODE_PAT env var or ~/.aicode-usage.conf")
    
    url = f"{base}{path}"
    if params:
        from urllib.parse import urlencode
        url += "?" + urlencode({k: v for k, v in params.items() if v is not None})
    
    req = Request(url, headers={"Authorization": f"Bearer {pat}"})
    try:
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except HTTPError as e:
        body = json.loads(e.read())
        raise RuntimeError(f"API error {e.code}: {body.get('message', body)}") from e

def _load_config_pat() -> str | None:
    conf = os.path.expanduser("~/.aicode-usage.conf")
    if not os.path.exists(conf):
        return None
    for line in open(conf):
        if line.startswith("PAT="):
            return line.strip()[4:]
    return None

# Usage examples:
# aicode_query("/api/v1/usage/summary")
# aicode_query("/api/v1/usage/summary", {"scope": "today"})
# aicode_query("/api/v1/usage/quota")
# aicode_query("/api/v1/usage/detail", {"days": 7, "sort_by": "total_token"})
# aicode_query("/api/v1/admin/leaderboard", {"top": 10})  # admin only
```
