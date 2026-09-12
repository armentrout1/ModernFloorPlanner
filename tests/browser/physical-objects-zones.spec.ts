import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseRegistry, serializeRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import type { PhysicalDraft } from '../../client/src/features/physical-draft/state';
import { evaluateQuantities, createQuantitySnapshot, verifyQuantitySnapshot } from '../../shared/quantities/snapshot';

const rooms = (p: Page) => p.getByTestId('physical-room-inspector');
const zones = (p: Page) => p.getByTestId('physical-zone-inspector');
const cabinets = (p: Page) => p.getByTestId('physical-cabinet-inspector');
const level = (p: Page) => p.getByRole('combobox', { name: 'Editing level', exact: true });
const drawing = (p: Page) => p.getByRole('region', { name: 'Physical drawing', exact: true });
const takeoff = (p: Page) => p.getByTestId('takeoff-panel');
const card = (p: Page, output: string) => p.getByTestId('takeoff-output-' + output);
const history = (p: Page) => p.getByRole('group', { name: 'Committed edit history', exact: true, includeHidden: true });
const undo = (p: Page) => history(p).getByRole('button', { name: /^Undo(?: |$)/, includeHidden: true });
const redo = (p: Page) => history(p).getByRole('button', { name: /^Redo(?: |$)/, includeHidden: true });
const measure = (scope: Locator, label: string) => scope.getByLabel(new RegExp('^' + label + '( [(](ft|m)[)])?$'));
const FOOTPRINT_LABEL = 'Gross plan footprint — within parent room; not additive.';
const AT = '2026-09-09T00:00:00.000Z';
const frames = (p: Page) => p.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

