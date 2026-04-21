"""
Tests for GET /api/admin/users/export-csv endpoint.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest


_MOCK_USERS = [
    {"user_id": "user1", "username": "Zhang San", "nickname": "张三", "enterprise": "Engineering", "quota_level": "L1"},
]

_MOCK_CH_USERS = [
    {"username": "Zhang San", "nickname": "张三", "enterprise": "Engineering"},
]

_MOCK_QUOTA_LIMITS = {"monthly_token": 5000000, "daily_chats": 50, "daily_requests": 500}


def _patch_users(fn):
    with (
        patch("app.routers.admin.get_all_users_from_clickhouse", return_value=_MOCK_CH_USERS),
        patch("app.routers.admin.get_all_users", return_value=_MOCK_USERS),
        patch("app.routers.admin.get_all_users_tokens_in_month", return_value={}),
        patch("app.routers.admin.get_all_users_today_tokens", return_value={}),
        patch("app.routers.admin.get_all_users_today_chats", return_value={}),
        patch("app.routers.admin.get_all_users_chats_in_month", return_value={}),
        patch("app.routers.admin.get_all_users_requests_in_month", return_value={}),
        patch("app.routers.admin.get_all_users_daily_requests", return_value={}),
        patch("app.routers.admin.get_quota_limits", return_value=_MOCK_QUOTA_LIMITS),
    ):
        return fn()


def test_export_csv_requires_auth(client):
    resp = client.get("/api/admin/users/export-csv")
    assert resp.status_code in (401, 403)


def test_export_csv_returns_csv_content_type(client, admin_token, admin_config_patch):
    resp = _patch_users(lambda: client.get(
        "/api/admin/users/export-csv",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


def test_export_csv_has_content_disposition(client, admin_token, admin_config_patch):
    resp = _patch_users(lambda: client.get(
        "/api/admin/users/export-csv",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    assert "attachment" in resp.headers.get("content-disposition", "")
    assert ".csv" in resp.headers.get("content-disposition", "")


def test_export_csv_contains_header_row(client, admin_token, admin_config_patch):
    resp = _patch_users(lambda: client.get(
        "/api/admin/users/export-csv",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    text = resp.text
    assert "userId" in text
    assert "部门" in text


def test_export_csv_contains_user_data(client, admin_token, admin_config_patch):
    resp = _patch_users(lambda: client.get(
        "/api/admin/users/export-csv",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    text = resp.text
    assert "Zhang San" in text


def test_export_csv_with_time_filter(client, admin_token, admin_config_patch):
    resp = _patch_users(lambda: client.get(
        "/api/admin/users/export-csv",
        headers={"Authorization": f"Bearer {admin_token}"},
        params={"time_filter": "work"},
    ))
    assert resp.status_code == 200


# ---- Leaderboard CSV export -----------------------------------------------

_MOCK_LEADERBOARD_ROWS = [
    {"rank": 1, "user_id": "张三", "display_name": "张三", "enterprise": "Engineering",
     "quota_level": "L1", "monthly_token": 3000000, "monthly_requests": 300,
     "monthly_chats": 50, "quota_usage_pct": 12.0},
]


def _patch_leaderboard(fn):
    with patch("app.routers.admin.get_leaderboard", return_value=_MOCK_LEADERBOARD_ROWS):
        return fn()


def test_leaderboard_export_csv_returns_csv_content_type(client, admin_token, admin_config_patch):
    resp = _patch_leaderboard(lambda: client.get(
        "/api/admin/leaderboard/export-csv",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    assert resp.status_code == 200
    assert "text/csv" in resp.headers.get("content-type", "")


def test_leaderboard_export_csv_has_content_disposition(client, admin_token, admin_config_patch):
    resp = _patch_leaderboard(lambda: client.get(
        "/api/admin/leaderboard/export-csv",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    assert "attachment" in resp.headers.get("content-disposition", "")


def test_leaderboard_export_csv_contains_header_row(client, admin_token, admin_config_patch):
    resp = _patch_leaderboard(lambda: client.get(
        "/api/admin/leaderboard/export-csv",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    assert resp.status_code == 200
    text = resp.text
    assert "排名" in text
    assert "Token" in text
    assert "对话轮次" in text


def test_leaderboard_export_csv_with_date_range_filename(client, admin_token, admin_config_patch):
    resp = _patch_leaderboard(lambda: client.get(
        "/api/admin/leaderboard/export-csv?start=2026-04-01&end=2026-04-20",
        headers={"Authorization": f"Bearer {admin_token}"},
    ))
    assert resp.status_code == 200
    cd = resp.headers.get("content-disposition", "")
    assert "2026-04-01" in cd
    assert "2026-04-20" in cd


def test_leaderboard_export_csv_requires_auth(client):
    resp = client.get("/api/admin/leaderboard/export-csv")
    assert resp.status_code in (401, 403)


def test_users_export_csv_with_year_month_passes_params(client, admin_token, admin_config_patch):
    """export-csv with year+month should pass them to list_users and show in filename."""
    with (
        patch("app.routers.admin.get_all_users_from_clickhouse", return_value=_MOCK_CH_USERS),
        patch("app.routers.admin.get_all_users", return_value=_MOCK_USERS),
        patch("app.routers.admin.get_all_users_tokens_in_month", return_value={}),
        patch("app.routers.admin.get_all_users_requests_in_month", return_value={}),
        patch("app.routers.admin.get_all_users_chats_in_month", return_value={}),
        patch("app.routers.admin.get_quota_limits", return_value=_MOCK_QUOTA_LIMITS),
    ):
        resp = client.get(
            "/api/admin/users/export-csv?year=2026&month=3",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    cd = resp.headers.get("content-disposition", "")
    assert "2026-03" in cd


def test_users_export_csv_historical_month_column_label(client, admin_token, admin_config_patch):
    """For historical month, column label should show the month period."""
    with (
        patch("app.routers.admin.get_all_users_from_clickhouse", return_value=_MOCK_CH_USERS),
        patch("app.routers.admin.get_all_users", return_value=_MOCK_USERS),
        patch("app.routers.admin.get_all_users_tokens_in_month", return_value={}),
        patch("app.routers.admin.get_all_users_requests_in_month", return_value={}),
        patch("app.routers.admin.get_all_users_chats_in_month", return_value={}),
        patch("app.routers.admin.get_quota_limits", return_value=_MOCK_QUOTA_LIMITS),
    ):
        resp = client.get(
            "/api/admin/users/export-csv?year=2025&month=12",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    text = resp.text
    assert "2025-12" in text
