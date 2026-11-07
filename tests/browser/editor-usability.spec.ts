import { expect, test, type Page } from '@playwright/test';
import type { Room } from '../../shared/schema';
import { choosePlanCommand } from './editor-header-helpers';

const rooms: Room[] = [
  { id: 'packet6-bedroom', name: 'Packet 6 bedroom', x: 80, y: 80, width: 280, height: 220,
    color: '#93c5fd', objects: [
      { id: 'packet6-door', type: 'door', wallSide: 'top', position: 45, size: 160 / 3,
        doorProperties: { width: 32, height: 84, style: 'bifold', swingDirection: 'outward', swingSide: 'left' } },
      { id: 'packet6-window', type: 'window', wallSide: 'right', position: 60, size: 80 },
    ] },
  { id: 'packet6-kitchen', name: 'Packet 6 kitchen', x: 390, y: 80, width: 240, height: 180,
    color: '#86efac', objects: [] },
];

async function seedAndLoad(page: Page) {
  const name = `Packet 6 usability ${test.info().testId}`;
  const response = await page.request.post('/api/floor-plans', { data: {
    name, rooms, createdAt: '2026-11-06T00:00:00.000Z', updatedAt: '2026-11-06T00:00:00.000Z',
  } });
  expect(response.status()).toBe(201);
  await page.goto('/');
  await choosePlanCommand(page, 'My Plans');
  const dialog = page.getByRole('dialog', { name: 'My Plans', exact: true });
  await dialog.getByText(name, { exact: true }).click();
  await dialog.getByRole('button', { name: 'Open plan' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByTestId('room-packet6-bedroom')).toBeVisible();
  await page.locator('[toast-close]').click();
}

async function chooseSelectTool(page: Page) {
  const select = page.getByRole('button', { name: 'Select & Move', exact: true });
  for (let index = 0; index < await select.count(); index += 1) {
    if (await select.nth(index).isVisible()) {
      await select.nth(index).click();
      return;
    }
  }
  await page.getByTestId('toggle-left-panel').click();
  for (let index = 0; index < await select.count(); index += 1) {
    if (await select.nth(index).isVisible()) {
      await select.nth(index).click();
      return;
    }
  }
  throw new Error('Select & Move did not become visible');
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 820, height: 900 },
  { width: 1280, height: 900 },
  { width: 1920, height: 1080 },
]) {
  test(`focus mode preserves selection and restores the shell at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await seedAndLoad(page);

    await chooseSelectTool(page);
    await page.getByTestId('room-packet6-bedroom').click();
    await expect(page.getByTestId('room-packet6-bedroom')).toHaveAttribute('data-selected', 'true');
    await expect(page.getByTestId('right-editor-panel')).toHaveAttribute('aria-hidden', 'false');

    const originalLeftMode = await page.getByTestId('left-editor-panel').getAttribute('data-left-mode');
    await page.getByTestId('toggle-focus-mode').click();
    await expect(page.getByTestId('editor-shell')).toHaveAttribute('data-focus-mode', 'true');
    await expect(page.getByTestId('left-editor-panel')).toHaveAttribute('data-left-mode', 'hidden');
    await expect(page.getByTestId('right-editor-panel')).toHaveAttribute('aria-hidden', 'true');
    await expect(page.getByTestId('selection-inspector')).toBeHidden();
    await expect(page.getByTestId('toggle-focus-mode')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('edit-focus-selection')).toBeVisible();
    await expect(page.getByTestId('room-packet6-bedroom')).toHaveAttribute('data-selected', 'true');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`focus-${viewport.width}.png`) });

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('editor-shell')).toHaveAttribute('data-focus-mode', 'false');
    await expect(page.getByTestId('left-editor-panel')).toHaveAttribute('data-left-mode', originalLeftMode ?? 'hidden');
    await expect(page.getByTestId('right-editor-panel')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.getByTestId('room-packet6-bedroom')).toHaveAttribute('data-selected', 'true');

    await page.evaluate(() => {
      document.body.tabIndex = -1;
      document.body.focus();
    });
    await page.keyboard.press('Shift+F');
    await expect(page.getByTestId('editor-shell')).toHaveAttribute('data-focus-mode', 'true');
    await page.getByTestId('edit-focus-selection').click();
    await expect(page.getByTestId('editor-shell')).toHaveAttribute('data-focus-mode', 'false');
    await expect(page.getByTestId('right-editor-panel')).toHaveAttribute('aria-hidden', 'false');
    await expect(page.getByText('Packet 6 bedroom properties', { exact: true })).toBeVisible();
  });
}

test('phone tool choice closes the tools overlay and leaves the canvas ready', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByTestId('toggle-left-panel').click();
  const tools = page.getByRole('dialog', { name: 'Tools & Actions', exact: true });
  await expect(tools).toBeVisible();
  await tools.getByRole('button', { name: 'Draw Room', exact: true }).click();
  await expect(tools).toHaveCount(0);
  await expect(page.getByTestId('left-editor-panel')).toHaveAttribute('data-left-mode', 'hidden');
  await expect(page.getByTestId('canvas-viewport')).toBeVisible();
});

test('focus controls remain usable at 200 percent text sizing', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page.evaluate(() => { document.documentElement.style.fontSize = '200%'; });
  await expect(page.getByTestId('toggle-focus-mode')).toBeVisible();
  await page.getByTestId('toggle-focus-mode').click();
  await expect(page.getByTestId('editor-shell')).toHaveAttribute('data-focus-mode', 'true');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: test.info().outputPath('focus-200-percent-text.png') });
});
