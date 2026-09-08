import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Room } from '../../shared/schema';

// Tests use only the existing disposable loopback fixture and the real legacy editor.
const view = (page: Page) => page.getByTestId('canvas-viewport');
const fit = (page: Page) => page.getByTitle('Fit to Screen', { exact: true });
const roomNode = (page: Page, id: string) => page.getByTestId('room-' + id);
function layout(originX: number, originY: number): Room[] {
  return [
    { id: 'fit-bedroom', name: 'Bedroom with bifold door', x: originX + 80, y: originY + 80, width: 280, height: 220, color: '#93c5fd',
      objects: [{ id: 'fit-door', type: 'door', wallSide: 'top', position: 45, size: 160 / 3,
        doorProperties: { width: 32, height: 84, style: 'bifold', swingDirection: 'outward', swingSide: 'left' } }] },
    { id: 'fit-kitchen', name: 'Kitchen with window', x: originX + 380, y: originY + 80, width: 240, height: 180, color: '#86efac',
      objects: [{ id: 'fit-window', type: 'window', wallSide: 'right', position: 60, size: 80 }] },
    { id: 'fit-living', name: 'Living room', x: originX + 80, y: originY + 330, width: 360, height: 240, color: '#fde68a', objects: [] },
  ];
}
async function seedAndLoad(page: Page, rooms: Room[]) {
  const name = 'Canvas centering ' + test.info().testId;
  const response = await page.request.post('/api/floor-plans', { data: {
    name, rooms, createdAt: '2025-06-01T00:00:00.000Z', updatedAt: '2025-06-01T00:00:00.000Z',
  } });
  expect(response.status()).toBe(201);
  const saved = await response.json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Load Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Load Sketch', exact: true });
  await dialog.getByText(name, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Load Selected Sketch' }).click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await expect(page.getByTestId('canvas-surface')).toHaveCount(1);
  for (const room of rooms) await expect(roomNode(page, room.id)).toHaveCount(1);
  await page.locator("[toast-close]").click();
  await expect(page.getByText("Sketch loaded", { exact: true })).toBeHidden();
  return { id: saved.id as number, name };
}
async function save(page: Page, id: number) {
  await page.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save Sketch', exact: true });
  const result = page.waitForResponse(response =>
    response.url().endsWith('/api/floor-plans/' + id) && response.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  expect((await result).status()).toBe(200);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  const response = await page.request.get('/api/floor-plans/' + id);
  expect(response.ok()).toBeTruthy();
  return await response.json() as { rooms: Room[]; name: string; createdAt: string };
}
async function visibleViewport(page: Page) {
  return view(page).evaluate(node => {
    const element = node as HTMLElement, rect = element.getBoundingClientRect();
    return { x: rect.x + element.clientLeft, y: rect.y + element.clientTop,
      width: element.clientWidth, height: element.clientHeight };
  });
}
async function roomUnion(page: Page, rooms: Room[]) {
  const boxes = await Promise.all(rooms.map(room => roomNode(page, room.id).boundingBox()));
  expect(boxes.every(Boolean)).toBe(true);
  const left = Math.min(...boxes.map(box => box!.x)), top = Math.min(...boxes.map(box => box!.y));
  const right = Math.max(...boxes.map(box => box!.x + box!.width));
  const bottom = Math.max(...boxes.map(box => box!.y + box!.height));
  return { left, top, right, bottom, centerX: (left + right) / 2, centerY: (top + bottom) / 2 };
}
async function expectCenteredAndVisible(page: Page, rooms: Room[]) {
  await expect.poll(async () => {
    const viewport = await visibleViewport(page), bounds = await roomUnion(page, rooms);
    return Math.max(Math.abs(bounds.centerX - viewport.x - viewport.width / 2),
      Math.abs(bounds.centerY - viewport.y - viewport.height / 2));
  }, { message: 'Room bounds must be centered in the actual visible canvas client area' }).toBeLessThanOrEqual(2);
  const viewport = await visibleViewport(page), bounds = await roomUnion(page, rooms);
  expect(bounds.left).toBeGreaterThanOrEqual(viewport.x - 2);
  expect(bounds.top).toBeGreaterThanOrEqual(viewport.y - 2);
  expect(bounds.right).toBeLessThanOrEqual(viewport.x + viewport.width + 2);
  expect(bounds.bottom).toBeLessThanOrEqual(viewport.y + viewport.height + 2);
}
async function expectInBrowserViewport(page: Page, element: Locator) {
  await expect(element).toBeVisible();
  const bounds = await element.boundingBox(), viewport = page.viewportSize();
  expect(bounds).not.toBeNull();
  expect(viewport).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(-1);
  expect(bounds!.y).toBeGreaterThanOrEqual(-1);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport!.height + 1);
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  (page as Page & { canvasViewErrors?: string[] }).canvasViewErrors = errors;
});
test.afterEach(async ({ page }) => {
  expect((page as Page & { canvasViewErrors?: string[] }).canvasViewErrors).toEqual([]);
});

