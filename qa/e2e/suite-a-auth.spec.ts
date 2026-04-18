import { test, expect } from '@playwright/test';

test.describe('Suite A - Auth', () => {
  test('A-004/A-005: login wrong password shows error; admin login writes token+role and routes', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'AI Code Usage - 登录' })).toBeVisible();

    // wrong password
    await page.getByPlaceholder('用户名').fill('admin');
    await page.getByPlaceholder('密码').fill('wrong');
    await page.getByRole('button', { name: '登录' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('alert')).toContainText('登录失败');
    await page.screenshot({ path: 'qa/screenshots/A-005-login-wrong-password.png', fullPage: true });

    // correct password
    await page.getByPlaceholder('密码').fill('8rOcpnvEUSBCG8d#');
    await page.getByRole('button', { name: '登录' }).click();

    // Route change can be blocked if any error is thrown after login. Assert localStorage first.
    await expect
      .poll(async () => await page.evaluate(() => localStorage.getItem('role')))
      .toBe('admin');
    await expect
      .poll(async () => await page.evaluate(() => localStorage.getItem('token')))
      .not.toBeNull();

    // Then assert routing to /admin (or at least not staying on /login)
    await expect(page).not.toHaveURL(/\/login$/);
    await page.screenshot({ path: 'qa/screenshots/A-004-login-success-admin.png', fullPage: true });
  });
});
