import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseRegistry, serializeRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import { adoptPhysicalDraft, createRegistry, insertDraft, type PhysicalDraft } from '../../client/src/features/physical-draft/state';
import { evaluateQuantities, createQuantitySnapshot, verifyQuantitySnapshot } from '../../shared/quantities/snapshot';
import { q001, room as fixtureRoom, measured, AT } from '../fixtures/physical';
import { openResponsiveInspector, closeResponsiveInspector } from './physical-inspector-helpers';

const QUICK_KEY = 'modern-floor-planner:quick-rooms:v1';
const OLD_KEY = 'modern-floor-planner:editor-draft:v1';
const rooms = (p: Page) => p.getByTestId('physical-room-inspector');
const openings = (p: Page) => p.getByTestId('physical-opening-inspector');
const field = (p: Page, name: string) => rooms(p).getByLabel(new RegExp('^' + name + ' \\((ft|m)\\)$'));
const editing = (p: Page) => p.getByRole('combobox', { name: 'Editing level', exact: true });
const history = (p: Page) => p.getByRole('group', { name: 'Committed edit history', exact: true, includeHidden: true });
const undo = (p: Page) => history(p).getByRole('button', { name: /^Undo(?: |$)/, includeHidden: true });
const redo = (p: Page) => history(p).getByRole('button', { name: /^Redo(?: |$)/, includeHidden: true });
const takeoff = (p: Page) => p.getByTestId('takeoff-panel');
const card = (p: Page, output: string) => p.getByTestId('takeoff-output-' + output);
const drawing = (p: Page) => p.getByRole('region', { name: 'Physical drawing', exact: true });
const frames = (p: Page) => p.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
const OUTPUTS = { 'floor-area': 'Floor area', 'ceiling-area': 'Flat ceiling area', 'gross-wall-area': 'Gross wall area' };