for (const [name, x, y] of [
  ['near origin', 0, 0], ['far from origin', 12000, 9500], ['negative coordinates', -5000, -4000],
] as const) {
  test('fitting three rooms ' + name + ' centers real bounds without changing geometry or openings', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    const rooms = layout(x, y), saved = await seedAndLoad(page, rooms);
    if (name === 'near origin') {
      await expect.poll(async () => {
        const viewport = await visibleViewport(page), origin = await page.getByTestId('canvas-surface').boundingBox();
        return Math.max(Math.abs(origin!.x - viewport.x), Math.abs(origin!.y - viewport.y));
      }, { message: 'Initial panel sizing must retain model origin at the viewport top-left' }).toBeLessThanOrEqual(1);
    }
    await fit(page).click();
    await expectCenteredAndVisible(page, rooms);
    if (name === 'near origin') await page.screenshot({ path: test.info().outputPath('centered-desktop.png') });
    for (let repeat = 0; repeat < 3; repeat++) {
      await fit(page).click();
      await expectCenteredAndVisible(page, rooms);
    }
    await page.getByTitle('Zoom Out', { exact: true }).click();
    await expectCenteredAndVisible(page, rooms);
    await page.getByTitle('Zoom Out', { exact: true }).click();
    await expectCenteredAndVisible(page, rooms);
    await page.getByTitle('Zoom In', { exact: true }).click();
    await page.getByTitle('Zoom In', { exact: true }).click();
    await expectCenteredAndVisible(page, rooms);
    await fit(page).click();
    await expectCenteredAndVisible(page, rooms);
    await page.getByTitle('Fit All Rooms', { exact: true }).click();
    await expectCenteredAndVisible(page, rooms);
    if (name === 'far from origin') {
      // Returning to the last programmatic scroll position is still a user pan.
      await view(page).evaluate(async node => {
        const element = node as HTMLElement;
        const start = { left: element.scrollLeft, top: element.scrollTop };
        const scroll = (left: number, top: number) => new Promise<void>(resolve => {
          element.addEventListener('scroll', () => resolve(), { once: true });
          element.scrollTo(left, top);
        });
        await scroll(start.left + 40, start.top + 30);
        await scroll(start.left, start.top);
      });
      await page.setViewportSize({ width: 1480, height: 1040 });
      await expectCenteredAndVisible(page, rooms);
    }


    await roomNode(page, rooms[0].id).click();
    await page.getByTitle('Center Selected Room', { exact: true }).click();
    await expectCenteredAndVisible(page, [rooms[0]]);
    await fit(page).click();
    await expectCenteredAndVisible(page, rooms);
    await expect(page.getByTestId('opening-fit-door')).toBeVisible();
    await expect(page.getByTestId('opening-fit-window')).toBeVisible();
    const persisted = await save(page, saved.id);
    expect(persisted.rooms).toEqual(rooms);
    expect(persisted.name).toBe(saved.name);
    expect(persisted.createdAt).toBe('2025-06-01T00:00:00.000Z');
  });
}

for (const viewport of [{ width: 820, height: 720 }, { width: 390, height: 844 }]) {
  test('canvas and its top/bottom controls stay on screen at ' + viewport.width + '×' + viewport.height, async ({ page }) => {
    await page.setViewportSize(viewport);
    const rooms = layout(0, 0);
    await seedAndLoad(page, rooms);
    await expectInBrowserViewport(page, view(page));
    await expectInBrowserViewport(page, page.getByTestId('canvas-totals'));
    const totals = await page.getByTestId('canvas-totals').boundingBox();
    const navigation = await page.getByTestId('canvas-view-controls').boundingBox();
    expect(totals && navigation).toBeTruthy();
    const overlaps = totals!.x < navigation!.x + navigation!.width && navigation!.x < totals!.x + totals!.width
      && totals!.y < navigation!.y + navigation!.height && navigation!.y < totals!.y + totals!.height;
    expect(overlaps, 'canvas totals and navigation must not cover one another').toBe(false);
    const controls = ['Zoom In', 'Zoom Out', 'Reset View (Home)', 'Fit to Screen',
      'Pan Mode (Hand Tool)', 'Fit All Rooms', 'Toggle Preview Mode'];
    for (const title of controls) await expectInBrowserViewport(page, page.getByTitle(title, { exact: true }));
    await fit(page).click();
    await expectCenteredAndVisible(page, rooms);
    await page.screenshot({ path: test.info().outputPath('centered-' + viewport.width + '.png') });
    for (const title of controls) await expectInBrowserViewport(page, page.getByTitle(title, { exact: true }));
    await roomNode(page, rooms[0].id).click();
    await expectInBrowserViewport(page, page.getByTitle('Center Selected Room', { exact: true }));
  });
}


test('opening placement after a scaled fit and later viewport resize uses the unchanged room coordinate system', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 720 });
  const rooms = layout(12000, 9500), saved = await seedAndLoad(page, rooms);
  await fit(page).click();
  await expectCenteredAndVisible(page, rooms);
  const target = roomNode(page, rooms[0].id);
  const before = await target.boundingBox();
  expect(before).not.toBeNull();
  const scale = before!.width / rooms[0].width;
  expect(scale, 'the placement regression must exercise a non-1 drawing scale').toBeLessThan(0.99);
  await target.click();
  await page.getByRole('button', { name: 'Add Window', exact: true }).click();
  const point = { x: before!.x + before!.width * 0.65, y: before!.y + before!.height - 4 * scale };
  await page.mouse.move(point.x, point.y, { steps: 4 });
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('[data-testid^="opening-"]')).toHaveCount(3);
  const placed = await save(page, saved.id);
  expect(placed.rooms.slice(1)).toEqual(rooms.slice(1));
  expect({ ...placed.rooms[0], objects: rooms[0].objects }).toEqual(rooms[0]);
  expect(placed.rooms[0].objects![0]).toEqual(rooms[0].objects![0]);
  const window = placed.rooms[0].objects![1];
  expect(window).toMatchObject({ type: 'window', wallSide: 'bottom' });
  expect(Math.abs(window.position - 65)).toBeLessThan(1);
  expect(window.size).toBeGreaterThan(0);

  await page.setViewportSize({ width: 1140, height: 800 });
  await fit(page).click();
  await expectCenteredAndVisible(page, rooms);
  await expect(page.getByTestId('opening-' + window.id)).toBeVisible();
  expect((await save(page, saved.id)).rooms).toEqual(placed.rooms);
});
