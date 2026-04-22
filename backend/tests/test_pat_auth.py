"""Tests for PAT authentication path (app.auth_pat)."""
from __future__ import annotations

import hashlib
from datetime import datetime, timedelta, timezone
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_NOW = datetime.now(tz=timezone.utc)
_VALID_TOKEN = "pat_test_valid_token_1234567890"
_VALID_HASH = hashlib.sha256(_VALID_TOKEN.encode()).hexdigest()

# Patch targets — auth_pat imports these directly
_A = "app.auth_pat"


def _make_pat(**overrides) -> dict:
    base = {
        "id": 1,
        "user_id": "testuser",
        "token_hash": _VALID_HASH,
        "token_prefix": _VALID_TOKEN[:12],
        "name": "test",
        "role": "user",
        "expires_at": _NOW + timedelta(days=90),
        "created_at": _NOW - timedelta(days=1),
        "revoked_at": None,
        "last_used_at": None,
        "is_locked": False,
        "locked_until": None,
        "failed_attempts": 0,
    }
    base.update(overrides)
    return base


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


# v1 router imports from clickhouse directly
_V1 = "app.routers.v1"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_pat_auth_success(client):
    """Valid PAT can access /api/v1/usage/summary."""
    from app.auth_pat import _rate_cache
    _rate_cache.clear()
    pat = _make_pat()
    with (
        patch(f"{_A}.get_pat_by_hash", return_value=pat),
        patch(f"{_A}.reset_pat_failed"),
        patch(f"{_A}.update_pat_last_used"),
        patch(f"{_A}.add_pat_audit_log"),
        patch(f"{_V1}.get_monthly_token_usage", return_value=100),
        patch(f"{_V1}.get_monthly_request_count", return_value=5),
        patch(f"{_V1}.get_monthly_active_days", return_value=3),
        patch(f"{_V1}.get_chat_session_count", return_value=2),
    ):
        resp = client.get("/api/v1/usage/summary?scope=month", headers=_bearer(_VALID_TOKEN))
    assert resp.status_code == 200
    assert "total_token" in resp.json()
    _rate_cache.clear()


def test_pat_expired(client):
    """Expired PAT returns 401."""
    from app.auth_pat import _rate_cache
    _rate_cache.clear()
    pat = _make_pat(expires_at=_NOW - timedelta(days=1))
    with (
        patch(f"{_A}.get_pat_by_hash", return_value=pat),
        patch(f"{_A}.add_pat_audit_log"),
        patch(f"{_A}.increment_pat_failed", return_value=1),
    ):
        resp = client.get("/api/v1/usage/summary", headers=_bearer(_VALID_TOKEN))
    assert resp.status_code == 401
    _rate_cache.clear()


def test_pat_revoked(client):
    """Revoked PAT returns 401."""
    from app.auth_pat import _rate_cache
    _rate_cache.clear()
    pat = _make_pat(revoked_at=_NOW - timedelta(hours=1))
    with (
        patch(f"{_A}.get_pat_by_hash", return_value=pat),
        patch(f"{_A}.add_pat_audit_log"),
        patch(f"{_A}.increment_pat_failed", return_value=1),
    ):
        resp = client.get("/api/v1/usage/summary", headers=_bearer(_VALID_TOKEN))
    assert resp.status_code == 401
    _rate_cache.clear()


def test_pat_invalid(client):
    """Random string PAT returns 401."""
    from app.auth_pat import _rate_cache
    _rate_cache.clear()
    with patch(f"{_A}.get_pat_by_hash", return_value=None), \
         patch(f"{_A}.add_pat_audit_log"):
        resp = client.get("/api/v1/usage/summary", headers=_bearer("pat_random_garbage_string"))
    assert resp.status_code == 401
    _rate_cache.clear()


def test_pat_rate_limit(client):
    """101st request returns 429."""
    from app.auth_pat import _rate_cache
    _rate_cache.clear()

    token_hash = hashlib.sha256(_VALID_TOKEN.encode()).hexdigest()
    _rate_cache[token_hash] = 100

    resp = client.get("/api/v1/usage/summary", headers=_bearer(_VALID_TOKEN))
    assert resp.status_code == 429
    _rate_cache.clear()


def test_pat_lock_after_5_failures(client):
    """After 5 failures, even correct PAT is locked."""
    from app.auth_pat import _rate_cache
    _rate_cache.clear()

    locked_pat = _make_pat(
        is_locked=True,
        locked_until=_NOW + timedelta(minutes=10),
    )
    with (
        patch(f"{_A}.get_pat_by_hash", return_value=locked_pat),
        patch(f"{_A}.add_pat_audit_log"),
        patch(f"{_A}.increment_pat_failed", return_value=6),
        patch(f"{_A}.lock_pat"),
    ):
        resp = client.get("/api/v1/usage/summary", headers=_bearer(_VALID_TOKEN))
    assert resp.status_code == 401
    _rate_cache.clear()


def test_user_pat_cannot_access_admin(client):
    """User-role PAT cannot access /api/v1/admin/* → 403."""
    from app.auth_pat import _rate_cache
    _rate_cache.clear()

    pat = _make_pat(role="user")
    with (
        patch(f"{_A}.get_pat_by_hash", return_value=pat),
        patch(f"{_A}.reset_pat_failed"),
        patch(f"{_A}.update_pat_last_used"),
        patch(f"{_A}.add_pat_audit_log"),
    ):
        resp = client.get("/api/v1/admin/leaderboard", headers=_bearer(_VALID_TOKEN))
    assert resp.status_code == 403
    _rate_cache.clear()


def test_unknown_token_audit_log(client):
    """Unknown token should trigger auth_fail audit log."""
    from app.auth_pat import _rate_cache
    from unittest.mock import MagicMock
    _rate_cache.clear()

    mock_audit = MagicMock()
    with (
        patch(f"{_A}.get_pat_by_hash", return_value=None),
        patch(f"{_A}.add_pat_audit_log", mock_audit),
    ):
        resp = client.get("/api/v1/usage/summary", headers=_bearer("pat_totally_unknown_token_abc"))
    assert resp.status_code == 401
    mock_audit.assert_called_once()
    call_args = mock_audit.call_args
    assert call_args[0][0] is None  # token_id=None
    assert call_args[0][1] == "unknown"  # user_id
    assert call_args[0][2] == "auth_fail"  # action
    assert "token_not_found" in call_args[0][4]  # details
    _rate_cache.clear()


def test_admin_pat_can_access_admin(client):
    """Admin-role PAT can access /api/v1/admin/leaderboard → 200."""
    from app.auth_pat import _rate_cache
    _rate_cache.clear()

    pat = _make_pat(role="admin", user_id="admin")
    with (
        patch(f"{_A}.get_pat_by_hash", return_value=pat),
        patch(f"{_A}.reset_pat_failed"),
        patch(f"{_A}.update_pat_last_used"),
        patch(f"{_A}.add_pat_audit_log"),
        patch("app.routers.admin.get_leaderboard", return_value=[]),
    ):
        resp = client.get("/api/v1/admin/leaderboard", headers=_bearer(_VALID_TOKEN))
    assert resp.status_code == 200
    _rate_cache.clear()
