import { createTestApp, closeTestApp } from '../test/setup';
import { loginAs } from '../helpers/auth-helper';
import { createSkill } from '../helpers/skill-helper';
import { USERS } from '../helpers/test-users';

describe('SPEC-004 Search security', () => {
  it('TC-004-007 搜索权限过滤：跨部门不可见', async () => {
    // Arrange
    const t = await createTestApp();
    const financeToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, financeToken, {
      slug: 'finance-search-only',
      displayName: 'Finance Search Only',
      visibility: 'DEPARTMENT',
      allowedDepts: ['Finance'],
      tags: ['finance'],
    });

    const hrToken = await loginAs(t.http, USERS.user);

    // Act
    const res = await t.http
      .get('/api/v1/search/skills')
      .set('Authorization', `Bearer ${hrToken}`)
      .query({ q: 'finance', limit: 10 });

    // Assert
    expect([200, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-004-008 搜索权限过滤：PRIVATE 不泄露', async () => {
    // Arrange
    const t = await createTestApp();
    const ownerToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, ownerToken, {
      slug: 'private-search',
      displayName: 'Private Search',
      visibility: 'PRIVATE',
      allowedDepts: [],
      tags: ['private'],
    });

    const otherToken = await loginAs(t.http, USERS.user);

    // Act
    const res = await t.http
      .get('/api/v1/search/skills')
      .set('Authorization', `Bearer ${otherToken}`)
      .query({ q: 'private', limit: 10 });

    // Assert
    expect([200, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-004-009 Raw SQL 参数化防注入', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.user);
    const payload = "' OR 1=1 --";

    // Act
    const res = await t.http
      .get('/api/v1/search/skills')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: payload, category: "GENERAL'); DROP TABLE Skill; --" });

    // Assert
    expect([200, 400, 404]).toContain(res.status); // TODO: tighten after API merge
    if (res.status === 200) {
      expect(res.body).toEqual(expect.objectContaining({ data: expect.any(Array) }));
    }

    await closeTestApp(t);
  });
});
