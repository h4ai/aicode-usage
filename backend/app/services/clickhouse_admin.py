# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""ClickHouse admin/batch query functions."""

from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import Any

from app.data_schema import (
    CONVERSATION_ID,
    ENTERPRISE,
    EVENT_CODE,
    EVENT_DATE,
    INPUT_TOKEN,
    OUTPUT_TOKEN,
    REQUEST_MODEL_NAME,
    TOTAL_TOKEN,
    USER_ID,
    USERNAME,
)
from app.services.clickhouse_client import _cache, _get_client, _safe_int
from app.services.clickhouse_filters import (
    _BASE_FILTER,
    _month_range,
    _today_shanghai,
    _working_hours_filter,
)

logger = logging.getLogger(__name__)


def get_all_users_monthly_tokens(time_filter: str = "all") -> dict[str, int]:
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"all_monthly_token:{month_start}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {USERNAME}, sum({TOTAL_TOKEN})"
        f" FROM events PREWHERE event_date >= {{start:String}}"
        f" WHERE {_BASE_FILTER} AND {USER_ID} IS NOT NULL"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USERNAME}"
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
        f"SELECT {USERNAME}, count() FROM events"
        f" WHERE {EVENT_DATE} = {{today:String}}"
        f" AND {_BASE_FILTER} AND {USER_ID} IS NOT NULL"
        f" GROUP BY {USERNAME}"
    )
    rows = client.query(sql, parameters={"today": today}).result_rows
    result = {str(row[0]): _safe_int(row[1]) for row in rows}
    _cache[cache_key] = result
    return result


def get_global_trend(start_date: str, end_date: str, time_filter: str = "all") -> list[dict[str, Any]]:
    try:
        return _get_global_trend_impl(start_date, end_date, time_filter)
    except Exception as exc:
        logger.error("get_global_trend failed (start=%s, end=%s): %s", start_date, end_date, exc)
        return []


def _get_global_trend_impl(start_date: str, end_date: str, time_filter: str = "all") -> list[dict[str, Any]]:
    cache_key = f"global_trend:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {EVENT_DATE},"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN}),"
        f" count(DISTINCT {CONVERSATION_ID}) AS chat_count"
        f" FROM events"
        f" PREWHERE {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" WHERE {_BASE_FILTER}"
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
    try:
        return _get_global_trend_by_model_impl(start_date, end_date, time_filter)
    except Exception as exc:
        logger.error("get_global_trend_by_model failed (start=%s, end=%s): %s", start_date, end_date, exc)
        return []


def _get_global_trend_by_model_impl(start_date: str, end_date: str, time_filter: str = "all") -> list[dict[str, Any]]:
    cache_key = f"global_trend_model:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {EVENT_DATE}, {REQUEST_MODEL_NAME},"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN}),"
        f" count(DISTINCT {CONVERSATION_ID}) AS chat_count"
        f" FROM events"
        f" PREWHERE {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" WHERE {_BASE_FILTER}"
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
    try:
        return _get_global_trend_by_dept_impl(start_date, end_date, time_filter)
    except Exception as exc:
        logger.error("get_global_trend_by_dept failed (start=%s, end=%s): %s", start_date, end_date, exc)
        return []


def _get_global_trend_by_dept_impl(start_date: str, end_date: str, time_filter: str = "all") -> list[dict[str, Any]]:
    cache_key = f"global_trend_dept:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {EVENT_DATE},"
        f" if({ENTERPRISE} = '' OR {ENTERPRISE} IS NULL, '未知', {ENTERPRISE}) AS dept,"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN}),"
        f" count(DISTINCT {CONVERSATION_ID}) AS chat_count"
        f" FROM events"
        f" PREWHERE {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" WHERE {_BASE_FILTER}"
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


def get_all_users_monthly_requests(time_filter: str = "all") -> dict[str, int]:
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"all_monthly_requests:{month_start}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {USERNAME}, count() AS req_count"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= {{start:String}}"
        f" AND {_BASE_FILTER} AND {USER_ID} IS NOT NULL"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USERNAME}"
    )
    rows = client.query(sql, parameters={"start": month_start}).result_rows
    result: dict[str, int] = {str(row[0]): _safe_int(row[1]) for row in rows}
    _cache[cache_key] = result
    return result


