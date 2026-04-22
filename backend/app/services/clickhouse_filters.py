# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""ClickHouse query filter helpers."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.config import get_config
from app.data_schema import USERNAME

# ---------------------------------------------------------------------------
# Base event filter (applied to all queries)
# ---------------------------------------------------------------------------

_BASE_FILTER = (
    "eventCode IN ('chat_request_response', 'chat_message_response')"
    " AND totalToken > 0"
)


def _user_filter(user: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Build a ClickHouse WHERE fragment that matches a user across 3 userNickname formats.

    ClickHouse userNickname field may contain any of:
      - sAMAccountName only, e.g. "aaa"
      - CN (display name) only, e.g. "张三"
      - composite "张三(aaa)" format

    Args:
        user: dict with keys 'sam' (sAMAccountName), 'cn' (AD cn), 'nickname' (displayName).
              Falls back to 'sub' (JWT sub) when sam/cn absent.

    Returns:
        (sql_fragment, params_dict)
    """
    sam = user.get("sam") or user.get("sub", "")
    cn = user.get("cn") or ""
    nickname = user.get("nickname") or ""

    conditions = []
    params: dict[str, Any] = {}

    if sam:
        conditions.append(f"lower({USERNAME}) = lower({{_u_sam:String}})")
        params["_u_sam"] = sam
        conditions.append(f"endsWith(lower({USERNAME}), lower(concat('(', {{_u_sam:String}}, ')')))")
        params["_u_sam"] = sam

    if cn and cn != sam:
        conditions.append(f"lower({USERNAME}) = lower({{_u_cn:String}})")
        params["_u_cn"] = cn

    if nickname and nickname not in (sam, cn):
        conditions.append(f"lower({USERNAME}) = lower({{_u_nick:String}})")
        params["_u_nick"] = nickname

    if not conditions:
        # fallback: match nothing safely
        conditions.append("1=0")

    return f"({' OR '.join(conditions)})", params


# ---------------------------------------------------------------------------
# Working-hours filter
# ---------------------------------------------------------------------------

def _today_shanghai() -> str:
    """Return today's date in Asia/Shanghai timezone (YYYY-MM-DD)."""
    tz_sh = timezone(timedelta(hours=8))
    return datetime.now(tz=tz_sh).date().isoformat()


def _working_hours_filter(time_filter: str = "auto") -> str:
    """Return ClickHouse WHERE clause fragment for time range filter.

    time_filter values:
      "auto"     - use config working_hours.enabled to decide
      "work"     - force working hours only
      "non_work" - force non-working hours only
      "all"      - no filter (full day)
    """
    cfg = get_config().get("working_hours", {})
    start = cfg.get("start", "08:30")
    end = cfg.get("end", "18:00")
    sh, sm = map(int, start.split(":"))
    eh, em = map(int, end.split(":"))
    start_sec = sh * 3600 + sm * 60
    end_sec = eh * 3600 + em * 60

    time_expr = (
        "toHour(toDateTime(timestamp / 1000, 'Asia/Shanghai')) * 3600 +"
        " toMinute(toDateTime(timestamp / 1000, 'Asia/Shanghai')) * 60"
    )

    effective = time_filter
    if effective == "auto":
        effective = "work" if cfg.get("enabled", False) else "all"
    # If admin disabled time filter, downgrade work/non_work to all
    if not cfg.get("enabled", False) and effective in ("work", "non_work"):
        effective = "all"

    # toDayOfWeek: 1=Mon ... 5=Fri, 6=Sat, 7=Sun
    dow_expr = "toDayOfWeek(toDateTime(timestamp / 1000, 'Asia/Shanghai'))"
    weekday_only = cfg.get("weekday_only", True)

    if effective == "work":
        if weekday_only:
            return (
                f" AND {dow_expr} BETWEEN 1 AND 5"
                f" AND {time_expr} >= {start_sec} AND {time_expr} < {end_sec}"
            )
        else:
            return f" AND {time_expr} >= {start_sec} AND {time_expr} < {end_sec}"
    elif effective == "non_work":
        if weekday_only:
            return f" AND ({dow_expr} > 5 OR {time_expr} < {start_sec} OR {time_expr} >= {end_sec})"
        else:
            return f" AND ({time_expr} < {start_sec} OR {time_expr} >= {end_sec})"
    else:
        return ""


def _month_range(year: int, month: int) -> tuple[str, str]:
    """Return (start, end) ISO strings for the given year/month."""
    import calendar
    start = date(year, month, 1).isoformat()
    last_day = calendar.monthrange(year, month)[1]
    end = date(year, month, last_day).isoformat()
    return start, end
