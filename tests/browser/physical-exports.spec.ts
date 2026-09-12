import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import type { PhysicalDraft } from '../../client/src/features/physical-draft/state';

const reports = (page: Page) => page.getByRole('region', { name: 'Quantity reports', exact: true });
const inspector = (page: Page) => page.getByTestId('physical-room-inspector');
const preview = (page: Page) => page.frameLocator('iframe[title="Captured quantity report"]');
const aggregate = (page: Page, name: string) => preview(page).locator('article').filter({ has: preview(page).getByRole('heading', { name, exact: true }) });
async function commit(input: Locator, value: string) { await input.fill(value); await input.press('Enter'); await input.press('Tab'); }
async function selected(page: Page): Promise<PhysicalDraft> {
  await expect.poll(async () => parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY)).status).toBe('recovered');
  const result = parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY));
  if (result.status !== 'recovered') throw Error('Expected validated physical draft recovery');
  return result.registry.drafts.find(draft => draft.id === result.registry.selectedDraftId)!;
}
async function createRoom(page: Page, height = '8 ft') {
  await page.goto('/physical-draft');
  await page.getByRole('button', { name: 'New physical draft', exact: true }).click();
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await commit(inspector(page).getByLabel('Room name', { exact: true }), 'Export acceptance room');
  for (const [label, value] of [['Length', '12 ft'], ['Width', '10 ft'], ['Ceiling height', height]])
    await commit(inspector(page).getByLabel(label + ' (ft)', { exact: true }), value);
  await inspector(page).getByLabel('Ceiling model', { exact: true }).selectOption('flat');
  await inspector(page).getByLabel('Wall model', { exact: true }).selectOption('vertical-uniform');
  const takeoff = page.getByTestId('takeoff-panel');
  for (const input of await takeoff.getByRole('checkbox').all()) {
    if ((await input.getAttribute('aria-label'))?.startsWith('Measure ')) await input.uncheck();
  }
  for (const [output, label, targets] of [
    ['floor-area', 'Floor area', 'rooms'], ['ceiling-area', 'Flat ceiling area', 'rooms'], ['gross-wall-area', 'Gross wall area', 'walls'],
  ]) {
    await takeoff.getByRole('checkbox', { name: 'Measure ' + label, exact: true }).check();
    await takeoff.getByRole('combobox', { name: 'Configure work', exact: true }).selectOption(output);
    await takeoff.getByRole('button', { name: 'All current ' + targets, exact: true }).click();
  }
  return selected(page);
}
async function prepare(page: Page) {
  await reports(page).getByRole('button', { name: 'Prepare report', exact: true }).click();
  await expect(preview(page).getByRole('heading', { name: 'Selected quantities', exact: true })).toBeVisible();
  await expect(reports(page).getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeEnabled();
}
function parseCsv(text: string): Record<string, string>[] {
  const records: string[][] = [], row: string[] = [];
  let value = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (index === 0 && char === '\uFEFF') continue;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(value); records.push([...row]); row.length = 0; value = '';
    } else value += char;
  }
  if (row.length || value) { row.push(value); records.push([...row]); }
  const columns = records.shift()!;
  return records.map(cells => Object.fromEntries(columns.map((key, index) => [key, cells[index] ?? ''])));
}
async function download(page: Page) {
  const event = page.waitForEvent('download');
  await reports(page).getByRole('button', { name: 'Download quantity CSV', exact: true }).click();
  const downloaded = await event;
  expect(downloaded.suggestedFilename()).toBe('modern-floor-planner-quantities.csv');
  const path = await downloaded.path();
  expect(path).not.toBeNull();
  const text = await readFile(path!, 'utf8');
  expect(text.startsWith('\uFEFF\uFEFF')).toBe(false);
  return { text, rows: parseCsv(text) };
}
const total = (rows: Record<string, string>[], output: string) => rows.find(row => row.section === 'selected-total' && row.output === output)!;
const meta = (rows: Record<string, string>[], name: string) => rows.find(row => row.section === 'metadata' && row.name === name)!.details;
const errors = new WeakMap<Page, string[]>(), writes = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
  errors.set(page, []); writes.set(page, []);
  page.on('pageerror', error => errors.get(page)!.push(error.message));
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method()))
      writes.get(page)!.push(request.method() + ' ' + request.url());
  });
});
test.afterEach(({ page }) => { expect(errors.get(page)).toEqual([]); expect(writes.get(page)).toEqual([]); });

