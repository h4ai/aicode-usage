# SPDX-License-Identifier: Apache-2.0
"""
US-021: 邮件模板管理 API
AC 验收标准测试
"""
from __future__ import annotations

import pytest
from unittest.mock import patch, MagicMock


def test_get_email_template(client, admin_token, admin_config_patch):
    """AC-1: GET /api/admin/email-template returns template."""
    with patch("app.routers.admin.get_email_template") as mock_get:
        mock_get.return_value = {
            "name": "default",
            "subject": "Test Subject",
            "body_html": "<p>body</p>",
            "updated_at": "2026-04-21T00:00:00Z",
        }
        resp = client.get("/api/admin/email-template", headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "default"
        assert data["subject"] == "Test Subject"


def test_put_email_template(client, admin_token, admin_config_patch):
    """AC-2: PUT /api/admin/email-template updates template (admin only)."""
    with patch("app.routers.admin.save_email_template") as mock_save, \
         patch("app.routers.admin.get_email_template") as mock_get:
        mock_get.return_value = {"name": "default", "subject": "New", "body_html": "<p>new</p>", "updated_at": None}
        resp = client.put("/api/admin/email-template",
                          json={"subject": "New Subject", "body_html": "<p>new body</p>"},
                          headers={"Authorization": f"Bearer {admin_token}"})
        assert resp.status_code == 200
        mock_save.assert_called_once_with("default", "New Subject", "<p>new body</p>")


def test_post_email_template_preview(client, admin_token, admin_config_patch):
    """AC-3: POST /api/admin/email-template/preview renders with sample data."""
    resp = client.post("/api/admin/email-template/preview",
                       json={"subject": "【通知】{{username}}的{{quota_type_label}}", "body_html": "<p>{{used}}/{{limit}}</p>"},
                       headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "{{" not in data["subject"]
    assert "{{" not in data["body_html"]


def test_get_email_template_variables(client, admin_token, admin_config_patch):
    """AC-4: GET /api/admin/email-template/variables returns all 9 placeholders."""
    resp = client.get("/api/admin/email-template/variables", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    names = [v["name"] for v in data]
    assert len(data) == 9
    for n in ["username", "user_id", "quota_type_label", "used", "limit", "percent", "threshold", "period", "reset_time"]:
        assert n in names


def test_unknown_placeholder_preserved_in_preview(client, admin_token, admin_config_patch):
    """AC-5: Unknown placeholders in template remain as-is."""
    resp = client.post("/api/admin/email-template/preview",
                       json={"subject": "{{unknown_var}}", "body_html": "<p>{{foo}}</p>"},
                       headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert "{{unknown_var}}" in data["subject"]
    assert "{{foo}}" in data["body_html"]