// Main fixtures are built only through the real compiled UI. Recovery inspection
// below is read-only and goes through the production validator.
async function registry(p: Page) {
  await expect.poll(async () => parseRegistry(await p.evaluate(k => sessionStorage.getItem(k), KEY)).status).toBe('recovered');
  const value = parseRegistry(await p.evaluate(k => sessionStorage.getItem(k), KEY));
  if (value.status !== 'recovered') throw new Error('Expected validated current recovery');
  return value.registry;
}
async function selected(p: Page): Promise<PhysicalDraft> {
  const value = await registry(p), draft = value.drafts.find(d => d.id === value.selectedDraftId);
  if (!draft) throw new Error('Missing selected physical draft');
  return draft;
}
function layout(d: PhysicalDraft) { if (d.document.schemaVersion !== 5) throw new Error('Expected layout-capable document'); return d.document.layoutContract; }
const zone = (d: PhysicalDraft, id: string) => layout(d).zones.find(z => z.id === id)!;
const cabinet = (d: PhysicalDraft, id: string) => layout(d).cabinetBlocks.find(c => c.id === id)!;
function durable(d: PhysicalDraft) { const { localEditRevision, levelView, ...rest } = d; return rest; }
async function commit(input: Locator, value: string) { await input.fill(value); await input.press('Enter'); await input.press('Tab'); }
async function openInspector(p: Page) {
  if ((p.viewportSize()?.width ?? 1600) < 1024) {
    const dialog = p.getByRole('dialog', { name: /^Edit / }), trigger = p.getByRole('button', { name: /^Edit selected / });
    await expect.poll(async () => await dialog.isVisible() || await trigger.isVisible()).toBe(true);
    if (!await dialog.isVisible()) await trigger.click();
  }
  await expect(p.getByTestId('physical-inspector')).toBeVisible();
}
async function closeInspector(p: Page) {
  const dialog = p.getByRole('dialog', { name: /^Edit / });
  if (await dialog.isVisible()) { await dialog.getByRole('button', { name: 'Close inspector', exact: true }).click(); await expect(dialog).toBeHidden(); }
}
async function quick(p: Page) { await closeInspector(p); await p.getByRole('tab', { name: 'Quick Rooms', exact: true }).click(); }
async function showDrawing(p: Page) {
  await closeInspector(p); await p.getByRole('tab', { name: 'Drawing', exact: true }).click();
  const draft = await selected(p), document = draft.document;
  const visible = document.rooms.filter(room => !draft.levelView || document.schemaVersion === 2 || document.buildingLevels.roomLevels[room.id] === draft.levelView.activeLevelId);
  if (!visible.length) {
    await expect(p.getByRole('tabpanel', { name: 'Drawing', exact: true })).toContainText('Add a room, then enter its measured dimensions. Ceiling height begins unknown.');
    await expect(drawing(p)).toHaveCount(0);
  } else {
    await drawing(p).getByRole('button', { name: 'Fit drawing', exact: true }).click(); await frames(p);
  }
}
async function switchLevel(p: Page, id: string) {
  await closeInspector(p); await level(p).selectOption(id); await expect(p.getByTestId('physical-view')).toHaveAttribute('data-active-level-id', id);
}
async function renameLevel(p: Page, name: string) {
  await p.getByLabel('Level name', { exact: true }).fill(name); await p.getByRole('button', { name: 'Rename level', exact: true }).click();
}
async function addRoom(p: Page, name: string, length = '20 ft', width = '15 ft', height = '8 ft') {
  await quick(p); await p.getByRole('button', { name: 'Add room', exact: true }).click();
  await rooms(p).getByLabel('Room name', { exact: true }).fill(name); await rooms(p).getByLabel('Room name', { exact: true }).press('Enter');
  for (const [label, value] of [['Length', length], ['Width', width], ['Ceiling height', height]]) await commit(measure(rooms(p), label), value);
  await rooms(p).getByRole('combobox', { name: 'Ceiling model', exact: true }).selectOption('flat');
  await rooms(p).getByRole('combobox', { name: 'Wall model', exact: true }).selectOption('vertical-uniform');
  return (await selected(p)).document.rooms.find(r => r.name === name)!;
}
async function amount(p: Page, output: string, name: string, value: number) {
  await expect(card(p, output).getByTestId('takeoff-total').locator('[data-amount="' + name + '"]')).toHaveText(value.toFixed(2) + ' sq ft');
}
async function totals(p: Page, floor = 300, ceiling = 300, walls = 560) {
  await amount(p, 'floor-area', 'net', floor); await amount(p, 'ceiling-area', 'net', ceiling); await amount(p, 'gross-wall-area', 'net', walls);
}
async function work(p: Page, output: string, label: string) {
  await takeoff(p).getByRole('checkbox', { name: 'Measure ' + label, exact: true }).check();
  await takeoff(p).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption(output);
  await takeoff(p).getByRole('button', { name: 'All levels’ current targets', exact: true }).click();
}
async function building(p: Page, roomName = 'Recreation room') {
  await p.setViewportSize({ width: 1600, height: 1000 }); await p.goto('/physical-draft');
  await p.getByRole('button', { name: 'New building draft', exact: true }).click();
  const basement = (await selected(p)).levelView!.activeLevelId; await renameLevel(p, 'Basement');
  const room = await addRoom(p, roomName);
  for (const [output, label] of [['floor-area', 'Floor area'], ['ceiling-area', 'Flat ceiling area'], ['gross-wall-area', 'Gross wall area']]) await work(p, output, label);
  await totals(p); const original = await selected(p);
  await p.getByRole('button', { name: 'Enable stairs and surface openings', exact: true }).click();
  const source = await selected(p); expect(source.document.schemaVersion).toBe(4);
  expect((await registry(p)).drafts.find(d => d.id === original.id)).toEqual(original);
  await p.getByRole('button', { name: 'Enable room layout in a new copy', exact: true }).click();
  const draft = await selected(p); expect(draft.id).not.toBe(source.id); expect(draft.document.schemaVersion).toBe(5);
  expect((await registry(p)).drafts.find(d => d.id === source.id)).toEqual(source);
  await expect(rooms(p)).toHaveAttribute('data-room-id', room.id);
  await expect(rooms(p).getByRole('combobox', { name: 'Room use', exact: true }).locator('option:checked')).toHaveText('Unspecified');
  await rooms(p).getByRole('combobox', { name: 'Room use', exact: true }).selectOption({ label: 'Living/Recreation' });
  await totals(p); return { basement, room, source, original };
}
async function selectZone(p: Page, name: string, id?: string) {
  await closeInspector(p); await p.getByRole('region', { name: 'Room layout on editing level', exact: true }).getByRole('button', { name: 'Select zone: ' + name, exact: true }).click();
  await openInspector(p); if (id) await expect(zones(p)).toHaveAttribute('data-zone-id', id);
}
async function selectCabinet(p: Page, name: string, id?: string) {
  await closeInspector(p); await p.getByRole('region', { name: 'Room layout on editing level', exact: true }).getByRole('button', { name: 'Select cabinet: ' + name, exact: true }).click();
  await openInspector(p); if (id) await expect(cabinets(p)).toHaveAttribute('data-cabinet-id', id);
}
async function createZone(p: Page, name = 'Kitchenette', x = '1 ft', y = '1 ft') {
  await closeInspector(p); await p.getByRole('button', { name: 'Create zone', exact: true }).click(); await openInspector(p);
  const id = (await zones(p).getAttribute('data-zone-id'))!;
  await commit(zones(p).getByLabel('Zone name', { exact: true }), name);
  await zones(p).getByRole('combobox', { name: 'Zone use', exact: true }).selectOption({ label: 'Kitchen' });
  for (const [label, value] of [['Zone width', '8 ft'], ['Zone length', '6 ft'], ['Zone X', x], ['Zone Y', y]]) await commit(measure(zones(p), label), value);
  return id;
}
async function createCabinet(p: Page, zoneId?: string, name = 'Kitchenette cabinet') {
  await closeInspector(p); await p.getByRole('button', { name: 'Add cabinet block', exact: true }).click(); await openInspector(p);
  const id = (await cabinets(p).getAttribute('data-cabinet-id'))!;
  await commit(cabinets(p).getByLabel('Cabinet name', { exact: true }), name);
  for (const [label, value] of [['Cabinet length', '6 ft'], ['Cabinet depth', '2 ft'], ['Cabinet height', '3 ft'], ['Cabinet X', '2 ft'], ['Cabinet Y', '2 ft']]) await commit(measure(cabinets(p), label), value);
  if (zoneId) await cabinets(p).getByRole('combobox', { name: 'Associated zone', exact: true }).selectOption(zoneId);
  return id;
}
async function parity(browser: Browser, draft: PhysicalDraft) {
  const expected = await evaluateQuantities(draft.document, draft.request); expect(expected.ok).toBe(true);
  if (!expected.ok) throw new Error(JSON.stringify(expected.errors));
  const context = await browser.newContext(), page = await context.newPage(), errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  try {
    await page.goto('http://127.0.0.1:4174/'); await expect(page.getByText('Shared quantity engine ready')).toBeVisible();
    const actual = await page.evaluate(({ document, request }) => (window as any).mfpParity.evaluate(document, request), { document: draft.document, request: draft.request });
    expect(actual.ok).toBe(true); expect(actual.evaluation).toEqual(expected.evaluation); expect(errors).toEqual([]); return expected.evaluation;
  } finally { await context.close(); }
}
const errors = new WeakMap<Page, string[]>(), writes = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  errors.set(page, []); writes.set(page, []); page.on('pageerror', e => errors.get(page)!.push(e.message));
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.get(page)!.push(r.method() + ' ' + r.url()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); expect(writes.get(page)).toEqual([]); });