test('CSV and print preview capture one immutable quantity snapshot while later ceiling edits stay local', async ({ page }) => {
  const before = await createRoom(page);
  await prepare(page);
  const capturedHtml = await page.locator('iframe[title="Captured quantity report"]').getAttribute('srcdoc');
  const first = await download(page);
  for (const [output, amount] of [['floor-area', '120'], ['ceiling-area', '120'], ['gross-wall-area', '352']]) {
    expect(total(first.rows, output)).toMatchObject({ net: amount, unit: 'ft2', completeness: 'complete', status: 'provisional' });
  }
  await expect(aggregate(page, 'Gross wall area').locator('tbody td').nth(3)).toHaveText('352');
  await expect(preview(page).locator('body')).toContainText(meta(first.rows, 'Snapshot ID'));
  await expect(preview(page).locator('body')).toContainText(meta(first.rows, 'Capture fingerprint'));
  expect((await selected(page)).document).toEqual(before.document);
  expect((await selected(page)).events).toEqual(before.events);
  expect(meta(first.rows, 'Source')).toContain('Local capture');
  await commit(inspector(page).getByLabel('Ceiling height (ft)', { exact: true }), '9 ft');
  await expect(reports(page)).toContainText('Your draft has newer edits.');
  expect(await page.locator('iframe[title="Captured quantity report"]').getAttribute('srcdoc')).toBe(capturedHtml);
  expect((await download(page)).text).toBe(first.text);
  await prepare(page);
  const next = await download(page);
  expect(total(next.rows, 'gross-wall-area').net).toBe('396');
  expect(total(next.rows, 'floor-area').net).toBe('120');
  expect(total(next.rows, 'ceiling-area').net).toBe('120');
  expect(meta(next.rows, 'Snapshot ID')).not.toBe(meta(first.rows, 'Snapshot ID'));
  await expect(aggregate(page, 'Gross wall area').locator('tbody td').nth(3)).toHaveText('396');
  await reports(page).screenshot({ path: test.info().outputPath('captured-quantity-report.png') });
});

test('preparing refuses unapplied text without losing raw inputs or silently capturing older dimensions', async ({ page }) => {
  const before = await createRoom(page);
  const length = inspector(page).getByLabel('Length (ft)', { exact: true });
  await length.fill('12 ft -');
  const pending = await selected(page);
  await reports(page).getByRole('button', { name: 'Prepare report', exact: true }).click();
  await expect(reports(page).getByRole('status')).toContainText('Apply or Revert unfinished fields');
  await expect(length).toHaveValue('12 ft -');
  await expect(page.locator('iframe[title="Captured quantity report"]')).toHaveCount(0);
  expect(await selected(page)).toEqual(pending);
  expect((await selected(page)).document).toEqual(before.document);
});

test('unknown ceiling height exports available floor and flat ceiling with explicitly incomplete wall totals', async ({ page }) => {
  const before = await createRoom(page, '');
  await prepare(page);
  const { rows } = await download(page);
  expect(total(rows, 'floor-area').net).toBe('120');
  expect(total(rows, 'ceiling-area').net).toBe('120');
  expect(total(rows, 'gross-wall-area').net).toBe('');
  expect(total(rows, 'gross-wall-area').completeness).not.toBe('complete');
  expect(rows.some(row => row.section === 'finding' && /height/i.test(row.details))).toBe(true);
  await expect(aggregate(page, 'Gross wall area')).toContainText('Unavailable');
  await expect(aggregate(page, 'Gross wall area')).toContainText('Available subtotal — incomplete selection');
  expect((await selected(page)).document).toEqual(before.document);
  expect((await selected(page)).document.rooms[0].ceilingHeight.state).toBe('unknown');
  await reports(page).screenshot({ path: test.info().outputPath('incomplete-quantity-report.png') });
});

