import { expect, test, type Locator, type Page } from '@playwright/test';
import { parseDraft } from '../../client/src/features/quick-room/storage';
import type { QuickRoomDraft } from '../../client/src/features/quick-room/state';
import type { Room } from '../../shared/schema';

// Real application route; the existing disposable backend is loopback-only.
const KEY = 'modern-floor-planner:quick-rooms:v1';
const OTHER = 'm3a-unrelated-storage';
const cards = (page: Page) => page.getByTestId('quick-room-card');
const summary = (card: Locator) => card.getByTestId('room-quantities');
const project = (page: Page) => page.getByTestId('project-quantities');
const units = (page: Page) => page.getByLabel('Units for new input and results', { exact: true });
type Field = 'Length' | 'Width' | 'Ceiling height';

async function commit(card: Locator, name: Field, text: string) {
  const field = card.getByLabel(name, { exact: true });
  await field.fill(text);
  await field.press('Enter');
  await field.press('Tab');
}
async function add(page: Page, name = 'Bedroom') {
  await page.getByLabel('Room type', { exact: true }).selectOption({ label: name });
  const count = await cards(page).count();
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await expect(cards(page)).toHaveCount(count + 1);
  return cards(page).nth(count);
}
async function dimensions(card: Locator, length = '12 ft', width = '10 ft', ceiling = '8 ft') {
  await commit(card, 'Length', length);
  await commit(card, 'Width', width);
  await commit(card, 'Ceiling height', ceiling);
}
async function area(scope: Locator, kind: 'floor-area' | 'ceiling-area' | 'gross-wall-area', text: string) {
  await expect(scope.getByTestId('quantity-' + kind)).toContainText(text);
}
async function draft(page: Page): Promise<QuickRoomDraft> {
  await expect.poll(async () => parseDraft(await page.evaluate(key => sessionStorage.getItem(key), KEY)).status).toBe('recovered');
  const parsed = parseDraft(await page.evaluate(key => sessionStorage.getItem(key), KEY));
  if (parsed.status !== 'recovered') throw new Error('Expected a validated Quick Rooms draft');
  return parsed.draft;
}
function watchWrites(page: Page) {
  const writes: string[] = [];
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.method() + ' ' + path);
  });
  return writes;
}
function unconfirmed(value: QuickRoomDraft) {
  for (const room of value.document.rooms) for (const field of ['length', 'width', 'ceilingHeight'] as const) {
    const measurement = room[field];
    if (measurement.state === 'known') expect(measurement.provenance.confirmation.status).toBe('unconfirmed');
  }
  expect(value.document.id).toBeNull();
  expect(value.document.revisionId).toBeNull();
  expect(value.document.openings).toEqual([]);
  expect(value).not.toHaveProperty('quantities');
  expect(value).not.toHaveProperty('totals');
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  (page as Page & { m3aErrors?: string[] }).m3aErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { m3aErrors?: string[] }).m3aErrors, 'uncaught browser errors').toEqual([]);
});

