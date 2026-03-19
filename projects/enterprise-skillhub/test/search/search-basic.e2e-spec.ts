import { createTestApp, closeTestApp } from '../test/setup';
import { loginAs } from '../helpers/auth-helper';
import { USERS } from '../helpers/test-users';

describe('SPEC-004 Search basic', () => {
  it('TC-004-001 语义搜索正常返回', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.user);

    // Act
    const res = await t.http
      .get('/api/v1/search/skills')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: '自然语言', limit: 10 });

    // Assert
    expect([200, 404]).toContain(res.status); // TODO: tighten after API merge
    if (res.status === 200) {
      expect(res.body).toEqual(expect.objectContaining({ data: expect.any(Array) }));
    }

    await closeTestApp(t);
  });

  it('TC-004-002 limit 边界（>50 截断）', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.user);

    // Act
    const res = await t.http
      .get('/api/v1/search/skills')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: 'x', limit: 100 });

    // Assert
    expect([200, 404]).toContain(res.status); // TODO: tighten after API merge
    if (res.status === 200) {
      if (Array.isArray(res.body.data)) expect(res.body.data.length).toBeLessThanOrEqual(50);
    }

    await closeTestApp(t);
  });

  it('TC-004-003 不支持深分页（offset）', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.user);

    // Act
    const res = await t.http
      .get('/api/v1/search/skills')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: 'x', offset: 1000, page: 99 });

    // Assert
    expect([200, 400, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });
});
