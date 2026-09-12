import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { configureIssuer } from '../accounts/control';
import { setup, counts, membership, deferred } from '../autosave/helpers';
import { account, panel, roomField, commit, selectedPhysical } from './browser-helpers';
import { parseRegistry } from '../../client/src/features/physical-draft/storage';

const reports = (page: Page) => page.getByRole('region', { name: 'Quantity reports', exact: true });
const frame = (page: Page) => page.locator('iframe[title="Captured quantity report"]');
const preview = (page: Page) => page.frameLocator('iframe[title="Captured quantity report"]');
const aggregate = (page: Page, name: string) => preview(page).locator('article').filter({
  has: preview(page).getByRole('heading', { name, exact: true }),
});
async function prepareSaved(page: Page) {
  await reports(page).getByRole('combobox', { name: 'Report source', exact: true }).selectOption('saved');
  const response = page.waitForResponse(value => new URL(value.url()).pathname.endsWith('/export') && new URL(value.url()).searchParams.get('format') === 'html');
  await reports(page).getByRole('button', { name: 'Prepare report', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(preview(page).getByRole('heading', { name: 'Selected quantities', exact: true })).toBeVisible();
  await expect(reports(page).getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeEnabled();
}
/** Independent RFC4180 parser for the actual downloaded file, not the renderer. */
function rows(text: string): Record<string, string>[] {
  const records: string[][] = []; let record: string[] = [], value = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const character = text[i];
    if (character === '"') {
      if (quoted && text[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted;
    } else if (character === ',' && !quoted) { record.push(value); value = ''; }
    else if ((character === '\r' || character === '\n') && !quoted) {
      if (character === '\r' && text[i + 1] === '\n') i++;
      record.push(value); records.push(record); record = []; value = '';
    } else value += character;
  }
  expect(quoted).toBe(false); if (record.length || value) { record.push(value); records.push(record); }
  const headers = records.shift()!;
  return records.filter(record => record.some(Boolean)).map(record => {
    expect(record.length).toBe(headers.length);
    return Object.fromEntries(headers.map((header, i) => [header, record[i]]));
  });
}
async function downloadCsv(page: Page) {
  const pending = page.waitForEvent('download');
  await reports(page).getByRole('button', { name: 'Download quantity CSV', exact: true }).click();
  const downloaded = await pending; expect(downloaded.suggestedFilename()).toBe('modern-floor-planner-quantities.csv');
  const path = await downloaded.path(); expect(path).not.toBeNull();
  const bytes = await readFile(path!); expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  expect([...bytes.subarray(3, 6)]).not.toEqual([239, 187, 191]);
  const text = bytes.toString('utf8'); return { text, records: rows(text) };
}
function total(records: Record<string, string>[], output: string) {
  const row = records.find(record => record.section === 'selected-total' && record.output === output);
  expect(row).toBeTruthy(); return row!;
}
async function originalStorageKey(page: Page) {
  return page.evaluate(() => {
    const context = sessionStorage.getItem('modern-floor-planner:working-context:v1');
    const key = Object.keys(sessionStorage).find(key => key.startsWith(`modern-floor-planner:context:v1:${context}:`) && key.includes('editor-draft'));
    if (!key) throw Error('Synthetic workspace draft recovery key missing'); return key;
  });
}
async function retainedDraft(page: Page, key: string, id: string) {
  const result = parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), key));
  expect(result.status).toBe('recovered'); if (result.status !== 'recovered') throw Error('Synthetic source draft is not retained');
  return result.registry.drafts.find(draft => draft.id === id);
}

test.beforeEach(async ({}, info) => {
  await configureIssuer({ subjectPrefix: 'export-browser-' + info.testId.replace(/[^A-Za-z0-9_-]/g, '').slice(-40) });
});

test('saved CSV and preview use the authorized immutable revision while newer height edits remain local', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const { saved } = await setup(page, 'Saved export'); const before = await selectedPhysical(page);
  await prepareSaved(page); await expect(reports(page)).toContainText('Captured saved revision 1');
  await expect(aggregate(page, 'Gross wall area').locator('tbody td').nth(3)).toHaveText('352');
  const html = await frame(page).getAttribute('srcdoc'); const first = await downloadCsv(page);
  expect(total(first.records, 'floor-area').net).toBe('120'); expect(total(first.records, 'ceiling-area').net).toBe('120');
  expect(total(first.records, 'gross-wall-area').net).toBe('352');
  expect(first.records.find(record => record.section === 'metadata' && record.name === 'Account revision ID')?.details).toBe(saved.revisionId);
  expect((await selectedPhysical(page)).document).toEqual(before.document);
  await commit(roomField(page, 'Ceiling height'), '9 ft'); const newer = await selectedPhysical(page);
  expect(newer.document.rooms[0].ceilingHeight.valueMm).toBeCloseTo(9 * 304.8);
  await expect(page.getByTestId('physical-save-status')).toHaveText('Unsaved changes');
  await expect(reports(page)).toContainText('Your draft has newer edits.');
  expect(await frame(page).getAttribute('srcdoc')).toBe(html);
  expect((await downloadCsv(page)).text).toBe(first.text);
  await prepareSaved(page); await expect(aggregate(page, 'Gross wall area').locator('tbody td').nth(3)).toHaveText('352');
  expect(await selectedPhysical(page)).toEqual(newer); expect(await counts(saved.planId)).toEqual({ revisions: 1, receipts: 1 });
  await reports(page).screenshot({ path: test.info().outputPath('saved-revision-quantity-report.png') });
  expect(errors).toEqual([]);
});

