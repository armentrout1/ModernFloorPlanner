import { expect, test, type Locator, type Page } from '@playwright/test';
import type { Room, RoomObject, WallSide } from '../../shared/schema';

// Every plan is created in the disposable local fixture. Never use a deployed API.
test.use({ viewport: { width: 1920, height: 1080 } });

const opening = (type: 'door' | 'window' = 'door'): RoomObject => ({
  id: 'opening-a', type, wallSide: 'top', position: 50, size: 160 / 3,
  ...(type === 'door' ? { doorProperties: {
    width: 32, height: 84, style: 'bifold' as const,
    swingDirection: 'outward' as const, swingSide: 'left' as const,
  } } : {}),
});

const room = (objects: RoomObject[] = []): Room => ({
  id: 'room-a', name: 'Legacy room', x: 80, y: 80,
  width: 400, height: 320, color: '#93c5fd', objects,
});

async function seedAndLoad(page: Page, rooms: Room[]) {
  const name = `M1 ${test.info().testId} ${Date.now()}`;
  const response = await page.request.post('/api/floor-plans', { data: {
    name, rooms, createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: '2025-06-01T00:00:00.000Z',
  } });
  expect(response.status()).toBe(201);
  const saved = await response.json();
  await page.goto('/');
  await page.getByRole('button', { name: 'Load Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Load Sketch', exact: true });
  await dialog.getByText(name, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Load Selected Sketch' }).click();
  await expect(dialog).toBeHidden();
  // Radix keeps closing portals mounted during their exit animation.
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  for (const item of rooms) await expect(page.getByTestId(`room-${item.id}`)).toBeVisible();
  await page.getByRole('button', { name: 'Select & Move', exact: true }).click();
  return { id: saved.id as number, name };
}

async function save(page: Page, id: number, name?: string) {
  await page.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save Sketch', exact: true });
  if (name) await dialog.getByLabel('Sketch Name').fill(name);
  const result = page.waitForResponse(response =>
    response.url().endsWith(`/api/floor-plans/${id}`) && response.request().method() === 'PATCH');
  await dialog.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  expect((await result).status()).toBe(200);
  await expect(dialog).toBeHidden();
  // Radix keeps closing portals mounted during their exit animation.
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  const response = await page.request.get(`/api/floor-plans/${id}`);
  expect(response.ok()).toBeTruthy();
  return await response.json() as { rooms: Room[]; name: string; createdAt: string };
}

async function wallPoint(target: Locator, side: WallSide, fraction = 0.5) {
  const box = await target.boundingBox();
  expect(box).not.toBeNull();
  const { x, y, width, height } = box!;
  switch (side) {
    case 'top': return { x: x + width * fraction, y: y + 4 };
    case 'bottom': return { x: x + width * fraction, y: y + height - 4 };
    case 'left': return { x: x + 4, y: y + height * fraction };
    case 'right': return { x: x + width - 4, y: y + height * fraction };
  }
}

async function dragOpening(page: Page, objectId: string, roomId: string, side: WallSide) {
  const source = await page.getByTestId(`opening-${objectId}`).boundingBox();
  expect(source).not.toBeNull();
  const target = await wallPoint(page.getByTestId(`room-${roomId}`), side);
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByTestId(`room-${roomId}`).getByTestId(`opening-${objectId}`)).toBeVisible();
}

async function doorPoint(page: Page, objectId: string, x: number, y: number) {
  // Use the browser's actual SVG transform; do not reproduce the wall renderer.
  return page.getByTestId(`door-hit-${objectId}`).evaluate((node, point) => {
    const matrix = (node as SVGGraphicsElement).getScreenCTM();
    if (!matrix) throw new Error('The door hit sector has no screen transform');
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
    return { x: screen.x, y: screen.y };
  }, { x, y });
}

async function doorOutline(page: Page, objectId: string) {
  return page.getByTestId(`door-swing-${objectId}`).locator('[data-door-outline]').evaluate(node => ({
    path: node.getAttribute('d'), transform: node.parentElement?.getAttribute('transform'),
  }));
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  (page as Page & { m1Errors?: string[] }).m1Errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { m1Errors?: string[] }).m1Errors, 'uncaught browser errors').toEqual([]);
});

