import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Room, RoomObject, WallSide } from '../../shared/schema';

// Use only the existing disposable loopback acceptance API, never a deployed API.
test.use({ viewport: { width: 1440, height: 1000 } });
const preview = (page: Page) => page.getByRole('dialog', { name: 'Floor Plan Preview', exact: true });
const trigger = (page: Page) => page.getByTitle('Toggle Preview Mode', { exact: true });

function fixture(x = 0, y = 0): Room[] {
  const doors: RoomObject[] = (['top', 'right', 'bottom', 'left'] as WallSide[]).map((wallSide, index) => ({
    id: 'preview-door-' + wallSide, type: 'door', wallSide, position: 50,
    size: [160 / 3, 60, 140 / 3, 50][index],
    doorProperties: { width: [32, 36, 28, 30][index], height: 80, style: index === 2 ? 'bifold' : 'single',
      swingDirection: index % 2 === 0 ? 'outward' : 'inward', swingSide: index % 2 === 0 ? 'left' : 'right' },
  }));
  return [
    { id: 'preview-studio', name: 'Studio', x: x + 80, y: y + 80, width: 320, height: 240,
      color: '#93c5fd', objects: doors },
    { id: 'preview-kitchen', name: 'Kitchen', x: x + 460, y: y + 110, width: 200, height: 300,
      color: '#86efac', objects: [
        { id: 'preview-small-window', type: 'window', wallSide: 'top', position: 50, size: 40, windowProperties: { height: 36 } },
        { id: 'preview-large-window', type: 'window', wallSide: 'bottom', position: 50, size: 80, windowProperties: { height: 48 } },
      ] },
  ];
}

async function seedAndLoad(page: Page, rooms: Room[], history = false) {
  const name = 'Plan preview ' + test.info().testId + ' ' + Date.now();
  const result = await page.request.post('/api/floor-plans', { data: {
    name, rooms, createdAt: '2025-06-01T00:00:00.000Z', updatedAt: '2025-06-01T00:00:00.000Z',
  } });
  expect(result.status()).toBe(201);
  const saved = await result.json();
  await page.goto(history ? '/quick-room' : '/');
  if (history) await page.getByRole('link', { name: 'Sketch editor', exact: true }).click();
  await page.getByRole('button', { name: 'Load Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Load Sketch', exact: true });
  await dialog.getByText(name, { exact: true }).click();
  // Redirect recovery intentionally retains the prior sketch. A second fixture
  // load must explicitly accept its existing replacement confirmation.
  const replacement = await page.locator('.room-box').count() ? page.waitForEvent('dialog').then(async confirmation => {
    expect(confirmation.type()).toBe('confirm');
    expect(confirmation.message()).toBe('Replace the current sketch? Save any changes you want to keep first.');
    await confirmation.accept();
  }) : Promise.resolve();
  await dialog.getByRole('button', { name: 'Load Selected Sketch', exact: true }).click();
  await replacement;
  await expect.poll(() => page.evaluate(() => {
    const raw = sessionStorage.getItem('modern-floor-planner:local-fields:v1:unassigned');
    return raw ? JSON.parse(raw).values['legacy:server-id'] : null;
  })).toBe(saved.id);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  for (const room of rooms) await expect(page.getByTestId('room-' + room.id)).toHaveCount(1);
  await page.getByRole('button', { name: 'Select & Move', exact: true }).click();
  return { id: saved.id as number, rooms };
}

async function save(page: Page, id: number) {
  await page.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save Sketch', exact: true });
  const result = page.waitForResponse(response => response.url().endsWith('/api/floor-plans/' + id)
    && response.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  expect((await result).status()).toBe(200);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  const response = await page.request.get('/api/floor-plans/' + id);
  expect(response.ok()).toBe(true);
  return (await response.json()).rooms as Room[];
}

async function openPreview(page: Page) {
  await trigger(page).click();
  const dialog = preview(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId('plan-preview-viewport')).toBeVisible();
  expect(await dialog.evaluate(node => !!node.closest('[data-testid="canvas-surface"]'))).toBe(false);
  return dialog;
}

async function closePreview(page: Page) {
  await preview(page).getByRole('button', { name: 'Close preview', exact: true }).click();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
}

async function center(target: Locator) {
  const box = (await target.boundingBox())!;
  expect(box).not.toBeNull();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function expectFitted(page: Page) {
  const dialog = preview(page);
  await expect.poll(async () => {
    const viewport = (await dialog.getByTestId('plan-preview-viewport').boundingBox())!;
    const nodes = dialog.locator('[data-testid^="preview-room-"], [data-door-outline]');
    // Playwright's SVG boundingBox adds conservative stroke/miter padding;
    // native DOM rectangles measure the actual transformed plan geometry.
    const boxes = await nodes.evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect();
      return { x, y, width, height };
    }));
    if (!viewport || boxes.length === 0 || boxes.some(box => !box)) return Infinity;
    const left = Math.min(...boxes.map(box => box!.x)), right = Math.max(...boxes.map(box => box!.x + box!.width));
    const top = Math.min(...boxes.map(box => box!.y)), bottom = Math.max(...boxes.map(box => box!.y + box!.height));
    return Math.max(Math.abs((left + right) / 2 - viewport.x - viewport.width / 2),
      Math.abs((top + bottom) / 2 - viewport.y - viewport.height / 2),
      viewport.x - left, viewport.y - top, right - viewport.x - viewport.width, bottom - viewport.y - viewport.height);
  }, { message: 'Rooms and outward door outlines fit and center inside the preview viewport' }).toBeLessThanOrEqual(2);
}

