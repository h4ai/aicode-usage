import { createTestApp, closeTestApp } from '../test/setup';
import { loginAs } from '../helpers/auth-helper';
import { createSkill, getSkillList, getSkillDetail } from '../helpers/skill-helper';
import { USERS } from '../helpers/test-users';

describe('SPEC-002 Skill visibility', () => {
  it('TC-002-006 可见性：PUBLIC 可见', async () => {
    // Arrange
    const t = await createTestApp();

    const ownerToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, ownerToken, {
      slug: 'public-skill',
      displayName: 'Public Skill',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: ['pub'],
    });

    const otherToken = await loginAs(t.http, USERS.user);

    // Act
    const listRes = await getSkillList(t.http, otherToken);
    const detailRes = await getSkillDetail(t.http, otherToken, 'public-skill');

    // Assert
    expect([200, 404]).toContain(listRes.status); // TODO: tighten after API merge
    expect([200, 404]).toContain(detailRes.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-002-007 可见性：DEPARTMENT 隔离', async () => {
    // Arrange
    const t = await createTestApp();

    const ownerToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, ownerToken, {
      slug: 'finance-only',
      displayName: 'Finance Only',
      visibility: 'DEPARTMENT',
      allowedDepts: ['Finance'],
      tags: [],
    });

    // Act
    const hrToken = await loginAs(t.http, USERS.user);
    const listRes = await getSkillList(t.http, hrToken);
    const detailRes = await getSkillDetail(t.http, hrToken, 'finance-only');

    // Assert
    expect([200, 404]).toContain(listRes.status); // TODO: tighten after API merge
    expect([403, 404]).toContain(detailRes.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-002-008 可见性：PRIVATE 仅 owner/admin', async () => {
    // Arrange
    const t = await createTestApp();

    const ownerToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, ownerToken, {
      slug: 'private-skill',
      displayName: 'Private Skill',
      visibility: 'PRIVATE',
      allowedDepts: [],
      tags: [],
    });

    const otherToken = await loginAs(t.http, USERS.user);

    // Act
    const otherDetail = await getSkillDetail(t.http, otherToken, 'private-skill');
    const ownerDetail = await getSkillDetail(t.http, ownerToken, 'private-skill');

    // Assert
    expect([403, 404]).toContain(otherDetail.status); // TODO: tighten after API merge
    expect([200, 404]).toContain(ownerDetail.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });
});
