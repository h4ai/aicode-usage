# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""LDAP / Active Directory authentication service.

Uses ldap3 (pure Python) — no native libraries required (no libldap2-dev/gcc).
Suitable for air-gapped / financial intranet environments.

Authentication flow (standard AD two-step bind):
  Step 1: Bind with service account (bind_dn/bind_password) → search user DN
  Step 2: Re-bind with user DN + user password → verify credentials
"""

from __future__ import annotations

import logging
from typing import Any

from ldap3 import ALL, SUBTREE, Connection, Server
from ldap3.core.exceptions import LDAPException

from app.config import get_config

logger = logging.getLogger(__name__)


class LdapUnavailableError(Exception):
    """Raised when the LDAP server cannot be reached."""


class LdapAuthError(Exception):
    """Raised when LDAP authentication fails (wrong credentials / account locked)."""


class LDAPService:
    """LDAP 认证服务（两步 bind：服务账号查询 + 用户账号验证）。"""

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

    def _service_conn(self) -> Connection:
        """建立服务账号连接（用于搜索用户 DN）。"""
        server = self._create_server()
        if not self.bind_dn:
            raise LdapUnavailableError("LDAP bind_dn 未配置，无法查询用户")
        conn = Connection(
            server,
            user=self.bind_dn,
            password=self.bind_password,
            auto_bind=True,
            raise_exceptions=True,
        )
        return conn

    def _find_user_dn(self, conn: Connection, username: str) -> str:
        """通过服务账号连接搜索用户 DN。"""
        search_filter = f"(&(sAMAccountName={username})(objectClass=person))"
        conn.search(
            search_base=self.base_dn,
            search_filter=search_filter,
            search_scope=SUBTREE,
            attributes=["distinguishedName", "cn", "sAMAccountName",
                        "mail", "company", "displayName", "mobile",
                        "userAccountControl"],
        )
        if not conn.entries:
            raise LdapAuthError("用户名或密码错误")
        return str(conn.entries[0].entry_dn)

    def authenticate(self, username: str, password: str) -> dict[str, Any]:
        """Authenticate user via two-step AD bind.

        Step 1: service account bind → search user DN + attributes
        Step 2: user DN bind → verify password

        Raises:
            LdapAuthError: wrong credentials or account locked.
            LdapUnavailableError: cannot reach the LDAP server.
        """
        if not username or not password:
            raise LdapAuthError("用户名或密码错误")

        try:
            # Step 1: 服务账号查询用户信息
            svc_conn = self._service_conn()
            search_filter = f"(&(sAMAccountName={username})(objectClass=person))"
            svc_conn.search(
                search_base=self.base_dn,
                search_filter=search_filter,
                search_scope=SUBTREE,
                attributes=["distinguishedName", "cn", "sAMAccountName",
                            "mail", "company", "displayName", "mobile",
                            "userAccountControl"],
            )

            if not svc_conn.entries:
                svc_conn.unbind()
                raise LdapAuthError("用户名或密码错误")

            entry = svc_conn.entries[0]
            user_dn = str(entry.entry_dn)

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
            svc_conn.unbind()

            # Step 2: 用用户 DN + 密码重新绑定验证密码
            server = self._create_server()
            user_conn = Connection(
                server,
                user=user_dn,
                password=password,
                auto_bind=True,
                raise_exceptions=True,
            )
            user_conn.unbind()

            return user_info

        except LdapAuthError:
            raise
        except LDAPException as exc:
            logger.warning("LDAP auth failed for %s: %s", username, exc)
            raise LdapAuthError("用户名或密码错误") from exc
        except LdapUnavailableError:
            raise
        except Exception as exc:
            logger.error("LDAP unexpected error: %s", exc)
            raise LdapUnavailableError(f"LDAP 服务异常: {exc}") from exc

    def check_health(self) -> bool:
        """Check whether LDAP server is reachable using service account bind."""
        try:
            conn = self._service_conn()
            conn.unbind()
            return True
        except Exception as exc:
            logger.debug("LDAP health check failed: %s", exc)
            return False


def _get_ldap_service() -> LDAPService:
    """Build LDAPService from config.yaml."""
    cfg = get_config()
    ldap_cfg: dict[str, Any] = cfg.get("ldap", {})
    server_url = ldap_cfg.get("server", "")
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
    """Return True if LDAP is reachable (service account bind)."""
    cfg = get_config()
    if not cfg.get("ldap", {}).get("server", ""):
        return False
    return _get_ldap_service().check_health()
