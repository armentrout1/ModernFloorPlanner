import type { Page } from '@playwright/test';

export type PlanCommand =
  | 'New plan'
  | 'Open plan'
  | 'Save plan'
  | 'Open a physical copy';

export async function openPlanMenu(page: Page) {
  await page.getByRole('button', { name: 'Plan menu', exact: true }).click();
}

export async function choosePlanCommand(page: Page, command: PlanCommand) {
  await openPlanMenu(page);
  await page.getByRole('menuitem', { name: command, exact: true }).click();
}
