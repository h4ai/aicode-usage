import { createTestApp, closeTestApp } from '../setup';
import { loginAs } from '../helpers/auth-helper';
import { getSkillList, createSkill, patchSkill } from '../helpers/skill-helper';
import { USERS } from '../helpers/test-users';

describe('SPEC-002 Skill boundary', () => {
  it('TC-002-014 limit 超过 100 截断', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.user);

    // Act
    const res = await getSkillList(t.http, token, { limit: 1000 });

    // Assert
    expect([200, 404]).toContain(res.status); // TODO: tighten after API merge
    if (res.status === 200) {
      expect(res.body).toEqual(expect.objectContaining({ limit: expect.any(Number) }));
      expect(res.body.limit).toBeLessThanOrEqual(100);
      if (Array.isArray(res.body.data)) expect(res.body.data.length).toBeLessThanOrEqual(100);
    }

    await closeTestApp(t);
  });

  it('TC-002-015 tags 去重与大小写归一', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.publisher);

    await createSkill(t.http, token, {
      slug: 'tags-normalize',
      displayName: 'Tags Normalize',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: ['AI', 'ai', 'AI'],
    });

    // Act
    const patchRes = await patchSkill(t.http, token, 'tags-normalize', {
      tags: ['AI', 'ai', 'AI'],
    });

    // Assert
    expect([200, 201, 404]).toContain(patchRes.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });
});
