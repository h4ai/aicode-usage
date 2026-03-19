/**
 * RBAC — 可见性隔离测试（Sprint 1）
 *
 * 目标：覆盖 visibility=PUBLIC/DEPARTMENT/PRIVATE 的跨部门隔离与缓存串权风险。
 * 当前仅提供骨架，待 /skills 接口与数据准备 helper 合入后收紧断言。
 */

import { createTestApp, closeTestApp } from '../setup';
import { TEST_USERS } from '../helpers/test-users';

describe('RBAC — Visibility isolation (Sprint 1)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    // Arrange
    t = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(t);
  });

  it('DEPARTMENT skill is invisible to other departments (skeleton)', async () => {
    // Arrange
    const financeUser = { ...TEST_USERS.normal, department: 'Finance' };
    const hrUser = { ...TEST_USERS.normal, username: 'hr01', password: 'Hr@123', department: 'HR', email: 'hr01@company.com' };

    // Act
    const financeLogin = await t.http.post('/auth/login').send({ username: financeUser.username, password: financeUser.password });
    const hrLogin = await t.http.post('/auth/login').send({ username: hrUser.username, password: hrUser.password });

    // Assert
    expect([200, 404]).toContain(financeLogin.status);
    expect([200, 404]).toContain(hrLogin.status);

    // TODO: once fixtures are available:
    // 1) Finance user creates DEPARTMENT skill allowedDepts=['Finance']
    // 2) HR lists skills should not include it
    // 3) Finance lists skills should include it
    // 4) HR lists again should still not include it (no cache leak)
  });
});
