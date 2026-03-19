/**
 * OpenLDAP/AD Mock for e2e tests
 *
 * 目标：在不依赖真实 AD 的情况下，模拟：
 * - 用户存在/不存在
 * - 密码正确/错误
 * - AD 属性缺失（mail/department）
 * - 分组（用于 RBAC 映射）
 * - 域控不可用/超时
 */

import { TEST_USERS, type TestUser } from './test-users';

export type LdapAuthResult =
  | {
      ok: true;
      user: {
        username: string;
        email: string | null;
        department: string | null;
        adGroups: string[];
      };
    }
  | {
      ok: false;
      reason:
        | 'INVALID_CREDENTIALS'
        | 'USER_NOT_FOUND'
        | 'LDAP_UNAVAILABLE'
        | 'LDAP_TIMEOUT';
    };

export type LdapMockMode = 'normal' | 'unavailable' | 'timeout';

export class LdapMock {
  private mode: LdapMockMode = 'normal';
  private users: Record<string, TestUser> = { ...TEST_USERS };

  setMode(mode: LdapMockMode) {
    this.mode = mode;
  }

  setUsers(users: Record<string, TestUser>) {
    this.users = { ...users };
  }

  patchUser(username: string, patch: Partial<TestUser>) {
    this.users[username] = {
      ...(this.users[username] ?? { username, password: 'UNKNOWN' }),
      ...patch,
    };
  }

  async authenticate(username: string, password: string): Promise<LdapAuthResult> {
    if (this.mode === 'unavailable') {
      return { ok: false, reason: 'LDAP_UNAVAILABLE' };
    }
    if (this.mode === 'timeout') {
      return { ok: false, reason: 'LDAP_TIMEOUT' };
    }

    const u = Object.values(this.users).find((x) => x.username === username);
    if (!u) return { ok: false, reason: 'USER_NOT_FOUND' };

    if (u.password !== password) return { ok: false, reason: 'INVALID_CREDENTIALS' };

    return {
      ok: true,
      user: {
        username: u.username,
        email: u.email ?? null,
        department: u.department ?? null,
        adGroups: u.adGroups ?? [],
      },
    };
  }
}

export const ldapMock = new LdapMock();
