# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""LDAP / Active Directory authentication service.

Uses ldap3 (pure Python) instead of python-ldap to avoid native library
dependencies (libldap2-dev, libsasl2-dev) — suitable for air-gapped environments.
"""

from __future__ import annotations

import logging
from typing import Any

from ldap3 import Connection, Server, SUBTREE, ALL_ATTRIBUTES, NTLM, SIMPLE
from ldap3.core.exceptions import LDAPException, LDAPBindError, LDAPSocketOpenError

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
    server_url = ldap_cfg.get("server", "")
    base_dn = ldap_cfg.get("base_dn", "")
    user_attr = ldap_cfg.get("user_attr", "sAMAccountName")
    mail_attr = ldap_cfg.get("mail_attr", "mail")

    if not server_url:
        raise LdapUnavailableError("LDAP server not configured")

    # Parse host from url (ldap://host:port or ldaps://host:port)
    host = server_url.replace("ldap://", "").replace("ldaps://", "").split(":")[0]
    port = 636 if server_url.startswith("ldaps://") else 389
    use_ssl = server_url.startswith("ldaps://")

    try:
        server = Server(host, port=port, use_ssl=use_ssl, connect_timeout=5)
    except LDAPException as exc:
        raise LdapUnavailableError(f"无法初始化 LDAP 服务器: {exc}") from exc

    # Step 1: anonymous search to find user DN
    try:
        search_conn = Connection(server, auto_bind=True)
    except (LDAPSocketOpenError, LDAPException) as exc:
        raise LdapUnavailableError(f"无法连接 LDAP 服务器: {exc}") from exc

    search_filter = f"({user_attr}={username})"
    try:
        search_conn.search(
            search_base=base_dn,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=[user_attr, "cn", "displayName", "company", mail_attr],
        )
    except LDAPException as exc:
        raise LdapUnavailableError(f"LDAP 查询失败: {exc}") from exc
    finally:
        try:
            search_conn.unbind()
        except Exception:
            pass

    if not search_conn.entries:
        raise LdapAuthError("用户名或密码错误")

    entry = search_conn.entries[0]
    user_dn = entry.entry_dn

    # Step 2: bind with user credentials to verify password
    try:
        auth_conn = Connection(server, user=user_dn, password=password, auto_bind=True)
        auth_conn.unbind()
    except LDAPBindError:
        raise LdapAuthError("用户名或密码错误")
    except (LDAPSocketOpenError, LDAPException) as exc:
        raise LdapUnavailableError(f"LDAP 认证失败: {exc}") from exc

    def _attr(key: str) -> str:
        val = getattr(entry, key, None)
        if val is None:
            return ""
        return str(val) if str(val) != "[]" else ""

    return {
        "user_id": _attr(user_attr),
        "username": _attr("cn"),
        "nickname": _attr("displayName"),
        "enterprise": _attr("company"),
        "mail": _attr(mail_attr),
    }
