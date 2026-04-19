# 001 — AI Code Usage 系统需求规范（GEARS 格式）

> Format: GEARS (AI-Ready Spec Syntax)
> Syntax: `[Where <static precondition>] [While <stateful precondition>] [When <trigger>] The <subject> shall <behavior>`
> Source: requirements.md v0.7

---

## Authentication

```gears
When the user submits username and password,
the authentication service shall validate credentials against the enterprise AD (LDAP, port 389)
and return a signed JWT token (TTL 8 hours) on success.

Where the user is a regular user,
when LDAP authentication succeeds,
the system shall match the submitted credential against ClickHouse `userId` field
using either `username` (domain account) or `userNickname` (display name).

When LDAP authentication fails,
the authentication service shall return HTTP 401 with message "用户名或密码错误"
and shall not issue a JWT token.

While the JWT token is valid,
the API shall enforce `WHERE userId = <current_user>` on all ClickHouse queries.

When the JWT token is absent or expired,
the API shall return HTTP 401 and the frontend shall redirect to the login page.

Where the admin credentials are configured in config.yaml,
when the admin submits matching username and bcrypt-verified password,
the system shall issue a JWT with admin role.

When the admin password_hash in config.yaml is modified,
the system shall invalidate all existing admin JWT tokens immediately.
```

---

## Quota System

```gears
Where quota levels L1, L2, L3 are configured in PostgreSQL,
the system shall enforce exactly three fixed levels (L1/L2/L3)
and shall not allow creation or deletion of levels.

When an admin modifies a quota level's token limit or request limit,
the quota service shall apply the new limits immediately without restart.

Where a user has no assigned quota level,
the system shall default the user to L1.

When a user logs in for the first time via AD,
the system shall create a user record in PostgreSQL with default level L1.

Where the quota period is a calendar month (server timezone),
the quota counter shall reset to zero at 00:00 on the 1st of each month.

Where the daily request limit is configured,
the daily counter shall reset to zero at 00:00 each day (server timezone).

Where monthly token usage is below 50% of quota,
the dashboard shall display a green progress bar with text "使用正常".

Where monthly token usage is between 50% and 79% of quota,
the dashboard shall display a yellow progress bar with text "已使用{x}%，请注意控制用量".

Where monthly token usage is between 80% and 99% of quota,
the dashboard shall display an orange progress bar with text "已使用{x}%，即将达到上限".

Where monthly token usage reaches or exceeds 100% of quota,
the dashboard shall display a red progress bar with text "已超出月度限额，请联系管理员".

Where daily request count reaches or exceeds 100% of limit,
the dashboard shall display a red progress bar with text "今日请求次数已超出限额".

The system shall NOT block API calls when quota is exceeded; alerts are informational only.
```

---

## Email Notification

```gears
Where APScheduler is running,
the notification service shall check all users' monthly token usage every hour.

Where a user's monthly token usage first reaches 80% of their quota,
and the user has not been notified in the current calendar month,
the notification service shall send an email to the user's AD mail attribute.

Where the AD mail attribute is unavailable for a user,
the notification service shall skip that user and log a warning.

Where SMTP sending fails,
the notification service shall NOT mark the notification as sent
and shall retry in the next scheduled run.
```

---

## Personal Dashboard

```gears
When a regular user opens the dashboard,
the dashboard shall display:
  - monthly token usage progress bar
  - daily request count progress bar
  - four metric cards (cumulative token / request count / active days / daily average token)
  - three tabs: 趋势图 / 列表 / 模型分布

When the user switches between "本月" and "今日" view,
the metric cards shall recalculate for the selected scope.

Where the view is "今日",
the system shall hide "活跃天数" and display "今日Token" instead.

The three tabs shall maintain independent time filter state.

Where the user requests CSV export with a date range exceeding 3 months,
the API shall return HTTP 400 with message prompting the user to shorten the range.
```

---

## Admin Dashboard

```gears
Where the current user has admin role,
the system shall display admin menu:
  用户管理 / 配额级别管理 / 全局趋势 / 部门汇总 / 用量排行榜.

Where the current user does not have admin role,
the system shall not render or expose any admin menu items.

When an admin modifies a user's quota level,
the change shall take effect immediately.

When an admin modifies a quota level's limits,
the system shall apply new limits to all users of that level immediately.

The leaderboard (用量排行榜) shall be visible to admin users only.
```

---

## System

```gears
The system shall expose GET /health returning status of ClickHouse, PostgreSQL, and LDAP connections.

Where config.yaml changes are detected by watchdog,
the system shall hot-reload admin credentials and SMTP configuration without restart.

The backend shall log all admin operations to application log (no UI needed).

Where the application is deployed,
the frontend shall run on port 3002 and the backend on port 8002
via Docker Compose.

The system shall support both direct internal IP access and domain-based access via Nginx reverse proxy.
```