async function registry(p: Page) {
  await expect.poll(async () => parseRegistry(await p.evaluate(k => sessionStorage.getItem(k), KEY)).status).toBe('recovered');
  const parsed = parseRegistry(await p.evaluate(k => sessionStorage.getItem(k), KEY));
  if (parsed.status !== 'recovered') throw new Error('Expected supported, validated recovery');
  return parsed.registry;
}
async function selected(p: Page) {
  const value = await registry(p), draft = value.drafts.find(d => d.id === value.selectedDraftId);
  if (!draft) throw new Error('Expected selected physical draft');
  return draft;
}
function levels(d: PhysicalDraft) {
  if (d.document.schemaVersion !== 3) throw new Error('Expected explicit level-enabled document');
  return d.document.buildingLevels;
}
function durable(d: PhysicalDraft) {
  const { localEditRevision, levelView, ...content } = d;
  return content;
}
function geometry(d: PhysicalDraft) { return { rooms: d.document.rooms, openings: d.document.openings, groups: d.document.editorContract }; }
async function historyState(p: Page) {
  return { undo: await undo(p).getAttribute('aria-label'), redo: await redo(p).getAttribute('aria-label'),
    undoDisabled: await undo(p).isDisabled(), redoDisabled: await redo(p).isDisabled() };
}
async function commit(input: Locator, text: string) { await input.fill(text); await input.press('Enter'); await input.press('Tab'); }
async function switchLevel(p: Page, id: string) {
  await closeResponsiveInspector(p); await editing(p).selectOption(id);
  await expect(p.getByTestId('physical-view')).toHaveAttribute('data-active-level-id', id);
}
async function quick(p: Page) { await closeResponsiveInspector(p); await p.getByRole('tab', { name: 'Quick Rooms', exact: true }).click(); }
async function showDrawing(p: Page) {
  await closeResponsiveInspector(p); await p.getByRole('tab', { name: 'Drawing', exact: true }).click();
  await drawing(p).getByRole('button', { name: 'Fit drawing', exact: true }).click(); await frames(p);
}
async function camera(p: Page, roomId: string) {
  return p.getByTestId('physical-room-' + roomId).evaluate(node => {
    const viewport = document.querySelector('[data-testid="physical-canvas"]')!.getBoundingClientRect();
    const room = node.getBoundingClientRect();
    return { x: room.x - viewport.x, y: room.y - viewport.y, width: room.width, height: room.height };
  });
}
async function renameLevel(p: Page, name: string) {
  await p.getByLabel('Level name', { exact: true }).fill(name);
  await p.getByRole('button', { name: 'Rename level', exact: true }).click();
}
async function addLevel(p: Page, name: string) {
  await closeResponsiveInspector(p); await p.getByRole('button', { name: 'Add level', exact: true }).click();
  await renameLevel(p, name); return (await selected(p)).levelView!.activeLevelId;
}
async function addRoom(p: Page, name: string, length: string, width: string, height: string) {
  await quick(p); await p.getByRole('button', { name: 'Add room', exact: true }).click();
  await rooms(p).getByLabel('Room name', { exact: true }).fill(name);
  for (const [label, text] of [['Length', length], ['Width', width], ['Ceiling height', height]]) await commit(field(p, label), text);
  await rooms(p).getByLabel('Ceiling model', { exact: true }).selectOption('flat');
  await rooms(p).getByLabel('Wall model', { exact: true }).selectOption('vertical-uniform');
  return (await selected(p)).document.rooms.at(-1)!;
}
async function addOpening(p: Page, kind: 'door' | 'window') {
  await p.getByRole('button', { name: 'Create ' + kind, exact: true }).click(); await openResponsiveInspector(p);
  const label = kind === 'door' ? 'Door' : 'Window';
  for (const [name, text] of [['Position from wall start', kind === 'door' ? '2.5 ft' : '8 ft'],
    [label + ' width', kind === 'door' ? '3 ft' : '4 ft'], [label + ' height', kind === 'door' ? '7 ft' : '3 ft'],
    ['Sill height', kind === 'door' ? '0' : '3 ft']]) await commit(openings(p).getByLabel(name, { exact: true }), text);
  await openings(p).getByLabel('Measurement basis', { exact: true }).selectOption('finished');
  const value = (await selected(p)).document.openings.at(-1)!; await closeResponsiveInspector(p); return value;
}
async function upgrade(p: Page) {
  const before = await selected(p);
  await p.getByRole('button', { name: 'Upgrade to building levels', exact: true }).click();
  await expect(editing(p)).toBeVisible(); const after = await selected(p);
  expect(after.id).not.toBe(before.id); expect(after.document.schemaVersion).toBe(3);
  expect((await registry(p)).drafts.find(d => d.id === before.id)).toEqual(before);
  return after;
}
async function chooseScope(p: Page, scope: 'level' | 'all') {
  for (const [output, label] of Object.entries(OUTPUTS)) {
    await takeoff(p).getByRole('checkbox', { name: 'Measure ' + label, exact: true }).check();
    await takeoff(p).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption(output);
    await takeoff(p).getByRole('button', { name: scope === 'level' ? 'Current level’s current targets' : 'All levels’ current targets', exact: true }).click();
  }
}
async function totals(p: Page, floor: number, walls: number) {
  for (const [output, value] of [['floor-area', floor], ['ceiling-area', floor], ['gross-wall-area', walls]] as const)
    await expect(card(p, output).getByTestId('takeoff-total').locator('[data-amount="net"]')).toHaveText(value.toFixed(2) + ' sq ft');
}
// Public UI is the only writer for the main multi-level fixture. Storage below
// is read and validated, never used to inject the expected main journey state.
async function fixture(p: Page) {
  await p.setViewportSize({ width: 1600, height: 1000 }); await p.goto('/physical-draft');
  await p.getByRole('button', { name: 'New building draft', exact: true }).click();
  await expect(editing(p)).toBeVisible();
  const basement = (await selected(p)).levelView!.activeLevelId; await renameLevel(p, 'Basement');
  const alpha = await addRoom(p, 'Shared bedroom', '12 ft', '10 ft', '8 ft'); const door = await addOpening(p, 'door');
  const main = await addLevel(p, 'Main floor');
  const beta = await addRoom(p, 'Shared bedroom', '15 ft', '10 ft', '9 ft'); const window = await addOpening(p, 'window');
  const upper = await addLevel(p, 'Upper floor'); await chooseScope(p, 'all');
  await switchLevel(p, basement); return { basement, main, upper, alpha, beta, door, window };
}
async function assign(p: Page, roomId: string, levelId: string) {
  await quick(p); await expect(rooms(p)).toHaveAttribute('data-room-id', roomId);
  await rooms(p).getByRole('combobox', { name: 'Room level', exact: true }).selectOption(levelId);
  await rooms(p).getByRole('button', { name: 'Assign room', exact: true }).click();
}
async function parity(browser: Browser, draft: PhysicalDraft) {
  const node = await evaluateQuantities(draft.document, draft.request); expect(node.ok).toBe(true);
  if (!node.ok) throw new Error(JSON.stringify(node.errors));
  const context = await browser.newContext(), page = await context.newPage();
  try {
    await page.goto('http://127.0.0.1:4174/'); await expect(page.getByText('Shared quantity engine ready')).toBeVisible();
    const actual = await page.evaluate(({ document, request }) => (window as any).mfpParity.evaluate(document, request),
      { document: draft.document, request: draft.request });
    expect(actual.ok).toBe(true); expect(actual.evaluation.calculation).toEqual(node.evaluation.calculation);
    expect(actual.evaluation.fingerprints).toEqual(node.evaluation.fingerprints); return node.evaluation;
  } finally { await context.close(); }
}
// Advanced fixtures use the existing supported physical importer and validator
// for groups/shared openings and recorded coordinates absent from public tools.
async function seedAdvanced(p: Page, relationship: 'none' | 'group' | 'shared') {
  const source = q001(); source.rooms.push(fixtureRoom('other-room'));
  for (const r of source.rooms) r.presentation = { xMm: 0 as any, yMm: 0 as any };
  source.rooms[1].length = measured('15 ft'); source.rooms[1].ceilingHeight = measured('9 ft');
  source.openings[0].appearance = { style: 'single', swingDirection: 'inward', swingSide: 'left', metadata: {} };
  source.openings[1].attachments[0].wallFaceId = 'other-room:top';
  if (relationship === 'shared') source.openings[0].attachments.push({ wallFaceId: 'other-room:bottom', anchor: 'center', offsetMm: 762 as any });
  if (relationship === 'group') source.editorContract = { version: 'sketch-editor-v1', groups: [{ id: 'preserved-group', roomIds: source.rooms.map(r => r.id) }] };
  const draft = adoptPhysicalDraft(source, 'advanced-' + relationship);
  const raw = serializeRegistry(insertDraft(createRegistry(), draft)); expect(parseRegistry(raw).status).toBe('recovered');
  await p.goto('/physical-draft'); await p.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), { key: KEY, raw }); await p.reload();
  await upgrade(p); return { source, draft };
}

