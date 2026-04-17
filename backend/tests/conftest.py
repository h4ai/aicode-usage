"""
共享 fixtures for pytest
"""
from __future__ import annotations

from unittest.mock import patch

import pytest


@pytest.fixture
def client():
    """TestClient with DB startup patched out."""
    # main.py does `from app.services.database import init_db`,
    # so we must patch the name as imported in app.main, not the source module.
    with patch("app.main.init_db"):
        from fastapi.testclient import TestClient
        from app.main import app
        with TestClient(app) as c:
            yield c


@pytest.fixture
def admin_token(client):
    """获取管理员 JWT token"""
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    if resp.status_code == 200:
        return resp.json().get("token") or resp.json().get("access_token")
    return None
