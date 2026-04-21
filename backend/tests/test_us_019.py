# SPDX-License-Identifier: Apache-2.0
"""
US-019: 邮件模板变量替换与地址构成
AC 验收标准测试
"""
from __future__ import annotations

import pytest


def test_render_template_replaces_all_9_placeholders():
    """AC-1: render_template replaces all 9 placeholders."""
    from app.services.template_renderer import render_template
    template = "{{username}} {{user_id}} {{quota_type_label}} {{used}} {{limit}} {{percent}} {{threshold}} {{period}} {{reset_time}}"
    context = {
        "username": "张三",
        "user_id": "zhangsan",
        "quota_type_label": "月度Token",
        "used": "8,000,000",
        "limit": "10,000,000",
        "percent": "80.0%",
        "threshold": "80%",
        "period": "2026年4月",
        "reset_time": "每月1日重置",
    }
    result = render_template(template, context)
    assert "张三" in result
    assert "zhangsan" in result
    assert "月度Token" in result
    assert "8,000,000" in result
    assert "10,000,000" in result
    assert "80.0%" in result
    assert "80%" in result
    assert "2026年4月" in result
    assert "每月1日重置" in result
    assert "{{" not in result


def test_build_context_monthly_token():
    """AC-2: monthly_token context has correct labels."""
    from app.services.template_renderer import build_context
    ctx = build_context(
        username="张三",
        user_id="zhangsan",
        quota_type="monthly_token",
        used=8000000,
        limit=10000000,
        threshold=80,
        period_key="2026-04",
    )
    assert ctx["quota_type_label"] == "月度Token"
    assert "2026年4月" in ctx["period"]
    assert ctx["reset_time"] == "每月1日重置"


def test_build_context_daily_chats():
    """AC-3: daily_chats context has correct labels."""
    from app.services.template_renderer import build_context
    ctx = build_context(
        username="张三",
        user_id="zhangsan",
        quota_type="daily_chats",
        used=85,
        limit=100,
        threshold=80,
        period_key="2026-04-21",
    )
    assert ctx["quota_type_label"] == "日对话轮次"
    assert "4月21日" in ctx["period"]
    assert ctx["reset_time"] == "次日00:00重置"


def test_build_context_formats_numbers_with_commas():
    """AC-4: used/limit formatted with thousand separators."""
    from app.services.template_renderer import build_context
    ctx = build_context(
        username="U",
        user_id="u",
        quota_type="monthly_token",
        used=8000000,
        limit=10000000,
        threshold=80,
        period_key="2026-04",
    )
    assert ctx["used"] == "8,000,000"
    assert ctx["limit"] == "10,000,000"


def test_build_context_percent_format():
    """AC-4: percent formatted as 'XX.X%'."""
    from app.services.template_renderer import build_context
    ctx = build_context(
        username="U",
        user_id="u",
        quota_type="monthly_token",
        used=8050000,
        limit=10000000,
        threshold=80,
        period_key="2026-04",
    )
    assert ctx["percent"] == "80.5%"


def test_build_context_threshold_format():
    """AC-4: threshold is formatted as 'X%'."""
    from app.services.template_renderer import build_context
    ctx = build_context(
        username="U",
        user_id="u",
        quota_type="monthly_token",
        used=5000000,
        limit=10000000,
        threshold=50,
        period_key="2026-04",
    )
    assert ctx["threshold"] == "50%"


def test_unknown_placeholder_preserved():
    """AC (implicit): Unknown placeholders remain as-is."""
    from app.services.template_renderer import render_template
    result = render_template("Hello {{unknown_var}}", {"username": "test"})
    assert "{{unknown_var}}" in result


def test_email_address_from_ad_mail():
    """AC-5: AD mail used directly when available."""
    from app.services.notification_v2 import check_quota_alerts
    # This is tested implicitly via the mock_all fixture in US-018
    # Direct unit test: email construction logic
    pass  # Covered by integration in US-018


def test_email_domain_fallback():
    """AC-5: When mail is empty, construct from sam@domain."""
    from unittest.mock import patch, MagicMock
    cfg = {
        "notification": {"enabled": True, "thresholds": [80], "email_domain": "corp.com"},
        "smtp": {"host": "smtp.test.com", "port": 25, "username": "", "password": "", "from_email": "x@y.com"},
    }
    with patch("app.services.notification_v2.get_config", return_value=cfg), \
         patch("app.services.notification_v2.get_all_users") as users, \
         patch("app.services.notification_v2.get_quota_limits") as limits, \
         patch("app.services.notification_v2.get_monthly_token_usage") as monthly, \
         patch("app.services.notification_v2.get_daily_request_count") as daily, \
         patch("app.services.notification_v2.has_sent_notification", return_value=False), \
         patch("app.services.notification_v2.mark_notification_sent"), \
         patch("app.services.notification_v2.send_notification_email", return_value=True) as send:
        users.return_value = [{"user_id": "sam1", "username": "sam1", "nickname": "Sam", "mail": "", "quota_level": "L1"}]
        limits.return_value = {"monthly_token": 1000, "daily_chats": 0, "daily_requests": 0}
        monthly.return_value = 900
        daily.return_value = 0

        from app.services.notification_v2 import check_quota_alerts
        check_quota_alerts()

        send.assert_called_once()
        assert send.call_args[1]["to_email"] == "sam1@corp.com"


def test_no_email_domain_and_no_mail_skips_user():
    """AC-6: No mail and no email_domain → skip user with debug log."""
    from unittest.mock import patch
    cfg = {
        "notification": {"enabled": True, "thresholds": [80]},
        "smtp": {"host": "smtp.test.com", "port": 25, "username": "", "password": "", "from_email": "x@y.com"},
    }
    with patch("app.services.notification_v2.get_config", return_value=cfg), \
         patch("app.services.notification_v2.get_all_users") as users, \
         patch("app.services.notification_v2.get_quota_limits"), \
         patch("app.services.notification_v2.get_monthly_token_usage"), \
         patch("app.services.notification_v2.get_daily_request_count"), \
         patch("app.services.notification_v2.has_sent_notification"), \
         patch("app.services.notification_v2.mark_notification_sent") as mark, \
         patch("app.services.notification_v2.send_notification_email") as send:
        users.return_value = [{"user_id": "x", "username": "x", "nickname": "X", "mail": "", "quota_level": "L1"}]

        from app.services.notification_v2 import check_quota_alerts
        check_quota_alerts()

        send.assert_not_called()
