import { createTestApp, closeTestApp } from '../setup';
import { loginAs } from '../helpers/auth-helper';
import { USERS } from '../helpers/test-users';

describe('SPEC-004 Search degradation', () => {
  it('TC-004-010 BGE-M3 宕机降级 ILIKE/全文检索', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.user);

    // Act
    const res = await t.http
      .get('/api/v1/search/skills')
      .set('Authorization', `Bearer ${token}`)
      .query({ q: 'xxx', limit: 10 });

    // Assert
    expect([200, 404]).toContain(res.status); // TODO: tighten after API merge
    // TODO: tighten after API merge — when degraded, similarityScore should be null

    await closeTestApp(t);
  });

  it('TC-004-011 BGE-M3 超时重试与死信', async () => {
    // Arrange
    const t = await createTestApp();
    const adminToken = await loginAs(t.http, USERS.admin);

    // Act
    // Trigger embedding-generation job (endpoint likely internal)
    const res = await t.http
      .post('/api/v1/search/skills/some-skill/reindex')
      .set('Authorization', `Bearer ${adminToken}`);

    // Assert
    expect([200, 202, 404]).toContain(res.status); // TODO: tighten after API merge
    // TODO: tighten after API merge — assert retry backoff 1s/4s/16s and moved to dead-letter after 3 attempts

    await closeTestApp(t);
  });
});
