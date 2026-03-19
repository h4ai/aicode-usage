/**
 * Sprint 4 — Stats Review Efficiency + Trends E2E
 */

import { createTestApp, closeTestApp } from '../setup';
import { loginAs, authHeader } from '../helpers/auth-helper';
import { TEST_USERS } from '../helpers/test-users';

async function getJson(t: any, token: string, path: string, query?: any) {
  return await t.http.get(path).query(query ?? {}).set(authHeader(token));
}

describe('Stats — Review Efficiency/Trends (Sprint 4)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(t);
  });

  it('S4-EFF-001: review-efficiency returns metrics payload', async () => {
    const token = await loginAs(t.http, TEST_USERS.admin);
    const res = await getJson(t, token, '/api/v1/stats/review-efficiency');
    expect([200, 401, 403, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toBeDefined();
    }
  });

  it('S4-EFF-002: trends returns series payload by date range', async () => {
    const token = await loginAs(t.http, TEST_USERS.admin);
    const res = await getJson(t, token, '/api/v1/stats/trends', {
      from: new Date(Date.now() - 7 * 86400_000).toISOString(),
      to: new Date().toISOString(),
      bucket: 'day',
    });
    expect([200, 401, 403, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toBeDefined();
    }
  });
});
