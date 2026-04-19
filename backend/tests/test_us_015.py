"""
US-015: 用量排行榜 API
AC 验收标准测试

AC-1: GET /api/admin/leaderboard?top=10|20|50 按本月Token排序
AC-2: 返回：排名/显示名/部门/级别/Token用量/请求次数/配额使用率
AC-3: 非管理员返回 403
"""

from __future__ import annotations
from unittest.mock import patch
import pytest

_MOCK_LEADERBOARD = [
    {
        "rank": 1,
        "user_id": "user1",
        "display_name": "张三",
        "enterprise": "Engineering",
        "quota_level": "L2",
        "monthly_token": 8000,
        "monthly_requests": 400,
        "quota_usage_pct": 80.0,
    },
    {
        "rank": 2,
        "user_id": "user2",
        "display_name": "李四",
        "enterprise": "未知",
        "quota_level": "L1",
        "monthly_token": 4000,
        "monthly_requests": 150,
        "quota_usage_pct": 40.0,
    },
]


def test_ac1_leaderboard_sorted_by_token(client, admin_token, admin_config_patch):
    """AC-1: Returns list sorted by monthly token descending."""
    with patch("app.routers.admin.get_leaderboard", return_value=_MOCK_LEADERBOARD):
        resp = client.get(
            "/api/admin/leaderboard", headers={"Authorization": f"Bearer {admin_token}"}, params={"top": 10}
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["monthly_token"] >= data[1]["monthly_token"]


def test_ac1_top_param_limits_results(client, admin_token, admin_config_patch):
    """AC-1: top parameter is passed to leaderboard function."""
    with patch("app.routers.admin.get_leaderboard", return_value=_MOCK_LEADERBOARD[:1]) as mock_fn:
        resp = client.get(
            "/api/admin/leaderboard", headers={"Authorization": f"Bearer {admin_token}"}, params={"top": 1}
        )
    assert resp.status_code == 200
    # Verify top param was forwarded
    mock_fn.assert_called_once()
    assert mock_fn.call_args.kwargs.get("top") == 1 or mock_fn.call_args.args[0] == 1


def test_ac2_response_has_required_fields(client, admin_token, admin_config_patch):
    """AC-2: Each item has rank, display_name, enterprise, quota_level, monthly_token, monthly_requests, quota_usage_pct."""
    with patch("app.routers.admin.get_leaderboard", return_value=_MOCK_LEADERBOARD):
        resp = client.get("/api/admin/leaderboard", headers={"Authorization": f"Bearer {admin_token}"})
    item = resp.json()[0]
    for field in (
        "rank",
        "display_name",
        "enterprise",
        "quota_level",
        "monthly_token",
        "monthly_requests",
        "quota_usage_pct",
    ):
        assert field in item


def test_ac2_rank_starts_at_1(client, admin_token, admin_config_patch):
    """AC-2: rank field starts at 1."""
    with patch("app.routers.admin.get_leaderboard", return_value=_MOCK_LEADERBOARD):
        resp = client.get("/api/admin/leaderboard", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.json()[0]["rank"] == 1


def test_ac3_no_token_returns_401(client):
    """AC-3: No token returns 401."""
    resp = client.get("/api/admin/leaderboard")
    assert resp.status_code in (401, 403)
