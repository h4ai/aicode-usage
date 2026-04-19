# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""ClickHouse query helpers with TTL caching."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

from cachetools import TTLCache
from clickhouse_driver import Client as CHClient

from app.config import get_config
from app.data_schema import (
    EVENT_CODE,
    ENTERPRISE,
    EVENT_DATE,
    IDE_TYPE,
    INPUT_TOKEN,
    OUTPUT_TOKEN,
    REQUEST_MODEL_NAME,
    TOTAL_TOKEN,
    USER_ID,
)

logger = logging.getLogger(__name__)

from datetime import timezone, timedelta

def _today_shanghai() -> str:
    """Return today's date in Asia/Shanghai timezone (YYYY-MM-DD)."""
    tz_sh = timezone(timedelta(hours=8))
    return datetime.now(tz=tz_sh).date().isoformat()


# 5-minute TTL cache, max 1024 entries
_cache: TTLCache[str, Any] = TTLCache(maxsize=1024, ttl=300)



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
        f"toHour(toDateTime(timestamp / 1000, 'Asia/Shanghai')) * 3600 +"
        f" toMinute(toDateTime(timestamp / 1000, 'Asia/Shanghai')) * 60"
    )

    effective = time_filter
    if effective == "auto":
        effective = "work" if cfg.get("enabled", False) else "all"
    # 若管理员关闭时段限制，则 work/non_work 均降级为全天
    if not cfg.get("enabled", False) and effective in ("work", "non_work"):
        effective = "all"

    # toDayOfWeek: 1=Mon, 2=Tue, ..., 5=Fri, 6=Sat, 7=Sun
    dow_expr = f"toDayOfWeek(toDateTime(timestamp / 1000, 'Asia/Shanghai'))"
    weekday_only = cfg.get("working_hours", {}).get("weekday_only", True)

    if effective == "work":
        if weekday_only:
            weekday_filter = f" AND {dow_expr} BETWEEN 1 AND 5"
            return f"{weekday_filter} AND {time_expr} >= {start_sec} AND {time_expr} < {end_sec}"
        else:
            return f" AND {time_expr} >= {start_sec} AND {time_expr} < {end_sec}"
    elif effective == "non_work":
        if weekday_only:
            return f" AND ({dow_expr} > 5 OR {time_expr} < {start_sec} OR {time_expr} >= {end_sec})"
        else:
            return f" AND ({time_expr} < {start_sec} OR {time_expr} >= {end_sec})"
    else:
        return ""


def _get_client() -> CHClient:
    cfg = get_config().get("clickhouse", {})
    return CHClient(
        host=cfg.get("host", "localhost"),
        port=cfg.get("port", 9000),
        database=cfg.get("database", "otel"),
        user=cfg.get("user", "default"),
        password=cfg.get("password", ""),
    )


def get_monthly_token_usage(user_id: str, time_filter: str = "all") -> int:
    """Return total tokens used by *user_id* in the current calendar month."""
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"monthly_token:{user_id}:{month_start}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    client = _get_client()
    result = client.execute(
        f"SELECT sum({TOTAL_TOKEN}) FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND event_date >= %(start)s"
        + _working_hours_filter(time_filter),
        {"uid": user_id, "start": month_start},
    )
    total = int(result[0][0]) if result and result[0][0] else 0
    _cache[cache_key] = total
    return total


def get_monthly_request_count(user_id: str, time_filter: str = "all") -> int:
    """Return total request count by *user_id* in the current calendar month."""
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"monthly_req:{user_id}:{month_start}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    client = _get_client()
    result = client.execute(
        f"SELECT count() FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND event_date >= %(start)s"
        + _working_hours_filter(time_filter),
        {"uid": user_id, "start": month_start},
    )
    count = int(result[0][0]) if result and result[0][0] else 0
    _cache[cache_key] = count
    return count



def get_weekly_token_usage(user_id: str, time_filter: str = "all") -> int:
    """Return total tokens used by *user_id* in the current ISO week (Mon~today)."""
    from datetime import date, timedelta
    today = datetime.now(tz=timezone(timedelta(hours=8))).date()
    week_start = (today - timedelta(days=today.weekday())).isoformat()  # 本周一
    cache_key = f"weekly_token:{user_id}:{week_start}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    client = _get_client()
    result = client.execute(
        f"SELECT sum({TOTAL_TOKEN}) FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND {EVENT_DATE} >= %(start)s AND {EVENT_DATE} <= %(today)s"
        + _working_hours_filter(time_filter),
        {"uid": user_id, "start": week_start, "today": today.isoformat()},
    )
    total = int(result[0][0]) if result and result[0][0] else 0
    _cache[cache_key] = total
    return total


