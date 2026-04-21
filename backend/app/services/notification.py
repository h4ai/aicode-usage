# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Email quota alert notification service (v1 — DEPRECATED).

.. deprecated::
    This module is superseded by :mod:`app.services.notification_v2`.
    New code should import from ``notification_v2``.

    Kept for:
    - ``mail_send``: low-level async SMTP helper, still used by notification_v2
    - ``check_quota_alerts`` / ``send_quota_email``: referenced by legacy tests (test_us_016)

    The application entrypoint (``main.py``) uses ``notification_v2.check_quota_alerts``
    exclusively; this module's ``check_quota_alerts`` is NOT called at runtime.
"""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any

import aiosmtplib

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


async def mail_send(
    subject: str,
    receiver: str,
    bcc: str,
    content: str,
    cc: str | None = None,
) -> None:
    """Send HTML email via aiosmtplib (reads SMTP config from config.yaml).

    Args:
        subject: 邮件主题
        receiver: 收件人（逗号分隔）
        bcc: 密送（逗号分隔）
        content: HTML 邮件正文
        cc: 抄送（逗号分隔，可选）
    """
    cfg = get_config()
    smtp_cfg = cfg.get("smtp", {})
    host: str = smtp_cfg.get("host", "")
    port: int = int(smtp_cfg.get("port", 25))
    smtp_user: str = smtp_cfg.get("username", "")
    smtp_pass: str = smtp_cfg.get("password", "")
    from_name: str = smtp_cfg.get("from_name", "AI Code Usage")
    from_email: str = smtp_cfg.get("from_email", "")

    if not host:
        raise RuntimeError("SMTP host not configured")

    msg = MIMEMultipart()
    msg.attach(MIMEText(content, "html", "utf-8"))
    msg["From"] = f"{from_name} <{from_email}>" if from_name else from_email
    msg["To"] = receiver
    msg["Bcc"] = bcc
    msg["Subject"] = subject
    if cc:
        msg["Cc"] = cc
        recipients = receiver.split(",") + bcc.split(",") + cc.split(",")
    else:
        recipients = receiver.split(",") + bcc.split(",")

    # Filter empty strings
    recipients = [r.strip() for r in recipients if r.strip()]

    client = aiosmtplib.SMTP(hostname=host, port=port)
    await client.connect()
    if smtp_user:
        await client.login(smtp_user, smtp_pass)
    await client.send_message(msg, recipients=recipients)
    await client.quit()
    logger.info("Mail sent: subject=%s to=%s", subject, receiver)


async def send_quota_email_async(
    *,
    to_email: str,
    username: str,
    used: int,
    limit: int,
) -> None:
    """Send quota warning email (async)."""
    cfg = get_config()
    smtp_cfg = cfg.get("smtp", {})
    from_email: str = smtp_cfg.get("from_email", "")

    pct = round(used / limit * 100, 1) if limit > 0 else 0
    subject = f"【AI Code Usage】您的本月 Token 用量已达 {pct}%"
    content = (
        f"<p>您好 {username}，</p>"
        f"<p>您本月的 Token 用量已达 <strong>{pct}%</strong>（{used:,} / {limit:,} tokens）。</p>"
        f"<p>如需增加配额，请联系管理员。</p>"
        f"<p>— AI Code Usage 系统</p>"
    )
    await mail_send(subject, to_email, "", content)


def send_quota_email(
    *,
    to_email: str,
    username: str,
    used: int,
    limit: int,
) -> None:
    """Sync wrapper for send_quota_email_async (called by APScheduler)."""
    asyncio.run(send_quota_email_async(
        to_email=to_email,
        username=username,
        used=used,
        limit=limit,
    ))


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