def get_all_users_today_tokens(time_filter: str = "auto") -> dict[str, int]:
    today = _today_shanghai()
    cache_key = f"all_today_token:{today}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {USERNAME}, sum({TOTAL_TOKEN}) FROM events"
        f" WHERE {EVENT_DATE} = {{today:String}}"
        f" AND {_BASE_FILTER} AND {USER_ID} IS NOT NULL"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USERNAME}"
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
        f"SELECT {USERNAME}, count() FROM events"
        f" WHERE {EVENT_DATE} = {{today:String}}"
        f" AND {EVENT_CODE} = 'chat_request_response'"
        f" AND totalToken > 0 AND {USER_ID} IS NOT NULL"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USERNAME}"
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
        f"SELECT {USERNAME}, count() FROM events"
        f" WHERE toYYYYMM({EVENT_DATE}) = toYYYYMM(today())"
        f" AND {EVENT_CODE} = 'chat_request_response'"
        f" AND totalToken > 0 AND {USER_ID} IS NOT NULL"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USERNAME}"
    )
    rows = client.query(sql, parameters={}).result_rows
    result = {str(r[0]): _safe_int(r[1]) for r in rows if r[0]}
    _cache[cache_key] = result
    return result


def get_all_users_tokens_in_month(year: int, month: int, time_filter: str = "all") -> dict[str, int]:
    """Return {userNickname: total_token} for a specific year/month."""
    start, end = _month_range(year, month)
    return get_all_users_tokens_in_range(start, end, time_filter)


def get_all_users_requests_in_month(year: int, month: int, time_filter: str = "all") -> dict[str, int]:
    """Return {userNickname: request_count} for a specific year/month."""
    start, end = _month_range(year, month)
    return get_all_users_requests_in_range(start, end, time_filter)


def get_all_users_chats_in_month(year: int, month: int, time_filter: str = "all") -> dict[str, int]:
    """Return {userNickname: chat_count} for a specific year/month."""
    start, end = _month_range(year, month)
    return get_all_users_chats_in_range(start, end, time_filter)


def get_all_users_tokens_in_range(start_date: str, end_date: str, time_filter: str = "all") -> dict[str, int]:
    """Return {userNickname: total_token} for date range [start_date, end_date]."""
    cache_key = f"all_range_token:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])
    client = _get_client()
    sql = (
        f"SELECT {USERNAME}, sum({TOTAL_TOKEN})"
        f" FROM events WHERE {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" AND {_BASE_FILTER} AND {USER_ID} IS NOT NULL"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USERNAME}"
    )
    rows = client.query(sql, parameters={"start": start_date, "end": end_date}).result_rows
    result = {str(row[0]): _safe_int(row[1]) for row in rows}
    _cache[cache_key] = result
    return result


def get_all_users_requests_in_range(start_date: str, end_date: str, time_filter: str = "all") -> dict[str, int]:
    """Return {userNickname: request_count} for date range."""
    cache_key = f"all_range_req:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])
    client = _get_client()
    sql = (
        f"SELECT {USERNAME}, count() AS req_count"
        f" FROM events WHERE {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" AND {_BASE_FILTER} AND {USER_ID} IS NOT NULL"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USERNAME}"
    )
    rows = client.query(sql, parameters={"start": start_date, "end": end_date}).result_rows
    result = {str(row[0]): _safe_int(row[1]) for row in rows}
    _cache[cache_key] = result
    return result


def get_all_users_chats_in_range(start_date: str, end_date: str, time_filter: str = "all") -> dict[str, int]:
    """Return {userNickname: chat_count} for date range."""
    cache_key = f"all_range_chat:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return dict(_cache[cache_key])
    client = _get_client()
    sql = (
        f"SELECT {USERNAME}, count() FROM events"
        f" WHERE {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" AND {EVENT_CODE} = 'chat_request_response' AND totalToken > 0 AND {USER_ID} IS NOT NULL"
        + _working_hours_filter(time_filter)
        + f" GROUP BY {USERNAME}"
    )
    rows = client.query(sql, parameters={"start": start_date, "end": end_date}).result_rows
    result = {str(row[0]): _safe_int(row[1]) for row in rows}
    _cache[cache_key] = result
    return result


