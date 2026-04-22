# SPDX-License-Identifier: Apache-2.0
"""PAT (Personal Access Token) authentication middleware."""

from __future__ import annotations

import hashlib
import logging
import re
from datetime import datetime, timezone
from typing import Any

from cachetools import TTLCache
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.services.database import (
    add_pat_audit_log,
    get_pat_by_hash,
    increment_pat_failed,
    lock_pat,
    reset_pat_failed,
    update_pat_last_used,
)

logger = logging.getLogger(__name__)

_bearer = HTTPBearer(auto_error=False)

# Rate limit: 100 requests per minute per token_hash
_rate_cache: TTLCache = TTLCache(maxsize=10000, ttl=60)

_PAT_RE = re.compile(r"pat_[A-Za-z0-9_-]")


class PATFilter(logging.Filter):
    """Redact PAT tokens in log messages."""

    _pat_pattern = re.compile(r"pat_[A-Za-z0-9_-]{4,}")

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str) and "pat_" in record.msg:
            record.msg = self._pat_pattern.sub("pat_***", record.msg)
        if record.args:
            new_args = []
            for a in record.args:
                if isinstance(a, str) and "pat_" in a:
                    a = self._pat_pattern.sub("pat_***", a)
                new_args.append(a)
            record.args = tuple(new_args)
        return True


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(token_hash: str) -> bool:
    """Return True if rate limit exceeded."""
    count = _rate_cache.get(token_hash, 0)
    if count >= 100:
        return True
    _rate_cache[token_hash] = count + 1
    return False


def _authenticate_pat(
    token: str, request: Request
) -> dict[str, Any]:
    """Authenticate a PAT token. Returns user info dict or raises HTTPException."""
    ip = _get_client_ip(request)
    token_hash = hashlib.sha256(token.encode()).hexdigest()

    # Rate limit check
    if _check_rate_limit(token_hash):
        raise HTTPException(
            status_code=429,
            detail="Too many requests",
            headers={"Retry-After": "60"},
        )

    pat = get_pat_by_hash(token_hash)
    if not pat:
        add_pat_audit_log(None, "unknown", "auth_fail", ip, f"token_not_found: {token_hash[:8]}")
        raise HTTPException(status_code=401, detail="Invalid token")

    now = datetime.now(tz=timezone.utc)
    pat_id = pat["id"]
    user_id = pat["user_id"]

    # Check locked
    if pat.get("is_locked"):
        locked_until = pat.get("locked_until")
        if locked_until and locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until and now < locked_until:
            _record_fail(pat_id, user_id, ip, "Token is locked")
            raise HTTPException(status_code=401, detail="Invalid token")
        # Lock expired, will be reset on success below

    # Check revoked
    if pat.get("revoked_at") is not None:
        _record_fail(pat_id, user_id, ip, "Token revoked")
        raise HTTPException(status_code=401, detail="Invalid token")

    # Check expired
    expires_at = pat["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if now > expires_at:
        _record_fail(pat_id, user_id, ip, "Token expired")
        raise HTTPException(status_code=401, detail="Invalid token")

    # Success
    reset_pat_failed(pat_id)
    update_pat_last_used(pat_id)
    add_pat_audit_log(pat_id, user_id, "auth_success", ip)

    return {"user_id": user_id, "sub": user_id, "role": pat["role"], "pat_id": pat_id}


def _record_fail(pat_id: int, user_id: str, ip: str, reason: str) -> None:
    """Record a failed auth attempt, lock if threshold reached."""
    add_pat_audit_log(pat_id, user_id, "auth_fail", ip, reason)
    count = increment_pat_failed(pat_id)
    if count >= 5:
        from datetime import timedelta
        locked_until = (datetime.now(tz=timezone.utc) + timedelta(minutes=10)).isoformat()
        lock_pat(pat_id, locked_until)


def require_pat_or_jwt(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    """Authenticate via PAT or fall back to JWT."""
    if creds is None:
        raise HTTPException(status_code=401, detail="未提供认证信息")

    token = creds.credentials
    if token.startswith("pat_"):
        return _authenticate_pat(token, request)

    # Fall back to JWT
    from app.deps import get_current_user
    return get_current_user(creds)


def require_pat_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    """Only allow valid PAT authentication (no JWT fallback)."""
    if creds is None:
        raise HTTPException(status_code=401, detail="未提供认证信息")
    token = creds.credentials
    if not token.startswith("pat_"):
        raise HTTPException(status_code=401, detail="PAT required")
    return _authenticate_pat(token, request)
