# SPDX-License-Identifier: Apache-2.0
"""Enhanced email notification service (v2).

Supports multiple quota types (monthly_token, daily_chats) and
multiple configurable thresholds (e.g. 50%, 80%, 100%).
"""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone

from app.config import get_config
from app.services.clickhouse import get_monthly_token_usage, get_daily_request_count
from app.services.database import (
    get_all_users,
    get_quota_limits,
    has_sent_notification,
    mark_notification_sent,
)

logger = logging.getLogger(__name__)


def on_over_limit(user_id: str, quota_type: str) -> None:
    """Hook called when user reaches 100% of quota.

    Current: log warning only.
    Future: disable user model access via API.
    """
    logger.warning("User %s exceeded quota: %s", user_id, quota_type)


def send_notification_email(
    *,
    to_email: str,
    username: str,
    user_id: str,
    quota_type: str,
    used: int,
    limit: int,
    threshold: int,
    period_key: str,
) -> bool:
    """Send a single notification email. Returns True on success, False on failure."""
    from app.services.notification import mail_send
    import asyncio

    cfg = get_config()
    from app.services.database import get_email_template
    template = get_email_template("default")

    # Build context for template rendering
    from app.services.template_renderer import render_template, build_context
    context = build_context(
        username=username,
        user_id=user_id,
        quota_type=quota_type,
        used=used,
        limit=limit,
        threshold=threshold,
        period_key=period_key,
    )
    subject = render_template(template["subject"], context)
    body = render_template(template["body_html"], context)

    try:
        asyncio.run(mail_send(subject, to_email, "", body))
        return True
    except Exception as exc:
        logger.error("Failed to send email to %s: %s", to_email, exc)
        return False


def check_quota_alerts() -> None:
    """Check all users and send quota notifications for multiple thresholds.

    Called by APScheduler at configured intervals.
    """
    cfg = get_config()
    notif_cfg = cfg.get("notification", {})

    if not notif_cfg.get("enabled", True):
        return

    thresholds = notif_cfg.get("thresholds", [50, 80, 100])
    now = datetime.now(tz=timezone.utc)
    month_key = f"{now.year}-{now.month:02d}"
    day_key = f"{now.year}-{now.month:02d}-{now.day:02d}"

    users = get_all_users()
    for user in users:
        user_id = user["user_id"]
        mail = user.get("mail") or ""
        if not mail.strip():
            # Try to construct from email_domain
            email_domain = notif_cfg.get("email_domain", "")
            sam = user.get("username") or user_id
            if email_domain:
                mail = f"{sam}@{email_domain}"
            else:
                logger.debug("Skipping user %s: no mail and no email_domain", user_id)
                continue

        quota_level = user.get("quota_level", "L1")
        limits = get_quota_limits(quota_level)
        username = user.get("nickname") or user.get("username") or user_id

        # Check each quota type
        quota_checks = [
            ("monthly_token", limits.get("monthly_token", 0), get_monthly_token_usage, month_key),
            ("daily_chats", limits.get("daily_chats", 0), get_daily_request_count, day_key),
        ]

        for quota_type, quota_limit, usage_fn, period_key in quota_checks:
            if quota_limit <= 0:
                continue

            used = usage_fn(user)
            pct = used / quota_limit * 100

            for threshold in thresholds:
                if threshold <= 0:
                    continue
                if pct < threshold:
                    continue

                if has_sent_notification(user_id, quota_type, threshold, period_key):
                    continue

                # Call over_limit hook for 100%
                if threshold == 100:
                    on_over_limit(user_id, quota_type)

                # Retry up to 3 times with exponential backoff
                success = False
                for attempt in range(3):
                    result = send_notification_email(
                        to_email=mail,
                        username=username,
                        user_id=user_id,
                        quota_type=quota_type,
                        used=used,
                        limit=quota_limit,
                        threshold=threshold,
                        period_key=period_key,
                    )
                    if result:
                        success = True
                        break
                    if attempt < 2:
                        time.sleep(2 ** attempt)  # 1s, 2s

                if success:
                    over_limit = threshold >= 100
                    mark_notification_sent(user_id, quota_type, threshold, period_key, over_limit)
                    logger.info(
                        "Notification sent: user=%s type=%s threshold=%d%%",
                        user_id, quota_type, threshold,
                    )
                else:
                    logger.error(
                        "Failed to send notification after 3 attempts: user=%s type=%s threshold=%d%%",
                        user_id, quota_type, threshold,
                    )
