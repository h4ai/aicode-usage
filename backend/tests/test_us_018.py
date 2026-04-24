# SPDX-License-Identifier: Apache-2.0
"""
US-018: 多阈值多配额项邮件通知核心逻辑
AC 验收标准测试
"""
from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock, call
import logging


MOCK_CONFIG = {
    "notification": {
        "enabled": True,
        "thresholds": [50, 80, 100],
        "email_domain": "example.com",
        "check_interval_minutes": 60,
    },
    "smtp": {
        "host": "smtp.example.com",
        "port": 25,
        "username": "",
        "password": "",
        "from_email": "no-reply@example.com",
        "from_name": "AI Code Usage",
    },
    "database": {"url": "postgresql://localhost/test"},
}


@pytest.fixture
def mock_all():
    """Patch all external deps for check_quota_alerts."""
    with patch("app.services.notification_v2.get_config", return_value=MOCK_CONFIG) as cfg, \
         patch("app.services.notification_v2.get_all_users") as users, \
         patch("app.services.notification_v2.get_quota_limits") as limits, \
         patch("app.services.notification_v2.get_monthly_token_usage") as monthly, \
         patch("app.services.notification_v2.get_daily_chat_count") as daily, \
         patch("app.services.notification_v2.has_sent_notification") as has_sent, \
         patch("app.services.notification_v2.mark_notification_sent") as mark_sent, \
         patch("app.services.notification_v2.send_notification_email") as send_email:
        yield {
            "config": cfg,
            "users": users,
            "limits": limits,
            "monthly": monthly,
            "daily": daily,
            "has_sent": has_sent,
            "mark_sent": mark_sent,
            "send_email": send_email,
        }


def test_checks_both_monthly_token_and_daily_chats(mock_all):
    """AC-1: check_quota_alerts checks both monthly_token and daily_chats.
    新逻辑：两种配额同时触发时，只发最高严重度（阈值最高）的一封邮件。
    monthly=85%触发80%，daily=55%触发50%，80% > 50%，只发 monthly_token 那封。
    """
    mock_all["users"].return_value = [
        {"user_id": "u1", "username": "u1", "nickname": "User1", "mail": "u1@ex.com", "quota_level": "L1"}
    ]
    mock_all["limits"].return_value = {"monthly_token": 10000000, "daily_chats": 100, "daily_requests": 500}
    mock_all["monthly"].return_value = 8500000  # 85% > 80%
    mock_all["daily"].return_value = 55  # 55% > 50%
    mock_all["has_sent"].return_value = False
    mock_all["send_email"].return_value = True

    from app.services.notification_v2 import check_quota_alerts
    check_quota_alerts()

    # 新逻辑：两种配额同时触发，只发最高阈值（80% > 50%），即 monthly_token
    sent_calls = mock_all["mark_sent"].call_args_list
    quota_types = [c[0][1] for c in sent_calls]
    assert "monthly_token" in quota_types   # 最高阈值，正式发送
    # daily_chats 50% 阈值低于 monthly 80%，本次不发（下次 monthly 发过后再单独判断）
    assert mock_all["send_email"].call_count == 1  # 只发一封


def test_skips_quota_when_limit_is_zero(mock_all):
    """AC-2: Quota with limit=0 is skipped."""
    mock_all["users"].return_value = [
        {"user_id": "u1", "username": "u1", "nickname": "User1", "mail": "u1@ex.com", "quota_level": "L1"}
    ]
    mock_all["limits"].return_value = {"monthly_token": 0, "daily_chats": 100, "daily_requests": 500}
    mock_all["monthly"].return_value = 0
    mock_all["daily"].return_value = 55
    mock_all["has_sent"].return_value = False
    mock_all["send_email"].return_value = True

    from app.services.notification_v2 import check_quota_alerts
    check_quota_alerts()

    # monthly_token should not be in sent calls
    sent_calls = mock_all["mark_sent"].call_args_list
    quota_types = [c[0][1] for c in sent_calls]
    assert "monthly_token" not in quota_types


def test_reads_thresholds_from_config(mock_all):
    """AC-3: Thresholds read from config."""
    mock_all["users"].return_value = [
        {"user_id": "u1", "username": "u1", "nickname": "User1", "mail": "u1@ex.com", "quota_level": "L1"}
    ]
    mock_all["limits"].return_value = {"monthly_token": 10000000, "daily_chats": 0, "daily_requests": 500}
    mock_all["monthly"].return_value = 10000000  # 100%
    mock_all["daily"].return_value = 0
    mock_all["has_sent"].return_value = False
    mock_all["send_email"].return_value = True

    from app.services.notification_v2 import check_quota_alerts
    check_quota_alerts()

    # Should trigger 50%, 80%, 100% thresholds
    sent_calls = mock_all["mark_sent"].call_args_list
    thresholds = [c[0][2] for c in sent_calls]
    assert 50 in thresholds
    assert 80 in thresholds
    assert 100 in thresholds