test('UI room use, virtual Kitchenette and one cabinet block retain the measured 300 square foot parent', async ({ page }) => {
  test.setTimeout(120_000); const f = await building(page), zoneId = await createZone(page), cabinetId = await createCabinet(page, zoneId);
  await expect(cabinets(page)).toContainText(FOOTPRINT_LABEL); await expect(cabinets(page)).toContainText('12.00 sq ft');
  await expect(cabinets(page)).toContainText(/layout.only|layout only|no.automatic.adjustment/i); await totals(page);
  const placed = await selected(page); expect(placed.document.openings).toEqual([]); expect(placed.request).toEqual(f.source.request);
  await showDrawing(page); await selectZone(page, 'Kitchenette', zoneId);
  await expect(page.getByTestId('zone-' + zoneId)).toHaveAttribute('data-room-id', f.room.id);
  await expect(zones(page)).toContainText(FOOTPRINT_LABEL); await expect(zones(page)).toContainText('48.00 sq ft');
  expect(durable(await selected(page))).toEqual(durable(placed));
  await page.screenshot({ path: test.info().outputPath('objects-zones-desktop-zone.png'), fullPage: true });
  await selectCabinet(page, 'Kitchenette cabinet', cabinetId);
  await expect(page.getByTestId('cabinet-' + cabinetId)).toHaveAttribute('data-room-id', f.room.id);
  await expect(measure(cabinets(page), 'Cabinet height')).toHaveValue(/3(?: ft)?/);
  await expect(cabinets(page).getByRole('combobox', { name: 'Associated zone', exact: true })).toHaveValue(zoneId);
  await page.screenshot({ path: test.info().outputPath('objects-zones-desktop-cabinet.png'), fullPage: true });
  await totals(page); expect((await registry(page)).drafts.find(d => d.id === f.source.id)).toEqual(f.source);
  await page.getByTestId('zone-' + zoneId).getByRole('button', { name: 'Select zone: Kitchenette', exact: true }).click();
  await expect(zones(page)).toHaveAttribute('data-zone-id', zoneId); await expect(page.getByTestId('zone-' + zoneId)).toHaveAttribute('data-selected', 'true');
  const boundary = await page.getByTestId('zone-' + zoneId).locator('rect[data-layout-hit]').boundingBox();
  if (!boundary) throw new Error('Missing virtual boundary');
  await page.mouse.click(boundary.x + boundary.width / 2, boundary.y + boundary.height * 0.9);
  await expect(rooms(page)).toHaveAttribute('data-room-id', f.room.id);
  await page.getByTestId('cabinet-' + cabinetId).getByRole('button', { name: 'Select cabinet: Kitchenette cabinet', exact: true }).click();
  await expect(cabinets(page)).toHaveAttribute('data-cabinet-id', cabinetId); expect(durable(await selected(page))).toEqual(durable(placed));
});


test('functional use stays separate from room names and confirmed measured geometry', async ({ page }) => {
  test.setTimeout(100_000); const f = await building(page, 'Bathroom');
  const review = takeoff(page).getByRole('button', { name: 'Review inputs', exact: true });
  await review.click(); await takeoff(page).getByRole('combobox', { name: 'Review target', exact: true }).selectOption('room:' + f.room.id);
  await page.getByTestId('review-field-room-' + f.room.id + '-length').getByRole('button', { name: /^Review / }).click();
  await page.getByRole('dialog', { name: 'Review measurement', exact: true }).getByRole('button', { name: 'Confirm reviewed value', exact: true }).click();
  const confirmed = await selected(page); expect(confirmed.document.rooms[0].length.provenance.confirmation.status).toBe('confirmed');
  await rooms(page).getByRole('combobox', { name: 'Room use', exact: true }).selectOption({ label: 'Custom' });
  await commit(rooms(page).getByLabel('Custom room use', { exact: true }), 'Music and recreation');
  expect(layout(await selected(page)).roomUses[f.room.id]).toEqual({ value: 'custom', customLabel: 'Music and recreation', source: 'manual' });
  const zoneId = await createZone(page); await zones(page).getByRole('combobox', { name: 'Zone use', exact: true }).selectOption({ label: 'Custom' });
  await commit(zones(page).getByLabel('Custom zone use', { exact: true }), 'Coffee preparation');
  await commit(zones(page).getByLabel('Zone name', { exact: true }), 'Breakfast corner');
  const after = await selected(page); expect(after.document.rooms).toEqual(confirmed.document.rooms); expect(after.request).toEqual(confirmed.request);
  expect(after.reviewState).toEqual(confirmed.reviewState); expect(after.events).toEqual(confirmed.events);
  expect(zone(after, zoneId).use).toEqual({ value: 'custom', customLabel: 'Coffee preparation', source: 'manual' });
  await totals(page); await page.reload(); await expect(page.getByTestId('physical-draft-id')).toHaveText(after.id);
  expect(durable(await selected(page))).toEqual(durable(after));
  await selectZone(page, 'Breakfast corner', zoneId); await expect(zones(page).getByLabel('Custom zone use', { exact: true })).toHaveValue('Coffee preparation');
  await quick(page); await page.getByRole('button', { name: 'Bathroom', exact: true }).click();
  await expect(rooms(page).getByLabel('Custom room use', { exact: true })).toHaveValue('Music and recreation');
  await expect(undo(page)).toBeDisabled(); await expect(redo(page)).toBeDisabled();
});