const errors = new WeakMap<Page, string[]>(), writes = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => { errors.set(page, []); writes.set(page, []);
  page.on('pageerror', e => errors.get(page)!.push(e.message));
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.get(page)!.push(r.method() + ' ' + r.url()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); expect(writes.get(page)).toEqual([]); });

test('UI-built levels filter the same draft and show independent complete level and project quantities', async ({ page }) => {
  test.setTimeout(75_000); const f = await fixture(page), initial = await selected(page); await totals(page, 270, 802);
  expect(levels(initial).levels).toHaveLength(3); expect(Object.keys(levels(initial).roomLevels).sort()).toEqual([f.alpha.id, f.beta.id].sort());
  for (const l of levels(initial).levels) expect(l.finishedFloorElevation).toMatchObject({ state: 'unknown', valueMm: null, reference: null });
  for (const [level, visible, hidden, opening, absent, area, wallArea, screenshot] of [
    [f.basement, f.alpha, f.beta, f.door, f.window, 120, 352, 'basement'], [f.main, f.beta, f.alpha, f.window, f.door, 150, 450, 'main-floor'],
  ] as const) {
    await switchLevel(page, level); await quick(page); await expect(rooms(page)).toHaveAttribute('data-room-id', visible.id);
    await expect(page.getByTestId('physical-opening-list-' + opening.id)).toBeVisible();
    await expect(page.getByTestId('physical-opening-list-' + absent.id)).toHaveCount(0);
    await showDrawing(page); await expect(page.getByTestId('physical-room-' + visible.id)).toHaveAttribute('data-level-id', level);
    await expect(page.getByTestId('physical-room-' + hidden.id)).toHaveCount(0); await expect(page.getByTestId('physical-opening-' + absent.id)).toHaveCount(0);
    expect((await selected(page)).id).toBe(initial.id); expect((await selected(page)).request).toEqual(initial.request); await totals(page, 270, 802);
    await chooseScope(page, 'level'); await totals(page, area, wallArea); await chooseScope(page, 'all');
    await page.screenshot({ path: test.info().outputPath('levels-desktop-' + screenshot + '.png'), fullPage: true });
  }
  await switchLevel(page, f.basement); await showDrawing(page);
  await page.getByTestId('physical-opening-list-' + f.door.id).click();
  await drawing(page).getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByTestId('physical-canvas').hover(); await page.mouse.wheel(25, 45); await frames(page);
  const basementCamera = await camera(page, f.alpha.id), beforeCamera = await selected(page);
  await switchLevel(page, f.main); await showDrawing(page);
  await page.getByTestId('physical-opening-list-' + f.window.id).click();
  await drawing(page).getByRole('button', { name: 'Zoom out', exact: true }).click(); await frames(page);
  await switchLevel(page, f.basement);
  await expect(page.getByTestId('physical-opening-' + f.door.id)).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => {
    const restored = await camera(page, f.alpha.id);
    return Math.max(...Object.keys(restored).map(key => Math.abs(restored[key as keyof typeof restored] - basementCamera[key as keyof typeof restored])));
  }).toBeLessThanOrEqual(2);
  expect(durable(await selected(page))).toEqual(durable(beforeCamera));
  await switchLevel(page, f.upper); await expect(page.getByTestId('physical-room-' + f.alpha.id)).toHaveCount(0);
  await expect(page.getByTestId('physical-room-' + f.beta.id)).toHaveCount(0); await expect(page.getByText(/Add a room, then enter/)).toBeVisible();
  await totals(page, 270, 802); expect(geometry(await selected(page))).toEqual(geometry(initial));
});

