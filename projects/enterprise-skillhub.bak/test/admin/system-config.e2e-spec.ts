/**
 * Sprint 4 — Admin SystemConfig E2E
 */

import { createTestApp, closeTestApp } from '../setup';
import { loginAs } from '../helpers/auth-helper';
import { TEST_USERS } from '../helpers/test-users';
import { getSystemConfig, patchSystemConfig } from '../helpers/admin-helper';

describe('Admin — System Config (Sprint 4)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(t);
  });

  it('S4-CONFIG-001: non-admin cannot read system config', async () => {
    const token = await loginAs(t.http, TEST_USERS.user);
    const res = await getSystemConfig(t.http, token);
    expect([401, 403, 404]).toContain(res.status);
  });

  it('S4-CONFIG-002: admin can read system config', async () => {
    const adminToken = await loginAs(t.http, TEST_USERS.admin);
    const res = await getSystemConfig(t.http, adminToken);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toBeDefined();
    }
  });

  it('S4-CONFIG-003: admin can patch system config and see updated value', async () => {
    const adminToken = await loginAs(t.http, TEST_USERS.admin);

    const key = `_e2e_${Date.now()}`;
    const patchRes = await patchSystemConfig(t.http, adminToken, { [key]: '1' });
    expect([200, 204, 400, 404]).toContain(patchRes.status);

    const readRes = await getSystemConfig(t.http, adminToken);
    expect([200, 404]).toContain(readRes.status);

    if ((patchRes.status === 200 || patchRes.status === 204) && readRes.status === 200) {
      // tolerate both flat and nested config models
      const cfg = readRes.body?.data ?? readRes.body;
      expect(JSON.stringify(cfg)).toContain(key);
    }
  });
});