def get_weekly_request_count(user_id: str, time_filter: str = "all") -> int:
    """Return total request count by *user_id* in the current ISO week."""
    from datetime import date, timedelta
    today = datetime.now(tz=timezone(timedelta(hours=8))).date()
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    cache_key = f"weekly_req:{user_id}:{week_start}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    client = _get_client()
    result = client.execute(
        f"SELECT count() FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND {EVENT_DATE} >= %(start)s AND {EVENT_DATE} <= %(today)s"
        + _working_hours_filter(time_filter),
        {"uid": user_id, "start": week_start, "today": today.isoformat()},
    )
    count = int(result[0][0]) if result and result[0][0] else 0
    _cache[cache_key] = count
    return count

def get_monthly_active_days(user_id: str) -> int:
    """Return number of distinct days with activity in the current month."""
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"monthly_active_days:{user_id}:{month_start}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    client = _get_client()
    result = client.execute(
        f"SELECT count(DISTINCT {EVENT_DATE}) FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND event_date >= %(start)s",
        {"uid": user_id, "start": month_start},
    )
    days = int(result[0][0]) if result and result[0][0] else 0
    _cache[cache_key] = days
    return days


def get_today_token_usage(user_id: str, time_filter: str = "auto") -> int:
    """Return total tokens used by *user_id* today."""
    today = _today_shanghai()
    cache_key = f"today_token:{user_id}:{today}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    client = _get_client()
    result = client.execute(
        f"SELECT sum({TOTAL_TOKEN}) FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND event_date = %(today)s" + _working_hours_filter(time_filter),
        {"uid": user_id, "today": today},
    )
    total = int(result[0][0]) if result and result[0][0] else 0
    _cache[cache_key] = total
    return total


def get_daily_request_count(user_id: str, time_filter: str = "auto") -> int:
    """Return number of requests by *user_id* today."""
    today = _today_shanghai()
    cache_key = f"daily_req:{user_id}:{today}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    client = _get_client()
    result = client.execute(
        f"SELECT count() FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND event_date = %(today)s",
        {"uid": user_id, "today": today},
    )
    count = int(result[0][0]) if result and result[0][0] else 0
    _cache[cache_key] = count
    return count


def get_daily_trend(
    user_id: str, start_date: str, end_date: str, time_filter: str = "all"
) -> list[dict[str, Any]]:
    """Return daily input/output/total token breakdown for a date range."""
    cache_key = f"trend:{user_id}:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {EVENT_DATE},"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN})"
        f" FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND {EVENT_DATE} >= %(start)s AND {EVENT_DATE} <= %(end)s"
        f" GROUP BY {EVENT_DATE} ORDER BY {EVENT_DATE}",
        {"uid": user_id, "start": start_date, "end": end_date},
    )
    result: list[dict[str, Any]] = [
        {
            "date": (
                row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0])
            ),
            "input_token": int(row[1] or 0),
            "output_token": int(row[2] or 0),
            "total_token": int(row[3] or 0),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_model_distribution(
    user_id: str, start_date: str, end_date: str, time_filter: str = "all"
) -> list[dict[str, Any]]:
    """Return token usage grouped by model for the given date range."""
    cache_key = f"model_dist:{user_id}:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {REQUEST_MODEL_NAME}, sum({TOTAL_TOKEN}) AS total"
        f" FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND {EVENT_DATE} >= %(start)s AND {EVENT_DATE} <= %(end)s"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {REQUEST_MODEL_NAME}"
        f" ORDER BY total DESC",
        {"uid": user_id, "start": start_date, "end": end_date},
    )
    result: list[dict[str, Any]] = [
        {
            "model": str(row[0] or "unknown"),
            "total_token": int(row[1] or 0),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_all_users_monthly_tokens(time_filter: str = "all") -> dict[str, int]:
    """Return {user_id: total_token} for all users in current month."""
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"all_monthly_token:{month_start}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {USER_ID}, sum({TOTAL_TOKEN})"
        f" FROM events WHERE {EVENT_DATE} >= %(start)s"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USER_ID}",
        {"start": month_start},
    )
    result = {str(row[0]): int(row[1] or 0) for row in rows}
    _cache[cache_key] = result
    return result


