import { expect, test, type Locator, type Page } from '@playwright/test';
import { parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import type { PhysicalDraft } from '../../client/src/features/physical-draft/state';
import { createQuantitySnapshot, verifyQuantitySnapshot } from '../../shared/quantities/snapshot';

const QUICK_KEY = 'modern-floor-planner:quick-rooms:v1';
const rooms = (p: Page) => p.getByTestId('physical-room-inspector');
const openings = (p: Page) => p.getByTestId('physical-opening-inspector');
const history = (p: Page) => p.getByRole('group', { name: 'Committed edit history', exact: true });
const undo = (p: Page) => history(p).getByRole('button', { name: /^Undo(?: |$)/ });
const redo = (p: Page) => history(p).getByRole('button', { name: /^Redo(?: |$)/ });
const field = (p: Page, name: string) => rooms(p).getByLabel(new RegExp('^' + name + ' \\((ft|m)\\)$'));
const takeoff = (p: Page) => p.getByTestId('takeoff-panel');
const total = (p: Page, output: string) => p.getByTestId('takeoff-output-' + output).getByTestId('takeoff-total');
const drawing = (p: Page) => p.getByRole('region', { name: 'Physical drawing', exact: true });
const frames = (p: Page) => p.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

// All fixtures and edits below are made through the real UI. Storage is read
// only, and parsed through the production compatibility validator.
async function registry(p: Page) {
  await expect.poll(async () => parseRegistry(await p.evaluate(k => sessionStorage.getItem(k), KEY)).status).toBe('recovered');
  const parsed = parseRegistry(await p.evaluate(k => sessionStorage.getItem(k), KEY));
  if (parsed.status !== 'recovered') throw new Error('Expected valid recovery data');
  return parsed.registry;
}
async function selected(p: Page): Promise<PhysicalDraft> {
  const value = await registry(p), draft = value.drafts.find(d => d.id === value.selectedDraftId);
  if (!draft) throw new Error('No selected draft');
  return draft;
}
async function commit(input: Locator, value: string) { await input.fill(value); await input.press('Enter'); await input.press('Tab'); }
async function room(p: Page, name = 'Alpha') {
  await p.getByRole('button', { name: 'Add room', exact: true }).click();
  await rooms(p).getByLabel('Room name', { exact: true }).fill(name); await rooms(p).getByLabel('Room name', { exact: true }).press('Enter');
  for (const [label, value] of [['Length', '12 ft'], ['Width', '10 ft'], ['Ceiling height', '8 ft']]) await commit(field(p, label), value);
  return (await selected(p)).document.rooms.find(r => r.name === name)!;
}
async function start(p: Page) {
  await p.goto('/physical-draft'); await p.getByRole('button', { name: 'New physical draft', exact: true }).click();
  return room(p);
}
async function createOpening(p: Page, kind: 'door' | 'window') {
  await p.getByRole('button', { name: 'Create ' + kind, exact: true }).click();
  const label = kind === 'door' ? 'Door' : 'Window';
  for (const [name, value] of [['Position from wall start', kind === 'door' ? '2.5 ft' : '8 ft'],
    [label + ' width', kind === 'door' ? '32 in' : '4 ft'], [label + ' height', kind === 'door' ? '7 ft' : '3 ft'],
    ['Sill height', kind === 'door' ? '0' : '3 ft']]) await commit(openings(p).getByLabel(name, { exact: true }), value);
  await openings(p).getByLabel('Measurement basis', { exact: true }).selectOption('finished');
  return (await selected(p)).document.openings.at(-1)!;
}
async function work(p: Page, output: 'floor-area' | 'gross-wall-area' | 'net-wall-area' | 'opening-inventory') {
  const label = { 'floor-area': 'Floor area', 'gross-wall-area': 'Gross wall area', 'net-wall-area': 'Net wall area', 'opening-inventory': 'Physical opening inventory' }[output];
  await takeoff(p).getByRole('checkbox', { name: 'Measure ' + label, exact: true }).check();
  await configure(p, output);
  await takeoff(p).getByRole('button', { name: 'All current ' + (output === 'floor-area' ? 'rooms' : output === 'opening-inventory' ? 'openings' : 'walls'), exact: true }).click();
}
async function configure(p: Page, output: string) { await takeoff(p).getByRole('combobox', { name: 'Configure work', exact: true }).selectOption(output); }
async function amount(p: Page, output: string, name: string, value: string) { await expect(total(p, output).locator('[data-amount="' + name + '"]')).toHaveText(value); }
function evidence(d: PhysicalDraft) { return { events: d.events, openingEvents: d.openingEvents, reviewState: d.reviewState, source: d.source }; }
function value(d: PhysicalDraft, key: 'length' | 'width' | 'ceilingHeight') { return d.document.rooms[0][key].valueMm; }
async function review(p: Page, roomId: string, name = 'length') {
  const toggle = takeoff(p).getByRole('button', { name: 'Review inputs', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await takeoff(p).getByRole('combobox', { name: 'Review target', exact: true }).selectOption('room:' + roomId);
  await p.getByTestId('review-field-room-' + roomId + '-' + name).getByRole('button', { name: /^Review / }).click();
  const dialog = p.getByRole('dialog', { name: 'Review measurement', exact: true });
  await expect(dialog).toBeVisible(); await expect(dialog.getByRole('button', { name: 'Close review', exact: true })).toBeFocused();
  return dialog;
}
async function showDrawing(p: Page) {
  await p.getByRole('tab', { name: 'Drawing', exact: true }).click();
  await drawing(p).getByRole('button', { name: 'Fit drawing', exact: true }).click(); await frames(p);
}
async function move(p: Page, openingId: string, roomId: string, side: 'top' | 'right', ratio: number) {
  await p.getByTestId('physical-opening-list-' + openingId).click();
  await p.getByTestId('physical-canvas').scrollIntoViewIfNeeded(); await frames(p);
  const opening = (await p.getByTestId('physical-opening-' + openingId).first().boundingBox())!;
  await p.mouse.move(opening.x + opening.width / 2, opening.y + opening.height / 2); await p.mouse.down(); await frames(p);
  const bounds = (await p.getByTestId('physical-room-' + roomId).boundingBox())!;
  await p.mouse.move(side === 'top' ? bounds.x + bounds.width * ratio : bounds.x + bounds.width,
    side === 'top' ? bounds.y : bounds.y + bounds.height * ratio, { steps: 7 }); await p.mouse.up();
}
const errors = new WeakMap<Page, string[]>(), writes = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  errors.set(page, []); writes.set(page, []);
  page.on('pageerror', e => errors.get(page)!.push(e.message));
  page.on('request', r => { if (new URL(r.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(r.method())) writes.get(page)!.push(r.method() + ' ' + r.url()); });
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); expect(writes.get(page)).toEqual([]); });

test('committed height, clearing and coalesced room names undo chronologically across both views', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1200 });
  const alpha = await start(page); await work(page, 'floor-area'); await work(page, 'gross-wall-area');
  const before = await selected(page); await commit(field(page, 'Ceiling height'), '9 ft');
  const corrected = await selected(page);
  expect(corrected.events).toHaveLength(before.events.length + 1); await amount(page, 'gross-wall-area', 'net', '396.00 sq ft');
  await expect(undo(page)).toHaveAccessibleName('Undo ceiling height change');
  await showDrawing(page); await undo(page).click();
  let restored = await selected(page);
  expect(value(restored, 'ceilingHeight')).toBe(2438.4); expect(restored.localEditRevision).toBeGreaterThan(corrected.localEditRevision);
  expect(restored.document.rooms[0].wallFaces).toEqual(alpha.wallFaces); expect(restored.request).toEqual(before.request);
  expect(restored.events).toEqual(corrected.events); await amount(page, 'gross-wall-area', 'net', '352.00 sq ft');
  await redo(page).click(); expect(value(await selected(page), 'ceilingHeight')).toBe(9 * 304.8);
  await amount(page, 'gross-wall-area', 'net', '396.00 sq ft'); await amount(page, 'floor-area', 'net', '120.00 sq ft');
  await expect(page.getByTestId('physical-ceiling')).toContainText('120.00 sq ft');
  await commit(field(page, 'Ceiling height'), ''); expect((await selected(page)).document.rooms[0].ceilingHeight.state).toBe('unknown');
  await undo(page).click(); expect(value(await selected(page), 'ceilingHeight')).toBe(9 * 304.8);
  await redo(page).click(); expect((await selected(page)).document.rooms[0].ceilingHeight.state).toBe('unknown');
  await undo(page).click();
  const name = rooms(page).getByLabel('Room name', { exact: true });
  await name.fill(''); await name.pressSequentially('Alpha living room'); await name.press('Enter'); await name.press('Tab');
  await expect(undo(page)).toHaveAccessibleName('Undo room name change'); await undo(page).click();
  expect((await selected(page)).document.rooms[0].name).toBe('Alpha');
  await redo(page).click(); expect((await selected(page)).document.rooms[0].name).toBe('Alpha living room');
  const semantic = await selected(page); await commit(field(page, 'Ceiling height'), '9 ft');
  expect((await selected(page)).document).toEqual(semantic.document);
  await expect(undo(page)).toHaveAccessibleName('Undo room name change');
  await history(page).scrollIntoViewIfNeeded(); await page.screenshot({ path: test.info().outputPath('physical-history-desktop.png'), fullPage: true });
  await expect(history(page)).toContainText(/Last 50 committed actions per draft/);
});

