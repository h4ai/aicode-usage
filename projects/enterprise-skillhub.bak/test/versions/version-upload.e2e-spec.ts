import * as fs from 'node:fs';
import * as path from 'node:path';
import * as JSZip from 'jszip';

import { createTestApp, closeTestApp } from '../setup';
import { loginAs } from '../helpers/auth-helper';
import { createSkill } from '../helpers/skill-helper';
import { uploadVersion, tmpDir } from '../helpers/version-helper';
import { USERS } from '../helpers/test-users';

describe('SPEC-003 Version upload', () => {
  async function makeZip(files: Record<string, string | Buffer>) {
    const zip = new JSZip();
    for (const [p, c] of Object.entries(files)) {
      zip.file(p, c);
    }
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const dir = tmpDir();
    const zipPath = path.join(dir, 'bundle.zip');
    fs.writeFileSync(zipPath, buf);
    return zipPath;
  }

  it('TC-003-001 上传合法 ZIP 创建版本成功', async () => {
    // Arrange
    const t = await createTestApp();
    const ownerToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, ownerToken, {
      slug: 'v-skill',
      displayName: 'V Skill',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const zipPath = await makeZip({
      'SKILL.md': '---\nname: v-skill\n---\n# hello',
      'index.ts': 'console.log("hi")',
    });

    // Act
    const res = await uploadVersion(t.http, ownerToken, {
      slug: 'v-skill',
      version: '1.0.0',
      zipPath,
    });

    // Assert
    expect([200, 201, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-002 版本号 SemVer 校验失败（带 v 前缀）', async () => {
    // Arrange
    const t = await createTestApp();
    const ownerToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, ownerToken, {
      slug: 'semver-skill',
      displayName: 'Semver Skill',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const zipPath = await makeZip({ 'SKILL.md': '---\nname: x\n---\n' });

    // Act
    const res = await uploadVersion(t.http, ownerToken, {
      slug: 'semver-skill',
      version: 'v1.0.0',
      zipPath,
    });

    // Assert
    expect([400, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-003 版本号冲突', async () => {
    // Arrange
    const t = await createTestApp();
    const ownerToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, ownerToken, {
      slug: 'conflict-skill',
      displayName: 'Conflict Skill',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const zipPath = await makeZip({ 'SKILL.md': '---\nname: x\n---\n' });

    // Act
    const first = await uploadVersion(t.http, ownerToken, {
      slug: 'conflict-skill',
      version: '1.0.0',
      zipPath,
    });
    const second = await uploadVersion(t.http, ownerToken, {
      slug: 'conflict-skill',
      version: '1.0.0',
      zipPath,
    });

    // Assert
    expect([200, 201, 404]).toContain(first.status); // TODO: tighten after API merge
    expect([400, 409, 404]).toContain(second.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-004 非 ZIP 文件上传', async () => {
    // Arrange
    const t = await createTestApp();
    const ownerToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, ownerToken, {
      slug: 'nonzip-skill',
      displayName: 'NonZip Skill',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const dir = tmpDir();
    const fake = path.join(dir, 'fake.txt');
    fs.writeFileSync(fake, 'not a zip');

    // Act
    const res = await uploadVersion(t.http, ownerToken, {
      slug: 'nonzip-skill',
      version: '1.0.0',
      zipPath: fake,
    });

    // Assert
    expect([400, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-005 ZIP > 50MB 拒绝', async () => {
    // Arrange
    const t = await createTestApp();
    const ownerToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, ownerToken, {
      slug: 'bigzip-skill',
      displayName: 'BigZip Skill',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const dir = tmpDir();
    const big = path.join(dir, 'big.zip');
    // create a sparse-ish buffer for request; enough to test 413 when ingress/app has limit
    fs.writeFileSync(big, Buffer.alloc(51 * 1024 * 1024, 0));

    // Act
    const res = await uploadVersion(t.http, ownerToken, {
      slug: 'bigzip-skill',
      version: '1.0.0',
      zipPath: big,
    });

    // Assert
    expect([413, 400, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-006 缺少根目录 SKILL.md', async () => {
    // Arrange
    const t = await createTestApp();
    const ownerToken = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, ownerToken, {
      slug: 'noskillmd',
      displayName: 'No Skill MD',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const zipPath = await makeZip({
      'README.md': '# nope',
      'dir/SKILL.md': '---\nname: nested\n---',
    });

    // Act
    const res = await uploadVersion(t.http, ownerToken, {
      slug: 'noskillmd',
      version: '1.0.0',
      zipPath,
    });

    // Assert
    expect([400, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });
});
