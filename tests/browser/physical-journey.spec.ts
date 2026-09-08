import { expect, test, type Locator, type Page } from '@playwright/test';
import { parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import type { PhysicalDraft } from '../../client/src/features/physical-draft/state';

const QUICK_KEY = 'modern-floor-planner:quick-rooms:v1';
const LABELS = { 'floor-area': 'Floor area', 'ceiling-area': 'Flat ceiling area', 'gross-wall-area': 'Gross wall area',
  'net-wall-area': 'Net wall area', baseboard: 'Baseboard', 'base-shoe': 'Base shoe', crown: 'Crown',
  'door-casing': 'Door casing', 'window-casing': 'Window casing', 'opening-inventory': 'Physical opening inventory' } as const;
type Output = keyof typeof LABELS;
const panel = (page: Page) => page.getByTestId('takeoff-panel');
const card = (page: Page, output: Output) => page.getByTestId('takeoff-output-' + output);
const total = (page: Page, output: Output) => card(page, output).getByTestId('takeoff-total');
const rooms = (page: Page) => page.getByTestId('physical-room-inspector');
const openings = (page: Page) => page.getByTestId('physical-opening-inspector');
const drawing = (page: Page) => page.getByRole('region', { name: 'Physical drawing', exact: true });
const item = (page: Page, id: string) => page.getByTestId('physical-opening-list-' + id);
const frames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

// Recovery inspection is read-only. Every fixture and state transition below is
// created through public controls in the compiled app, never injected or seeded.
async function selected(page: Page): Promise<PhysicalDraft> {
  await expect.poll(async () => parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY)).status).toBe('recovered');
  const parsed = parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY));
  if (parsed.status !== 'recovered') throw new Error('Expected validated recovery');
  const draft = parsed.registry.drafts.find(value => value.id === parsed.registry.selectedDraftId);
  if (!draft) throw new Error('No selected draft');
  return draft;
}
async function commit(input: Locator, value: string) { await input.fill(value); await input.press('Enter'); await input.press('Tab'); }
async function amount(scope: Locator, kind: string, value: string) { await expect(scope.locator('[data-amount="' + kind + '"]')).toHaveText(value); }
async function configure(page: Page, output: Output) { await panel(page).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption(output); }
async function allTargets(page: Page, output: Output) {
  await configure(page, output);
  const target = output === 'opening-inventory' ? 'openings' : output.endsWith('casing') ? 'faces' : ['floor-area', 'ceiling-area'].includes(output) ? 'rooms' : 'walls';
  await panel(page).getByRole('button', { name: 'All current ' + target, exact: true }).click();
}
async function work(page: Page, outputs: Output[]) {
  for (const [output, label] of Object.entries(LABELS)) await panel(page).getByRole('checkbox', { name: 'Measure ' + label, exact: true }).setChecked(outputs.includes(output as Output));
  for (const output of outputs) await allTargets(page, output);
  await panel(page).getByRole('combobox', { name: 'Opening measurement basis for takeoff', exact: true }).selectOption('finished');
}
async function models(page: Page) {
  for (const [label, value] of [['Ceiling model', 'flat'], ['Wall model', 'vertical-uniform'], ['Crown path', 'rectangular-horizontal']]) await rooms(page).getByLabel(label, { exact: true }).selectOption(value);
}
async function createRoom(page: Page, name = 'Alpha') {
  await page.goto('/physical-draft');
  await page.getByRole('button', { name: 'New physical draft', exact: true }).click();
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await rooms(page).getByLabel('Room name', { exact: true }).fill(name);
  for (const [label, value] of [['Length', '12 ft'], ['Width', '10 ft'], ['Ceiling height', '8 ft']]) await commit(rooms(page).getByLabel(label + ' (ft)', { exact: true }), value);
  await models(page);
  return (await selected(page)).document.rooms[0];
}
async function createOpening(page: Page, kind: 'door' | 'window') {
  await page.getByRole('button', { name: 'Create ' + kind, exact: true }).click();
  const label = kind === 'door' ? 'Door' : 'Window', values = kind === 'door' ? ['3 ft', '7 ft', '0', '2.5 ft'] : ['4 ft', '3 ft', '3 ft', '8 ft'];
  await commit(openings(page).getByLabel('Position from wall start', { exact: true }), values[3]);
  await commit(openings(page).getByLabel(label + ' width', { exact: true }), values[0]);
  await commit(openings(page).getByLabel(label + ' height', { exact: true }), values[1]);
  await commit(openings(page).getByLabel('Sill height', { exact: true }), values[2]);
  await openings(page).getByLabel('Measurement basis', { exact: true }).selectOption('finished');
  return (await selected(page)).document.openings.at(-1)!;
}
async function showDrawing(page: Page) {
  await page.getByRole('tab', { name: 'Drawing', exact: true }).click();
  await drawing(page).getByRole('button', { name: 'Fit drawing', exact: true }).click(); await frames(page);
}
async function clickOpening(page: Page, id: string) {
  await page.getByTestId('physical-canvas').scrollIntoViewIfNeeded(); await frames(page);
  const box = await page.getByTestId('physical-opening-' + id).boundingBox();
  expect(box).not.toBeNull(); await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await expect(openings(page)).toHaveAttribute('data-opening-id', id);
}
async function revealBreakdown(page: Page, output: Output) {
  const details = card(page, output).locator('details').first();
  if (!(await details.getAttribute('open') !== null)) await details.locator('summary').click();
}
async function reviewTarget(page: Page, id: string) {
  const toggle = panel(page).getByRole('button', { name: 'Review inputs', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await panel(page).getByRole('combobox', { name: 'Review target', exact: true }).selectOption('room:' + id);
}
async function confirmField(page: Page, id: string, field: string) {
  await reviewTarget(page, id);
  await page.getByTestId('review-field-room-' + id + '-' + field).getByRole('button', { name: /^Review / }).click();
  await page.getByRole('dialog', { name: 'Review measurement', exact: true }).getByRole('button', { name: 'Confirm reviewed value', exact: true }).click();
}
async function fullNumbers(page: Page) {
  for (const [output, value] of [['floor-area', '120.00 sq ft'], ['ceiling-area', '120.00 sq ft'], ['gross-wall-area', '352.00 sq ft'], ['net-wall-area', '319.00 sq ft'], ['baseboard', '41.00 ft'], ['base-shoe', '41.00 ft'], ['crown', '44.00 ft'], ['door-casing', '17.00 ft'], ['window-casing', '14.00 ft']] as const) await amount(total(page, output), 'net', value);
  await amount(total(page, 'net-wall-area'), 'gross', '352.00 sq ft');
  await amount(total(page, 'net-wall-area'), 'raw-deductions', '33.00 sq ft');
  await amount(total(page, 'net-wall-area'), 'effective-deductions', '33.00 sq ft');
  await expect(card(page, 'opening-inventory')).toContainText(/Doors:\s*1/);
  await expect(card(page, 'opening-inventory')).toContainText(/Windows:\s*1/);
  await expect(card(page, 'opening-inventory').locator('[data-amount="adjusted"]')).toHaveCount(0);
}
const errors = new WeakMap<Page, string[]>(), writes = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  errors.set(page, []); writes.set(page, []);
  page.on('pageerror', error => errors.get(page)!.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.get(page)!.push(request.method() + ' ' + request.url()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); expect(writes.get(page)).toEqual([]); });

test('one UI-built physical journey preserves identity from adoption through takeoff review undo and recovery', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1600, height: 1200 });
  let sourceBytes: string | null, source: PhysicalDraft['source'], draftId: string, roomId: string;
  let doorId: string, windowId: string;
  await test.step('A–B: explicitly copy a standalone UI draft and identify its physical room', async () => {
    await page.goto('/quick-room'); await page.getByRole('button', { name: 'Add room', exact: true }).click();
    const quick = page.getByTestId('quick-room-card');
    await quick.getByLabel('Room name', { exact: true }).fill('Standalone source');
    for (const [label, value] of [['Length', '10 ft'], ['Width', '9 ft'], ['Ceiling height', '7 ft']]) await commit(quick.getByLabel(label, { exact: true }), value);
    sourceBytes = await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY);
    expect(sourceBytes).not.toBeNull();
    await page.getByRole('button', { name: 'Open a physical copy', exact: true }).click();
    const draft = await selected(page); source = draft.source; draftId = draft.id; roomId = draft.document.rooms[0].id;
    await expect(page.getByTestId('physical-draft-id')).toHaveText(draftId);
    await expect(rooms(page)).toHaveAttribute('data-room-id', roomId);
    await expect(rooms(page).getByLabel('Room name', { exact: true })).toHaveValue('Standalone source');
    await rooms(page).getByLabel('Room name', { exact: true }).fill('Alpha');
    for (const [label, value] of [['Length', '12 ft'], ['Width', '10 ft'], ['Ceiling height', '8 ft']]) await commit(rooms(page).getByLabel(label + ' (ft)', { exact: true }), value);
    expect(source.original).toBeTruthy();
    await models(page);
  });
  await test.step('C: 8 → 9 → 8 ceiling round trip uses the same room in both views', async () => {
    await showDrawing(page); await page.getByRole('button', { name: 'Alpha', exact: true }).click();
    await expect(rooms(page)).toHaveAttribute('data-room-id', roomId);
    await commit(rooms(page).getByLabel('Ceiling height (ft)', { exact: true }), '9 ft');
    for (const [id, value] of [['physical-floor', '120.00 sq ft'], ['physical-ceiling', '120.00 sq ft'], ['physical-walls', '396.00 sq ft']]) await expect(page.getByTestId(id)).toContainText(value);
    await page.getByRole('tab', { name: 'Quick Rooms', exact: true }).click();
    await expect(rooms(page).getByLabel('Ceiling height (ft)', { exact: true })).toHaveValue('9 ft');
    await expect(page.getByTestId('physical-walls')).toContainText('396.00 sq ft');
    await commit(rooms(page).getByLabel('Ceiling height (ft)', { exact: true }), '8 ft');
    await showDrawing(page); await expect(rooms(page).getByLabel('Ceiling height (ft)', { exact: true })).toHaveValue('8 ft');
    await expect(page.getByTestId('physical-walls')).toContainText('352.00 sq ft');
  });
  await test.step('D: create, select and move openings without changing their identity or measurements', async () => {
    const door = await createOpening(page, 'door'), window = await createOpening(page, 'window');
    doorId = door.id; windowId = window.id;
    for (const opening of [door, window]) {
      await item(page, opening.id).click(); await clickOpening(page, opening.id);
      await expect(page.getByTestId('physical-opening-' + opening.id)).toHaveAttribute('aria-pressed', 'true');
    }
    await item(page, doorId).click(); await drawing(page).getByRole('button', { name: 'Fit drawing', exact: true }).click();
    await page.getByTestId('physical-canvas').scrollIntoViewIfNeeded(); await frames(page);
    const before = await selected(page), box = await page.getByTestId('physical-opening-' + doorId).boundingBox();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2); await page.mouse.down(); await frames(page);
    const bounds = await page.getByTestId('physical-room-' + roomId).boundingBox();
    await page.mouse.move(bounds!.x + bounds!.width / 4, bounds!.y, { steps: 7 }); await page.mouse.up();
    const after = await selected(page), moved = after.document.openings.find(value => value.id === doorId)!;
    expect({ ...moved, attachments: [] }).toEqual({ ...door, attachments: [] });
    expect(moved.attachments[0].wallFaceId).toBe(door.attachments[0].wallFaceId);
    expect(Math.abs(moved.attachments[0].offsetMm - 914.4)).toBeLessThanOrEqual(3657.6 / bounds!.width);
    expect(after.document.rooms).toEqual(before.document.rooms);
    expect(after.openingEvents!.length).toBe(before.openingEvents!.length + 1);
    await commit(openings(page).getByLabel('Position from wall start', { exact: true }), '2.5 ft');
    expect((await selected(page)).document.openings).toEqual([door, window]);
  });
  await test.step('E: all ten explicit work scopes show independent known answers and one waste allowance', async () => {
    await work(page, Object.keys(LABELS) as Output[]); await fullNumbers(page);
    await revealBreakdown(page, 'net-wall-area');
    for (const [id, value] of [[doorId, '21.00 sq ft'], [windowId, '12.00 sq ft']]) await expect(card(page, 'net-wall-area').locator('[data-testid="takeoff-deduction"][data-opening-id="' + id + '"]')).toContainText(value);
    await configure(page, 'floor-area'); await commit(panel(page).getByLabel('Waste percentage', { exact: true }), '10');
    await amount(total(page, 'floor-area'), 'allowance', '12.00 sq ft'); await amount(total(page, 'floor-area'), 'adjusted', '132.00 sq ft');
    await page.screenshot({ path: test.info().outputPath('journey-complete.png'), fullPage: true });
  });
  await test.step('F: top-wall-only scope and source focus remain independent of edit selection and geometry', async () => {
    for (const output of ['net-wall-area', 'baseboard'] as const) {
      await configure(page, output); await panel(page).getByRole('button', { name: 'Clear targets', exact: true }).click();
      await panel(page).getByRole('checkbox', { name: 'Include Alpha · top wall', exact: true }).check();
    }
    await amount(total(page, 'net-wall-area'), 'gross', '96.00 sq ft'); await amount(total(page, 'net-wall-area'), 'effective-deductions', '33.00 sq ft');
    await amount(total(page, 'net-wall-area'), 'net', '63.00 sq ft'); await amount(total(page, 'baseboard'), 'net', '9.00 ft');
    await item(page, windowId).click(); const before = await selected(page);
    await revealBreakdown(page, 'net-wall-area');
    const top = before.document.rooms[0].wallFaces.find(value => value.side === 'top')!;
    await card(page, 'net-wall-area').locator('[data-target-id]').filter({ has: page.getByRole('heading', { name: 'Alpha · top wall', exact: true }) }).getByRole('button', { name: 'Locate source', exact: true }).click();
    await expect(page.getByTestId('physical-source-wall-' + top.id)).toBeVisible();
    await expect(openings(page)).toHaveAttribute('data-opening-id', windowId);
    await expect(page.getByTestId('physical-opening-' + windowId)).toHaveAttribute('aria-pressed', 'true');
    await panel(page).getByRole('checkbox', { name: 'Show takeoff scope in drawing', exact: true }).uncheck();
    await drawing(page).getByRole('button', { name: 'Zoom in', exact: true }).click();
    expect((await selected(page)).document).toEqual(before.document); expect((await selected(page)).request).toEqual(before.request);
    await allTargets(page, 'net-wall-area'); await allTargets(page, 'baseboard');
  });
  await test.step('G: clearing and restoring window height affects only dependent quantities', async () => {
    await item(page, windowId).click(); await commit(openings(page).getByLabel('Window height', { exact: true }), '');
    await amount(total(page, 'floor-area'), 'net', '120.00 sq ft'); await amount(total(page, 'gross-wall-area'), 'net', '352.00 sq ft');
    await expect(total(page, 'net-wall-area')).toContainText('Full selected total unavailable');
    await amount(card(page, 'net-wall-area').getByTestId('takeoff-subtotal'), 'net', '256.00 sq ft');
    await expect(card(page, 'net-wall-area')).toContainText('Partial subtotal · Provisional');
    await expect(card(page, 'net-wall-area')).toContainText('Excluded: Alpha · top wall');
    await page.screenshot({ path: test.info().outputPath('journey-partial.png'), fullPage: true });
    await commit(openings(page).getByLabel('Window height', { exact: true }), '3 ft'); await fullNumbers(page);
  });
  await test.step('H: review measurements and room models, then correct a reviewed value', async () => {
    for (const field of ['length', 'width', 'ceilingHeight']) await confirmField(page, roomId, field);
    for (const label of ['Ceiling model', 'Wall model', 'Crown path']) {
      await panel(page).getByRole('button', { name: 'Review ' + label, exact: true }).click();
      await page.getByRole('dialog', { name: 'Review room model', exact: true }).getByRole('button', { name: 'Confirm reviewed model', exact: true }).click();
    }
    for (const output of ['floor-area', 'ceiling-area', 'gross-wall-area'] as const) await expect(card(page, output)).toContainText('Confirmed input basis');
    const confirmed = await selected(page); await page.getByRole('button', { name: 'Alpha', exact: true }).click();
    await commit(rooms(page).getByLabel('Length (ft)', { exact: true }), '13 ft');
    await amount(total(page, 'floor-area'), 'net', '130.00 sq ft'); await expect(card(page, 'floor-area')).toContainText('Provisional');
    const corrected = await selected(page);
    expect(corrected.document.rooms[0].width).toEqual(confirmed.document.rooms[0].width);
    expect(corrected.document.rooms[0].ceilingHeight).toEqual(confirmed.document.rooms[0].ceilingHeight);
    expect(corrected.reviewState).toEqual(confirmed.reviewState);
    await commit(rooms(page).getByLabel('Length (ft)', { exact: true }), '12 ft'); await fullNumbers(page);
    await expect(card(page, 'floor-area')).toContainText('Provisional');
  });
  await test.step('I: opening undo restores geometry while retaining newer unrelated scope and raw waste', async () => {
    await item(page, doorId).click(); const before = await selected(page);
    await openings(page).getByRole('button', { name: 'Delete door', exact: true }).click();
    await expect(panel(page)).toContainText(/removed.*takeoff target|scope.*removed/i);
    await configure(page, 'crown'); await panel(page).getByRole('button', { name: 'Clear targets', exact: true }).click();
    await panel(page).getByRole('checkbox', { name: 'Include Alpha · top wall', exact: true }).check();
    await configure(page, 'floor-area'); await panel(page).getByLabel('Waste percentage', { exact: true }).fill('10.');
    const later = await selected(page);
    await page.getByRole('button', { name: 'Undo opening delete', exact: true }).click();
    const restored = await selected(page);
    expect(restored.document).toEqual(before.document); expect(restored.request).toEqual(later.request);
    expect(restored.takeoffState!.wasteFields).toEqual(later.takeoffState!.wasteFields);
    await expect(panel(page).getByLabel('Waste percentage', { exact: true })).toHaveValue('10.');
    await expect(total(page, 'floor-area').locator('[data-amount="adjusted"]')).toContainText('Unavailable');
    await expect(card(page, 'door-casing')).toContainText('No targets selected');
    await allTargets(page, 'door-casing'); await allTargets(page, 'opening-inventory');
  });
  await test.step('J: view navigation and same-tab reload recover exact draft, raw inputs, scope and source evidence', async () => {
    await item(page, windowId).click(); await openings(page).getByLabel('Window height', { exact: true }).fill('3 ft -');
    const pending = await selected(page);
    await page.getByRole('tab', { name: 'Quick Rooms', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Quick Rooms', exact: true })).toHaveAttribute('aria-selected', 'true');
    await showDrawing(page);
    await item(page, windowId).click(); await expect(openings(page).getByLabel('Window height', { exact: true })).toHaveValue('3 ft -');
    await page.getByRole('link', { name: 'Standalone Quick Rooms', exact: true }).click();
    await expect(page.getByTestId('quick-room-card').getByLabel('Ceiling height', { exact: true })).toHaveValue('7 ft');
    expect(await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY)).toBe(sourceBytes);
    await page.goto('/physical-draft'); await page.reload();
    expect(await selected(page)).toEqual(pending); expect((await selected(page)).source).toEqual(source);
    await expect(page.getByTestId('physical-draft-id')).toHaveText(draftId);
    await item(page, windowId).click(); await expect(openings(page).getByLabel('Window height', { exact: true })).toHaveValue('3 ft -');
    await configure(page, 'floor-area'); await expect(panel(page).getByLabel('Waste percentage', { exact: true })).toHaveValue('10.');
    await amount(total(page, 'floor-area'), 'net', '120.00 sq ft'); await amount(total(page, 'gross-wall-area'), 'net', '352.00 sq ft');
    await expect(total(page, 'net-wall-area')).toContainText('Full selected total unavailable');
    await amount(card(page, 'net-wall-area').getByTestId('takeoff-subtotal'), 'net', '256.00 sq ft');
    await expect(total(page, 'floor-area').locator('[data-amount="adjusted"]')).toContainText('Unavailable');
    expect((await selected(page)).document.openings.map(value => value.id)).toEqual([doorId, windowId]);
    expect(await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY)).toBe(sourceBytes);
  });
});