for (const type of ['door', 'window'] as const) {
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    test(`${type} placement on ${side} wall survives save and reload`, async ({ page }) => {
      const plan = await seedAndLoad(page, [room()]);
      await page.getByTestId('room-room-a').click();
      await page.getByRole('button', { name: type === 'door' ? 'Add Door' : 'Add Window', exact: true }).click();
      const target = await wallPoint(page.getByTestId('room-room-a'), side, 0.35);
      await page.mouse.move(target.x, target.y, { steps: 5 });
      const previewBar = page.locator('[data-testid="preview-opening-placement-preview"][data-opening-type="door"]');
      const preview = type === 'door' ? {
        outline: await doorOutline(page, 'placement-preview'),
        bounds: await previewBar.boundingBox(),
      } : null;
      if (preview) expect(preview.bounds).not.toBeNull();
      await page.mouse.click(target.x, target.y);
      await expect(page.locator('[data-testid^="opening-"]')).toHaveCount(1);
      const saved = await save(page, plan.id);
      expect(saved.rooms).toHaveLength(1);
      expect(saved.rooms[0].objects).toHaveLength(1);
      expect(saved.rooms[0].objects![0]).toMatchObject({ type, wallSide: side });
      expect(saved.rooms[0].objects![0].position).toBeGreaterThan(10);
      expect(saved.rooms[0].objects![0].position).toBeLessThan(90);
      if (preview) {
        const placed = saved.rooms[0].objects![0];
        expect(placed).toMatchObject({ size: 60, doorProperties: { width: 36 } });
        expect(await doorOutline(page, placed.id)).toEqual(preview.outline);
        const bounds = (await page.getByTestId(`opening-${placed.id}`).boundingBox())!;
        const roomBounds = (await page.getByTestId('room-room-a').boundingBox())!;
        const scale = roomBounds.width / saved.rooms[0].width;
        expect((side === 'top' || side === 'bottom' ? bounds.width : bounds.height) / scale).toBeCloseTo(60, 5);
        for (const key of ['x', 'y', 'width', 'height'] as const) {
          expect(Math.abs(bounds[key] - preview.bounds![key]), `preview and placed bar ${key}`).toBeLessThan(0.5);
        }
        await expect(page.getByTestId('door-swing-placement-preview')).toHaveCount(0);
      }
      await page.reload();
      await page.getByRole('button', { name: 'Load Sketch', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Load Sketch', exact: true });
      await dialog.getByText(plan.name, { exact: true }).click();
      await dialog.getByRole('button', { name: 'Load Selected Sketch' }).click();
      await expect(page.getByTestId(`opening-${saved.rooms[0].objects![0].id}`)).toBeVisible();
    });
  }
}

for (const type of ['door', 'window'] as const) {
  test(`${type} dragging between walls and rooms preserves legacy properties through resize`, async ({ page }) => {
    const original = opening(type);
    const second = { ...room(), id: 'room-b', name: 'Second room', x: 560, width: 320 };
    const plan = await seedAndLoad(page, [room([original]), second]);
    await dragOpening(page, original.id, 'room-a', 'bottom');
    let saved = await save(page, plan.id);
    expect(saved.rooms[0].objects![0]).toEqual({ ...original, wallSide: 'bottom', position: 50 });
    await dragOpening(page, original.id, 'room-b', 'left');
    await expect(page.getByRole('button', { name: /^Delete (door|window)$/ })).toBeVisible();
    await expect(page.getByRole('spinbutton').first()).toBeEnabled();
    saved = await save(page, plan.id);
    expect(saved.rooms[0].objects).toEqual([]);
    expect(saved.rooms[1].objects![0]).toEqual({ ...original, wallSide: 'left', position: 50 });
    await page.getByTestId('room-room-b').click();
    const handle = page.getByTestId('resize-room-b-se');
    const bounds = await handle.boundingBox();
    expect(bounds).not.toBeNull();
    await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
    await page.mouse.down();
    await page.mouse.move(bounds!.x + bounds!.width / 2 + 40, bounds!.y + bounds!.height / 2 + 40, { steps: 8 });
    await page.mouse.up();
    saved = await save(page, plan.id);
    expect(saved.rooms[1].width).toBeGreaterThan(second.width);
    expect(saved.rooms[1].height).toBeGreaterThan(second.height);
    expect(saved.rooms[1].objects![0]).toEqual({ ...original, wallSide: 'left', position: 50 });
    expect(saved.createdAt).toBe('2025-06-01T00:00:00.000Z');
  });
}

test('32-inch width, all door styles and swing properties remain editable and persist exactly', async ({ page }) => {
  const plan = await seedAndLoad(page, [room([opening()])]);
  await page.getByTestId('room-room-a').click();
  await page.getByTestId('opening-opening-a').click();
  const expectedStyles = [ ['Single Door', 'single'], ['Double Door', 'double'], ['Sliding Door', 'sliding'], ['Bifold Door', 'bifold'] ];
  for (const [label, value] of expectedStyles) {
    await page.getByRole('combobox').nth(0).click();
    await page.getByRole('option', { name: label, exact: true }).click();
    await expect(page.locator('[role="listbox"]')).toHaveCount(0);
    const saved = await save(page, plan.id);
    expect(saved.rooms[0].objects![0].doorProperties).toMatchObject({ width: 32, height: 84, style: value });
  }
  await page.getByRole('combobox').nth(1).click();
  await page.getByRole('option', { name: '32"', exact: true }).click();
  await page.getByRole('radio', { name: 'Inward', exact: true }).check();
  await page.getByRole('radio', { name: 'Right Hand (RH)', exact: true }).check();
  const saved = await save(page, plan.id);
  expect(saved.rooms[0].objects![0]).toMatchObject({
    size: 160 / 3,
    doorProperties: { width: 32, height: 84, style: 'bifold', swingDirection: 'inward', swingSide: 'left' },
  });
  await page.getByRole('button', { name: 'Materials', exact: true }).click();
  await expect(page.getByRole('cell', { name: '32 in', exact: true })).toBeVisible();
});

test('window width updates retain its legacy attachment and persist', async ({ page }) => {
  const original = opening('window');
  const plan = await seedAndLoad(page, [room([original])]);
  await page.getByTestId('room-room-a').click();
  await page.getByTestId('opening-opening-a').click();
  await page.getByRole('spinbutton', { name: 'Window width', exact: true }).fill('48');
  let saved = await save(page, plan.id);
  expect(saved.rooms[0].objects).toEqual([{ ...original, size: 80 }]);
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: '30" × 36"', exact: true }).click();
  saved = await save(page, plan.id);
  expect(saved.rooms[0].objects).toEqual([{ ...original, size: 50, windowProperties: { height: 36 } }]);
});
test('Delete targets the selected opening before its room, and Undo delete restores all properties', async ({ page }) => {
  const original = room([opening()]);
  const plan = await seedAndLoad(page, [original]);
  await page.getByTestId('room-room-a').click();
  await page.getByTestId('opening-opening-a').click();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('room-room-a')).toBeVisible();
  await expect(page.getByTestId('opening-opening-a')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo delete', exact: true }).click();
  await expect(page.getByTestId('opening-opening-a')).toBeVisible();
  expect((await save(page, plan.id)).rooms).toEqual([original]);
  await page.getByTestId('opening-opening-a').click();
  await page.getByRole('button', { name: /^Delete (door|window)$/ }).click();
  await expect(page.getByTestId('opening-opening-a')).toHaveCount(0);
  await expect(page.getByTestId('room-room-a')).toBeVisible();
  await page.getByRole('button', { name: 'Undo delete', exact: true }).click();
  await expect(page.getByTestId('opening-opening-a')).toBeVisible();
  await page.getByTestId('room-room-a').click();
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('room-room-a')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo delete', exact: true }).click();
  await expect(page.getByTestId('room-room-a')).toBeVisible();
  expect((await save(page, plan.id)).rooms).toEqual([original]);
});