test('unsupported ceilings retain floor quantities and cannot appear as verified flat ceiling exports', async ({ page }) => {
  await createRoom(page);
  await inspector(page).getByLabel('Ceiling model', { exact: true }).selectOption('unsupported');
  const before = await selected(page);
  await prepare(page);
  const { rows } = await download(page);
  expect(total(rows, 'floor-area').net).toBe('120');
  expect(total(rows, 'ceiling-area').net).toBe('');
  expect(total(rows, 'ceiling-area').completeness).not.toBe('complete');
  await expect(aggregate(page, 'Ceiling area')).toContainText('Unavailable');
  await expect(preview(page).locator('body')).toContainText('Unsupported ceiling shapes are unavailable, never verified as flat ceilings.');
  expect((await selected(page)).document).toEqual(before.document);
});

test('Print / Save PDF targets the captured report and its self-contained HTML produces a real PDF', async ({ page, context }) => {
  await createRoom(page); await prepare(page);
  const capturedHtml = await page.locator('iframe[title="Captured quantity report"]').getAttribute('srcdoc');
  expect(capturedHtml).not.toBeNull();
  await page.locator('iframe[title="Captured quantity report"]').evaluate(node => {
    const target = (node as HTMLIFrameElement).contentWindow! as Window & { exportPrintCount?: number };
    target.exportPrintCount = 0;
    target.print = () => { target.exportPrintCount!++; };
  });
  await reports(page).getByRole('button', { name: 'Print / Save PDF', exact: true }).click();
  await expect.poll(() => page.locator('iframe[title="Captured quantity report"]').evaluate(node =>
    ((node as HTMLIFrameElement).contentWindow as Window & { exportPrintCount?: number }).exportPrintCount)).toBe(1);
  const printed = await context.newPage();
  const printErrors: string[] = [];
  printed.on('pageerror', error => printErrors.push(error.message));
  try {
    await printed.setContent(capturedHtml!, { waitUntil: 'load' });
    await printed.emulateMedia({ media: 'print' });
    await expect(printed.getByRole('heading', { name: 'Selected quantities', exact: true })).toBeVisible();
    await expect(printed.locator('body')).toContainText('not a complete construction materials list');
    const pdf = await printed.pdf({ path: test.info().outputPath('captured-quantity-report.pdf'), format: 'A4', printBackground: true });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5000);
    expect(printErrors).toEqual([]);
  } finally { await printed.close(); }
});

test('quantity report actions and preview remain within the phone viewport without changing the draft', async ({ page }) => {
  const before = await createRoom(page);
  await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await reports(page).scrollIntoViewIfNeeded();
  await expect(reports(page).getByRole('button', { name: 'Download quantity CSV', exact: true })).toBeVisible();
  await expect(reports(page).getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await preview(page).locator('body').evaluate(node => node.ownerDocument.documentElement.scrollWidth <= node.ownerDocument.defaultView!.innerWidth + 1)).toBe(true);
  const frameBox = await page.locator('iframe[title="Captured quantity report"]').boundingBox();
  expect(frameBox!.width).toBeGreaterThan(250);
  expect(frameBox!.x + frameBox!.width).toBeLessThanOrEqual(391);
  expect((await download(page)).rows.find(row => row.section === 'selected-total' && row.output === 'floor-area')?.net).toBe('120');
  expect((await selected(page)).document).toEqual(before.document);
  await reports(page).screenshot({ path: test.info().outputPath('phone-quantity-report.png') });
});
