import { expect, test, type Locator, type Page } from '@playwright/test';
import { parseRegistry, serializeRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import { adoptPhysicalDraft, createRegistry, insertDraft, type PhysicalDraft } from '../../client/src/features/physical-draft/state';
import { parseMeasurement } from '../../shared/domain/parseMeasurement';
import type { PhysicalDocument } from '../../shared/domain/document';

const LABELS = {
  'floor-area': 'Floor area', 'ceiling-area': 'Flat ceiling area', 'gross-wall-area': 'Gross wall area',
  'net-wall-area': 'Net wall area', baseboard: 'Baseboard', 'base-shoe': 'Base shoe', crown: 'Crown',
  'door-casing': 'Door casing', 'window-casing': 'Window casing', 'opening-inventory': 'Physical opening inventory',
} as const;
type Output = keyof typeof LABELS;
const panel = (page: Page) => page.getByTestId('takeoff-panel');
const card = (page: Page, output: Output) => page.getByTestId('takeoff-output-' + output);
const total = (page: Page, output: Output) => card(page, output).getByTestId('takeoff-total');
const roomInspector = (page: Page) => page.getByTestId('physical-room-inspector');
const openingInspector = (page: Page) => page.getByTestId('physical-opening-inspector');
const frames = (page: Page) => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
async function selected(page: Page): Promise<PhysicalDraft> {
  await expect.poll(async () => parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY)).status).toBe('recovered');
  const result = parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY));
  if (result.status !== 'recovered') throw new Error('Expected a validated physical draft registry');
  const draft = result.registry.drafts.find(item => item.id === result.registry.selectedDraftId);
  if (!draft) throw new Error('No selected physical draft');
  return draft;
}
async function commit(input: Locator, value: string) { await input.fill(value); await input.press('Enter'); await input.press('Tab'); }
async function room(page: Page, name = 'Alpha', length = '12 ft', width = '10 ft', height = '8 ft') {
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await roomInspector(page).getByLabel('Room name', { exact: true }).fill(name);
  for (const [field, value] of [['Length', length], ['Width', width], ['Ceiling height', height]]) await commit(roomInspector(page).getByLabel(field + ' (ft)', { exact: true }), value);
  for (const [label, value] of [['Ceiling model', 'flat'], ['Wall model', 'vertical-uniform'], ['Crown path', 'rectangular-horizontal']]) await roomInspector(page).getByLabel(label, { exact: true }).selectOption(value);
  return (await selected(page)).document.rooms.find(item => item.name === name)!;
}
async function start(page: Page) {
  await page.goto('/physical-draft');
  await page.getByRole('button', { name: 'New physical draft', exact: true }).click();
  return room(page);
}
async function opening(page: Page, kind: 'door' | 'window', width: string, height: string, sill: string, offset: string) {
  await page.getByRole('button', { name: 'Create ' + kind, exact: true }).click();
  const label = kind[0].toUpperCase() + kind.slice(1), inspector = openingInspector(page);
  await commit(inspector.getByLabel('Position from wall start', { exact: true }), offset);
  await commit(inspector.getByLabel(label + ' width', { exact: true }), width);
  await commit(inspector.getByLabel(label + ' height', { exact: true }), height);
  await commit(inspector.getByLabel('Sill height', { exact: true }), sill);
  await inspector.getByLabel('Measurement basis', { exact: true }).selectOption('finished');
  return (await selected(page)).document.openings.at(-1)!;
}
async function fixture(page: Page) {
  const alpha = await start(page);
  const door = await opening(page, 'door', '3 ft', '7 ft', '0', '2.5 ft');
  const window = await opening(page, 'window', '4 ft', '3 ft', '3 ft', '8 ft');
  return { alpha, door, window };
}
async function configure(page: Page, output: Output) { await panel(page).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption(output); }
async function allTargets(page: Page, output: Output) {
  await configure(page, output);
  const kind = output === 'opening-inventory' ? 'openings' : output.endsWith('casing') ? 'faces' : ['floor-area', 'ceiling-area'].includes(output) ? 'rooms' : 'walls';
  await panel(page).getByRole('button', { name: 'All current ' + kind, exact: true }).click();
}
async function work(page: Page, outputs: Output[], includeAll = true) {
  for (const [output, label] of Object.entries(LABELS)) await panel(page).getByRole('checkbox', { name: 'Measure ' + label, exact: true }).setChecked(outputs.includes(output as Output));
  if (includeAll) for (const output of outputs) await allTargets(page, output);
}
async function amount(scope: Locator, key: string, value: string) { await expect(scope.locator('[data-amount="' + key + '"]')).toHaveText(value); }
async function breakdown(page: Page, output: Output) { await card(page, output).getByText('Show breakdown', { exact: true }).click(); }
async function adopt(page: Page, source: PhysicalDocument, id: string) {
  const draft = adoptPhysicalDraft(source, id);
  const raw = serializeRegistry(insertDraft(createRegistry(), draft));
  expect(parseRegistry(raw).status).toBe('recovered');
  await page.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), { key: KEY, raw });
  await page.reload();
  return draft;
}
const errors = new WeakMap<Page, string[]>(), writes = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  errors.set(page, []); writes.set(page, []);
  page.on('pageerror', error => errors.get(page)!.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.get(page)!.push(request.method() + ' ' + request.url()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); expect(writes.get(page)).toEqual([]); });