def get_all_users_daily_requests() -> dict[str, int]:
    """Return {user_id: request_count} for all users today."""
    today = _today_shanghai()
    cache_key = f"all_daily_req:{today}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {USER_ID}, count()"
        f" FROM events WHERE {EVENT_DATE} = %(today)s"
        f" GROUP BY {USER_ID}",
        {"today": today},
    )
    result = {str(row[0]): int(row[1] or 0) for row in rows}
    _cache[cache_key] = result
    return result


def get_global_trend(start_date: str, end_date: str, time_filter: str = "all") -> list[dict[str, Any]]:
    """Return daily aggregated token trend across ALL users."""
    cache_key = f"global_trend:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {EVENT_DATE},"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN}),"
        f" countIf({EVENT_CODE} = 'chat_request_response') AS chat_count"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= %(start)s AND {EVENT_DATE} <= %(end)s"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {EVENT_DATE} ORDER BY {EVENT_DATE}",
        {"start": start_date, "end": end_date},
    )
    result: list[dict[str, Any]] = [
        {
            "date": row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0]),
            "input_token": int(row[1] or 0),
            "output_token": int(row[2] or 0),
            "total_token": int(row[3] or 0),
            "chat_count": int(row[4] or 0),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_global_trend_by_model(start_date: str, end_date: str, time_filter: str = "all") -> list[dict[str, Any]]:
    """Return daily token trend grouped by model across ALL users."""
    cache_key = f"global_trend_model:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {EVENT_DATE}, {REQUEST_MODEL_NAME},"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN}),"
        f" countIf({EVENT_CODE} = 'chat_request_response') AS chat_count"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= %(start)s AND {EVENT_DATE} <= %(end)s"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {EVENT_DATE}, {REQUEST_MODEL_NAME}"
        f" ORDER BY {EVENT_DATE}, {REQUEST_MODEL_NAME}",
        {"start": start_date, "end": end_date},
    )
    result: list[dict[str, Any]] = [
        {
            "date": row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0]),
            "group": str(row[1] or "unknown"),
            "input_token": int(row[2] or 0),
            "output_token": int(row[3] or 0),
            "total_token": int(row[4] or 0),
            "chat_count": int(row[5] or 0),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_global_trend_by_dept(start_date: str, end_date: str, time_filter: str = "all") -> list[dict[str, Any]]:
    """Return daily token trend grouped by enterprise/department across ALL users."""
    cache_key = f"global_trend_dept:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {EVENT_DATE},"
        f" if({ENTERPRISE} = '' OR {ENTERPRISE} IS NULL, '未知', {ENTERPRISE}) AS dept,"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN}),"
        f" countIf({EVENT_CODE} = 'chat_request_response') AS chat_count"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= %(start)s AND {EVENT_DATE} <= %(end)s"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {EVENT_DATE}, dept"
        f" ORDER BY {EVENT_DATE}, dept",
        {"start": start_date, "end": end_date},
    )
    result: list[dict[str, Any]] = [
        {
            "date": row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0]),
            "group": str(row[1] or "未知"),
            "input_token": int(row[2] or 0),
            "output_token": int(row[3] or 0),
            "total_token": int(row[4] or 0),
            "chat_count": int(row[5] or 0),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_detail_records(
    user_id: str,
    start_date: str,
    end_date: str,
    model: str | None = None,
    ide_type: str | None = None,
    time_filter: str = "all",
) -> list[dict[str, Any]]:
    """Return usage records grouped by date + model, with optional filters."""
    cache_key = f"detail:{user_id}:{start_date}:{end_date}:{model}:{ide_type}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    conditions = [
        f"{USER_ID} = %(uid)s",
        f"{EVENT_DATE} >= %(start)s",
        f"{EVENT_DATE} <= %(end)s",
    ]
    params: dict[str, Any] = {
        "uid": user_id,
        "start": start_date,
        "end": end_date,
    }
    if model:
        conditions.append(f"{REQUEST_MODEL_NAME} = %(model)s")
        params["model"] = model
    if ide_type:
        conditions.append(f"{IDE_TYPE} = %(ide_type)s")
        params["ide_type"] = ide_type

    where = " AND ".join(conditions)
    tf_clause = _working_hours_filter(time_filter).lstrip(" AND").strip()
    if tf_clause:
        where = where + " AND " + tf_clause
    client = _get_client()
    rows = client.execute(
        f"SELECT {EVENT_DATE}, {REQUEST_MODEL_NAME},"
        f" count() AS request_count,"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN})"
        f" FROM events WHERE {where}"
        f" GROUP BY {EVENT_DATE}, {REQUEST_MODEL_NAME}"
        f" ORDER BY {EVENT_DATE} DESC, {REQUEST_MODEL_NAME}",
        params,
    )
    result: list[dict[str, Any]] = [
        {
            "date": (
                row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0])
            ),
            "model": str(row[1] or ""),
            "request_count": int(row[2] or 0),
            "input_token": int(row[3] or 0),
            "output_token": int(row[4] or 0),
            "total_token": int(row[5] or 0),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_all_users_monthly_requests(time_filter: str = "all") -> dict[str, int]:
    """Return {user_id: request_count} for all users in current month."""
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"all_monthly_requests:{month_start}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {USER_ID}, count() AS req_count"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= %(start)s"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USER_ID}",
        {"start": month_start},
    )
    result: dict[str, int] = {str(row[0]): int(row[1] or 0) for row in rows}
    _cache[cache_key] = result
    return result


