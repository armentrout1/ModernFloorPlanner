import { expect, test, type Page } from '@playwright/test';

async function openCommandSearch(page: Page) {
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'More tools', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('combobox', { name: 'Search tools and commands', exact: true })).toBeFocused();
  return dialog;
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  (page as Page & { packet5Errors?: string[] }).packet5Errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { packet5Errors?: string[] }).packet5Errors, 'uncaught browser errors').toEqual([]);
});

test('More tools searches aliases, explains unavailable commands and synchronizes active tools', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');

  const moreTools = page.getByRole('button', { name: 'More tools', exact: true });
  await expect(moreTools).toBeVisible();
  await moreTools.click();
  const dialog = page.getByRole('dialog', { name: 'More tools', exact: true });
  const search = dialog.getByRole('combobox', { name: 'Search tools and commands', exact: true });
  await expect(search).toBeFocused();

  await search.fill('pointer');
  await expect(dialog.getByLabel('Select & Move', { exact: true })).toBeVisible();
  await dialog.getByLabel('Select & Move', { exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('button', { name: 'Select & Move', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press('r');
  await expect(page.getByRole('button', { name: 'Draw Room', exact: true }).first()).toHaveAttribute('aria-pressed', 'true');
  await openCommandSearch(page);
  await expect(page.getByRole('dialog', { name: 'More tools', exact: true }).getByText('Active', { exact: true })).toBeVisible();

  const activeDialog = page.getByRole('dialog', { name: 'More tools', exact: true });
  const activeSearch = activeDialog.getByRole('combobox', { name: 'Search tools and commands', exact: true });
  await activeSearch.fill('space evenly');
  await expect(activeDialog.getByText('Distribute Horizontally', { exact: true })).toBeVisible();
  await expect(activeDialog.getByText('Distribute Vertically', { exact: true })).toBeVisible();
  await expect(activeDialog.getByText('Unavailable — Add at least three rooms.').first()).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(activeDialog).toBeVisible();

  await activeSearch.fill('delete');
  await expect(activeDialog.locator('[cmdk-item]').filter({ hasText: /delete/i })).toHaveCount(0);
  await activeSearch.fill('zz-no-matching-editor-command');
  await expect(activeDialog.getByText('No tools or commands found.', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(activeDialog).toBeHidden();
});

test('command discovery stays usable at phone, tablet and desktop widths with keyboard focus return', async ({ page }) => {
  for (const width of [390, 820, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const dialog = await openCommandSearch(page);
    await expect(dialog).toBeInViewport();
    await expect(dialog.getByText('Drawing tools', { exact: true })).toBeVisible();
    const finalGroup = dialog.getByText('Room transform', { exact: true });
    await finalGroup.scrollIntoViewIfNeeded();
    await expect(finalGroup).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${width}px page has no horizontal overflow`).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`more-tools-${width}.png`) });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const moreTools = page.getByRole('button', { name: 'More tools', exact: true });
  await moreTools.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: 'More tools', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(moreTools).toBeFocused();

  const help = page.getByRole('button', { name: 'Help', exact: true });
  await help.click();
  await expect(page.getByRole('menuitem', { name: 'Search tools and commands', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: 'Search tools and commands', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'More tools', exact: true })).toBeVisible();
});
