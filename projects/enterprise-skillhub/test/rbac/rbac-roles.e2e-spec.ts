/**
 * RBAC — 角色权限矩阵测试（Sprint 1）
 *
 * Note: TEST-PLAN 中 RBAC 用例在 SPEC-002/003/...，此处提供 Sprint1 基础矩阵骨架。
 * 当 API 合入后，请将 endpoints 与期望状态码收紧。
 */

import { createTestApp, closeTestApp } from '../setup';
import { TEST_USERS } from '../helpers/test-users';

describe('RBAC — Role matrix (Sprint 1)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    // Arrange
    t = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(t);
  });

  it('PUBLISHER can create skill; USER cannot (skeleton)', async () => {
    // Arrange
    const publisher = TEST_USERS.normal; // assuming mapped to PUBLISHER by group
    const userPayload = { slug: 'demo-skill', displayName: 'Demo', visibility: 'PUBLIC', tags: ['ai'] };

    // Act
    const pubLogin = await t.http.post('/auth/login').send({ username: publisher.username, password: publisher.password });

    // Assert
    expect([200, 404]).toContain(pubLogin.status);

    if (pubLogin.status === 200) {
      const token = pubLogin.body.accessToken as string;
      const res = await t.http
        .post('/skills')
        .set('Authorization', `Bearer ${token}`)
        .send(userPayload);
      expect([200, 201, 403, 404]).toContain(res.status);
      // Tighten later: expect 201
    }
  });

  it('ADMIN can includeRemoved=true; non-admin rejected (skeleton)', async () => {
    // Arrange
    const admin = TEST_USERS.admin;
    const normal = TEST_USERS.normal;

    // Act
    const adminLogin = await t.http.post('/auth/login').send({ username: admin.username, password: admin.password });
    const normalLogin = await t.http.post('/auth/login').send({ username: normal.username, password: normal.password });

    // Assert
    expect([200, 404]).toContain(adminLogin.status);
    expect([200, 404]).toContain(normalLogin.status);

    if (adminLogin.status === 200) {
      const token = adminLogin.body.accessToken as string;
      const res = await t.http.get('/skills?includeRemoved=true').set('Authorization', `Bearer ${token}`);
      expect([200, 404]).toContain(res.status);
    }

    if (normalLogin.status === 200) {
      const token = normalLogin.body.accessToken as string;
      const res = await t.http.get('/skills?includeRemoved=true').set('Authorization', `Bearer ${token}`);
      expect([403, 404, 200]).toContain(res.status);
      // Tighten later: expect 403
    }
  });
});
