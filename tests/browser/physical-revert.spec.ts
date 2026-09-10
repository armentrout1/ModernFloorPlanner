import { openResponsiveInspector, closeResponsiveInspector } from './physical-inspector-helpers';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { parseRegistry, serializeRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import { adoptPhysicalDraft, createRegistry, insertDraft, type PhysicalDraft } from '../../client/src/features/physical-draft/state';
import { parseMeasurement } from '../../shared/domain/parseMeasurement';

const QUICK_KEY = 'modern-floor-planner:quick-rooms:v1';
const rooms = (page: Page) => page.getByTestId('physical-room-inspector');
const openings = (page: Page) => page.getByTestId('physical-opening-inspector');
const field = (page: Page, label: string) => rooms(page).getByLabel(new RegExp('^' + label + ' \\((ft|m)\\)$'));
const revert = (page: Page, name: string) => page.getByRole('button', { name: 'Revert ' + name, exact: true });
const panel = (page: Page) => page.getByTestId('takeoff-panel');
const total = (page: Page, output: string) => page.getByTestId('takeoff-output-' + output).getByTestId('takeoff-total');
const labels = { 'floor-area': 'Floor area', 'gross-wall-area': 'Gross wall area', baseboard: 'Baseboard',
  'door-casing': 'Door casing', 'opening-inventory': 'Physical opening inventory' } as const;
type Output = keyof typeof labels;

// All main fixtures and writes use the compiled public UI. Recovery reads below
// compare the complete domain/evidence, not only the displayed result.
async function selected(page: Page): Promise<PhysicalDraft> {
  await expect.poll(async () => parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY)).status).toBe('recovered');
  const parsed = parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY));
  if (parsed.status !== 'recovered') throw new Error('Expected validated recovery');
  const draft = parsed.registry.drafts.find(value => value.id === parsed.registry.selectedDraftId);
  if (!draft) throw new Error('No selected draft');
  return draft;
}
function domain(draft: PhysicalDraft) {
  return { id: draft.id, document: draft.document, request: draft.request, events: draft.events,
    openingEvents: draft.openingEvents, openingDeleteUndo: draft.openingDeleteUndo,
    reviewState: draft.reviewState, source: draft.source };
}
async function unchanged(page: Page, before: PhysicalDraft) { expect(domain(await selected(page))).toEqual(domain(before)); }
async function commit(input: Locator, value: string) { await input.fill(value); await input.press('Enter'); await input.press('Tab'); }
async function room(page: Page, name = 'Alpha') {
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await rooms(page).getByLabel('Room name', { exact: true }).fill(name);
  for (const [name, text] of [['Length', '12 ft'], ['Width', '10 ft'], ['Ceiling height', '8 ft']]) await commit(field(page, name), text);
  return (await selected(page)).document.rooms.find(value => value.name === name)!;
}
async function start(page: Page) {
  await page.goto('/physical-draft');
  await page.getByRole('button', { name: 'New physical draft', exact: true }).click();
  return room(page);
}
async function opening(page: Page, kind: 'door' | 'window') {
  await page.getByRole('button', { name: 'Create ' + kind, exact: true }).click();
  const name = kind === 'door' ? 'Door' : 'Window', values = kind === 'door' ? ['3 ft', '7 ft', '0', '2.5 ft'] : ['4 ft', '3 ft', '3 ft', '8 ft'];
  for (const [label, value] of [['Position from wall start', values[3]], [name + ' width', values[0]],
    [name + ' height', values[1]], ['Sill height', values[2]]]) await commit(openings(page).getByLabel(label, { exact: true }), value);
  await openings(page).getByLabel('Measurement basis', { exact: true }).selectOption('finished');
  return (await selected(page)).document.openings.at(-1)!;
}
async function configure(page: Page, output: Output) { await panel(page).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption(output); }
async function work(page: Page, outputs: Output[]) {
  for (const output of outputs) {
    await panel(page).getByRole('checkbox', { name: 'Measure ' + labels[output], exact: true }).check();
    await configure(page, output);
    const kind = output === 'opening-inventory' ? 'openings' : output === 'door-casing' ? 'faces' : output === 'floor-area' ? 'rooms' : 'walls';
    await panel(page).getByRole('button', { name: 'All current ' + kind, exact: true }).click();
  }
}
async function amount(page: Page, output: string, name: string, value: string) {
  await expect(total(page, output).locator('[data-amount="' + name + '"]')).toHaveText(value);
}
async function review(page: Page, roomId: string, name = 'length') {
  const toggle = panel(page).getByRole('button', { name: 'Review inputs', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await panel(page).getByRole('combobox', { name: 'Review target', exact: true }).selectOption('room:' + roomId);
  await page.getByTestId('review-field-room-' + roomId + '-' + name).getByRole('button', { name: /^Review / }).click();
  return page.getByRole('dialog', { name: 'Review measurement', exact: true });
}
async function confirm(page: Page, roomId: string, name: string) {
  await (await review(page, roomId, name)).getByRole('button', { name: 'Confirm reviewed value', exact: true }).click();
}
const errors = new WeakMap<Page, string[]>(), writes = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  errors.set(page, []); writes.set(page, []);
  page.on('pageerror', error => errors.get(page)!.push(error.message));
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.get(page)!.push(request.method() + ' ' + request.url()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); expect(writes.get(page)).toEqual([]); });