test('explicit target IDs survive level switches and new room creation without live-filter expansion or repeated waste', async ({ page }) => {
  test.setTimeout(60_000); const f = await fixture(page); await chooseScope(page, 'level'); await totals(page, 120, 352);
  const selectedScope = (await selected(page)).request; await switchLevel(page, f.main); await totals(page, 120, 352);
  expect((await selected(page)).request).toEqual(selectedScope);
  const beforeLocate = await selected(page);
  await card(page, 'floor-area').getByText('Show breakdown', { exact: true }).click();
  const row = card(page, 'floor-area').locator('[data-target-id*="' + f.alpha.id + '"]');
  await row.getByRole('button', { name: 'Locate source', exact: true }).click();
  await expect(editing(page)).toHaveValue(f.basement);
  await expect(page.getByTestId('physical-source-room-' + f.alpha.id)).toBeVisible();
  expect((await selected(page)).request).toEqual(selectedScope);
  expect(geometry(await selected(page))).toEqual(geometry(beforeLocate));
  await takeoff(page).getByRole('button', { name: 'Review inputs', exact: true }).click();
  await page.getByRole('combobox', { name: 'Review target', exact: true }).selectOption('room:' + f.beta.id);
  await page.getByRole('button', { name: 'Edit in inspector', exact: true }).click();
  await expect(editing(page)).toHaveValue(f.main);
  await expect(rooms(page)).toHaveAttribute('data-room-id', f.beta.id);
  expect((await selected(page)).request).toEqual(selectedScope);
  await switchLevel(page, f.basement); const extra = await addRoom(page, 'Later room', '6 ft', '5 ft', '8 ft');
  expect(levels(await selected(page)).roomLevels[extra.id]).toBe(f.basement);
  expect((await selected(page)).request).toEqual(selectedScope); await totals(page, 120, 352);
  await chooseScope(page, 'all'); await totals(page, 300, 978);
  await takeoff(page).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption('floor-area');
  await commit(takeoff(page).getByLabel('Waste percentage', { exact: true }), '10');
  const before = await selected(page);
  for (const level of [f.main, f.upper, f.basement]) {
    await switchLevel(page, level); expect((await selected(page)).request).toEqual(before.request);
    await expect(card(page, 'floor-area').getByTestId('takeoff-total').locator('[data-amount="adjusted"]')).toHaveText('330.00 sq ft');
  }
  await expect(takeoff(page)).toContainText('Basement'); await expect(takeoff(page)).toContainText('Main floor');
});

