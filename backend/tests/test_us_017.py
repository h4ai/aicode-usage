# SPDX-License-Identifier: Apache-2.0
"""
US-017: 邮件通知数据库表迁移（email_notifications + email_templates）
AC 验收标准测试
"""
from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock


# ─── AC-1/2/3: init_db() creates email_notifications + email_templates tables ───

def test_init_db_creates_email_notifications_table():
    """AC-1: init_db() creates email_notifications table with correct schema."""
    from app.services.database import _INIT_SQL
    assert "CREATE TABLE IF NOT EXISTS email_notifications" in _INIT_SQL
    assert "user_id" in _INIT_SQL
    assert "quota_type" in _INIT_SQL
    assert "threshold" in _INIT_SQL
    assert "period_key" in _INIT_SQL
    assert "sent_at" in _INIT_SQL
    assert "over_limit" in _INIT_SQL
    assert "UNIQUE" in _INIT_SQL


def test_init_db_creates_email_templates_table():
    """AC-2: init_db() creates email_templates table with name unique."""
    from app.services.database import _INIT_SQL
    assert "CREATE TABLE IF NOT EXISTS email_templates" in _INIT_SQL
    assert "name" in _INIT_SQL
    assert "subject" in _INIT_SQL
    assert "body_html" in _INIT_SQL
    assert "updated_at" in _INIT_SQL


def test_init_db_seeds_default_template():
    """AC-4: init_db() inserts default email template."""
    from app.services.database import _INIT_SQL
    assert "email_templates" in _INIT_SQL
    assert "default" in _INIT_SQL
    # Check all 9 placeholders in default template
    assert "{{username}}" in _INIT_SQL
    assert "{{quota_type_label}}" in _INIT_SQL
    assert "{{used}}" in _INIT_SQL
    assert "{{limit}}" in _INIT_SQL
    assert "{{percent}}" in _INIT_SQL
    assert "{{threshold}}" in _INIT_SQL
    assert "{{period}}" in _INIT_SQL
    assert "{{reset_time}}" in _INIT_SQL
    assert "{{user_id}}" in _INIT_SQL


# ─── AC-5: has_sent_notification() ───

@patch("app.services.database._get_conn_ctx")
def test_has_sent_notification_returns_true_when_exists(mock_conn):
    """AC-5: has_sent_notification returns True when record exists."""
    conn = MagicMock()
    mock_conn.return_value.__enter__ = MagicMock(return_value=conn)
    mock_conn.return_value.__exit__ = MagicMock(return_value=False)
    cur = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    cur.fetchone.return_value = (1,)

    from app.services.database import has_sent_notification
    result = has_sent_notification("user1", "monthly_token", 80, "2026-04")
    assert result is True


@patch("app.services.database._get_conn_ctx")
def test_has_sent_notification_returns_false_when_not_exists(mock_conn):
    """AC-5: has_sent_notification returns False when no record."""
    conn = MagicMock()
    mock_conn.return_value.__enter__ = MagicMock(return_value=conn)
    mock_conn.return_value.__exit__ = MagicMock(return_value=False)
    cur = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    cur.fetchone.return_value = None

    from app.services.database import has_sent_notification
    result = has_sent_notification("user1", "monthly_token", 80, "2026-04")
    assert result is False


# ─── AC-6: mark_notification_sent() ───

@patch("app.services.database._get_conn_ctx")
def test_mark_notification_sent_inserts_record(mock_conn):
    """AC-6: mark_notification_sent writes record to email_notifications."""
    conn = MagicMock()
    mock_conn.return_value.__enter__ = MagicMock(return_value=conn)
    mock_conn.return_value.__exit__ = MagicMock(return_value=False)
    cur = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    from app.services.database import mark_notification_sent
    mark_notification_sent("user1", "daily_chats", 100, "2026-04-21", over_limit=True)

    cur.execute.assert_called_once()
    sql = cur.execute.call_args[0][0]
    assert "email_notifications" in sql
    assert "INSERT" in sql
    params = cur.execute.call_args[0][1]
    assert "user1" in params
    assert "daily_chats" in params
    assert 100 in params
    assert "2026-04-21" in params
    assert True in params
    conn.commit.assert_called_once()


# ─── AC-7: get_email_template() ───

@patch("app.services.database._get_conn_ctx")
def test_get_email_template_returns_from_db(mock_conn):
    """AC-7: get_email_template returns template from DB when exists."""
    conn = MagicMock()
    mock_conn.return_value.__enter__ = MagicMock(return_value=conn)
    mock_conn.return_value.__exit__ = MagicMock(return_value=False)
    cur = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    cur.fetchone.return_value = {"name": "default", "subject": "Test", "body_html": "<p>hi</p>", "updated_at": None}

    from app.services.database import get_email_template
    result = get_email_template("default")
    assert result["subject"] == "Test"
    assert result["body_html"] == "<p>hi</p>"


@patch("app.services.database._get_conn_ctx")
def test_get_email_template_returns_builtin_default_when_not_found(mock_conn):
    """AC-7: get_email_template returns built-in default when not in DB."""
    conn = MagicMock()
    mock_conn.return_value.__enter__ = MagicMock(return_value=conn)
    mock_conn.return_value.__exit__ = MagicMock(return_value=False)
    cur = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
    cur.fetchone.return_value = None

    from app.services.database import get_email_template
    result = get_email_template("nonexistent")
    assert "{{username}}" in result["body_html"]
    assert "{{quota_type_label}}" in result["subject"]


# ─── AC-8: save_email_template() ───

@patch("app.services.database._get_conn_ctx")
def test_save_email_template_upserts(mock_conn):
    """AC-8: save_email_template does upsert on name."""
    conn = MagicMock()
    mock_conn.return_value.__enter__ = MagicMock(return_value=conn)
    mock_conn.return_value.__exit__ = MagicMock(return_value=False)
    cur = MagicMock()
    conn.cursor.return_value.__enter__ = MagicMock(return_value=cur)
    conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

    from app.services.database import save_email_template
    save_email_template("default", "New Subject", "<p>new</p>")

    cur.execute.assert_called_once()
    sql = cur.execute.call_args[0][0]
    assert "email_templates" in sql
    assert "ON CONFLICT" in sql
    conn.commit.assert_called_once()


# ─── AC-9: old email_alerts table preserved ───

def test_old_email_alerts_table_preserved():
    """AC-9: email_alerts table still in _INIT_SQL (backward compat)."""
    from app.services.database import _INIT_SQL
    assert "CREATE TABLE IF NOT EXISTS email_alerts" in _INIT_SQL
