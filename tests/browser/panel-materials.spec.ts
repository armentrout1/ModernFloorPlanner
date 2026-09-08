import { expect, test } from '@playwright/test';
import type { Room } from '../../shared/schema';

test.use({ viewport: { width: 1280, height: 600 } });

test('Materials fits a narrow sidebar and scrolls to its bottom totals at a short viewport height', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const rooms: Room[] = [{
    id: 'materials-scroll-room', name: 'Materials room', x: 100, y: 100, width: 400, height: 320,
    objects: [
      { id: 'materials-door-32', type: 'door', wallSide: 'top', position: 25, size: 160 / 3,
        doorProperties: { width: 32, height: 80, style: 'single', swingDirection: 'inward', swingSide: 'right' } },
      { id: 'materials-door-36', type: 'door', wallSide: 'right', position: 50, size: 60,
        doorProperties: { width: 36, height: 84, style: 'single', swingDirection: 'outward', swingSide: 'left' } },
      { id: 'materials-window', type: 'window', wallSide: 'left', position: 50, size: 48 },
    ],
  }];
  // This is the existing disposable loopback acceptance API, never production.
  const name = 'Materials scroll ' + test.info().testId;
  const response = await page.request.post('/api/floor-plans', { data: {
    name, rooms, createdAt: '2025-06-01T00:00:00.000Z', updatedAt: '2025-06-01T00:00:00.000Z',
  } });
  expect(response.status()).toBe(201);
  await page.goto('/');
  await page.getByRole('button', { name: 'Load Sketch', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Load Sketch', exact: true });
  await dialog.getByText(name, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Load Selected Sketch' }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Materials', exact: true }).click();

  const panel = page.getByTestId('right-editor-panel');
  const resizer = page.getByTestId('right-panel-resizer');
  const panelBefore = await panel.boundingBox();
  const handle = await resizer.boundingBox();
  expect(panelBefore).not.toBeNull();
  expect(handle).not.toBeNull();
  // Resize through the real splitter, giving the inspector less than its old320px width.
  const x = handle!.x + handle!.width / 2;
  const y = handle!.y + handle!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + panelBefore!.width - 240, y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(async () => (await panel.boundingBox())!.width).toBeLessThan(260);
  expect((await panel.boundingBox())!.width).toBeGreaterThan(210);

  const materials = panel.getByRole('heading', { name: 'Material Calculations', exact: true }).locator('..');
  const panelBox = (await panel.boundingBox())!;
  const materialsBox = (await materials.boundingBox())!;
  expect(materialsBox.x).toBeGreaterThanOrEqual(panelBox.x);
  expect(materialsBox.x + materialsBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width + 1);
  expect(materialsBox.y).toBeGreaterThanOrEqual(panelBox.y);
  expect(materialsBox.y + materialsBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
  expect(materialsBox.height).toBeGreaterThan(100);
  expect(await materials.evaluate(element => element.scrollHeight > element.clientHeight + 20)).toBe(true);

  await materials.hover();
  await page.mouse.wheel(0, 10000);
  await expect.poll(() => materials.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
  const lastTotal = materials.getByRole('row').filter({ hasText: '36 in' });
  await expect(lastTotal.getByRole('cell')).toHaveText(['36 in', '1']);
  await expect(lastTotal).toBeInViewport();
  const finalNote = materials.getByText('Material quantities may vary based on actual construction needs and waste factors.', { exact: true });
  await expect(finalNote).toBeInViewport();
  const totalBox = (await lastTotal.boundingBox())!;
  const noteBox = (await finalNote.boundingBox())!;
  expect(totalBox.y).toBeGreaterThanOrEqual(materialsBox.y);
  expect(totalBox.x + totalBox.width).toBeLessThanOrEqual(materialsBox.x + materialsBox.width + 1);
  expect(noteBox.y + noteBox.height).toBeLessThanOrEqual(materialsBox.y + materialsBox.height + 1);
  expect(errors).toEqual([]);
});