test('opening moves and fractional sizes are single reversible transactions, with coordinated delete recovery', async ({ page }) => {
  test.setTimeout(60_000);
  const alpha = await start(page), door = await createOpening(page, 'door'); await work(page, 'net-wall-area');
  await showDrawing(page);
  for (const [side, ratio] of [['top', .4], ['right', .35]] as const) {
    const before = await selected(page); await move(page, door.id, alpha.id, side, ratio);
    const after = await selected(page), moved = after.document.openings[0];
    expect(moved.attachments[0].wallFaceId).toBe(alpha.wallFaces.find(w => w.side === side)!.id);
    expect(moved.attachments).not.toEqual(before.document.openings[0].attachments);
    expect(after.openingEvents).toHaveLength(before.openingEvents!.length + 1);
    await expect(undo(page)).toHaveAccessibleName('Undo door move'); await undo(page).click();
    expect((await selected(page)).document.openings[0]).toEqual(before.document.openings[0]);
    await redo(page).click(); expect((await selected(page)).document.openings[0]).toEqual(moved);
    expect((await selected(page)).document.rooms).toEqual(before.document.rooms);
  }
  await openings(page).getByRole('button', { name: 'Common door width', exact: true }).click();
  await page.getByRole('menuitem', { name: '36 in', exact: true }).click();
  const widened = await selected(page); expect(widened.document.openings[0].width.valueMm).toBeCloseTo(914.4, 10);
  await amount(page, 'net-wall-area', 'net', '331.00 sq ft'); await undo(page).click();
  const narrowed = await selected(page); expect(narrowed.document.openings[0].width.valueMm).toBe(812.8);
  expect(narrowed.document.openings[0].attachments).toEqual(widened.document.openings[0].attachments);
  expect(narrowed.document.openings[0].appearance).toEqual(door.appearance);
  await amount(page, 'net-wall-area', 'net', '333.33 sq ft'); await redo(page).click();
  await commit(openings(page).getByLabel('Door width', { exact: true }), '99 ft');
  await expect(openings(page)).toContainText(/fit|wall|overlap/i);
  await page.getByRole('button', { name: 'Revert door width', exact: true }).click();
  await expect(undo(page)).toHaveAccessibleName('Undo door width change');
  await openings(page).getByRole('button', { name: 'Delete door', exact: true }).click();
  const deleted = await selected(page); expect(deleted.document.openings).toHaveLength(0);
  await undo(page).click(); expect((await selected(page)).document.openings[0].id).toBe(door.id);
  await redo(page).click(); expect((await selected(page)).document.openings).toHaveLength(0);
  await page.getByRole('button', { name: 'Undo opening delete', exact: true }).click();
  expect((await selected(page)).document.openings.map(o => o.id)).toEqual([door.id]);
  await expect(undo(page)).toBeDisabled(); await expect(redo(page)).toBeDisabled();
  await expect(history(page)).toContainText(/boundary|opening.*restor|opening.*delete/i);
  expect((await selected(page)).source).toEqual(deleted.source);
  await page.getByRole('button', { name: 'Create window', exact: true }).click();
  const created = (await selected(page)).document.openings.at(-1)!;
  await undo(page).click(); expect((await selected(page)).document.openings.map(o => o.id)).toEqual([door.id]);
  await redo(page).click(); expect((await selected(page)).document.openings.map(o => o.id)).toEqual([door.id, created.id]);
  expect((await selected(page)).document.openings[1]).toEqual(created);
});