async function dragBlock(p: Page, kind: 'zone'|'cabinet', id: string, roomId: string, xFeet: number, yFeet: number) {
  const mark = p.getByTestId(kind + '-' + id), hit = mark.locator('rect[data-layout-hit]');
  await hit.scrollIntoViewIfNeeded();
  // The SVG painted bounds include half the stroke; use the unpainted model-plane box as the placement anchor.
  const before = await mark.boundingBox(); if (!before) throw new Error('Missing layout model-plane rectangle');
  // Use a visible border; the zone's transparent interior deliberately does not intercept the room.
  const grab = { x: Math.min(2, before.width / 4), y: Math.min(2, before.height / 4) };
  await p.mouse.move(before.x + grab.x, before.y + grab.y); await p.mouse.down();
  const room = await p.getByTestId('physical-room-' + roomId).boundingBox(); if (!room) throw new Error('Missing current room bounds');
  const target = { x: room.x + room.width * xFeet / 20 + grab.x, y: room.y + room.height * yFeet / 15 + grab.y };
  await p.mouse.move(target.x, target.y, { steps: 7 }); await p.mouse.up();
  return { toleranceMm: 20 * 304.8 / room.width, room };
}

test('zone and cabinet selection, rotation and one-command drags use current reflowed room coordinates', async ({ page }) => {
  test.setTimeout(110_000); const f = await building(page), zoneId = await createZone(page), cabinetId = await createCabinet(page, zoneId);
  await commit(measure(cabinets(page), 'Cabinet Y'), '1 ft'); await cabinets(page).getByRole('combobox', { name: 'Rotation', exact: true }).selectOption('90');
  const rotated = await selected(page); expect(cabinet(rotated, cabinetId).placement.rotation).toBe(90);
  expect(cabinet(rotated, cabinetId).length.valueMm).toBeCloseTo(1828.8, 9); expect(cabinet(rotated, cabinetId).depth.valueMm).toBeCloseTo(609.6, 9);
  await showDrawing(page); await drawing(page).getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByTestId('physical-canvas').hover(); await page.mouse.wheel(32, 16);
  await page.setViewportSize({ width: 820, height: 1100 }); await openInspector(page); await closeInspector(page);
  await drawing(page).getByRole('button', { name: 'Fit drawing', exact: true }).click(); await frames(page);
  const before = await selected(page), { toleranceMm } = await dragBlock(page, 'cabinet', cabinetId, f.room.id, 10, 2);
  const moved = await selected(page), object = cabinet(moved, cabinetId);
  expect(Math.abs(object.placement.x.valueMm! - 3048)).toBeLessThanOrEqual(toleranceMm);
  expect(Math.abs(object.placement.y.valueMm! - 609.6)).toBeLessThanOrEqual(toleranceMm);
  expect(object.zoneId).toBe(zoneId); expect({ ...object, placement: cabinet(before, cabinetId).placement }).toEqual(cabinet(before, cabinetId));
  expect(moved.historyEvidence!.events).toHaveLength(before.historyEvidence!.events.length + 1);
  expect(moved.document.rooms).toEqual(before.document.rooms); expect(moved.request).toEqual(before.request);
  await selectCabinet(page, 'Kitchenette cabinet', cabinetId); await expect(cabinets(page).getByTestId('layout-geometry-findings')).toContainText(/zone|association/i);
  await closeInspector(page); await undo(page).click(); expect(layout(await selected(page))).toEqual(layout(before));
  await redo(page).click(); expect(layout(await selected(page))).toEqual(layout(moved));
  await page.setViewportSize({ width: 1600, height: 1000 }); await frames(page);
  await selectZone(page, 'Kitchenette', zoneId); await zones(page).getByRole('button', { name: 'Rotate zone', exact: true }).click();
  expect(zone(await selected(page), zoneId).placement.rotation).toBe(90);
  const unitsBefore = await selected(page); await page.getByRole('button', { name: 'Meters', exact: true }).click();
  await expect(measure(zones(page), 'Zone width')).toHaveValue(/2\.4384(?: m)?/);
  expect((await selected(page)).document).toEqual(unitsBefore.document); expect((await selected(page)).request).toEqual(unitsBefore.request);
  await page.getByRole('button', { name: 'Feet / inches', exact: true }).click();
  // A late modifier cancels instead of applying a hidden extra placement.
  await closeInspector(page); const mark = page.getByTestId('zone-' + zoneId).locator('rect[data-layout-hit]'), box = await mark.boundingBox();
  if (!box) throw new Error('Missing zone boundary'); const cancelBefore = await selected(page);
  await page.mouse.move(box.x + 2, box.y + 2); await page.mouse.down(); await page.mouse.move(box.x + 32, box.y + 22);
  await page.keyboard.press('Escape'); await page.mouse.up(); expect(layout(await selected(page))).toEqual(layout(cancelBefore));
  // Real primary mouse drag plus precisely dispatched secondary-touch packets:
  // a second pointer cancels the first and must not acquire ownership itself.
  const touchBefore = await selected(page), touchBox = await mark.boundingBox();
  if (!touchBox) throw new Error('Missing zone boundary after cancel');
  await page.mouse.move(touchBox.x + 2, touchBox.y + 2); await page.mouse.down();
  await page.mouse.move(touchBox.x + 12, touchBox.y + 12);
  const secondary = { pointerId: 72, pointerType: 'touch', isPrimary: false, button: 0, buttons: 1, clientX: touchBox.x + 2, clientY: touchBox.y + 2 };
  await mark.dispatchEvent('pointerdown', secondary);
  await mark.dispatchEvent('pointermove', { ...secondary, clientX: secondary.clientX + 35 });
  await mark.dispatchEvent('pointerup', { ...secondary, clientX: secondary.clientX + 35, buttons: 0 });
  await page.mouse.up();
  expect(durable(await selected(page))).toEqual(durable(touchBefore));
  await expect(page.locator('[data-physical-gesture="active"]')).toHaveCount(0);
  await totals(page);
});