test('UI-built takeoff visibly reconciles all ten outputs, opening deductions and one waste allowance', async ({ page }) => {
  const { door, window } = await fixture(page);
  const original = (await selected(page)).document;
  await work(page, Object.keys(LABELS) as Output[]);
  for (const [output, value] of [['floor-area', '120.00 sq ft'], ['ceiling-area', '120.00 sq ft'], ['gross-wall-area', '352.00 sq ft'], ['net-wall-area', '319.00 sq ft'], ['baseboard', '41.00 ft'], ['base-shoe', '41.00 ft'], ['crown', '44.00 ft'], ['door-casing', '17.00 ft'], ['window-casing', '14.00 ft']] as const) {
    await amount(total(page, output), 'net', value);
    await expect(card(page, output)).toContainText(/provisional/i);
  }
  await amount(total(page, 'net-wall-area'), 'gross', '352.00 sq ft');
  await amount(total(page, 'net-wall-area'), 'raw-deductions', '33.00 sq ft');
  await amount(total(page, 'net-wall-area'), 'effective-deductions', '33.00 sq ft');
  await expect(card(page, 'opening-inventory')).toContainText(/doors?\s*:?\s*1/i);
  await expect(card(page, 'opening-inventory')).toContainText(/windows?\s*:?\s*1/i);
  await breakdown(page, 'net-wall-area');
  await expect(card(page, 'net-wall-area').getByText('21.00 sq ft', { exact: true }).first()).toBeVisible();
  await expect(card(page, 'net-wall-area').getByText('12.00 sq ft', { exact: true }).first()).toBeVisible();
  await configure(page, 'floor-area'); await commit(panel(page).getByLabel('Waste percentage', { exact: true }), '10');
  await amount(total(page, 'floor-area'), 'net', '120.00 sq ft');
  await amount(total(page, 'floor-area'), 'allowance', '12.00 sq ft');
  await amount(total(page, 'floor-area'), 'adjusted', '132.00 sq ft');
  const current = await selected(page);
  expect(current.request.selections.find(value => value.output === 'floor-area')).toMatchObject({ wasteFraction: .1 });
  expect(current.document).toEqual(original);
  expect(current.document.openings.map(value => value.id)).toEqual([door.id, window.id]);
});

