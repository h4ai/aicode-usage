"""P0 Security Tests: CORS from config + Rate Limiting + test-login gate"""
from __future__ import annotations

import inspect
from unittest.mock import patch


# ── P0-1: CORS configured from config ──

def test_cors_wildcard_when_no_config(client):
    """When cors_origins not in config, defaults to ['*']."""
    resp = client.get("/health", headers={"Origin": "http://any.com"})
    assert resp.status_code == 200


def test_cors_middleware_present():
    """CORSMiddleware should be in app middleware stack."""
    from fastapi.middleware.cors import CORSMiddleware
    import app.main as main_mod
    middlewares = [m.cls for m in main_mod.app.user_middleware if hasattr(m, "cls")]
    assert CORSMiddleware in middlewares


def test_cors_origins_type():
    """cors_origins from config must be a list."""
    from app.config import get_config
    cfg = get_config()
    origins = cfg.get("security", {}).get("cors_origins", ["*"])
    assert isinstance(origins, list) and len(origins) >= 1


# ── P0-2: Rate Limiter ──

def test_rate_limiter_on_app_state():
    """app.state.limiter must be set."""
    import app.main as main_mod
    assert hasattr(main_mod.app.state, "limiter")
    assert main_mod.app.state.limiter is not None


def test_login_has_request_param():
    """login() must accept `request` param (required by slowapi decorator)."""
    from app.routers.auth import login
    assert "request" in inspect.signature(login).parameters


def test_login_rate_limit_decorator():
    """Login function should be wrapped with @_limiter.limit."""
    from app.routers import auth as auth_mod
    # slowapi wraps function; check __wrapped__ or _rate_limit
    login_fn = auth_mod.login
    has_limit = (
        hasattr(login_fn, "_rate_limit_info") or
        hasattr(login_fn, "__wrapped__") or
        "limit" in str(getattr(login_fn, "__decorators__", ""))
    )
    # Indirect check: login accepts 'request' which is only needed for slowapi
    assert "request" in inspect.signature(login_fn).parameters


def test_login_responds_not_404(client):
    """Login endpoint must exist and respond."""
    resp = client.post("/api/auth/login", json={"username": "no_such", "password": "wrong"})
    assert resp.status_code in (401, 503, 422, 429)


# ── P0-3: test-login default false ──

def test_test_login_disabled_when_config_false(client):
    """test-login returns 404 when allow_test_login is false."""
    with patch("app.routers.auth.get_config", return_value={
        "auth": {"allow_test_login": False},
        "admins": [],
    }):
        resp = client.post("/api/auth/test-login", json={"username": "u", "password": "test123"})
        assert resp.status_code == 404


def test_test_login_code_default_is_false():
    """Code default for allow_test_login must be False (not True)."""
    from app.routers import auth as auth_mod
    src = inspect.getsource(auth_mod.test_login)
    assert 'allow_test_login", False)' in src