test('unknown, overlapping and out-of-bounds zones remain explicit without altering parent finish quantities', async ({ page }) => {
  test.setTimeout(110_000); const f = await building(page), first = await createZone(page), object = await createCabinet(page, first);
  await selectZone(page, 'Kitchenette', first); await commit(measure(zones(page), 'Zone width'), '');
  expect(zone(await selected(page), first).width.state).toBe('unknown'); await expect(zones(page).getByTestId('layout-footprint')).toContainText(/Unknown/); await totals(page);
  await commit(measure(zones(page), 'Zone width'), '8 ft'); const beforeInvalid = await selected(page);
  await commit(measure(zones(page), 'Zone X'), '18 ft');
  await expect(measure(zones(page), 'Zone X')).toHaveValue('18 ft'); await expect(zones(page)).toContainText(/inside|bounds|outside|fit/i);
  expect(layout(await selected(page))).toEqual(layout(beforeInvalid)); await expect(page.getByRole('alert')).toHaveCount(0);
  await zones(page).getByRole('button', { name: 'Revert zone x', exact: true }).click();
  const second = await createZone(page, 'Dining overlap', '4 ft', '2 ft'); expect(second).not.toBe(first);
  await expect(zones(page).getByTestId('layout-geometry-findings')).toContainText(/overlap/i); await totals(page);
  await selectCabinet(page, 'Kitchenette cabinet', object); await commit(measure(cabinets(page), 'Cabinet height'), '');
  expect(cabinet(await selected(page), object).height.state).toBe('unknown'); await expect(cabinets(page).getByTestId('layout-footprint')).toContainText('12.00 sq ft');
  const children = layout(await selected(page)); await quick(page); await page.getByRole('button', { name: f.room.name, exact: true }).click();
  await commit(measure(rooms(page), 'Length'), '6 ft'); expect(layout(await selected(page))).toEqual(children);
  await totals(page, 90, 90, 336); await selectZone(page, 'Kitchenette', first);
  await expect(zones(page).getByTestId('layout-geometry-findings')).toContainText(/inside|bounds|outside|fit/i);
  expect(layout(await selected(page)).zones).toHaveLength(2); expect(layout(await selected(page)).cabinetBlocks).toHaveLength(1);
});


test('level changes, phone IME and reload preserve unrelated room zone cabinet stair and waste drafts', async ({ page }) => {
  test.setTimeout(120_000); const f = await building(page), zoneId = await createZone(page), cabinetId = await createCabinet(page, zoneId);
  await closeInspector(page); await page.getByRole('button', { name: 'Add stair', exact: true }).click(); await openInspector(page);
  const stairInspector = page.getByTestId('physical-stair-inspector'), stairId = (await stairInspector.getAttribute('data-stair-id'))!;
  await commit(measure(stairInspector, 'Horizontal run'), '6 ft');
  for (const surface of ['floor', 'ceiling']) await stairInspector.getByRole('combobox', { name: 'Lower ' + surface + ' impact', exact: true }).selectOption('no-deduction');
  await measure(stairInspector, 'Horizontal run').fill('6 ft -');
  await quick(page); await page.getByRole('button', { name: f.room.name, exact: true }).click(); await measure(rooms(page), 'Ceiling height').fill('8 ft -');
  await selectZone(page, 'Kitchenette', zoneId); await measure(zones(page), 'Zone width').fill('8 ft -');
  await selectCabinet(page, 'Kitchenette cabinet', cabinetId); await measure(cabinets(page), 'Cabinet depth').fill('2 ft -');
  await closeInspector(page); await takeoff(page).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption('floor-area');
  await takeoff(page).getByLabel('Waste percentage', { exact: true }).fill('10x');
  await page.getByRole('button', { name: 'Meters', exact: true }).click(); const pending = await selected(page);
  await page.getByRole('button', { name: 'Add level', exact: true }).click(); const other = (await selected(page)).levelView!.activeLevelId;
  await renameLevel(page, 'Main floor'); await showDrawing(page);
  for (const id of ['zone-' + zoneId, 'cabinet-' + cabinetId, 'physical-stair-' + stairId + '-lower']) await expect(page.getByTestId(id)).toHaveCount(0);
  const hidden = await selected(page); await page.getByRole('tabpanel', { name: 'Drawing', exact: true }).press('Delete');
  expect((await selected(page)).document).toEqual(hidden.document);
  await switchLevel(page, f.basement); await selectCabinet(page, 'Kitchenette cabinet', cabinetId);
  const depth = measure(cabinets(page), 'Cabinet depth'); await expect(depth).toHaveValue('2 ft -'); await depth.focus();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('dialog', { name: /^Edit cabinet:/ })).toBeVisible(); await expect(depth).toHaveValue('2 ft -');
  const inputBox = await depth.boundingBox(), revertBox = await cabinets(page).getByRole('button', { name: 'Revert cabinet depth', exact: true }).boundingBox();
  expect(inputBox && revertBox).toBeTruthy(); expect(revertBox!.y + revertBox!.height).toBeLessThanOrEqual(inputBox!.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('objects-zones-phone-pending-drawer.png') });
  await depth.dispatchEvent('compositionstart'); await depth.press('Escape'); await expect(depth).toHaveValue('2 ft -');
  await depth.dispatchEvent('compositionend'); await depth.press('Escape'); await expect(depth).not.toHaveValue('2 ft -');
  await expect(page.getByRole('dialog', { name: /^Edit cabinet:/ })).toBeVisible();
  const reverted = await selected(page); expect(reverted.fields).toEqual(pending.fields); expect(reverted.stairFields).toEqual(pending.stairFields);
  expect(reverted.takeoffState).toEqual(pending.takeoffState); expect(reverted.events).toEqual(pending.events); expect(reverted.source).toEqual(pending.source);
  await closeInspector(page); await switchLevel(page, other); const beforeReload = await selected(page); await page.reload();
  expect(await selected(page)).toEqual(beforeReload); await expect(undo(page)).toBeDisabled(); await expect(redo(page)).toBeDisabled();
  await switchLevel(page, f.basement); await selectZone(page, 'Kitchenette', zoneId); await expect(measure(zones(page), 'Zone width')).toHaveValue('8 ft -');
  await closeInspector(page); await quick(page); await expect(measure(rooms(page), 'Ceiling height')).toHaveValue('8 ft -');
  await page.getByTestId('physical-stair-list-' + stairId).click(); await openInspector(page); await expect(measure(stairInspector, 'Horizontal run')).toHaveValue('6 ft -');
  await closeInspector(page); await expect(takeoff(page).getByLabel('Waste percentage', { exact: true })).toHaveValue('10x');
  expect((await registry(page)).drafts.find(d => d.id === f.source.id)).toEqual(f.source);
});

