# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""PostgreSQL connection and user table management."""

from __future__ import annotations

import logging
from typing import Any

import psycopg2
import psycopg2.extras

from app.config import get_config

logger = logging.getLogger(__name__)

_INIT_SQL = """
CREATE TABLE IF NOT EXISTS users (
    user_id      TEXT PRIMARY KEY,
    username     TEXT,
    nickname     TEXT,
    enterprise   TEXT,
    mail         TEXT,
    quota_level  TEXT NOT NULL DEFAULT 'L1',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS quota_levels (
    level            TEXT PRIMARY KEY,
    monthly_token    BIGINT NOT NULL DEFAULT 0,
    daily_requests   INT    NOT NULL DEFAULT 0
);

INSERT INTO quota_levels (level, monthly_token, daily_requests)
VALUES ('L1', 5000000, 500), ('L2', 10000000, 1000), ('L3', 20000000, 2000)
ON CONFLICT (level) DO NOTHING;
"""


def _get_conn() -> Any:
    cfg = get_config()
    url = cfg.get("database", {}).get("url", "")
    return psycopg2.connect(url)


def init_db() -> None:
    """Create the users table if it does not exist."""
    conn = _get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(_INIT_SQL)
        conn.commit()
        logger.info("Database initialised (users table ensured)")
    finally:
        conn.close()


def get_user(user_id: str) -> dict[str, Any] | None:
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM users WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            return dict(row) if row else None
    finally:
        conn.close()


def get_quota_limits(level: str) -> dict[str, Any]:
    """Return monthly_token and daily_requests limits for a quota level."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT monthly_token, daily_requests FROM quota_levels"
                " WHERE level = %s",
                (level,),
            )
            row = cur.fetchone()
            return dict(row) if row else {"monthly_token": 0, "daily_requests": 0}
    finally:
        conn.close()


def get_all_quota_levels() -> list[dict[str, Any]]:
    """Return all quota levels with current user counts."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT ql.level, ql.monthly_token, ql.daily_requests,
                       COUNT(u.user_id)::int AS user_count
                FROM quota_levels ql
                LEFT JOIN users u ON u.quota_level = ql.level
                GROUP BY ql.level, ql.monthly_token, ql.daily_requests
                ORDER BY ql.level
                """,
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def update_quota_level(
    level: str, monthly_token: int, daily_requests: int,
) -> dict[str, Any] | None:
    """Update limits for an existing quota level. Returns updated row or None."""
    if level not in ("L1", "L2", "L3"):
        return None
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE quota_levels
                SET monthly_token = %s, daily_requests = %s
                WHERE level = %s
                RETURNING *
                """,
                (monthly_token, daily_requests, level),
            )
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None
    finally:
        conn.close()


def get_all_users() -> list[dict[str, Any]]:
    """Return all users from PostgreSQL."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT user_id, username, nickname, enterprise, quota_level"
                " FROM users ORDER BY user_id",
            )
            return [dict(row) for row in cur.fetchall()]
    finally:
        conn.close()


def update_user_level(user_id: str, level: str) -> dict[str, Any] | None:
    """Update a user's quota level. Returns updated row or None."""
    if level not in ("L1", "L2", "L3"):
        return None
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "UPDATE users SET quota_level = %s WHERE user_id = %s RETURNING *",
                (level, user_id),
            )
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None
    finally:
        conn.close()


def upsert_user(
    *,
    user_id: str,
    username: str | None = None,
    nickname: str | None = None,
    enterprise: str | None = None,
    mail: str | None = None,
) -> dict[str, Any]:
    """Insert a user with L1 level if not exists, otherwise return existing."""
    conn = _get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                INSERT INTO users (user_id, username, nickname, enterprise, mail)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (user_id) DO UPDATE SET
                    username = COALESCE(EXCLUDED.username, users.username),
                    nickname = COALESCE(EXCLUDED.nickname, users.nickname),
                    enterprise = COALESCE(EXCLUDED.enterprise, users.enterprise),
                    mail = COALESCE(EXCLUDED.mail, users.mail)
                RETURNING *
                """,
                (user_id, username, nickname, enterprise, mail),
            )
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else {}
    finally:
        conn.close()