test('top-wall scope and incomplete opening height show explicit partial results without a stale full total', async ({ page }) => {
  const { window } = await fixture(page);
  await work(page, ['floor-area', 'gross-wall-area', 'net-wall-area', 'baseboard']);
  for (const output of ['gross-wall-area', 'net-wall-area', 'baseboard'] as const) {
    await configure(page, output); await panel(page).getByRole('button', { name: 'Clear targets', exact: true }).click();
    await panel(page).getByRole('checkbox', { name: 'Include Alpha · top wall', exact: true }).check();
  }
  await amount(total(page, 'gross-wall-area'), 'net', '96.00 sq ft');
  await amount(total(page, 'net-wall-area'), 'gross', '96.00 sq ft');
  await amount(total(page, 'net-wall-area'), 'effective-deductions', '33.00 sq ft');
  await amount(total(page, 'net-wall-area'), 'net', '63.00 sq ft');
  await amount(total(page, 'baseboard'), 'net', '9.00 ft');
  await allTargets(page, 'gross-wall-area'); await allTargets(page, 'net-wall-area');
  await page.getByTestId('physical-opening-list-' + window.id).click();
  await commit(openingInspector(page).getByLabel('Window height', { exact: true }), '');
  await amount(total(page, 'floor-area'), 'net', '120.00 sq ft');
  await amount(total(page, 'gross-wall-area'), 'net', '352.00 sq ft');
  await expect(total(page, 'net-wall-area')).toContainText(/unavailable/i);
  await expect(total(page, 'net-wall-area').locator('[data-amount="net"]')).toHaveCount(0);
  const partial = card(page, 'net-wall-area').getByTestId('takeoff-subtotal');
  await expect(partial.locator('..')).toContainText(/partial/i); await expect(partial.locator('..')).toContainText(/provisional/i);
  await amount(partial, 'net', '256.00 sq ft');
  await expect(card(page, 'net-wall-area')).toContainText(/Alpha · top wall/);
  await expect(card(page, 'net-wall-area')).toContainText(/excluded/i);
  await expect(card(page, 'net-wall-area')).toContainText(/window.*height/i);
  await page.screenshot({ path: test.info().outputPath('takeoff-partial.png'), fullPage: true });
});

test('custom targets survive room additions, inspection, unit changes and camera movement; empty means nothing selected', async ({ page }) => {
  const alpha = await start(page);
  await work(page, ['floor-area', 'net-wall-area']);
  await configure(page, 'net-wall-area'); await panel(page).getByRole('button', { name: 'Clear targets', exact: true }).click();
  await panel(page).getByRole('checkbox', { name: 'Include Alpha · top wall', exact: true }).check();
  await configure(page, 'floor-area'); await commit(panel(page).getByLabel('Waste percentage', { exact: true }), '10');
  const request = (await selected(page)).request;
  const beta = await room(page, 'Beta', '10 ft', '10 ft', '8 ft');
  expect((await selected(page)).request).toEqual(request);
  await expect(panel(page)).toContainText(/not included/i);
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await page.getByRole('tab', { name: 'Drawing', exact: true }).click();
  const drawing = page.getByRole('region', { name: 'Physical drawing', exact: true });
  await drawing.getByRole('button', { name: 'Fit drawing', exact: true }).click();
  await drawing.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await page.getByTestId('physical-canvas').evaluate(node => { node.scrollLeft += 21; node.scrollTop += 13; });
  await page.getByRole('button', { name: 'Beta', exact: true }).click();
  await breakdown(page, 'net-wall-area');
  const topRow = card(page, 'net-wall-area').locator('[data-target-id]').filter({ has: page.getByRole('heading', { name: 'Alpha · top wall', exact: true }) });
  await topRow.getByRole('button', { name: 'Locate source', exact: true }).click();
  await expect(page.getByTestId('physical-source-wall-' + alpha.wallFaces[0].id)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Beta', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Meters', exact: true }).click();
  expect((await selected(page)).request).toEqual(request);
  expect((await selected(page)).document.rooms.map(value => value.id)).toEqual([alpha.id, beta.id]);
  await configure(page, 'floor-area'); await panel(page).getByRole('button', { name: 'Clear targets', exact: true }).click();
  await expect(card(page, 'floor-area')).toContainText(/no targets|nothing selected|no .*selected/i);
  await expect(total(page, 'floor-area').locator('[data-amount="net"]')).toHaveCount(0);
  await work(page, [], false);
  expect((await selected(page)).request.selections).toEqual([]);
  await expect(panel(page)).toContainText(/no work|choose work|nothing selected/i);
  await expect(page.locator('[data-testid^="takeoff-output-"]')).toHaveCount(0);
});