test('revocation after preview preparation prevents another saved download and preserves workspace draft recovery', async ({ page }) => {
  const { saved, workspace } = await setup(page, 'Revoked export'); await prepareSaved(page);
  await roomField(page, 'Length').fill('12 ft -'); const original = await selectedPhysical(page), key = await originalStorageKey(page);
  const principal = await page.evaluate(async () => (await fetch('/api/auth/session').then(response => response.json())).principal.id);
  const downloads: string[] = []; page.on('download', download => downloads.push(download.suggestedFilename()));
  await membership(workspace.id, principal, { status: 'revoked' });
  const revalidation = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/session');
  await reports(page).getByRole('button', { name: 'Download quantity CSV', exact: true }).click();
  const status = await (await revalidation).json(); expect(status.workspace).toBeNull();
  await expect(frame(page)).toHaveCount(0);
  expect(downloads).toEqual([]); expect(await retainedDraft(page, key, original.id)).toEqual(original);
  expect(await counts(saved.planId)).toEqual({ revisions: 1, receipts: 1 });
});

test('logout during a held real export response cancels delivery and removes the previous private preview', async ({ page }) => {
  const { saved } = await setup(page, 'Delayed export'); await prepareSaved(page);
  const original = await selectedPhysical(page), key = await originalStorageKey(page);
  const received = deferred(), release = deferred(), settled = deferred(); let actualStatus = 0;
  const downloads: string[] = []; page.on('download', download => downloads.push(download.suggestedFilename()));
  // Fetch from the real server first; delay delivery only. Identity and report
  // generation are never mocked, and the old account truly had access here.
  await page.route('**/api/physical-plans/**/export?*', async route => {
    if (new URL(route.request().url()).searchParams.get('format') !== 'csv') return route.continue();
    const response = await route.fetch(); actualStatus = response.status(); await response.body(); received.resolve();
    await release.promise;
    try { await route.fulfill({ response }); } catch { /* The old request is aborted after logout. */ }
    finally { settled.resolve(); }
  });
  try {
    await reports(page).getByRole('button', { name: 'Download quantity CSV', exact: true }).click();
    await received.promise; expect(actualStatus).toBe(200);
    await account(page); await panel(page).getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(frame(page)).toHaveCount(0); release.resolve(); await settled.promise;
    await panel(page).getByRole('button', { name: 'Resume unassigned local-only work', exact: true }).click();
    await expect(page.getByTestId('physical-draft-id')).toHaveCount(0);
    expect(downloads).toEqual([]); expect(await retainedDraft(page, key, original.id)).toEqual(original);
    expect(await counts(saved.planId)).toEqual({ revisions: 1, receipts: 1 });
  } finally { release.resolve(); await page.unroute('**/api/physical-plans/**/export?*'); }
});
