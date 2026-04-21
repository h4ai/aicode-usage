# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""ClickHouse client singleton and safe numeric converters."""

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
# ClickHouse client
# ---------------------------------------------------------------------------

_ch_client: Any = None


def _get_client() -> Any:
    """Return a module-level singleton ClickHouse client (reuse HTTP connection pool)."""
    global _ch_client
    if _ch_client is None:
        cfg = get_config().get("clickhouse", {})
        _ch_client = _ch_get_client(
            host=cfg.get("host", "localhost"),
            port=cfg.get("port", 8123),       # HTTP port
            database=cfg.get("database", "otel"),
            username=cfg.get("user", "default"),  # clickhouse_connect uses 'username'
            password=cfg.get("password", ""),
        )
    return _ch_client


def _reset_client() -> None:
    """Force reconnect on next call (used in tests / config reload)."""
    global _ch_client
    _ch_client = None


# 5-minute TTL cache, max 1024 entries
_cache: TTLCache[str, Any] = TTLCache(maxsize=1024, ttl=300)
