# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Email quota alert notification service.

Checks all users' monthly token usage and sends a one-time alert
when usage first reaches 80% of the monthly limit.
"""

from __future__ import annotations

import logging
import smtplib
from datetime import datetime, timezone
from email.mime.text import MIMEText
from typing import Any

from app.config import get_config
from app.services.clickhouse import get_monthly_token_usage
from app.services.database import (
    get_all_users,
    get_quota_limits,
    has_sent_alert,
    mark_alert_sent,
)

logger = logging.getLogger(__name__)

_ALERT_THRESHOLD = 0.80


def get_all_users_with_mail() -> list[dict[str, Any]]:
    """Return all users from PostgreSQL (includes mail field)."""
    return get_all_users()


def send_quota_email(
    *,
    to_email: str,
    username: str,
    used: int,
    limit: int,
) -> None:
    """Send quota warning email via SMTP.

    Reads SMTP configuration from config.yaml on each call (hot-reload).
    Raises on SMTP failure — caller decides whether to mark as sent.
    """
    cfg = get_config()
    smtp_cfg = cfg.get("smtp", {})
    host = smtp_cfg.get("host", "")
    port = int(smtp_cfg.get("port", 587))
    smtp_user = smtp_cfg.get("username", "")
    smtp_pass = smtp_cfg.get("password", "")
    from_name = smtp_cfg.get("from_name", "AI Code Usage")
    from_email = smtp_cfg.get("from_email", "")

    pct = round(used / limit * 100, 1) if limit > 0 else 0
    subject = f"【AI Code Usage】您的本月 Token 用量已达 {pct}%"
    body = (
        f"您好 {username}，\n\n"
        f"您本月的 Token 用量已达 {pct}%（{used:,} / {limit:,} tokens）。\n"
        f"如需增加配额，请联系管理员。\n\n"
        f"— AI Code Usage 系统"
    )

    msg = MIMEText(body, "plain", "utf-8")
    msg["Subject"] = subject
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email

    with smtplib.SMTP(host, port) as conn:
        conn.ehlo()
        if smtp_user:
            conn.starttls()
            conn.login(smtp_user, smtp_pass)
        conn.sendmail(from_email or smtp_user, [to_email], msg.as_string())


def check_quota_alerts() -> None:
    """Check all users and send 80% quota alert emails as needed.

    Called by APScheduler every hour.
    - Skips users with no mail address.
    - Sends at most once per calendar month per user.
    - Does NOT mark as sent if SMTP raises an exception.
    """
    now = datetime.now(tz=timezone.utc)
    month_key = f"{now.year}-{now.month:02d}"

    users = get_all_users_with_mail()
    for user in users:
        user_id = user["user_id"]
        mail = user.get("mail") or ""
        if not mail.strip():
            logger.debug("Skipping user %s: no mail address", user_id)
            continue

        quota_level = user.get("quota_level", "L1")
        limits = get_quota_limits(quota_level)
        monthly_limit = limits.get("monthly_token", 0)
        if monthly_limit <= 0:
            continue

        used = get_monthly_token_usage(user_id)
        if used / monthly_limit < _ALERT_THRESHOLD:
            continue

        if has_sent_alert(user_id, month_key):
            logger.debug("Alert already sent for %s in %s", user_id, month_key)
            continue

        try:
            send_quota_email(
                to_email=mail,
                username=user.get("nickname") or user.get("username") or user_id,
                used=used,
                limit=monthly_limit,
            )
            mark_alert_sent(user_id, month_key)
            logger.info("Quota alert sent to %s (%s)", user_id, mail)
        except Exception as exc:
            logger.error("Failed to send quota alert to %s: %s", user_id, exc)
