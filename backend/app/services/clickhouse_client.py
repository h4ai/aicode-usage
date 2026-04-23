# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""ClickHouse client factory and safe numeric converters."""

from __future__ import annotations

import logging
import math
from typing import Any

from cachetools import TTLCache
from clickhouse_connect import get_client as _ch_get_client

from app.config import get_config

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
# ClickHouse client — thread-safe factory (one client per call)
# ---------------------------------------------------------------------------
# clickhouse_connect HTTP client is NOT thread-safe when shared across threads.
# Creating a new client per call is cheap (HTTP connection pool is managed by
# urllib3 inside clickhouse_connect) and avoids "concurrent queries within the
# same session" errors under FastAPI's thread-pool concurrency.

def _get_client() -> Any:
    """Create and return a new ClickHouse HTTP client for each call."""
    cfg = get_config().get("clickhouse", {})
    return _ch_get_client(
        host=cfg.get("host", "localhost"),
        port=cfg.get("port", 8123),
        database=cfg.get("database", "otel"),
        username=cfg.get("user", "default"),
        password=cfg.get("password", ""),
        connect_timeout=10,
        send_receive_timeout=30,
    )


def _reset_client() -> None:
    """No-op kept for backwards compatibility."""


# 5-minute TTL cache, max 1024 entries
_cache: TTLCache[str, Any] = TTLCache(maxsize=1024, ttl=300)

