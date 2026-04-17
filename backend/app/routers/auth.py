# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""Authentication router — POST /api/auth/login."""

from __future__ import annotations

import logging
from typing import Any

import bcrypt
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.config import get_config
from app.services.auth import create_token

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
    cfg = get_config()
    admin = _find_admin(body.username, cfg)
    if admin is None:
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    stored_hash: str = admin.get("password_hash", "")
    if not bcrypt.checkpw(body.password.encode(), stored_hash.encode()):
        raise HTTPException(status_code=401, detail="用户名或密码错误")

    token = create_token(
        username=body.username,
        role="admin",
        password_hash=stored_hash,
    )
    return LoginResponse(token=token, role="admin")
