import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Room, RoomObject } from '../../shared/schema';

// Every record belongs to the existing disposable loopback acceptance API.
test.use({ viewport: { width: 1920, height: 1080 } });
type SketchRoom = Room & { groupId?: string; legacyNote?: string; custom?: { tag: string; values: number[] } };
type Saved = { rooms: SketchRoom[]; name: string; createdAt: string };

function fixture(): SketchRoom[] {
  const door: RoomObject & { legacyNote: string } = {
    id: 'selection-door-a', type: 'door', wallSide: 'top', position: 37.5, size: 160 / 3,
    doorProperties: { width: 32, height: 84, style: 'bifold', swingDirection: 'outward', swingSide: 'right' },
    legacyNote: 'Opening metadata survives selection and movement',
  };
  return [
    { id: 'selection-a', name: 'Alpha', x: 60.25, y: 100.5, width: 240.5, height: 200.25,
      color: '#93c5fd', legacyNote: 'Preserve me', custom: { tag: 'first', values: [1, 2, 3] },
      objects: [door, { id: 'selection-window-a', type: 'window', wallSide: 'bottom', position: 62.5, size: 50 }] },
    { id: 'selection-b', name: 'Bravo', x: 300.75, y: 100.5, width: 199.25, height: 200.25,
      color: '#86efac', custom: { tag: 'second', values: [4, 5] },
      objects: [{ id: 'selection-door-b', type: 'door', wallSide: 'right', position: 50, size: 60,
        doorProperties: { width: 36, height: 80, style: 'single', swingDirection: 'inward', swingSide: 'left' } }] },
    { id: 'selection-c', name: 'Charlie', x: 500, y: 100.5, width: 180.75, height: 200.25,
      color: '#fde68a', objects: [{ id: 'selection-window-c', type: 'window', wallSide: 'bottom', position: 50, size: 45 }] },
  ];
}

const roomNode = (page: Page, id: string) => page.getByTestId('room-' + id);
const selectedNodes = (page: Page) => page.locator('.room-box[data-selected="true"]');
async function selectedIds(page: Page) {
  return selectedNodes(page).evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')!.slice(5)).sort());
}
async function expectSelected(page: Page, ids: string[]) {
  await expect.poll(() => selectedIds(page)).toEqual([...ids].sort());
}