test('renaming ordering and assignment have chronological level-aware Undo without changing geometry or elevations', async ({ page }) => {
  test.setTimeout(70_000); const f = await fixture(page), original = await selected(page);
  await page.getByLabel('Level name', { exact: true }).fill('Basement name pending');
  const beforeNameSwitch = await selected(page), nameHistory = await historyState(page);
  await switchLevel(page, f.upper); await switchLevel(page, f.basement);
  await expect(page.getByLabel('Level name', { exact: true })).toHaveValue('Basement name pending');
  expect((await selected(page)).document).toEqual(beforeNameSwitch.document);
  expect(await historyState(page)).toEqual(nameHistory);
  await page.getByLabel('Level name', { exact: true }).fill('Basement');
  await switchLevel(page, f.main); await renameLevel(page, 'Ground floor');
  await page.getByRole('button', { name: 'Move level up', exact: true }).click();
  const reordered = await selected(page); expect(geometry(reordered)).toEqual(geometry(original));
  expect(levels(reordered).levels.map(l => [l.id, l.finishedFloorElevation]).sort()).toEqual(levels(original).levels.map(l => [l.id, l.finishedFloorElevation]).sort());
  await undo(page).click(); await redo(page).click(); await totals(page, 270, 802);
  await switchLevel(page, f.basement); await assign(page, f.alpha.id, f.main);
  const assigned = await selected(page); expect(levels(assigned).roomLevels[f.alpha.id]).toBe(f.main);
  await expect(rooms(page)).toHaveAttribute('data-room-id', f.alpha.id);
  expect(geometry(assigned)).toEqual(geometry(original)); expect(assigned.request).toEqual(original.request); await totals(page, 270, 802);
  await expect(undo(page)).toHaveAccessibleName(/Basement|Ground floor/);
  await switchLevel(page, f.upper); const beforeView = await historyState(page);
  await switchLevel(page, f.main); expect(await historyState(page)).toEqual(beforeView);
  await undo(page).click(); expect(levels(await selected(page)).roomLevels[f.alpha.id]).toBe(f.basement);
  await expect(editing(page)).toHaveValue(f.basement); await expect(rooms(page)).toHaveAttribute('data-room-id', f.alpha.id);
  await redo(page).click(); expect(levels(await selected(page)).roomLevels[f.alpha.id]).toBe(f.main); await expect(editing(page)).toHaveValue(f.main);
  expect(geometry(await selected(page))).toEqual(geometry(original)); await totals(page, 270, 802);
});

test('pending fields units evidence and Redo survive levels responsive inspectors Revert and recovery', async ({ page }) => {
  test.setTimeout(75_000); const f = await fixture(page); await quick(page);
  await commit(field(page, 'Ceiling height'), '9 ft'); await undo(page).click();
  await field(page, 'Ceiling height').fill('8 ft -');
  await page.getByTestId('physical-opening-list-' + f.door.id).click(); await openResponsiveInspector(page);
  await openings(page).getByLabel('Door width', { exact: true }).fill('3 ft -');
  await page.getByRole('button', { name: 'Meters', exact: true }).click();
  await takeoff(page).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption('floor-area');
  await takeoff(page).getByLabel('Waste percentage', { exact: true }).fill('10.');
  const pending = await selected(page), controls = await historyState(page);
  await switchLevel(page, f.main); await quick(page);
  await page.getByRole('button', { name: 'Shared bedroom', exact: true }).click();
  await showDrawing(page); await page.getByTestId('physical-canvas').click({ position: { x: 10, y: 10 } });
  await page.keyboard.press('Delete'); expect(durable(await selected(page))).toEqual(durable(pending));
  await switchLevel(page, f.basement); expect(durable(await selected(page))).toEqual(durable(pending)); expect(await historyState(page)).toEqual(controls);
  await page.setViewportSize({ width: 390, height: 844 }); await page.getByTestId('physical-opening-list-' + f.door.id).click(); await openResponsiveInspector(page);
  await expect(openings(page).getByLabel('Door width', { exact: true })).toHaveValue('3 ft -');
  await openings(page).getByLabel('Door width', { exact: true }).focus();
  await page.screenshot({ path: test.info().outputPath('levels-phone-pending-drawer.png') });
  await openings(page).getByRole('button', { name: 'Revert door width', exact: true }).click();
  const reverted = await selected(page); expect(reverted.document).toEqual(pending.document);
  expect(reverted.fields).toEqual(pending.fields); expect(reverted.takeoffState).toEqual(pending.takeoffState);
  expect(reverted.events).toEqual(pending.events); expect(reverted.openingEvents).toEqual(pending.openingEvents);
  await closeResponsiveInspector(page);
  await page.getByLabel('Level name', { exact: true }).fill('Basement name unfinished');
  const beforeReload = await selected(page); await page.reload();
  expect(await selected(page)).toEqual(beforeReload); await expect(editing(page)).toHaveValue(f.basement);
  await expect(page.getByLabel('Level name', { exact: true })).toHaveValue('Basement name unfinished');
  await expect(undo(page)).toBeDisabled(); await expect(redo(page)).toBeDisabled(); await quick(page);
  await expect(field(page, 'Ceiling height')).toHaveValue('8 ft -');
});