test('typing, contenteditable, dialogs, repeat and handled keys do not delete geometry', async ({ page }) => {
  const original = room([opening()]);
  const plan = await seedAndLoad(page, [original]);
  await page.getByTestId('room-room-a').click();
  const input = page.locator('#roomName');
  await input.focus();
  await input.press('End');
  await input.press('Backspace');
  await input.fill(original.name!);
  for (const kind of ['textarea', 'contenteditable']) {
    await page.evaluate(kind => {
      const node = document.createElement(kind === 'textarea' ? 'textarea' : 'div');
      node.id = 'm1-editable-fixture';
      if (kind === 'contenteditable') node.contentEditable = 'true';
      node.textContent = 'editable text';
      node.style.cssText = 'position:fixed;top:0;left:0;z-index:99999;width:200px;height:50px';
      document.body.appendChild(node);
      node.focus();
    }, kind);
    await page.keyboard.press('Delete');
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('room-room-a')).toBeVisible();
    await page.locator('#m1-editable-fixture').evaluate(node => node.remove());
  }
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', repeat: true, bubbles: true }));
    const handled = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true });
    handled.preventDefault();
    window.dispatchEvent(handled);
  });
  await expect(page.getByTestId('room-room-a')).toBeVisible();
  await page.getByTitle('Keyboard Shortcuts', { exact: true }).click();
  const shortcuts = page.getByRole('dialog', { name: 'Keyboard Shortcuts' });
  await expect(shortcuts).toBeVisible();
  await shortcuts.focus();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await expect(page.getByTestId('room-room-a')).toBeVisible();
  await page.keyboard.press('Escape');
  expect((await save(page, plan.id)).rooms).toEqual([original]);
});