test('room Revert cancels pointer and keyboard drafts without committing, preserving review, units and recovery', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/quick-room'); await page.getByRole('button', { name: 'Add room', exact: true }).click();
  const quick = page.getByTestId('quick-room-card');
  for (const [name, value] of [['Length', '12 ft'], ['Width', '10 ft'], ['Ceiling height', '8 ft']]) await commit(quick.getByLabel(name, { exact: true }), value);
  const sourceBytes = await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY); expect(sourceBytes).not.toBeNull();
  await page.getByRole('button', { name: 'Open a physical copy', exact: true }).click();
  const id = (await selected(page)).document.rooms[0].id;
  await work(page, ['floor-area', 'gross-wall-area']); await confirm(page, id, 'length'); await confirm(page, id, 'width');
  const confirmed = await selected(page);
  expect(confirmed.document.rooms[0].length.state === 'known' && confirmed.document.rooms[0].length.provenance.confirmation.status).toBe('confirmed');
  for (const value of ['12 ft -', '13 ft']) {
    await field(page, 'Length').fill(value); const pending = await selected(page);
    await revert(page, 'length').click(); await expect(field(page, 'Length')).toHaveValue('12 ft');
    await expect(revert(page, 'length')).toHaveCount(0); await unchanged(page, confirmed);
    expect((await selected(page)).localEditRevision).toBe(pending.localEditRevision + 1);
    await amount(page, 'floor-area', 'net', '120.00 sq ft');
  }
  for (const key of ['Enter', 'Space']) {
    await field(page, 'Length').fill('13 ft'); const pending = await selected(page);
    await field(page, 'Length').press('Tab'); await expect(revert(page, 'length')).toBeFocused();
    await unchanged(page, confirmed); await page.keyboard.press(key);
    await expect(field(page, 'Length')).toHaveValue('12 ft'); await expect(field(page, 'Length')).toBeFocused();
    await unchanged(page, confirmed); expect((await selected(page)).localEditRevision).toBe(pending.localEditRevision + 1);
  }
  // Cancelling a different field must not steal focus and commit this valid edit.
  await field(page, 'Length').fill('12 ft -'); await field(page, 'Width').fill('11 ft');
  const otherPending = await selected(page); await revert(page, 'length').click();
  await expect(field(page, 'Width')).toBeFocused(); await unchanged(page, confirmed);
  expect((await selected(page)).fields[id].width).toEqual(otherPending.fields[id].width);
  await revert(page, 'width').click(); await unchanged(page, confirmed);
  // Passing through Revert without activating it is an ordinary leave-field commit.
  await field(page, 'Length').fill('13 ft'); await field(page, 'Length').press('Tab');
  await expect(revert(page, 'length')).toBeFocused(); await unchanged(page, confirmed);
  await page.keyboard.press('Tab'); await amount(page, 'floor-area', 'net', '130.00 sq ft');
  expect((await selected(page)).events).toHaveLength(confirmed.events.length + 1);
  // A successful commit remains committed; clean Escape is not historical undo.
  const committed = await selected(page);
  await expect(revert(page, 'length')).toHaveCount(0); await field(page, 'Length').press('Escape');
  expect(await selected(page)).toEqual(committed); await amount(page, 'floor-area', 'net', '130.00 sq ft');
  await commit(field(page, 'Length'), '12 ft'); await confirm(page, id, 'length');
  await field(page, 'Width').fill('10 ft -'); await field(page, 'Length').fill('12 ft -');
  await page.getByRole('button', { name: 'Meters', exact: true }).click();
  const twoPending = await selected(page);
  await revert(page, 'length').click(); const reverted = await selected(page);
  await expect(field(page, 'Length')).toHaveValue('3.6576 m');
  expect(reverted.fields[id].length).toEqual({ text: '3.6576 m', unit: 'm', dirty: false });
  expect(reverted.fields[id].width).toEqual(twoPending.fields[id].width); await unchanged(page, twoPending);
  await expect(total(page, 'floor-area')).toContainText(/unavailable/i);
  await page.getByRole('tab', { name: 'Drawing', exact: true }).click();
  await page.getByRole('link', { name: 'Standalone Quick Rooms', exact: true }).click();
  await page.goto('/physical-draft'); await page.reload(); expect(await selected(page)).toEqual(reverted);
  await expect(field(page, 'Length')).toHaveValue('3.6576 m'); await expect(field(page, 'Width')).toHaveValue('10 ft -');
  expect(await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY)).toBe(sourceBytes);
});

