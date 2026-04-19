"""
Tests for /api/metrics/* endpoints and helper functions.
"""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.routers.metrics import _resolve_date_range, _validate_export_range

_MOCK_TREND = [
    {"date": "2026-04-01", "input_token": 100, "output_token": 200, "total_token": 300},
    {"date": "2026-04-02", "input_token": 150, "output_token": 250, "total_token": 400},
]

_MOCK_MODEL_DIST = [
    {"model": "gpt-4o", "total_token": 3000},
    {"model": "gpt-4-turbo", "total_token": 1000},
]

_MOCK_DETAIL = [
    {"date": "2026-04-01", "model": "gpt-4o", "request_count": 5, "input_token": 100, "output_token": 200, "total_token": 300},
]


# ---------------------------------------------------------------------------
# _resolve_date_range
# ---------------------------------------------------------------------------

def test_resolve_date_range_explicit_dates():
    start, end = _resolve_date_range("2026-01-01", "2026-01-31", 30)
    assert start == "2026-01-01"
    assert end == "2026-01-31"


def test_resolve_date_range_uses_days_when_no_dates():
    start, end = _resolve_date_range(None, None, 7)
    today = date.today()
    assert end == today.isoformat()
    assert start == (today - timedelta(days=6)).isoformat()


def test_resolve_date_range_partial_params_use_days():
    # If only start is given (but not end), fall back to days
    start, end = _resolve_date_range("2026-01-01", None, 7)
    today = date.today()
    assert end == today.isoformat()


# ---------------------------------------------------------------------------
# _validate_export_range
# ---------------------------------------------------------------------------

def test_validate_export_range_ok_within_92_days():
    # Should not raise
    _validate_export_range("2026-01-01", "2026-03-31")


def test_validate_export_range_raises_above_92_days():
    with pytest.raises(HTTPException) as exc_info:
        _validate_export_range("2026-01-01", "2026-04-15")  # > 92 days
    assert exc_info.value.status_code == 400
    assert "3个月" in exc_info.value.detail


def test_validate_export_range_boundary_exact_92():
    # Exactly 92 days should be ok (0..92 → 92 days gap)
    start = date(2026, 1, 1)
    end = start + timedelta(days=92)
    _validate_export_range(start.isoformat(), end.isoformat())  # should not raise


# ---------------------------------------------------------------------------
# /api/metrics/summary
# ---------------------------------------------------------------------------

def test_metrics_summary_requires_auth(client):
    resp = client.get("/api/metrics/summary")
    assert resp.status_code == 401