test('zone unlink and cabinet deletion stay chronological while room reassignment carries the same children', async ({ page }) => {
  test.setTimeout(120_000); const f = await building(page), zoneId = await createZone(page), cabinetId = await createCabinet(page, zoneId);
  const original = await selected(page); await selectZone(page, 'Kitchenette', zoneId);
  await expect(zones(page)).toContainText(/unlink and retain/i); await zones(page).getByRole('button', { name: 'Delete zone', exact: true }).click();
  const deleted = await selected(page); expect(layout(deleted).zones).toEqual([]); expect(cabinet(deleted, cabinetId)).toEqual({ ...cabinet(original, cabinetId), zoneId: null });
  expect(deleted.document.rooms).toEqual(original.document.rooms); expect(deleted.request).toEqual(original.request);
  await takeoff(page).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption('floor-area'); await takeoff(page).getByLabel('Waste percentage', { exact: true }).fill('12x');
  const pending = await selected(page); await undo(page).click(); expect(layout(await selected(page))).toEqual(layout(original));
  expect((await selected(page)).takeoffState).toEqual(pending.takeoffState); await redo(page).click(); expect(layout(await selected(page))).toEqual(layout(deleted));
  await undo(page).click(); await takeoff(page).getByRole('button', { name: 'Revert floor waste', exact: true }).click();
  await selectCabinet(page, 'Kitchenette cabinet', cabinetId); await cabinets(page).getByRole('button', { name: 'Delete cabinet block', exact: true }).click();
  expect(layout(await selected(page)).cabinetBlocks).toEqual([]); expect(zone(await selected(page), zoneId)).toEqual(zone(original, zoneId));
  await undo(page).click(); expect(layout(await selected(page))).toEqual(layout(original));
  await closeInspector(page); await page.getByRole('button', { name: 'Add level', exact: true }).click();
  const destination = (await selected(page)).levelView!.activeLevelId; await renameLevel(page, 'Main floor'); await addRoom(page, 'Upstairs room');
  await switchLevel(page, f.basement); await quick(page); await page.getByRole('button', { name: f.room.name, exact: true }).click();
  const beforeAssignment = await selected(page); await rooms(page).getByRole('combobox', { name: 'Room level', exact: true }).selectOption(destination);
  await rooms(page).getByRole('button', { name: 'Assign room', exact: true }).click();
  const assigned = await selected(page); expect(assigned.document.schemaVersion).toBe(5);
  if (assigned.document.schemaVersion !== 5) throw new Error('Missing layout document');
  expect(assigned.document.buildingLevels.roomLevels[f.room.id]).toBe(destination); expect(layout(assigned)).toEqual(layout(beforeAssignment));
  expect(assigned.request).toEqual(beforeAssignment.request); await showDrawing(page);
  await expect(page.getByTestId('zone-' + zoneId)).toBeVisible(); await expect(page.getByTestId('cabinet-' + cabinetId)).toBeVisible();
  await undo(page).click(); await expect(level(page)).toHaveValue(f.basement); expect((await selected(page)).document).toEqual(beforeAssignment.document);
  await totals(page); await switchLevel(page, destination); const hidden = await selected(page);
  await page.getByRole('tabpanel', { name: 'Drawing', exact: true }).press('Delete'); expect((await selected(page)).document).toEqual(hidden.document);
  await expect(page.getByTestId('zone-' + zoneId)).toHaveCount(0); await expect(page.getByTestId('cabinet-' + cabinetId)).toHaveCount(0);
});

