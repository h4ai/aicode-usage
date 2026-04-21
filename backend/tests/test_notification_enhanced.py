"""
Tests for notification config API (US-022 extension)
and additional coverage for US-018/019 gaps:
- Retry exponential backoff timing
- send_notification_email normal/error path
- build_context with limit=0
- render_template edge cases
- check_quota_alerts multi-user isolation
- default thresholds when config missing
"""

from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock, call


# ─── US-022 ext: GET/PUT /admin/notification-config ───

def test_get_notification_config_returns_200(client, admin_token, admin_config_patch):
    """GET /admin/notification-config returns current config."""
    with patch("app.config.get_config", return_value={
        "notification": {
            "enabled": True,
            "check_interval_minutes": 60,
            "thresholds": [50, 80, 100],
            "email_domain": "corp.com",
        }
    }):
        resp = client.get(
            "/api/admin/notification-config",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert data["check_interval_minutes"] == 60
    assert data["thresholds"] == [50, 80, 100]
    assert data["email_domain"] == "corp.com"


def test_get_notification_config_requires_admin(client):
    """GET /admin/notification-config without auth returns 401."""
    resp = client.get("/api/admin/notification-config")
    assert resp.status_code == 401


def test_put_notification_config_saves_all_fields(client, admin_token, admin_config_patch):
    """PUT /admin/notification-config persists all 4 fields."""
    with patch("app.routers.admin.update_notification_config") as mock_update:
        mock_update.return_value = {
            "enabled": False,
            "check_interval_minutes": 30,
            "thresholds": [80, 100],
            "email_domain": "example.com",
        }
        resp = client.put(
            "/api/admin/notification-config",
            json={
                "enabled": False,
                "check_interval_minutes": 30,
                "thresholds": [80, 100],
                "email_domain": "example.com",
            },
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    mock_update.assert_called_once_with(
        enabled=False,
        check_interval_minutes=30,
        thresholds=[80, 100],
        email_domain="example.com",
    )


def test_put_notification_config_partial_update(client, admin_token, admin_config_patch):
    """PUT /admin/notification-config with only email_domain updates just that field."""
    with patch("app.routers.admin.update_notification_config") as mock_update:
        mock_update.return_value = {"email_domain": "newdomain.com"}
        resp = client.put(
            "/api/admin/notification-config",
            json={"email_domain": "newdomain.com"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    mock_update.assert_called_once_with(
        enabled=None,
        check_interval_minutes=None,
        thresholds=None,
        email_domain="newdomain.com",
    )


def test_put_notification_config_requires_admin(client):
    """PUT /admin/notification-config without auth returns 401."""
    resp = client.put("/api/admin/notification-config", json={"enabled": False})
    assert resp.status_code == 401


# ─── US-018 ext: retry exponential backoff timing ───

def test_retry_exponential_backoff_sleep_times():
    """send_notification_email retries with 1s, 2s sleep on failure."""
    with patch("app.services.notification_v2.get_config", return_value={
        "notification": {"enabled": True, "thresholds": [80], "email_domain": ""},
        "smtp": {"host": "smtp.test", "port": 25, "username": "", "password": "", "from_email": "x@y.com"},
    }), \
         patch("app.services.notification_v2.get_all_users", return_value=[]), \
         patch("app.services.notification_v2.get_all_users_from_clickhouse", return_value=[
             {"user_id": "u1", "username": "u1", "nickname": "U1", "mail": "u1@x.com", "quota_level": "L1"}
         ]), \
         patch("app.services.notification_v2.get_quota_limits", return_value={"monthly_token": 10000000, "daily_chats": 0}), \
         patch("app.services.notification_v2.get_monthly_token_usage", return_value=9000000), \
         patch("app.services.notification_v2.get_daily_request_count", return_value=0), \
         patch("app.services.notification_v2.has_sent_notification", return_value=False), \
         patch("app.services.notification_v2.mark_notification_sent") as mark, \
         patch("app.services.notification_v2.send_notification_email", return_value=False) as send, \
         patch("app.services.notification_v2.time") as mock_time:

        from app.services.notification_v2 import check_quota_alerts
        check_quota_alerts()

        # 3 attempts: sleep(1) after 1st fail, sleep(2) after 2nd fail, no sleep after 3rd
        sleep_calls = [c.args[0] for c in mock_time.sleep.call_args_list]
        assert sleep_calls == [1, 2], f"Expected [1, 2] but got {sleep_calls}"
        assert send.call_count == 3
        mark.assert_not_called()


def test_retry_succeeds_on_second_attempt():
    """If 2nd attempt succeeds, mark_notification_sent is called once."""
    results = [False, True]
    with patch("app.services.notification_v2.get_config", return_value={
        "notification": {"enabled": True, "thresholds": [80], "email_domain": ""},
    }), \
         patch("app.services.notification_v2.get_all_users", return_value=[]), \
         patch("app.services.notification_v2.get_all_users_from_clickhouse", return_value=[
             {"user_id": "u1", "username": "u1", "nickname": "U1", "mail": "u1@x.com", "quota_level": "L1"}
         ]), \
         patch("app.services.notification_v2.get_quota_limits", return_value={"monthly_token": 10000000, "daily_chats": 0}), \
         patch("app.services.notification_v2.get_monthly_token_usage", return_value=9000000), \
         patch("app.services.notification_v2.get_daily_request_count", return_value=0), \
         patch("app.services.notification_v2.has_sent_notification", return_value=False), \
         patch("app.services.notification_v2.mark_notification_sent") as mark, \
         patch("app.services.notification_v2.send_notification_email", side_effect=results) as send, \
         patch("app.services.notification_v2.time"):

        from app.services.notification_v2 import check_quota_alerts
        check_quota_alerts()
        assert send.call_count == 2
        mark.assert_called_once()


# ─── US-018 ext: multi-user isolation ───

def test_one_user_failure_does_not_skip_next_user():
    """If user A fails all retries, user B is still processed."""
    users = [
        {"user_id": "u1", "username": "u1", "nickname": "U1", "mail": "u1@x.com", "quota_level": "L1"},
        {"user_id": "u2", "username": "u2", "nickname": "U2", "mail": "u2@x.com", "quota_level": "L1"},
    ]
    with patch("app.services.notification_v2.get_config", return_value={
        "notification": {"enabled": True, "thresholds": [80], "email_domain": ""},
    }), \
         patch("app.services.notification_v2.get_all_users_from_clickhouse", return_value=users), \
         patch("app.services.notification_v2.get_all_users", return_value=[]), \
         patch("app.services.notification_v2.get_quota_limits", return_value={"monthly_token": 10000000, "daily_chats": 0}), \
         patch("app.services.notification_v2.get_monthly_token_usage", return_value=9000000), \
         patch("app.services.notification_v2.get_daily_request_count", return_value=0), \
         patch("app.services.notification_v2.has_sent_notification", return_value=False), \
         patch("app.services.notification_v2.mark_notification_sent") as mark, \
         patch("app.services.notification_v2.send_notification_email", side_effect=[False, False, False, True]) as send, \
         patch("app.services.notification_v2.time"):

        from app.services.notification_v2 import check_quota_alerts
        check_quota_alerts()
        # u1: 3 fails; u2: 1 success
        assert send.call_count == 4
        mark.assert_called_once()  # only u2 marked


def test_default_thresholds_when_config_missing():
    """When notification.thresholds is absent, defaults to [50, 80, 100]."""
    with patch("app.services.notification_v2.get_config", return_value={
        "notification": {"enabled": True, "email_domain": ""},  # no thresholds key
    }), \
         patch("app.services.notification_v2.get_all_users", return_value=[]), \
         patch("app.services.notification_v2.get_all_users_from_clickhouse", return_value=[
             {"user_id": "u1", "username": "u1", "nickname": "U1", "mail": "u1@x.com", "quota_level": "L1"}
         ]), \
         patch("app.services.notification_v2.get_quota_limits", return_value={"monthly_token": 10000000, "daily_chats": 0}), \
         patch("app.services.notification_v2.get_monthly_token_usage", return_value=5500000),  \
         patch("app.services.notification_v2.get_daily_request_count", return_value=0), \
         patch("app.services.notification_v2.has_sent_notification", return_value=False), \
         patch("app.services.notification_v2.mark_notification_sent"), \
         patch("app.services.notification_v2.send_notification_email", return_value=True) as send, \
         patch("app.services.notification_v2.time"):

        from app.services.notification_v2 import check_quota_alerts
        check_quota_alerts()
        # 55% → triggers default 50% only
        assert send.call_count == 1


# ─── US-019 ext: build_context edge cases ───

def test_build_context_limit_zero_no_exception():
    """build_context with limit=0 should not raise ZeroDivisionError."""
    from app.services.template_renderer import build_context
    ctx = build_context(
        username="张三",
        user_id="zhangsan",
        quota_type="monthly_token",
        used=0,
        limit=0,
        threshold=80,
        period_key="2026-04",
    )
    assert ctx["percent"] == "0%"


def test_render_template_special_chars_not_replaced():
    """Placeholders with hyphens or spaces are NOT replaced (regex is \\w+)."""
    from app.services.template_renderer import render_template
    tmpl = "Hello {{user-name}} and {{user name}}"
    result = render_template(tmpl, {"user_name": "张三"})
    # Neither match \\w+, so they stay unchanged
    assert "{{user-name}}" in result
    assert "{{user name}}" in result


def test_render_template_missing_key_preserved():
    """Unknown placeholder is preserved verbatim."""
    from app.services.template_renderer import render_template
    result = render_template("Hello {{unknown_var}}", {})
    assert result == "Hello {{unknown_var}}"


def test_build_context_monthly_period_format():
    """Monthly period shows '2026年4月', not '2026年04月'."""
    from app.services.template_renderer import build_context
    ctx = build_context(
        username="x", user_id="x", quota_type="monthly_token",
        used=0, limit=100, threshold=80, period_key="2026-04",
    )
    assert ctx["period"] == "2026年4月"
    assert ctx["reset_time"] == "每月1日重置"


def test_build_context_daily_period_format():
    """Daily period shows '今日（4月21日）', not '今日（04月21日）'."""
    from app.services.template_renderer import build_context
    ctx = build_context(
        username="x", user_id="x", quota_type="daily_chats",
        used=0, limit=100, threshold=80, period_key="2026-04-21",
    )
    assert ctx["period"] == "今日（4月21日）"
    assert ctx["reset_time"] == "次日00:00重置"


# ─── config.py: update_notification_config ───

def test_update_notification_config_persists(tmp_path):
    """update_notification_config writes to config.yaml and reloads in-memory."""
    import yaml
    from app import config as cfg_mod

    # Write a temp config
    cfg_file = tmp_path / "config.yaml"
    cfg_file.write_text(yaml.dump({
        "notification": {"enabled": True, "check_interval_minutes": 60, "thresholds": [50, 80, 100], "email_domain": ""}
    }))

    original_path = cfg_mod._CONFIG_PATH
    try:
        cfg_mod._CONFIG_PATH = cfg_file
        cfg_mod._config.clear()

        result = cfg_mod.update_notification_config(enabled=False, email_domain="corp.com")
        assert result["enabled"] is False
        assert result["email_domain"] == "corp.com"
        assert result["check_interval_minutes"] == 60  # unchanged

        # verify persisted to disk
        saved = yaml.safe_load(cfg_file.read_text())
        assert saved["notification"]["enabled"] is False
        assert saved["notification"]["email_domain"] == "corp.com"
    finally:
        cfg_mod._CONFIG_PATH = original_path
        cfg_mod._config.clear()