test('opening Revert preserves identity and appearance for rejected geometry, valid pending edits and zero sill', async ({ page }) => {
  await start(page); const door = await opening(page, 'door'), window = await opening(page, 'window');
  await page.getByTestId('physical-opening-list-' + door.id).click(); const before = await selected(page);
  const height = openings(page).getByLabel('Door height', { exact: true });
  await commit(height, '99 ft'); await expect(openings(page)).toContainText(/must fit.*ceiling/i);
  await revert(page, 'door height').click(); await expect(height).toHaveValue('7 ft'); await unchanged(page, before);
  for (const [label, name, text, restored] of [['Door width', 'door width', '32 in', '3 ft'],
    ['Sill height', 'sill height', '1 ft', '0 ft'], ['Position from wall start', 'position from wall start', '0', '2.5 ft']]) {
    const input = openings(page).getByLabel(label, { exact: true }); await input.fill(text);
    if (label === 'Position from wall start') await input.press('Enter');
    else { await input.press('Tab'); await expect(revert(page, name)).toBeFocused(); }
    const pending = await selected(page); await revert(page, name).click();
    await expect(input).toHaveValue(restored); await unchanged(page, before);
    expect((await selected(page)).localEditRevision).toBe(pending.localEditRevision + 1);
  }
  await page.getByTestId('physical-opening-list-' + window.id).click();
  await openings(page).getByLabel('Window height', { exact: true }).fill('3 ft -');
  await openings(page).getByLabel('Window width', { exact: true }).fill('4 ft -');
  await page.getByRole('button', { name: 'Meters', exact: true }).click(); const pending = await selected(page);
  await openings(page).getByLabel('Window width', { exact: true }).press('Escape');
  await expect(openings(page).getByLabel('Window width', { exact: true })).toHaveValue('1.2192 m');
  expect((await selected(page)).openingFields![window.id].height).toEqual(pending.openingFields![window.id].height);
  await unchanged(page, before);
  await revert(page, 'window height').click(); await expect(openings(page).getByLabel('Window height', { exact: true })).toHaveValue('0.9144 m');
  await unchanged(page, before);
});

test('waste Revert restores its committed percentage and retains intervening scope protection for opening Undo', async ({ page }) => {
  await start(page); const door = await opening(page, 'door'); await work(page, ['floor-area', 'baseboard', 'door-casing', 'opening-inventory']);
  await configure(page, 'floor-area'); const waste = panel(page).getByLabel('Waste percentage', { exact: true });
  await commit(waste, '10'); await configure(page, 'baseboard'); await waste.fill('5.');
  await configure(page, 'floor-area'); const before = await selected(page);
  for (const text of ['20', '10.']) {
    await waste.fill(text); await waste.press('Tab'); await expect(revert(page, 'floor waste')).toBeFocused();
    await unchanged(page, before); await page.keyboard.press('Enter');
    await expect(waste).toHaveValue('10'); await unchanged(page, before);
    expect((await selected(page)).takeoffState!.wasteFields.baseboard).toEqual(before.takeoffState!.wasteFields.baseboard);
    await amount(page, 'floor-area', 'net', '120.00 sq ft'); await amount(page, 'floor-area', 'allowance', '12.00 sq ft'); await amount(page, 'floor-area', 'adjusted', '132.00 sq ft');
  }
  await page.getByTestId('physical-opening-list-' + door.id).click();
  await openings(page).getByRole('button', { name: 'Delete door', exact: true }).click();
  const deleted = await selected(page); await waste.fill('20'); await revert(page, 'floor waste').click();
  const cancelled = await selected(page); await unchanged(page, deleted);
  expect(cancelled.takeoffState!.scopeRevision).toBeGreaterThan(deleted.takeoffState!.scopeRevision);
  await page.getByRole('button', { name: 'Undo opening delete', exact: true }).click();
  const restored = await selected(page);
  expect(restored.document).toEqual(before.document); expect(restored.request).toEqual(cancelled.request);
  expect(restored.takeoffState!.wasteFields.baseboard).toEqual(before.takeoffState!.wasteFields.baseboard);
  await expect(page.getByTestId('takeoff-output-door-casing')).toContainText('No targets selected');
  await expect(page.getByTestId('takeoff-output-opening-inventory')).toContainText('No targets selected');
  await configure(page, 'baseboard'); await revert(page, 'baseboard waste').click(); await expect(waste).toHaveValue('0');
  expect((await selected(page)).request).toEqual(cancelled.request); await amount(page, 'baseboard', 'allowance', '0.00 ft');
});

