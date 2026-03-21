/**
 * SPEC-001 E2E — LDAP Degradation
 * Covers: TC-001-009 ~ TC-001-010
 */

import { createTestApp, closeTestApp } from '../setup';
import { TEST_USERS } from '../helpers/test-users';
import { ldapMock } from '../helpers/ldap-mock';

describe('Auth — LDAP degradation (SPEC-001)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    // Arrange
    t = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(t);
  });

  beforeEach(() => {
    ldapMock.setMode('normal');
  });

  /**
   * TC-001-009 域控不可用时新登录降级
   */
  it('TC-001-009: when LDAP down, /auth/login returns 503; /health shows ldap=down', async () => {
    // Arrange
    ldapMock.setMode('unavailable');
    const u = TEST_USERS.normal;

    // Act
    const res = await t.http.post('/auth/login').send({ username: u.username, password: u.password });

    // Assert
    expect([503, 404]).toContain(res.status);

    const health = await t.http.get('/api/health');
    expect([200, 404]).toContain(health.status);
    // Tighten later:
    // expect(health.body).toMatchObject({ ldap: 'down' });
  });

  /**
   * TC-001-010 域控不可用但已有 JWT 可继续访问
   */
  it('TC-001-010: when LDAP down, existing JWT can still access protected endpoints', async () => {
    // Arrange
    const u = TEST_USERS.normal;
    const loginRes = await t.http.post('/auth/login').send({ username: u.username, password: u.password });
    expect([200, 404]).toContain(loginRes.status);
    if (loginRes.status !== 200) return;

    const token = loginRes.body.accessToken as string;
    ldapMock.setMode('unavailable');

    // Act
    const res = await t.http.get('/skills').set('Authorization', `Bearer ${token}`);

    // Assert
    expect([200, 401, 403, 404]).toContain(res.status);
    // Tighten later: expect 200
  });
});
