import { expect, test } from '@playwright/test';

test('account panel exposes normal sign-in, sign-up, password reset, and local guest choices', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') externalRequests.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  const panel = page.getByRole('dialog', { name: 'Account and local work', exact: true });
  await expect(panel.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(panel.getByLabel('Email address', { exact: true })).toBeVisible();
  await expect(panel.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Continue with Google', exact: true })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Continue as guest (local only)', exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Create an account', exact: true })).toBeVisible();
  await expect(panel.getByLabel('Confirm password', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Already have an account? Sign in', exact: true }).click();
  await panel.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await expect(panel.getByRole('heading', { name: 'Reset your password', exact: true })).toBeVisible();
  expect(externalRequests).toEqual([]);
});
