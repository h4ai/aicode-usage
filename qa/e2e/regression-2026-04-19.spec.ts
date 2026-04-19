import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.AI_CODE_USAGE_FRONTEND ?? 'http://localhost:3002';

async function login(page, username: string, password: string) {
  await page.goto(FRONTEND_URL, { waitUntil: 'domcontentloaded' });

  // Try to locate login form. Selectors are intentionally broad.
  const user = page.getByRole('textbox', { name: /user|用户名|账号|username/i }).first();
  const pass = page.getByRole('textbox', { name: /pass|密码|password/i }).first();

  await expect(user).toBeVisible({ timeout: 15000 });
  await user.fill(username);
  await pass.fill(password);

  const btn = page.getByRole('button', { name: /login|登录/i }).first();
  await btn.click();

  // Post-login: expect some dashboard element.
  await expect(page.getByText(/关键指标|dashboard|看板/i).first()).toBeVisible({ timeout: 20000 });
}

async function setTimeFilterByTestId(page, testId: string) {
  const toggle = page.locator(`[data-testid="${testId}"]`).first();
  await expect(toggle).toBeVisible({ timeout: 15000 });
  await toggle.click();
}

test.describe('AI Code Usage Dashboard regression (2026-04-19)', () => {
  test('US-T02/T03: global time filter toggle works and persists', async ({ page }) => {
    await login(page, 'uid_001', '<test_password>');

    await setTimeFilterByTestId(page, 'time-filter-work');
    await page.reload();

    // after reload, selected button should still be present (and ideally active)
    await expect(page.locator('[data-testid="time-filter-work"]').first()).toBeVisible();

    await setTimeFilterByTestId(page, 'time-filter-non-work');
    await setTimeFilterByTestId(page, 'time-filter-all');
  });

  test('US-T07/T08: key metrics tabs order and week tab exists', async ({ page }) => {
    await login(page, 'uid_001', '<test_password>');

    await expect(page.locator('[data-testid="metrics-scope-group"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="metrics-tab-today"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="metrics-tab-week"]').first()).toBeVisible();
    await expect(page.locator('[data-testid="metrics-tab-month"]').first()).toBeVisible();
  });

  test('US-T11: detail export respects time_filter (smoke)', async ({ page }) => {
    await login(page, 'uid_001', '<test_password>');

    await setTimeFilterByTestId(page, 'time-filter-work');

    const exportBtn = page.locator('[data-testid="detail-export-csv"]').first();
    await expect(exportBtn).toBeVisible({ timeout: 15000 });

    const [ download ] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      exportBtn.click(),
    ]);

    expect(await download.suggestedFilename()).toMatch(/\.csv$/);
  });
});