test('multi-room waste is applied once and raw invalid waste masks adjusted results through recovery', async ({ page }) => {
  await start(page); await room(page, 'Beta', '10 ft', '10 ft', '8 ft');
  await work(page, ['floor-area']);
  await configure(page, 'floor-area'); await commit(panel(page).getByLabel('Waste percentage', { exact: true }), '10');
  await amount(total(page, 'floor-area'), 'net', '220.00 sq ft');
  await amount(total(page, 'floor-area'), 'allowance', '22.00 sq ft');
  await amount(total(page, 'floor-area'), 'adjusted', '242.00 sq ft');
  const before = await selected(page);
  await panel(page).getByLabel('Waste percentage', { exact: true }).fill('10.');
  await expect(total(page, 'floor-area').locator('[data-amount="adjusted"]')).toContainText(/unavailable/i);
  await expect(panel(page)).toContainText(/complete, nonnegative percentage|finish.*waste|unapplied/i);
  expect((await selected(page)).request).toEqual(before.request);
  const pending = await selected(page);
  await page.reload(); await configure(page, 'floor-area');
  await expect(panel(page).getByLabel('Waste percentage', { exact: true })).toHaveValue('10.');
  expect(await selected(page)).toEqual(pending);
  await expect(total(page, 'floor-area').locator('[data-amount="adjusted"]')).toContainText(/unavailable/i);
  await commit(panel(page).getByLabel('Waste percentage', { exact: true }), '10');
  await amount(total(page, 'floor-area'), 'adjusted', '242.00 sq ft');
  expect((await selected(page)).document).toEqual(before.document);
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await roomInspector(page).getByLabel('Length (ft)', { exact: true }).fill('12 ft -');
  await expect(total(page, 'floor-area')).toContainText(/unavailable/i);
  await amount(card(page, 'floor-area').getByTestId('takeoff-subtotal'), 'net', '100.00 sq ft');
  expect((await selected(page)).document).toEqual(before.document);
});

