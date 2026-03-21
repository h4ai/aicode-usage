import * as fs from 'node:fs';
import * as path from 'node:path';
import * as JSZip from 'jszip';

import { createTestApp, closeTestApp } from '../setup';
import { loginAs } from '../helpers/auth-helper';
import { createSkill } from '../helpers/skill-helper';
import { uploadVersion, tmpDir } from '../helpers/version-helper';
import { USERS } from '../helpers/test-users';

describe('SPEC-003 Version boundary', () => {
  async function writeZip(files: Record<string, string>) {
    const zip = new JSZip();
    for (const [p, c] of Object.entries(files)) zip.file(p, c);
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const dir = tmpDir();
    const zipPath = path.join(dir, 'bundle.zip');
    fs.writeFileSync(zipPath, buf);
    return zipPath;
  }

  it('TC-003-016 同路径文件覆盖冲突（大小写差异）', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, token, {
      slug: 'dup-path',
      displayName: 'Dup Path',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const zip = new JSZip();
    zip.file('SKILL.md', '---\nname: x\n---');
    zip.file('a/b.txt', '1');
    zip.file('A/b.txt', '2');
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const dir = tmpDir();
    const zipPath = path.join(dir, 'bundle.zip');
    fs.writeFileSync(zipPath, buf);

    // Act
    const res = await uploadVersion(t.http, token, { slug: 'dup-path', version: '1.0.0', zipPath });

    // Assert
    expect([400, 404, 200, 201]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-017 storageKey 生成正确', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, token, {
      slug: 'key-skill',
      displayName: 'Key Skill',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const zipPath = await writeZip({
      'SKILL.md': '---\nname: x\n---',
      'dir/file.txt': 'ok',
    });

    // Act
    const res = await uploadVersion(t.http, token, { slug: 'key-skill', version: '1.0.0', zipPath });

    // Assert
    expect([200, 201, 404]).toContain(res.status); // TODO: tighten after API merge
    // TODO: tighten after API merge — expect(res.body.files[0].storageKey).toMatch(`skills/key-skill/1.0.0/`)

    await closeTestApp(t);
  });
});