test('waste and target Undo preserve unrelated raw input, block conflicting edits and invalidate redo only on commit', async ({ page }) => {
  const alpha = await start(page); await work(page, 'floor-area');
  const waste = takeoff(page).getByLabel('Waste percentage', { exact: true });
  await commit(waste, '10'); const initial = await selected(page); await commit(waste, '15');
  await amount(page, 'floor-area', 'adjusted', '138.00 sq ft');
  await page.getByRole('button', { name: 'Meters', exact: true }).click();
  await field(page, 'Ceiling height').fill('2.4 m -'); await page.getByRole('button', { name: 'Feet / inches', exact: true }).click();
  const pending = await selected(page); await undo(page).click(); const undone = await selected(page);
  expect(undone.fields[alpha.id]).toEqual(pending.fields[alpha.id]); expect(undone.document).toEqual(initial.document);
  await amount(page, 'floor-area', 'adjusted', '132.00 sq ft'); await redo(page).click();
  await amount(page, 'floor-area', 'adjusted', '138.00 sq ft');
  await waste.fill('20'); const conflict = await selected(page); await undo(page).click();
  expect(await selected(page)).toEqual(conflict); await expect(waste).toHaveValue('20');
  await expect(history(page)).toContainText(/pending|unapplied|Revert/i);
  await waste.press('Escape'); await undo(page).click(); await amount(page, 'floor-area', 'adjusted', '132.00 sq ft');
  await expect(redo(page)).toBeEnabled();
  await showDrawing(page); await drawing(page).getByRole('button', { name: 'Zoom in', exact: true }).click();
  await expect(redo(page)).toBeEnabled(); await redo(page).click();
  await takeoff(page).getByRole('button', { name: 'Clear targets', exact: true }).click();
  const cleared = await selected(page); await undo(page).click();
  expect((await selected(page)).request).toEqual(pending.request);
  expect((await selected(page)).document).toEqual(cleared.document);
  await expect(page.getByRole('button', { name: 'Alpha', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(redo(page)).toBeEnabled();
  // A valid, still-unapplied unrelated measurement also must not blur-commit.
  await field(page, 'Length').fill('4 m'); const validPending = await selected(page);
  await undo(page).click();
  expect((await selected(page)).fields[alpha.id].length).toEqual(validPending.fields[alpha.id].length);
  expect((await selected(page)).document).toEqual(validPending.document);
  await page.getByRole('button', { name: 'Revert length', exact: true }).click();
  await commit(waste, '12'); await expect(redo(page)).toBeDisabled();
  expect((await selected(page)).fields[alpha.id].ceilingHeight).toEqual(pending.fields[alpha.id].ceilingHeight);
});

test('confirmed corrections undo provisionally without erasing review snapshots, then recover with empty session history', async ({ page }) => {
  await page.goto('/quick-room'); await page.getByRole('button', { name: 'Add room', exact: true }).click();
  const quick = page.getByTestId('quick-room-card');
  for (const [label, text] of [['Length', '12 ft'], ['Width', '10 ft'], ['Ceiling height', '8 ft']]) await commit(quick.getByLabel(label, { exact: true }), text);
  const sourceBytes = await page.evaluate(k => sessionStorage.getItem(k), QUICK_KEY); expect(sourceBytes).not.toBeNull();
  await page.getByRole('button', { name: 'Open a physical copy', exact: true }).click();
  const id = (await selected(page)).document.rooms[0].id;
  await work(page, 'floor-area'); await (await review(page, id)).getByRole('button', { name: 'Confirm reviewed value', exact: true }).click();
  const confirmed = await selected(page); await expect(undo(page)).toBeDisabled(); await expect(redo(page)).toBeDisabled();
  const capture = await createQuantitySnapshot(confirmed.document, confirmed.request, { id: 'before-history', createdAt: '2026-09-09T00:00:00.000Z', kind: 'evaluation' }, confirmed.events);
  expect(capture.ok).toBe(true); if (!capture.ok) throw new Error(JSON.stringify(capture.errors));
  const snapshotBytes = JSON.stringify(capture.snapshot);
  expect(confirmed.document.rooms[0].length.state === 'known' && confirmed.document.rooms[0].length.provenance.confirmation.status).toBe('confirmed');
  await commit(field(page, 'Length'), '13 ft'); const corrected = await selected(page);
  await undo(page).click(); let restored = await selected(page);
  expect(value(restored, 'length')).toBe(12 * 304.8);
  expect(restored.document.rooms[0].length.state === 'known' && restored.document.rooms[0].length.provenance.confirmation.status).toBe('unconfirmed');
  expect(evidence(restored)).toEqual(evidence(corrected));
  expect(restored.historyEvidence!.events.slice(0, corrected.historyEvidence!.events.length)).toEqual(corrected.historyEvidence!.events);
  expect(restored.historyEvidence!.events.at(-1)).toMatchObject({ action: 'undo', sourceEventId: corrected.historyEvidence!.events.at(-1)!.id });
  expect(restored.historyEvidence!.events.at(-1)!.changes).toEqual([{ target: { kind: 'room-measurement', id, field: 'length' }, before: corrected.document.rooms[0].length, after: restored.document.rooms[0].length }]);
  expect(await verifyQuantitySnapshot(capture.snapshot)).toEqual({ ok: true }); expect(JSON.stringify(capture.snapshot)).toBe(snapshotBytes);
  expect(restored.events.slice(0, confirmed.events.length)).toEqual(confirmed.events);
  await redo(page).click(); expect(value(await selected(page), 'length')).toBe(3962.4);
  await undo(page).click(); await field(page, 'Width').fill('10 ft -');
  const recovered = await selected(page), bytes = await page.evaluate(k => sessionStorage.getItem(k), KEY);
  await expect(redo(page)).toBeEnabled(); await page.reload();
  expect(await selected(page)).toEqual(recovered); expect(await page.evaluate(k => sessionStorage.getItem(k), KEY)).toBe(bytes);
  await expect(field(page, 'Width')).toHaveValue('10 ft -'); await expect(undo(page)).toBeDisabled(); await expect(redo(page)).toBeDisabled();
  await expect(history(page)).toContainText(/Reload recovers.*empty Undo\/Redo history/);
  expect(await page.evaluate(k => sessionStorage.getItem(k), QUICK_KEY)).toBe(sourceBytes);
});

test('histories remain draft-local and room creation unwinds safely; failed cache writes retain in-memory Undo', async ({ page }) => {
  const alpha = await start(page); await commit(field(page, 'Ceiling height'), '9 ft'); const first = await selected(page);
  await page.getByRole('button', { name: 'New physical draft', exact: true }).click();
  const secondId = (await selected(page)).id; await expect(undo(page)).toBeDisabled();
  await page.getByRole('button', { name: 'Add room', exact: true }).click(); const emptyRoom = (await selected(page)).document.rooms[0];
  await commit(field(page, 'Length'), '6 ft'); await undo(page).click();
  expect((await selected(page)).document.rooms[0].length.state).toBe('unknown');
  await undo(page).click(); expect((await selected(page)).document.rooms).toHaveLength(0);
  await redo(page).click(); expect((await selected(page)).document.rooms[0]).toEqual(emptyRoom);
  const second = await selected(page);
  await page.getByRole('combobox', { name: 'Selected physical draft', exact: true }).selectOption(first.id);
  await expect(undo(page)).toHaveAccessibleName('Undo ceiling height change'); await undo(page).click();
  expect(value(await selected(page), 'ceilingHeight')).toBe(2438.4);
  expect((await registry(page)).drafts.find(d => d.id === secondId)).toEqual(second);
  const bytes = await page.evaluate(k => sessionStorage.getItem(k), KEY);
  await page.evaluate(key => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(k, v) { if (k === key) throw new DOMException('test quota', 'QuotaExceededError'); return original.call(this, k, v); };
  }, KEY);
  await redo(page).click();
  await expect(field(page, 'Ceiling height')).toHaveValue('9 ft');
  await expect(page.getByTestId('physical-view')).toContainText(/held in memory.*recovery could not be saved/);
  expect(await page.evaluate(k => sessionStorage.getItem(k), KEY)).toBe(bytes);
  await undo(page).click(); await expect(field(page, 'Ceiling height')).toHaveValue('8 ft');
  expect(await page.evaluate(k => sessionStorage.getItem(k), KEY)).toBe(bytes);
  expect((await registry(page)).drafts.find(d => d.id === first.id)!.document.rooms[0].id).toBe(alpha.id);
});

test('history shortcuts respect native editing, dialogs, IME, stale targets and active gestures', async ({ page }) => {
  test.setTimeout(60_000);
  const alpha = await start(page); await commit(field(page, 'Ceiling height'), '9 ft');
  await field(page, 'Ceiling height').dispatchEvent('compositionstart'); await field(page, 'Ceiling height').fill('10 ft');
  const composition = await selected(page); await undo(page).focus();
  await field(page, 'Ceiling height').dispatchEvent('compositionend');
  expect(await selected(page)).toEqual(composition); await undo(page).press('Enter');
  expect(await selected(page)).toEqual(composition); await expect(history(page)).toContainText(/pending|unapplied|Revert/i);
  await page.getByRole('button', { name: 'Revert ceiling height', exact: true }).click();
  await field(page, 'Length').focus(); await field(page, 'Length').press('End'); await field(page, 'Length').pressSequentially(' -');
  const typed = await selected(page); await field(page, 'Length').press('Control+z');
  expect((await selected(page)).document).toEqual(typed.document); await expect(undo(page)).toHaveAccessibleName('Undo ceiling height change');
  await field(page, 'Length').press('Escape'); await page.locator('#physical-rooms-panel').focus();
  for (const flags of ['repeat', 'composing', 'handled']) {
    const before = await selected(page);
    await page.locator('#physical-rooms-panel').evaluate((node, mode) => {
      const event = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true,
        repeat: mode === 'repeat', isComposing: mode === 'composing' });
      if (mode === 'handled') event.preventDefault(); node.dispatchEvent(event);
    }, flags); expect(await selected(page)).toEqual(before);
  }
  await page.keyboard.press('Control+z'); expect(value(await selected(page), 'ceilingHeight')).toBe(2438.4);
  await page.keyboard.press('Control+Shift+z'); expect(value(await selected(page), 'ceilingHeight')).toBe(9 * 304.8);
  await page.keyboard.press('Control+z'); await page.keyboard.press('Control+y'); expect(value(await selected(page), 'ceilingHeight')).toBe(9 * 304.8);
  await page.getByRole('tab', { name: 'Quick Rooms', exact: true }).focus();
  const beforeTabFocus = await selected(page); await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Drawing', exact: true })).toBeFocused();
  expect(await selected(page)).toEqual(beforeTabFocus);
  await page.keyboard.press('Meta+z'); expect(value(await selected(page), 'ceilingHeight')).toBe(2438.4);
  await expect(page.getByRole('tab', { name: 'Quick Rooms', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Meta+Shift+z'); expect(value(await selected(page), 'ceilingHeight')).toBe(9 * 304.8);
  const dialog = await review(page, alpha.id, 'width'), beforeDialog = await selected(page);
  await page.keyboard.press('Control+z'); expect(await selected(page)).toEqual(beforeDialog);
  await dialog.getByRole('button', { name: 'Close review', exact: true }).click();
  const door = await createOpening(page, 'door'); await showDrawing(page);
  await openings(page).getByRole('button', { name: 'Common door width', exact: true }).click();
  const beforeMenu = await selected(page); await page.keyboard.press('Control+z'); expect(await selected(page)).toEqual(beforeMenu);
  await page.keyboard.press('Escape'); await expect(page.getByRole('menu')).toHaveCount(0);
  await page.getByTestId('physical-canvas').scrollIntoViewIfNeeded(); await frames(page);
  const box = (await page.getByTestId('physical-opening-' + door.id).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  const gestureBefore = await selected(page); await page.keyboard.press('Control+z'); expect(await selected(page)).toEqual(gestureBefore);
  await page.keyboard.press('Escape'); await page.mouse.up(); expect((await selected(page)).document).toEqual(gestureBefore.document);
  await undo(page).scrollIntoViewIfNeeded(); const button = (await undo(page).boundingBox())!;
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2); await page.mouse.down();
  await page.getByRole('button', { name: 'New physical draft', exact: true }).dispatchEvent('click');
  const switched = await selected(page); await page.mouse.up(); expect(await selected(page)).toEqual(switched);
  await page.getByRole('link', { name: 'Standalone Quick Rooms', exact: true }).click();
  const inactive = await registry(page); await page.keyboard.press('Control+z'); expect(await registry(page)).toEqual(inactive);
});

test.describe('touch committed history', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('phone history controls support touch and keyboard without committing unrelated pending text', async ({ page }) => {
    await start(page); await commit(field(page, 'Ceiling height'), '9 ft'); await field(page, 'Length').fill('12 ft -');
    const pending = await selected(page); await undo(page).tap();
    expect(value(await selected(page), 'ceilingHeight')).toBe(2438.4);
    expect((await selected(page)).fields).toMatchObject({ [pending.document.rooms[0].id]: { length: pending.fields[pending.document.rooms[0].id].length } });
    await redo(page).tap(); expect(value(await selected(page), 'ceilingHeight')).toBe(9 * 304.8);
    await undo(page).focus(); await page.keyboard.press('Enter'); expect(value(await selected(page), 'ceilingHeight')).toBe(2438.4);
    await redo(page).focus(); await page.keyboard.press('Space'); expect(value(await selected(page), 'ceilingHeight')).toBe(9 * 304.8);
    await expect(page.getByRole('button', { name: 'Revert length', exact: true })).toBeVisible();
    await history(page).scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath('physical-history-phone.png'), fullPage: true });
  });
});
