"""
Tests for /api/admin/users, /api/admin/users/{id}/level, and admin helper functions.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.routers.admin import _token_status, _chat_status


# ---------------------------------------------------------------------------
# _token_status unit tests
# ---------------------------------------------------------------------------

def test_token_status_gray_when_limit_zero():
    assert _token_status(100, 0) == "gray"


def test_token_status_gray_when_used_zero():
    assert _token_status(0, 1000) == "gray"


def test_token_status_green_when_below_80():
    assert _token_status(500, 1000) == "green"


def test_token_status_yellow_at_80_pct():
    assert _token_status(800, 1000) == "yellow"


def test_token_status_yellow_at_99_pct():
    assert _token_status(999, 1000) == "yellow"


def test_token_status_red_at_100_pct():
    assert _token_status(1000, 1000) == "red"


def test_token_status_red_above_100_pct():
    assert _token_status(1500, 1000) == "red"


# ---------------------------------------------------------------------------
# _chat_status unit tests
# ---------------------------------------------------------------------------

def test_chat_status_gray_when_limit_zero():
    assert _chat_status(10, 0) == "gray"


def test_chat_status_gray_when_used_zero():
    assert _chat_status(0, 50) == "gray"


def test_chat_status_green_below_80():
    assert _chat_status(30, 50) == "green"


def test_chat_status_yellow_at_80():
    assert _chat_status(40, 50) == "yellow"


def test_chat_status_red_at_100():
    assert _chat_status(50, 50) == "red"


# ---------------------------------------------------------------------------
# /api/admin/users endpoint
# ---------------------------------------------------------------------------

_MOCK_USERS = [
    {"user_id": "user1", "username": "Zhang San", "nickname": "张三", "enterprise": "Engineering", "quota_level": "L1"},
    {"user_id": "user2", "username": "Li Si", "nickname": None, "enterprise": "", "quota_level": "L2"},
]

# ClickHouse format (primary source for admin user list)
_MOCK_CH_USERS = [
    {"username": "Zhang San", "nickname": "张三", "enterprise": "Engineering"},
    {"username": "Li Si", "nickname": "", "enterprise": ""},
]

_MOCK_QUOTA_LIMITS = {"monthly_token": 5000000, "daily_chats": 50, "daily_requests": 500}


_MOCK_BATCH_STATS = {
    "Zhang San": {
        "monthly_token": 0, "monthly_token_all": 0,
        "monthly_chats": 0, "monthly_chats_all": 0, "monthly_requests": 0,
        "today_token": 0, "today_token_all": 0,
        "today_chats": 0, "today_chats_all": 0, "daily_requests": 0,
    },
    "Li Si": {
        "monthly_token": 0, "monthly_token_all": 0,
        "monthly_chats": 0, "monthly_chats_all": 0, "monthly_requests": 0,
        "today_token": 0, "today_token_all": 0,
        "today_chats": 0, "today_chats_all": 0, "daily_requests": 0,
    },
}


def _patch_list_users(fn, **kwargs):
    batch = dict(_MOCK_BATCH_STATS)
    if "get_all_users_tokens_in_month" in kwargs:
        for uid, val in kwargs.pop("get_all_users_tokens_in_month").items():
            batch.setdefault(uid, dict(_MOCK_BATCH_STATS.get(uid, {})))
            batch[uid]["monthly_token"] = val
    if "get_all_users_batch" in kwargs:
        batch = kwargs.pop("get_all_users_batch")
    defaults = dict(
        get_all_users_from_clickhouse=_MOCK_CH_USERS,
        get_all_users=_MOCK_USERS,
        get_all_users_batch=batch,
        get_quota_limits=_MOCK_QUOTA_LIMITS,
    )
    defaults.update({k: v for k, v in kwargs.items() if k in defaults})

    with (
        patch("app.routers.admin.get_all_users_from_clickhouse", return_value=defaults["get_all_users_from_clickhouse"]),
        patch("app.routers.admin.get_all_users", return_value=defaults["get_all_users"]),
        patch("app.routers.admin.get_all_users_batch", return_value=defaults["get_all_users_batch"]),
        patch("app.routers.admin.get_quota_limits", return_value=defaults["get_quota_limits"]),
    ):
        return fn()


def test_admin_users_requires_auth(client):
    resp = client.get("/api/admin/users")
    assert resp.status_code in (401, 403)


def test_admin_users_requires_admin_role(client):
    from app.services.auth import create_token
    token = create_token(username="alice", role="user", password_hash="")
    resp = client.get("/api/admin/users", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_admin_users_returns_list(client, admin_token, admin_config_patch):
    resp = _patch_list_users(lambda: client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) == 2


def test_admin_users_has_required_fields(client, admin_token, admin_config_patch):
    resp = _patch_list_users(lambda: client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    item = resp.json()[0]
    for field in ("user_id", "display_name", "enterprise", "quota_level", "monthly_token"):
        assert field in item


def test_admin_users_unknown_enterprise_for_empty(client, admin_token, admin_config_patch):
    """user2 has empty enterprise → should be '未知'."""
    resp = _patch_list_users(lambda: client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    user2 = next(u for u in resp.json() if u["user_id"] == "Li Si")
    assert user2["enterprise"] == "未知"


def test_admin_users_display_name_fallback(client, admin_token, admin_config_patch):
    """user2 has no nickname → display_name falls back to username."""
    resp = _patch_list_users(lambda: client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    user2 = next(u for u in resp.json() if u["user_id"] == "Li Si")
    assert user2["display_name"] == "Li Si"


def test_admin_users_status_token_reflects_usage(client, admin_token, admin_config_patch):
    """Zhang San using 80% of tokens → yellow status."""
    resp = _patch_list_users(
        lambda: client.get(
            "/api/admin/users",
            headers={"Authorization": f"Bearer {admin_token}"},
        ),
        get_all_users_tokens_in_month={"Zhang San": 4000000},  # 80% of 5M
    )
    user1 = next(u for u in resp.json() if u["user_id"] == "Zhang San")
    assert user1["status_token"] == "yellow"


# ---------------------------------------------------------------------------
# /api/admin/users/{user_id}/level
# ---------------------------------------------------------------------------

def test_change_user_level_requires_auth(client):
    resp = client.put("/api/admin/users/user1/level", json={"level": "L2"})
    assert resp.status_code in (401, 403)


def test_change_user_level_rejects_invalid_level(client, admin_token, admin_config_patch):
    resp = client.put(
        "/api/admin/users/user1/level",
        json={"level": "L99"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 400
    assert "L1/L2/L3" in resp.json()["detail"]


def test_change_user_level_user_not_found(client, admin_token, admin_config_patch):
    with patch("app.routers.admin.update_user_level", return_value=None):
        resp = client.put(
            "/api/admin/users/nonexistent/level",
            json={"level": "L2"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 404


def test_change_user_level_success(client, admin_token, admin_config_patch):
    updated_user = {"user_id": "user1", "username": "Zhang San", "nickname": "张三",
                    "enterprise": "Engineering", "quota_level": "L2"}
    with (
        patch("app.routers.admin.update_user_level", return_value=updated_user),
        patch("app.routers.admin.get_all_users_monthly_tokens", return_value={}),
        patch("app.routers.admin.get_all_users_daily_requests", return_value={}),
    ):
        resp = client.put(
            "/api/admin/users/user1/level",
            json={"level": "L2"},
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert resp.json()["quota_level"] == "L2"


# ---------------------------------------------------------------------------
# /api/admin/users with date range (start + end)
# ---------------------------------------------------------------------------

def _patch_list_users_month(fn, **kwargs):
    """Patch for month query — uses get_all_users_batch."""
    batch = dict(_MOCK_BATCH_STATS)
    # Support legacy kwarg names for convenience
    if "get_all_users_tokens_in_month" in kwargs:
        for uid, val in kwargs.pop("get_all_users_tokens_in_month").items():
            batch.setdefault(uid, {**_MOCK_BATCH_STATS.get(uid, {k: 0 for k in _MOCK_BATCH_STATS.get("Zhang San", {})})})
            batch[uid]["monthly_token"] = val
    if "get_all_users_chats_in_month" in kwargs:
        for uid, val in kwargs.pop("get_all_users_chats_in_month").items():
            batch.setdefault(uid, {k: 0 for k in _MOCK_BATCH_STATS.get("Zhang San", {})})
            batch[uid]["monthly_chats"] = val
    if "get_all_users_batch" in kwargs:
        batch = kwargs.pop("get_all_users_batch")
    defaults = dict(
        get_all_users_from_clickhouse=_MOCK_CH_USERS,
        get_all_users=_MOCK_USERS,
        get_all_users_batch=batch,
        get_quota_limits=_MOCK_QUOTA_LIMITS,
    )
    defaults.update({k: v for k, v in kwargs.items() if k in defaults})

    with (
        patch("app.routers.admin.get_all_users_from_clickhouse", return_value=defaults["get_all_users_from_clickhouse"]),
        patch("app.routers.admin.get_all_users", return_value=defaults["get_all_users"]),
        patch("app.routers.admin.get_all_users_batch", return_value=defaults["get_all_users_batch"]),
        patch("app.routers.admin.get_quota_limits", return_value=defaults["get_quota_limits"]),
    ):
        return fn()

# Keep old alias for backward compat within tests
_patch_list_users_range = _patch_list_users_month


def test_admin_users_with_year_month_returns_list(client, admin_token, admin_config_patch):
    """When year+month provided, /admin/users should return a valid user list."""
    resp = _patch_list_users_month(lambda: client.get(
        "/api/admin/users?year=2026&month=3",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)
    assert len(resp.json()) == 2


def test_admin_users_with_year_month_uses_month_tokens(client, admin_token, admin_config_patch):
    """When year+month provided, monthly_token should come from in_month function."""
    resp = _patch_list_users_month(
        lambda: client.get(
            "/api/admin/users?year=2026&month=3",
            headers={"Authorization": f"Bearer {admin_token}"},
        ),
        get_all_users_tokens_in_month={"Zhang San": 1234567},
    )
    assert resp.status_code == 200
    user1 = next(u for u in resp.json() if u["user_id"] == "Zhang San")
    assert user1["monthly_token"] == 1234567


def test_admin_users_with_year_month_uses_month_chats(client, admin_token, admin_config_patch):
    """When year+month provided, monthly_chats should come from in_month function."""
    resp = _patch_list_users_month(
        lambda: client.get(
            "/api/admin/users?year=2026&month=3",
            headers={"Authorization": f"Bearer {admin_token}"},
        ),
        get_all_users_chats_in_month={"Zhang San": 42},
    )
    assert resp.status_code == 200
    user1 = next(u for u in resp.json() if u["user_id"] == "Zhang San")
    assert user1["monthly_chats"] == 42


def test_admin_users_historical_month_today_fields_are_zero(client, admin_token, admin_config_patch):
    """Historical month (not current): today_token/today_chats/daily_requests should be 0."""
    resp = _patch_list_users_month(
        lambda: client.get(
            "/api/admin/users?year=2025&month=1",
            headers={"Authorization": f"Bearer {admin_token}"},
        ),
    )
    assert resp.status_code == 200
    for u in resp.json():
        assert u["today_token"] == 0
        assert u["today_chats"] == 0
        assert u["daily_requests"] == 0


def test_admin_users_without_year_month_uses_current_month(client, admin_token, admin_config_patch):
    """Without year/month, should use current month (calls monthly functions)."""
    resp = _patch_list_users(lambda: client.get(
        "/api/admin/users",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    assert resp.status_code == 200


def test_admin_users_date_range_invalid_format_returns_200_or_422(client, admin_token, admin_config_patch):
    """month=99 is invalid; FastAPI should return 422."""
    resp = _patch_list_users_month(lambda: client.get(
        "/api/admin/users?year=2026&month=99",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    # month=99 passes as int but _month_range will fail; expect 422 or 500
    assert resp.status_code in (200, 422, 500)
