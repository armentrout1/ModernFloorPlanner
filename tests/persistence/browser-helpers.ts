import { test, expect, type Page, type Locator } from '@playwright/test';
import { parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY } from '../../client/src/features/physical-draft/storage';
export const panel = (p: Page) => p.getByRole('dialog', { name: 'Account and local work', exact: true });
export const roomFields = (p: Page) => p.getByTestId('physical-room-inspector');
export const roomField = (p: Page, label: string) => roomFields(p).getByLabel(new RegExp('^' + label + ' \\((ft|m)\\)$'));
const openingFields = (p: Page) => p.getByTestId('physical-opening-inspector');
const currentKey = (context: string) => context === 'unassigned' ? PHYSICAL_DRAFT_STORAGE_KEY : `modern-floor-planner:context:v1:${context}:${PHYSICAL_DRAFT_STORAGE_KEY}`;
export async function account(p: Page) { if (!await panel(p).isVisible()) await p.getByRole('button', { name: 'Account', exact: true }).click(); await expect(panel(p)).toBeVisible(); }
export async function closeAccount(p: Page) { await panel(p).getByRole('button', { name: 'Close', exact: true }).click(); await expect(panel(p)).toBeHidden(); }
export async function signIn(p: Page, who: 'A' | 'B' | 'C' = 'A') {
  await account(p); await expect(panel(p).getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await panel(p).getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.getByRole('button', { name: 'Continue as Account ' + who, exact: true }).click();
  await expect(panel(p)).toContainText(new RegExp('account-' + who.toLowerCase()));
  expect(new URL(p.url()).search).toBe('');
}
export async function createWorkspace(p: Page, suffix: string) {
  await account(p);
  const name = 'Synthetic ' + suffix + ' ' + test.info().testId.slice(-12);
  if (await panel(p).getByRole('textbox', { name: 'New workspace name', exact: true }).count() === 0) {
    await panel(p).getByRole('combobox', { name: 'Workspace', exact: true }).selectOption('');
    await panel(p).getByRole('button', { name: 'Select workspace', exact: true }).click(); await expect(panel(p).getByRole('button', { name: 'Select workspace', exact: true })).toBeEnabled();
  }
  await panel(p).getByRole('textbox', { name: 'New workspace name', exact: true }).fill(name);
  await panel(p).getByRole('button', { name: 'Create workspace', exact: true }).click();
  await expect(panel(p)).toContainText('Workspace created. Select it explicitly');
  await expect(panel(p).getByRole('combobox', { name: 'Workspace', exact: true })).toHaveValue('');
  await panel(p).getByRole('combobox', { name: 'Workspace', exact: true }).selectOption({ label: name + ' · owner' });
  const id = await panel(p).getByRole('combobox', { name: 'Workspace', exact: true }).inputValue();
  await panel(p).getByRole('button', { name: 'Select workspace', exact: true }).click(); await expect(panel(p)).toBeHidden();
  return { id, name };
}
export async function selectWorkspace(p: Page, id: string) {
  await account(p); await panel(p).getByRole('combobox', { name: 'Workspace', exact: true }).selectOption(id);
  await panel(p).getByRole('button', { name: 'Select workspace', exact: true }).click(); await expect(panel(p)).toBeHidden();
}
export async function commit(field: Locator, value: string) { await field.fill(value); await field.press('Enter'); await field.press('Tab'); }
export async function physical(p: Page, name = 'Local Alpha') {
  if (!p.url().endsWith('/physical-draft')) await p.goto('/physical-draft');
  if (await p.getByRole('region', { name: 'Choose local working context' }).isVisible()) {
    await account(p); await panel(p).getByRole('button', { name: 'Resume workspace local work', exact: true }).click();
  }
  await p.getByRole('button', { name: 'New building draft', exact: true }).click();
  await p.getByRole('button', { name: 'Add room', exact: true }).click();
  await roomFields(p).getByLabel('Room name', { exact: true }).fill(name); await roomFields(p).getByLabel('Room name', { exact: true }).press('Enter');
  for (const [label, value] of [['Length','12 ft'],['Width','10 ft'],['Ceiling height','8 ft']]) await commit(roomField(p, label), value);
}

export async function selectedPhysical(p: Page) {
 const context = await p.evaluate(() => sessionStorage.getItem('modern-floor-planner:working-context:v1') || 'unassigned');
 const value = parseRegistry(await p.evaluate(key=>sessionStorage.getItem(key),currentKey(context)));
 expect(value.status).toBe('recovered'); if(value.status!=='recovered')throw Error('No supported physical draft');
 const draft=value.registry.drafts.find(d=>d.id===value.registry.selectedDraftId);expect(draft).toBeTruthy();return draft!;
}
export const savePanel=(p:Page)=>p.getByRole('region',{name:'Account Save and Open',exact:true});
export const saveButton=(p:Page)=>savePanel(p).getByRole('button',{name:/^Save to /});
export async function savePhysical(p:Page){
 const response=p.waitForResponse(r=>new URL(r.url()).pathname.startsWith('/api/physical-plans')&&r.request().method()==='POST');
 await saveButton(p).click();const received=await response;expect(received.status()).toBe(201);await expect(p.getByTestId('physical-save-status')).toHaveText(/^Saved revision /);return received.json();
}

export async function schemaFive(p:Page){
 await p.getByRole('button',{name:'Enable stairs and surface openings',exact:true}).click();
 await p.getByRole('button',{name:'Enable room layout in a new copy',exact:true}).click();
 expect((await selectedPhysical(p)).document.schemaVersion).toBe(5);
}
