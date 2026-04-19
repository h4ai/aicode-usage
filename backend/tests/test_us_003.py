"""
US-003: AD 用户登录 API
AC 验收标准测试

AC-1: POST /api/auth/login 同时支持 AD 用户（LDAP）和 config.yaml 管理员
AC-2: AD 验证成功返回 JWT（含 role=user, username）
AC-3: LDAP 不可用时仍允许 config.yaml 管理员登录
AC-4: JWT payload 包含 sub, role, exp（8小时）
AC-5: 失败返回 401 + "用户名或密码错误"
"""

from __future__ import annotations

import time
from unittest.mock import patch

import bcrypt
import jwt
import pytest

from app.services.ldap_service import LdapAuthError, LdapUnavailableError

VALID_AD_INFO = {
    "user_id": "zhangsan",
    "username": "Zhang San",
    "nickname": "张三",
    "enterprise": "Engineering",
    "mail": "zhangsan@company.com",
}

# Use a fast bcrypt round count for tests
_TEST_ADMIN_PASSWORD = "admin123"
_TEST_ADMIN_HASH = bcrypt.hashpw(_TEST_ADMIN_PASSWORD.encode(), bcrypt.gensalt(rounds=4)).decode()

_MOCK_CONFIG = {
    "admins": [{"username": "admin", "password_hash": _TEST_ADMIN_HASH}],
    "ldap": {"server": "ldap://localhost:389", "base_dn": "dc=company,dc=com"},
    "database": {"url": "postgresql://localhost/test"},
}


# ---------------------------------------------------------------------------
# AC-1: Endpoint exists and handles both admin and AD user login
# ---------------------------------------------------------------------------


def test_ac1_admin_login_still_works(client):
    """AC-1: POST /api/auth/login still handles config.yaml admin login."""
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        resp = client.post("/api/auth/login", json={"username": "admin", "password": _TEST_ADMIN_PASSWORD})
    assert resp.status_code == 200
    data = resp.json()
    assert data["role"] == "admin"
    assert "token" in data


def test_ac1_ad_user_login_endpoint_exists(client):
    """AC-1: POST /api/auth/login accepts AD user credentials (mock LDAP)."""
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        with patch("app.routers.auth.ldap_authenticate", return_value=VALID_AD_INFO) as mock_ldap:
            with patch("app.routers.auth.upsert_user"):
                resp = client.post("/api/auth/login", json={"username": "zhangsan", "password": "Password1"})
    assert resp.status_code == 200
    mock_ldap.assert_called_once_with("zhangsan", "Password1")


# ---------------------------------------------------------------------------
# AC-2: AD auth success → JWT with role=user and username
# ---------------------------------------------------------------------------


def test_ac2_ad_login_returns_role_user(client):
    """AC-2: AD login returns role=user in response body."""
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        with patch("app.routers.auth.ldap_authenticate", return_value=VALID_AD_INFO):
            with patch("app.routers.auth.upsert_user"):
                resp = client.post("/api/auth/login", json={"username": "zhangsan", "password": "Password1"})
    assert resp.status_code == 200
    assert resp.json()["role"] == "user"


def test_ac2_ad_login_token_contains_user_id(client):
    """AC-2: JWT token from AD login contains userId or sub claim."""
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        with patch("app.routers.auth.ldap_authenticate", return_value=VALID_AD_INFO):
            with patch("app.routers.auth.upsert_user"):
                resp = client.post("/api/auth/login", json={"username": "zhangsan", "password": "Password1"})
    token = resp.json()["token"]
    payload = jwt.decode(token, options={"verify_signature": False})
    assert payload.get("role") == "user"
    assert payload.get("userId") == "zhangsan" or payload.get("sub") == "zhangsan"


def test_ac2_ad_upsert_user_called_on_first_login(client):
    """AC-2: upsert_user is called to auto-create user record in PostgreSQL."""
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        with patch("app.routers.auth.ldap_authenticate", return_value=VALID_AD_INFO):
            with patch("app.routers.auth.upsert_user") as mock_upsert:
                client.post("/api/auth/login", json={"username": "zhangsan", "password": "Password1"})
    mock_upsert.assert_called_once()
    assert mock_upsert.call_args.kwargs.get("user_id") == "zhangsan"


