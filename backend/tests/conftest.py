"""
共享 fixtures for pytest
"""
from __future__ import annotations

import sys
from unittest.mock import MagicMock, patch

# ldap3 is pure Python and requires no native libraries.
# No stub needed — ldap3 installs cleanly in all environments including CI.

import bcrypt
import pytest

# Fast bcrypt hash for test admin password
_TEST_ADMIN_PASSWORD = "admin123"
_TEST_ADMIN_HASH = bcrypt.hashpw(_TEST_ADMIN_PASSWORD.encode(), bcrypt.gensalt(rounds=4)).decode()

MOCK_CONFIG = {
    "admins": [{"username": "admin", "password_hash": _TEST_ADMIN_HASH}],
    "ldap": {"server": "ldap://localhost:389", "base_dn": "dc=company,dc=com"},
    "database": {"url": "postgresql://localhost/test"},
}


@pytest.fixture
def client():
    """TestClient with DB startup patched out."""
    with patch("app.main.init_db"):
        from fastapi.testclient import TestClient
        from app.main import app
        with TestClient(app) as c:
            yield c


@pytest.fixture
def admin_token():
    """Return a pre-built admin JWT signed with the test hash — no HTTP call needed."""
    from app.services.auth import create_token
    return create_token(
        username="admin",
        role="admin",
        password_hash=_TEST_ADMIN_HASH,
    )


@pytest.fixture
def admin_config_patch():
    """Patch app.deps.get_config so admin token fingerprint validation passes."""
    with patch("app.deps.get_config", return_value=MOCK_CONFIG):
        yield


@pytest.fixture(autouse=True)
def reset_rate_limiter():
    """Reset all rate limiter storages before each test to prevent 429 bleeding."""
    def _reset():
        try:
            from app.routers.auth import _limiter as auth_lim
            auth_lim._limiter.storage.reset()
        except Exception:
            pass
        try:
            from app.main import limiter as main_lim
            main_lim._limiter.storage.reset()
        except Exception:
            pass
    _reset()
    yield
    _reset()