test('a failed save retains the entered name and geometry and can be retried', async ({ page }) => {
  const original = room([opening()]);
  const plan = await seedAndLoad(page, [original]);
  const draftName = 'Keep my unsaved input';
  const draftRoom = { ...original, name: 'Unsaved room label' };
  await page.getByTestId('room-room-a').click();
  await page.locator('#roomName').fill(draftRoom.name);
  await page.route(`**/api/floor-plans/${plan.id}`, async route => {
    if (route.request().method() === 'PATCH') {
      await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Simulated save failure' }) });
    } else await route.continue();
  });
  await page.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save Sketch', exact: true });
  await dialog.getByLabel('Sketch Name').fill(draftName);
  await dialog.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  await expect(page.getByText('Error saving sketch', { exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Sketch Name')).toHaveValue(draftName);
  await expect(page.getByTestId('room-room-a')).toBeVisible();
  await expect(page.getByTestId('opening-opening-a')).toBeVisible();
  const persisted = await (await page.request.get(`/api/floor-plans/${plan.id}`)).json();
  expect(persisted.name).toBe(plan.name);
  expect(persisted.rooms).toEqual([original]);
  await page.unroute(`**/api/floor-plans/${plan.id}`);
  await dialog.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  await expect(dialog).toBeHidden();
  // Radix keeps closing portals mounted during their exit animation.
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);
  const retried = await (await page.request.get(`/api/floor-plans/${plan.id}`)).json();
  expect(retried.name).toBe(draftName);
  expect(retried.rooms).toEqual([draftRoom]);
});

test('conflicting saved widths remain untouched until the entered width is confirmed', async ({ page }) => {
  const original = { ...opening(), size: 40 };
  const plan = await seedAndLoad(page, [room([original])]);
  expect((await save(page, plan.id)).rooms[0].objects).toEqual([original]);
  await page.getByRole('button', { name: 'Materials', exact: true }).click();
  await expect(page.getByText('Review saved door widths', { exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: '32 in', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Materials', exact: true }).click();
  await page.getByTestId('room-room-a').click();
  await page.getByTestId('opening-opening-a').click();
  await page.getByRole('button', { name: 'Confirm entered width', exact: true }).click();
  expect((await save(page, plan.id)).rooms[0].objects).toEqual([{ ...original, size: 160 / 3 }]);
});

test('failed rename keeps the draft and Enter plus blur sends one pending request', async ({ page }) => {
  const original = room([opening()]);
  const plan = await seedAndLoad(page, [original]);
  await page.getByRole('button', { name: 'Load Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Load Sketch', exact: true });
  await dialog.getByRole('button', { name: `Options for ${plan.name}`, exact: true }).click();
  await page.getByRole('menuitem', { name: 'Rename', exact: true }).click();
  const draftName = `Retained rename ${Date.now()}`;
  const input = dialog.getByRole('textbox', { name: 'New sketch name', exact: true });
  await input.fill(draftName);
  let patches = 0;
  let releaseFailure!: () => void;
  const failureGate = new Promise<void>(resolve => { releaseFailure = resolve; });
  await page.route(`**/api/floor-plans/${plan.id}`, async route => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patches += 1;
    await failureGate;
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'Simulated rename failure' }) });
  });
  try {
    await input.press('Enter');
    await expect(input).toBeDisabled();
    await input.dispatchEvent('blur');
    await expect.poll(() => patches).toBe(1);
  } finally {
    releaseFailure();
  }
  await expect(page.getByText('Rename failed', { exact: true })).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(input).toHaveValue(draftName);
  expect(patches).toBe(1);
  expect((await (await page.request.get(`/api/floor-plans/${plan.id}`)).json()).name).toBe(plan.name);
  await page.unroute(`**/api/floor-plans/${plan.id}`);
  await input.press('Enter');
  await expect(input).toHaveCount(0);
  await expect(dialog.getByText(draftName, { exact: true })).toBeVisible();
  expect((await (await page.request.get(`/api/floor-plans/${plan.id}`)).json()).name).toBe(draftName);
});
test('declining New Sketch and replacement Load keeps the unsaved current draft', async ({ page }) => {
  const original = room([opening()]);
  const plan = await seedAndLoad(page, [original]);
  const draftRoom = { ...original, name: 'Unsaved current room' };
  await page.getByTestId('room-room-a').click();
  await page.locator('#roomName').fill(draftRoom.name);
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'New Sketch', exact: true }).click();
  await expect(page.getByTestId('room-room-a')).toBeVisible();
  await expect(page.locator('#roomName')).toHaveValue(draftRoom.name);
  const replacementName = `Replacement ${Date.now()}`;
  const replacement = await page.request.post('/api/floor-plans', { data: {
    name: replacementName, rooms: [{ ...room(), id: 'replacement-room' }],
    createdAt: '2025-06-01T00:00:00.000Z', updatedAt: '2025-06-01T00:00:00.000Z',
  } });
  expect(replacement.status()).toBe(201);
  await page.getByRole('button', { name: 'Load Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Load Sketch', exact: true });
  await dialog.getByText(replacementName, { exact: true }).click();
  page.once('dialog', dialog => dialog.dismiss());
  await dialog.getByRole('button', { name: 'Load Selected Sketch' }).click();
  await expect(page.getByTestId('room-room-a')).toBeVisible();
  await expect(page.getByTestId('room-replacement-room')).toHaveCount(0);
  expect((await save(page, plan.id)).rooms).toEqual([draftRoom]);
});