// Adapted from the existing editor.spec.ts seed/load/save helpers.
async function loadSaved(page: Page, name: string, rooms: SketchRoom[]) {
  await page.getByRole('button', { name: 'Load Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Load Sketch', exact: true });
  await dialog.getByText(name, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Load Selected Sketch' }).click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  for (const room of rooms) await expect(roomNode(page, room.id)).toBeVisible();
  await page.getByRole('button', { name: 'Select & Move', exact: true }).click();
  await page.getByTitle('Fit All Rooms', { exact: true }).click();
}
async function seedAndLoad(page: Page, rooms = fixture()) {
  const name = 'Selection UX ' + test.info().testId;
  const response = await page.request.post('/api/floor-plans', { data: {
    name, rooms, createdAt: '2025-06-01T00:00:00.000Z', updatedAt: '2025-06-01T00:00:00.000Z',
  } });
  expect(response.status()).toBe(201);
  const saved = await response.json();
  await page.goto('/');
  await loadSaved(page, name, rooms);
  return { id: saved.id as number, name, rooms };
}
async function save(page: Page, id: number): Promise<Saved> {
  await page.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save Sketch', exact: true });
  const response = page.waitForResponse(item => item.url().endsWith('/api/floor-plans/' + id) && item.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  const result = await page.request.get('/api/floor-plans/' + id);
  expect(result.ok()).toBeTruthy();
  return await result.json() as Saved;
}
async function center(target: Locator) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}
async function clickRoom(page: Page, id: string, shift = false) {
  const point = await center(roomNode(page, id));
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.click(point.x, point.y);
  if (shift) await page.keyboard.up('Shift');
}
async function dragRoom(page: Page, id: string, dx = 47, dy = 43) {
  const point = await center(roomNode(page, id));
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 12 });
  await page.mouse.up();
}
function withoutPosition(room: SketchRoom) {
  const { x: _x, y: _y, ...rest } = room;
  return rest;
}
function withoutGroup(room: SketchRoom) {
  const { groupId: _groupId, ...rest } = room;
  return rest;
}
function expectRigidMove(before: SketchRoom[], after: SketchRoom[], movedIds: string[]) {
  expect(after.map(room => room.id)).toEqual(before.map(room => room.id));
  const anchor = before.find(room => movedIds.includes(room.id))!;
  const translated = after.find(room => room.id === anchor.id)!;
  const delta = { x: translated.x - anchor.x, y: translated.y - anchor.y };
  expect(Math.hypot(delta.x, delta.y), 'the drag must actually move the selection').toBeGreaterThan(1);
  before.forEach((original, index) => {
    if (!movedIds.includes(original.id)) expect(after[index]).toEqual(original);
    else {
      expect(after[index].x - original.x).toBeCloseTo(delta.x, 10);
      expect(after[index].y - original.y).toBeCloseTo(delta.y, 10);
      // Includes every opening, width/style/swing, name, color and custom field.
      expect(withoutPosition(after[index])).toEqual(withoutPosition(original));
    }
  });
}
async function openContentsRoom(page: Page, name: string) {
  const inspector = page.getByTestId('selection-inspector');
  const allRooms = inspector.getByRole('button', { name: 'All rooms', exact: true });
  if (await allRooms.isVisible()) await allRooms.click();
  await inspector.getByRole('button', { name: `Edit room ${name}`, exact: true }).click();
  await expect(inspector.getByRole('tab', { name: 'Room', exact: true })).toHaveAttribute('aria-selected', 'true');
  return inspector;
}
async function blurFocus(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
});
test.afterEach(async ({ page }) => { expect(errors.get(page)).toEqual([]); });

test('Select all moves three adjoining fractional rooms together without changing openings or metadata', async ({ page }) => {
  const plan = await seedAndLoad(page);
  await page.getByRole('button', { name: 'Select all rooms', exact: true }).click();
  await expectSelected(page, plan.rooms.map(room => room.id));
  await expect(page.getByRole('status').filter({ hasText: /^3 rooms selected$/ })).toBeVisible();
  await dragRoom(page, plan.rooms[1].id);
  await expectSelected(page, plan.rooms.map(room => room.id));
  await page.screenshot({ path: test.info().outputPath("selection.png") });
  const saved = await save(page, plan.id);
  expectRigidMove(plan.rooms, saved.rooms, plan.rooms.map(room => room.id));
  expect(saved.name).toBe(plan.name);
  expect(saved.createdAt).toBe('2025-06-01T00:00:00.000Z');
});

test('persistent group survives reload; ungroup and Shift-click restore independent partial movement', async ({ page }) => {
  const plan = await seedAndLoad(page);
  await page.getByRole('button', { name: 'Select all rooms', exact: true }).click();
  await page.getByRole('button', { name: 'Group rooms', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: /^3 rooms selected · Grouped$/ })).toBeVisible();
  const grouped = await save(page, plan.id);
  expect(grouped.rooms[0].groupId).toEqual(expect.any(String));
  expect(grouped.rooms[0].groupId!.trim().length).toBeGreaterThan(0);
  expect(new Set(grouped.rooms.map(room => room.groupId)).size).toBe(1);
  expect(grouped.rooms.map(withoutGroup)).toEqual(plan.rooms);
  await page.reload();
  await loadSaved(page, plan.name, grouped.rooms);
  await clickRoom(page, plan.rooms[1].id);
  await expectSelected(page, plan.rooms.map(room => room.id));
  await expect(page.getByRole('status').filter({ hasText: /^3 rooms selected · Grouped$/ })).toBeVisible();
  // A selection-only click on fractional geometry must not silently snap the group.
  expect((await save(page, plan.id)).rooms).toEqual(grouped.rooms);
  await page.getByRole('button', { name: 'Ungroup', exact: true }).click();
  await clickRoom(page, plan.rooms[1].id);
  await expectSelected(page, [plan.rooms[1].id]);
  await clickRoom(page, plan.rooms[2].id, true);
  await expectSelected(page, [plan.rooms[1].id, plan.rooms[2].id]);
  // Shift is a toggle exactly once, despite both mousedown and click events.
  await clickRoom(page, plan.rooms[2].id, true);
  await expectSelected(page, [plan.rooms[1].id]);
  await clickRoom(page, plan.rooms[2].id, true);
  await dragRoom(page, plan.rooms[1].id, 54, 51);
  const saved = await save(page, plan.id);
  expect(saved.rooms.every(room => !Object.hasOwn(room, 'groupId'))).toBe(true);
  expectRigidMove(plan.rooms, saved.rooms, [plan.rooms[1].id, plan.rooms[2].id]);
});

