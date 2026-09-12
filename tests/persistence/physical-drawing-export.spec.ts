import { test, expect, type Page } from '@playwright/test';
import { configureIssuer } from '../accounts/control';
import { setup, counts, deferred } from '../autosave/helpers';
import { account, panel, roomField, roomFields, commit, selectedPhysical } from './browser-helpers';
const reports = (page: Page) => page.getByRole('region', { name: 'Quantity reports', exact: true });
const frame = (page: Page) => page.locator('iframe[title="Captured quantity report"]');
const preview = (page: Page) => page.frameLocator('iframe[title="Captured quantity report"]');
async function prepare(page: Page) {
  await reports(page).getByRole('combobox', { name: 'Report source', exact: true }).selectOption('saved');
  await reports(page).getByRole('combobox', { name: 'Report contents', exact: true }).selectOption('plan');
  const pending = page.waitForResponse(response => new URL(response.url()).pathname.endsWith('/export') && new URL(response.url()).searchParams.get('format') === 'plan');
  await reports(page).getByRole('button', { name: 'Prepare report', exact: true }).click();
  expect((await pending).status()).toBe(200);
  await expect(preview(page).locator('.plan-sheet')).toHaveCount(1);
  await expect(reports(page).getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeEnabled();
}
test.beforeEach(async ({}, info) => { await configureIssuer({ subjectPrefix: 'drawing-' + info.testId.replace(/[^A-Za-z0-9_-]/g, '').slice(-40) }); });
test('saved drawing report retains captured labels and quantities despite newer local changes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const { saved } = await setup(page, 'Captured drawing'); const original = await selectedPhysical(page);
  await prepare(page); const html = await frame(page).getAttribute('srcdoc');
  await expect(preview(page).locator('.plan-sheet')).toContainText('Captured drawing');
  await expect(preview(page).locator('body')).toContainText(saved.revisionId);
  const walls = preview(page).locator('article').filter({ has: preview(page).getByRole('heading', { name: 'Gross wall area', exact: true }) });
  await expect(walls.locator('tbody td').nth(3)).toHaveText('352');
  await commit(roomFields(page).getByLabel('Room name', { exact: true }), 'New unsaved label');
  await commit(roomField(page, 'Length'), '14 ft'); const newer = await selectedPhysical(page);
  expect(newer.document).not.toEqual(original.document); expect(await frame(page).getAttribute('srcdoc')).toBe(html);
  await prepare(page); expect(await frame(page).getAttribute('srcdoc')).toBe(html);
  await expect(preview(page).locator('.plan-sheet')).not.toContainText('New unsaved label');
  expect(await selectedPhysical(page)).toEqual(newer); expect(await counts(saved.planId)).toEqual({ revisions: 1, receipts: 1 });
  expect(errors).toEqual([]);
});
test('logout during a held real drawing response discards the private printable report', async ({ page }) => {
  const { saved } = await setup(page, 'Delayed drawing'); await prepare(page);
  const received = deferred(), release = deferred(), settled = deferred(); let actualStatus = 0;
  await page.route('**/api/physical-plans/**/export?*', async route => {
    if (new URL(route.request().url()).searchParams.get('format') !== 'plan') return route.continue();
    const response = await route.fetch(); actualStatus = response.status(); await response.body(); received.resolve();
    await release.promise;
    try { await route.fulfill({ response }); } catch { /* Logout may abort delivery. */ } finally { settled.resolve(); }
  });
  try {
    await reports(page).getByRole('button', { name: 'Prepare report', exact: true }).click();
    await received.promise; expect(actualStatus).toBe(200);
    await account(page); await panel(page).getByRole('button', { name: 'Sign out', exact: true }).click();
    release.resolve(); await settled.promise;
    await expect(frame(page)).toHaveCount(0);
    await expect(reports(page).getByRole('button', { name: 'Print / Save PDF', exact: true })).toHaveCount(0);
    expect(await counts(saved.planId)).toEqual({ revisions: 1, receipts: 1 });
  } finally { release.resolve(); await page.unroute('**/api/physical-plans/**/export?*'); }
});
