# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""JWT utilities for token creation and verification."""

from __future__ import annotations

import hashlib
import time
from typing import Any

import jwt

# Application-level secret; in production this should come from env/config.
_JWT_SECRET = "2e6193c8bb394af2c778f39ae56c9bfafceacefd1bf14fcb808a74603bc747c2"
_JWT_ALGORITHM = "HS256"
_JWT_TTL_SECONDS = 8 * 3600  # 8 hours


def _config_fingerprint(password_hash: str) -> str:
    """Derive a short fingerprint from the stored password_hash.

    When the admin changes their password (i.e. ``password_hash`` changes in
    config.yaml), every JWT that was issued with the *old* fingerprint becomes
    invalid because the fingerprint embedded in the token won't match the
    current config value.
    """
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def create_token(
    *,
    username: str,
    role: str,
    password_hash: str,
    extra: dict[str, Any] | None = None,
) -> str:
    now = int(time.time())
    payload: dict[str, Any] = {
        "sub": username,
        "role": role,
        "cfg": _config_fingerprint(password_hash),
        "iat": now,
        "exp": now + _JWT_TTL_SECONDS,
    }
    if extra:
        payload.update(extra)
    return jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)


def decode_token(token: str) -> dict[str, Any]:
    """Decode and verify a JWT.  Raises ``jwt.PyJWTError`` on failure."""
    return jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