def get_all_users_from_clickhouse() -> list[dict[str, Any]]:
    """Return distinct users from ClickHouse events table."""
    try:
        return _get_all_users_from_clickhouse_impl()
    except Exception as exc:
        logger.error("get_all_users_from_clickhouse failed: %s", exc)
        return []


def _get_all_users_from_clickhouse_impl() -> list[dict[str, Any]]:
    cache_key = "ch_all_users"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    sql = (
        f"SELECT {USERNAME},"
        f" anyLast(enterprise) as enterprise"
        f" FROM events"
        f" PREWHERE event_date >= toDate(toStartOfMonth(today()))"
        f" WHERE {_BASE_FILTER} AND {USER_ID} IS NOT NULL"
        f" GROUP BY {USERNAME}"
        f" ORDER BY {USERNAME}"
    )
    rows = client.query(sql, parameters={}).result_rows
    result: list[dict[str, Any]] = [
        {
            "username": str(row[0]),
            "nickname": str(row[0]),
            "enterprise": str(row[1] or ""),
        }
        for row in rows
        if row[0]
    ]
    _cache[cache_key] = result
    return result


# ---------------------------------------------------------------------------
# Batch admin query: replace 6 separate calls with 1 SQL
# ---------------------------------------------------------------------------

class AdminUserStats(dict):
    """
    Dict with keys per userNickname, each value is a dict:
      {
        monthly_token: int,
        monthly_token_all: int,
        monthly_chats: int,
        monthly_chats_all: int,
        monthly_requests: int,
        today_token: int,
        today_token_all: int,
        today_chats: int,
        today_chats_all: int,
        daily_requests: int,
      }
    """


def get_all_users_batch(
    year: int,
    month: int,
    time_filter: str = "all",
    is_current_month: bool = True,
) -> "AdminUserStats":
    """One-shot query returning all per-user stats needed for admin list_users."""
    try:
        return _get_all_users_batch_impl(year, month, time_filter, is_current_month)
    except Exception as exc:
        logger.error("get_all_users_batch failed (year=%d, month=%d): %s", year, month, exc)
        return AdminUserStats()


def _get_all_users_batch_impl(
    year: int,
    month: int,
    time_filter: str = "all",
    is_current_month: bool = True,
) -> "AdminUserStats":
    import calendar as _cal
    start = date(year, month, 1).isoformat()
    last_day = _cal.monthrange(year, month)[1]
    end = date(year, month, last_day).isoformat()
    today = _today_shanghai()
    cache_key = f"admin_batch:{start}:{end}:{time_filter}:{is_current_month}"
    if cache_key in _cache:
        return AdminUserStats(_cache[cache_key])

    wh = _working_hours_filter(time_filter)
    client = _get_client()

    sql_monthly = (
        f"SELECT {USERNAME},"
        f" sumIf({TOTAL_TOKEN}, {EVENT_DATE} >= {{start:String}}"
        f" AND {EVENT_DATE} <= {{end:String}}{wh}) AS monthly_token,"
        f" sumIf({TOTAL_TOKEN}, {EVENT_DATE} >= {{start:String}}"
        f" AND {EVENT_DATE} <= {{end:String}}) AS monthly_token_all,"
        f" uniqIf({CONVERSATION_ID}, {EVENT_CODE} = 'chat_request_response' AND totalToken > 0"
        f" AND {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}{wh}) AS monthly_chats,"
        f" uniqIf({CONVERSATION_ID}, {EVENT_CODE} = 'chat_request_response' AND totalToken > 0"
        f" AND {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}) AS monthly_chats_all,"
        f" countIf({EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}{wh}) AS monthly_requests"
        f" FROM events"
        f" PREWHERE {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" WHERE {_BASE_FILTER} AND {USER_ID} IS NOT NULL"
        f" GROUP BY {USERNAME}"
    )
    monthly_rows = client.query(sql_monthly, parameters={"start": start, "end": end}).result_rows

    result: AdminUserStats = AdminUserStats()
    for row in monthly_rows:
        uid = str(row[0])
        if not uid:
            continue
        result[uid] = {
            "monthly_token": _safe_int(row[1]),
            "monthly_token_all": _safe_int(row[2]),
            "monthly_chats": _safe_int(row[3]),
            "monthly_chats_all": _safe_int(row[4]),
            "monthly_requests": _safe_int(row[5]),
            "today_token": 0,
            "today_token_all": 0,
            "today_chats": 0,
            "today_chats_all": 0,
            "daily_requests": 0,
        }

    if is_current_month:
        sql_today = (
            f"SELECT {USERNAME},"
            f" sumIf({TOTAL_TOKEN}, True{wh}) AS today_token,"
            f" sum({TOTAL_TOKEN}) AS today_token_all,"
            f" uniqIf({CONVERSATION_ID}, {EVENT_CODE} = 'chat_request_response' AND totalToken > 0{wh}) AS today_chats,"
            f" uniqIf({CONVERSATION_ID}, {EVENT_CODE} = 'chat_request_response' AND totalToken > 0) AS today_chats_all,"
            f" count() AS daily_requests"
            f" FROM events"
            f" PREWHERE {EVENT_DATE} = {{today:String}}"
            f" WHERE {_BASE_FILTER} AND {USER_ID} IS NOT NULL"
            f" GROUP BY {USERNAME}"
        )
        today_rows = client.query(sql_today, parameters={"today": today}).result_rows
        for row in today_rows:
            uid = str(row[0])
            if not uid:
                continue
            if uid not in result:
                result[uid] = {
                    "monthly_token": 0, "monthly_token_all": 0,
                    "monthly_chats": 0, "monthly_chats_all": 0, "monthly_requests": 0,
                    "today_token": 0, "today_token_all": 0,
                    "today_chats": 0, "today_chats_all": 0, "daily_requests": 0,
                }
            result[uid].update({
                "today_token": _safe_int(row[1]),
                "today_token_all": _safe_int(row[2]),
                "today_chats": _safe_int(row[3]),
                "today_chats_all": _safe_int(row[4]),
                "daily_requests": _safe_int(row[5]),
            })

    _cache[cache_key] = result
    return result


