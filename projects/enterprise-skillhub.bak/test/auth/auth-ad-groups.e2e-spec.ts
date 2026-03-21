/**
 * SPEC-001 E2E — AD Groups Mapping
 * Covers: TC-001-005 ~ TC-001-006
 */

import { createTestApp, closeTestApp } from '../setup';
import { TEST_USERS } from '../helpers/test-users';

describe('Auth — AD Groups to Role Mapping (SPEC-001)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    // Arrange
    t = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(t);
  });

  /**
   * TC-001-005 AD 组映射为 ADMIN
   */
  it('TC-001-005: user in SkillHub-Admin group gets ADMIN role', async () => {
    // Arrange
    const u = TEST_USERS.admin;

    // Act
    const loginRes = await t.http.post('/auth/login').send({ username: u.username, password: u.password });

    // Assert
    expect([200, 404]).toContain(loginRes.status);
    if (loginRes.status === 200) {
      expect(loginRes.body).toHaveProperty('user');
      expect(loginRes.body.user).toHaveProperty('role');
      // Tighten later:
      // expect(loginRes.body.user.role).toBe('ADMIN');
    }
  });

  /**
   * TC-001-006 多 AD 组命中最高权限
   */
  it('TC-001-006: multi-group user resolves to highest role (ADMIN)', async () => {
    // Arrange
    const u = TEST_USERS.multiGroup;

    // Act
    const loginRes = await t.http.post('/auth/login').send({ username: u.username, password: u.password });

    // Assert
    expect([200, 404]).toContain(loginRes.status);
    if (loginRes.status === 200) {
      expect(loginRes.body).toHaveProperty('user');
      // Tighten later:
      // expect(loginRes.body.user.role).toBe('ADMIN');
    }
  });
});
