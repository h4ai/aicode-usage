"""
Tests for /api/admin/quota-levels (GET and PUT).
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

_MOCK_QUOTA_LEVELS = [
    {"level": "L1", "monthly_token": 5000000, "daily_chats": 50, "daily_requests": 500, "user_count": 20},
    {"level": "L2", "monthly_token": 10000000, "daily_chats": 100, "daily_requests": 1000, "user_count": 5},
    {"level": "L3", "monthly_token": 20000000, "daily_chats": 200, "daily_requests": 2000, "user_count": 2},
]


# ---------------------------------------------------------------------------
# GET /api/admin/quota-levels
# ---------------------------------------------------------------------------

def test_list_quota_levels_requires_auth(client):
    resp = client.get("/api/admin/quota-levels")
    assert resp.status_code in (401, 403)


def test_list_quota_levels_requires_admin(client):
    from app.services.auth import create_token
    token = create_token(username="alice", role="user", password_hash="")
    resp = client.get("/api/admin/quota-levels", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_list_quota_levels_returns_list(client, admin_token, admin_config_patch):
    with patch("app.routers.admin.get_all_quota_levels", return_value=_MOCK_QUOTA_LEVELS), \
         patch("app.routers.admin.get_all_users_from_clickhouse", return_value=[]), \
         patch("app.routers.admin.get_all_users", return_value=[]):
        resp = client.get(
            "/api/admin/quota-levels",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 3


def test_list_quota_levels_has_required_fields(client, admin_token, admin_config_patch):
    with patch("app.routers.admin.get_all_quota_levels", return_value=_MOCK_QUOTA_LEVELS), \
         patch("app.routers.admin.get_all_users_from_clickhouse", return_value=[]), \
         patch("app.routers.admin.get_all_users", return_value=[]):
        resp = client.get(
            "/api/admin/quota-levels",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    item = resp.json()[0]
    for field in ("level", "monthly_token", "daily_chats", "daily_requests", "user_count"):
        assert field in item


def test_list_quota_levels_empty_list(client, admin_token, admin_config_patch):
    with patch("app.routers.admin.get_all_quota_levels", return_value=[]), \
         patch("app.routers.admin.get_all_users_from_clickhouse", return_value=[]), \
         patch("app.routers.admin.get_all_users", return_value=[]):
        resp = client.get(
            "/api/admin/quota-levels",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# PUT /api/admin/quota-levels/{level}
# ---------------------------------------------------------------------------

def test_edit_quota_level_requires_auth(client):
    resp = client.put("/api/admin/quota-levels/L1",
                      json={"monthly_token": 1000000, "daily_chats": 30, "daily_requests": 300})
    assert resp.status_code in (401, 403)


def test_edit_quota_level_rejects_invalid_level(client, admin_token, admin_config_patch):
    resp = client.put(
        "/api/admin/quota-levels/L99",
        json={"monthly_token": 1000000, "daily_chats": 30, "daily_requests": 300},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400
    assert "L1/L2/L3" in resp.json()["detail"]


def test_edit_quota_level_not_found_in_db(client, admin_token, admin_config_patch):
    with patch("app.routers.admin.update_quota_level", return_value=None):
        resp = client.put(
            "/api/admin/quota-levels/L1",
            json={"monthly_token": 1000000, "daily_chats": 30, "daily_requests": 300},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 404


def test_edit_quota_level_success(client, admin_token, admin_config_patch):
    updated = {"level": "L1", "monthly_token": 6000000, "daily_chats": 60, "daily_requests": 600, "user_count": 20}
    with (
        patch("app.routers.admin.update_quota_level", return_value=updated),
        patch("app.routers.admin.get_all_quota_levels", return_value=[updated]),
    ):
        resp = client.put(
            "/api/admin/quota-levels/L1",
            json={"monthly_token": 6000000, "daily_chats": 60, "daily_requests": 600},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["level"] == "L1"
    assert data["monthly_token"] == 6000000


def test_edit_quota_level_fallback_when_not_in_list(client, admin_token, admin_config_patch):
    """If level not found in all_quota_levels after update, fall back to body values."""
    updated = {"level": "L2", "monthly_token": 9000000, "daily_chats": 90, "daily_requests": 900, "user_count": 5}
    with (
        patch("app.routers.admin.update_quota_level", return_value=updated),
        patch("app.routers.admin.get_all_quota_levels", return_value=[]),  # empty → triggers fallback
    ):
        resp = client.put(
            "/api/admin/quota-levels/L2",
            json={"monthly_token": 9000000, "daily_chats": 90, "daily_requests": 900},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["level"] == "L2"
    assert data["user_count"] == 0