test('tooltip timers cannot dismiss a save dialog or erase its draft', async ({ page }) => {
  await page.clock.install();
  const original = room([opening()]);
  await seedAndLoad(page, [original]);
  await page.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Save Sketch', exact: true });
  const draftName = 'Still editing after tooltip expiry';
  await dialog.getByLabel('Sketch Name').fill(draftName);
  // Advance through the old tooltip's 100ms startup + 3s close timer.
  await page.clock.runFor(4000);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel('Sketch Name')).toHaveValue(draftName);
  await expect(page.getByTestId('opening-opening-a')).toBeVisible();
});

for (const side of ['top', 'right', 'bottom', 'left'] as const) {
  test(`door sector selects and double-click flips both swing directions on ${side} without moving attachment`, async ({ page }) => {
    for (const direction of ['inward', 'outward'] as const) {
      const original = { ...opening(), wallSide: side, doorProperties: {
        ...opening().doorProperties!, swingDirection: direction,
      } };
      const originalRoom = room([original]);
      const plan = await seedAndLoad(page, [originalRoom]);
      // A 32-inch leaf is 53 1/3 drawing pixels. This point lies well inside its swept sector.
      const point = await doorPoint(page, original.id, 18, direction === 'inward' ? 18 : -18);
      const bar = page.getByTestId('opening-opening-a');
      const path = page.getByTestId('door-swing-opening-a').locator('[data-door-outline]');
      const before = await path.getAttribute('d');
      await page.mouse.click(point.x, point.y);
      await expect(bar).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('radio', { name: direction === 'inward' ? 'Right Hand (RH)' : 'Left Hand (LH)', exact: true })).toBeChecked();
      expect((await save(page, plan.id)).rooms).toEqual([originalRoom]);

      await page.mouse.dblclick(point.x, point.y);
      await expect(path).not.toHaveAttribute('d', before!);
      await expect(page.getByRole('radio', { name: direction === 'inward' ? 'Left Hand (LH)' : 'Right Hand (RH)', exact: true })).toBeChecked();
      const flipped = { ...original, doorProperties: { ...original.doorProperties, swingSide: 'right' as const } };
      expect((await save(page, plan.id)).rooms).toEqual([{ ...originalRoom, objects: [flipped] }]);

      const flippedPath = await path.getAttribute('d');
      await page.getByRole('button', { name: 'Flip hinge', exact: true }).click();
      await expect(path).toHaveAttribute('d', before!);
      await page.getByRole('button', { name: 'Reverse swing', exact: true }).click();
      await expect(path).not.toHaveAttribute('d', before!);
      await expect(path).not.toHaveAttribute('d', flippedPath!);
      await expect(page.getByRole('radio', { name: direction === 'inward' ? 'Left Hand (LH)' : 'Right Hand (RH)', exact: true })).toBeChecked();
      expect((await save(page, plan.id)).rooms).toEqual([{ ...originalRoom, objects: [{ ...original, doorProperties: {
        ...original.doorProperties, swingDirection: direction === 'inward' ? 'outward' : 'inward',
      } }] }]);
    }
  });
}