async function editorZoom(page: Page) {
  return page.getByTestId('canvas-surface').evaluate(node => getComputedStyle(node).transform);
}

const errors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const messages: string[] = [];
  errors.set(page, messages);
  page.on('pageerror', error => messages.push(error.message));
});
test.afterEach(async ({ page }) => { expect(errors.get(page), 'uncaught preview errors').toEqual([]); });

test('far and negative plans fit independently of editor zoom and preserve saved coordinates', async ({ page }) => {
  for (const [x, y] of [[12000, 9500], [-5000, -4000]]) {
    const plan = await seedAndLoad(page, fixture(x, y));
    await page.getByTitle('Fit to Screen', { exact: true }).click();
    await openPreview(page);
    await expectFitted(page);
    const initialScale = Number(await preview(page).getByTestId('plan-preview-drawing').getAttribute('data-scale'));
    expect(initialScale).toBeGreaterThan(0);
    await closePreview(page);
    for (let count = 0; count < 3; count++) await page.getByTitle('Zoom Out', { exact: true }).click();
    const zoom = await editorZoom(page);
    await openPreview(page);
    await expectFitted(page);
    await expect.poll(async () => Number(await preview(page).getByTestId('plan-preview-drawing').getAttribute('data-scale')))
      .toBeCloseTo(initialScale, 6);
    await closePreview(page);
    expect(await editorZoom(page)).toBe(zoom);
    expect(await save(page, plan.id)).toEqual(plan.rooms);
  }
});

test('preview preserves room proportions, colors, unequal window widths and all four door outlines', async ({ page }) => {
  const plan = await seedAndLoad(page, fixture());
  const editorPaths = new Map<string, { d: string | null; transform: string | null }>();
  for (const door of plan.rooms[0].objects!) {
    editorPaths.set(door.id, await page.getByTestId('door-swing-' + door.id).locator('[data-door-outline]').evaluate(node => ({
      d: node.getAttribute('d'), transform: node.parentElement!.getAttribute('transform'),
    })));
  }
  const dialog = await openPreview(page);
  await expectFitted(page);
  const scale = Number(await dialog.getByTestId('plan-preview-drawing').getAttribute('data-scale'));
  for (const [index, room] of plan.rooms.entries()) {
    const rendered = dialog.getByTestId('preview-room-' + room.id);
    const bounds = (await rendered.boundingBox())!;
    expect(Math.abs(bounds.width - room.width * scale)).toBeLessThanOrEqual(1);
    expect(Math.abs(bounds.height - room.height * scale)).toBeLessThanOrEqual(1);
    expect(await rendered.evaluate(node => getComputedStyle(node).backgroundColor)).toBe(index === 0 ? 'rgb(147, 197, 253)' : 'rgb(134, 239, 172)');
    await expect(rendered.getByText(room.name!, { exact: true })).toBeVisible();
  }
  for (const door of plan.rooms[0].objects!) {
    const swing = dialog.getByTestId('door-swing-' + door.id);
    expect(await swing.locator('[data-door-outline]').evaluate(node => ({
      d: node.getAttribute('d'), transform: node.parentElement!.getAttribute('transform'),
    }))).toEqual(editorPaths.get(door.id));
    await expect(swing).toHaveAttribute('data-door-hinge', door.doorProperties!.swingSide);
    await expect(swing).toHaveAttribute('data-door-direction', door.doorProperties!.swingDirection);
  }
  const small = (await dialog.getByTestId('preview-opening-preview-small-window').boundingBox())!;
  const large = (await dialog.getByTestId('preview-opening-preview-large-window').boundingBox())!;
  expect(Math.abs(small.width - 40 * scale)).toBeLessThanOrEqual(1);
  expect(Math.abs(large.width - 80 * scale)).toBeLessThanOrEqual(1);
  await dialog.getByRole('checkbox', { name: 'Room names', exact: true }).uncheck();
  await expect(dialog.getByText('Studio', { exact: true })).not.toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Room names', exact: true }).check();
  const dimensions = dialog.getByRole('checkbox', { name: 'Dimensions', exact: true });
  await dimensions.check();
  const withDimensions = await dialog.getByTestId('preview-room-preview-studio').textContent();
  await dimensions.uncheck();
  expect(await dialog.getByTestId('preview-room-preview-studio').textContent()).not.toBe(withDimensions);
  await dimensions.check();
  await expect(dialog.getByTestId('preview-room-preview-studio')).toHaveText(withDimensions!);
  await closePreview(page);
  expect(await save(page, plan.id)).toEqual(plan.rooms);
});

