"""Tests for /api/v1/ endpoints — PAT authenticated, read-only."""
from __future__ import annotations

import contextlib
import hashlib
from datetime import datetime, timedelta, timezone
from unittest.mock import patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_NOW = datetime.now(tz=timezone.utc)
_TOKEN = "pat_v1test_abcdefghij1234567"
_HASH = hashlib.sha256(_TOKEN.encode()).hexdigest()

_A = "app.auth_pat"
_V1 = "app.routers.v1"


def _pat(**overrides) -> dict:
    base = {
        "id": 10,
        "user_id": "alice",
        "token_hash": _HASH,
        "token_prefix": _TOKEN[:12],
        "name": "v1test",
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


def _bearer() -> dict[str, str]:
    return {"Authorization": f"Bearer {_TOKEN}"}


def _run(client, method, url, pat_record=None, **mocks):
    """Execute request with PAT auth + extra mocks patched at import locations."""
    pat_record = pat_record or _pat()
    all_patches = {
        f"{_A}.get_pat_by_hash": pat_record,
        f"{_A}.reset_pat_failed": None,
        f"{_A}.update_pat_last_used": None,
        f"{_A}.add_pat_audit_log": None,
    }
    all_patches.update(mocks)

    with contextlib.ExitStack() as stack:
        for k, v in all_patches.items():
            stack.enter_context(patch(k, return_value=v))
        from app.auth_pat import _rate_cache
        _rate_cache.clear()
        resp = getattr(client, method)(url, headers=_bearer())
        _rate_cache.clear()
        return resp


# ---------------------------------------------------------------------------
# GET /api/v1/usage/summary
# ---------------------------------------------------------------------------

def test_usage_summary_month(client):
    resp = _run(client, "get", "/api/v1/usage/summary?scope=month", **{
        f"{_V1}.get_monthly_token_usage": 50000,
        f"{_V1}.get_monthly_request_count": 120,
        f"{_V1}.get_monthly_active_days": 10,
        f"{_V1}.get_chat_session_count": 30,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_token"] == 50000
    assert data["request_count"] == 120
    assert data["active_days"] == 10
    assert "daily_avg_token" in data
    assert "chat_count" in data


# ---------------------------------------------------------------------------
# GET /api/v1/usage/detail
# ---------------------------------------------------------------------------

def test_usage_detail(client):
    mock_rows = [
        {"date": "2026-04-01", "model": "gpt-4", "input_token": 100, "output_token": 200, "total_token": 300, "request_count": 5},
        {"date": "2026-04-02", "model": "gpt-4", "input_token": 50, "output_token": 80, "total_token": 130, "request_count": 2},
    ]
    resp = _run(client, "get", "/api/v1/usage/detail", **{
        f"{_V1}.get_detail_records": mock_rows,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 2
    assert "date" in data[0]
    assert "model" in data[0]
    assert "total_token" in data[0]


# ---------------------------------------------------------------------------
# GET /api/v1/usage/quota
# ---------------------------------------------------------------------------

def test_usage_quota(client):
    resp = _run(client, "get", "/api/v1/usage/quota", **{
        f"{_V1}.get_user": {"user_id": "alice", "quota_level": "L2"},
        f"{_V1}.get_quota_limits": {"monthly_token": 10000000, "daily_requests": 1000},
        f"{_V1}.get_monthly_token_usage": 3000000,
        f"{_V1}.get_daily_request_count": 50,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["quota_level"] == "L2"
    assert "monthly_token_used" in data
    assert "monthly_token_limit" in data


# ---------------------------------------------------------------------------
# GET /api/v1/admin/leaderboard (pagination)
# ---------------------------------------------------------------------------

def test_admin_leaderboard_pagination(client):
    mock_rows = [{"user": f"u{i}", "total_token": 1000 * i} for i in range(5)]
    admin_pat = _pat(role="admin", user_id="admin")
    resp = _run(client, "get", "/api/v1/admin/leaderboard?page=1&page_size=2",
                pat_record=admin_pat, **{
                    "app.routers.admin.get_leaderboard": mock_rows,
                })
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 5
    assert data["page"] == 1
    assert len(data["items"]) == 2