# ---------------------------------------------------------------------------
# Batch leaderboard query: token + requests + chats in one SQL
# ---------------------------------------------------------------------------

def get_leaderboard_batch(
    time_filter: str = "all",
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict[str, str | int]]:
    """One-shot query for leaderboard: token + requests + chats (3 queries → 1)."""
    try:
        return _get_leaderboard_batch_impl(time_filter, start_date, end_date)
    except Exception as exc:
        logger.error("get_leaderboard_batch failed: %s", exc)
        return []


def _get_leaderboard_batch_impl(
    time_filter: str = "all",
    start_date: str | None = None,
    end_date: str | None = None,
) -> list[dict[str, str | int]]:
    import calendar as _cal
    now = datetime.now(tz=timezone.utc)
    if start_date and end_date:
        s, e = start_date, end_date
    else:
        s = date(now.year, now.month, 1).isoformat()
        last_day = _cal.monthrange(now.year, now.month)[1]
        e = date(now.year, now.month, last_day).isoformat()

    cache_key = f"leaderboard_batch:{s}:{e}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    wh = _working_hours_filter(time_filter)
    client = _get_client()
    sql = (
        f"SELECT {USERNAME},"
        f" anyLast({ENTERPRISE}) AS enterprise,"
        f" sum({TOTAL_TOKEN}) AS total_token,"
        f" count() AS total_requests,"
        f" uniq({CONVERSATION_ID}) AS total_chats,"
        f" countIf({EVENT_CODE} = 'chat_request_response') AS user_initiated_requests"
        f" FROM events"
        f" PREWHERE {EVENT_DATE} >= {{start:String}} AND {EVENT_DATE} <= {{end:String}}"
        f" WHERE {_BASE_FILTER} AND {USER_ID} IS NOT NULL"
        + wh
        + f" GROUP BY {USERNAME}"
        f" ORDER BY total_token DESC"
    )
    rows = client.query(sql, parameters={"start": s, "end": e}).result_rows
    result = [
        {
            "username": str(row[0]),
            "enterprise": str(row[1] or "未知"),
            "monthly_token": _safe_int(row[2]),
            "monthly_requests": _safe_int(row[3]),
            "monthly_chats": _safe_int(row[4]),
            "user_initiated_requests": _safe_int(row[5]),
        }
        for row in rows
        if row[0]
    ]
    _cache[cache_key] = result
    return result
