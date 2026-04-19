"""
共享 fixtures for pytest
"""
from __future__ import annotations

import sys
from unittest.mock import MagicMock, patch

# python-ldap requires native libs not available in CI; stub the module so
# that app.services.ldap_service can be imported in every test environment.
if "ldap" not in sys.modules:
    _ldap_mock = MagicMock()
    _ldap_mock.filter = MagicMock()
    sys.modules["ldap"] = _ldap_mock
    sys.modules["ldap.filter"] = _ldap_mock.filter

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
