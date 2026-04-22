"""
Tests for date-range filtering on admin endpoints:
  - GET /api/admin/leaderboard?start=...&end=...
  - GET /api/admin/departments?start=...&end=...
  - GET /api/admin/trend (already supports start/end, regression test)

TDD: these tests are written BEFORE the backend implementation.
They should fail (Red) until start/end params are wired up in admin.py.
"""
from __future__ import annotations

from unittest.mock import patch, MagicMock

import pytest


# ---------------------------------------------------------------------------
# Shared mock data
# ---------------------------------------------------------------------------

_MOCK_USERS = [
    {"user_id": "Zhang San", "username": "Zhang San", "nickname": "张三",
     "enterprise": "Engineering", "quota_level": "L1"},
    {"user_id": "Li Si", "username": "Li Si", "nickname": "李四",
     "enterprise": "Finance", "quota_level": "L2"},
]

_MOCK_CH_USERS = [
    {"username": "Zhang San", "nickname": "张三", "enterprise": "Engineering"},
    {"username": "Li Si", "nickname": "李四", "enterprise": "Finance"},
]

_MOCK_LEADERBOARD_ROWS = [
    {"rank": 1, "user_id": "Zhang San", "display_name": "张三", "enterprise": "Engineering",
     "quota_level": "L1", "monthly_token": 3000000, "monthly_requests": 300,
     "monthly_chats": 50, "quota_usage_pct": 12.0},
    {"rank": 2, "user_id": "Li Si", "display_name": "李四", "enterprise": "Finance",
     "quota_level": "L2", "monthly_token": 1000000, "monthly_requests": 100,
     "monthly_chats": 20, "quota_usage_pct": 2.0},
]

_MOCK_QUOTA_LEVELS = [
    {"level": "L1", "monthly_token": 25000000, "daily_chats": 100, "daily_requests": 1000},
    {"level": "L2", "monthly_token": 50000000, "daily_chats": 200, "daily_requests": 2000},
]


# ---------------------------------------------------------------------------
# /api/admin/leaderboard with date range
# ---------------------------------------------------------------------------