test('populated long-label review and takeoff stay usable with keyboard focus on desktop tablet and phone', async ({ page }) => {
  test.setTimeout(60_000);
  const name = 'Alpha primary bedroom with south-facing windows and hallway access';
  const alpha = await createRoom(page, name), door = await createOpening(page, 'door'), window = await createOpening(page, 'window');
  await work(page, ['floor-area', 'net-wall-area', 'opening-inventory']);
  await configure(page, 'floor-area'); await commit(panel(page).getByLabel('Waste percentage', { exact: true }), '10');
  const before = await selected(page);
  for (const [size, width, height] of [['desktop', 1600, 1200], ['tablet', 820, 1100], ['phone', 390, 844]] as const) {
    await page.setViewportSize({ width, height }); await showDrawing(page); await item(page, door.id).click();
    await expect(openings(page).getByLabel('Door height', { exact: true })).toHaveValue('7 ft');
    await openings(page).getByLabel('Door width', { exact: true }).focus(); await page.keyboard.press('Control+A'); await page.keyboard.press('ArrowRight');
    await expect(openings(page).getByLabel('Door width', { exact: true })).toBeFocused();
    await page.getByRole('button', { name, exact: true }).click();
    await expect(rooms(page).getByLabel('Ceiling height (ft)', { exact: true })).toHaveValue('8 ft');
    await reviewTarget(page, alpha.id); await configure(page, 'floor-area');
    await amount(total(page, 'floor-area'), 'adjusted', '132.00 sq ft'); await amount(total(page, 'net-wall-area'), 'net', '319.00 sq ft');
    await revealBreakdown(page, 'net-wall-area');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), size + ' page has no horizontal overflow').toBe(true);
    const selector = panel(page).getByRole('combobox', { name: 'Configure work', exact: true });
    expect((await selector.boundingBox())!.width).toBeGreaterThanOrEqual(160);
    await page.screenshot({ path: test.info().outputPath('journey-' + size + '.png'), fullPage: true });
    const trigger = page.getByTestId('review-field-room-' + alpha.id + '-length').getByRole('button', { name: 'Review Length', exact: true });
    await trigger.focus(); await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Review measurement', exact: true });
    await expect(dialog).toContainText(name); await expect(dialog).toContainText('12 ft');
    for (let index = 0; index < 4; index++) {
      await page.keyboard.press('Tab');
      expect(await dialog.evaluate(node => node.contains(document.activeElement)), 'Tab remains inside review dialog').toBe(true);
    }
    await dialog.getByRole('button', { name: 'Confirm reviewed value', exact: true }).scrollIntoViewIfNeeded();
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('journey-review-' + size + '.png'), fullPage: false });
    await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); await expect(trigger).toBeFocused();
    expect((await selected(page)).document).toEqual(before.document); expect((await selected(page)).request).toEqual(before.request);
  }
  await item(page, window.id).click(); await commit(openings(page).getByLabel('Window height', { exact: true }), '99 ft');
  await expect(page.getByRole('alert').first()).toBeVisible();
  await expect(openings(page).getByLabel('Window height', { exact: true })).toHaveValue('99 ft');
  await expect(total(page, 'net-wall-area')).toContainText('Full selected total unavailable');
  expect((await selected(page)).document).toEqual(before.document);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('journey-phone-partial-error.png'), fullPage: true });
});
