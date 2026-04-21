# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""PostgreSQL connection and user table management."""

from __future__ import annotations

import logging
import threading
from contextlib import contextmanager
from typing import Any

import psycopg2
import psycopg2.extras
import psycopg2.pool

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
    daily_chats    INT    NOT NULL DEFAULT 0,
    daily_requests   INT    NOT NULL DEFAULT 0
);

INSERT INTO quota_levels (level, monthly_token, daily_chats, daily_requests)
VALUES ('L1', 25000000, 100, 500), ('L2', 50000000, 200, 1000), ('L3', 100000000, 500, 2000)
ON CONFLICT (level) DO UPDATE SET monthly_token = EXCLUDED.monthly_token, daily_chats = EXCLUDED.daily_chats;

CREATE TABLE IF NOT EXISTS email_alerts (
    user_id    TEXT NOT NULL,
    month_key  TEXT NOT NULL,
    sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, month_key)
);

CREATE TABLE IF NOT EXISTS email_notifications (
    id          SERIAL PRIMARY KEY,
    user_id     TEXT NOT NULL,
    quota_type  TEXT NOT NULL,
    threshold   INTEGER NOT NULL,
    period_key  TEXT NOT NULL,
    sent_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    over_limit  BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (user_id, quota_type, threshold, period_key)
);

CREATE TABLE IF NOT EXISTS email_templates (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    subject     TEXT NOT NULL,
    body_html   TEXT NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO email_templates (name, subject, body_html)
VALUES (
    'default',
    '【AI Code Usage】您的{{quota_type_label}}用量已达 {{threshold}}',
    '<p>您好 {{username}}（{{user_id}}），</p>
<p>您的 <strong>{{quota_type_label}}</strong> 在 {{period}} 已使用 <strong>{{percent}}</strong>（{{used}} / {{limit}}）。</p>
<p>当前触发阈值：{{threshold}}。</p>
<p>配额将于 {{reset_time}} 自动重置，如需提升配额请联系管理员。</p>
<p>— AI Code Usage 系统</p>'
)
ON CONFLICT (name) DO NOTHING;
"""


def _get_conn() -> Any:
    cfg = get_config()
    url = cfg.get("database", {}).get("url", "")
    return psycopg2.connect(url)


# ---------------------------------------------------------------------------
# Connection pool (lazy init, thread-safe)
# ---------------------------------------------------------------------------
_pool: psycopg2.pool.ThreadedConnectionPool | None = None
_pool_lock = threading.Lock()


def _get_pool() -> psycopg2.pool.ThreadedConnectionPool:
    global _pool  # noqa: PLW0603
    if _pool is None:
        with _pool_lock:
            if _pool is None:
                cfg = get_config()
                url = cfg.get("database", {}).get("url", "")
                _pool = psycopg2.pool.ThreadedConnectionPool(
                    minconn=2,
                    maxconn=20,
                    dsn=url,
                )
                logger.info("PostgreSQL connection pool initialized (min=2, max=20)")
    return _pool


@contextmanager
def _get_conn_ctx():  # type: ignore[return]
    """Context manager: acquire a pooled connection, return it on exit."""
    pool = _get_pool()
    conn = pool.getconn()
    try:
        yield conn
    finally:
        pool.putconn(conn)


def init_db() -> None:
    """Create the users table if it does not exist."""
    with _get_conn_ctx() as conn:
        with conn.cursor() as cur:
            cur.execute(_INIT_SQL)
        conn.commit()
        logger.info("Database initialised (users table ensured)")


def get_user(user_id: str) -> dict[str, Any] | None:
    with _get_conn_ctx() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM users WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            return dict(row) if row else None


def get_quota_limits(level: str) -> dict[str, Any]:
    """Return monthly_token and daily_requests limits for a quota level."""
    with _get_conn_ctx() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT monthly_token, daily_chats, daily_requests FROM quota_levels WHERE level = %s",
                (level,),
            )
            row = cur.fetchone()
            return dict(row) if row else {"monthly_token": 0, "daily_requests": 0}


def get_all_quota_levels() -> list[dict[str, Any]]:
    """Return all quota levels with current user counts."""
    with _get_conn_ctx() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                SELECT ql.level, ql.monthly_token, ql.daily_chats, ql.daily_requests,
                       COUNT(u.user_id)::int AS user_count
                FROM quota_levels ql
                LEFT JOIN users u ON u.quota_level = ql.level
                GROUP BY ql.level, ql.monthly_token, ql.daily_chats, ql.daily_requests
                ORDER BY ql.level
                """,
            )
            return [dict(row) for row in cur.fetchall()]


def update_quota_level(
    level: str,
    monthly_token: int,
    daily_chats: int,
    daily_requests: int,
) -> dict[str, Any] | None:
    """Update limits for an existing quota level. Returns updated row or None."""
    if level not in ("L1", "L2", "L3"):
        return None
    with _get_conn_ctx() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                """
                UPDATE quota_levels
                SET monthly_token = %s, daily_chats = %s, daily_requests = %s
                WHERE level = %s
                RETURNING *
                """,
                (monthly_token, daily_chats, daily_requests, level),
            )
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None