test('door leaf and arc select, outside the swept quarter-circle does not, and bar double-click flips once', async ({ page }) => {
  const original = { ...opening(), doorProperties: { ...opening().doorProperties!, style: 'single' as const, swingDirection: 'inward' as const } };
  const originalRoom = room([original]);
  const plan = await seedAndLoad(page, [originalRoom]);
  const bar = page.getByTestId('opening-opening-a');
  // Independent points on a 32-inch leaf and its 90-degree arc, then a point
  // inside the SVG square bounds but outside the physical swept sector.
  for (const [label, x, y] of [['leaf', 0, 35], ['arc', 37.7123616633, 37.7123616633]] as const) {
    await page.getByTestId('room-room-a').click({ position: { x: 200, y: 160 } });
    await expect(bar).toHaveAttribute('aria-pressed', 'false');
    const point = await doorPoint(page, original.id, x, y);
    await page.mouse.click(point.x, point.y);
    await expect(bar, `${label} selects this door`).toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByTestId('room-room-a').click({ position: { x: 200, y: 160 } });
  const outside = await doorPoint(page, original.id, 48, 48);
  await page.mouse.click(outside.x, outside.y);
  await expect(bar).toHaveAttribute('aria-pressed', 'false');
  expect((await save(page, plan.id)).rooms).toEqual([originalRoom]);
  await bar.dblclick();
  await expect(bar).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('radio', { name: 'Left Hand (LH)', exact: true })).toBeChecked();
  expect((await save(page, plan.id)).rooms).toEqual([{ ...originalRoom, objects: [{ ...original, doorProperties: {
    ...original.doorProperties, swingSide: 'right',
  } }] }]);
});

test('an outward door sector over an adjoining grouped room selects and flips only its own door', async ({ page }) => {
  const original = { ...opening(), wallSide: 'right' as const };
  const neighbor = { ...room(), id: 'room-b', name: 'Adjoining room', x: 480,
    objects: [{ ...opening('window'), id: 'neighbor-window' }] };
  const plan = await seedAndLoad(page, [room([original]), neighbor]);
  await page.getByRole('button', { name: 'Select all rooms', exact: true }).click();
  await page.getByRole('button', { name: 'Group rooms', exact: true }).click();
  const grouped = await save(page, plan.id);
  const point = await doorPoint(page, original.id, 18, -18);
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId('opening-opening-a')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('opening-neighbor-window')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('radio', { name: 'Left Hand (LH)', exact: true })).toBeChecked();
  expect((await save(page, plan.id)).rooms).toEqual(grouped.rooms);
  await page.mouse.dblclick(point.x, point.y);
  await expect(page.getByRole('radio', { name: 'Right Hand (RH)', exact: true })).toBeChecked();
  expect((await save(page, plan.id)).rooms).toEqual(grouped.rooms.map(item => item.id === 'room-a' ? {
    ...item, objects: [{ ...original, doorProperties: { ...original.doorProperties!, swingSide: 'right' } }],
  } : item));
});