def test_metrics_summary_month_scope(client, admin_token, admin_config_patch):
    with (
        patch("app.routers.metrics.get_monthly_token_usage", return_value=5000),
        patch("app.routers.metrics.get_monthly_active_days", return_value=10),
        patch("app.routers.metrics.get_monthly_request_count", return_value=100),
        patch("app.routers.metrics.get_chat_session_count", return_value=20),
    ):
        resp = client.get(
            "/api/metrics/summary",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"scope": "month"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_token"] == 5000
    assert data["request_count"] == 100
    assert data["active_days"] == 10
    assert data["daily_avg_token"] == 500


def test_metrics_summary_today_scope(client, admin_token, admin_config_patch):
    with (
        patch("app.routers.metrics.get_today_token_usage", return_value=200),
        patch("app.routers.metrics.get_daily_request_count", return_value=10),
        patch("app.routers.metrics.get_chat_session_count", return_value=3),
    ):
        resp = client.get(
            "/api/metrics/summary",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"scope": "today"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_token"] == 200
    assert data["request_count"] == 10
    assert data["chat_count"] == 3


def test_metrics_summary_week_scope(client, admin_token, admin_config_patch):
    with (
        patch("app.routers.metrics.get_weekly_token_usage", return_value=3500),
        patch("app.routers.metrics.get_weekly_request_count", return_value=70),
        patch("app.routers.metrics.get_chat_session_count", return_value=14),
    ):
        resp = client.get(
            "/api/metrics/summary",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"scope": "week"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_token"] == 3500
    assert data["daily_avg_token"] == 700  # 3500 // 5


def test_metrics_summary_zero_active_days_gives_zero_avg(client, admin_token, admin_config_patch):
    with (
        patch("app.routers.metrics.get_monthly_token_usage", return_value=5000),
        patch("app.routers.metrics.get_monthly_active_days", return_value=0),
        patch("app.routers.metrics.get_monthly_request_count", return_value=0),
        patch("app.routers.metrics.get_chat_session_count", return_value=0),
    ):
        resp = client.get(
            "/api/metrics/summary",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"scope": "month"},
        )
    assert resp.status_code == 200
    assert resp.json()["daily_avg_token"] == 0


# ---------------------------------------------------------------------------
# /api/metrics/trend
# ---------------------------------------------------------------------------

def test_metrics_trend_requires_auth(client):
    resp = client.get("/api/metrics/trend")
    assert resp.status_code == 401


def test_metrics_trend_returns_list(client, admin_token, admin_config_patch):
    with patch("app.routers.metrics.get_daily_trend", return_value=_MOCK_TREND):
        resp = client.get(
            "/api/metrics/trend",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_metrics_trend_has_required_fields(client, admin_token, admin_config_patch):
    with patch("app.routers.metrics.get_daily_trend", return_value=_MOCK_TREND):
        resp = client.get(
            "/api/metrics/trend",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    item = resp.json()[0]
    for field in ("date", "input_token", "output_token", "total_token"):
        assert field in item


def test_metrics_trend_with_explicit_dates(client, admin_token, admin_config_patch):
    with patch("app.routers.metrics.get_daily_trend", return_value=_MOCK_TREND) as mock_fn:
        client.get(
            "/api/metrics/trend",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"start": "2026-04-01", "end": "2026-04-30"},
        )
    mock_fn.assert_called_once()
    call_args = mock_fn.call_args
    assert call_args.args[1] == "2026-04-01"
    assert call_args.args[2] == "2026-04-30"


# ---------------------------------------------------------------------------
# /api/metrics/model-distribution
# ---------------------------------------------------------------------------

def test_metrics_model_distribution_requires_auth(client):
    resp = client.get("/api/metrics/model-distribution")
    assert resp.status_code == 401


def test_metrics_model_distribution_returns_list_with_percent(client, admin_token, admin_config_patch):
    with patch("app.routers.metrics.get_model_distribution", return_value=_MOCK_MODEL_DIST):
        resp = client.get(
            "/api/metrics/model-distribution",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert "percent" in data[0]
    total_pct = sum(item["percent"] for item in data)
    assert abs(total_pct - 100.0) < 0.1


def test_metrics_model_distribution_empty_list(client, admin_token, admin_config_patch):
    with patch("app.routers.metrics.get_model_distribution", return_value=[]):
        resp = client.get(
            "/api/metrics/model-distribution",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    assert resp.json() == []


# ---------------------------------------------------------------------------
# /api/metrics/detail
# ---------------------------------------------------------------------------

def test_metrics_detail_requires_auth(client):
    resp = client.get("/api/metrics/detail")
    assert resp.status_code == 401


def test_metrics_detail_returns_list(client, admin_token, admin_config_patch):
    with patch("app.routers.metrics.get_detail_records", return_value=_MOCK_DETAIL):
        resp = client.get(
            "/api/metrics/detail",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    item = data[0]
    for field in ("date", "model", "request_count", "input_token", "output_token", "total_token"):
        assert field in item


def test_metrics_detail_sort_asc(client, admin_token, admin_config_patch):
    records = [
        {"date": "2026-04-02", "model": "gpt-4o", "request_count": 10, "input_token": 200, "output_token": 400, "total_token": 600},
        {"date": "2026-04-01", "model": "gpt-4o", "request_count": 5, "input_token": 100, "output_token": 200, "total_token": 300},
    ]
    with patch("app.routers.metrics.get_detail_records", return_value=records):
        resp = client.get(
            "/api/metrics/detail",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"sort_by": "total_token", "sort_order": "asc"},
        )
    data = resp.json()
    assert data[0]["total_token"] <= data[1]["total_token"]


def test_metrics_detail_sort_desc(client, admin_token, admin_config_patch):
    records = [
        {"date": "2026-04-01", "model": "gpt-4o", "request_count": 5, "input_token": 100, "output_token": 200, "total_token": 300},
        {"date": "2026-04-02", "model": "gpt-4o", "request_count": 10, "input_token": 200, "output_token": 400, "total_token": 600},
    ]
    with patch("app.routers.metrics.get_detail_records", return_value=records):
        resp = client.get(
            "/api/metrics/detail",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"sort_by": "total_token", "sort_order": "desc"},
        )
    data = resp.json()
    assert data[0]["total_token"] >= data[1]["total_token"]


# ---------------------------------------------------------------------------
# /api/metrics/export.csv
# ---------------------------------------------------------------------------

def test_metrics_export_csv_requires_auth(client):
    resp = client.get("/api/metrics/export.csv")
    assert resp.status_code == 401


def test_metrics_export_csv_returns_csv(client, admin_token, admin_config_patch):
    with patch("app.routers.metrics.get_detail_records", return_value=_MOCK_DETAIL):
        resp = client.get(
            "/api/metrics/export.csv",
            headers={"Authorization": f"Bearer {admin_token}"},
            params={"start": "2026-04-01", "end": "2026-04-30"},
        )
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]


def test_metrics_export_csv_range_too_large(client, admin_token, admin_config_patch):
    """Date range > 3 months → 400."""
    resp = client.get(
        "/api/metrics/export.csv",
        headers={"Authorization": f"Bearer {admin_token}"},
        params={"start": "2026-01-01", "end": "2026-05-01"},
    )
    assert resp.status_code == 400
    assert "3个月" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# /api/metrics/working-hours-config (no auth required)
# ---------------------------------------------------------------------------

def test_working_hours_config_no_auth_required(client):
    with patch("app.config.get_config", return_value={}):
        resp = client.get("/api/metrics/working-hours-config")
    assert resp.status_code == 200


def test_working_hours_config_defaults(client):
    with patch("app.config.get_config", return_value={}):
        resp = client.get("/api/metrics/working-hours-config")
    data = resp.json()
    assert data["enabled"] is False
    assert data["start"] == "08:30"
    assert data["end"] == "18:00"
    assert data["weekday_only"] is True


def test_working_hours_config_returns_configured_values(client):
    cfg = {"working_hours": {"enabled": True, "start": "09:00", "end": "17:00", "weekday_only": False}}
    with patch("app.config.get_config", return_value=cfg):
        resp = client.get("/api/metrics/working-hours-config")
    data = resp.json()
    assert data["enabled"] is True
    assert data["start"] == "09:00"
    assert data["end"] == "17:00"
    assert data["weekday_only"] is False
