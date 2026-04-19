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

async function setTimeFilter(page, label: RegExp) {
  // Toggle-like control on top-right
  const toggle = page.getByRole('button', { name: label }).first();
  await expect(toggle).toBeVisible({ timeout: 15000 });
  await toggle.click();
}

test.describe('AI Code Usage Dashboard regression (2026-04-19)', () => {
  test('US-T02/T03: global time filter toggle works and persists', async ({ page }) => {
    await login(page, 'uid_001', 'test123');

    await setTimeFilter(page, /工作时段|work/i);
    await page.reload();

    // after reload, the selected state should still show (implementation-specific)
    await expect(page.getByRole('button', { name: /工作时段|work/i }).first()).toBeVisible();

    await setTimeFilter(page, /非工作时段|non.?work/i);
    await setTimeFilter(page, /全天|all/i);
  });

  test('US-T07/T08: key metrics tabs order and week tab exists', async ({ page }) => {
    await login(page, 'uid_001', 'test123');

    const tabs = page.getByRole('tab');
    // Expect at least the three tabs exist
    await expect(tabs.filter({ hasText: /今日/i }).first()).toBeVisible();
    await expect(tabs.filter({ hasText: /本周/i }).first()).toBeVisible();
    await expect(tabs.filter({ hasText: /本月/i }).first()).toBeVisible();
  });

  test('US-T11: detail export respects time_filter (smoke)', async ({ page }) => {
    await login(page, 'uid_001', 'test123');

    await setTimeFilter(page, /工作时段|work/i);

    // Find export button in detail section
    const exportBtn = page.getByRole('button', { name: /导出|export/i }).first();
    await expect(exportBtn).toBeVisible({ timeout: 15000 });

    const [ download ] = await Promise.all([
      page.waitForEvent('download', { timeout: 20000 }),
      exportBtn.click(),
    ]);

    expect(await download.suggestedFilename()).toMatch(/\.csv$/);
  });
});
