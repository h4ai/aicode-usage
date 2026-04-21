# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""ClickHouse single-user query functions."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from app.data_schema import (
    EVENT_CODE,
    EVENT_DATE,
    IDE_TYPE,
    INPUT_TOKEN,
    OUTPUT_TOKEN,
    REQUEST_MODEL_NAME,
    TOTAL_TOKEN,
)

import logging

from app.services.clickhouse_client import _cache, _get_client, _safe_int

logger = logging.getLogger(__name__)
from app.services.clickhouse_filters import (
    _BASE_FILTER,
    _today_shanghai,
    _user_filter,
    _working_hours_filter,
)


def get_monthly_token_usage(user: dict[str, Any], time_filter: str = "all") -> int:
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"monthly_token:{_uid}:{month_start}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    try:
        client = _get_client()
        sql = (
            f"SELECT sum({TOTAL_TOKEN}) FROM events"
            f" PREWHERE event_date >= {{start:String}}"
            f" WHERE {user_cond}"
            f" AND {_BASE_FILTER}"
            + _working_hours_filter(time_filter)
        )
        params = {**user_params, "start": month_start}
        rows = client.query(sql, parameters=params).result_rows
        total = _safe_int(rows[0][0]) if rows else 0
        _cache[cache_key] = total
        return total
    except Exception as exc:
        logger.error("ClickHouse query failed", extra={"action": "clickhouse_query", "error": str(exc)})
        raise


def get_monthly_request_count(user: dict[str, Any], time_filter: str = "all") -> int:
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"monthly_req:{_uid}:{month_start}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    try:
        client = _get_client()
        sql = (
            f"SELECT count() FROM events"
            f" PREWHERE event_date >= {{start:String}}"
            f" WHERE {user_cond}"
            f" AND {_BASE_FILTER}"
            + _working_hours_filter(time_filter)
        )
        params = {**user_params, "start": month_start}
        rows = client.query(sql, parameters=params).result_rows
        count = _safe_int(rows[0][0]) if rows else 0
        _cache[cache_key] = count
        return count
    except Exception as exc:
        logger.error("ClickHouse query failed", extra={"action": "clickhouse_query", "error": str(exc)})
        raise


def get_weekly_token_usage(user: dict[str, Any], time_filter: str = "all") -> int:
    today = datetime.now(tz=timezone(timedelta(hours=8))).date()
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"weekly_token:{_uid}:{week_start}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    try:
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
    except Exception as exc:
        logger.error("ClickHouse query failed", extra={"action": "clickhouse_query", "error": str(exc)})
        raise


def get_weekly_request_count(user: dict[str, Any], time_filter: str = "all") -> int:
    today = datetime.now(tz=timezone(timedelta(hours=8))).date()
    week_start = (today - timedelta(days=today.weekday())).isoformat()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"weekly_req:{_uid}:{week_start}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    try:
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
    except Exception as exc:
        logger.error("ClickHouse query failed", extra={"action": "clickhouse_query", "error": str(exc)})
        raise


def get_monthly_active_days(user: dict[str, Any]) -> int:
    now = datetime.now(tz=timezone.utc)
    month_start = date(now.year, now.month, 1).isoformat()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"monthly_active_days:{_uid}:{month_start}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    try:
        client = _get_client()
        sql = (
            f"SELECT count(DISTINCT {EVENT_DATE}) FROM events"
            f" PREWHERE event_date >= {{start:String}}"
            f" WHERE {user_cond}"
            f" AND {_BASE_FILTER}"
        )
        params = {**user_params, "start": month_start}
        rows = client.query(sql, parameters=params).result_rows
        days = _safe_int(rows[0][0]) if rows else 0
        _cache[cache_key] = days
        return days
    except Exception as exc:
        logger.error("ClickHouse query failed", extra={"action": "clickhouse_query", "error": str(exc)})
        raise


def get_today_token_usage(user: dict[str, Any], time_filter: str = "auto") -> int:
    today = _today_shanghai()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"today_token:{_uid}:{today}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    try:
        client = _get_client()
        sql = (
            f"SELECT sum({TOTAL_TOKEN}) FROM events"
            f" PREWHERE event_date = {{today:String}}"
            f" WHERE {user_cond}"
            f" AND {_BASE_FILTER}"
            + _working_hours_filter(time_filter)
        )
        params = {**user_params, "today": today}
        rows = client.query(sql, parameters=params).result_rows
        total = _safe_int(rows[0][0]) if rows else 0
        _cache[cache_key] = total
        return total
    except Exception as exc:
        logger.error("ClickHouse query failed", extra={"action": "clickhouse_query", "error": str(exc)})
        raise


def get_daily_request_count(user: dict[str, Any], time_filter: str = "auto") -> int:
    today = _today_shanghai()
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"daily_req:{_uid}:{today}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    try:
        client = _get_client()
        sql = (
            f"SELECT count() FROM events"
            f" PREWHERE event_date = {{today:String}}"
            f" WHERE {user_cond}"
            f" AND {_BASE_FILTER}"
        )
        params = {**user_params, "today": today}
        rows = client.query(sql, parameters=params).result_rows
        count = _safe_int(rows[0][0]) if rows else 0
        _cache[cache_key] = count
        return count
    except Exception as exc:
        logger.error("ClickHouse query failed", extra={"action": "clickhouse_query", "error": str(exc)})
        raise


def get_daily_trend(user: dict[str, Any], start_date: str, end_date: str, time_filter: str = "all") -> list[dict[str, Any]]:
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"trend:{_uid}:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    try:
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
    except Exception as exc:
        logger.error("ClickHouse query failed", extra={"action": "clickhouse_query", "error": str(exc)})
        raise


def get_model_distribution(
    user: dict[str, Any], start_date: str, end_date: str, time_filter: str = "all"
) -> list[dict[str, Any]]:
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"model_dist:{_uid}:{start_date}:{end_date}:{time_filter}"
    if cache_key in _cache:
        return list(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    try:
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
    except Exception as exc:
        logger.error("ClickHouse query failed", extra={"action": "clickhouse_query", "error": str(exc)})
        raise


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

    try:
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
    except Exception as exc:
        logger.error("ClickHouse query failed", extra={"action": "clickhouse_query", "error": str(exc)})
        raise


def get_chat_session_count(user: dict[str, Any], scope: str = "month", time_filter: str = "auto") -> int:
    _uid = user.get("sam") or user.get("sub", "")
    cache_key = f"chat_sessions:{_uid}:{scope}:{time_filter}"
    if cache_key in _cache:
        return int(_cache[cache_key])

    user_cond, user_params = _user_filter(user)
    try:
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
    except Exception as exc:
        logger.error("ClickHouse query failed", extra={"action": "clickhouse_query", "error": str(exc)})
        raise