test('marquee selects its intersected rooms and moving one selected member leaves the third untouched', async ({ page }) => {
  const plan = await seedAndLoad(page);
  const a = await roomNode(page, plan.rooms[0].id).boundingBox();
  const b = await roomNode(page, plan.rooms[1].id).boundingBox();
  expect(a && b).toBeTruthy();
  // Start on empty grid; end inside Bravo, before Charlie's left edge.
  await page.mouse.move(a!.x - 12, a!.y - 18);
  await page.mouse.down();
  await page.mouse.move(b!.x + b!.width * 0.6, b!.y + b!.height * 0.6, { steps: 10 });
  await page.mouse.up();
  await expectSelected(page, [plan.rooms[0].id, plan.rooms[1].id]);
  await dragRoom(page, plan.rooms[1].id, 43, 57);
  expectRigidMove(plan.rooms, (await save(page, plan.id)).rooms, [plan.rooms[0].id, plan.rooms[1].id]);
});

test('room-name visibility toggles only presentation and keeps exact names and saved geometry', async ({ page }) => {
  const plan = await seedAndLoad(page);
  for (const room of plan.rooms) await expect(page.getByTestId('room-name-' + room.id)).toBeVisible();
  await page.getByRole('button', { name: 'Hide room names', exact: true }).click();
  for (const room of plan.rooms) await expect(page.getByTestId('room-name-' + room.id)).toHaveCount(0);
  expect((await save(page, plan.id)).rooms).toEqual(plan.rooms);
  await page.getByRole('button', { name: 'Show room names', exact: true }).click();
  for (const room of plan.rooms) await expect(page.getByTestId('room-name-' + room.id)).toHaveText(room.name!);
  expect((await save(page, plan.id)).rooms).toEqual(plan.rooms);
});

test('Doors tab selects the exact opening; repeated Delete cannot remove its parent and Undo restores it', async ({ page }) => {
  const plan = await seedAndLoad(page);
  await page.getByRole('button', { name: 'Select all rooms', exact: true }).click();
  await expectSelected(page, plan.rooms.map(room => room.id));
  const contents = await openContentsRoom(page, 'Alpha');
  await contents.getByRole('tab', { name: 'Doors (1)', exact: true }).click();
  await contents.getByRole('button', { name: 'Select door 1 in Alpha', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Delete door', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Delete door', exact: true }).click();
  await expect(page.getByTestId('opening-selection-door-a')).toHaveCount(0);
  await blurFocus(page);
  await page.keyboard.press('Delete');
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  for (const room of plan.rooms) await expect(roomNode(page, room.id)).toBeVisible();
  const expected = structuredClone(plan.rooms);
  expected[0].objects = expected[0].objects!.filter(object => object.id !== 'selection-door-a');
  expect((await save(page, plan.id)).rooms).toEqual(expected);
  await page.getByRole('button', { name: 'Undo delete', exact: true }).click();
  await expect(page.getByTestId('opening-selection-door-a')).toBeVisible();
  expect((await save(page, plan.id)).rooms).toEqual(plan.rooms);
});