def test_threshold_zero_is_skipped(mock_all):
    """AC-3: Threshold value of 0 is skipped."""
    cfg = dict(MOCK_CONFIG)
    cfg["notification"] = {**cfg["notification"], "thresholds": [0, 80, 100]}
    mock_all["config"].return_value = cfg
    mock_all["users"].return_value = [
        {"user_id": "u1", "username": "u1", "nickname": "User1", "mail": "u1@ex.com", "quota_level": "L1"}
    ]
    mock_all["limits"].return_value = {"monthly_token": 10000000, "daily_chats": 0, "daily_requests": 500}
    mock_all["monthly"].return_value = 10000000
    mock_all["daily"].return_value = 0
    mock_all["has_sent"].return_value = False
    mock_all["send_email"].return_value = True

    from app.services.notification_v2 import check_quota_alerts
    check_quota_alerts()

    thresholds = [c[0][2] for c in mock_all["mark_sent"].call_args_list]
    assert 0 not in thresholds


def test_dedup_same_period(mock_all):
    """AC-5: Same (user, quota_type, threshold, period_key) only sent once."""
    mock_all["users"].return_value = [
        {"user_id": "u1", "username": "u1", "nickname": "User1", "mail": "u1@ex.com", "quota_level": "L1"}
    ]
    mock_all["limits"].return_value = {"monthly_token": 10000000, "daily_chats": 0, "daily_requests": 500}
    mock_all["monthly"].return_value = 8500000  # 85%
    mock_all["daily"].return_value = 0
    # Already sent for 50% and 80%
    mock_all["has_sent"].return_value = True
    mock_all["send_email"].return_value = True

    from app.services.notification_v2 import check_quota_alerts
    check_quota_alerts()

    mock_all["send_email"].assert_not_called()


def test_on_over_limit_called_at_100(mock_all, caplog):
    """AC-6: threshold=100 calls on_over_limit hook."""
    mock_all["users"].return_value = [
        {"user_id": "u1", "username": "u1", "nickname": "User1", "mail": "u1@ex.com", "quota_level": "L1"}
    ]
    mock_all["limits"].return_value = {"monthly_token": 10000000, "daily_chats": 0, "daily_requests": 500}
    mock_all["monthly"].return_value = 10000000  # 100%
    mock_all["daily"].return_value = 0
    mock_all["has_sent"].side_effect = lambda *a: a[2] != 100  # only 100 not sent yet
    mock_all["send_email"].return_value = True

    with patch("app.services.notification_v2.on_over_limit") as over_limit:
        from app.services.notification_v2 import check_quota_alerts
        check_quota_alerts()
        over_limit.assert_called_with("u1", "monthly_token")


def test_smtp_retry_3_times(mock_all):
    """AC-7: SMTP failure retries up to 3 times."""
    mock_all["users"].return_value = [
        {"user_id": "u1", "username": "u1", "nickname": "User1", "mail": "u1@ex.com", "quota_level": "L1"}
    ]
    mock_all["limits"].return_value = {"monthly_token": 10000000, "daily_chats": 0, "daily_requests": 500}
    mock_all["monthly"].return_value = 8500000
    mock_all["daily"].return_value = 0
    mock_all["has_sent"].return_value = False
    mock_all["send_email"].return_value = False  # always fails

    from app.services.notification_v2 import check_quota_alerts
    check_quota_alerts()

    # 新逻辑：多阈值同时超标时只发最高阈值（80%），重试 3 次
    # 低阈值（50%）直接 mark_notification_sent 跳过，不发邮件
    assert mock_all["send_email"].call_count == 3  # 最高阈值 80% × 3 retries
    # 50% 阈值被自动标记为已发（不发邮件）
    assert mock_all["mark_sent"].call_count == 1  # lower threshold 50% marked sent


def test_successful_send_marks_notification(mock_all):
    """AC-8: Successful send writes to email_notifications."""
    mock_all["users"].return_value = [
        {"user_id": "u1", "username": "u1", "nickname": "User1", "mail": "u1@ex.com", "quota_level": "L1"}
    ]
    mock_all["limits"].return_value = {"monthly_token": 10000000, "daily_chats": 0, "daily_requests": 500}
    mock_all["monthly"].return_value = 5500000  # 55% > 50%
    mock_all["daily"].return_value = 0
    mock_all["has_sent"].return_value = False
    mock_all["send_email"].return_value = True

    from app.services.notification_v2 import check_quota_alerts
    check_quota_alerts()

    mock_all["mark_sent"].assert_called()
    args = mock_all["mark_sent"].call_args[0]
    assert args[0] == "u1"
    assert args[1] == "monthly_token"
    assert args[2] == 50


def test_disabled_notification_returns_immediately(mock_all):
    """AC-9: notification.enabled=false returns immediately."""
    cfg = dict(MOCK_CONFIG)
    cfg["notification"] = {**cfg["notification"], "enabled": False}
    mock_all["config"].return_value = cfg

    from app.services.notification_v2 import check_quota_alerts
    check_quota_alerts()

    mock_all["users"].assert_not_called()
