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
from app.services.clickhouse import get_all_users_from_clickhouse, get_daily_request_count, get_monthly_token_usage
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
    import asyncio

    from app.services.database import get_email_template
    from app.services.notification import mail_send
    template = get_email_template("default")

    # Build context for template rendering
    from app.services.template_renderer import build_context, render_template
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
        # APScheduler runs in a background thread; create a fresh event loop
        # to avoid "This event loop is already running" when asyncio.run() is
        # called from a thread that already has a running loop (FastAPI main thread).
        loop = asyncio.new_event_loop()
        try:
            loop.run_until_complete(mail_send(subject, to_email, "", body))
        finally:
            loop.close()
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

    # 从 ClickHouse 获取完整用户列表（PG 只有登录过的用户，可能不完整）
    try:
        ch_users = get_all_users_from_clickhouse()
    except Exception:
        ch_users = []
    pg_users = get_all_users()
    pg_map = {u["user_id"]: u for u in pg_users}

    if ch_users:
        # 合并：CH 用户列表为主，PG 补充 quota_level 和 mail 信息，不在 PG 里的默认 L1
        users = []
        for cu in ch_users:
            uid = cu["username"]  # userNickname
            pg_u = pg_map.get(uid, {})
            users.append({
                "user_id": uid,
                "username": uid,
                "nickname": cu.get("nickname") or uid,
                "mail": pg_u.get("mail") or cu.get("mail") or "",
                "quota_level": pg_u.get("quota_level", "L1"),
            })
    else:
        # Fallback: use PG users directly
        users = pg_users
    # 限流参数：从 notification config 读取，默认每批 10 封，批间隔 2 秒
    batch_size: int = notif_cfg.get("email_batch_size", 10)
    batch_delay: float = float(notif_cfg.get("email_batch_delay_seconds", 2))
    emails_sent_this_run = 0

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
                    emails_sent_this_run += 1
                    logger.info(
                        "Notification sent: user=%s type=%s threshold=%d%%",
                        user_id, quota_type, threshold,
                    )
                    # 批量限流：每发 batch_size 封，暂停 batch_delay 秒
                    if batch_size > 0 and emails_sent_this_run % batch_size == 0:
                        logger.info("Rate limiting: sent %d emails, sleeping %.1fs", emails_sent_this_run, batch_delay)
                        time.sleep(batch_delay)
                else:
                    logger.error(
                        "Failed to send notification after 3 attempts: user=%s type=%s threshold=%d%%",
                        user_id, quota_type, threshold,
                    )
