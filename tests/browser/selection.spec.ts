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
  const details = page.getByRole('region', { name: 'Drawing contents', exact: true }).locator('details')
    .filter({ has: page.locator('summary').filter({ hasText: name }) });
  await expect(details).toHaveCount(1);
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  return details;
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

test('Drawing contents selects the exact opening; repeated Delete cannot remove its parent and Undo restores it', async ({ page }) => {
  const plan = await seedAndLoad(page);
  await page.getByRole('button', { name: 'Select all rooms', exact: true }).click();
  await expectSelected(page, plan.rooms.map(room => room.id));
  const contents = await openContentsRoom(page, 'Alpha');
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
  const contents = await openContentsRoom(page, 'Alpha');
  await contents.getByRole('button', { name: 'Edit room Alpha', exact: true }).click();
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
  const details = await openContentsRoom(page, 'Alpha');
  await details.getByRole('button', { name: 'Edit room Alpha', exact: true }).click();
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
