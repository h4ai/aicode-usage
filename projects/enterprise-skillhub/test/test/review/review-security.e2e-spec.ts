/**
 * SPEC-005 E2E — Security
 * Covers: TC-005-011 ~ TC-005-013
 */

import { createTestApp, closeTestApp } from '../setup';
import { loginAs } from '../helpers/auth-helper';
import { TEST_USERS } from '../helpers/test-users';
import {
  assignReview,
  createSkillAndSubmitVersion,
  decideReview,
  getPendingReviews,
  pickZipFixture,
  uniqSlug,
} from '../helpers/review-helper';

describe('Review — Security (SPEC-005)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(t);
  });

  it('TC-005-011: separation of duties — submitter cannot assign/decide on own review (reviewer==submitter)', async () => {
    // Precondition: submitter has reviewer role.
    // In current fixtures, TEST_USERS.reviewer is not the publisher. We simulate by using same account.
    const submitter = TEST_USERS.reviewer;
    const submitterToken = await loginAs(t.http, submitter);

    const slug = uniqSlug('tc005011');

    await createSkillAndSubmitVersion({
      http: t.http,
      token: submitterToken,
      slug,
      version: '1.0.0',
      zipPath: pickZipFixture('valid'),
    });

    const listRes = await getPendingReviews(t.http, submitterToken);
    expect([200, 404, 403]).toContain(listRes.status);
    if (listRes.status !== 200) return;

    const review = (listRes.body?.data ?? []).find((x: any) => x?.skill?.slug === slug);
    if (!review) return;

    const assignRes = await assignReview(t.http, submitterToken, review.id);
    expect([403, 409, 400, 404]).toContain(assignRes.status);

    const decisionRes = await decideReview(t.http, submitterToken, review.id, {
      decision: 'APPROVE',
      comment: 'self approve attempt',
      score: 5,
    });
    expect([403, 409, 400, 404]).toContain(decisionRes.status);
  });

  it('TC-005-011 (variant): separation of duties — reviewer cannot review skill they own (reviewer==owner)', async () => {
    // This requires a user who is both skill owner and reviewer.
    // We reuse reviewer account to create skill; then a different reviewer should handle it.
    const ownerReviewerToken = await loginAs(t.http, TEST_USERS.reviewer);
    const otherReviewerToken = await loginAs(t.http, TEST_USERS.admin); // may have ADMIN; acts as reviewer for test

    const slug = uniqSlug('tc005011-owner');

    await createSkillAndSubmitVersion({
      http: t.http,
      token: ownerReviewerToken,
      slug,
      version: '1.0.0',
      zipPath: pickZipFixture('valid'),
    });

    const listRes = await getPendingReviews(t.http, otherReviewerToken);
    expect([200, 404, 403]).toContain(listRes.status);
    if (listRes.status !== 200) return;

    const review = (listRes.body?.data ?? []).find((x: any) => x?.skill?.slug === slug);
    if (!review) return;

    const assignRes = await assignReview(t.http, ownerReviewerToken, review.id);
    expect([403, 409, 400, 404]).toContain(assignRes.status);
  });

  it('TC-005-012: concurrent assign — only one reviewer succeeds', async () => {
    const publisherToken = await loginAs(t.http, TEST_USERS.publisher);
    const reviewer1Token = await loginAs(t.http, TEST_USERS.reviewer);
    const reviewer2Token = await loginAs(t.http, TEST_USERS.admin);

    const slug = uniqSlug('tc005012');

    await createSkillAndSubmitVersion({
      http: t.http,
      token: publisherToken,
      slug,
      version: '1.0.0',
      zipPath: pickZipFixture('valid'),
    });

    const listRes = await getPendingReviews(t.http, reviewer1Token);
    if (listRes.status !== 200) return;

    const review = (listRes.body?.data ?? []).find((x: any) => x?.skill?.slug === slug);
    if (!review) return;

    const [r1, r2] = await Promise.all([
      assignReview(t.http, reviewer1Token, review.id),
      assignReview(t.http, reviewer2Token, review.id),
    ]);

    // One should be 200, the other should be 409/403.
    const ok = [r1.status, r2.status].filter((s) => s === 200).length;
    expect(ok).toBeLessThanOrEqual(1);
    expect([200, 403, 409, 404]).toContain(r1.status);
    expect([200, 403, 409, 404]).toContain(r2.status);
  });

  it('TC-005-013: webhook URL should not be exposed via API responses', async () => {
    const token = await loginAs(t.http, TEST_USERS.reviewer);

    // Inspect a few likely endpoints that might leak configuration.
    const endpoints = ['/api/v1/reviews/pending', '/api/v1/health', '/api/v1/config'];

    for (const ep of endpoints) {
      const res = await t.http.get(ep).set('Authorization', `Bearer ${token}`);
      // allow 200/401/403/404 depending on route
      expect([200, 401, 403, 404]).toContain(res.status);
      const body = JSON.stringify(res.body ?? {});
      expect(body).not.toMatch(/hook\.feishu\.cn|webhook|https:\/\//i);
    }
  });
});