test('coincident plan positions stay level-local and a held opening gesture cannot survive a level switch', async ({ page }) => {
  test.setTimeout(60_000); await seedAdvanced(page, 'none');
  const initial = await selected(page), base = initial.levelView!.activeLevelId; await renameLevel(page, 'Basement');
  const main = await addLevel(page, 'Main floor'); await switchLevel(page, base); await quick(page);
  await page.getByRole('button', { name: 'other-room', exact: true }).click(); await assign(page, 'other-room', main);
  await switchLevel(page, base); await showDrawing(page); await expect(page.getByTestId('physical-room-other-room')).toHaveCount(0);
  await expect(page.getByTestId('physical-opening-window')).toHaveCount(0);
  await page.getByTestId('physical-opening-list-door').click(); await page.getByTestId('physical-canvas').scrollIntoViewIfNeeded(); await frames(page);
  const before = await selected(page), hit = (await page.getByTestId('physical-opening-door').first().boundingBox())!;
  await page.mouse.move(hit.x + hit.width / 2, hit.y + hit.height / 2); await page.mouse.down();
  await editing(page).selectOption(main); await expect(page.getByTestId('physical-view')).toHaveAttribute('data-active-level-id', main);
  await page.mouse.move(hit.x + 50, hit.y + 60); await page.mouse.up();
  expect(geometry(await selected(page))).toEqual(geometry(before)); await expect(page.getByTestId('physical-opening-door')).toHaveCount(0);
  await expect(page.getByTestId('physical-room-room-1')).toHaveCount(0); await expect(page.getByTestId('physical-room-other-room')).toBeVisible();
  await showDrawing(page); await page.getByTestId('physical-opening-list-window').click();
  await page.getByTestId('physical-canvas').scrollIntoViewIfNeeded(); await frames(page);
  const target = (await page.getByTestId('physical-room-other-room').boundingBox())!, win = (await page.getByTestId('physical-opening-window').first().boundingBox())!;
  await page.mouse.move(win.x + win.width / 2, win.y + win.height / 2); await page.mouse.down(); await frames(page);
  const current = (await page.getByTestId('physical-room-other-room').boundingBox())!;
  await page.mouse.move(current.x + current.width, current.y + current.height * .6, { steps: 6 }); await page.mouse.up();
  const after = await selected(page); expect(after.document.openings.find(o => o.id === 'door')).toEqual(before.document.openings.find(o => o.id === 'door'));
  expect(after.document.openings.find(o => o.id === 'window')!.attachments[0].wallFaceId).toBe('other-room:right');
  expect(after.document.rooms.map(r => r.presentation)).toEqual(initial.document.rooms.map(r => r.presentation)); expect(target.width).toBeGreaterThan(0);
});

test('grouped and shared-opening rooms block partial level reassignment with every relationship preserved', async ({ page }) => {
  test.setTimeout(60_000);
  for (const relationship of ['group', 'shared'] as const) {
    await seedAdvanced(page, relationship); const original = await selected(page), unassigned = original.levelView!.activeLevelId;
    const main = await addLevel(page, 'Main floor'); await switchLevel(page, unassigned); await quick(page);
    await page.getByRole('button', { name: 'room-1', exact: true }).click(); const before = await selected(page), controls = await historyState(page);
    await assign(page, 'room-1', main);
    await expect(page.getByRole('alert').first()).toContainText(relationship === 'group' ? /group|related rooms/i : /shared|attachments/i);
    expect(durable(await selected(page))).toEqual(durable(before)); expect(await historyState(page)).toEqual(controls);
    expect(levels(await selected(page)).roomLevels).toEqual(levels(original).roomLevels);
    const walls = new Map(before.document.rooms.flatMap(r => r.wallFaces.map(w => [w.id, r.id] as const)));
    for (const opening of before.document.openings) expect(new Set(opening.attachments.map(a => levels(before).roomLevels[walls.get(a.wallFaceId)!])).size).toBe(1);
  }
});