def get_all_users() -> list[dict[str, Any]]:
    """Return all users from PostgreSQL."""
    with _get_conn_ctx() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT user_id, username, nickname, enterprise, quota_level FROM users ORDER BY user_id",
            )
            return [dict(row) for row in cur.fetchall()]


def update_user_level(user_id: str, level: str) -> dict[str, Any] | None:
    """Update a user's quota level. Upserts the user row if not exists.

    PG may be empty (users are sourced from ClickHouse). When updating level
    for a user not yet in PG, insert a minimal row first, then update level.
    Returns updated row or None on invalid level.
    """
    if level not in ("L1", "L2", "L3"):
        return None
    with _get_conn_ctx() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            # UPSERT: insert with given level if user doesn't exist, else update
            cur.execute(
                """
                INSERT INTO users (user_id, username, quota_level)
                VALUES (%s, %s, %s)
                ON CONFLICT (user_id) DO UPDATE SET quota_level = EXCLUDED.quota_level
                RETURNING *
                """,
                (user_id, user_id, level),
            )
            row = cur.fetchone()
        conn.commit()
        return dict(row) if row else None


def upsert_user(
    *,
    user_id: str,
    username: str | None = None,
    nickname: str | None = None,
    enterprise: str | None = None,
    mail: str | None = None,
) -> dict[str, Any]:
    """Insert a user with L1 level if not exists, otherwise return existing."""
    with _get_conn_ctx() as conn:
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


def has_sent_alert(user_id: str, month_key: str) -> bool:
    """Return True if a quota alert was already sent this month."""
    with _get_conn_ctx() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM email_alerts WHERE user_id = %s AND month_key = %s",
                (user_id, month_key),
            )
            return cur.fetchone() is not None


def mark_alert_sent(user_id: str, month_key: str) -> None:
    """Record that a quota alert was sent for this user this month."""
    with _get_conn_ctx() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO email_alerts (user_id, month_key) VALUES (%s, %s) ON CONFLICT DO NOTHING",
                (user_id, month_key),
            )
        conn.commit()


# ─── email_notifications (new dedup table) ───


def has_sent_notification(user_id: str, quota_type: str, threshold: int, period_key: str) -> bool:
    """Return True if notification already sent for this user/type/threshold/period."""
    with _get_conn_ctx() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM email_notifications WHERE user_id = %s AND quota_type = %s AND threshold = %s AND period_key = %s",
                (user_id, quota_type, threshold, period_key),
            )
            return cur.fetchone() is not None


def mark_notification_sent(
    user_id: str, quota_type: str, threshold: int, period_key: str, over_limit: bool = False
) -> None:
    """Record that a notification was sent."""
    with _get_conn_ctx() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO email_notifications (user_id, quota_type, threshold, period_key, over_limit) "
                "VALUES (%s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                (user_id, quota_type, threshold, period_key, over_limit),
            )
        conn.commit()


# ─── email_templates ───

_DEFAULT_TEMPLATE_SUBJECT = "【AI Code Usage】您的{{quota_type_label}}用量已达 {{threshold}}"
_DEFAULT_TEMPLATE_BODY = (
    "<p>您好 {{username}}，</p>\n"
    "<p>您的 <strong>{{quota_type_label}}</strong> 在 {{period}} 已使用 <strong>{{percent}}</strong>"
    "（{{used}} / {{limit}}）。</p>\n"
    "<p>当前触发阈值：{{threshold}}。</p>\n"
    "<p>配额将于 {{reset_time}} 自动重置，如需提升配额请联系管理员。</p>\n"
    "<p>— AI Code Usage 系统</p>"
)


def get_email_template(name: str) -> dict[str, Any]:
    """Get email template by name. Returns built-in default if not found."""
    with _get_conn_ctx() as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT name, subject, body_html, updated_at FROM email_templates WHERE name = %s",
                (name,),
            )
            row = cur.fetchone()
            if row:
                return dict(row)
    # Return built-in default
    return {
        "name": name,
        "subject": _DEFAULT_TEMPLATE_SUBJECT,
        "body_html": _DEFAULT_TEMPLATE_BODY,
        "updated_at": None,
    }


def save_email_template(name: str, subject: str, body_html: str) -> None:
    """Upsert an email template."""
    with _get_conn_ctx() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "INSERT INTO email_templates (name, subject, body_html, updated_at) "
                "VALUES (%s, %s, %s, now()) "
                "ON CONFLICT (name) DO UPDATE SET subject = EXCLUDED.subject, body_html = EXCLUDED.body_html, updated_at = now()",
                (name, subject, body_html),
            )
        conn.commit()
