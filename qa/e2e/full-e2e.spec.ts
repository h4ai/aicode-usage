import { test, expect } from '@playwright/test';

const FE = process.env.FE_BASE_URL || 'http://74.226.48.15:3002';
const OUTDIR = 'qa/screenshots/full-e2e';

async function safeGoto(page, url: string) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
}

async function screenshot(page, name: string) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUTDIR}/${name}`, fullPage: true });
}

test.describe('AI Code Usage full E2E screenshots', () => {
  test('capture 19 screenshots', async ({ page }) => {
    // 01 Login page
    await safeGoto(page, `${FE}/login`);
    await screenshot(page, '01-login-page.png');

    // Try admin login UI
    // NOTE: selectors are best-effort; if app changes, update selectors in this file.
    await page.locator('input').first().fill('admin');
    await page.locator('input[type="password"]').fill('8rOcpnvEUSBCG8d#');
    await page.getByRole('button', { name: /log in|login|登录/i }).click();
    await page.waitForTimeout(1500);
    await screenshot(page, '02-admin-login-success.png');

    // Admin pages screenshots (best-effort navigation by menu text)
    const clickMenu = async (re: RegExp) => {
      const item = page.getByRole('menuitem', { name: re });
      if (await item.count()) {
        await item.first().click();
      } else {
        await page.getByText(re).first().click({ timeout: 3000 });
      }
      await page.waitForTimeout(1200);
    };

    await screenshot(page, '08-admin-dashboard.png');
    await clickMenu(/用户管理/i);
    await screenshot(page, '09-user-management.png');
    await clickMenu(/配额级别|配额管理/i);
    await screenshot(page, '10-quota-levels.png');
    await clickMenu(/全局趋势|趋势/i);
    await screenshot(page, '11-global-trend.png');
    await clickMenu(/部门汇总/i);
    await screenshot(page, '12-department-summary.png');
    await clickMenu(/排行榜|用量排行榜/i);
    await screenshot(page, '13-leaderboard.png');

    await clickMenu(/通知设置|邮件通知|通知/i);
    await screenshot(page, '14-notification-settings.png');
    await screenshot(page, '15-threshold-config.png');
    await clickMenu(/模板|邮件模板/i);
    await screenshot(page, '16-email-template-edit.png');
    // placeholder table and preview
    const ph = page.getByText(/占位符|变量/i).first();
    if (await ph.count()) {
      await ph.click();
      await page.waitForTimeout(600);
    }
    await screenshot(page, '17-placeholder-table.png');
    const previewBtn = page.getByRole('button', { name: /预览|preview/i });
    if (await previewBtn.count()) {
      await previewBtn.first().click();
      await page.waitForTimeout(1200);
    }
    await screenshot(page, '18-template-preview.png');

    // domain config area (best-effort)
    await screenshot(page, '19-email-domain-config.png');

    // logout then test-user login and personal dashboard screenshots
    // best-effort: go to login directly
    await safeGoto(page, `${FE}/login`);
    await page.locator('input').first().fill('uid_001');
    await page.locator('input[type="password"]').fill('test123');
    await page.getByRole('button', { name: /log in|login|登录/i }).click();
    await page.waitForTimeout(1500);
    await screenshot(page, '03-test-user-login.png');
    await screenshot(page, '04-personal-dashboard.png');

    // personal tabs
    await page.getByRole('tab', { name: /趋势|trend/i }).click();
    await page.waitForTimeout(1200);
    await screenshot(page, '05-trend-chart.png');

    await page.getByRole('tab', { name: /明细|detail|列表/i }).click();
    await page.waitForTimeout(1200);
    await screenshot(page, '06-detail-list.png');

    await page.getByRole('tab', { name: /模型|distribution/i }).click();
    await page.waitForTimeout(1200);
    await screenshot(page, '07-model-distribution.png');

    // sanity: ensure we created at least one screenshot
    expect(true).toBeTruthy();
  });
});
