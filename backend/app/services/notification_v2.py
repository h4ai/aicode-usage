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
from app.services.clickhouse_user import get_daily_chat_count
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
            uid = cu["username"]  # userNickname，格式可能是 "张三(aaa)" 或纯 "aaa"
            pg_u = pg_map.get(uid, {})
            # 从 userNickname 解析 sam：优先取括号内域账号（如 "张三(aaa)" → "aaa"）
            import re as _re
            _m = _re.search(r'\(([^)]+)\)$', uid)
            sam = _m.group(1) if _m else uid
            users.append({
                "user_id": uid,
                "username": uid,
                "sam": sam,          # 供 _user_filter() 按 userNickname 精确匹配
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
                logger.warning("Skipping user %s: no mail and no email_domain configured", user_id)
                continue

        quota_level = user.get("quota_level", "L1")
        limits = get_quota_limits(quota_level)
        username = user.get("nickname") or user.get("username") or user_id

        # Check each quota type
        # monthly_token: 使用 time_filter="auto"（工作时段），与配额判断口径一致
        # daily_chats: 使用 time_filter="auto"（工作时段）
        quota_checks = [
            ("monthly_token", limits.get("monthly_token", 0),
             lambda u: get_monthly_token_usage(u, time_filter="auto"), month_key),
            ("daily_chats", limits.get("daily_chats", 0),
             lambda u: get_daily_chat_count(u, time_filter="auto"), day_key),
        ]

        for quota_type, quota_limit, usage_fn, period_key in quota_checks:
            if quota_limit <= 0:
                continue

            used = usage_fn(user)
            pct = used / quota_limit * 100

            # 找出所有已超过且未发过通知的阈值
            triggered = sorted(
                [t for t in thresholds
                 if t > 0 and pct >= t and not has_sent_notification(user_id, quota_type, t, period_key)],
                reverse=True,
            )
            if not triggered:
                continue
            # 首次上线或多阈值同时超标：只发最高阈值那一封
            threshold = triggered[0]

            # 标记所有已触发但未发送的低阈值为"已发"（避免下次再发）
            for lower_t in triggered[1:]:
                mark_notification_sent(user_id, quota_type, lower_t, period_key, over_limit=lower_t >= 100)

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
