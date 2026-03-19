// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Http = any;
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export type UploadVersionInput = {
  slug: string;
  version: string;
  changelog?: string;
  zipPath: string;
};

export async function uploadVersion(http: Http, token: string, input: UploadVersionInput) {
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
