import type { SuperTest, Test, agent as superAgent } from 'supertest';
import * as path from 'node:path';
import * as fs from 'node:fs';

export type HttpClient = SuperTest<Test> | ReturnType<typeof superAgent>;

import { createSkill } from './skill-helper';
import { uploadVersion, tmpDir } from './version-helper';

export const REVIEW_SCENARIOS = {
  normalFlow: '正常流程：上传 → 扫描通过 → 认领 → 审批',
  autoReject: '自动拒绝：上传含恶意内容的 ZIP',
  revisionRequest: '要求修改：审核员要求修改 → 作者发新版本',
  selfReview: '职责分离：尝试审核自己的提交',
  concurrentAssign: '并发认领：两人同时抢同一单',
} as const;

export type ReviewStatus =
  | 'PENDING_AUTO'
  | 'AUTO_REJECTED'
  | 'PENDING_MANUAL'
  | 'IN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVISION_REQUESTED';

export async function getPendingReviews(http: HttpClient, token: string, status?: ReviewStatus) {
  const req = http.get('/api/v1/reviews/pending').set('Authorization', `Bearer ${token}`);
  if (status) req.query({ status });
  return req;
}

export async function assignReview(http: HttpClient, token: string, reviewId: string, assigneeId?: string) {
  return http
    .post(`/api/v1/reviews/${encodeURIComponent(reviewId)}/assign`)
    .set('Authorization', `Bearer ${token}`)
    .send(assigneeId ? { assigneeId } : {});
}

export async function decideReview(
  http: HttpClient,
  token: string,
  reviewId: string,
  input: { decision: 'APPROVE' | 'REJECT' | 'REVISION_REQUESTED'; comment: string; score?: number },
) {
  return http
    .post(`/api/v1/reviews/${encodeURIComponent(reviewId)}/decision`)
    .set('Authorization', `Bearer ${token}`)
    .send(input);
}

export async function waitForReviewStatus(
  http: HttpClient,
  token: string,
  predicate: (r: any) => boolean,
  opts: { timeoutMs?: number; intervalMs?: number; status?: ReviewStatus } = {},
) {
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const intervalMs = opts.intervalMs ?? 1_000;
  const start = Date.now();

  // Poll pending list (backend does not specify GET /reviews/:id)
  // When API lands, prefer a dedicated endpoint.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const res = await getPendingReviews(http, token, opts.status);
    expect([200, 404]).toContain(res.status);

    if (res.status === 200) {
      const data = res.body?.data ?? res.body ?? [];
      const found = Array.isArray(data) ? data.find(predicate) : undefined;
      if (found) return found;
    }

    if (Date.now() - start > timeoutMs) {
      throw new Error('waitForReviewStatus timeout');
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

/**
 * Build a tiny zip fixture from an existing fixture directory.
 *
 * NOTE: We intentionally avoid adding a new dependency (adm-zip/jszip).
 * The repository already uses ZIP in upload tests; when zip generator library
 * exists, replace this with proper zip creation.
 */
export function pickZipFixture(name: 'valid' | 'missing-skillmd' | 'hardcoded-secret' | 'no-license'): string {
  const candidate = path.join(__dirname, '..', 'fixtures', 'reviews', `${name}.zip`);
  if (!fs.existsSync(candidate)) {
    throw new Error(`Missing zip fixture: ${candidate}`);
  }
  return candidate;
}

export async function createSkillAndSubmitVersion(args: {
  http: HttpClient;
  token: string;
  slug: string;
  displayName?: string;
  departmentVisibility?: boolean;
  version: string;
  zipPath: string;
  category?: string;
}) {
  const { http, token, slug, version, zipPath } = args;

  await createSkill(http, token, {
    slug,
    displayName: args.displayName ?? slug,
    visibility: args.departmentVisibility ? 'DEPARTMENT' : 'PUBLIC',
    allowedDepts: [],
    category: args.category ?? 'GENERAL',
  });

  const uploadRes = await uploadVersion(http, token, { slug, version, zipPath });
  return uploadRes;
}

export function uniqSlug(prefix = 'review-skill') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function uniqVersion(major = 1, minor = 0) {
  return `${major}.${minor}.${Math.floor(Math.random() * 1000)}`;
}

export function createTmpSkillDir() {
  return tmpDir('skillhub-review-');
}
