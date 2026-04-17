# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""FastAPI dependencies for authentication."""

from __future__ import annotations

from typing import Any

import jwt as pyjwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import get_config
from app.services.auth import _config_fingerprint, decode_token

_bearer = HTTPBearer(auto_error=False)


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    """Decode the JWT and validate it against the current config.

    Returns the decoded payload dict (contains ``sub``, ``role``, etc.).
    Raises 401 if the token is missing, expired, or the config fingerprint
    no longer matches (i.e. the admin password was changed after issuance).
    """
    if creds is None:
        raise HTTPException(status_code=401, detail="未提供认证信息")
    try:
        payload = decode_token(creds.credentials)
    except pyjwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token 无效或已过期")

    # Validate config fingerprint for admin tokens.
    if payload.get("role") == "admin":
        cfg = get_config()
        for admin in cfg.get("admins", []):
            if admin.get("username") == payload.get("sub"):
                expected = _config_fingerprint(admin.get("password_hash", ""))
                if payload.get("cfg") != expected:
                    raise HTTPException(status_code=401, detail="密码已变更，请重新登录")
                break
        else:
            raise HTTPException(status_code=401, detail="管理员账号已删除")

    return dict(payload)


def require_admin(
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user