test('actual entry starts unknown; 12×10×8 gives provisional 120/120/352 and missing height only blocks walls', async ({ page }) => {
  const writes = watchWrites(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Quick Rooms', exact: true }).click();
  await expect(page).toHaveURL(/\/quick-room$/);
  await expect(page.getByRole('heading', { name: 'Quick Rooms', exact: true })).toBeVisible();
  await expect(page.getByText('Temporary draft in this browser tab — not saved to an account.', { exact: true })).toBeVisible();
  await expect(cards(page)).toHaveCount(0);
  await expect(project(page)).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Start with one room' })).toBeVisible();
  expect((await page.getByLabel('Room type', { exact: true }).locator('option').allTextContents()).sort()).toEqual(
    ['Bedroom', 'Kitchen', 'Bathroom', 'Living Room', 'Closet', 'Custom'].sort());
  const card = await add(page);
  await expect(card.getByLabel('Room name', { exact: true })).toHaveValue('Bedroom');
  for (const name of ['Length', 'Width', 'Ceiling height']) await expect(card.getByLabel(name, { exact: true })).toHaveValue('');
  const blank = await draft(page);
  for (const field of ['length', 'width', 'ceilingHeight'] as const) expect(blank.document.rooms[0][field].state).toBe('unknown');
  await dimensions(card);
  for (const scope of [summary(card), project(page)]) {
    await area(scope, 'floor-area', '120.00 sq ft');
    await area(scope, 'ceiling-area', '120.00 sq ft');
    await area(scope, 'gross-wall-area', '352.00 sq ft');
    await expect(scope).toContainText(/provisional|not field-verified/i);
  }
  await expect(summary(card).getByTestId('quantity-gross-wall-area')).toContainText(/gross|before.*door/i);
  unconfirmed(await draft(page));
  await commit(card, 'Ceiling height', '');
  for (const scope of [summary(card), project(page)]) {
    await area(scope, 'floor-area', '120.00 sq ft');
    await area(scope, 'ceiling-area', '120.00 sq ft');
    await expect(scope.getByTestId('quantity-gross-wall-area')).toContainText(/unavailable/i);
    await expect(scope.getByTestId('quantity-gross-wall-area')).not.toContainText('352.00');
  }
  await expect(card).toContainText(/ceiling height/i);
  expect(writes).toEqual([]);
});

test('duplicate identities and edits are independent; removal is protected and preserves the original', async ({ page }) => {
  await page.goto('/quick-room');
  const original = await add(page);
  await dimensions(original);
  const before = await draft(page);
  const sourceId = before.document.rooms[0].id;
  await original.getByRole('button', { name: 'Duplicate room', exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  const copy = cards(page).nth(1);
  await expect(copy.getByLabel('Room name', { exact: true })).toHaveValue(/copy/i);
  await area(project(page), 'floor-area', '240.00 sq ft');
  await area(project(page), 'gross-wall-area', '704.00 sq ft');
  const doubled = await draft(page);
  expect(doubled.document.rooms[0]).toEqual(before.document.rooms[0]);
  const ids = doubled.document.rooms.flatMap(room => [room.id, ...room.wallFaces.map(wall => wall.id)]);
  expect(new Set(ids).size).toBe(10);
  for (const room of doubled.document.rooms) expect(room.wallFaces.map(wall => wall.side)).toEqual(['top', 'right', 'bottom', 'left']);
  unconfirmed(doubled);
  await commit(copy, 'Length', '15 ft');
  await area(summary(original), 'floor-area', '120.00 sq ft');
  await area(summary(copy), 'floor-area', '150.00 sq ft');
  await area(project(page), 'floor-area', '270.00 sq ft');
  await area(project(page), 'gross-wall-area', '752.00 sq ft');
  const edited = await draft(page);
  expect(edited.document.rooms.find(room => room.id === sourceId)).toEqual(before.document.rooms[0]);
  expect(edited.fields[sourceId]).toEqual(before.fields[sourceId]);
  expect(edited.events.filter(item => item.target.id === sourceId)).toEqual(before.events);
  page.once('dialog', dialog => dialog.dismiss());
  await copy.getByRole('button', { name: 'Remove room', exact: true }).click();
  await expect(cards(page)).toHaveCount(2);
  page.once('dialog', dialog => dialog.accept());
  await copy.getByRole('button', { name: 'Remove room', exact: true }).click();
  await expect(cards(page)).toHaveCount(1);
  expect((await draft(page)).document.rooms[0]).toEqual(before.document.rooms[0]);
  await area(project(page), 'floor-area', '120.00 sq ft');
});

test('project labels an unavailable full total separately from a provisional partial subtotal', async ({ page }) => {
  await page.goto('/quick-room');
  await dimensions(await add(page));
  const second = await add(page, 'Kitchen');
  await commit(second, 'Length', '15 ft');
  await commit(second, 'Width', '10 ft');
  await area(project(page), 'floor-area', '270.00 sq ft');
  await area(project(page), 'ceiling-area', '270.00 sq ft');
  const walls = project(page).getByTestId('quantity-gross-wall-area');
  await expect(walls).toContainText(/unavailable/i);
  await expect(walls).toContainText(/partial.*subtotal|subtotal.*partial/i);
  await expect(walls).toContainText('352.00 sq ft');
  await expect(walls).toContainText(/provisional|not field-verified/i);
  await expect(summary(second).getByTestId('quantity-gross-wall-area')).toContainText(/unavailable/i);
});

test('equivalent fractional, decimal and metric input plus unit switching retain dimensions and provenance', async ({ page }) => {
  await page.goto('/quick-room');
  const card = await add(page);
  await dimensions(card, '12 ft 6 in');
  for (const text of ['12 ft 6 in', '12.5 ft', '3.81 m']) {
    await commit(card, 'Length', text);
    expect((await draft(page)).document.rooms[0].length.valueMm).toBeCloseTo(3810, 9);
    await area(summary(card), 'floor-area', '125.00 sq ft');
  }
  await commit(card, 'Length', '12 ft 5 1/2 in');
  expect((await draft(page)).document.rooms[0].length.valueMm).toBeCloseTo(3797.3, 9);
  await commit(card, 'Length', '12 ft 6 in');
  const before = await draft(page);
  await units(page).selectOption('m');
  await area(summary(card), 'floor-area', '11.61 m²');
  await expect(card.getByLabel('Length', { exact: true })).toHaveValue(/3\.81.*m/);
  const metric = await draft(page);
  expect(metric.document).toEqual(before.document);
  expect(metric.events).toEqual(before.events);
  await units(page).selectOption('ft');
  await area(summary(card), 'floor-area', '125.00 sq ft');
  expect((await draft(page)).document).toEqual(before.document);
});

test('invalid and partial text immediately masks stale quantities, remains visible and recovers on correction', async ({ page }) => {
  await page.goto('/quick-room');
  const card = await add(page);
  await dimensions(card);
  const field = card.getByLabel('Length', { exact: true });
  for (const raw of ['12 ft 1/', '0', 'not a dimension']) {
    await field.fill(raw);
    await expect(field).toHaveValue(raw);
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toHaveAttribute('aria-describedby', /\S+/);
    await expect(summary(card).getByTestId('quantity-floor-area')).toContainText(/unavailable/i);
    await expect(summary(card).getByTestId('quantity-floor-area')).not.toContainText('120.00');
    await field.press('Enter');
    await expect(field).toHaveValue(raw);
    await expect(project(page).getByTestId('quantity-floor-area')).toContainText(/unavailable/i);
    const state = await draft(page);
    expect(state.document.rooms[0].length.valueMm).toBeCloseTo(3657.6, 9);
    expect(state.fields[state.document.rooms[0].id].length.text).toBe(raw);
  }
  await commit(card, 'Length', '14 ft');
  await area(summary(card), 'floor-area', '140.00 sq ft');
  await area(project(page), 'gross-wall-area', '384.00 sq ft');
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
});

test('pending bare input keeps its original unit context and incomplete text survives same-tab refresh', async ({ page }) => {
  await page.goto('/quick-room');
  const card = await add(page);
  await commit(card, 'Width', '10 ft');
  const field = card.getByLabel('Length', { exact: true });
  await field.fill('12');
  await units(page).selectOption('m');
  const state = await draft(page);
  const id = state.document.rooms[0].id;
  if (state.fields[id].length.dirty) expect(state.fields[id].length).toMatchObject({ text: '12', unit: 'ft' });
  else expect(state.document.rooms[0].length.valueMm).toBeCloseTo(3657.6, 9);
  await field.press('Enter');
  expect((await draft(page)).document.rooms[0].length.valueMm).toBeCloseTo(3657.6, 9);
  await field.fill('12 ft 1/');
  const pending = await draft(page);
  await units(page).selectOption('ft');
  expect((await draft(page)).fields[id].length).toEqual(pending.fields[id].length);
  await page.reload();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first().getByLabel('Length', { exact: true })).toHaveValue('12 ft 1/');
  expect((await draft(page)).fields[id].length).toEqual(pending.fields[id].length);
  await expect(project(page).getByTestId('quantity-floor-area')).toContainText(/unavailable/i);
  await commit(cards(page).first(), 'Length', '3.6576 m');
  expect((await draft(page)).document.rooms[0].length.valueMm).toBeCloseTo(3657.6, 9);
  await area(project(page), 'floor-area', '120.00 sq ft');
});

test('clearing an old-unit edit releases its context for the next bare measurement', async ({ page }) => {
  await page.goto('/quick-room');
  const card = await add(page);
  const field = card.getByLabel('Length', { exact: true });
  await field.fill('12 ft 1/');
  await units(page).selectOption('m');
  await expect(field).toHaveValue('12 ft 1/');
  const pending = await draft(page);
  const id = pending.document.rooms[0].id;
  expect(pending.fields[id].length.unit).toBe('ft');
  await commit(card, 'Length', '');
  expect((await draft(page)).fields[id].length.unit).toBe('m');
  await commit(card, 'Length', '3.81');
  expect((await draft(page)).document.rooms[0].length.valueMm).toBe(3810);
  await expect(field).toHaveValue('3.81');
});

test('Enter plus blur commits once; composition and repeated keys do not duplicate actions or delete rooms', async ({ page }) => {
  await page.goto('/quick-room');
  const card = await add(page);
  const field = card.getByLabel('Length', { exact: true });
  await commit(card, 'Length', '12 ft');
  expect((await draft(page)).events).toHaveLength(1);
  await field.fill('15 ft');
  await field.dispatchEvent('compositionstart', { data: '' });
  const prevented = await field.evaluate(node => {
    const event = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, bubbles: true, cancelable: true });
    node.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(prevented, 'composition must retain native input-method behavior').toBe(false);
  expect((await draft(page)).document.rooms[0].length.valueMm).toBeCloseTo(3657.6, 9);
  await field.dispatchEvent('compositionend', { data: '15 ft' });
  await field.dispatchEvent('keydown', { key: 'Enter', repeat: true, bubbles: true });
  expect((await draft(page)).document.rooms[0].length.valueMm).toBeCloseTo(3657.6, 9);
  await field.press('Enter');
  await field.press('Tab');
  expect((await draft(page)).events).toHaveLength(2);
  const name = card.getByLabel('Room name', { exact: true });
  await name.fill('Editing text');
  await name.press('End');
  await name.press('Backspace');
  await name.press('Home');
  await name.press('Delete');
  await expect(name).toHaveValue('diting tex');
  await expect(cards(page)).toHaveCount(1);
  const duplicate = card.getByRole('button', { name: 'Duplicate room', exact: true });
  await duplicate.focus();
  await duplicate.dispatchEvent('keydown', { key: 'Enter', repeat: true, bubbles: true });
  await expect(cards(page)).toHaveCount(1);
  await duplicate.press('Enter');
  await expect(cards(page)).toHaveCount(2);
  const addButton = page.getByRole('button', { name: 'Add room', exact: true });
  await addButton.focus();
  await addButton.dispatchEvent('keydown', { key: 'Enter', repeat: true, bubbles: true });
  await expect(cards(page)).toHaveCount(2);
  await addButton.press('Enter');
  await expect(cards(page)).toHaveCount(3);
});

async function seedLegacy(page: Page) {
  const name = 'M3A sketch preservation ' + test.info().testId;
  const room: Room = {
    id: 'm3a-legacy-room', name: 'Original saved room', x: 80, y: 80, width: 400, height: 320,
    color: '#93c5fd', objects: [{ id: 'm3a-legacy-door', type: 'door', wallSide: 'top', position: 50, size: 160 / 3,
      doorProperties: { width: 32, height: 84, style: 'bifold', swingDirection: 'outward', swingSide: 'left' } }],
  };
  const response = await page.request.post('/api/floor-plans', { data: { name, rooms: [room],
    createdAt: '2025-06-01T00:00:00.000Z', updatedAt: '2025-06-01T00:00:00.000Z' } });
  expect(response.status()).toBe(201);
  const saved = await response.json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Load Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Load Sketch', exact: true });
  await dialog.getByText(name, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Load Selected Sketch' }).click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Select & Move', exact: true }).click();
  return { id: saved.id as number, room };
}
test('unsaved sketch state and zoom survive navigation; inactive shortcuts and Quick Rooms saving stay separate', async ({ page }) => {
  const saved = await seedLegacy(page);
  await page.getByTestId('room-m3a-legacy-room').click();
  await page.locator('#roomName').fill('Unsaved sketch name');
  await page.getByRole('button', { name: 'Zoom In', exact: true }).click();
  const zoom = await page.getByText(/^\d+%$/).innerText();
  const writes = watchWrites(page);
  await page.getByRole('link', { name: 'Quick Rooms', exact: true }).click();
  const card = await add(page);
  await dimensions(card);
  await card.getByLabel('Room name', { exact: true }).fill('Independent quick room');
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '=', bubbles: true }));
  });
  await page.getByRole('link', { name: 'Sketch editor', exact: true }).click();
  await expect(page.getByTestId('room-m3a-legacy-room')).toBeVisible();
  await expect(page.getByTestId('opening-m3a-legacy-door')).toBeVisible();
  await expect(page.locator('#roomName')).toHaveValue('Unsaved sketch name');
  await expect(page.getByText(zoom, { exact: true })).toBeVisible();
  expect((await (await page.request.get('/api/floor-plans/' + saved.id)).json()).rooms).toEqual([saved.room]);
  await page.getByRole('link', { name: 'Quick Rooms', exact: true }).click();
  await expect(cards(page).first().getByLabel('Room name', { exact: true })).toHaveValue('Independent quick room');
  await area(project(page), 'floor-area', '120.00 sq ft');
  await page.reload();
  await expect(cards(page).first().getByLabel('Room name', { exact: true })).toHaveValue('Independent quick room');
  await area(project(page), 'floor-area', '120.00 sq ft');
  expect(writes).toEqual([]);
});

