"""
US-013: 全局趋势 API + 前端
AC 验收标准测试
"""

from __future__ import annotations
from unittest.mock import patch
import pytest

_MOCK_TREND = [
    {"date": "2026-04-01", "input_token": 1000, "output_token": 2000, "total_token": 3000},
    {"date": "2026-04-02", "input_token": 1500, "output_token": 2500, "total_token": 4000},
]
_MOCK_MODEL_TREND = [
    {"date": "2026-04-01", "group": "gpt-4o", "input_token": 800, "output_token": 1600, "total_token": 2400},
]
_MOCK_DEPT_TREND = [
    {"date": "2026-04-01", "group": "Engineering", "input_token": 900, "output_token": 1800, "total_token": 2700},
]


def test_ac1_global_trend_returns_daily_data(client, admin_token, admin_config_patch):
    with patch("app.routers.admin.get_global_trend", return_value=_MOCK_TREND):
        resp = client.get(
            "/api/admin/trend",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"start": "2026-04-01", "end": "2026-04-30"},
        )
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_ac1_global_trend_has_required_fields(client, admin_token, admin_config_patch):
    with patch("app.routers.admin.get_global_trend", return_value=_MOCK_TREND):
        resp = client.get(
            "/api/admin/trend",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"start": "2026-04-01", "end": "2026-04-30"},
        )
    item = resp.json()[0]
    for field in ("date", "input_token", "output_token", "total_token"):
        assert field in item


def test_ac1_global_trend_default_date_range(client, admin_token, admin_config_patch):
    with patch("app.routers.admin.get_global_trend", return_value=_MOCK_TREND):
        resp = client.get("/api/admin/trend", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200


def test_ac2_group_by_model(client, admin_token, admin_config_patch):
    with patch("app.routers.admin.get_global_trend_by_model", return_value=_MOCK_MODEL_TREND):
        resp = client.get(
            "/api/admin/trend",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"start": "2026-04-01", "end": "2026-04-30", "group_by": "model"},
        )
    assert resp.status_code == 200
    assert "group" in resp.json()[0]


def test_ac2_group_by_department(client, admin_token, admin_config_patch):
    with patch("app.routers.admin.get_global_trend_by_dept", return_value=_MOCK_DEPT_TREND):
        resp = client.get(
            "/api/admin/trend",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"start": "2026-04-01", "end": "2026-04-30", "group_by": "department"},
        )
    assert resp.status_code == 200
    assert "group" in resp.json()[0]


def test_ac3_no_token_returns_401(client):
    resp = client.get("/api/admin/trend")
    assert resp.status_code in (401, 403)
