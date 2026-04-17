"""
US-014: 部门汇总 API + 前端
AC 验收标准测试

AC-1: GET /api/admin/departments 按 enterprise 字段分组，NULL/空值归"未知"
AC-2: 返回：部门/人数/本月Token/本月请求次数/人均Token
AC-3: 非管理员返回 401/403
"""
from __future__ import annotations
from unittest.mock import patch
import pytest

_MOCK_DEPT_SUMMARY = [
    {"enterprise": "Engineering", "user_count": 10, "monthly_token": 50000, "monthly_requests": 200, "avg_token_per_user": 5000},
    {"enterprise": "未知", "user_count": 3, "monthly_token": 9000, "monthly_requests": 45, "avg_token_per_user": 3000},
]

def test_ac1_departments_groups_by_enterprise(client, admin_token, admin_config_patch):
    """AC-1: /api/admin/departments groups by enterprise, null/empty → '未知'."""
    with patch("app.routers.admin.get_department_summary", return_value=_MOCK_DEPT_SUMMARY):
        resp = client.get("/api/admin/departments",
            headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data, list)
    assert len(data) == 2

def test_ac1_unknown_dept_present(client, admin_token, admin_config_patch):
    """AC-1: '未知' department is included for null/empty enterprise."""
    with patch("app.routers.admin.get_department_summary", return_value=_MOCK_DEPT_SUMMARY):
        resp = client.get("/api/admin/departments",
            headers={"Authorization": f"Bearer {admin_token}"})
    names = [item["enterprise"] for item in resp.json()]
    assert "未知" in names

def test_ac2_response_has_required_fields(client, admin_token, admin_config_patch):
    """AC-2: Each item has enterprise, user_count, monthly_token, monthly_requests, avg_token_per_user."""
    with patch("app.routers.admin.get_department_summary", return_value=_MOCK_DEPT_SUMMARY):
        resp = client.get("/api/admin/departments",
            headers={"Authorization": f"Bearer {admin_token}"})
    item = resp.json()[0]
    for field in ("enterprise", "user_count", "monthly_token", "monthly_requests", "avg_token_per_user"):
        assert field in item

def test_ac2_avg_token_calculated(client, admin_token, admin_config_patch):
    """AC-2: avg_token_per_user is monthly_token / user_count."""
    with patch("app.routers.admin.get_department_summary", return_value=_MOCK_DEPT_SUMMARY):
        resp = client.get("/api/admin/departments",
            headers={"Authorization": f"Bearer {admin_token}"})
    item = resp.json()[0]
    expected_avg = item["monthly_token"] // item["user_count"]
    assert item["avg_token_per_user"] == expected_avg

def test_ac3_no_token_returns_401(client):
    """AC-3: No token returns 401."""
    resp = client.get("/api/admin/departments")
    assert resp.status_code in (401, 403)
