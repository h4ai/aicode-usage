"""
Tests for GET /api/quota/usage endpoint and quota color helper functions.
"""
from __future__ import annotations

from unittest.mock import patch

import pytest

from app.routers.quota import _monthly_color, _daily_color, _chat_color


# ---------------------------------------------------------------------------
# Color helper unit tests — _monthly_color
# ---------------------------------------------------------------------------

def test_monthly_color_green_below_50():
    color, msg = _monthly_color(30.0)
    assert color == "green"
    assert "正常" in msg


def test_monthly_color_yellow_50_to_79():
    color, msg = _monthly_color(60.0)
    assert color == "yellow"
    assert "60%" in msg


def test_monthly_color_orange_80_to_99():
    color, msg = _monthly_color(85.0)
    assert color == "orange"
    assert "85%" in msg


def test_monthly_color_red_at_100():
    color, msg = _monthly_color(100.0)
    assert color == "red"
    assert "超出" in msg


def test_monthly_color_red_above_100():
    color, msg = _monthly_color(120.0)
    assert color == "red"


def test_monthly_color_boundary_50():
    color, _ = _monthly_color(50.0)
    assert color == "yellow"


def test_monthly_color_boundary_80():
    color, _ = _monthly_color(80.0)
    assert color == "orange"


# ---------------------------------------------------------------------------
# Color helper unit tests — _daily_color
# ---------------------------------------------------------------------------

def test_daily_color_green_below_80():
    color, msg = _daily_color(50.0)
    assert color == "green"
    assert "正常" in msg


def test_daily_color_orange_80_to_99():
    color, msg = _daily_color(90.0)
    assert color == "orange"


def test_daily_color_red_at_100():
    color, msg = _daily_color(100.0)
    assert color == "red"
    assert "超出" in msg


def test_daily_color_boundary_80():
    color, _ = _daily_color(80.0)
    assert color == "orange"


# ---------------------------------------------------------------------------
# Color helper unit tests — _chat_color
# ---------------------------------------------------------------------------

def test_chat_color_green_below_80():
    color, msg = _chat_color(40.0)
    assert color == "green"
    assert "正常" in msg


def test_chat_color_orange_80_to_99():
    color, msg = _chat_color(85.0)
    assert color == "orange"
    assert "85%" in msg


def test_chat_color_red_at_100():
    color, msg = _chat_color(100.0)
    assert color == "red"
    assert "超出" in msg


# ---------------------------------------------------------------------------
# /api/quota/usage endpoint
# ---------------------------------------------------------------------------

def _mock_quota_usage(client, token, *, monthly_used=0, chats_used=0, daily_used=0,
                      monthly_limit=10000, chats_limit=50, daily_limit=500,
                      quota_level="L1"):
    with (
        patch("app.routers.quota.get_user", return_value={"quota_level": quota_level}),
        patch("app.routers.quota.get_quota_limits", return_value={
            "monthly_token": monthly_limit,
            "daily_chats": chats_limit,
            "daily_requests": daily_limit,
        }),
        patch("app.routers.quota.get_monthly_token_usage", return_value=monthly_used),
        patch("app.routers.quota.get_daily_request_count", return_value=daily_used),
        patch("app.routers.quota.get_chat_session_count", return_value=chats_used),
    ):
        return client.get(
            "/api/quota/usage",
            headers={"Authorization": f"Bearer {token}"},
        )


def test_quota_usage_requires_auth(client):
    """No token → 401."""
    resp = client.get("/api/quota/usage")
    assert resp.status_code == 401


def test_quota_usage_returns_200(client, admin_token, admin_config_patch):
    resp = _mock_quota_usage(client, admin_token)
    assert resp.status_code == 200


def test_quota_usage_has_required_fields(client, admin_token, admin_config_patch):
    resp = _mock_quota_usage(client, admin_token)
    data = resp.json()
    assert "monthly_token" in data
    assert "daily_chats" in data
    assert "daily_requests" in data


def test_quota_usage_bar_fields(client, admin_token, admin_config_patch):
    resp = _mock_quota_usage(client, admin_token, monthly_used=5000, monthly_limit=10000)
    bar = resp.json()["monthly_token"]
    assert "used" in bar
    assert "limit" in bar
    assert "percent" in bar
    assert "color" in bar
    assert "message" in bar


def test_quota_usage_percent_calculation(client, admin_token, admin_config_patch):
    resp = _mock_quota_usage(client, admin_token, monthly_used=5000, monthly_limit=10000)
    bar = resp.json()["monthly_token"]
    assert bar["percent"] == 50.0
    assert bar["used"] == 5000
    assert bar["limit"] == 10000


def test_quota_usage_zero_limit_gives_zero_percent(client, admin_token, admin_config_patch):
    resp = _mock_quota_usage(client, admin_token, monthly_used=1000, monthly_limit=0)
    bar = resp.json()["monthly_token"]
    assert bar["percent"] == 0.0


def test_quota_usage_red_color_at_100pct(client, admin_token, admin_config_patch):
    resp = _mock_quota_usage(client, admin_token, monthly_used=10000, monthly_limit=10000)
    bar = resp.json()["monthly_token"]
    assert bar["color"] == "red"


def test_quota_usage_green_color_below_50pct(client, admin_token, admin_config_patch):
    resp = _mock_quota_usage(client, admin_token, monthly_used=1000, monthly_limit=10000)
    bar = resp.json()["monthly_token"]
    assert bar["color"] == "green"


def test_quota_usage_user_not_in_db_defaults_l1(client, admin_token, admin_config_patch):
    """If user doesn't exist in DB, defaults to L1."""
    with (
        patch("app.routers.quota.get_user", return_value=None),
        patch("app.routers.quota.get_quota_limits", return_value={
            "monthly_token": 5000000, "daily_chats": 50, "daily_requests": 500,
        }) as mock_limits,
        patch("app.routers.quota.get_monthly_token_usage", return_value=0),
        patch("app.routers.quota.get_daily_request_count", return_value=0),
        patch("app.routers.quota.get_chat_session_count", return_value=0),
    ):
        resp = client.get(
            "/api/quota/usage",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    mock_limits.assert_called_once_with("L1")