# ---------------------------------------------------------------------------
# AC-3: LDAP unavailable → admin login still works (graceful degradation)
# ---------------------------------------------------------------------------


def test_ac3_ldap_unavailable_admin_still_logs_in(client):
    """AC-3: Admin login does NOT touch LDAP — checks config first."""
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        resp = client.post("/api/auth/login", json={"username": "admin", "password": _TEST_ADMIN_PASSWORD})
    assert resp.status_code == 200
    assert resp.json()["role"] == "admin"


def test_ac3_ldap_unavailable_ad_user_gets_503(client):
    """AC-3: Non-admin user with LDAP down gets 503 (not 401)."""
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        with patch("app.routers.auth.ldap_authenticate", side_effect=LdapUnavailableError("down")):
            resp = client.post("/api/auth/login", json={"username": "zhangsan", "password": "Password1"})
    assert resp.status_code == 503
    assert "暂不可用" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# AC-4: JWT payload contains sub, role, exp (8-hour TTL)
# ---------------------------------------------------------------------------


def test_ac4_admin_jwt_has_required_claims(client):
    """AC-4: Admin JWT contains sub, role, exp."""
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        resp = client.post("/api/auth/login", json={"username": "admin", "password": _TEST_ADMIN_PASSWORD})
    token = resp.json()["token"]
    payload = jwt.decode(token, options={"verify_signature": False})
    assert "sub" in payload
    assert payload["role"] == "admin"
    assert "exp" in payload


def test_ac4_admin_jwt_ttl_is_8_hours(client):
    """AC-4: JWT exp is approximately 8 hours from now."""
    before = int(time.time())
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        resp = client.post("/api/auth/login", json={"username": "admin", "password": _TEST_ADMIN_PASSWORD})
    token = resp.json()["token"]
    payload = jwt.decode(token, options={"verify_signature": False})
    ttl = payload["exp"] - before
    assert 8 * 3600 - 60 <= ttl <= 8 * 3600 + 60


def test_ac4_user_jwt_has_required_claims(client):
    """AC-4: AD user JWT contains sub, role=user, exp."""
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        with patch("app.routers.auth.ldap_authenticate", return_value=VALID_AD_INFO):
            with patch("app.routers.auth.upsert_user"):
                resp = client.post("/api/auth/login", json={"username": "zhangsan", "password": "Password1"})
    token = resp.json()["token"]
    payload = jwt.decode(token, options={"verify_signature": False})
    assert "sub" in payload
    assert payload["role"] == "user"
    assert "exp" in payload


# ---------------------------------------------------------------------------
# AC-5: Failure → 401 + "用户名或密码错误"
# ---------------------------------------------------------------------------


def test_ac5_wrong_admin_password_returns_401(client):
    """AC-5: Wrong admin password → 401 with correct message."""
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        resp = client.post("/api/auth/login", json={"username": "admin", "password": "wrongpass"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "用户名或密码错误"


def test_ac5_ldap_auth_error_returns_401(client):
    """AC-5: LDAP rejects credentials → 401 with correct message."""
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        with patch("app.routers.auth.ldap_authenticate", side_effect=LdapAuthError("bad creds")):
            resp = client.post("/api/auth/login", json={"username": "zhangsan", "password": "WrongPass"})
    assert resp.status_code == 401
    assert resp.json()["detail"] == "用户名或密码错误"


def test_ac5_unknown_user_ldap_unavailable_returns_503(client):
    """AC-5: Unknown username + LDAP unavailable → 503 (not 500)."""
    with patch("app.routers.auth.get_config", return_value=_MOCK_CONFIG):
        with patch("app.routers.auth.ldap_authenticate", side_effect=LdapUnavailableError("no server")):
            resp = client.post("/api/auth/login", json={"username": "nobody", "password": "pass"})
    assert resp.status_code == 503