test('upgrading the latest physical and legacy copies preserves originals unknown ownership and historical snapshots', async ({ page }) => {
  test.setTimeout(70_000); await page.goto('/quick-room'); await page.getByRole('button', { name: 'Add room', exact: true }).click();
  const quickCard = page.getByTestId('quick-room-card');
  for (const [label, value] of [['Room name', 'Original source'], ['Length', '10 ft'], ['Width', '9 ft'], ['Ceiling height', '7 ft']]) {
    if (label === 'Room name') await quickCard.getByLabel(label, { exact: true }).fill(value); else await commit(quickCard.getByLabel(label, { exact: true }), value);
  }
  const sourceBytes = await page.evaluate(k => sessionStorage.getItem(k), QUICK_KEY); expect(sourceBytes).not.toBeNull();
  await page.getByRole('button', { name: 'Open a physical copy', exact: true }).click(); await commit(field(page, 'Length'), '12 ft');
  await field(page, 'Ceiling height').fill('7 ft -'); const before = await selected(page);
  const snapshot = await createQuantitySnapshot(before.document, before.request, { id: 'pre-level-snapshot', createdAt: AT, kind: 'evaluation' }, before.events);
  expect(snapshot.ok).toBe(true); if (!snapshot.ok) throw new Error(JSON.stringify(snapshot.errors)); const captured = JSON.stringify(snapshot.snapshot);
  const upgraded = await upgrade(page); expect(upgraded.document.rooms).toEqual(before.document.rooms); expect(upgraded.fields).toEqual(before.fields);
  expect(upgraded.events).toEqual(before.events); expect(upgraded.source).toEqual(before.source);
  expect(upgraded.levelUpgradeLineage!.originalDraft).toEqual(before);
  expect(levels(upgraded).levels[0]).toMatchObject({ name: 'Unassigned / existing', ownership: 'unassigned' });
  expect(levels(upgraded).roomLevels).toEqual(Object.fromEntries(before.document.rooms.map(r => [r.id, upgraded.levelView!.activeLevelId])));
  expect(await page.evaluate(k => sessionStorage.getItem(k), QUICK_KEY)).toBe(sourceBytes);
  expect(await verifyQuantitySnapshot(snapshot.snapshot)).toEqual({ ok: true }); expect(JSON.stringify(snapshot.snapshot)).toBe(captured);
  // The existing importer fixture includes group membership, fractional width,
  // a recorded window height, and door appearance; upgrade the edited live copy.
  const legacyRooms = [{ id: 'legacy-a', name: 'Legacy Alpha', x: 20.25, y: -40.5, width: 400, height: 300, groupId: 'kept-group',
    objects: [{ id: 'legacy-door', type: 'door', wallSide: 'top', position: 37.5, size: 160 / 3,
      doorProperties: { width: 32, height: 84, style: 'bifold', swingDirection: 'outward', swingSide: 'left' } }] },
  { id: 'legacy-b', name: 'Legacy Beta', x: 420.25, y: -40.5, width: 300, height: 300, groupId: 'kept-group',
    objects: [{ id: 'legacy-window', type: 'window', wallSide: 'right', position: 50, size: 60, windowProperties: { height: 48 }, metadata: { keep: 'window' } }] }];
  const response = await page.request.post('/api/floor-plans', { data: { name: 'Level upgrade ' + test.info().testId, rooms: legacyRooms, createdAt: AT, updatedAt: AT } });
  expect(response.status()).toBe(201); const saved = await response.json(); await page.goto('/');
  await page.getByRole('button', { name: 'Load Sketch', exact: true }).click(); const load = page.getByRole('dialog', { name: 'Load Sketch', exact: true });
  await load.getByText(saved.name, { exact: true }).click(); await load.getByRole('button', { name: 'Load Selected Sketch', exact: true }).click();
  await page.getByRole('button', { name: 'Open a physical copy', exact: true }).click();
  await rooms(page).getByLabel('Room name', { exact: true }).fill('Latest legacy copy'); await field(page, 'Length').press('Tab');
  const latest = await selected(page), current = await upgrade(page);
  expect(geometry(current)).toEqual(geometry(latest)); expect(current.source).toEqual(latest.source); expect(current.levelUpgradeLineage!.originalDraft).toEqual(latest);
  expect(current.document.editorContract!.groups).toEqual([{ id: 'kept-group', roomIds: ['legacy-a', 'legacy-b'] }]);
  expect(current.document.openings.find(o => o.id === 'legacy-window')!.height.valueMm).toBeCloseTo(1219.2, 9);
  expect(current.document.openings.find(o => o.id === 'legacy-door')!.appearance).toMatchObject({ style: 'bifold', swingDirection: 'outward', swingSide: 'left' });
  expect((await (await page.request.get('/api/floor-plans/' + saved.id)).json()).rooms).toEqual(legacyRooms);
});

