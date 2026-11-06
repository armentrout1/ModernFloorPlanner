import { expect, test } from '@playwright/test';

test('one account gateway exposes sign-in, sign-up, password reset, Google, and local guest choices', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') externalRequests.push(request.url());
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Account', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Sign in or create account', exact: true }).click();
  const gateway = page.getByRole('region', { name: 'Welcome to Modern Floor Planner', exact: true });
  await expect(gateway.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(gateway.getByLabel('Email address', { exact: true })).toBeVisible();
  await expect(gateway.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(gateway.getByRole('button', { name: 'Continue with Google', exact: true })).toHaveCount(1);
  await expect(gateway.getByRole('button', { name: 'Continue as guest', exact: true })).toBeVisible();
  await expect(gateway.getByRole('button', { name: 'Sign in with email', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Account', exact: true })).toHaveCount(0);
  await gateway.getByRole('button', { name: 'Create account', exact: true }).click();
  await expect(gateway.getByRole('heading', { name: 'Create an account', exact: true })).toBeVisible();
  await expect(gateway.getByLabel('Confirm password', { exact: true })).toBeVisible();
  await gateway.getByRole('button', { name: 'Already have an account? Sign in', exact: true }).click();
  await gateway.getByRole('button', { name: 'Forgot password?', exact: true }).click();
  await expect(gateway.getByRole('heading', { name: 'Reset your password', exact: true })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Account', exact: true })).toHaveCount(0);
  await gateway.getByRole('button', { name: 'Continue as guest', exact: true }).click();
  await expect(gateway).toBeHidden();
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toBeVisible();
  expect(externalRequests).toEqual([]);
});
