import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseRegistry, serializeRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import { createRegistry, insertDraft, renameRoom, addRoom, type PhysicalDraft } from '../../client/src/features/physical-draft/state';
import { addLevel, renameLevel, selectLevel } from '../../client/src/features/physical-draft/levelCommands';
import { addOpening } from '../../client/src/features/physical-draft/openingCommands';
import { editStairField, commitStairField, createRoomLocalPlacement, setLandingPlacement, type StairFieldTarget } from '../../client/src/features/physical-draft/stairCommands';
import { basicPhysicalSaveDraft, richPhysicalSaveDraft, PHYSICAL_SAVE_TEST_AT as AT } from '../fixtures/physicalSave';

const ft = 304.8;
const reports = (page: Page) => page.getByRole('region', { name: 'Quantity reports', exact: true });
const inspector = (page: Page) => page.getByTestId('physical-room-inspector');
const frame = (page: Page) => page.locator('iframe[title="Captured quantity report"]');
const preview = (page: Page) => page.frameLocator('iframe[title="Captured quantity report"]');
const graphic = (page: Page, kind: string, id: string) => preview(page).locator('svg [data-kind="' + kind + '"][data-entity-id="' + id + '"]');
async function commit(input: Locator, text: string) { await input.fill(text); await input.press('Enter'); await input.press('Tab'); }
async function selected(page: Page): Promise<PhysicalDraft> {
  await expect.poll(async () => parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY)).status).toBe('recovered');
  const parsed = parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY));
  if (parsed.status !== 'recovered') throw Error('Expected validated synthetic physical recovery');
  return parsed.registry.drafts.find(draft => draft.id === parsed.registry.selectedDraftId)!;
}

