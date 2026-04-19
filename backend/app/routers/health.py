# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Health-check router — GET /health."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter

from app.config import get_config

router = APIRouter()
logger = logging.getLogger(__name__)


def _check_clickhouse(cfg: dict[str, Any]) -> dict[str, Any]:
    """Attempt a lightweight ClickHouse ping."""
    ch_cfg = cfg.get("clickhouse", {})
    try:
        from clickhouse_driver import Client

        client = Client(
            host=ch_cfg.get("host", "localhost"),
            port=ch_cfg.get("port", 9000),
            database=ch_cfg.get("database", "otel"),
            user=ch_cfg.get("user", "default"),
            password=ch_cfg.get("password", ""),
            connect_timeout=3,
        )
        client.execute("SELECT 1")
        return {"status": "ok"}
    except Exception:
        logger.exception("ClickHouse health check failed")
        return {"status": "error", "detail": "internal_error"}


def _check_postgres(cfg: dict[str, Any]) -> dict[str, Any]:
    """Attempt a lightweight PostgreSQL ping."""
    db_url = cfg.get("database", {}).get("url", "")
    if not db_url:
        return {"status": "not_configured"}
    try:
        import psycopg2

        conn = psycopg2.connect(db_url, connect_timeout=3)
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.close()
        conn.close()
        return {"status": "ok"}
    except Exception:
        logger.exception("PostgreSQL health check failed")
        return {"status": "error", "detail": "internal_error"}


def _check_ldap(cfg: dict[str, Any]) -> dict[str, Any]:
    """Attempt a lightweight LDAP connection test."""
    ldap_cfg = cfg.get("ldap", {})
    server = ldap_cfg.get("server", "")
    if not server:
        return {"status": "not_configured"}
    try:
        import ldap as ldap_lib

        conn = ldap_lib.initialize(server)
        conn.set_option(ldap_lib.OPT_NETWORK_TIMEOUT, 3)
        conn.simple_bind_s("", "")
        conn.unbind_s()
        return {"status": "ok"}
    except Exception:
        logger.exception("LDAP health check failed")
        return {"status": "error", "detail": "internal_error"}


@router.get("/health")
def health() -> dict[str, Any]:
    """Return connectivity status for ClickHouse, PostgreSQL and LDAP."""
    cfg = get_config()
    return {
        "clickhouse": _check_clickhouse(cfg),
        "postgres": _check_postgres(cfg),
        "ldap": _check_ldap(cfg),
    }
