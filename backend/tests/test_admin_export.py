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
        patch("app.routers.admin.get_all_users_monthly_tokens", return_value={}),
        patch("app.routers.admin.get_all_users_today_tokens", return_value={}),
        patch("app.routers.admin.get_all_users_today_chats", return_value={}),
        patch("app.routers.admin.get_all_users_monthly_chats", return_value={}),
        patch("app.routers.admin.get_all_users_monthly_requests", return_value={}),
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
