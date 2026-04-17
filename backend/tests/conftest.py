"""
共享 fixtures for pytest
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture
def client():
    return TestClient(app)


@pytest.fixture
def admin_token(client):
    """获取管理员 JWT token"""
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    if resp.status_code == 200:
        return resp.json()["access_token"]
    return None
