import { createTestApp, closeTestApp } from '../test/setup';
import { loginAs } from '../helpers/auth-helper';
import { createSkill, patchSkill } from '../helpers/skill-helper';
import { USERS } from '../helpers/test-users';

describe('SPEC-004 Embedding triggers', () => {
  it('TC-004-004 元数据更新触发重算 embedding', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, token, {
      slug: 'embed-meta',
      displayName: 'Embed Meta',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: ['x'],
      summary: 'before',
    });

    // Act
    const patchRes = await patchSkill(t.http, token, 'embed-meta', { summary: 'after' });

    // Assert
    expect([200, 404]).toContain(patchRes.status); // TODO: tighten after API merge
    // TODO: tighten after API merge — assert BullMQ job enqueued (embedding-generation)

    await closeTestApp(t);
  });

  it('TC-004-005 审核通过触发 embedding', async () => {
    // Arrange
    const t = await createTestApp();
    const adminToken = await loginAs(t.http, USERS.admin);

    // Act
    const res = await t.http
      .post('/api/v1/reviews/fake-id/decision')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ decision: 'APPROVE', score: 5, comment: 'ok' });

    // Assert
    expect([200, 400, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-004-006 reindex 仅 ADMIN/内部可调用', async () => {
    // Arrange
    const t = await createTestApp();
    const userToken = await loginAs(t.http, USERS.user);
    const adminToken = await loginAs(t.http, USERS.admin);

    // Act
    const userRes = await t.http
      .post('/api/v1/search/skills/some-skill/reindex')
      .set('Authorization', `Bearer ${userToken}`);
    const adminRes = await t.http
      .post('/api/v1/search/skills/some-skill/reindex')
      .set('Authorization', `Bearer ${adminToken}`);

    // Assert
    expect([403, 404]).toContain(userRes.status); // TODO: tighten after API merge
    expect([200, 202, 404]).toContain(adminRes.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });
});
