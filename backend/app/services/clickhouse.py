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

# 5-minute TTL cache, max 1024 entries
_cache: TTLCache[str, Any] = TTLCache(maxsize=1024, ttl=300)


def _get_client() -> CHClient:
    cfg = get_config().get("clickhouse", {})
    return CHClient(
        host=cfg.get("host", "localhost"),
        port=cfg.get("port", 9000),
        database=cfg.get("database", "otel"),
        user=cfg.get("user", "default"),
        password=cfg.get("password", ""),
    )


def get_monthly_token_usage(user_id: str) -> int:
    """Return total tokens used by *user_id* in the current calendar month."""
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"monthly_token:{user_id}:{month_start}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    client = _get_client()
    result = client.execute(
        f"SELECT sum({TOTAL_TOKEN}) FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND event_date >= %(start)s",
        {"uid": user_id, "start": month_start},
    )
    total = int(result[0][0]) if result and result[0][0] else 0
    _cache[cache_key] = total
    return total


def get_monthly_request_count(user_id: str) -> int:
    """Return total request count by *user_id* in the current calendar month."""
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"monthly_req:{user_id}:{month_start}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    client = _get_client()
    result = client.execute(
        f"SELECT count() FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND event_date >= %(start)s",
        {"uid": user_id, "start": month_start},
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


def get_today_token_usage(user_id: str) -> int:
    """Return total tokens used by *user_id* today."""
    today = date.today().isoformat()
    cache_key = f"today_token:{user_id}:{today}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    client = _get_client()
    result = client.execute(
        f"SELECT sum({TOTAL_TOKEN}) FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND event_date = %(today)s",
        {"uid": user_id, "today": today},
    )
    total = int(result[0][0]) if result and result[0][0] else 0
    _cache[cache_key] = total
    return total


def get_daily_request_count(user_id: str) -> int:
    """Return number of requests by *user_id* today."""
    today = date.today().isoformat()
    cache_key = f"daily_req:{user_id}:{today}"
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
    user_id: str, start_date: str, end_date: str
) -> list[dict[str, Any]]:
    """Return daily input/output/total token breakdown for a date range."""
    cache_key = f"trend:{user_id}:{start_date}:{end_date}"
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
    user_id: str, start_date: str, end_date: str
) -> list[dict[str, Any]]:
    """Return token usage grouped by model for the given date range."""
    cache_key = f"model_dist:{user_id}:{start_date}:{end_date}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {REQUEST_MODEL_NAME}, sum({TOTAL_TOKEN}) AS total"
        f" FROM events"
        f" WHERE {USER_ID} = %(uid)s"
        f" AND {EVENT_DATE} >= %(start)s AND {EVENT_DATE} <= %(end)s"
        f" GROUP BY {REQUEST_MODEL_NAME}"
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


def get_all_users_monthly_tokens() -> dict[str, int]:
    """Return {user_id: total_token} for all users in current month."""
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"all_monthly_token:{month_start}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {USER_ID}, sum({TOTAL_TOKEN})"
        f" FROM events WHERE {EVENT_DATE} >= %(start)s"
        f" GROUP BY {USER_ID}",
        {"start": month_start},
    )
    result = {str(row[0]): int(row[1] or 0) for row in rows}
    _cache[cache_key] = result
    return result


def get_all_users_daily_requests() -> dict[str, int]:
    """Return {user_id: request_count} for all users today."""
    today = date.today().isoformat()
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


def get_global_trend(start_date: str, end_date: str) -> list[dict[str, Any]]:
    """Return daily aggregated token trend across ALL users."""
    cache_key = f"global_trend:{start_date}:{end_date}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {EVENT_DATE},"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN})"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= %(start)s AND {EVENT_DATE} <= %(end)s"
        f" GROUP BY {EVENT_DATE} ORDER BY {EVENT_DATE}",
        {"start": start_date, "end": end_date},
    )
    result: list[dict[str, Any]] = [
        {
            "date": row[0].isoformat() if hasattr(row[0], "isoformat") else str(row[0]),
            "input_token": int(row[1] or 0),
            "output_token": int(row[2] or 0),
            "total_token": int(row[3] or 0),
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_global_trend_by_model(start_date: str, end_date: str) -> list[dict[str, Any]]:
    """Return daily token trend grouped by model across ALL users."""
    cache_key = f"global_trend_model:{start_date}:{end_date}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {EVENT_DATE}, {REQUEST_MODEL_NAME},"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN})"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= %(start)s AND {EVENT_DATE} <= %(end)s"
        f" GROUP BY {EVENT_DATE}, {REQUEST_MODEL_NAME}"
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
        }
        for row in rows
    ]
    _cache[cache_key] = result
    return result


def get_global_trend_by_dept(start_date: str, end_date: str) -> list[dict[str, Any]]:
    """Return daily token trend grouped by enterprise/department across ALL users."""
    cache_key = f"global_trend_dept:{start_date}:{end_date}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {EVENT_DATE},"
        f" if({ENTERPRISE} = '' OR {ENTERPRISE} IS NULL, '未知', {ENTERPRISE}) AS dept,"
        f" sum({INPUT_TOKEN}), sum({OUTPUT_TOKEN}), sum({TOTAL_TOKEN})"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= %(start)s AND {EVENT_DATE} <= %(end)s"
        f" GROUP BY {EVENT_DATE}, dept"
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
) -> list[dict[str, Any]]:
    """Return usage records grouped by date + model, with optional filters."""
    cache_key = f"detail:{user_id}:{start_date}:{end_date}:{model}:{ide_type}"
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


def get_all_users_monthly_requests() -> dict[str, int]:
    """Return {user_id: request_count} for all users in current month."""
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    cache_key = f"all_monthly_requests:{month_start}"
    if cache_key in _cache:
        return dict(_cache[cache_key])

    client = _get_client()
    rows = client.execute(
        f"SELECT {USER_ID}, count() AS req_count"
        f" FROM events"
        f" WHERE {EVENT_DATE} >= %(start)s"
        f" GROUP BY {USER_ID}",
        {"start": month_start},
    )
    result: dict[str, int] = {str(row[0]): int(row[1] or 0) for row in rows}
    _cache[cache_key] = result
    return result


def get_chat_session_count(user_id: str, scope: str = "month") -> int:
    """Return chat session (conversation) count for the user.
    Uses chat_request_response event count as proxy since conversationId is empty.
    """
    cache_key = f"chat_sessions:{user_id}:{scope}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    client = _get_client()
    if scope == "today":
        result = client.execute(
            f"SELECT count() FROM events WHERE {USER_ID} = %(uid)s"
            f" AND {EVENT_DATE} = today() AND {EVENT_CODE} = 'chat_request_response'",
            {"uid": user_id},
        )
    else:
        result = client.execute(
            f"SELECT count() FROM events WHERE {USER_ID} = %(uid)s"
            f" AND toYYYYMM({EVENT_DATE}) = toYYYYMM(today())"
            f" AND {EVENT_CODE} = 'chat_request_response'",
            {"uid": user_id},
        )
    count = int(result[0][0]) if result else 0
    _cache[cache_key] = count
    return count
