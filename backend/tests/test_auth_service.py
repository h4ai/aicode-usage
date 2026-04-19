"""
Unit tests for app.services.auth — create_token, decode_token, _config_fingerprint.
"""
from __future__ import annotations

import time

import jwt
import pytest

from app.services.auth import (
    _JWT_SECRET,
    _JWT_ALGORITHM,
    _JWT_TTL_SECONDS,
    _config_fingerprint,
    create_token,
    decode_token,
)


# ---------------------------------------------------------------------------
# _config_fingerprint
# ---------------------------------------------------------------------------

def test_fingerprint_is_16_chars():
    fp = _config_fingerprint("somehash")
    assert len(fp) == 16


def test_fingerprint_same_input_same_output():
    assert _config_fingerprint("abc") == _config_fingerprint("abc")


def test_fingerprint_different_input_different_output():
    assert _config_fingerprint("abc") != _config_fingerprint("xyz")


def test_fingerprint_empty_string():
    fp = _config_fingerprint("")
    assert len(fp) == 16
    assert isinstance(fp, str)


# ---------------------------------------------------------------------------
# create_token
# ---------------------------------------------------------------------------

def test_create_token_returns_string():
    token = create_token(username="alice", role="user", password_hash="hash1")
    assert isinstance(token, str)
    assert len(token) > 10


def test_create_token_payload_has_required_claims():
    before = int(time.time())
    token = create_token(username="alice", role="user", password_hash="hash1")
    payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    assert payload["sub"] == "alice"
    assert payload["role"] == "user"
    assert "exp" in payload
    assert "iat" in payload
    assert "cfg" in payload


def test_create_token_admin_role():
    token = create_token(username="admin", role="admin", password_hash="adminhash")
    payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    assert payload["role"] == "admin"
    assert payload["sub"] == "admin"


def test_create_token_ttl_approx_8_hours():
    before = int(time.time())
    token = create_token(username="user1", role="user", password_hash="h")
    payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    ttl = payload["exp"] - before
    assert 8 * 3600 - 60 <= ttl <= 8 * 3600 + 60


def test_create_token_extra_claims_merged():
    token = create_token(
        username="user1",
        role="user",
        password_hash="h",
        extra={"userId": "user1", "foo": "bar"},
    )
    payload = jwt.decode(token, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    assert payload["userId"] == "user1"
    assert payload["foo"] == "bar"


def test_create_token_fingerprint_changes_with_hash():
    token1 = create_token(username="admin", role="admin", password_hash="hash_a")
    token2 = create_token(username="admin", role="admin", password_hash="hash_b")
    p1 = jwt.decode(token1, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    p2 = jwt.decode(token2, _JWT_SECRET, algorithms=[_JWT_ALGORITHM])
    assert p1["cfg"] != p2["cfg"]


# ---------------------------------------------------------------------------
# decode_token
# ---------------------------------------------------------------------------

def test_decode_token_returns_payload():
    token = create_token(username="alice", role="user", password_hash="h")
    payload = decode_token(token)
    assert payload["sub"] == "alice"
    assert payload["role"] == "user"


def test_decode_token_raises_on_invalid():
    with pytest.raises(jwt.PyJWTError):
        decode_token("not.a.valid.token")


def test_decode_token_raises_on_tampered():
    token = create_token(username="alice", role="user", password_hash="h")
    bad_token = token[:-5] + "XXXXX"
    with pytest.raises(jwt.PyJWTError):
        decode_token(bad_token)


def test_decode_token_raises_on_expired():
    payload = {
        "sub": "alice",
        "role": "user",
        "cfg": "fp",
        "iat": int(time.time()) - 10000,
        "exp": int(time.time()) - 1,  # already expired
    }
    expired_token = jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)
    with pytest.raises(jwt.PyJWTError):
        decode_token(expired_token)
