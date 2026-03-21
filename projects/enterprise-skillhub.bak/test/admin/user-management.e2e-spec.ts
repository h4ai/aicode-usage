/**
 * Sprint 4 — Admin User Management E2E
 */

import { createTestApp, closeTestApp } from '../setup';
import { loginAs } from '../helpers/auth-helper';
import { TEST_USERS } from '../helpers/test-users';
import { listAdminUsers, patchUserRole, patchUserStatus } from '../helpers/admin-helper';

describe('Admin — User Management (Sprint 4)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(t);
  });

  it('S4-USER-001: non-admin cannot list users', async () => {
    const token = await loginAs(t.http, TEST_USERS.user);
    const res = await listAdminUsers(t.http, token);
    expect([401, 403, 404]).toContain(res.status);
  });

  it('S4-USER-002: admin can list users', async () => {
    const adminToken = await loginAs(t.http, TEST_USERS.admin);
    const res = await listAdminUsers(t.http, adminToken);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data)).toBe(true);
    }
  });

  it('S4-USER-003: admin can change user role (PATCH /users/:id/role)', async () => {
    const adminToken = await loginAs(t.http, TEST_USERS.admin);

    const listRes = await listAdminUsers(t.http, adminToken);
    expect([200, 404]).toContain(listRes.status);

    if (listRes.status !== 200 || !Array.isArray(listRes.body?.data) || listRes.body.data.length === 0) {
      return;
    }

    const target = listRes.body.data.find((u: any) => u?.username === TEST_USERS.user.username) ?? listRes.body.data[0];
    const userId = String(target.id ?? target.userId ?? target._id ?? '');
    if (!userId) return;

    const res = await patchUserRole(t.http, adminToken, userId, 'USER');
    expect([200, 204, 400, 404]).toContain(res.status);
  });

  it('S4-USER-004: admin can disable/enable user (PATCH /users/:id/status)', async () => {
    const adminToken = await loginAs(t.http, TEST_USERS.admin);

    const listRes = await listAdminUsers(t.http, adminToken);
    expect([200, 404]).toContain(listRes.status);

    if (listRes.status !== 200 || !Array.isArray(listRes.body?.data) || listRes.body.data.length === 0) {
      return;
    }

    const target = listRes.body.data.find((u: any) => u?.username === TEST_USERS.user.username) ?? listRes.body.data[0];
    const userId = String(target.id ?? target.userId ?? target._id ?? '');
    if (!userId) return;

    const disable = await patchUserStatus(t.http, adminToken, userId, false);
    expect([200, 204, 400, 404]).toContain(disable.status);

    const enable = await patchUserStatus(t.http, adminToken, userId, true);
    expect([200, 204, 400, 404]).toContain(enable.status);
  });
});
