# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""ClickHouse query helpers with TTL caching.

Uses clickhouse_connect (HTTP protocol, port 8123) for broad compatibility
and to avoid native protocol issues in air-gapped environments.
"""

from __future__ import annotations

import logging
import math
from datetime import date, datetime, timedelta, timezone
from typing import Any

from cachetools import TTLCache
from clickhouse_connect import get_client as _ch_get_client

from app.config import get_config
from app.data_schema import (
    ENTERPRISE,
    EVENT_CODE,
    EVENT_DATE,
    IDE_TYPE,
    INPUT_TOKEN,
    OUTPUT_TOKEN,
    REQUEST_MODEL_NAME,
    TOTAL_TOKEN,
    USER_ID,
    USERNAME,
)

# NOTE: events table has a column named "userNickname" (not part of data_schema constants)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Safe numeric converters (handle NaN / None from ClickHouse aggregates)
# ---------------------------------------------------------------------------

def _safe_int(value: Any, default: int = 0) -> int:
    """Convert value to int, returning default for None / NaN / Inf."""
    if value is None:
        return default
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return default
        return int(f)
    except (TypeError, ValueError):
        return default


def _safe_float(value: Any, default: float = 0.0) -> float:
    """Convert value to float, returning default for None / NaN / Inf."""
    if value is None:
        return default
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return default
        return f
    except (TypeError, ValueError):
        return default


# ---------------------------------------------------------------------------
# ClickHouse client
# ---------------------------------------------------------------------------

def _get_client():
    cfg = get_config().get("clickhouse", {})
    return _ch_get_client(
        host=cfg.get("host", "localhost"),
        port=cfg.get("port", 8123),       # HTTP port
        database=cfg.get("database", "otel"),
        username=cfg.get("user", "default"),  # clickhouse_connect uses 'username'
        password=cfg.get("password", ""),
    )


# 5-minute TTL cache, max 1024 entries
_cache: TTLCache[str, Any] = TTLCache(maxsize=1024, ttl=300)


# ---------------------------------------------------------------------------
# Base event filter (applied to all queries)
# ---------------------------------------------------------------------------

_BASE_FILTER = (
    "eventCode IN ('chat_request_response', 'chat_message_response')"
    " AND totalToken > 0"
)


def _user_filter(user: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    """Build a ClickHouse WHERE fragment that matches a user across 3 username formats.

    ClickHouse username field may contain any of:
      - sAMAccountName only, e.g. "aaa"
      - CN (display name) only, e.g. "张三"
      - composite "张三(aaa)" format

    Args:
        user: dict with keys 'sam' (sAMAccountName) and 'cn' (AD cn).
              Falls back to 'sub' (JWT sub) when sam/cn absent.

    Returns:
        (sql_fragment, params_dict)
    """
    sam = user.get("sam") or user.get("sub", "")
    cn = user.get("cn") or ""

    conditions = []
    params: dict[str, Any] = {}

    if sam:
        conditions.append(f"{USERNAME} = {{_u_sam:String}}")
        params["_u_sam"] = sam
        conditions.append(f"{USERNAME} LIKE {{_u_like:String}}")
        params["_u_like"] = f"%({sam})"

    if cn and cn != sam:
        conditions.append(f"{USERNAME} = {{_u_cn:String}}")
        params["_u_cn"] = cn

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


# ---------------------------------------------------------------------------
# Query helpers
# ---------------------------------------------------------------------------

def get_monthly_token_usage(user: dict[str, Any], time_filter: str = "all") -> int:
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"monthly_token:{_uid}:{month_start}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    client = _get_client()
    sql = (
        f"SELECT sum({TOTAL_TOKEN}) FROM events"
        f" WHERE {user_cond}"
        f" AND event_date >= {{start:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
    )
    params = {**user_params, "start": month_start}
    rows = client.query(sql, parameters=params).result_rows
    total = _safe_int(rows[0][0]) if rows else 0
    _cache[cache_key] = total
    return total


def get_monthly_request_count(user: dict[str, Any], time_filter: str = "all") -> int:
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"monthly_req:{_uid}:{month_start}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    client = _get_client()
    sql = (
        f"SELECT count() FROM events"
        f" WHERE {user_cond}"
        f" AND event_date >= {{start:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
    )
    params = {**user_params, "start": month_start}
    rows = client.query(sql, parameters=params).result_rows
    count = _safe_int(rows[0][0]) if rows else 0
    _cache[cache_key] = count
    return count


def get_weekly_token_usage(user: dict[str, Any], time_filter: str = "all") -> int:
    today = datetime.now(tz=timezone(timedelta(hours=8))).date()
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"weekly_token:{_uid}:{week_start}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    client = _get_client()
    sql = (
        f"SELECT sum({TOTAL_TOKEN}) FROM events"
        f" WHERE {user_cond}"
        f" AND {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{today:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
    )
    params = {**user_params, "start": week_start, "today": today.isoformat()}
    rows = client.query(sql, parameters=params).result_rows
    total = _safe_int(rows[0][0]) if rows else 0
    _cache[cache_key] = total
    return total


def get_weekly_request_count(user: dict[str, Any], time_filter: str = "all") -> int:
    today = datetime.now(tz=timezone(timedelta(hours=8))).date()
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"weekly_req:{_uid}:{week_start}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    client = _get_client()
    sql = (
        f"SELECT count() FROM events"
        f" WHERE {user_cond}"
        f" AND {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{today:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
    )
    params = {**user_params, "start": week_start, "today": today.isoformat()}
    rows = client.query(sql, parameters=params).result_rows
    count = _safe_int(rows[0][0]) if rows else 0
    _cache[cache_key] = count
    return count


def get_monthly_active_days(user: dict[str, Any]) -> int:
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"monthly_active_days:{_uid}:{month_start}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    client = _get_client()
    sql = (
        f"SELECT count(DISTINCT {EVENT_DATE}) FROM events"
        f" WHERE {user_cond} AND event_date >= {{start:String}}"
        f" AND {_BASE_FILTER}"
    )
    params = {**user_params, "start": month_start}
    rows = client.query(sql, parameters=params).result_rows
    days = _safe_int(rows[0][0]) if rows else 0
    _cache[cache_key] = days
    return days


def get_today_token_usage(user: dict[str, Any], time_filter: str = "auto") -> int:
    today = _today_shanghai()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"today_token:{_uid}:{today}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    client = _get_client()
    sql = (
        f"SELECT sum({TOTAL_TOKEN}) FROM events"
        f" WHERE {user_cond}"
        f" AND event_date = {{today:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
    )
    params = {**user_params, "today": today}
    rows = client.query(sql, parameters=params).result_rows
    total = _safe_int(rows[0][0]) if rows else 0
    _cache[cache_key] = total
    return total


def get_daily_request_count(user: dict[str, Any], time_filter: str = "auto") -> int:
    today = _today_shanghai()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"daily_req:{_uid}:{today}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    client = _get_client()
    sql = (
        f"SELECT count() FROM events"
        f" WHERE {user_cond} AND event_date = {{today:String}}"
        f" AND {_BASE_FILTER}"
    )
    params = {**user_params, "today": today}
    rows = client.query(sql, parameters=params).result_rows
    count = _safe_int(rows[0][0]) if rows else 0
    _cache[cache_key] = count
    return count


def get_daily_trend(user: dict[str, Any], start_date: str, end_date: str, time_filter: str = "all") -> list[dict[str, Any]]:
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"trend:{_uid}:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    client = _get_client()
    sql = (
        f"SELECT {EVENT_DATE},"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN})"
        f" FROM events"
        f" WHERE {user_cond}"
        f" AND {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {EVENT_DATE} ORDER BY {EVENT_DATE}"
    )
    params = {**user_params, "start": start_date, "end": end_date}
    rows = client.query(sql, parameters=params).result_rows
    result: list[dict[str, Any]] = [
        {
            "date": row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0]),
            "input_token": _safe_int(row[1]),
            "output_token": _safe_int(row[2]),
            "total_token": _safe_int(row[3]),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_model_distribution(
    user: dict[str, Any], start_date: str, end_date: str, time_filter: str = "all"
) -> list[dict[str, Any]]:
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"model_dist:{_uid}:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    client = _get_client()
    sql = (
        f"SELECT {REQUEST_MODEL_NAME}, sum({TOTAL_TOKEN}) AS total"
        f" FROM events"
        f" WHERE {user_cond}"
        f" AND {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {REQUEST_MODEL_NAME} ORDER BY total DESC"
    )
    params = {**user_params, "start": start_date, "end": end_date}
    rows = client.query(sql, parameters=params).result_rows
    result: list[dict[str, Any]] = [
        {
            "model": str(row[0] or "unknown"),
            "total_token": _safe_int(row[1]),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_all_users_monthly_tokens(time_filter: str = "all") -> dict[str, int]:
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"all_monthly_token:{month_start}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {USER_ID}, sum({TOTAL_TOKEN})"
        f" FROM events WHERE event_date >= {{start:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USER_ID}"
    )
    rows = client.query(sql, parameters={"start": month_start}).result_rows
    result = {str(row[0]): _safe_int(row[1]) for row in rows}
    _cache[cache_key] = result
    return result


def get_all_users_daily_requests() -> dict[str, int]:
    today = _today_shanghai()
    cache_key = f"all_daily_req:{today}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {USER_ID}, count() FROM events"
        f" WHERE {EVENT_DATE} = {{today:String}}"
        f" AND {_BASE_FILTER}"
        f" GROUP BY {USER_ID}"
    )
    rows = client.query(sql, parameters={"today": today}).result_rows
    result = {str(row[0]): _safe_int(row[1]) for row in rows}
    _cache[cache_key] = result
    return result


def get_global_trend(start_date: str, end_date: str, time_filter: str = "all") -> list[dict[str, Any]]:
    cache_key = f"global_trend:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {EVENT_DATE},"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN}),"
        f" countIf({EVENT_CODE} = 'chat_request_response') AS chat_count"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {EVENT_DATE} ORDER BY {EVENT_DATE}"
    )
    rows = client.query(sql, parameters={"start": start_date, "end": end_date}).result_rows
    result: list[dict[str, Any]] = [
        {
            "date": row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0]),
            "input_token": _safe_int(row[1]),
            "output_token": _safe_int(row[2]),
            "total_token": _safe_int(row[3]),
            "chat_count": _safe_int(row[4]),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_global_trend_by_model(start_date: str, end_date: str, time_filter: str = "all") -> list[dict[str, Any]]:
    cache_key = f"global_trend_model:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {EVENT_DATE}, {REQUEST_MODEL_NAME},"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN}),"
        f" countIf({EVENT_CODE} = 'chat_request_response') AS chat_count"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {EVENT_DATE}, {REQUEST_MODEL_NAME}"
        f" ORDER BY {EVENT_DATE}, {REQUEST_MODEL_NAME}"
    )
    rows = client.query(sql, parameters={"start": start_date, "end": end_date}).result_rows
    result: list[dict[str, Any]] = [
        {
            "date": row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0]),
            "group": str(row[1] or "unknown"),
            "input_token": _safe_int(row[2]),
            "output_token": _safe_int(row[3]),
            "total_token": _safe_int(row[4]),
            "chat_count": _safe_int(row[5]),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_global_trend_by_dept(start_date: str, end_date: str, time_filter: str = "all") -> list[dict[str, Any]]:
    cache_key = f"global_trend_dept:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {EVENT_DATE},"
        f" if({ENTERPRISE} = '' OR {ENTERPRISE} IS NULL, '未知', {ENTERPRISE}) AS dept,"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN}),"
        f" countIf({EVENT_CODE} = 'chat_request_response') AS chat_count"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {EVENT_DATE}, dept ORDER BY {EVENT_DATE}, dept"
    )
    rows = client.query(sql, parameters={"start": start_date, "end": end_date}).result_rows
    result: list[dict[str, Any]] = [
        {
            "date": row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0]),
            "group": str(row[1] or "未知"),
            "input_token": _safe_int(row[2]),
            "output_token": _safe_int(row[3]),
            "total_token": _safe_int(row[4]),
            "chat_count": _safe_int(row[5]),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_detail_records(
    user: dict[str, Any],
    start_date: str,
    end_date: str,
    model: str | None = None,
    ide_type: str | None = None,
    time_filter: str = "all",
) -> list[dict[str, Any]]:
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"detail:{_uid}:{start_date}:{end_date}:{model}:{ide_type}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    params: dict[str, Any] = {**user_params, "start": start_date, "end": end_date}
    extra = ""
    if model:
        extra += f" AND {REQUEST_MODEL_NAME} = {{model:String}}"
        params["model"] = model
    if ide_type:
        extra += f" AND {IDE_TYPE} = {{ide_type:String}}"
        params["ide_type"] = ide_type

    tf_clause = _working_hours_filter(time_filter)

    client = _get_client()
    sql = (
        f"SELECT {EVENT_DATE}, {REQUEST_MODEL_NAME},"
        f" count() AS request_count,"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN})"
        f" FROM events"
        f" WHERE {user_cond}"
        f" AND {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" AND {_BASE_FILTER}"
        + extra + tf_clause
        + f" GROUP BY {EVENT_DATE}, {REQUEST_MODEL_NAME}"
        f" ORDER BY {EVENT_DATE} DESC, {REQUEST_MODEL_NAME}"
    )
    rows = client.query(sql, parameters=params).result_rows
    result: list[dict[str, Any]] = [
        {
            "date": row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0]),
            "model": str(row[1] or ""),
            "request_count": _safe_int(row[2]),
            "input_token": _safe_int(row[3]),
            "output_token": _safe_int(row[4]),
            "total_token": _safe_int(row[5]),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_all_users_monthly_requests(time_filter: str = "all") -> dict[str, int]:
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"all_monthly_requests:{month_start}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {USER_ID}, count() AS req_count"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= {{start:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USER_ID}"
    )
    rows = client.query(sql, parameters={"start": month_start}).result_rows
    result: dict[str, int] = {str(row[0]): _safe_int(row[1]) for row in rows}
    _cache[cache_key] = result
    return result


def get_chat_session_count(user: dict[str, Any], scope: str = "month", time_filter: str = "auto") -> int:
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"chat_sessions:{_uid}:{scope}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    client = _get_client()
    tf = _working_hours_filter(time_filter)

    if scope == "today":
        sql = (
            f"SELECT count() FROM events WHERE {user_cond}"
            f" AND {EVENT_DATE} = {{today:String}}"
            f" AND {EVENT_CODE} = 'chat_request_response'"
            f" AND totalToken > 0" + tf
        )
        params = {**user_params, "today": _today_shanghai()}
        rows = client.query(sql, parameters=params).result_rows
    elif scope == "week":
        today = datetime.now(tz=timezone(timedelta(hours=8))).date()
        week_start = (today - timedelta(days=today.weekday())).isoformat()
        sql = (
            f"SELECT count() FROM events WHERE {user_cond}"
            f" AND {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{today:String}}"
            f" AND {EVENT_CODE} = 'chat_request_response'"
            f" AND totalToken > 0" + tf
        )
        params = {**user_params, "start": week_start, "today": today.isoformat()}
        rows = client.query(sql, parameters=params).result_rows
    else:
        sql = (
            f"SELECT count() FROM events WHERE {user_cond}"
            f" AND toYYYYMM({EVENT_DATE}) = toYYYYMM(today())"
            f" AND {EVENT_CODE} = 'chat_request_response'"
            f" AND totalToken > 0" + tf
        )
        rows = client.query(sql, parameters=user_params).result_rows

    count = _safe_int(rows[0][0]) if rows else 0
    _cache[cache_key] = count
    return count


def get_all_users_today_tokens(time_filter: str = "auto") -> dict[str, int]:
    today = _today_shanghai()
    cache_key = f"all_today_token:{today}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {USER_ID}, sum({TOTAL_TOKEN}) FROM events"
        f" WHERE {EVENT_DATE} = {{today:String}}"
        f" AND {_BASE_FILTER}"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USER_ID}"
    )
    rows = client.query(sql, parameters={"today": today}).result_rows
    result = {str(r[0]): _safe_int(r[1]) for r in rows if r[0]}
    _cache[cache_key] = result
    return result


def get_all_users_today_chats(time_filter: str = "auto") -> dict[str, int]:
    today = _today_shanghai()
    cache_key = f"all_today_chat:{today}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {USER_ID}, count() FROM events"
        f" WHERE {EVENT_DATE} = {{today:String}}"
        f" AND {EVENT_CODE} = 'chat_request_response'"
        f" AND totalToken > 0"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USER_ID}"
    )
    rows = client.query(sql, parameters={"today": today}).result_rows
    result = {str(r[0]): _safe_int(r[1]) for r in rows if r[0]}
    _cache[cache_key] = result
    return result


def get_all_users_monthly_chats(time_filter: str = "all") -> dict[str, int]:
    now = datetime.now(tz=timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).date().isoformat()
    cache_key = f"all_monthly_chat:{month_start}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {USER_ID}, count() FROM events"
        f" WHERE toYYYYMM({EVENT_DATE}) = toYYYYMM(today())"
        f" AND {EVENT_CODE} = 'chat_request_response'"
        f" AND totalToken > 0"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USER_ID}"
    )
    rows = client.query(sql, parameters={}).result_rows
    result = {str(r[0]): _safe_int(r[1]) for r in rows if r[0]}
    _cache[cache_key] = result
    return result


def get_all_users_from_clickhouse() -> list[dict[str, Any]]:
    """Return distinct users from ClickHouse events table.

    Returns list of dicts with keys: username, nickname, enterprise.
    Used as primary user list in admin panel (PG may be incomplete).
    """
    cache_key = "ch_all_users"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {USERNAME}, any({REQUEST_MODEL_NAME}) as _m,"
        f" anyLast(userNickname) as nickname,"
        f" anyLast(enterprise) as enterprise"
        f" FROM events"
        f" WHERE {_BASE_FILTER}"
        f" GROUP BY {USERNAME}"
        f" ORDER BY {USERNAME}"
    )
    rows = client.query(sql, parameters={}).result_rows
    result: list[dict[str, Any]] = [
        {
            "username": str(row[0] or ""),
            "nickname": str(row[2] or ""),
            "enterprise": str(row[3] or ""),
        }
        for row in rows
        if row[0]
    ]
    _cache[cache_key] = result
    return result