test('custom opening dimensions preserve fractions, reject empty/overlap, and keep unknown window height until chosen', async ({ page }) => {
  const original = room([opening(), { id: 'window-b', type: 'window', wallSide: 'top', position: 80, size: 40 }]);
  const plan = await seedAndLoad(page, [original]);
  await page.getByTestId('opening-opening-a').click();
  const width = page.getByRole('spinbutton', { name: 'Door width', exact: true });
  await width.fill(''); await width.press('Tab');
  await expect(page.getByText('Enter a positive size in inches. This edit has not been applied.')).toBeVisible();
  expect((await save(page, plan.id)).rooms).toEqual([original]);
  await width.fill('200'); await width.press('Tab');
  await expect(page.getByText('This width overlaps another opening. Choose a smaller width or move the opening first.').first()).toBeVisible();
  expect((await save(page, plan.id)).rooms).toEqual([original]);
  await width.fill('30.5'); await width.press('Enter');
  expect((await save(page, plan.id)).rooms[0].objects![0].doorProperties!.width).toBe(30.5);
  await page.getByTestId('opening-window-b').click();
  await expect(page.getByRole('spinbutton', { name: 'Window height', exact: true })).toHaveValue('');
  await page.getByRole('combobox').click();
  await page.getByRole('option', { name: '36" × 48"', exact: true }).click();
  const saved = await save(page, plan.id);
  expect(saved.rooms[0].objects![1]).toEqual({ ...original.objects![1], size: 60, windowProperties: { height: 48 } });
});

test.describe('opening touch ownership', () => {
  test.use({ hasTouch: true });
  test('touch drag releases on a new wall and touchcancel/Escape/blur discard pending opening moves', async ({ page }) => {
    const touchErrors: string[] = [];
    page.on('console', message => { if (/passive event|cancel a touchcancel/.test(message.text())) touchErrors.push(message.text()); });
    const original = opening();
    const plan = await seedAndLoad(page, [room([original])]);
    const session = await page.context().newCDPSession(page);
    const start = async () => {
      const bounds = (await page.getByTestId('opening-opening-a').boundingBox())!;
      await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ id: 1, x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }] });
    };
    const move = async (side: WallSide) => {
      const target = await wallPoint(page.getByTestId('room-room-a'), side);
      await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ id: 1, x: target.x, y: target.y }] });
    };
    await start(); await move('bottom');
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.getByTestId('opening-opening-a')).toHaveAttribute('data-wall-side', 'bottom');
    const moved = { ...original, wallSide: 'bottom', position: 50 };
    expect((await save(page, plan.id)).rooms[0].objects).toEqual([moved]);
    await start(); await move('right');
    await session.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await page.mouse.move(700, 500);
    expect((await save(page, plan.id)).rooms[0].objects).toEqual([moved]);
    for (const cancel of ['Escape', 'blur']) {
      const bounds = (await page.getByTestId('opening-opening-a').boundingBox())!;
      const target = await wallPoint(page.getByTestId('room-room-a'), 'right');
      await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      await page.mouse.down(); await page.mouse.move(target.x, target.y, { steps: 6 });
      if (cancel === 'Escape') await page.keyboard.press('Escape');
      else await page.evaluate(() => window.dispatchEvent(new Event('blur')));
      await page.mouse.up();
      expect((await save(page, plan.id)).rooms[0].objects).toEqual([moved]);
    }
    expect(touchErrors).toEqual([]);
  });
});


test('pan-owned double-clicks and subthreshold presses never flip or relocate a door', async ({ page }) => {
  const original = room([opening()]);
  const plan = await seedAndLoad(page, [original]);
  const bar = page.getByTestId('opening-opening-a');
  for (const modifier of ['Control', 'Space'] as const) {
    await page.keyboard.down(modifier);
    await bar.dblclick();
    await page.keyboard.up(modifier);
    expect((await save(page, plan.id)).rooms).toEqual([original]);
  }
  await page.getByTitle('Pan Mode (Hand Tool)', { exact: true }).click();
  await bar.dblclick();
  await page.getByTitle('Pan Mode (Hand Tool)', { exact: true }).click();
  expect((await save(page, plan.id)).rooms).toEqual([original]);
  const box = (await bar.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 2, box.y + box.height / 2);
  await page.mouse.up();
  expect((await save(page, plan.id)).rooms).toEqual([original]);
});