// Only synthetic fixtures are seeded into new Playwright contexts. Capturing,
// editing and delivering every report below uses the actual compiled UI.
function simpleDraft() {
  let draft = renameRoom(basicPhysicalSaveDraft(), 'room', 'Export living room');
  draft = addOpening(draft, 'entry-door', 'door', 'room:top', 3 * ft, AT, { widthMm: 3 * ft,
    appearance: { style: 'single', swingDirection: 'inward', swingSide: 'right', metadata: {} } });
  draft.document.rooms[0].presentation = { xMm: -2 * ft, yMm: 4 * ft };
  return draft;
}
function buildingDraft(longNames = false) {
  let draft = richPhysicalSaveDraft();
  draft = renameLevel(draft, 'lower-level', 'Ground floor');
  draft = renameLevel(draft, 'upper-level', 'Upper floor');
  draft = renameRoom(draft, 'lower-room', longNames ? 'LivingRoom_' + 'VeryLongRoomName'.repeat(16) + '_Sala_客厅' : 'Ground living room');
  draft = renameRoom(draft, 'upper-room', 'Upper kitchen');
  if (longNames) draft.document.name = 'Project_' + 'UnbrokenProjectName'.repeat(15) + '_Casa_房屋';
  // Room presentation is explicit synthetic layout data, not a inferred level or
  // an upgrade to owner data. Each level intentionally occupies the same XY.
  for (const room of draft.document.rooms) room.presentation = { xMm: -ft, yMm: 2 * ft };
  const set = (target: StairFieldTarget, text: string) => {
    draft = commitStairField(editStairField(draft, target, text), target, AT);
  };
  set({ kind: 'stair', id: 'stair', field: 'width' }, '3 ft');
  set({ kind: 'stair', id: 'stair', field: 'run' }, '6 ft');
  for (const role of ['lower', 'upper'] as const) {
    set({ kind: 'landing', id: 'stair', role, field: 'width' }, '3 ft');
    set({ kind: 'landing', id: 'stair', role, field: 'depth' }, '3 ft');
    draft = setLandingPlacement(draft, 'stair', role, createRoomLocalPlacement(7 * ft, ft), AT);
  }
  draft = addLevel(draft, 'empty-level', 'Future level');
  return selectLevel(draft, 'lower-level');
}
async function load(page: Page, draft: PhysicalDraft) {
  const bytes = serializeRegistry(insertDraft(createRegistry(), draft));
  expect(parseRegistry(bytes).status).toBe('recovered');
  await page.addInitScript(({ key, value }) => {
    if (window === window.top) sessionStorage.setItem(key, value);
  }, { key: KEY, value: bytes });
  await page.goto('/physical-draft');
  await expect(reports(page)).toBeVisible();
  expect((await selected(page)).document).toEqual(draft.document);
  return draft;
}
async function chooseDrawing(page: Page) {
  await reports(page).getByRole('combobox', { name: 'Report contents', exact: true }).selectOption('plan');
}
async function prepare(page: Page) {
  await reports(page).getByRole('button', { name: 'Prepare report', exact: true }).click();
  await expect(preview(page).getByRole('heading', { name: 'Selected quantities', exact: true })).toBeVisible();
  await expect(reports(page).getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeEnabled();
}
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [], cells: string[] = [];
  let value = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (index === 0 && char === '\uFEFF') continue;
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { cells.push(value); value = ''; }
    else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      cells.push(value); rows.push([...cells]); cells.length = 0; value = '';
    } else value += char;
  }
  if (cells.length || value) { cells.push(value); rows.push([...cells]); }
  const columns = rows.shift()!;
  return rows.map(row => Object.fromEntries(columns.map((column, index) => [column, row[index] ?? ''])));
}
async function download(page: Page) {
  const event = page.waitForEvent('download');
  await reports(page).getByRole('button', { name: 'Download quantity CSV', exact: true }).click();
  const artifact = await event;
  expect(artifact.suggestedFilename()).toBe('modern-floor-planner-quantities.csv');
  const path = await artifact.path(); expect(path).not.toBeNull();
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

test('drawing export is opt-in and captures the same immutable room, door and quantity revision', async ({ page }) => {
  const before = await load(page, simpleDraft());
  await prepare(page);
  await expect(preview(page).locator('.plan-sheet')).toHaveCount(0);
  await chooseDrawing(page); await prepare(page);
  await expect(preview(page).locator('.plan-sheet')).toHaveCount(1);
  await expect(preview(page).locator('.plan-sheet')).toHaveAttribute('data-layout', 'historical');
  await expect(graphic(page, 'room', 'room')).toBeVisible();
  await expect(graphic(page, 'door', 'entry-door')).toBeVisible();
  const shape = graphic(page, 'room', 'room').locator('rect').first();
  expect(Number(await shape.getAttribute('width')) / Number(await shape.getAttribute('height'))).toBeCloseTo(12 / 10, 4);
  const capturedDoor = await graphic(page, 'door', 'entry-door').evaluate(node => node.outerHTML);
  await expect(preview(page).locator('body')).toContainText('Schematic only — not a certified scale drawing.');
  const captured = await frame(page).getAttribute('srcdoc');
  const first = await download(page);
  for (const [output, amount] of [['floor-area', '120'], ['ceiling-area', '120'], ['gross-wall-area', '352']])
    expect(total(first.rows, output)).toMatchObject({ net: amount, unit: 'ft2', completeness: 'complete' });
  await expect(preview(page).locator('body')).toContainText(meta(first.rows, 'Snapshot ID'));
  await expect(preview(page).locator('body')).toContainText(meta(first.rows, 'Capture fingerprint'));
  expect((await selected(page)).document).toEqual(before.document);
  expect((await selected(page)).events).toEqual(before.events);

  await page.getByRole('button', { name: 'Export living room', exact: true }).click();
  await commit(inspector(page).getByLabel('Room name', { exact: true }), 'Updated living room');
  await commit(inspector(page).getByLabel('Length (ft)', { exact: true }), '14 ft');
  await page.getByTestId('physical-opening-list-entry-door').click();
  const opening = page.getByTestId('physical-opening-inspector');
  await opening.getByLabel('Hand', { exact: true }).selectOption('right');
  await commit(opening.getByLabel('Door width', { exact: true }), '4 ft');
  await expect(reports(page)).toContainText('Your draft has newer edits.');
  expect(await frame(page).getAttribute('srcdoc')).toBe(captured);
  expect((await download(page)).text).toBe(first.text);
  await expect(preview(page).locator('.plan-sheet')).toContainText('Export living room');
  await expect(preview(page).locator('.plan-sheet')).not.toContainText('Updated living room');

  await prepare(page);
  const changed = await download(page);
  expect(total(changed.rows, 'floor-area').net).toBe('140');
  expect(total(changed.rows, 'gross-wall-area').net).toBe('384');
  expect(meta(changed.rows, 'Snapshot ID')).not.toBe(meta(first.rows, 'Snapshot ID'));
  await expect(preview(page).locator('.plan-sheet')).toContainText('Updated living room');
  expect(await frame(page).getAttribute('srcdoc')).not.toBe(captured);
  expect(Number(await shape.getAttribute('width')) / Number(await shape.getAttribute('height'))).toBeCloseTo(14 / 10, 4);
  expect(await graphic(page, 'door', 'entry-door').evaluate(node => node.outerHTML)).not.toBe(capturedDoor);
  expect((await selected(page)).document.openings[0].appearance?.swingSide).not.toBe(before.document.openings[0].appearance?.swingSide);
  expect((await selected(page)).document.openings[0].width).toMatchObject({ state: 'known', valueMm: 4 * ft });
  await reports(page).screenshot({ path: test.info().outputPath('drawing-report-captured.png') });
});

test('unapplied room text cannot create a drawing from an older committed dimension', async ({ page }) => {
  await load(page, simpleDraft()); await chooseDrawing(page);
  await page.getByRole('button', { name: 'Export living room', exact: true }).click();
  const input = inspector(page).getByLabel('Length (ft)', { exact: true });
  await input.fill('14 ft -');
  const pending = await selected(page);
  await reports(page).getByRole('button', { name: 'Prepare report', exact: true }).click();
  await expect(reports(page).getByRole('status')).toContainText('Apply or Revert unfinished fields');
  await expect(input).toHaveValue('14 ft -'); await expect(frame(page)).toHaveCount(0);
  expect(await selected(page)).toEqual(pending);
});

test('schema5 levels keep linked stairs, landings, openings, zones and cabinets on their own sheets', async ({ page }) => {
  const before = await load(page, buildingDraft()); await chooseDrawing(page); await prepare(page);
  const sheets = preview(page).locator('.plan-sheet');
  await expect(sheets).toHaveCount(3);
  const ground = sheets.filter({ has: preview(page).getByRole('heading', { name: 'Schematic plan — Ground floor', exact: true }) });
  const upper = sheets.filter({ has: preview(page).getByRole('heading', { name: 'Schematic plan — Upper floor', exact: true }) });
  const empty = sheets.filter({ has: preview(page).getByRole('heading', { name: 'Schematic plan — Future level', exact: true }) });
  await expect(ground).toHaveAttribute('data-level-id', 'lower-level');
  await expect(upper).toHaveAttribute('data-level-id', 'upper-level');
  await expect(ground.getByRole('img', { name: 'Schematic plan — Ground floor', exact: true })).toBeVisible();
  await expect(upper.getByRole('img', { name: 'Schematic plan — Upper floor', exact: true })).toBeVisible();
  for (const [sheet, present, absent] of [[ground, 'lower-room', 'upper-room'], [upper, 'upper-room', 'lower-room']] as const) {
    await expect(sheet.locator('svg [data-kind="room"][data-entity-id="' + present + '"]')).toHaveCount(1);
    await expect(sheet.locator('svg [data-kind="room"][data-entity-id="' + absent + '"]')).toHaveCount(0);
    await expect(sheet.locator('svg [data-kind="stair"][data-entity-id="stair"]')).toHaveCount(1);
    await expect(sheet.locator('svg [data-kind="landing"]')).toHaveCount(1);
  }
  await expect(ground.locator('svg [data-kind="door"][data-entity-id="door"]')).toHaveCount(1);
  for (const [kind, id] of [['window', 'window'], ['surface-opening', 'hole'], ['zone', 'zone'], ['fixed-object', 'cabinet']])
    await expect(upper.locator('svg [data-kind="' + kind + '"][data-entity-id="' + id + '"]')).toHaveCount(1);
  await expect(ground.locator('svg [data-kind="zone"],svg [data-kind="fixed-object"],svg [data-kind="surface-opening"]')).toHaveCount(0);
  await expect(empty).toContainText('No rooms captured on this level.');
  await expect(empty.locator('svg [data-kind="room"]')).toHaveCount(0);
  const { rows } = await download(page);
  expect(total(rows, 'floor-area')).toMatchObject({ gross: '270', net: '252', allowance: '25.2', adjusted: '277.2' });
  expect(total(rows, 'ceiling-area').net).toBe('270');
  expect(total(rows, 'gross-wall-area').net).toBe('752');
  expect(await selected(page)).toEqual(before);
  await ground.screenshot({ path: test.info().outputPath('drawing-report-ground-floor.png') });
  await upper.screenshot({ path: test.info().outputPath('drawing-report-upper-floor.png') });
});

test('unplaced and incomplete rooms are named explicitly without inventing layout or dimensions', async ({ page }) => {
  let draft = basicPhysicalSaveDraft();
  draft = renameRoom(draft, 'room', 'Measured but unplaced');
  draft = addRoom(draft, 'unknown-room', 'Unmeasured room');
  const before = await load(page, draft); await chooseDrawing(page); await prepare(page);
  const sheet = preview(page).locator('.plan-sheet');
  await expect(sheet).toContainText('Measured but unplaced');
  await expect(sheet).toContainText('Unmeasured room');
  await expect(sheet).toContainText('Not drawn:');
  await expect(sheet.locator('svg [data-kind="room"]')).toHaveCount(0);
  expect((await selected(page)).document).toEqual(before.document);
  expect((await selected(page)).document.rooms.every(room => !room.presentation)).toBe(true);
  await sheet.screenshot({ path: test.info().outputPath('drawing-report-unplaced.png') });
});

test('long names and separate level drawings stay inside the phone preview without altering the captured draft', async ({ page }) => {
  const before = await load(page, buildingDraft(true)); await chooseDrawing(page); await prepare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await reports(page).scrollIntoViewIfNeeded();
  await expect(reports(page).getByRole('button', { name: 'Print / Save PDF', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await preview(page).locator('body').evaluate(node => node.ownerDocument.documentElement.scrollWidth <= node.ownerDocument.defaultView!.innerWidth + 1)).toBe(true);
  for (const svg of await preview(page).locator('.plan-sheet svg').all()) {
    const box = await svg.boundingBox(); expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(100); expect(box!.width).toBeLessThan(391);
  }
  await expect(preview(page).locator('.plan-sheet').first()).toContainText(before.document.rooms[0].name);
  expect((await selected(page)).document).toEqual(before.document);
  await reports(page).screenshot({ path: test.info().outputPath('drawing-report-phone.png') });
});

test('print targets the frozen drawing report and self-contained multi-level HTML generates an actual PDF', async ({ page, context }) => {
  const before = await load(page, buildingDraft(true)); await chooseDrawing(page); await prepare(page);
  const html = await frame(page).getAttribute('srcdoc'); expect(html).not.toBeNull();
  await frame(page).evaluate(node => {
    const target = (node as HTMLIFrameElement).contentWindow! as Window & { exportPrintCount?: number };
    target.exportPrintCount = 0; target.print = () => { target.exportPrintCount!++; };
  });
  await reports(page).getByRole('button', { name: 'Print / Save PDF', exact: true }).click();
  await expect.poll(() => frame(page).evaluate(node => ((node as HTMLIFrameElement).contentWindow as Window & { exportPrintCount?: number }).exportPrintCount)).toBe(1);
  const printed = await context.newPage(), printErrors: string[] = [], remoteRequests: string[] = [];
  printed.on('pageerror', error => printErrors.push(error.message));
  printed.on('request', request => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()); });
  try {
    await printed.setContent(html!, { waitUntil: 'load' }); await printed.emulateMedia({ media: 'print' });
    await expect(printed.locator('.plan-sheet')).toHaveCount(3);
    await expect(printed.getByRole('heading', { name: 'Selected quantities', exact: true })).toBeVisible();
    await expect(printed.locator('script')).toHaveCount(0);
    await expect(printed.locator('body')).toContainText('Schematic only — not a certified scale drawing.');
    await expect(printed.locator('body')).toContainText('not a complete construction materials list');
    const pdf = await printed.pdf({ path: test.info().outputPath('drawing-and-quantities-multilevel.pdf'), format: 'A4', printBackground: true });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-'); expect(pdf.length).toBeGreaterThan(10_000);
    expect(printErrors).toEqual([]); expect(remoteRequests).toEqual([]);
    expect((await selected(page)).document).toEqual(before.document);
  } finally { await printed.close(); }
});
