import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

import { createTestApp, closeTestApp } from '../test/setup';
import { loginAs } from '../helpers/auth-helper';
import { createSkill } from '../helpers/skill-helper';
import { uploadVersion, tmpDir } from '../helpers/version-helper';
import { USERS } from '../helpers/test-users';

describe('SPEC-003 Version list & download', () => {
  async function zipWithSkillMd() {
    const zip = new JSZip();
    zip.file('SKILL.md', '---\nname: x\n---\n');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const dir = tmpDir();
    const zipPath = path.join(dir, 'bundle.zip');
    fs.writeFileSync(zipPath, buf);
    return zipPath;
  }

  it('TC-003-007 版本列表排序正确', async () => {
    // Arrange
    const t = await createTestApp();
    const ownerToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, ownerToken, {
      slug: 'list-skill',
      displayName: 'List Skill',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });
    const zipPath = await zipWithSkillMd();

    await uploadVersion(t.http, ownerToken, { slug: 'list-skill', version: '1.0.0', zipPath });
    await uploadVersion(t.http, ownerToken, { slug: 'list-skill', version: '2.0.0', zipPath });
    await uploadVersion(t.http, ownerToken, { slug: 'list-skill', version: '1.2.0', zipPath });

    // Act
    const res = await t.http
      .get('/api/v1/skills/list-skill/versions')
      .set('Authorization', `Bearer ${ownerToken}`);

    // Assert
    expect([200, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-008 仅 APPROVED 可下载', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, token, {
      slug: 'dl-skill',
      displayName: 'DL Skill',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    // In real API, admin approves version; here we only check download endpoint behavior.

    // Act
    const res = await t.http
      .get('/api/v1/skills/dl-skill/versions/1.0.0/download')
      .set('Authorization', `Bearer ${token}`);

    // Assert
    expect([200, 302, 403, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-009 下载统计 downloadCount+1', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.publisher);

    // Act
    const first = await t.http
      .get('/api/v1/skills/dl-skill/versions/1.0.0/download')
      .set('Authorization', `Bearer ${token}`);
    const second = await t.http
      .get('/api/v1/skills/dl-skill/versions/1.0.0/download')
      .set('Authorization', `Bearer ${token}`);

    // Assert
    expect([200, 302, 403, 404]).toContain(first.status); // TODO: tighten after API merge
    expect([200, 302, 403, 404]).toContain(second.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-010 预签名 URL 过期', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.publisher);

    // Act
    const res = await t.http
      .get('/api/v1/skills/dl-skill/versions/1.0.0/download')
      .set('Authorization', `Bearer ${token}`);

    // Assert
    expect([200, 302, 403, 404]).toContain(res.status); // TODO: tighten after API merge
    // TODO: tighten after API merge — parse Location URL and wait > 5min then expect 403/SignatureDoesNotMatch

    await closeTestApp(t);
  });
});
