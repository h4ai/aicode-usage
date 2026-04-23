# SPDX-License-Identifier: Apache-2.0
"""PAT management endpoints — create / list / revoke tokens."""

from __future__ import annotations

import hashlib
import logging
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.auth_pat import _get_client_ip
from app.deps import get_current_user
from app.services.database import (
    add_pat_audit_log,
    create_pat,
    get_pat_count,
    list_pats,
    revoke_pat,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/tokens", tags=["tokens"])


class CreateTokenRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    expires_months: int = Field(..., description="3, 6, or 12")


class TokenResponse(BaseModel):
    id: int
    name: str
    token_prefix: str
    role: str
    expires_at: str
    last_used_at: str | None = None
    created_at: str
    revoked_at: str | None = None


class CreateTokenResponse(TokenResponse):
    token: str  # full token, shown only once


def _to_response(pat: dict[str, Any]) -> TokenResponse:
    def _fmt(v: Any) -> str | None:
        if v is None:
            return None
        if hasattr(v, "isoformat"):
            return v.isoformat()
        return str(v)

    return TokenResponse(
        id=pat["id"],
        name=pat["name"],
        token_prefix=pat["token_prefix"],
        role=pat["role"],
        expires_at=_fmt(pat["expires_at"]) or "",
        last_used_at=_fmt(pat.get("last_used_at")),
        created_at=_fmt(pat["created_at"]) or "",
        revoked_at=_fmt(pat.get("revoked_at")),
    )


@router.post("", response_model=CreateTokenResponse)
def create_token(
    body: CreateTokenRequest,
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
) -> CreateTokenResponse:
    if body.expires_months not in (3, 6, 12):
        raise HTTPException(status_code=400, detail="expires_months must be 3, 6, or 12")

    user_id = user.get("sub", "")
    role = user.get("role", "user")

    # Check limit
    count = get_pat_count(user_id)
    if count >= 5:
        raise HTTPException(status_code=400, detail="Maximum 5 active tokens allowed")

    # Generate token
    raw = "pat_" + "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(40))
    token_hash = hashlib.sha256(raw.encode()).hexdigest()
    token_prefix = raw[:12]
    expires_at = (datetime.now(tz=timezone.utc) + timedelta(days=body.expires_months * 30)).isoformat()

    pat = create_pat(user_id, body.name, token_hash, token_prefix, role, expires_at)

    ip = _get_client_ip(request)
    add_pat_audit_log(pat["id"], user_id, "create", ip, f"name={body.name}")

    resp = _to_response(pat)
    return CreateTokenResponse(**resp.model_dump(), token=raw)


@router.get("", response_model=list[TokenResponse])
def list_tokens(
    user: dict[str, Any] = Depends(get_current_user),
) -> list[TokenResponse]:
    user_id = user.get("sub", "")
    pats = list_pats(user_id)
    return [_to_response(p) for p in pats]


@router.delete("/{pat_id}")
def revoke_token(
    pat_id: int,
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    user_id = user.get("sub", "")
    ok = revoke_pat(pat_id, user_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Token not found or already revoked")

    ip = _get_client_ip(request)
    add_pat_audit_log(pat_id, user_id, "revoke", ip)

    return {"success": True}
