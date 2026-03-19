import type { SuperTest, Test } from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export type UploadVersionInput = {
  slug: string;
  version: string;
  changelog?: string;
  zipPath: string;
};

export async function uploadVersion(http: SuperTest<Test>, token: string, input: UploadVersionInput) {
  const req = http
    .post(`/api/v1/skills/${encodeURIComponent(input.slug)}/versions`)
    .set('Authorization', `Bearer ${token}`)
    .field('version', input.version);

  if (input.changelog) req.field('changelog', input.changelog);

  return req.attach('file', input.zipPath);
}

export function tmpDir(prefix = 'skillhub-e2e-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
