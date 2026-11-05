import { expect, test } from '@playwright/test';

test('unbound consent route fails closed without exposing the editor or account controls', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).origin !== 'http://127.0.0.1:4173') externalRequests.push(request.url());
  });
  await page.goto('/oauth/consent?authorization_id=authorization_request_123456');
  await expect(page.getByRole('heading', { name: 'Modern Floor Planner owner access' })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText('Owner sign-in is not configured for this build');
  await expect(page.getByRole('button', { name: 'Account', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Draw Room', exact: true })).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test('missing or repeated authorization identifiers never show owner credential fields', async ({ page }) => {
  for (const search of ['', '?authorization_id=short&authorization_id=another_short']) {
    await page.goto('/oauth/consent' + search);
    await expect(page.getByRole('alert')).toContainText('authorization request is missing, expired, or invalid');
    await expect(page.getByLabel('Owner email')).toHaveCount(0);
    await expect(page.getByLabel('Password')).toHaveCount(0);
  }
});
