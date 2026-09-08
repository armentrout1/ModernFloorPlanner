import { expect, test, type Page, type Locator } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY } from '../../client/src/features/physical-draft/storage';
import type { PhysicalDraft, PhysicalDraftRegistry } from '../../client/src/features/physical-draft/state';
import type { Room } from '../../shared/schema';

const QUICK_KEY = 'modern-floor-planner:quick-rooms:v1';
const OTHER_KEY = 'physical-draft-unrelated';
const inspector = (page: Page) => page.getByTestId('physical-room-inspector');
const field = (page: Page, label: string) => inspector(page).getByLabel(new RegExp('^' + label + ' \\((ft|m)\\)$'));
async function registry(page: Page): Promise<PhysicalDraftRegistry> {
  await expect.poll(async () => parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY)).status).toBe('recovered');
  const parsed = parseRegistry(await page.evaluate(key => sessionStorage.getItem(key), KEY));
  if (parsed.status !== 'recovered') throw new Error('Expected validated full physical draft recovery state');
  return parsed.registry;
}
async function selected(page: Page): Promise<PhysicalDraft> {
  const value = await registry(page);
  const draft = value.drafts.find(item => item.id === value.selectedDraftId);
  if (!draft) throw new Error('No selected physical draft');
  return draft;
}
async function commit(page: Page, name: string, text: string) {
  await field(page, name).fill(text);
  await field(page, name).press('Enter');
  await field(page, name).press('Tab');
}
async function createRoom(page: Page) {
  await page.goto('/physical-draft');
  await page.getByRole('button', { name: 'New physical draft', exact: true }).click();
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await expect(inspector(page)).toBeVisible();
  return selected(page);
}
async function dimensions(page: Page, length = '12 ft', width = '10 ft', height = '8 ft') {
  await commit(page, 'Length', length);
  await commit(page, 'Width', width);
  await commit(page, 'Ceiling height', height);
}
async function quantities(page: Page, floor: string, ceiling: string, walls: string) {
  await expect(page.getByTestId('physical-floor')).toContainText(floor);
  await expect(page.getByTestId('physical-ceiling')).toContainText(ceiling);
  await expect(page.getByTestId('physical-walls')).toContainText(walls);
}
function watchApiWrites(page: Page) {
  const requests: string[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) {
      requests.push(request.method() + ' ' + new URL(request.url()).pathname);
    }
  });
  return requests;
}
const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('one physical draft synchronizes room identity, dimensions and ceiling quantities between both views', async ({ page }) => {
  const writes = watchApiWrites(page);
  await page.setViewportSize({ width: 1600, height: 1200 });
  const created = await createRoom(page);
  const roomId = created.document.rooms[0].id;
  await expect(page.getByTestId('physical-draft-id')).toContainText(created.id);
  for (const name of ['Length', 'Width', 'Ceiling height']) await expect(field(page, name)).toHaveValue('');
  await inspector(page).getByLabel('Room name', { exact: true }).fill('Shared bedroom');
  await dimensions(page);
  await quantities(page, '120.00 sq ft', '120.00 sq ft', '352.00 sq ft');
  await expect(page.getByTestId('physical-walls')).toContainText(/provisional/i);
  const entered = await selected(page);
  for (const key of ['length', 'width', 'ceilingHeight'] as const) {
    const measure = entered.document.rooms[0][key];
    expect(measure.state).toBe('known');
    if (measure.state === 'known') expect(measure.provenance.confirmation.status).toBe('unconfirmed');
  }
  await page.getByRole('tab', { name: 'Drawing', exact: true }).click();
  await expect(inspector(page)).toHaveAttribute('data-room-id', roomId);
  const projected = page.getByTestId('physical-room-' + roomId);
  expect(Number(await projected.getAttribute('data-mm-length'))).toBeCloseTo(3657.6, 8);
  expect(Number(await projected.getAttribute('data-mm-width'))).toBeCloseTo(3048, 8);
  await expect(projected).toContainText('Shared bedroom');
  await commit(page, 'Ceiling height', '9 ft');
  await quantities(page, '120.00 sq ft', '120.00 sq ft', '396.00 sq ft');
  const beforeFit = await selected(page);
  await page.getByRole('region', { name: 'Physical drawing', exact: true })
    .getByRole('button', { name: 'Fit drawing', exact: true }).click();
  const settleFrames = () => page.evaluate(() => new Promise<void>(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  const centeredError = () => projected.evaluate(node => {
    const canvas = node.closest('[data-testid="physical-canvas"]')!;
    const viewport = canvas.getBoundingClientRect(), room = node.getBoundingClientRect();
    return Math.max(Math.abs(room.x + room.width / 2 - viewport.x - viewport.width / 2),
      Math.abs(room.y + room.height / 2 - viewport.y - viewport.height / 2));
  });
  await settleFrames();
  await expect.poll(centeredError).toBeLessThanOrEqual(2);
  // A full-page capture can trigger Chromium scroll anchoring after a layout
  // update; the physical drawing must retain the same centered view afterward.
  await page.screenshot({ path: test.info().outputPath('physical-draft-drawing-desktop.png'), fullPage: true });
  await settleFrames();
  await expect.poll(centeredError).toBeLessThanOrEqual(2);
  const afterFit = await selected(page);
  expect(afterFit.document).toEqual(beforeFit.document);
  expect(afterFit.events).toEqual(beforeFit.events);
  expect(afterFit.request).toEqual(beforeFit.request);
  await expect(projected).toContainText('Shared bedroom');
  await page.getByRole('tab', { name: 'Quick Rooms', exact: true }).click();
  await expect(field(page, 'Ceiling height')).toHaveValue('9 ft');
  expect((await selected(page)).id).toBe(created.id);
  await commit(page, 'Length', '14 ft');
  await commit(page, 'Width', '11 ft');
  await page.getByRole('tab', { name: 'Drawing', exact: true }).click();
  expect(Number(await projected.getAttribute('data-mm-length'))).toBeCloseTo(4267.2, 8);
  expect(Number(await projected.getAttribute('data-mm-width'))).toBeCloseTo(3352.8, 8);
  await expect(inspector(page).getByLabel('Room name', { exact: true })).toHaveValue('Shared bedroom');
  await quantities(page, '154.00 sq ft', '154.00 sq ft', '450.00 sq ft');
  await commit(page, 'Ceiling height', '');
  await quantities(page, '154.00 sq ft', '154.00 sq ft', 'Incomplete');
  await commit(page, 'Ceiling height', '8 ft');
  await field(page, 'Ceiling height').fill('8 ft -');
  await quantities(page, '154.00 sq ft', '154.00 sq ft', 'Incomplete');
  await expect(page.getByTestId('physical-walls')).not.toContainText('400.00 sq ft');
  const unresolved = await selected(page);
  expect(unresolved.fields[roomId].ceilingHeight).toMatchObject({ text: '8 ft -', unit: 'ft', dirty: true });
  expect(unresolved.document.rooms[0].id).toBe(roomId);
  expect(writes).toEqual([]);
});

test('fractional and metric inputs, pending unit context, one commit action and view controls retain canonical measurements', async ({ page }) => {
  const created = await createRoom(page), roomId = created.document.rooms[0].id;
  await dimensions(page, '12 ft 6 in', '10 ft', '8 ft');
  const before = await selected(page);
  await commit(page, 'Length', '3.81 m');
  expect((await selected(page)).document.rooms[0].length.valueMm).toBe(before.document.rooms[0].length.valueMm);
  await field(page, 'Ceiling height').fill('9 ft -');
  await page.getByRole('button', { name: 'Meters', exact: true }).click();
  await expect(field(page, 'Ceiling height')).toHaveValue('9 ft -');
  await expect(field(page, 'Ceiling height')).toHaveAccessibleName('Ceiling height (ft)');
  const eventsBefore = (await selected(page)).events.length;
  await field(page, 'Ceiling height').fill('9');
  await field(page, 'Ceiling height').press('Enter');
  await field(page, 'Ceiling height').press('Tab');
  const committed = await selected(page);
  expect(committed.events).toHaveLength(eventsBefore + 1);
  expect(committed.document.rooms[0].ceilingHeight.valueMm).toBeCloseTo(2743.2, 9);
  await page.getByRole('tab', { name: 'Drawing', exact: true }).click();
  const drawing = page.getByRole('region', { name: 'Physical drawing', exact: true });
  await drawing.getByRole('button', { name: 'Fit drawing', exact: true }).click();
  await drawing.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await drawing.getByRole('button', { name: 'Zoom out', exact: true }).click();
  await page.getByTestId('physical-canvas').evaluate(node => { node.scrollLeft += 30; node.scrollTop += 20; });
  const viewed = await selected(page);
  expect(viewed.document).toEqual(committed.document);
  expect(viewed.events).toEqual(committed.events);
  expect(viewed.request).toEqual(committed.request);
  expect(viewed.document.rooms[0].id).toBe(roomId);
});

test('unsupported ceiling and wall applicability block only their actual dependent quantities', async ({ page }) => {
  await createRoom(page);
  await dimensions(page);
  await quantities(page, '120.00 sq ft', '120.00 sq ft', '352.00 sq ft');
  await inspector(page).getByLabel('Ceiling model', { exact: true }).selectOption('unsupported');
  await quantities(page, '120.00 sq ft', 'Unsupported', '352.00 sq ft');
  const ceilingUnsupported = await selected(page);
  expect(ceilingUnsupported.document.calculationContract!.rooms[ceilingUnsupported.document.rooms[0].id].ceiling.value).toBe('unsupported');
  expect(ceilingUnsupported.document.rooms[0].ceilingHeight.valueMm).toBeCloseTo(2438.4, 9);
  await inspector(page).getByLabel('Ceiling model', { exact: true }).selectOption('flat');
  await inspector(page).getByLabel('Wall model', { exact: true }).selectOption('unsupported');
  await quantities(page, '120.00 sq ft', '120.00 sq ft', 'Unsupported');
  await expect(page.getByTestId('physical-ceiling')).toContainText(/provisional/i);
});

test('explicit Quick Rooms copies keep original bytes and separate draft identities through edits and same-tab recovery', async ({ page }) => {
  const writes = watchApiWrites(page);
  await page.goto('/quick-room');
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  const card = page.getByTestId('quick-room-card');
  await card.getByLabel('Room name', { exact: true }).fill('Original room');
  for (const [name, text] of [['Length', '12 ft'], ['Width', '10 ft'], ['Ceiling height', '8 ft']]) {
    await card.getByLabel(name, { exact: true }).fill(text);
    await card.getByLabel(name, { exact: true }).press('Enter');
  }
  const original = await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY);
  await page.getByRole('button', { name: 'Open a physical copy', exact: true }).click();
  await expect(page).toHaveURL(/\/physical-draft$/);
  const first = await selected(page);
  expect(first.source.kind).toBe('quick-rooms');
  expect(first.source.original).toEqual(JSON.parse(original!));
  await inspector(page).getByLabel('Room name', { exact: true }).fill('Physical copy only');
  await field(page, 'Ceiling height').fill('8 ft -');
  await page.getByRole('button', { name: 'Meters', exact: true }).click();
  const beforeRefresh = await selected(page);
  await page.reload();
  await expect(inspector(page).getByLabel('Room name', { exact: true })).toHaveValue('Physical copy only');
  await expect(field(page, 'Ceiling height')).toHaveValue('8 ft -');
  expect(await selected(page)).toEqual(beforeRefresh);
  expect(await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY)).toBe(original);
  await page.goto('/quick-room');
  await expect(card.getByLabel('Room name', { exact: true })).toHaveValue('Original room');
  await page.getByRole('button', { name: 'Open a physical copy', exact: true }).click();
  const copies = await registry(page), second = await selected(page);
  expect(copies.drafts).toHaveLength(2);
  expect(second.id).not.toBe(first.id);
  expect(second.document.rooms[0].id).toBe(first.document.rooms[0].id);
  expect(copies.drafts.find(value => value.id === first.id)).toEqual(beforeRefresh);
  expect(second.document.rooms[0].name).toBe('Original room');
  expect(await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY)).toBe(original);
  expect(writes).toEqual([]);
});