test('level fingerprints agree in the actual browser while presentation changes and rejected recovery preserve their boundaries', async ({ page, browser }) => {
  test.setTimeout(90_000); const f = await fixture(page), initial = await selected(page); const first = await parity(browser, initial);
  await switchLevel(page, f.main); await renameLevel(page, 'Main renamed'); await page.getByRole('button', { name: 'Move level up', exact: true }).click();
  await showDrawing(page); await drawing(page).getByRole('button', { name: 'Zoom in', exact: true }).click();
  const presented = await selected(page), unchanged = await parity(browser, presented); expect(unchanged.fingerprints).toEqual(first.fingerprints);
  expect(unchanged.calculation.outputs).toEqual(first.calculation.outputs);
  await switchLevel(page, f.basement); await assign(page, f.alpha.id, f.main);
  const moved = await selected(page), changed = await parity(browser, moved);
  expect(changed.fingerprints).not.toEqual(first.fingerprints); expect(changed.calculation.outputs.map(o => o.total?.net)).toEqual(first.calculation.outputs.map(o => o.total?.net));
  const good = await registry(page); const corruptions: Array<[string, (value: typeof good) => void]> = [
    ['future level version', value => { const d = value.drafts.find(d => d.id === moved.id)!; (levels(d) as any).version = 'future-building-levels-v9'; }],
    ['unknown ownership target', value => { levels(value.drafts.find(d => d.id === moved.id)!).roomLevels[f.alpha.id] = 'missing-level'; }],
    ['duplicate level identity', value => { const l = levels(value.drafts.find(d => d.id === moved.id)!); l.levels[1].id = l.levels[0].id; }],
    ['duplicate membership representation', value => { const l = levels(value.drafts.find(d => d.id === moved.id)!); (l as any).roomLevels = [[f.alpha.id, f.main], [f.alpha.id, f.basement]]; }],
  ];
  for (const [name, change] of corruptions) {
    const invalid = structuredClone(good); change(invalid); const raw = JSON.stringify(invalid); expect(parseRegistry(raw).status).toMatch(/corrupt|unsupported/);
    const context = await browser.newContext({ baseURL: new URL(page.url()).origin }); const bad = await context.newPage();
    try {
      await bad.addInitScript(({ key, raw, old }) => { sessionStorage.setItem(key, raw); sessionStorage.setItem(old, 'preserved older bytes'); }, { key: KEY, raw, old: OLD_KEY });
      await bad.goto('/physical-draft'); await expect(bad.getByRole('alert').first(), name).toBeVisible();
      await expect(bad.getByRole('button', { name: 'New physical draft', exact: true })).toBeDisabled();
      const event = bad.waitForEvent('download'); await bad.getByRole('button', { name: 'Download original recovery data', exact: true }).click();
      const download = await event; expect(await readFile((await download.path())!, 'utf8')).toBe(raw);
      expect(await bad.evaluate(k => sessionStorage.getItem(k), KEY)).toBe(raw); expect(await bad.evaluate(k => sessionStorage.getItem(k), OLD_KEY)).toBe('preserved older bytes');
    } finally { await context.close(); }
  }
  expect(await selected(page)).toEqual(moved);
});
