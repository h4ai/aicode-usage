# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""LDAP / Active Directory authentication service.

Uses ldap3 (pure Python) — no native libraries required (no libldap2-dev/gcc).
Suitable for air-gapped / financial intranet environments.
"""

from __future__ import annotations

import logging
from typing import Any

from ldap3 import Server, Connection, ALL
from ldap3.core.exceptions import LDAPException

from app.config import get_config

logger = logging.getLogger(__name__)


class LdapUnavailableError(Exception):
    """Raised when the LDAP server cannot be reached."""


class LdapAuthError(Exception):
    """Raised when LDAP authentication fails (wrong credentials / account locked)."""


class LDAPService:
    """LDAP 认证服务，处理连接、验证、用户信息获取（来自沈老板提供的实现）。"""

    def __init__(
        self,
        server: str,
        base_dn: str,
        bind_dn: str = "",
        bind_password: str = "",
        use_ssl: bool = False,
        use_tls: bool = False,
        ldap_domain: str = "",
    ) -> None:
        self.server = server
        self.base_dn = base_dn
        self.bind_dn = bind_dn
        self.bind_password = bind_password
        self.use_ssl = use_ssl
        self.use_tls = use_tls
        self.ldap_domain = ldap_domain

    def _create_server(self) -> Server:
        return Server(self.server, use_ssl=self.use_ssl, get_info=ALL)

    def authenticate(self, username: str, password: str) -> dict[str, Any]:
        """Authenticate user and return user attributes dict.

        Raises:
            LdapAuthError: wrong credentials or account locked.
            LdapUnavailableError: cannot reach the LDAP server.
        """
        if not username or not password:
            raise LdapAuthError("用户名或密码错误")

        server = self._create_server()

        try:
            user = f"{self.ldap_domain}\\{username}" if self.ldap_domain else username
            conn = Connection(
                server,
                user=user,
                password=password,
                auto_bind=True,
                raise_exceptions=True,
            )

            search_filter = f"(&(sAMAccountName={username})(objectClass=person))"
            conn.search(
                search_base=self.base_dn,
                search_filter=search_filter,
                attributes=["cn", "sAMAccountName", "mail", "company",
                            "userAccountControl", "mobile", "displayName"],
            )

            if not conn.entries:
                conn.unbind()
                raise LdapAuthError("用户名或密码错误")

            entry = conn.entries[0]

            def _val(attr: str) -> str:
                v = getattr(entry, attr, None)
                if v is None:
                    return ""
                s = str(v)
                return "" if s == "[]" else s

            user_info = {
                "user_id": _val("sAMAccountName") or username,
                "username": _val("cn"),
                "nickname": _val("displayName"),
                "enterprise": _val("company"),
                "mail": _val("mail"),
            }

            conn.unbind()
            return user_info

        except LdapAuthError:
            raise
        except LDAPException as exc:
            logger.warning("LDAP auth failed for %s: %s", username, exc)
            raise LdapAuthError("用户名或密码错误") from exc
        except Exception as exc:
            logger.error("LDAP unexpected error: %s", exc)
            raise LdapUnavailableError(f"LDAP 服务异常: {exc}") from exc

    def check_health(self) -> bool:
        """Check whether LDAP server is reachable (anonymous bind)."""
        try:
            server = self._create_server()
            conn = Connection(server, auto_bind=True)
            conn.unbind()
            return True
        except Exception:
            return False


def _get_ldap_service() -> LDAPService:
    """Build LDAPService from config.yaml."""
    cfg = get_config()
    ldap_cfg: dict[str, Any] = cfg.get("ldap", {})
    server_url = ldap_cfg.get("server", "")
    # Strip protocol for ldap3 (it accepts host or full URL)
    return LDAPService(
        server=server_url,
        base_dn=ldap_cfg.get("base_dn", ""),
        bind_dn=ldap_cfg.get("bind_dn", ""),
        bind_password=ldap_cfg.get("bind_password", ""),
        use_ssl=server_url.startswith("ldaps://"),
        ldap_domain=ldap_cfg.get("domain", ""),
    )


# ---------------------------------------------------------------------------
# Module-level functions (kept for backward compatibility with auth.py)
# ---------------------------------------------------------------------------

def authenticate(username: str, password: str) -> dict[str, Any]:
    """Authenticate via AD. Returns user_id/username/nickname/enterprise/mail."""
    cfg = get_config()
    if not cfg.get("ldap", {}).get("server", ""):
        raise LdapUnavailableError("LDAP server not configured")
    return _get_ldap_service().authenticate(username, password)


def check_health() -> bool:
    """Return True if LDAP is reachable."""
    cfg = get_config()
    if not cfg.get("ldap", {}).get("server", ""):
        return False
    return _get_ldap_service().check_health()
