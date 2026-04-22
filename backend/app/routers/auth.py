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
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from slowapi import Limiter
from slowapi.util import get_remote_address

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

# 登录限速：每IP每分钟最多10次
_limiter = Limiter(key_func=get_remote_address)

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
@_limiter.limit("20/minute")
def login(request: Request, body: LoginRequest) -> LoginResponse:
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
    sam_account = ad_info.get("sam_account") or user_id   # sAMAccountName（如 aaa）
    cn_name = ad_info.get("username") or ""               # AD cn（如 张三）
    nickname = ad_info.get("nickname") or ""              # AD displayName（用于 username 为空时兜底匹配）

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
        extra={
            "userId": user_id,
            "sam": sam_account,    # sAMAccountName，用于 ClickHouse 三条件 OR 匹配
            "cn": cn_name,         # AD cn（中文名），用于 ClickHouse 三条件 OR 匹配
            "nickname": nickname,  # AD displayName，username 为空时 userNickname 兜底匹配
        },
    )
    return LoginResponse(token=token, role="user")


@router.post("/test-login", response_model=LoginResponse)
def test_login(body: LoginRequest) -> LoginResponse:
    """临时测试端点：允许 ClickHouse 中存在的用户直接登录（仅测试用，勿在生产使用）。

    仅当 config.yaml 中 auth.allow_test_login: true 时生效，生产环境应设为 false（默认）。
    """
    cfg = get_config()
    if not cfg.get("auth", {}).get("allow_test_login", False):
        raise HTTPException(status_code=404, detail="Not Found")

    from app.services.clickhouse import _get_client  # noqa: PLC0415

    # 密码固定为 test123
    if body.password != "test123":
        raise HTTPException(status_code=401, detail="密码错误")
    # 检查用户是否存在于 ClickHouse（支持 userId 或 userNickname 登录）
    result = _get_client().query(
        "SELECT userId, userNickname, username, enterprise FROM otel.events"
        " WHERE userId = {q:String} OR userNickname = {q:String} LIMIT 1",
        parameters={"q": body.username},
    )
    rows = result.result_rows
    if not rows:
        raise HTTPException(status_code=401, detail="用户不存在")
    uid, nickname, uname, enterprise = rows[0]
    display = nickname or uname or uid
    upsert_user(user_id=uid, username=uname, nickname=nickname, enterprise=enterprise)
    # sub = userNickname（与 _user_filter 对齐），sam/cn/nickname 辅助 OR 匹配
    token = create_token(
        username=nickname or uid,
        role="user",
        password_hash="test-user-fixed-hash",
        extra={
            "display_name": display,
            "enterprise": enterprise,
            "sam": uid,
            "cn": uname or uid,
            "nickname": nickname or "",
        },
    )
    return LoginResponse(token=token, role="user")
