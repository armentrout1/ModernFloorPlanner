import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Room } from '../../shared/schema';

// These cases exercise browser history while transient editor state is active.
test.use({ viewport: { width: 1920, height: 1080 } });
const ROOM_ID = 'm3a-navigation-room';
const DOOR_ID = 'm3a-navigation-door';
const targetRoom = (page: Page) => page.getByTestId('room-' + ROOM_ID);

async function loadSketchWithQuickRoomsBehindIt(page: Page) {
  const name = 'M3A transient state ' + test.info().testId;
  const room: Room = {
    id: ROOM_ID, name: 'Keep this room', x: 80, y: 80, width: 400, height: 320, color: '#93c5fd',
    objects: [{ id: DOOR_ID, type: 'door', wallSide: 'top', position: 50, size: 160 / 3,
      doorProperties: { width: 32, height: 84, style: 'bifold', swingDirection: 'outward', swingSide: 'left' } }],
  };
  const response = await page.request.post('/api/floor-plans', { data: { name, rooms: [room],
    createdAt: '2025-06-01T00:00:00.000Z', updatedAt: '2025-06-01T00:00:00.000Z' } });
  expect(response.status()).toBe(201);
  const saved = await response.json();
  await page.goto('/quick-room');
  await page.getByRole('link', { name: 'Sketch editor', exact: true }).click();
  await page.getByRole('button', { name: 'Load Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Load Sketch', exact: true });
  await dialog.getByText(name, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Load Selected Sketch' }).click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await expect(targetRoom(page)).toBeVisible();
  await page.getByRole('button', { name: 'Select & Move', exact: true }).click();
  return { id: saved.id as number, room };
}
async function backToQuickRooms(page: Page) {
  await page.goBack();
  await expect(page).toHaveURL(/\/quick-room$/);
  await expect(page.getByRole('heading', { name: 'Quick Rooms', exact: true })).toBeVisible();
}
async function forwardToSketch(page: Page) {
  await page.goForward();
  await expect(page).toHaveURL(/\/$/);
  await expect(targetRoom(page)).toBeVisible();
}
async function position(room: Locator) {
  return room.evaluate(node => {
    const style = (node as HTMLElement).style;
    return { left: style.left, top: style.top, width: style.width, height: style.height };
  });
}
async function saveCurrentSketch(page: Page, id: number) {
  await page.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save Sketch', exact: true });
  const response = page.waitForResponse(response =>
    response.url().endsWith('/api/floor-plans/' + id) && response.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  expect((await response).status()).toBe(200);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  return (await (await page.request.get('/api/floor-plans/' + id)).json()).rooms as Room[];
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  (page as Page & { navigationErrors?: string[] }).navigationErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { navigationErrors?: string[] }).navigationErrors).toEqual([]);
});

test('browser Back removes editor delete/style portals and cannot mutate the hidden sketch', async ({ page }) => {
  const saved = await loadSketchWithQuickRoomsBehindIt(page);
  await targetRoom(page).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alertdialog', { name: 'Are you sure?' })).toBeVisible();
  await backToQuickRooms(page);
  await expect(page.locator('[role="alertdialog"],[role="dialog"],[role="listbox"]')).toHaveCount(0);
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await forwardToSketch(page);
  await expect(page.locator('[role="alertdialog"]')).toHaveCount(0);
  await expect(page.getByTestId('opening-' + DOOR_ID)).toBeVisible();
  await expect(page.locator('#roomName')).toHaveValue('Keep this room');

  await page.getByTestId('opening-' + DOOR_ID).click();
  await page.getByRole('combobox').nth(0).click();
  await expect(page.getByRole('listbox')).toBeVisible();
  await backToQuickRooms(page);
  await expect(page.locator('[role="alertdialog"],[role="dialog"],[role="listbox"]')).toHaveCount(0);
  await forwardToSketch(page);
  await expect(page.locator('[role="listbox"]')).toHaveCount(0);
  await expect(page.getByRole('combobox').nth(0)).toContainText('Bifold Door');
  // Save only after returning to the disposable sketch fixture, proving full model preservation.
  expect(await saveCurrentSketch(page, saved.id)).toEqual([saved.room]);
});

test('browser Back cancels pending draw, room drag and resize before later mouse movement/up', async ({ page }) => {
  const saved = await loadSketchWithQuickRoomsBehindIt(page);
  const room = targetRoom(page);
  const original = await position(room);

  for (const gesture of ['draw', 'drag', 'resize'] as const) {
    await test.step(gesture, async () => {
      await page.getByRole('button', { name: gesture === 'draw' ? 'Draw Room' : 'Select & Move', exact: true }).click();
      let start: { x: number; y: number };
      if (gesture === 'draw') {
        const bounds = await room.locator('..').boundingBox();
        expect(bounds).not.toBeNull();
        start = { x: bounds!.x + 650, y: bounds!.y + 450 };
      } else {
        await room.click();
        const bounds = await (gesture === 'resize' ? page.getByTestId('resize-' + ROOM_ID + '-se') : room).boundingBox();
        expect(bounds).not.toBeNull();
        start = { x: bounds!.x + bounds!.width / 2, y: bounds!.y + bounds!.height / 2 };
      }
      await page.mouse.move(start.x, start.y);
      await page.mouse.down();
      // Navigate without a mouseup or a navigation-link click. History itself interrupts the gesture.
      await backToQuickRooms(page);
      await forwardToSketch(page);
      await page.mouse.move(start.x + 80, start.y + 60, { steps: 4 });
      await page.mouse.up();
      await expect(page.locator('.room-box')).toHaveCount(1);
      expect(await position(room)).toEqual(original);
      await expect(page.getByTestId('opening-' + DOOR_ID)).toBeVisible();
    });
  }
  expect(await saveCurrentSketch(page, saved.id)).toEqual([saved.room]);
});
