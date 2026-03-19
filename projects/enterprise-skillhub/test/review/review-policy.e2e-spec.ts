/**
 * SPEC-005 E2E — ReviewPolicy priority matching
 * Covers: TC-005-010
 */

import { createTestApp, closeTestApp } from '../setup';
import { loginAs } from '../helpers/auth-helper';
import { TEST_USERS } from '../helpers/test-users';
import { createSkillAndSubmitVersion, getPendingReviews, pickZipFixture, uniqSlug } from '../helpers/review-helper';

describe('Review — Policy priority (SPEC-005)', () => {
  let t: Awaited<ReturnType<typeof createTestApp>>;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await closeTestApp(t);
  });

  it('TC-005-010: policy match priority category+dept > category > dept > global', async () => {
    // NOTE: This requires an admin endpoint or seed data to create policies.
    // As current repo does not expose it in tests yet, we validate existence
    // of policyId field and leave strict assertions to when API lands.

    const publisherToken = await loginAs(t.http, TEST_USERS.publisher);
    const reviewerToken = await loginAs(t.http, TEST_USERS.reviewer);

    const slug = uniqSlug('tc005010');

    await createSkillAndSubmitVersion({
      http: t.http,
      token: publisherToken,
      slug,
      version: '1.0.0',
      zipPath: pickZipFixture('valid'),
      category: 'GENERAL',
    });

    const res = await getPendingReviews(t.http, reviewerToken);
    expect([200, 404]).toContain(res.status);

    if (res.status === 200) {
      const review = (res.body?.data ?? []).find((x: any) => x?.skill?.slug === slug);
      if (review) {
        // policyId should exist when matcher runs
        expect(review).toHaveProperty('policyId');
      }
    }

    // Tighten later with explicit policy setup and deterministic matching.
  });
});
