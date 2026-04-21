"""
Tests for /api/admin/working-hours (GET and PUT) endpoints.
"""
from __future__ import annotations

from unittest.mock import MagicMock, mock_open, patch

import pytest


_DEFAULT_WH_CONFIG = {
    "working_hours": {
        "enabled": True,
        "start": "09:00",
        "end": "18:00",
        "weekday_only": True,
    }
}


# ---------------------------------------------------------------------------
# GET /api/admin/working-hours
# ---------------------------------------------------------------------------

def test_get_working_hours_requires_auth(client):
    resp = client.get("/api/admin/working-hours")
    assert resp.status_code in (401, 403)


def test_get_working_hours_returns_200(client, admin_token, admin_config_patch):
    with patch("app.config.get_config", return_value=_DEFAULT_WH_CONFIG):
        resp = client.get(
            "/api/admin/working-hours",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200


def test_get_working_hours_has_required_fields(client, admin_token, admin_config_patch):
    with patch("app.config.get_config", return_value=_DEFAULT_WH_CONFIG):
        resp = client.get(
            "/api/admin/working-hours",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    data = resp.json()
    assert "enabled" in data
    assert "start" in data
    assert "end" in data
    assert "weekday_only" in data


def test_get_working_hours_returns_configured_values(client, admin_token, admin_config_patch):
    with patch("app.config.get_config", return_value=_DEFAULT_WH_CONFIG):
        resp = client.get(
            "/api/admin/working-hours",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    data = resp.json()
    assert data["enabled"] is True
    assert data["start"] == "09:00"
    assert data["end"] == "18:00"


def test_get_working_hours_defaults_when_not_configured(client, admin_token, admin_config_patch):
    with patch("app.config.get_config", return_value={}):
        resp = client.get(
            "/api/admin/working-hours",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    data = resp.json()
    assert data["enabled"] is False
    assert data["start"] == "08:30"
    assert data["end"] == "18:00"


# ---------------------------------------------------------------------------
# PUT /api/admin/working-hours
# ---------------------------------------------------------------------------

def test_update_working_hours_requires_auth(client):
    resp = client.put(
        "/api/admin/working-hours",
        json={"enabled": True, "start": "09:00", "end": "18:00", "weekday_only": True},
    )
    assert resp.status_code in (401, 403)


def test_update_working_hours_invalid_time_format(client, admin_token, admin_config_patch):
    resp = client.put(
        "/api/admin/working-hours",
        json={"enabled": True, "start": "9:00", "end": "18:00", "weekday_only": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code in (400, 422)


def test_update_working_hours_invalid_end_format(client, admin_token, admin_config_patch):
    resp = client.put(
        "/api/admin/working-hours",
        json={"enabled": True, "start": "09:00", "end": "6pm", "weekday_only": True},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code in (400, 422)


def test_update_working_hours_success(client, admin_token, admin_config_patch):
    yaml_content = "admins: []\n"
    import app.services.clickhouse as _ch_module
    _ch_module._cache = {}
    with (
        patch("builtins.open", mock_open(read_data=yaml_content)),
        patch("yaml.safe_load", return_value={}),
        patch("yaml.dump"),
        patch("app.config.load_config"),
    ):
        resp = client.put(
            "/api/admin/working-hours",
            json={"enabled": True, "start": "09:00", "end": "17:30", "weekday_only": False},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["enabled"] is True
    assert data["start"] == "09:00"
    assert data["end"] == "17:30"
    assert data["weekday_only"] is False
