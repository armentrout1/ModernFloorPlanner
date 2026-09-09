import { expect, type Page } from '@playwright/test';

/** Existing acceptance flows deliberately open the new narrow inspector. */
export async function openResponsiveInspector(page: Page) {
  const trigger = page.getByRole('button', { name: /^Edit selected (room|opening):/ });
  const dialog = page.getByRole('dialog', { name: /^Edit (room|door|window|opening):/ });
  if ((page.viewportSize()?.width ?? await page.evaluate(() => innerWidth)) < 1024) {
    await expect.poll(async () => await dialog.isVisible() || await trigger.isVisible()).toBe(true);
    if (!await dialog.isVisible()) await trigger.click();
  }
  await expect(page.getByTestId('physical-inspector')).toBeVisible();
}

export async function closeResponsiveInspector(page: Page) {
  const dialog = page.getByRole('dialog', { name: /^Edit (room|door|window|opening):/ });
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'Close inspector', exact: true }).click();
    await expect(dialog).toBeHidden();
  }
}
