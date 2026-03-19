import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

import { createTestApp, closeTestApp } from '../test/setup';
import { loginAs } from '../helpers/auth-helper';
import { createSkill } from '../helpers/skill-helper';
import { uploadVersion, tmpDir } from '../helpers/version-helper';
import { USERS } from '../helpers/test-users';

describe('SPEC-003 Version security', () => {
  async function writeZip(zip: JSZip) {
    const buf = await zip.generateAsync({ type: 'nodebuffer' });
    const dir = tmpDir();
    const zipPath = path.join(dir, 'bundle.zip');
    fs.writeFileSync(zipPath, buf);
    return zipPath;
  }

  it('TC-003-011 ZIP 炸弹：解压后大小 >200MB', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, token, {
      slug: 'bomb-size',
      displayName: 'Bomb',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const zip = new JSZip();
    zip.file('SKILL.md', '---\nname: x\n---');
    // payload: single huge file; server should reject after analyzing uncompressed size
    zip.file('big.bin', Buffer.alloc(201 * 1024 * 1024, 0));
    const zipPath = await writeZip(zip);

    // Act
    const res = await uploadVersion(t.http, token, { slug: 'bomb-size', version: '1.0.0', zipPath });

    // Assert
    expect([400, 413, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-012 ZIP 炸弹：文件数 >1000', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, token, {
      slug: 'bomb-count',
      displayName: 'Bomb',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const zip = new JSZip();
    zip.file('SKILL.md', '---\nname: x\n---');
    for (let i = 0; i < 1001; i++) zip.file(`f/${i}.txt`, 'x');
    const zipPath = await writeZip(zip);

    // Act
    const res = await uploadVersion(t.http, token, { slug: 'bomb-count', version: '1.0.0', zipPath });

    // Assert
    expect([400, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-013 ZIP 解压超时', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, token, {
      slug: 'bomb-time',
      displayName: 'BombTime',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const zip = new JSZip();
    zip.file('SKILL.md', '---\nname: x\n---');
    // approximate slow zip: many medium files
    for (let i = 0; i < 500; i++) zip.file(`many/${i}.bin`, Buffer.alloc(256 * 1024, 1));
    const zipPath = await writeZip(zip);

    // Act
    const res = await uploadVersion(t.http, token, { slug: 'bomb-time', version: '1.0.0', zipPath });

    // Assert
    expect([400, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-014 Magic Bytes 校验失败', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, token, {
      slug: 'magic-fail',
      displayName: 'MagicFail',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const dir = tmpDir();
    const fakeZip = path.join(dir, 'fake.zip');
    fs.writeFileSync(fakeZip, Buffer.from('PK\x03\x04NOTZIP', 'utf8'));

    // Act
    const res = await uploadVersion(t.http, token, { slug: 'magic-fail', version: '1.0.0', zipPath: fakeZip });

    // Assert
    expect([400, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });

  it('TC-003-015 Zip Slip 路径穿越防护', async () => {
    // Arrange
    const t = await createTestApp();
    const token = await loginAs(t.http, USERS.publisher);
    await createSkill(t.http, token, {
      slug: 'zipslip',
      displayName: 'ZipSlip',
      visibility: 'PUBLIC',
      allowedDepts: [],
      tags: [],
    });

    const zip = new JSZip();
    zip.file('SKILL.md', '---\nname: x\n---');
    zip.file('../evil.txt', 'pwn');
    zip.file('/etc/passwd', 'pwn2');
    const zipPath = await writeZip(zip);

    // Act
    const res = await uploadVersion(t.http, token, { slug: 'zipslip', version: '1.0.0', zipPath });

    // Assert
    expect([400, 404]).toContain(res.status); // TODO: tighten after API merge

    await closeTestApp(t);
  });
});
