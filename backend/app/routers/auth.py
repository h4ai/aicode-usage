# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Authentication router — POST /api/auth/login.

Supports two authentication flows:
1. Admin login: username/password checked against config.yaml bcrypt hash.
2. AD user login: LDAP bind against enterprise Active Directory.
"""

from __future__ import annotations

import logging
from typing import Any

import bcrypt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import get_config
from app.services.auth import create_token
from app.services.database import upsert_user
from app.services.ldap_service import (
    LdapAuthError,
    LdapUnavailableError,
)
from app.services.ldap_service import (
    authenticate as ldap_authenticate,
)

router = APIRouter(prefix="/api/auth")
logger = logging.getLogger(__name__)


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    role: str


def _find_admin(username: str, cfg: dict[str, Any]) -> dict[str, Any] | None:
    """Return the admin entry from config if *username* matches."""
    for admin in cfg.get("admins", []):
        if admin.get("username") == username:
            return dict(admin)
    return None


@router.post("/login", response_model=LoginResponse)
def login(body: LoginRequest) -> LoginResponse:
    """Unified login: try admin auth first, then fall back to LDAP/AD."""
    cfg = get_config()

    # --- Admin path ---
    admin = _find_admin(body.username, cfg)
    if admin is not None:
        stored_hash: str = admin.get("password_hash", "")
        if not bcrypt.checkpw(body.password.encode(), stored_hash.encode()):
            raise HTTPException(status_code=401, detail="用户名或密码错误")
        token = create_token(
            username=body.username,
            role="admin",
            password_hash=stored_hash,
        )
        return LoginResponse(token=token, role="admin")

    # --- AD user path ---
    try:
        ad_info = ldap_authenticate(body.username, body.password)
    except LdapUnavailableError as exc:
        logger.error("LDAP unavailable: %s", exc)
        raise HTTPException(status_code=503, detail="AD 认证服务暂不可用，请稍后重试") from exc
    except LdapAuthError:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    user_id = ad_info.get("user_id") or body.username
    # Auto-create or update user in PostgreSQL (defaults to L1 level)
    upsert_user(
        user_id=user_id,
        username=ad_info.get("username"),
        nickname=ad_info.get("nickname"),
        enterprise=ad_info.get("enterprise"),
        mail=ad_info.get("mail"),
    )

    token = create_token(
        username=user_id,
        role="user",
        password_hash="",
        extra={"userId": user_id},
    )
    return LoginResponse(token=token, role="user")


@router.post("/test-login", response_model=LoginResponse)
def test_login(body: LoginRequest) -> LoginResponse:
    """临时测试端点：允许 ClickHouse 中存在的用户直接登录（仅测试用，勿在生产使用）。"""
    from app.services.clickhouse import _get_client  # noqa: PLC0415

    # 密码固定为 test123
    if body.password != "test123":
        raise HTTPException(status_code=401, detail="密码错误")
    # 检查用户是否存在于 ClickHouse
    rows = _get_client().execute(
        "SELECT userId, userNickname, username, enterprise FROM otel.events WHERE userId = %(uid)s LIMIT 1",
        {"uid": body.username},
    )
    if not rows:
        raise HTTPException(status_code=401, detail="用户不存在")
    uid, nickname, uname, enterprise = rows[0]
    display = nickname or uname or uid
    upsert_user(user_id=uid, username=uname, nickname=nickname, enterprise=enterprise)
    token = create_token(
        username=uid,
        role="user",
        password_hash="test-user-fixed-hash",
        extra={"display_name": display, "enterprise": enterprise},
    )
    return LoginResponse(token=token, role="user")