test('Escape respects composition, handled events, menus, dialogs and stale or inactive inputs', async ({ page }) => {
  const alpha = await start(page); await work(page, ['floor-area']);
  await field(page, 'Length').fill('12 ft -'); const pending = await selected(page);
  // Synthetic keyboard boundaries exercise flags unavailable through press().
  for (const mode of ['repeat', 'composing', 'handled', 'modified']) {
    await field(page, 'Length').evaluate((node, mode) => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true,
        repeat: mode === 'repeat', isComposing: mode === 'composing', shiftKey: mode === 'modified' });
      if (mode === 'handled') event.preventDefault(); node.dispatchEvent(event);
    }, mode);
    expect(await selected(page)).toEqual(pending);
  }
  await field(page, 'Length').dispatchEvent('compositionstart'); await field(page, 'Length').press('Escape');
  expect(await selected(page)).toEqual(pending); await field(page, 'Length').dispatchEvent('compositionend');
  const dialog = await review(page, alpha.id, 'width'); const beforeDialogEscape = await selected(page);
  await page.keyboard.press('Escape'); await expect(dialog).not.toBeVisible(); expect(await selected(page)).toEqual(beforeDialogEscape);
  await field(page, 'Length').press('Escape'); await expect(field(page, 'Length')).toHaveValue('12 ft');
  const door = await opening(page, 'door'); await openings(page).getByLabel('Door width', { exact: true }).fill('3 ft -');
  await openings(page).getByRole('button', { name: 'Common door width', exact: true }).click();
  const beforeMenuEscape = await selected(page); await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0); expect(await selected(page)).toEqual(beforeMenuEscape);
  await expect(revert(page, 'door width')).toBeVisible();
  await page.getByRole('button', { name: 'Alpha', exact: true }).click();
  const beta = await room(page, 'Beta'); await field(page, 'Length').fill('14 ft -');
  await page.getByRole('button', { name: 'Alpha', exact: true }).click(); await field(page, 'Length').fill('13 ft -');
  const both = await selected(page), button = revert(page, 'length'); await button.scrollIntoViewIfNeeded();
  const box = (await button.boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  // Concurrent selection through its public button, between pointerdown and up.
  await page.getByRole('button', { name: 'Beta', exact: true }).dispatchEvent('click'); await page.mouse.up();
  expect((await selected(page)).fields[alpha.id].length).toEqual(both.fields[alpha.id].length);
  expect((await selected(page)).fields[beta.id].length).toEqual(both.fields[beta.id].length); await unchanged(page, both);
  const oldInput = await field(page, 'Length').elementHandle();
  await page.getByRole('link', { name: 'Standalone Quick Rooms', exact: true }).click();
  await oldInput!.dispatchEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  await page.keyboard.press('Escape'); expect(await selected(page)).toEqual(both);
  expect((await selected(page)).openingFields![door.id].width.text).toBe('3 ft -');
});