def test_leaderboard_with_date_range_returns_200(client, admin_token, admin_config_patch):
    """GET /admin/leaderboard?start=...&end=... should return 200."""
    with (
        patch("app.routers.admin.get_leaderboard_batch", return_value=[]),
        patch("app.routers.admin.get_all_users", return_value=_MOCK_USERS),
        patch("app.routers.admin.get_all_quota_levels", return_value=_MOCK_QUOTA_LEVELS),
    ):
        resp = client.get(
            "/api/admin/leaderboard?start=2026-04-01&end=2026-04-20",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert isinstance(resp.json(), dict)
    assert "items" in resp.json()


def test_leaderboard_passes_start_end_to_backend(client, admin_token, admin_config_patch):
    """When start+end provided, get_leaderboard_batch should be called with start/end."""
    batch_called = {}

    def fake_batch(time_filter="all", start_date=None, end_date=None):
        batch_called["start"] = start_date
        batch_called["end"] = end_date
        return []

    with (
        patch("app.routers.admin.get_leaderboard_batch", side_effect=fake_batch),
        patch("app.routers.admin.get_all_users", return_value=_MOCK_USERS),
        patch("app.routers.admin.get_all_quota_levels", return_value=_MOCK_QUOTA_LEVELS),
    ):
        resp = client.get(
            "/api/admin/leaderboard?start=2026-04-01&end=2026-04-20",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert batch_called.get("start") == "2026-04-01"
    assert batch_called.get("end") == "2026-04-20"


def test_leaderboard_without_date_range_uses_monthly(client, admin_token, admin_config_patch):
    """Without start/end, get_leaderboard_batch should be called (no start/end args)."""
    batch_called = {}

    def fake_batch(time_filter="all", start_date=None, end_date=None):
        batch_called["called"] = True
        batch_called["start"] = start_date
        return []

    with (
        patch("app.routers.admin.get_leaderboard_batch", side_effect=fake_batch),
        patch("app.routers.admin.get_all_users", return_value=_MOCK_USERS),
        patch("app.routers.admin.get_all_quota_levels", return_value=_MOCK_QUOTA_LEVELS),
    ):
        resp = client.get(
            "/api/admin/leaderboard",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert batch_called.get("called") is True
    assert batch_called.get("start") is None  # no date range passed


def test_leaderboard_requires_auth(client):
    resp = client.get("/api/admin/leaderboard?start=2026-04-01&end=2026-04-20")
    assert resp.status_code in (401, 403)


# ---------------------------------------------------------------------------
# /api/admin/departments with date range
# ---------------------------------------------------------------------------

def _patch_departments(fn, start=None, end=None, time_filter="all"):
    """Helper: patch all deps for list_departments (mocks get_department_summary directly)."""
    with patch("app.routers.admin.get_department_summary", return_value=[]):
        return fn()


def test_departments_with_date_range_returns_200(client, admin_token, admin_config_patch):
    """GET /admin/departments?start=...&end=... should return 200."""
    resp = _patch_departments(lambda: client.get(
        "/api/admin/departments?start=2026-04-01&end=2026-04-20",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    assert resp.status_code == 200


def test_departments_start_end_params_accepted(client, admin_token, admin_config_patch):
    """start+end query params should not cause 422 (param schema is correct)."""
    resp = _patch_departments(lambda: client.get(
        "/api/admin/departments?time_filter=all&start=2026-04-01&end=2026-04-20",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    assert resp.status_code != 422


def test_departments_without_date_range_works(client, admin_token, admin_config_patch):
    """Without start/end, existing behavior unchanged."""
    resp = _patch_departments(lambda: client.get(
        "/api/admin/departments",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    assert resp.status_code == 200


def test_departments_passes_start_end_to_range_fn(client, admin_token, admin_config_patch):
    """When start+end provided, get_department_summary should receive start+end args."""
    captured = {}

    def fake_summary(time_filter="all", start=None, end=None):
        captured["start"] = start
        captured["end"] = end
        return []

    with patch("app.routers.admin.get_department_summary", side_effect=fake_summary):
        resp = client.get(
            "/api/admin/departments?start=2026-04-01&end=2026-04-20",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert captured.get("start") == "2026-04-01"
    assert captured.get("end") == "2026-04-20"


# ---------------------------------------------------------------------------
# /api/admin/trend — regression: start/end already supported
# ---------------------------------------------------------------------------

def test_trend_with_date_range_returns_200(client, admin_token, admin_config_patch):
    """Regression: /admin/trend start+end should still work after refactor."""
    with patch("app.routers.admin.get_global_trend", return_value=[]):
        resp = client.get(
            "/api/admin/trend?start=2026-04-01&end=2026-04-20",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200


def test_trend_with_group_by_dept_and_date_range(client, admin_token, admin_config_patch):
    """Regression: /admin/trend group_by=department + start+end should work."""
    with patch("app.routers.admin.get_global_trend_by_dept", return_value=[]):
        resp = client.get(
            "/api/admin/trend?group_by=department&start=2026-04-01&end=2026-04-20",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200


def test_trend_with_group_by_model_and_date_range(client, admin_token, admin_config_patch):
    """Regression: /admin/trend group_by=model + start+end should work."""
    with patch("app.routers.admin.get_global_trend_by_model", return_value=[]):
        resp = client.get(
            "/api/admin/trend?group_by=model&start=2026-04-01&end=2026-04-20",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# clickhouse in_range functions — unit tests
# ---------------------------------------------------------------------------

def test_get_all_users_tokens_in_range_exists():
    """get_all_users_tokens_in_range should exist in clickhouse module."""
    from app.services import clickhouse as ch
    assert hasattr(ch, "get_all_users_tokens_in_range"), \
        "get_all_users_tokens_in_range not implemented in clickhouse.py"


def test_get_all_users_requests_in_range_exists():
    """get_all_users_requests_in_range should exist in clickhouse module."""
    from app.services import clickhouse as ch
    assert hasattr(ch, "get_all_users_requests_in_range"), \
        "get_all_users_requests_in_range not implemented in clickhouse.py"


def test_get_all_users_chats_in_range_exists():
    """get_all_users_chats_in_range should exist in clickhouse module."""
    from app.services import clickhouse as ch
    assert hasattr(ch, "get_all_users_chats_in_range"), \
        "get_all_users_chats_in_range not implemented in clickhouse.py"
