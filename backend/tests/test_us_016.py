"""
US-016: 邮件通知服务
AC 验收标准测试

AC-1: APScheduler 每小时轮询用量，首次达到80%发邮件（同月只发一次）
AC-2: 邮件收件人从 AD mail 属性；取不到则跳过记录日志
AC-3: SMTP 失败不标记已发送，下次重试
AC-4: SMTP 配置从 config.yaml 热加载
"""

from __future__ import annotations
from unittest.mock import MagicMock, AsyncMock, patch, call
import pytest


# ---------------------------------------------------------------------------
# AC-1: 80% threshold detection and one-per-month guard
# ---------------------------------------------------------------------------


def test_ac1_check_function_exists():
    """AC-1: check_quota_alerts function exists and is callable."""
    from app.services.notification import check_quota_alerts

    assert callable(check_quota_alerts)


def test_ac1_sends_email_when_above_80_pct(client):
    """AC-1: Email is sent when monthly token usage >= 80% of limit."""
    from app.services.notification import check_quota_alerts

    mock_users = [{"user_id": "user1", "quota_level": "L1", "mail": "user1@co.com"}]
    mock_limits = {"monthly_token": 5000000, "daily_requests": 500}

    with patch("app.services.notification.get_all_users_with_mail", return_value=mock_users):
        with patch("app.services.notification.get_monthly_token_usage", return_value=4100000):  # 82%
            with patch("app.services.notification.get_quota_limits", return_value=mock_limits):
                with patch("app.services.notification.has_sent_alert", return_value=False):
                    with patch("app.services.notification.mark_alert_sent") as mock_mark:
                        with patch("app.services.notification.send_quota_email") as mock_send:
                            check_quota_alerts()

    mock_send.assert_called_once()
    mock_mark.assert_called_once()


def test_ac1_no_email_when_below_80_pct(client):
    """AC-1: No email when usage < 80%."""
    from app.services.notification import check_quota_alerts

    mock_users = [{"user_id": "user1", "quota_level": "L1", "mail": "user1@co.com"}]
    mock_limits = {"monthly_token": 5000000, "daily_requests": 500}

    with patch("app.services.notification.get_all_users_with_mail", return_value=mock_users):
        with patch("app.services.notification.get_monthly_token_usage", return_value=3000000):  # 60%
            with patch("app.services.notification.get_quota_limits", return_value=mock_limits):
                with patch("app.services.notification.has_sent_alert", return_value=False):
                    with patch("app.services.notification.send_quota_email") as mock_send:
                        check_quota_alerts()

    mock_send.assert_not_called()


def test_ac1_no_duplicate_alert_same_month(client):
    """AC-1: If alert already sent this month, skip."""
    from app.services.notification import check_quota_alerts

    mock_users = [{"user_id": "user1", "quota_level": "L1", "mail": "user1@co.com"}]
    mock_limits = {"monthly_token": 5000000, "daily_requests": 500}

    with patch("app.services.notification.get_all_users_with_mail", return_value=mock_users):
        with patch("app.services.notification.get_monthly_token_usage", return_value=4500000):  # 90%
            with patch("app.services.notification.get_quota_limits", return_value=mock_limits):
                with patch("app.services.notification.has_sent_alert", return_value=True):  # already sent
                    with patch("app.services.notification.send_quota_email") as mock_send:
                        check_quota_alerts()

    mock_send.assert_not_called()


# ---------------------------------------------------------------------------
# AC-2: Missing mail → skip with log
# ---------------------------------------------------------------------------


def test_ac2_skip_user_without_mail(client):
    """AC-2: User with no mail address is skipped without error."""
    from app.services.notification import check_quota_alerts

    mock_users = [{"user_id": "user1", "quota_level": "L1", "mail": ""}]  # no mail
    mock_limits = {"monthly_token": 5000000, "daily_requests": 500}

    with patch("app.services.notification.get_all_users_with_mail", return_value=mock_users):
        with patch("app.services.notification.get_monthly_token_usage", return_value=4500000):
            with patch("app.services.notification.get_quota_limits", return_value=mock_limits):
                with patch("app.services.notification.has_sent_alert", return_value=False):
                    with patch("app.services.notification.send_quota_email") as mock_send:
                        check_quota_alerts()  # Must not raise

    mock_send.assert_not_called()


# ---------------------------------------------------------------------------
# AC-3: SMTP failure → do NOT mark as sent
# ---------------------------------------------------------------------------


def test_ac3_smtp_failure_does_not_mark_sent(client):
    """AC-3: If send_quota_email raises, mark_alert_sent is NOT called."""
    from app.services.notification import check_quota_alerts

    mock_users = [{"user_id": "user1", "quota_level": "L1", "mail": "user1@co.com"}]
    mock_limits = {"monthly_token": 5000000, "daily_requests": 500}

    with patch("app.services.notification.get_all_users_with_mail", return_value=mock_users):
        with patch("app.services.notification.get_monthly_token_usage", return_value=4200000):
            with patch("app.services.notification.get_quota_limits", return_value=mock_limits):
                with patch("app.services.notification.has_sent_alert", return_value=False):
                    with patch("app.services.notification.mark_alert_sent") as mock_mark:
                        with patch("app.services.notification.send_quota_email", side_effect=Exception("SMTP error")):
                            check_quota_alerts()  # Must not raise

    mock_mark.assert_not_called()


# ---------------------------------------------------------------------------
# AC-4: send_quota_email reads SMTP config from get_config()
# ---------------------------------------------------------------------------


def test_ac4_smtp_config_read_from_config():
    """AC-4: send_quota_email reads SMTP settings via get_config()."""
    from app.services.notification import send_quota_email

    smtp_cfg = {
        "smtp": {
            "host": "smtp.test.com",
            "port": 587,
            "username": "test",
            "password": "pass",
            "from_name": "AI助手",
            "from_email": "ai@test.com",
        }
    }
    with patch("app.services.notification.get_config", return_value=smtp_cfg) as mock_cfg:
        with patch("aiosmtplib.SMTP") as mock_smtp:
            mock_conn = AsyncMock()
            mock_smtp.return_value = mock_conn
            mock_conn.connect = AsyncMock()
            mock_conn.login = AsyncMock()
            mock_conn.send_message = AsyncMock()
            mock_conn.quit = AsyncMock()
            send_quota_email(to_email="user@test.com", username="testuser", used=4200000, limit=5000000)
    mock_cfg.assert_called()
