"""
Unit tests for app.deps — get_current_user and require_admin.
"""
from __future__ import annotations

import time
from unittest.mock import patch

import jwt
import pytest

from app.services.auth import _JWT_SECRET, _JWT_ALGORITHM, create_token

_HASH_A = "$2b$04$testtesttest_HASH_A"
_MOCK_CONFIG = {
    "admins": [{"username": "admin", "password_hash": _HASH_A}],
}


def _make_token(username: str, role: str, password_hash: str = "", extra: dict | None = None) -> str:
    return create_token(username=username, role=role, password_hash=password_hash, extra=extra)


# ---------------------------------------------------------------------------
# get_current_user
# ---------------------------------------------------------------------------

def test_get_current_user_no_credentials(client):
    """No Authorization header → 401."""
    resp = client.get("/api/quota/usage")
    assert resp.status_code == 401


def test_get_current_user_invalid_token(client):
    """Garbage token → 401."""
    resp = client.get(
        "/api/quota/usage",
        headers={"Authorization": "Bearer not_a_real_token"},
    )
    assert resp.status_code == 401


def test_get_current_user_expired_token(client):
    """Expired JWT → 401."""
    payload = {
        "sub": "alice",
        "role": "user",
        "cfg": "fp",
        "iat": int(time.time()) - 10000,
        "exp": int(time.time()) - 1,
    }
    expired_token = jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)
    resp = client.get(
        "/api/quota/usage",
        headers={"Authorization": f"Bearer {expired_token}"},
    )
    assert resp.status_code == 401


def test_get_current_user_valid_user_token(client):
    """Valid user token is accepted (endpoint mock returns data)."""
    token = _make_token("alice", "user")
    with (
        patch("app.routers.quota.get_user", return_value={"quota_level": "L1"}),
        patch("app.routers.quota.get_quota_limits", return_value={"monthly_token": 1000, "daily_requests": 100, "daily_chats": 50}),
        patch("app.routers.quota.get_monthly_token_usage", return_value=0),
        patch("app.routers.quota.get_daily_request_count", return_value=0),
        patch("app.routers.quota.get_chat_session_count", return_value=0),
    ):
        resp = client.get(
            "/api/quota/usage",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 200


def test_get_current_user_admin_token_wrong_fingerprint(client):
    """Admin token whose cfg fingerprint doesn't match current config → 401."""
    # Token signed with password_hash="old_hash", but config has a different hash
    token = _make_token("admin", "admin", password_hash="old_hash")
    config_with_new_hash = {
        "admins": [{"username": "admin", "password_hash": "new_hash"}],
    }
    with patch("app.deps.get_config", return_value=config_with_new_hash):
        resp = client.get(
            "/api/quota/usage",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 401


def test_get_current_user_admin_deleted_from_config(client):
    """Admin token for a username not in config anymore → 401."""
    token = _make_token("admin", "admin", password_hash="hash")
    empty_config = {"admins": []}
    with patch("app.deps.get_config", return_value=empty_config):
        resp = client.get(
            "/api/quota/usage",
            headers={"Authorization": f"Bearer {token}"},
        )
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# require_admin
# ---------------------------------------------------------------------------

def test_require_admin_rejects_non_admin(client):
    """User token on admin endpoint → 403."""
    token = _make_token("alice", "user")
    resp = client.get(
        "/api/admin/quota-levels",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


def test_require_admin_allows_admin(client, admin_token, admin_config_patch):
    """Admin token on admin endpoint → allowed."""
    with patch("app.routers.admin.get_all_quota_levels", return_value=[]), \
         patch("app.routers.admin.get_all_users_from_clickhouse", return_value=[]), \
         patch("app.routers.admin.get_all_users", return_value=[]):
        resp = client.get(
            "/api/admin/quota-levels",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