function legacyRooms(): Room[] {
  return [
    { id: 'physical-legacy-a', name: 'Legacy Alpha', x: 80.25, y: 100.5, width: 400, height: 300,
      color: '#93c5fd', groupId: 'old-group', metadata: { untouched: [1, 'two'] },
      objects: [{ id: 'physical-legacy-door', type: 'door', wallSide: 'top', position: 37.5, size: 160 / 3,
        doorProperties: { width: 32, height: 84, style: 'bifold', swingDirection: 'outward', swingSide: 'left' } }] },
    { id: 'physical-legacy-b', name: 'Legacy Bravo', x: 480.25, y: 100.5, width: 240, height: 300,
      color: '#86efac', groupId: 'old-group', objects: [{ id: 'physical-legacy-window', type: 'window', wallSide: 'right', position: 50,
        size: 60, windowProperties: { height: 48 }, metadata: { keep: 'window source' } }] },
  ];
}
async function outline(scope: Locator, id: string) {
  return scope.getByTestId('door-swing-' + id).locator('[data-door-outline]').evaluate(node => ({
    path: node.getAttribute('d'), transform: node.parentElement?.getAttribute('transform'),
  }));
}

test('legacy adoption preserves groups, recorded window height and door appearance; its read-only projection never edits the original', async ({ page }) => {
  const rooms = legacyRooms(), name = 'Physical adoption ' + test.info().testId;
  const response = await page.request.post('/api/floor-plans', { data: { name, rooms,
    createdAt: '2025-06-01T00:00:00.000Z', updatedAt: '2025-06-01T00:00:00.000Z' } });
  expect(response.status()).toBe(201);
  const saved = await response.json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Load Sketch', exact: true }).click();
  const load = page.getByRole('dialog', { name: 'Load Sketch', exact: true });
  await load.getByText(name, { exact: true }).click();
  await load.getByRole('button', { name: 'Load Selected Sketch', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const originalOutline = await outline(page.locator('body'), 'physical-legacy-door');
  const writes = watchApiWrites(page);
  await page.getByRole('button', { name: 'Open a physical copy', exact: true }).click();
  await expect(page).toHaveURL(/\/physical-draft$/);
  const draft = await selected(page);
  expect(draft.source.kind).toBe('legacy');
  expect(draft.source.operation).toBe('legacy-pixels-v2');
  expect((draft.source.original as { rooms: Room[] }).rooms).toEqual(rooms);
  expect(draft.document.editorContract!.groups).toEqual([{ id: 'old-group', roomIds: rooms.map(room => room.id) }]);
  for (const room of draft.document.rooms) expect(room.ceilingHeight.state).toBe('unknown');
  const window = draft.document.openings.find(item => item.id === 'physical-legacy-window')!;
  expect(window.height.state).toBe('known');
  expect(window.height.valueMm).toBeCloseTo(1219.2, 8);
  expect(draft.document.openings.find(item => item.id === 'physical-legacy-door')!.appearance)
    .toMatchObject({ style: 'bifold', swingDirection: 'outward', swingSide: 'left' });
  await page.getByRole('tab', { name: 'Drawing', exact: true }).click();
  const drawing = page.getByRole('region', { name: 'Physical drawing', exact: true });
  await drawing.getByRole('button', { name: 'Fit drawing', exact: true }).click();
  expect(await outline(drawing, 'physical-legacy-door')).toEqual(originalOutline);
  for (const room of rooms) await expect(drawing.getByTestId('physical-room-' + room.id)).toHaveAttribute('data-group-id', 'old-group');
  const door = drawing.getByTestId('opening-physical-legacy-door');
  const box = (await door.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.press('Delete');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 50, box.y + 60, { steps: 4 });
  await page.mouse.up();
  expect((await selected(page)).document).toEqual(draft.document);
  await expect(drawing).toContainText(/read-only/i);
  expect(writes).toEqual([]);
  await page.reload();
  expect(await selected(page)).toEqual(draft);
  expect((await (await page.request.get('/api/floor-plans/' + saved.id)).json()).rooms).toEqual(rooms);
});

for (const [name, bytes] of [['corrupt', '{unfinished'], ['unsupported', JSON.stringify({ version: 'future-editor-v9', drafts: [{ keep: 'all original bytes' }] })]]) {
  test(name + ' physical recovery preserves its bytes and unrelated original storage', async ({ page }) => {
    await page.addInitScript(({ key, raw, quick, other }) => {
      sessionStorage.setItem(key, raw);
      sessionStorage.setItem(quick, 'preserved original Quick Rooms bytes');
      sessionStorage.setItem(other, 'preserved unrelated value');
    }, { key: KEY, raw: bytes, quick: QUICK_KEY, other: OTHER_KEY });
    await page.goto('/physical-draft');
    await expect(page.getByRole('alert')).toContainText(name === 'corrupt' ? 'cannot be read as JSON' : 'unsupported version');
    await expect(page.getByRole('button', { name: 'New physical draft', exact: true })).toBeDisabled();
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download original recovery data', exact: true }).click();
    const download = await downloadEvent;
    const downloadPath = await download.path();
    expect(await readFile(downloadPath!, 'utf8')).toBe(bytes);
    expect(await page.evaluate(key => sessionStorage.getItem(key), KEY)).toBe(bytes);
    expect(await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY)).toBe('preserved original Quick Rooms bytes');
    expect(await page.evaluate(key => sessionStorage.getItem(key), OTHER_KEY)).toBe('preserved unrelated value');
  });
}
test('blocked browser storage permits an honest memory-only physical draft without API saving', async ({ page }) => {
  const writes = watchApiWrites(page);
  await page.addInitScript(() => Object.defineProperty(window, 'sessionStorage', { configurable: true,
    get() { throw new DOMException('Denied for isolated acceptance', 'SecurityError'); } }));
  await page.goto('/physical-draft');
  await expect(page.getByRole('status')).toContainText(/storage is unavailable|only in memory/i);
  await page.getByRole('button', { name: 'New physical draft', exact: true }).click();
  await page.getByRole('button', { name: 'Add room', exact: true }).click();
  await dimensions(page);
  await quantities(page, '120.00 sq ft', '120.00 sq ft', '352.00 sq ft');
  await expect(page.getByTestId('physical-view')).toContainText(/browser tab only/i);
  expect(writes).toEqual([]);
});

test('quota failure preserves the previous full registry and original keys while newer measurements remain usable', async ({ page }) => {
  const writes = watchApiWrites(page);
  await createRoom(page);
  await dimensions(page);
  const previous = await page.evaluate(key => sessionStorage.getItem(key), KEY);
  await page.evaluate(({ key, quick, other }) => {
    sessionStorage.setItem(quick, 'untouched Quick Rooms cache');
    sessionStorage.setItem(other, 'untouched unrelated cache');
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(name, value) {
      if (name === key) throw new DOMException('Isolated acceptance quota failure', 'QuotaExceededError');
      return original.call(this, name, value);
    };
  }, { key: KEY, quick: QUICK_KEY, other: OTHER_KEY });
  await commit(page, 'Ceiling height', '9 ft');
  await quantities(page, '120.00 sq ft', '120.00 sq ft', '396.00 sq ft');
  await expect(page.getByRole('status')).toContainText(/held in memory|could not be saved/i);
  expect(await page.evaluate(key => sessionStorage.getItem(key), KEY)).toBe(previous);
  expect(await page.evaluate(key => sessionStorage.getItem(key), QUICK_KEY)).toBe('untouched Quick Rooms cache');
  expect(await page.evaluate(key => sessionStorage.getItem(key), OTHER_KEY)).toBe('untouched unrelated cache');
  expect(writes).toEqual([]);
});