def get_chat_session_count(user_id: str, scope: str = "month", time_filter: str = "auto") -> int:
    """Return chat session (conversation) count for the user.
    Uses chat_request_response event count as proxy since conversationId is empty.
    """
    cache_key = f"chat_sessions:{user_id}:{scope}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    from datetime import date, timedelta
    client = _get_client()
    if scope == "today":
        result = client.execute(
            f"SELECT count() FROM events WHERE {USER_ID} = %(uid)s"
            f" AND {EVENT_DATE} = %(today)s AND {EVENT_CODE} = 'chat_request_response'" + _working_hours_filter(time_filter),
            {"uid": user_id, "today": _today_shanghai()},
        )
    elif scope == "week":
        today = datetime.now(tz=timezone(timedelta(hours=8))).date()
        week_start = (today - timedelta(days=today.weekday())).isoformat()
        result = client.execute(
            f"SELECT count() FROM events WHERE {USER_ID} = %(uid)s"
            f" AND {EVENT_DATE} >= %(start)s AND {EVENT_DATE} <= %(today)s"
            f" AND {EVENT_CODE} = 'chat_request_response'" + _working_hours_filter(time_filter),
            {"uid": user_id, "start": week_start, "today": today.isoformat()},
        )
    else:
        result = client.execute(
            f"SELECT count() FROM events WHERE {USER_ID} = %(uid)s"
            f" AND toYYYYMM({EVENT_DATE}) = toYYYYMM(today())"
            f" AND {EVENT_CODE} = 'chat_request_response'" + _working_hours_filter(time_filter),
            {"uid": user_id},
        )
    count = int(result[0][0]) if result else 0
    _cache[cache_key] = count
    return count


def get_all_users_today_tokens(time_filter: str = "auto") -> dict[str, int]:
    """Return {user_id: today_token} for all users."""
    from datetime import date
    cache_key = f"all_today_token:{_today_shanghai()}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])
    client = _get_client()
    rows = client.execute(
        f"SELECT {USER_ID}, sum({TOTAL_TOKEN}) FROM events"
        f" WHERE {EVENT_DATE} = %(today)s" + _working_hours_filter(time_filter) + f" GROUP BY {USER_ID}",
        {"today": _today_shanghai()}
    )
    result = {str(r[0]): int(r[1] or 0) for r in rows if r[0]}
    _cache[cache_key] = result
    return result


def get_all_users_today_chats(time_filter: str = "auto") -> dict[str, int]:
    """Return {user_id: today_chat_count} for all users."""
    from datetime import date
    cache_key = f"all_today_chat:{_today_shanghai()}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])
    client = _get_client()
    rows = client.execute(
        f"SELECT {USER_ID}, count() FROM events"
        f" WHERE {EVENT_DATE} = today() AND {EVENT_CODE} = 'chat_request_response'"
        + _working_hours_filter(time_filter) + f" GROUP BY {USER_ID}"
    )
    result = {str(r[0]): int(r[1] or 0) for r in rows if r[0]}
    _cache[cache_key] = result
    return result


def get_all_users_monthly_chats(time_filter: str = "all") -> dict[str, int]:
    """Return {user_id: monthly_chat_count} for all users in current month."""
    from datetime import timezone
    now = datetime.now(tz=timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).date().isoformat()
    cache_key = f"all_monthly_chat:{month_start}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])
    client = _get_client()
    rows = client.execute(
        f"SELECT {USER_ID}, count() FROM events"
        f" WHERE toYYYYMM({EVENT_DATE}) = toYYYYMM(today())"
        f" AND {EVENT_CODE} = 'chat_request_response'"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USER_ID}"
    )
    result = {str(r[0]): int(r[1] or 0) for r in rows if r[0]}
    _cache[cache_key] = result
    return result
