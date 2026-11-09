import { test, expect } from '@playwright/test';

test('logged-out students cannot open the workspace or reset password page', async ({ page }, testInfo) => {
  await page.goto('/workspace');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: 'Log in', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Log in', exact: true })).toBeDisabled();
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
  await page.goto('/reset-password');
  await expect(page).toHaveURL(/\/forgot-password$/);
  await page.goto('/upgrade');
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/payments/return?reference=graphbook-test');
  await expect(page).toHaveURL(/\/login$/);
});

test('account forms are labeled, navigable and fit a phone screen', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create an account', exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByLabel('Email address')).toBeVisible();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Confirm password', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Back to log in' }).click();
  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await expect(page.getByText(/Check your spam folder/)).toBeVisible();
});

test('opening a valid-looking email link does not consume its token', async ({ page }) => {
  let writes = 0;
  page.on('request', request => { if (request.method() === 'POST') writes++; });
  const response = await page.goto(`/auth/confirm?token_hash=${'a'.repeat(64)}&type=recovery`);
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  expect(writes).toBe(0);
  expect(response?.headers()['referrer-policy']).toBe('no-referrer');
  expect(response?.headers()['cache-control']).toContain('no-store');
  expect(response?.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
  await page.goto('/auth/confirm?token_hash=bad&type=invite');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('This link is incomplete');
});

test('cross-origin preflight does not enable CORS', async ({ request }) => {
  const response = await request.fetch('/api/auth/login', { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
  expect(response.headers()['access-control-allow-origin']).toBeUndefined();
});