test('validated layout recovery retains original bytes for future contracts and missing room or zone references', async ({ page, browser }) => {
  test.setTimeout(120_000); const f = await building(page), zoneId = await createZone(page), cabinetId = await createCabinet(page, zoneId);
  const current = await selected(page), valid = await registry(page);
  for (const kind of ['future', 'missing-room', 'missing-zone'] as const) {
    const invalid = structuredClone(valid), target = invalid.drafts.find(d => d.id === current.id)!;
    if (kind === 'future') (layout(target) as any).version = 'room-layout-future';
    else if (kind === 'missing-room') zone(target, zoneId).roomId = 'missing-room';
    else cabinet(target, cabinetId).zoneId = 'missing-zone';
    const raw = JSON.stringify(invalid); expect(parseRegistry(raw).status).toMatch(/corrupt|unsupported/);
    const context = await browser.newContext({ baseURL: new URL(page.url()).origin }), bad = await context.newPage();
    try {
      await bad.addInitScript(({ key, raw }) => sessionStorage.setItem(key, raw), { key: KEY, raw }); await bad.goto('/physical-draft');
      await expect(bad.getByRole('alert').first()).toBeVisible(); await expect(bad.getByRole('button', { name: 'New building draft', exact: true })).toBeDisabled();
      const downloaded = bad.waitForEvent('download'); await bad.getByRole('button', { name: 'Download original recovery data', exact: true }).click();
      const file = await downloaded; expect(await readFile((await file.path())!, 'utf8')).toBe(raw); expect(await bad.evaluate(key => sessionStorage.getItem(key), KEY)).toBe(raw);
    } finally { await context.close(); }
  }
  await selectCabinet(page, 'Kitchenette cabinet', cabinetId); const bytes = await page.evaluate(key => sessionStorage.getItem(key), KEY);
  await page.evaluate(key => { const set = Storage.prototype.setItem; Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); return set.call(this, name, value); }; }, KEY);
  await measure(cabinets(page), 'Cabinet height').fill('3 ft -');
  await expect(page.getByText('This edit is held in memory because temporary recovery could not be saved. Existing stored data has not been cleared.', { exact: true })).toBeVisible();
  await expect(measure(cabinets(page), 'Cabinet height')).toHaveValue('3 ft -'); expect(await page.evaluate(key => sessionStorage.getItem(key), KEY)).toBe(bytes);
  await cabinets(page).getByRole('button', { name: 'Revert cabinet height', exact: true }).click(); await expect(measure(cabinets(page), 'Cabinet height')).toHaveValue(/3(?: ft)?/);
  expect((await registry(page)).drafts.find(d => d.id === f.source.id)).toEqual(f.source);
});


