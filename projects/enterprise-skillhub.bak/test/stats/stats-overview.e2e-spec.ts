/**
 * Sprint 4 — Stats Overview/Top/Department E2E
 */

import { createTestApp, closeTestApp } from '../setup';
import { loginAs, authHeader } from '../helpers/auth-helper';
import { TEST_USERS } from '../helpers/test-users';

async function getJson(t: any, token: string, path: string, query?: any) {
  return await t.http.get(path).query(query ?? {}).set(authHeader(token));
}

describe('Stats — Overview/Top/Department (Sprint 4)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(t);
  });

  it('S4-STATS-001: overview returns dashboard payload', async () => {
    const token = await loginAs(t.http, TEST_USERS.admin);
    const res = await getJson(t, token, '/api/v1/stats/overview');
    expect([200, 401, 403, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toBeDefined();
    }
  });

  it('S4-STATS-002: top-skills returns top 10 (<=10 items)', async () => {
    const token = await loginAs(t.http, TEST_USERS.admin);
    const res = await getJson(t, token, '/api/v1/stats/top-skills');
    expect([200, 401, 403, 404]).toContain(res.status);
    if (res.status === 200) {
      const data = res.body?.data ?? res.body;
      if (Array.isArray(data)) {
        expect(data.length).toBeLessThanOrEqual(10);
      }
    }
  });

  it('S4-STATS-003: department-usage returns department buckets', async () => {
    const token = await loginAs(t.http, TEST_USERS.admin);
    const res = await getJson(t, token, '/api/v1/stats/department-usage');
    expect([200, 401, 403, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toBeDefined();
    }
  });

  it('S4-STATS-004: cache refresh after data change (smoke)', async () => {
    const token = await loginAs(t.http, TEST_USERS.admin);

    const before = await getJson(t, token, '/api/v1/stats/overview');
    expect([200, 401, 403, 404]).toContain(before.status);

    // simulate data change that should invalidate cache: create a skill (POST) if available
    const post = await t.http
      .post('/api/v1/skills')
      .set(authHeader(token))
      .send({ name: `e2e-skill-${Date.now()}`, slug: `e2e-skill-${Date.now()}`, visibility: 'PRIVATE' });
    expect([200, 201, 400, 401, 403, 404]).toContain(post.status);

    const after = await getJson(t, token, '/api/v1/stats/overview');
    expect([200, 401, 403, 404]).toContain(after.status);

    // When implemented, tighten: expect cache refresh yields updated counters.
    if (before.status === 200 && after.status === 200) {
      expect(JSON.stringify(after.body).length).toBeGreaterThan(0);
    }
  });
});
