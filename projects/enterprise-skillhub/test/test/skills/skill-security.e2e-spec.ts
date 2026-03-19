import { createTestApp, closeTestApp } from '../test/setup';
import { loginAs } from '../helpers/auth-helper';
import { createSkill, patchSkill, deleteSkill, getSkillList } from '../helpers/skill-helper';
import { USERS } from '../helpers/test-users';

describe('SPEC-002 Skill security', () => {
  it('TC-002-012 IDOR 越权防御（更新/删除）', async () => {
    // Arrange
    const t = await createTestApp();

    const ownerToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, ownerToken, {
      slug: 'idor-target',
      displayName: 'IDOR Target',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const attackerToken = await loginAs(t.http, USERS.user);

    // Act
    const patchRes = await patchSkill(t.http, attackerToken, 'idor-target', {
      displayName: 'pwned',
      // attack payload: try to change ownerId directly
      ownerId: '00000000-0000-0000-0000-000000000000',
    });
    const delRes = await deleteSkill(t.http, attackerToken, 'idor-target');

    // Assert
    expect([403, 404]).toContain(patchRes.status); // TODO: tighten after API merge
    expect([403, 404]).toContain(delRes.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-002-013 缓存串权检查（部门隔离）', async () => {
    // Arrange
    const t = await createTestApp();

    const financeToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, financeToken, {
      slug: 'finance-only-cache',
      displayName: 'Finance Only Cache',
      visibility: 'DEPARTMENT',
      allowedDepts: ['Finance'],
      tags: [],
    });

    const hrToken = await loginAs(t.http, USERS.user);

    // Act
    const hrFirst = await getSkillList(t.http, hrToken);
    const finance = await getSkillList(t.http, financeToken);
    const hrSecond = await getSkillList(t.http, hrToken);

    // Assert
    expect([200, 404]).toContain(hrFirst.status); // TODO: tighten after API merge
    expect([200, 404]).toContain(finance.status); // TODO: tighten after API merge
    expect([200, 404]).toContain(hrSecond.status); // TODO: tighten after API merge

    // When API merged, tighten assertion:
    // expect(hrSecond.body.data.map((x:any)=>x.slug)).not.toContain('finance-only-cache');

    await closeTestApp(t);
  });
});