async function reviewTarget(page: Page, entity: 'room' | 'opening', id: string) {
  const toggle = panel(page).getByRole('button', { name: 'Review inputs', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await panel(page).getByRole('combobox', { name: 'Review target', exact: true }).selectOption(entity + ':' + id);
}
async function reviewField(page: Page, entity: 'room' | 'opening', id: string, field: string) {
  await reviewTarget(page, entity, id);
  await page.getByTestId('review-field-' + entity + '-' + id + '-' + field).getByRole('button', { name: /^Review / }).click();
  return page.getByRole('dialog', { name: 'Review measurement', exact: true });
}
async function confirmField(page: Page, entity: 'room' | 'opening', id: string, field: string) {
  const dialog = await reviewField(page, entity, id, field);
  await dialog.getByRole('button', { name: 'Confirm reviewed value', exact: true }).click();
  await expect(dialog).not.toBeVisible();
}

test('explicit measurement and model review confirms only seen inputs and stale review cannot confirm a newer value', async ({ page }) => {
  const alpha = await start(page);
  await work(page, ['floor-area', 'ceiling-area', 'gross-wall-area']);
  await confirmField(page, 'room', alpha.id, 'length');
  await confirmField(page, 'room', alpha.id, 'width');
  await expect(card(page, 'floor-area')).toContainText('Confirmed input basis');
  await expect(card(page, 'ceiling-area')).toContainText('Provisional');
  await reviewTarget(page, 'room', alpha.id);
  await panel(page).getByRole('button', { name: 'Review Ceiling model', exact: true }).click();
  const modelDialog = page.getByRole('dialog', { name: 'Review room model', exact: true });
  await expect(modelDialog).toContainText('Alpha'); await expect(modelDialog).toContainText(/flat/i);
  await modelDialog.getByRole('button', { name: 'Confirm reviewed model', exact: true }).click();
  await expect(card(page, 'ceiling-area')).toContainText('Confirmed input basis');
  await confirmField(page, 'room', alpha.id, 'ceilingHeight');
  await panel(page).getByRole('button', { name: 'Review Wall model', exact: true }).click();
  await modelDialog.getByRole('button', { name: 'Confirm reviewed model', exact: true }).click();
  await expect(card(page, 'gross-wall-area')).toContainText('Confirmed input basis');
  const confirmed = await selected(page);
  const dialog = await reviewField(page, 'room', alpha.id, 'length');
  // Simulate a concurrent edit through the public form event, not store internals.
  await roomInspector(page).getByLabel('Length (ft)', { exact: true }).evaluate(node => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(node, '13 ft');
    node.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(dialog).toContainText(/changed|stale|newer/i);
  await expect(dialog.getByRole('button', { name: 'Confirm reviewed value', exact: true })).toBeDisabled();
  expect((await selected(page)).events).toEqual(confirmed.events);
  await page.keyboard.press('Escape');
  await commit(roomInspector(page).getByLabel('Length (ft)', { exact: true }), '13 ft');
  const corrected = await selected(page), correctedRoom = corrected.document.rooms[0];
  expect(correctedRoom.length.state === 'known' && correctedRoom.length.provenance.confirmation.status).toBe('unconfirmed');
  expect(correctedRoom.width).toEqual(confirmed.document.rooms[0].width);
  expect(correctedRoom.ceilingHeight).toEqual(confirmed.document.rooms[0].ceilingHeight);
  await amount(total(page, 'floor-area'), 'net', '130.00 sq ft');
  await expect(card(page, 'floor-area')).toContainText('Provisional');
  await confirmField(page, 'room', alpha.id, 'length');
  await roomInspector(page).getByLabel('Ceiling model', { exact: true }).selectOption('unsupported');
  await expect(total(page, 'ceiling-area')).toContainText(/unavailable/i);
  await amount(total(page, 'floor-area'), 'net', '130.00 sq ft');
  await expect(card(page, 'floor-area')).toContainText('Confirmed input basis');
  const recovered = await selected(page);
  await page.reload(); expect(await selected(page)).toEqual(recovered);
  await expect(card(page, 'floor-area')).toContainText('Confirmed input basis');
});

test('basis mismatch stays explicit and candidate resolution is separate from confirmation with original evidence retained', async ({ page }) => {
  const { door } = await fixture(page);
  await work(page, ['floor-area', 'net-wall-area', 'door-casing']);
  await page.getByTestId('physical-opening-list-' + door.id).click();
  await openingInspector(page).getByLabel('Measurement basis', { exact: true }).selectOption('nominal');
  await expect(total(page, 'net-wall-area')).toContainText(/unavailable/i);
  await amount(total(page, 'floor-area'), 'net', '120.00 sq ft');
  await breakdown(page, 'door-casing');
  await expect(card(page, 'door-casing')).toContainText(/nominal.*finished|finished.*nominal/i);
  expect((await selected(page)).document.openings[0].measureBasis).toBe('nominal');
  await openingInspector(page).getByLabel('Measurement basis', { exact: true }).selectOption('unknown');
  await expect(total(page, 'door-casing')).toContainText(/unavailable/i);
  await openingInspector(page).getByLabel('Measurement basis', { exact: true }).selectOption('finished');
  const source = structuredClone((await selected(page)).document), width = source.openings[0].width;
  if (width.state !== 'known') throw new Error('Expected measured source width');
  const alternative = parseMeasurement('32 in', { selectedUnit: 'ft' });
  if (!alternative.ok) throw new Error('Invalid independent candidate fixture');
  source.openings[0].width = { state: 'needs-review', valueMm: null, reason: 'Two supplied widths disagree', candidates: [
    { label: 'Drawing source: 36 inches', valueMm: width.valueMm, provenance: structuredClone(width.provenance) },
    { label: 'Field measurement: 32 inches', valueMm: alternative.measurement.valueMm, provenance: alternative.measurement.provenance },
  ] };
  const adopted = await adopt(page, source, 'candidate-takeoff');
  await work(page, ['door-casing']);
  const dialog = await reviewField(page, 'opening', door.id, 'width');
  await expect(dialog.getByRole('combobox', { name: 'Measurement candidate', exact: true })).toHaveValue('');
  await expect(dialog.getByRole('button', { name: 'Resolve candidate', exact: true })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Confirm reviewed value', exact: true })).toBeDisabled();
  await dialog.getByRole('combobox', { name: 'Measurement candidate', exact: true }).selectOption('1');
  await dialog.getByRole('button', { name: 'Resolve candidate', exact: true }).click();
  const resolved = await selected(page), resolvedWidth = resolved.document.openings[0].width;
  expect(resolvedWidth.state).toBe('known'); expect(resolvedWidth.valueMm).toBe(812.8);
  expect(resolvedWidth.state === 'known' && resolvedWidth.provenance.confirmation.status).toBe('unconfirmed');
  expect(resolved.events.at(-1)!.event.action).toBe('resolve-candidate');
  expect(resolved.events.at(-1)!.event.before).toEqual(source.openings[0].width);
  expect(resolved.source).toEqual(adopted.source);
  await confirmField(page, 'opening', door.id, 'width');
  const after = await selected(page);
  expect(after.document.openings[0].width.state === 'known' && after.document.openings[0].width.provenance.confirmation.status).toBe('confirmed');
  expect(after.events.at(-1)!.event.action).toBe('confirm');
  expect(after.source.original).toEqual(source);
  await page.reload(); expect(await selected(page)).toEqual(after);
});

test('shared inventory counts once, casing counts selected faces, and delete undo preserves a later scope decision', async ({ page }) => {
  const { alpha, door } = await fixture(page);
  const beta = await room(page, 'Beta');
  const source = structuredClone((await selected(page)).document);
  source.openings[0].attachments.push({ wallFaceId: beta.wallFaces[0].id, anchor: 'center', offsetMm: door.attachments[0].offsetMm });
  await adopt(page, source, 'shared-takeoff');
  await work(page, ['door-casing', 'opening-inventory']);
  await amount(total(page, 'door-casing'), 'net', '34.00 ft');
  await expect(card(page, 'opening-inventory')).toContainText(/Doors:\s*1/);
  await configure(page, 'door-casing');
  await panel(page).getByRole('checkbox', { name: 'Include Door 1 · Beta · top wall', exact: true }).uncheck();
  await amount(total(page, 'door-casing'), 'net', '17.00 ft');
  expect((await selected(page)).document.openings[0].attachments).toHaveLength(2);
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  await page.getByTestId('physical-opening-list-' + door.id).click();
  await openingInspector(page).getByRole('button', { name: 'Delete door', exact: true }).click();
  const afterDelete = await selected(page);
  expect(afterDelete.request.selections.find(value => value.output === 'door-casing')).toMatchObject({ faces: [] });
  expect(afterDelete.request.selections.find(value => value.output === 'opening-inventory')).toMatchObject({ openingIds: [source.openings[1].id] });
  await expect(panel(page)).toContainText(/removed.*takeoff target|scope.*removed/i);
  // An away-and-back edit is still newer and must not be erased by geometry undo.
  await panel(page).getByRole('combobox', { name: 'Opening measurement basis for takeoff', exact: true }).selectOption('nominal');
  await panel(page).getByRole('combobox', { name: 'Opening measurement basis for takeoff', exact: true }).selectOption('finished');
  const later = await selected(page); expect(later.request).toEqual(afterDelete.request);
  await page.getByRole('button', { name: 'Undo opening delete', exact: true }).click();
  const restored = await selected(page);
  expect(restored.document.openings).toEqual(source.openings);
  expect(restored.request).toEqual(later.request); expect(restored.source.original).toEqual(source);
  await expect(card(page, 'door-casing')).toContainText('No targets selected');
  await expect(card(page, 'opening-inventory')).toContainText(/Doors:\s*0/);
  expect(restored.document.rooms.map(value => value.id)).toEqual([alpha.id, beta.id]);
});

test('crown deducts only an explicitly selected validated full-height gap and displays a valid zero', async ({ page }) => {
  await page.goto('/physical-draft');
  await page.getByRole('button', { name: 'New physical draft', exact: true }).click();
  await room(page, 'Alpha', '3 ft', '10 ft', '8 ft');
  const door = await opening(page, 'door', '3 ft', '7 ft', '0', '1.5 ft');
  await work(page, ['crown']); await configure(page, 'crown');
  await panel(page).getByRole('button', { name: 'Clear targets', exact: true }).click();
  await panel(page).getByRole('checkbox', { name: 'Include Alpha · top wall', exact: true }).check();
  await amount(total(page, 'crown'), 'net', '3.00 ft');
  const gap = panel(page).getByRole('checkbox', { name: 'Deduct full-height gap Door 1 · Alpha · top wall', exact: true });
  await gap.check(); await expect(total(page, 'crown')).toContainText(/unavailable/i);
  await page.getByTestId('physical-opening-list-' + door.id).click();
  await commit(openingInspector(page).getByLabel('Door height', { exact: true }), '8 ft');
  await amount(total(page, 'crown'), 'gross', '3.00 ft');
  await amount(total(page, 'crown'), 'effective-deductions', '3.00 ft');
  await amount(total(page, 'crown'), 'net', '0.00 ft'); await expect(card(page, 'crown')).toContainText('Provisional');
  await gap.uncheck(); await amount(total(page, 'crown'), 'net', '3.00 ft');
});

test('populated desktop tablet and phone takeoff controls remain usable without mutating measurements or scope', async ({ page }) => {
  await fixture(page); await work(page, ['floor-area', 'net-wall-area', 'opening-inventory']);
  await configure(page, 'floor-area'); await commit(panel(page).getByLabel('Waste percentage', { exact: true }), '10');
  const before = await selected(page);
  for (const [name, width, height] of [['desktop', 1600, 1200], ['tablet', 820, 1100], ['phone', 390, 844]] as const) {
    await page.setViewportSize({ width, height }); await configure(page, 'floor-area');
    await expect(panel(page).getByLabel('Waste percentage', { exact: true })).toBeVisible();
    const selectBounds = await panel(page).getByRole('combobox', { name: 'Configure work', exact: true }).boundingBox();
    expect(selectBounds!.width, 'The active work selector must remain readable beside its actions').toBeGreaterThanOrEqual(160);
    await amount(total(page, 'floor-area'), 'adjusted', '132.00 sq ft');
    await amount(total(page, 'net-wall-area'), 'net', '319.00 sq ft');
    await expect(card(page, 'opening-inventory')).toContainText(/Doors:\s*1/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await panel(page).scrollIntoViewIfNeeded(); await frames(page);
    await page.screenshot({ path: test.info().outputPath('takeoff-' + name + '.png'), fullPage: true });
    expect((await selected(page)).document).toEqual(before.document);
    expect((await selected(page)).request).toEqual(before.request);
  }
});
