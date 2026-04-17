# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""LDAP / Active Directory authentication service."""

from __future__ import annotations

import logging
from typing import Any

import ldap as ldap_lib

from app.config import get_config

logger = logging.getLogger(__name__)


class LdapUnavailableError(Exception):
    """Raised when the LDAP server cannot be reached."""


class LdapAuthError(Exception):
    """Raised when LDAP authentication fails."""


def _get_ldap_cfg() -> dict[str, Any]:
    cfg = get_config()
    result: dict[str, Any] = cfg.get("ldap", {})
    return result


def authenticate(username: str, password: str) -> dict[str, str]:
    """Authenticate against AD and return user attributes.

    Returns a dict with keys: user_id, username, nickname, enterprise, mail.
    """
    ldap_cfg = _get_ldap_cfg()
    server = ldap_cfg.get("server", "")
    base_dn = ldap_cfg.get("base_dn", "")
    user_attr = ldap_cfg.get("user_attr", "sAMAccountName")
    mail_attr = ldap_cfg.get("mail_attr", "mail")

    if not server:
        raise LdapUnavailableError("LDAP server not configured")

    try:
        conn = ldap_lib.initialize(server)
        conn.set_option(ldap_lib.OPT_NETWORK_TIMEOUT, 5)
        conn.set_option(ldap_lib.OPT_REFERRALS, 0)
    except ldap_lib.LDAPError as exc:
        raise LdapUnavailableError(f"无法连接 LDAP 服务器: {exc}") from exc

    # Search for the user by sAMAccountName
    search_filter = f"({user_attr}={ldap_lib.filter.escape_filter_chars(username)})"
    try:
        result = conn.search_s(base_dn, ldap_lib.SCOPE_SUBTREE, search_filter)
    except ldap_lib.LDAPError as exc:
        raise LdapUnavailableError(f"LDAP 查询失败: {exc}") from exc

    if not result:
        raise LdapAuthError("用户名或密码错误")

    user_dn, attrs = result[0]
    if not user_dn:
        raise LdapAuthError("用户名或密码错误")

    # Bind with user credentials to verify password
    try:
        conn.simple_bind_s(user_dn, password)
    except ldap_lib.INVALID_CREDENTIALS:
        raise LdapAuthError("用户名或密码错误")
    except ldap_lib.LDAPError as exc:
        raise LdapUnavailableError(f"LDAP 认证失败: {exc}") from exc
    finally:
        try:
            conn.unbind_s()
        except Exception:
            pass

    def _attr(key: str) -> str:
        val = attrs.get(key, [b""])
        if isinstance(val, list) and val:
            item = val[0]
            if isinstance(item, bytes):
                return item.decode("utf-8", errors="replace")
            return str(item)
        return ""

    return {
        "user_id": _attr(user_attr),
        "username": _attr("cn"),
        "nickname": _attr("displayName"),
        "enterprise": _attr("company"),
        "mail": _attr(mail_attr),
    }