test('preview clicks, double-clicks, dragging and editor shortcuts cannot mutate the sketch or editor zoom', async ({ page }) => {
  const plan = await seedAndLoad(page, fixture());
  await page.getByTitle('Fit to Screen', { exact: true }).click();
  await page.getByTestId('opening-preview-door-top').click();
  const zoom = await editorZoom(page);
  const toolClass = await page.getByRole('button', { name: 'Select & Move', exact: true }).getAttribute('class');
  const selectedIds = await page.locator('.room-box[data-selected="true"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')));
  const dialog = await openPreview(page);
  for (const target of [dialog.getByTestId('preview-room-preview-studio'), dialog.getByTestId('preview-opening-preview-door-top'),
    dialog.getByTestId('preview-opening-preview-small-window')]) {
    const point = await center(target);
    await page.mouse.click(point.x, point.y);
    await page.mouse.dblclick(point.x, point.y);
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
    await page.mouse.move(point.x + 25, point.y + 20, { steps: 4 });
    await page.mouse.up();
  }
  await dialog.focus();
  for (const key of ['Delete', 'Backspace', 'Control+a', 'Control+z', 'r', 'd', 'w', 'm', '+', '-', 'Home', 'ArrowRight']) {
    await page.keyboard.press(key);
    await expect(dialog).toBeVisible();
  }
  const viewport = await center(dialog.getByTestId('plan-preview-viewport'));
  await page.mouse.move(viewport.x, viewport.y);
  await page.keyboard.down('Control');
  try { await page.mouse.wheel(0, -100); } finally { await page.keyboard.up('Control'); }
  expect(await editorZoom(page)).toBe(zoom);
  await closePreview(page);
  expect(await page.getByRole('button', { name: 'Select & Move', exact: true }).getAttribute('class')).toBe(toolClass);
  expect(await page.locator('.room-box[data-selected="true"]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-testid')))).toEqual(selectedIds);
  expect(await save(page, plan.id)).toEqual(plan.rooms);
});

test('P, Escape and the explicit close button dismiss preview and restore focus to its trigger', async ({ page }) => {
  const plan = await seedAndLoad(page, fixture());
  for (const dismissal of ['p', 'Escape', 'button']) {
    await trigger(page).focus();
    await page.keyboard.press('p');
    await expect(preview(page)).toBeVisible();
    expect(await preview(page).evaluate(node => node.contains(document.activeElement))).toBe(true);
    if (dismissal === 'button') await preview(page).getByRole('button', { name: 'Close preview', exact: true }).click();
    else await page.keyboard.press(dismissal);
    await expect(page.locator('[role="dialog"]')).toHaveCount(0);
    await expect(trigger(page)).toBeFocused();
  }
  expect(await save(page, plan.id)).toEqual(plan.rooms);
});

test('empty preview is usable and a populated preview refits when the browser viewport narrows', async ({ page }) => {
  const empty = await seedAndLoad(page, []);
  await openPreview(page);
  await expect(preview(page).locator('[data-testid^="preview-room-"]')).toHaveCount(0);
  await expect(preview(page)).toContainText(/no rooms|draw a room|empty/i);
  await closePreview(page);
  await expect(page.getByRole('button', { name: 'Save Sketch', exact: true })).toBeDisabled();
  await expect(page.locator('.room-box')).toHaveCount(0);
  expect((await (await page.request.get('/api/floor-plans/' + empty.id)).json()).rooms).toEqual([]);
  const plan = await seedAndLoad(page, fixture(-5000, -4000));
  await openPreview(page);
  for (const viewport of [{ width: 820, height: 720 }, { width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
    await page.setViewportSize(viewport);
    await expectFitted(page);
    const bounds = (await preview(page).boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(-1);
    expect(bounds.y).toBeGreaterThanOrEqual(-1);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height + 1);
    await expect(preview(page).getByRole('button', { name: 'Close preview', exact: true })).toBeVisible();
  }
  await closePreview(page);
  expect(await save(page, plan.id)).toEqual(plan.rooms);
});

test('browser Back closes preview on the inactive route and does not reopen it on return', async ({ page }) => {
  const plan = await seedAndLoad(page, fixture(), true);
  await page.getByTitle('Fit to Screen', { exact: true }).click();
  const zoom = await editorZoom(page);
  await openPreview(page);
  await page.goBack();
  await expect(page).toHaveURL(/\/quick-room$/);
  await expect(page.getByRole('heading', { name: 'Quick Rooms', exact: true })).toBeVisible();
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press('Delete');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('p');
  await page.goForward();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  expect(await editorZoom(page)).toBe(zoom);
  expect(await save(page, plan.id)).toEqual(plan.rooms);
});
