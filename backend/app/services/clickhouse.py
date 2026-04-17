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
from app.data_schema import TOTAL_TOKEN, USER_ID

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
