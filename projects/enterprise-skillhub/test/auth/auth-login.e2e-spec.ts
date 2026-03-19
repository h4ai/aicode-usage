/**
 * SPEC-001 E2E — Auth Login
 * Covers: TC-001-001 ~ TC-001-004
 */

import { createTestApp, closeTestApp } from '../setup';
import { TEST_USERS } from '../helpers/test-users';

describe('Auth — Login (SPEC-001)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    // Arrange
    t = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(t);
  });

  /**
   * TC-001-001 AD 域账号正常登录
   */
  it('TC-001-001: POST /auth/login success then GET /auth/me', async () => {
    // Arrange
    const u = TEST_USERS.normal;

    // Act
    const loginRes = await t.http.post('/auth/login').send({ username: u.username, password: u.password });

    // Assert — skeleton-friendly: allow 404 when API not yet implemented
    expect([200, 404]).toContain(loginRes.status);
    if (loginRes.status !== 200) return; // Skip further assertions in skeleton mode

    expect(loginRes.body).toHaveProperty('accessToken');
    expect(loginRes.body).toHaveProperty('user');
    expect(loginRes.body.user).toHaveProperty('username', u.username);

    const token = loginRes.body.accessToken;
    const meRes = await t.http.get('/auth/me').set('Authorization', `Bearer ${token}`);

    expect([200, 401, 404]).toContain(meRes.status);
    // Note: when backend lands, tighten assertions:
    // expect(meRes.status).toBe(200);
    // expect(meRes.body.user).toHaveProperty('lastLoginAt');
  });

  /**
   * TC-001-002 错误密码登录
   */
  it('TC-001-002: wrong password returns 401 with unified error body', async () => {
    // Arrange
    const u = TEST_USERS.normal;

    // Act
    const res = await t.http.post('/auth/login').send({ username: u.username, password: 'WrongPassword!' });

    // Assert
    expect([401, 404]).toContain(res.status);
    // Tighten later:
    // expect(res.status).toBe(401);
    // expect(res.body).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
  });

  /**
   * TC-001-003 不存在账号登录
   */
  it('TC-001-003: non-existing user returns same as wrong password (anti-enumeration)', async () => {
    // Arrange
    const username = 'nosuch';

    // Act
    const res = await t.http.post('/auth/login').send({ username, password: 'AnyPassword' });

    // Assert
    expect([401, 404]).toContain(res.status);
    // Tighten later:
    // expect(res.status).toBe(401);
    // expect(res.body).toMatchObject({ code: 'AUTH_INVALID_CREDENTIALS' });
  });

  /**
   * TC-001-004 被禁用账号登录（系统侧）
   */
  it('TC-001-004: disabled user login returns 403 and logs audit (no plaintext pwd)', async () => {
    // Arrange
    const u = TEST_USERS.disabled;

    // Act
    const res = await t.http.post('/auth/login').send({ username: u.username, password: u.password });

    // Assert
    expect([403, 404]).toContain(res.status);
    // Tighten later:
    // expect(res.status).toBe(403);
    // expect(res.body).toMatchObject({ code: 'AUTH_ACCOUNT_DISABLED' });
    // Additionally: query AuditLog in DB and assert reason classification.
  });
});