for (const [kind, bytes] of [
  ['corrupt', '{preserve these original corrupt bytes'],
  ['unsupported', JSON.stringify({ version: 'quick-room-draft-v99', note: 'Preserve the future version' })],
] as const) {
  test(kind + ' cache stays byte-for-byte intact until confirmed draft-only discard', async ({ page }) => {
    await page.addInitScript(({ key, other, bytes }) => {
      sessionStorage.setItem(key, bytes);
      sessionStorage.setItem(other, 'unrelated content');
    }, { key: KEY, other: OTHER, bytes });
    await page.goto('/quick-room');
    await expect(page.getByText(/Refresh recovery is unavailable/)).toBeVisible();
    await expect(page.getByText(kind === 'corrupt' ? /cannot be read as JSON/ : /unsupported/i).first()).toBeVisible();
    expect(await page.evaluate(key => sessionStorage.getItem(key), KEY)).toBe(bytes);
    page.once('dialog', dialog => dialog.dismiss());
    await page.getByRole('button', { name: 'Discard Quick Rooms draft', exact: true }).click();
    expect(await page.evaluate(key => sessionStorage.getItem(key), KEY)).toBe(bytes);
    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: 'Discard Quick Rooms draft', exact: true }).click();
    await expect(cards(page)).toHaveCount(0);
    expect(await page.evaluate(key => sessionStorage.getItem(key), OTHER)).toBe('unrelated content');
    const remaining = await page.evaluate(key => sessionStorage.getItem(key), KEY);
    if (remaining !== null) {
      const parsed = parseDraft(remaining);
      expect(parsed.status).toBe('recovered');
      if (parsed.status === 'recovered') expect(parsed.draft.document.rooms).toEqual([]);
    }
    await dimensions(await add(page));
    await area(project(page), 'floor-area', '120.00 sq ft');
  });
}
test('blocked sessionStorage getter leaves a usable memory draft and honest refresh warning', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'sessionStorage', { configurable: true, get() { throw new DOMException('Storage blocked', 'SecurityError'); } });
  });
  await page.goto('/quick-room');
  await expect(page.getByText(/Refresh recovery is unavailable/)).toBeVisible();
  await dimensions(await add(page));
  await area(project(page), 'floor-area', '120.00 sq ft');
  await page.getByRole('link', { name: 'Sketch editor', exact: true }).click();
  await page.getByRole('link', { name: 'Quick Rooms', exact: true }).click();
  await area(project(page), 'floor-area', '120.00 sq ft');
});
test('quota failure preserves the previous cache and unrelated storage while newer results remain usable', async ({ page }) => {
  await page.goto('/quick-room');
  const card = await add(page);
  await dimensions(card);
  const before = await page.evaluate(key => sessionStorage.getItem(key), KEY);
  await page.evaluate(({ key, other }) => {
    sessionStorage.setItem(other, 'unrelated content');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (this === window.sessionStorage && name === key) throw new DOMException('Quota exhausted', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, { key: KEY, other: OTHER });
  await commit(card, 'Length', '15 ft');
  await expect(page.getByText(/Refresh recovery is unavailable/)).toBeVisible();
  await area(project(page), 'floor-area', '150.00 sq ft');
  expect(await page.evaluate(key => sessionStorage.getItem(key), KEY)).toBe(before);
  expect(await page.evaluate(key => sessionStorage.getItem(key), OTHER)).toBe('unrelated content');
});

for (const [name, viewport] of [
  ['desktop', { width: 1440, height: 1000 }],
  ['tablet', { width: 820, height: 1100 }],
  ['phone', { width: 390, height: 844 }],
] as const) {
  test('populated ' + name + ' viewport has usable labels, long names and results without horizontal overflow', async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/quick-room');
    const first = await add(page, 'Living Room');
    await dimensions(first);
    await first.getByLabel('Room name', { exact: true }).fill('Living room overlooking the garden and adjoining sitting area');
    const second = await add(page);
    await dimensions(second, '15 ft');
    await area(project(page), 'floor-area', '270.00 sq ft');
    await area(project(page), 'gross-wall-area', '752.00 sq ft');
    for (const card of [first, second]) for (const label of ['Room name', 'Length', 'Width', 'Ceiling height']) {
      const field = card.getByLabel(label, { exact: true });
      await field.scrollIntoViewIfNeeded();
      await expect(field).toBeVisible();
      const box = await field.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    // Test actual page scrolling: the canvas's mobile body lock must not leak here.
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page.getByRole('heading', { name: 'Quick Rooms', exact: true })).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath('quick-rooms-' + name + '.png'), fullPage: true });
  });
}