test('current stair and surface-opening source upgrades losslessly and layout leaves 252 net plus 10 percent waste unchanged', async ({ page, browser }) => {
  test.setTimeout(150_000); const f = await building(page);
  const historical = await createQuantitySnapshot(f.original.document, f.original.request, { id: 'before-layout-v3', createdAt: AT, kind: 'evaluation' }, f.original.events);
  expect(historical.ok).toBe(true); if (!historical.ok) throw new Error(JSON.stringify(historical.errors));
  const oldBytes = JSON.stringify(historical.snapshot);
  await page.getByRole('combobox', { name: 'Selected physical draft', exact: true }).selectOption(f.source.id);
  // A representative imported metadata fixture is validated before recovery.
  // Geometry, stairs and holes below are still created through the real UI.
  const imported = await registry(page), old = imported.drafts.find(d => d.id === f.source.id)!;
  old.document.metadata = { ...old.document.metadata, syntheticImportNote: 'Preserve this source-owned annotation through layout upgrade' };
  const raw = serializeRegistry(imported); expect(parseRegistry(raw).status).toBe('recovered');
  await page.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), { key: KEY, raw }); await page.reload();
  await quick(page); await page.getByRole('button', { name: f.room.name, exact: true }).click();
  await rooms(page).getByLabel('Room name', { exact: true }).fill('Basement room'); await rooms(page).getByLabel('Room name', { exact: true }).press('Enter');
  await commit(measure(rooms(page), 'Length'), '12 ft'); await commit(measure(rooms(page), 'Width'), '10 ft');
  await page.getByRole('button', { name: 'Add level', exact: true }).click(); const main = (await selected(page)).levelView!.activeLevelId;
  await renameLevel(page, 'Main floor'); const upperRoom = await addRoom(page, 'Main room', '15 ft', '10 ft', '9 ft');
  for (const [output, label] of [['floor-area', 'Floor area'], ['ceiling-area', 'Flat ceiling area'], ['gross-wall-area', 'Gross wall area']]) await work(page, output, label);
  await switchLevel(page, f.basement); await page.getByRole('button', { name: 'Add stair', exact: true }).click(); await openInspector(page);
  const stairs = page.getByTestId('physical-stair-inspector'), stairId = (await stairs.getAttribute('data-stair-id'))!;
  await stairs.getByLabel('Stair name', { exact: true }).fill('Source stair'); await stairs.getByLabel('Stair name', { exact: true }).press('Enter');
  for (const [label, value] of [['Stair width', '3 ft'], ['Horizontal run', '6 ft'], ['Lower X', '4 ft'], ['Lower Y', '1 ft']]) await commit(measure(stairs, label), value);
  await stairs.getByRole('combobox', { name: 'Upper level', exact: true }).selectOption(main);
  await commit(measure(stairs, 'Upper X'), '4 ft'); await commit(measure(stairs, 'Upper Y'), '1 ft');
  await stairs.getByRole('button', { name: 'Add lower landing', exact: true }).click();
  for (const [label, value] of [['Landing width', '3 ft'], ['Landing depth', '3 ft'], ['Landing X', '1 ft'], ['Landing Y', '1 ft']]) await commit(measure(stairs.getByTestId('physical-landing-lower'), label), value);
  for (const role of ['Lower', 'Upper']) for (const surface of ['floor', 'ceiling']) await stairs.getByRole('combobox', { name: role + ' ' + surface + ' impact', exact: true }).selectOption('no-deduction');
  for (const [levelId, role, surface] of [[main, 'Upper', 'floor'], [f.basement, 'Lower', 'ceiling']]) {
    await switchLevel(page, levelId); await page.getByRole('button', { name: 'Add surface opening', exact: true }).click(); await openInspector(page);
    const hole = page.getByTestId('physical-surface-opening-inspector'), holeId = (await hole.getAttribute('data-surface-opening-id'))!;
    await hole.getByLabel('Surface opening name', { exact: true }).fill(role + ' ' + surface + ' void'); await hole.getByLabel('Surface opening name', { exact: true }).press('Enter');
    await hole.getByRole('combobox', { name: 'Affected surface', exact: true }).selectOption(surface);
    for (const [label, value] of [['Opening width', '3 ft'], ['Opening length', '6 ft'], ['Opening X', '4 ft'], ['Opening Y', '1 ft']]) await commit(measure(hole, label), value);
    await page.getByTestId('physical-stair-list-' + stairId).click(); await openInspector(page);
    await stairs.getByRole('combobox', { name: role + ' ' + surface + ' impact', exact: true }).selectOption('deduct');
    await stairs.getByRole('combobox', { name: role + ' ' + surface + ' opening', exact: true }).selectOption(holeId);
  }
  await takeoff(page).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption('floor-area'); await commit(takeoff(page).getByLabel('Waste percentage', { exact: true }), '10');
  await totals(page, 252, 252, 802); await amount(page, 'floor-area', 'allowance', 25.2); await amount(page, 'floor-area', 'adjusted', 277.2);
  await page.getByTestId('physical-stair-list-' + stairId).click(); await openInspector(page); await measure(stairs, 'Total rise').fill('9 ft -');
  const source = await selected(page); expect(source.document.schemaVersion).toBe(4);
  const snapshot = await createQuantitySnapshot(source.document, source.request, { id: 'current-stairs-v4', createdAt: AT, kind: 'evaluation' }, source.events);
  expect(snapshot.ok).toBe(true); if (!snapshot.ok) throw new Error(JSON.stringify(snapshot.errors)); const snapshotBytes = JSON.stringify(snapshot.snapshot);
  await page.getByRole('button', { name: 'Enable room layout in a new copy', exact: true }).click(); const upgraded = await selected(page);
  expect(upgraded.id).not.toBe(source.id); expect(upgraded.document.schemaVersion).toBe(5);
  if (upgraded.document.schemaVersion !== 5 || source.document.schemaVersion !== 4) throw new Error('Expected supported working-copy versions');
  expect(upgraded.document.stairsContract).toEqual(source.document.stairsContract); expect(upgraded.document.rooms).toEqual(source.document.rooms);
  expect(upgraded.document.metadata).toEqual(source.document.metadata); expect(upgraded.stairFields).toEqual(source.stairFields); expect(upgraded.stairEvents).toEqual(source.stairEvents);
  expect(upgraded.source).toEqual(source.source); expect(upgraded.request).toEqual(source.request);
  expect(upgraded.layoutUpgradeLineage!.originalDraft).toEqual(source); expect((await registry(page)).drafts.find(d => d.id === source.id)).toEqual(source);
  const zoneId = await createZone(page, 'Unrelated kitchenette'); await createCabinet(page, zoneId, 'Unrelated cabinet');
  await totals(page, 252, 252, 802); await amount(page, 'floor-area', 'allowance', 25.2); await amount(page, 'floor-area', 'adjusted', 277.2);
  const final = await selected(page); expect(final.document.openings).toEqual(source.document.openings);
  if (final.document.schemaVersion !== 5) throw new Error('Expected layout document');
  expect(final.document.stairsContract).toEqual(source.document.stairsContract); expect(final.document.rooms.find(r => r.id === upperRoom.id)).toEqual(upperRoom);
  const result = await parity(browser, final); expect(result.calculation.engineVersion).toBe('rectangular-engine-v4');
  const latest = await createQuantitySnapshot(final.document, final.request, { id: 'layout-v5', createdAt: AT, kind: 'evaluation' }, final.events);
  expect(latest.ok).toBe(true); if (!latest.ok) throw new Error(JSON.stringify(latest.errors)); expect(latest.snapshot.snapshotSchemaVersion).toBe('quantity-snapshot-v5');
  for (const snap of [historical.snapshot, snapshot.snapshot, latest.snapshot]) expect(await verifyQuantitySnapshot(snap)).toEqual({ ok: true });
  expect(JSON.stringify(historical.snapshot)).toBe(oldBytes); expect(JSON.stringify(snapshot.snapshot)).toBe(snapshotBytes);
});