test('supported recovered candidates and a zero center remain exact when unfinished fields are reverted', async ({ page }) => {
  await start(page); const door = await opening(page, 'door'); const source = structuredClone((await selected(page)).document);
  const width = source.rooms[0].width, alternate = parseMeasurement('11 ft', { selectedUnit: 'ft' });
  if (width.state !== 'known' || !alternate.ok) throw new Error('Invalid candidate fixture');
  source.rooms[0].width = { state: 'needs-review', valueMm: null, reason: 'Conflicting supplied widths', candidates: [
    { label: 'Original', valueMm: width.valueMm, provenance: width.provenance },
    { label: 'Alternative', valueMm: alternate.measurement.valueMm, provenance: alternate.measurement.provenance } ] };
  source.openings[0].attachments[0].offsetMm = 0;
  // Only this advanced compatibility boundary uses a validated recovered source.
  const adopted = adoptPhysicalDraft(source, 'revert-candidate-boundary');
  const raw = serializeRegistry(insertDraft(createRegistry(), adopted)); expect(parseRegistry(raw).status).toBe('recovered');
  await page.evaluate(({ key, raw }) => sessionStorage.setItem(key, raw), { key: KEY, raw }); await page.reload();
  await field(page, 'Width').fill('9 ft'); await revert(page, 'width').click();
  await expect(field(page, 'Width')).toHaveValue(''); await unchanged(page, adopted);
  await page.getByTestId('physical-opening-list-' + door.id).click();
  await openings(page).getByLabel('Position from wall start', { exact: true }).fill('2 ft');
  await revert(page, 'position from wall start').click();
  await expect(openings(page).getByLabel('Position from wall start', { exact: true })).toHaveValue('0 ft'); await unchanged(page, adopted);
  await page.reload(); await unchanged(page, adopted);
});

test.describe('touch Revert', () => {
  test.use({ hasTouch: true });
  test('unknown fields, visible desktop and phone actions, and failed recovery writes retain a usable draft', async ({ page }) => {
    await page.goto('/physical-draft'); await page.getByRole('button', { name: 'New physical draft', exact: true }).click();
    await page.getByRole('button', { name: 'Add room', exact: true }).click(); const unknown = await selected(page);
    await field(page, 'Length').fill('12 ft'); await revert(page, 'length').tap();
    await expect(field(page, 'Length')).toHaveValue(''); await unchanged(page, unknown);
    await rooms(page).getByLabel('Room name', { exact: true }).fill('Bedroom with a pending ceiling measurement');
    for (const [label, text] of [['Length', '12 ft'], ['Width', '10 ft'], ['Ceiling height', '8 ft']]) await commit(field(page, label), text);
    await page.getByRole('button', { name: 'Create window', exact: true }).click(); const unknownWindow = await selected(page);
    await openings(page).getByLabel('Window height', { exact: true }).fill('3 ft'); await revert(page, 'window height').tap();
    await expect(openings(page).getByLabel('Window height', { exact: true })).toHaveValue(''); await unchanged(page, unknownWindow);
    await page.getByRole('button', { name: 'Bedroom with a pending ceiling measurement', exact: true }).click();
    await page.getByRole('tab', { name: 'Drawing', exact: true }).click();
    await page.getByRole('region', { name: 'Physical drawing', exact: true }).getByRole('button', { name: 'Fit drawing', exact: true }).click();
    const before = await selected(page); await field(page, 'Ceiling height').fill('9 ft -');
    for (const [name, width, height] of [['desktop', 1600, 1200], ['phone', 390, 844]] as const) {
      await page.setViewportSize({ width, height }); await openResponsiveInspector(page); await revert(page, 'ceiling height').scrollIntoViewIfNeeded();
      await expect(revert(page, 'ceiling height')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
      await page.screenshot({ path: test.info().outputPath('field-revert-pending-' + name + '.png'), fullPage: true });
    }
    await revert(page, 'ceiling height').tap(); await expect(field(page, 'Ceiling height')).toHaveValue('8 ft'); await unchanged(page, before);
    await expect(page.getByTestId('physical-walls')).toContainText('352.00 sq ft');
    const priorBytes = await page.evaluate(key => sessionStorage.getItem(key), KEY);
    await page.evaluate(key => { const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function(name, value) { if (name === key) throw new DOMException('Isolated acceptance quota failure', 'QuotaExceededError'); return original.call(this, name, value); };
    }, KEY);
    await field(page, 'Length').fill('12 ft -'); await revert(page, 'length').tap();
    await expect(field(page, 'Length')).toHaveValue('12 ft'); await expect(revert(page, 'length')).toHaveCount(0);
    await expect(page.getByTestId('physical-floor')).toContainText('120.00 sq ft');
    await closeResponsiveInspector(page); await expect(page.locator('[role="status"]:not([data-testid="physical-save-status"])')).toContainText(/held in memory|could not be saved/i);
    expect(await page.evaluate(key => sessionStorage.getItem(key), KEY)).toBe(priorBytes);
  });
});