test('Ctrl+A respects room-name input, open dialogs and inactive sketch, and selects all only in the active editor', async ({ page }) => {
  const plan = await seedAndLoad(page);
  await openContentsRoom(page, 'Alpha');
  await expectSelected(page, [plan.rooms[0].id]);
  const name = page.locator('#roomName');
  await name.focus();
  await page.keyboard.press('Control+a');
  expect(await name.evaluate(node => {
    const input = node as HTMLInputElement;
    return { value: input.value, start: input.selectionStart, end: input.selectionEnd };
  })).toEqual({ value: 'Alpha', start: 0, end: 5 });
  await expectSelected(page, [plan.rooms[0].id]);

  await page.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save Sketch', exact: true });
  await expect(dialog).toBeVisible();
  await blurFocus(page); // Exercise the global dialog guard, not only an input guard.
  await page.keyboard.press('Control+a');
  await expectSelected(page, [plan.rooms[0].id]);
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);

  await page.getByRole('link', { name: 'Quick Rooms', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Quick Rooms', exact: true })).toBeVisible();
  await blurFocus(page);
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Delete');
  await page.getByRole('link', { name: 'Sketch editor', exact: true }).click();
  await expectSelected(page, [plan.rooms[0].id]);
  await blurFocus(page);
  await page.keyboard.press('Control+a');
  await expectSelected(page, plan.rooms.map(room => room.id));
  expect((await save(page, plan.id)).rooms).toEqual(plan.rooms);
});

test('individual room editing keeps grouped dragging together; deleting a group is one recoverable action', async ({ page }) => {
  const plan = await seedAndLoad(page);
  await page.getByRole('button', { name: 'Select all rooms', exact: true }).click();
  await page.getByRole('button', { name: 'Group rooms', exact: true }).click();
  const grouped = (await save(page, plan.id)).rooms;
  await openContentsRoom(page, 'Alpha');
  await expectSelected(page, [plan.rooms[0].id]);
  await dragRoom(page, plan.rooms[0].id, 45, 50);
  await expectSelected(page, plan.rooms.map(room => room.id));
  const moved = (await save(page, plan.id)).rooms;
  expectRigidMove(grouped, moved, plan.rooms.map(room => room.id));
  page.once('dialog', dialog => dialog.accept());
  await page.getByRole('button', { name: 'Delete 3 rooms', exact: true }).click();
  await expect(page.locator('.room-box')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo delete', exact: true }).click();
  expect((await save(page, plan.id)).rooms).toEqual(moved);
});

test('room tabs list only that room, number openings by type, and preserve geometry through a round trip', async ({ page }) => {
  const rooms = fixture();
  rooms[0].objects!.push(
    { id: 'alpha-door-two', type: 'door', wallSide: 'left', position: 50, size: 140 / 3,
      doorProperties: { width: 28, height: 80, style: 'single', swingDirection: 'inward', swingSide: 'left' } },
    { id: 'alpha-window-two', type: 'window', wallSide: 'right', position: 75, size: 40,
      windowProperties: { height: 42 } },
  );
  const plan = await seedAndLoad(page, rooms);
  const inspector = await openContentsRoom(page, 'Alpha');
  await expect(inspector.locator('details, summary')).toHaveCount(0);
  await expect(inspector.getByRole('tab')).toHaveText(['Room', 'Doors 2', 'Windows 2']);
  await expectSelected(page, ['selection-a']);

  await inspector.getByRole('tab', { name: 'Doors (2)', exact: true }).click();
  await expectSelected(page, []);
  await expect(inspector.getByRole('button', { name: /^Select door / })).toHaveCount(2);
  await expect(inspector.getByRole('button', { name: 'Select door 1 in Alpha', exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Select door 2 in Alpha', exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: /^Select window / })).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: 'Select door 1 in Bravo', exact: true })).toHaveCount(0);
  await expect(page.locator('[data-opening-type][aria-pressed="true"]')).toHaveCount(0);
  await blurFocus(page);
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  expect((await save(page, plan.id)).rooms).toEqual(rooms);

  await inspector.getByRole('button', { name: 'Select door 2 in Alpha', exact: true }).click();
  await expect(page.getByTestId('opening-alpha-door-two')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('opening-selection-door-a')).toHaveAttribute('aria-pressed', 'false');
  await expect(inspector.getByRole('spinbutton', { name: 'Door width', exact: true })).toHaveValue('28');
  await inspector.getByRole('tab', { name: 'Windows (2)', exact: true }).click();
  await expectSelected(page, []);
  await expect(page.locator('[data-opening-type][aria-pressed="true"]')).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: /^Select door / })).toHaveCount(0);
  await expect(inspector.getByRole('button', { name: /^Select window / })).toHaveCount(2);
  await inspector.getByRole('button', { name: 'Select window 1 in Alpha', exact: true }).click();
  await expect(page.getByTestId('opening-selection-window-a')).toHaveAttribute('aria-pressed', 'true');
  await expect(inspector.getByRole('spinbutton', { name: 'Window width', exact: true })).toHaveValue('30');
  await inspector.getByRole('button', { name: 'Select window 2 in Alpha', exact: true }).click();
  await expect(page.getByTestId('opening-alpha-window-two')).toHaveAttribute('aria-pressed', 'true');
  await expect(inspector.getByRole('spinbutton', { name: 'Window width', exact: true })).toHaveValue('24');
  await expect(inspector.getByRole('spinbutton', { name: 'Window height', exact: true })).toHaveValue('42');

  await inspector.getByRole('tab', { name: 'Room', exact: true }).click();
  await expectSelected(page, ['selection-a']);
  await expect(inspector.locator('#roomName')).toHaveValue('Alpha');
  await inspector.getByRole('button', { name: 'All rooms', exact: true }).click();
  await expectSelected(page, []);
  await expect(inspector.getByRole('button', { name: /^Edit room / })).toHaveCount(3);
  await expect(inspector.getByRole('tab')).toHaveCount(0);
  await expect(inspector.locator('details, summary')).toHaveCount(0);
  expect((await save(page, plan.id)).rooms).toEqual(rooms);
});

test('sidebar tabs support arrow, Home and End keyboard navigation without selecting a hidden item', async ({ page }) => {
  const plan = await seedAndLoad(page);
  const inspector = await openContentsRoom(page, 'Alpha');
  const roomTab = inspector.getByRole('tab', { name: 'Room', exact: true });
  const doorsTab = inspector.getByRole('tab', { name: 'Doors (1)', exact: true });
  const windowsTab = inspector.getByRole('tab', { name: 'Windows (1)', exact: true });
  await roomTab.focus();
  for (const [from, key, to, roomIsSelected] of [
    [roomTab, 'ArrowRight', doorsTab, false],
    [doorsTab, 'ArrowRight', windowsTab, false],
    [windowsTab, 'ArrowLeft', doorsTab, false],
    [doorsTab, 'Home', roomTab, true],
    [roomTab, 'End', windowsTab, false],
  ] as const) {
    await from.press(key);
    await expect(to).toBeFocused();
    // Both standard automatic activation and explicit Enter activation are supported.
    await to.press('Enter');
    await expect(to).toHaveAttribute('aria-selected', 'true');
    await expect(to).toHaveAttribute('tabindex', '0');
    await expect(inspector.locator('[role="tab"][aria-selected="false"][tabindex="-1"]')).toHaveCount(2);
    await expectSelected(page, roomIsSelected ? ['selection-a'] : []);
    await expect(page.locator('[data-opening-type][aria-pressed="true"]')).toHaveCount(0);
  }
  await blurFocus(page);
  await page.keyboard.press('Delete');
  expect((await save(page, plan.id)).rooms).toEqual(plan.rooms);
});

test('canvas selection opens the matching room tab and shows properties for the exact opening', async ({ page }) => {
  const plan = await seedAndLoad(page);
  const inspector = page.getByTestId('selection-inspector');
  await page.getByTestId('opening-selection-door-a').click();
  await expect(inspector.getByRole('tab', { name: 'Doors (1)', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(inspector.getByRole('spinbutton', { name: 'Door width', exact: true })).toHaveValue('32');
  await expect(inspector.getByRole('button', { name: 'Select door 1 in Alpha', exact: true })).toBeVisible();
  await page.getByTestId('opening-selection-window-a').click();
  await expect(inspector.getByRole('tab', { name: 'Windows (1)', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(inspector.getByRole('spinbutton', { name: 'Window width', exact: true })).toHaveValue('30');
  await expect(inspector.getByRole('button', { name: 'Select window 1 in Alpha', exact: true })).toBeVisible();
  await page.getByTestId('opening-selection-door-b').click();
  await expect(inspector.getByRole('tab', { name: 'Doors (1)', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(inspector.getByRole('tab', { name: 'Windows (0)', exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Select door 1 in Bravo', exact: true })).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Select door 1 in Alpha', exact: true })).toHaveCount(0);
  await expect(inspector.getByRole('spinbutton', { name: 'Door width', exact: true })).toHaveValue('36');
  await clickRoom(page, 'selection-c');
  await expect(inspector.getByRole('tab', { name: 'Room', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(inspector.locator('#roomName')).toHaveValue('Charlie');
  await expectSelected(page, ['selection-c']);
  expect((await save(page, plan.id)).rooms).toEqual(plan.rooms);
});

test('empty opening tabs remain usable and Delete cannot remove their room context', async ({ page }) => {
  const emptyRoom = { ...fixture()[0], name: 'Empty room', objects: [] };
  const plan = await seedAndLoad(page, [emptyRoom]);
  const inspector = await openContentsRoom(page, 'Empty room');
  await expect(inspector.getByRole('tab')).toHaveText(['Room', 'Doors 0', 'Windows 0']);
  for (const tab of ['Doors (0)', 'Windows (0)']) {
    await inspector.getByRole('tab', { name: tab, exact: true }).click();
    await expect(inspector.getByRole('tab', { name: tab, exact: true })).toHaveAttribute('aria-selected', 'true');
    await expectSelected(page, []);
    await expect(inspector.getByRole('button', { name: /^Select (door|window) / })).toHaveCount(0);
    await expect(inspector.getByRole('button', { name: 'Delete room', exact: true })).not.toBeVisible();
    await blurFocus(page);
    await page.keyboard.press('Delete');
    await page.keyboard.press('Backspace');
    await expect(roomNode(page, emptyRoom.id)).toBeVisible();
    await expect(inspector.getByRole('button', { name: 'All rooms', exact: true })).toBeVisible();
  }
  await inspector.getByRole('tab', { name: 'Room', exact: true }).click();
  await expectSelected(page, [emptyRoom.id]);
  await expect(inspector.locator('#roomName')).toHaveValue('Empty room');
  expect((await save(page, plan.id)).rooms).toEqual([emptyRoom]);
});

test('changing tabs commits valid size drafts and superseded room browsing cannot return', async ({ page }) => {
  const plan = await seedAndLoad(page);
  const inspector = page.getByTestId('selection-inspector');
  await page.getByTestId('opening-selection-door-a').click();
  await inspector.getByRole('spinbutton', { name: 'Door width', exact: true }).fill('30.5');
  await inspector.getByRole('tab', { name: 'Windows (1)', exact: true }).click();
  await inspector.getByRole('tab', { name: 'Doors (1)', exact: true }).click();
  await inspector.getByRole('button', { name: 'Select door 1 in Alpha', exact: true }).click();
  await expect(inspector.getByRole('spinbutton', { name: 'Door width', exact: true })).toHaveValue('30.5');
  const expected = structuredClone(plan.rooms);
  expected[0].objects![0].size = 30.5 * 20 / 12;
  expected[0].objects![0].doorProperties!.width = 30.5;
  expect((await save(page, plan.id)).rooms).toEqual(expected);
  await inspector.getByRole('spinbutton', { name: 'Door width', exact: true }).fill('');
  await inspector.getByRole('tab', { name: 'Windows (1)', exact: true }).click();
  expect((await save(page, plan.id)).rooms).toEqual(expected);
  // Real canvas selection supersedes Alpha's browse context, including after deselection.
  await clickRoom(page, 'selection-b');
  await expect(inspector.getByTestId('inspector-room-name')).toHaveText('Bravo');
  await blurFocus(page); await page.keyboard.press('Escape');
  await expect(inspector.getByRole('button', { name: 'Edit room Alpha', exact: true })).toBeVisible();
  await expect(inspector.getByRole('tab')).toHaveCount(0);
  expect((await save(page, plan.id)).rooms).toEqual(expected);
});

test('narrow sidebar keeps tab labels and selected-opening actions inside its bounds', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 });
  await seedAndLoad(page);
  const inspector = await openContentsRoom(page, 'Alpha');
  await inspector.getByRole('tab', { name: 'Windows (1)', exact: true }).click();
  await inspector.getByRole('button', { name: 'Select window 1 in Alpha', exact: true }).click();
  const bounds = (await inspector.boundingBox())!;
  for (const tab of await inspector.getByRole('tab').all()) {
    await expect(tab).toBeVisible();
    const box = (await tab.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(bounds.x);
    expect(box.x + box.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(await tab.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  }
  const remove = inspector.getByRole('button', { name: 'Delete window', exact: true });
  await expect(remove).toBeVisible();
  const removeBounds = (await remove.boundingBox())!;
  expect(removeBounds.x + removeBounds.width).toBeLessThanOrEqual(bounds.x + bounds.width);
  await expect(inspector.getByRole('spinbutton', { name: 'Window width', exact: true })).toBeVisible();
});

test('compact opening inspector has one size pair and keeps wall location visible without duplicate controls', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 820 });
  const plan = await seedAndLoad(page);
  const inspector = await openContentsRoom(page, 'Alpha');
  for (const [type, label, wall, position] of [
    ['door', 'Door', 'top', '38%'], ['window', 'Window', 'bottom', '63%'],
  ] as const) {
    await inspector.getByRole('tab', { name: type === 'door' ? 'Doors (1)' : 'Windows (1)', exact: true }).click();
    await inspector.getByRole('button', { name: 'Select ' + type + ' 1 in Alpha', exact: true }).click();
    await expect(inspector.getByRole('spinbutton')).toHaveCount(2);
    for (const axis of ['width', 'height']) {
      await expect(inspector.getByRole('spinbutton', { name: label + ' ' + axis, exact: true })).toHaveCount(1);
      await expect(inspector.getByRole('button', { name: 'Common ' + type + ' ' + axis, exact: true })).toHaveCount(1);
    }
    await expect(inspector.getByText(/^Current size:/)).toHaveCount(0);
    await expect(inspector.getByText(/^Custom size/)).toHaveCount(0);
    await expect(inspector.getByRole('button', { name: 'Flip hinge', exact: true })).toHaveCount(0);
    await expect(inspector.getByRole('button', { name: 'Reverse swing', exact: true })).toHaveCount(0);
    const location = inspector.getByTestId('inspector-opening-location');
    await expect(location).toContainText(wall);
    await expect(location).toContainText(position);
    // Read bounds without auto-scrolling the location into view.
    const outer = (await inspector.boundingBox())!;
    const locationBounds = (await location.boundingBox())!;
    expect(locationBounds.y).toBeGreaterThanOrEqual(outer.y);
    expect(locationBounds.y + locationBounds.height).toBeLessThanOrEqual(Math.min(outer.y + outer.height, outer.y + 680));
    expect(locationBounds.x).toBeGreaterThanOrEqual(outer.x);
    expect(locationBounds.x + locationBounds.width).toBeLessThanOrEqual(outer.x + outer.width);
    if (type === 'door') {
      for (const name of ['Inward', 'Outward', 'Left Hand (LH)', 'Right Hand (RH)']) {
        await expect(inspector.getByRole('radio', { name, exact: true })).toBeVisible();
      }
    }
  }
  expect((await save(page, plan.id)).rooms).toEqual(plan.rooms);
});
