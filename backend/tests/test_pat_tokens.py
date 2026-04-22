"""Tests for /api/tokens — PAT CRUD endpoints."""
from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_MOCK_PAT = {
    "id": 1,
    "user_id": "admin",
    "name": "test-token",
    "token_prefix": "pat_abcd1234",
    "token_hash": "abc123hash",
    "role": "admin",
    "expires_at": datetime(2027, 1, 1, tzinfo=timezone.utc),
    "last_used_at": None,
    "created_at": datetime(2026, 4, 1, tzinfo=timezone.utc),
    "revoked_at": None,
}


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# ---------------------------------------------------------------------------
# POST /api/tokens
# ---------------------------------------------------------------------------

def test_create_pat_success(client, admin_token, admin_config_patch):
    with (
        patch("app.routers.tokens.get_pat_count", return_value=0),
        patch("app.routers.tokens.create_pat", return_value=_MOCK_PAT),
        patch("app.routers.tokens.add_pat_audit_log"),
    ):
        resp = client.post(
            "/api/tokens",
            json={"name": "my-token", "expires_months": 6},
            headers=_auth_headers(admin_token),
        )
    assert resp.status_code == 200
    data = resp.json()
    assert "token" in data
    assert data["token"].startswith("pat_")
    assert data["name"] == "test-token"


def test_create_pat_invalid_expires(client, admin_token, admin_config_patch):
    """expires_months=7 should return 400."""
    resp = client.post(
        "/api/tokens",
        json={"name": "bad", "expires_months": 7},
        headers=_auth_headers(admin_token),
    )
    assert resp.status_code == 400
    assert "expires_months" in resp.json()["message"].lower()


def test_create_pat_limit_5(client, admin_token, admin_config_patch):
    """6th PAT should be rejected."""
    with patch("app.routers.tokens.get_pat_count", return_value=5):
        resp = client.post(
            "/api/tokens",
            json={"name": "extra", "expires_months": 3},
            headers=_auth_headers(admin_token),
        )
    assert resp.status_code == 400
    assert "5" in resp.json()["message"]


# ---------------------------------------------------------------------------
# GET /api/tokens
# ---------------------------------------------------------------------------

def test_list_pats(client, admin_token, admin_config_patch):
    with patch("app.routers.tokens.list_pats", return_value=[_MOCK_PAT]):
        resp = client.get("/api/tokens", headers=_auth_headers(admin_token))
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["name"] == "test-token"


# ---------------------------------------------------------------------------
# DELETE /api/tokens/{pat_id}
# ---------------------------------------------------------------------------

def test_revoke_pat_success(client, admin_token, admin_config_patch):
    with (
        patch("app.routers.tokens.revoke_pat", return_value=True),
        patch("app.routers.tokens.add_pat_audit_log"),
    ):
        resp = client.delete("/api/tokens/1", headers=_auth_headers(admin_token))
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_revoke_other_user_pat(client, admin_token, admin_config_patch):
    """revoke_pat returns False → 404."""
    with (
        patch("app.routers.tokens.revoke_pat", return_value=False),
    ):
        resp = client.delete("/api/tokens/999", headers=_auth_headers(admin_token))
    assert resp.status_code == 404
