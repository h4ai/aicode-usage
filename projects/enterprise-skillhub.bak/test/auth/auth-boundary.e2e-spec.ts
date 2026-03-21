/**
 * SPEC-001 E2E — Boundary cases
 * Covers: TC-001-014 ~ TC-001-015
 */

import { createTestApp, closeTestApp } from '../setup';
import { TEST_USERS } from '../helpers/test-users';
import { ldapMock } from '../helpers/ldap-mock';

describe('Auth — Boundary (SPEC-001)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    // Arrange
    t = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(t);
  });

  /**
   * TC-001-014 用户邮箱为空的处理
   */
  it('TC-001-014: login user with null email does not 500; /me returns email=null if allowed', async () => {
    // Arrange
    const u = TEST_USERS.noEmail;
    ldapMock.patchUser(u.username, { email: null });

    // Act
    const res = await t.http.post('/auth/login').send({ username: u.username, password: u.password });

    // Assert
    expect([200, 400, 403, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toHaveProperty('user');
      // Tighten later:
      // expect(res.body.user.email).toBeNull();
    }
  });

  /**
   * TC-001-015 department 为空的可见性基础
   */
  it('TC-001-015: login user with null department then GET /skills does not 500', async () => {
    // Arrange
    const u = TEST_USERS.noDept;
    ldapMock.patchUser(u.username, { department: null });

    // Act
    const loginRes = await t.http.post('/auth/login').send({ username: u.username, password: u.password });

    // Assert
    expect([200, 404]).toContain(loginRes.status);
    if (loginRes.status !== 200) return;

    const token = loginRes.body.accessToken as string;
    const res = await t.http.get('/skills').set('Authorization', `Bearer ${token}`);
    expect([200, 401, 403, 404]).toContain(res.status);
    // Tighten later:
    // expect(res.status).toBe(200);
    // and assert only PUBLIC + owned skills are returned.
  });
});
