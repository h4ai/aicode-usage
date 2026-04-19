"""
Tests for GET /health endpoint.
"""
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest


_MOCK_CONFIG = {
    "clickhouse": {"host": "localhost", "port": 9000, "database": "otel"},
    "database": {"url": "postgresql://localhost/test"},
    "ldap": {"server": "ldap://localhost:389"},
}


# ---------------------------------------------------------------------------
# health endpoint structure
# ---------------------------------------------------------------------------

def test_health_endpoint_returns_200(client):
    """GET /health returns 200 regardless of service state."""
    with (
        patch("app.routers.health.get_config", return_value=_MOCK_CONFIG),
        patch("app.routers.health._check_clickhouse", return_value={"status": "ok"}),
        patch("app.routers.health._check_postgres", return_value={"status": "ok"}),
        patch("app.routers.health._check_ldap", return_value={"status": "ok"}),
    ):
        resp = client.get("/health")
    assert resp.status_code == 200


def test_health_endpoint_has_all_keys(client):
    """Response includes clickhouse, postgres, ldap keys."""
    with (
        patch("app.routers.health.get_config", return_value=_MOCK_CONFIG),
        patch("app.routers.health._check_clickhouse", return_value={"status": "ok"}),
        patch("app.routers.health._check_postgres", return_value={"status": "ok"}),
        patch("app.routers.health._check_ldap", return_value={"status": "ok"}),
    ):
        resp = client.get("/health")
    data = resp.json()
    assert "clickhouse" in data
    assert "postgres" in data
    assert "ldap" in data


def test_health_endpoint_returns_error_status_when_service_down(client):
    """Even when services are down, endpoint returns 200 with error details."""
    with (
        patch("app.routers.health.get_config", return_value=_MOCK_CONFIG),
        patch("app.routers.health._check_clickhouse", return_value={"status": "error", "detail": "connection refused"}),
        patch("app.routers.health._check_postgres", return_value={"status": "error", "detail": "timeout"}),
        patch("app.routers.health._check_ldap", return_value={"status": "error", "detail": "unreachable"}),
    ):
        resp = client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["clickhouse"]["status"] == "error"
    assert data["postgres"]["status"] == "error"
    assert data["ldap"]["status"] == "error"


# ---------------------------------------------------------------------------
# _check_postgres helper
# ---------------------------------------------------------------------------

def test_check_postgres_not_configured():
    from app.routers.health import _check_postgres
    result = _check_postgres({"database": {"url": ""}})
    assert result["status"] == "not_configured"


def test_check_postgres_no_database_key():
    from app.routers.health import _check_postgres
    result = _check_postgres({})
    assert result["status"] == "not_configured"


def test_check_postgres_connection_error():
    from app.routers.health import _check_postgres
    with patch("psycopg2.connect", side_effect=Exception("connection failed")):
        result = _check_postgres({"database": {"url": "postgresql://localhost/test"}})
    assert result["status"] == "error"
    assert result["detail"] == "internal_error"


# ---------------------------------------------------------------------------
# _check_clickhouse helper
# ---------------------------------------------------------------------------

def test_check_clickhouse_connection_error():
    from app.routers.health import _check_clickhouse
    with patch("clickhouse_driver.Client", side_effect=Exception("ch error")):
        result = _check_clickhouse({"clickhouse": {"host": "localhost"}})
    assert result["status"] == "error"


# ---------------------------------------------------------------------------
# _check_ldap helper
# ---------------------------------------------------------------------------

def test_check_ldap_not_configured():
    from app.routers.health import _check_ldap
    result = _check_ldap({"ldap": {"server": ""}})
    assert result["status"] == "not_configured"


def test_check_ldap_no_ldap_key():
    from app.routers.health import _check_ldap
    result = _check_ldap({})
    assert result["status"] == "not_configured"
