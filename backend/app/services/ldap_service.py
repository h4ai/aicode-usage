# SPDX-License-Identifier: Apache-2.0
# SPDX-FileCopyrightText: 2026 SubLang International <https://sublang.ai>

"""LDAP / Active Directory authentication service.

Uses ldap3 (pure Python) — no native libraries required (no libldap2-dev/gcc).
Suitable for air-gapped / financial intranet environments.

Authentication flow:
  1. Bind with user credentials (domain\\username + password) via NTLM
  2. Search user attributes using the authenticated connection
  If bind_dn/bind_password are configured, use service account for search
  to ensure consistent attribute access regardless of user AD permissions.
"""

from __future__ import annotations

import logging
from typing import Any

from ldap3 import ALL, SUBTREE, Connection, Server
from ldap3.core.exceptions import LDAPException

from app.config import get_config

logger = logging.getLogger(__name__)


class LdapUnavailableError(Exception):
    """Raised when the LDAP server cannot be reached or is misconfigured."""


class LdapAuthError(Exception):
    """Raised when LDAP authentication fails (wrong credentials / account locked)."""

    INVALID_CREDENTIALS = "invalid_credentials"

    def __init__(self, message: str = "账号或密码错误，或者账号被锁定了"):
        self.error_type = self.INVALID_CREDENTIALS
        self.message = message
        super().__init__(self.message)


class LDAPService:
    """LDAP 认证服务，处理连接、验证、用户信息获取。"""

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
        """初始化 LDAP 服务配置。

        Args:
            server: LDAP 服务器地址，如 ldap://company.com:389
            base_dn: 基础 DN，如 dc=company,dc=com
            bind_dn: 服务账号 DN（可选，用于搜索用户属性）
            bind_password: 服务账号密码（可选）
            use_ssl: 是否使用 SSL（ldaps://）
            use_tls: 是否使用 STARTTLS
            ldap_domain: NTLM 域名，如 CORP（用于 domain\\username 格式）
        """
        self.server = server
        self.base_dn = base_dn
        self.bind_dn = bind_dn
        self.bind_password = bind_password
        self.use_ssl = use_ssl
        self.use_tls = use_tls
        self.ldap_domain = ldap_domain

    def _create_server(self) -> Server:
        """创建 LDAP Server 对象。"""
        return Server(self.server, use_ssl=self.use_ssl, get_info=ALL)

    def authenticate(self, username: str, password: str) -> dict[str, Any]:
        """验证用户凭证并返回用户信息。

        流程：
          1. 用用户账号（domain\\username + password）绑定 — 验证密码
          2. 搜索用户属性（优先用服务账号，确保属性读取权限）

        Args:
            username: AD 账号（sAMAccountName，不含域名）
            password: 用户密码

        Returns:
            用户信息字典：user_id / username / nickname / enterprise / mail

        Raises:
            LdapAuthError: 认证失败（密码错误 / 账号锁定）
            LdapUnavailableError: LDAP 服务不可达
        """
        if not username or not password:
            raise LdapAuthError()

        server = self._create_server()

        try:
            # Step 1: 用用户账号验证密码（NTLM: domain\username）
            user = f"{self.ldap_domain}\\{username}" if self.ldap_domain else username
            user_conn = Connection(
                server,
                user=user,
                password=password,
                auto_bind=True,
                raise_exceptions=True,
            )
            user_conn.unbind()

            # Step 2: 搜索用户属性
            # 优先用服务账号（bind_dn），保证属性读取权限一致
            # 若未配置服务账号，则复用用户账号连接搜索
            if self.bind_dn and self.bind_password:
                search_conn = Connection(
                    server,
                    user=self.bind_dn,
                    password=self.bind_password,
                    auto_bind=True,
                    raise_exceptions=True,
                )
            else:
                # fallback: 重新用用户账号连接搜索
                search_conn = Connection(
                    server,
                    user=user,
                    password=password,
                    auto_bind=True,
                    raise_exceptions=True,
                )

            search_filter = f"(&(sAMAccountName={username})(objectClass=person))"
            search_conn.search(
                search_base=self.base_dn,
                search_filter=search_filter,
                search_scope=SUBTREE,
                attributes=[
                    "cn",
                    "sAMAccountName",
                    "mail",
                    "company",
                    "userAccountControl",
                    "mobile",
                    "displayName",
                ],
            )

            if not search_conn.entries:
                search_conn.unbind()
                raise LdapAuthError()

            entry = search_conn.entries[0]
            search_conn.unbind()

            def _val(attr: str) -> str:
                v = getattr(entry, attr, None)
                if v is None:
                    return ""
                s = str(v)
                return "" if s == "[]" else s

            return {
                "user_id": _val("sAMAccountName") or username,
                "username": _val("cn"),
                "nickname": _val("displayName"),
                "enterprise": _val("company"),
                "mail": _val("mail"),
            }

        except LdapAuthError:
            raise
        except LDAPException as exc:
            logger.warning("LDAP auth failed for %s: %s", username, exc)
            raise LdapAuthError() from exc
        except LdapUnavailableError:
            raise
        except Exception as exc:
            logger.error("LDAP unexpected error: %s", exc)
            raise LdapUnavailableError(f"LDAP 服务异常: {exc}") from exc

    def check_health(self) -> bool:
        """检查 LDAP 服务是否可用（使用服务账号绑定，AD 通常拒绝匿名）。"""
        server = self._create_server()
        try:
            if self.bind_dn and self.bind_password:
                conn = Connection(
                    server,
                    user=self.bind_dn,
                    password=self.bind_password,
                    auto_bind=True,
                )
            else:
                # 未配置服务账号时降级为匿名绑定
                conn = Connection(server, auto_bind=True)
            conn.unbind()
            return True
        except Exception as exc:
            logger.debug("LDAP health check failed: %s", exc)
            return False


def _get_ldap_service() -> LDAPService:
    """从 config.yaml 构建 LDAPService 实例。"""
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
# Module-level functions（向后兼容 auth.py）
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
