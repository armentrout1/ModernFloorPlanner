import { test, expect, type Page, type Locator } from '@playwright/test';
import { parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY } from '../../client/src/features/physical-draft/storage';
export const panel = (p: Page) => p.getByRole('dialog', { name: 'Account', exact: true })
  .or(p.getByRole('region', { name: 'Welcome to Modern Floor Planner', exact: true }));
export const roomFields = (p: Page) => p.getByTestId('physical-room-inspector');
export const roomField = (p: Page, label: string) => roomFields(p).getByLabel(new RegExp('^' + label + ' \\((ft|m)\\)$'));
const openingFields = (p: Page) => p.getByTestId('physical-opening-inspector');
const currentKey = (context: string) => context === 'unassigned' ? PHYSICAL_DRAFT_STORAGE_KEY : `modern-floor-planner:context:v1:${context}:${PHYSICAL_DRAFT_STORAGE_KEY}`;
export async function account(p: Page) {
  if (!await panel(p).isVisible()) {
    const accountButton = p.getByRole('button', { name: 'Account', exact: true });
    if (await accountButton.isVisible()) {
      await accountButton.click();
      const signInItem = p.getByRole('menuitem', { name: 'Sign in or create account', exact: true });
      if (await signInItem.isVisible()) await signInItem.click();
      else await p.getByRole('menuitem', { name: 'Settings', exact: true }).click();
    }
  }
  await expect(panel(p)).toBeVisible();
}
export async function closeAccount(p: Page) {
  const dialog = p.getByRole('dialog', { name: 'Account', exact: true });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  else await panel(p).getByRole('button', { name: 'Continue as guest', exact: true }).click();
  await expect(panel(p)).toBeHidden();
}
export async function signIn(p: Page, who: 'A' | 'B' | 'C' = 'A') {
  await account(p);
  await panel(p).getByLabel('Email address', { exact: true }).fill(`account-${who.toLowerCase()}@example.test`);
  await panel(p).getByLabel('Password', { exact: true }).fill(`Password-ACCOUNT-${who}-1234`);
  await panel(p).getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect.poll(() => p.evaluate(() => fetch('/api/auth/session', { cache: 'no-store' }).then(response => response.json()).then(session => session.status))).toBe('authenticated');
  expect(new URL(p.url()).search).toBe('');
}
export async function createWorkspace(p: Page, suffix: string) {
  await account(p);
  const name = 'Synthetic ' + suffix + ' ' + test.info().testId.slice(-12);
  if (await panel(p).getByRole('textbox', { name: 'Workspace name', exact: true }).count() === 0)
    await panel(p).getByRole('button', { name: 'New workspace', exact: true }).click();
  const response = p.waitForResponse(value => new URL(value.url()).pathname === '/api/workspaces' && value.request().method() === 'POST');
  await panel(p).getByRole('textbox', { name: 'Workspace name', exact: true }).fill(name);
  await panel(p).getByRole('button', { name: /^Create workspace and (continue|start planning)$/ }).click();
  const created = await response; expect(created.status()).toBe(201);
  const workspace = await created.json();
  await expect(panel(p)).toBeHidden();
  return { id: workspace.id as string, name };
}
export async function selectWorkspace(p: Page, id: string) {
  await account(p);
  const chooser = panel(p).getByRole('combobox', { name: 'Workspace', exact: true });
  if (await chooser.count()) {
    await chooser.selectOption(id);
    await panel(p).getByRole('button', { name: /^(Switch|Open) workspace$/ }).click();
  } else await panel(p).getByRole('button', { name: 'Continue planning', exact: true }).click();
  await expect(panel(p)).toBeHidden();
}
export async function commit(field: Locator, value: string) { await field.fill(value); await field.press('Enter'); await field.press('Tab'); }
export async function physical(p: Page, name = 'Local Alpha') {
  if (!p.url().endsWith('/physical-draft')) await p.goto('/physical-draft');
  if (await p.getByRole('region', { name: 'Welcome to Modern Floor Planner' }).isVisible()) {
    await account(p); await panel(p).getByRole('button', { name: 'Continue planning', exact: true }).click();
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
