import { test, expect, chromium, type Page, type Locator } from '@playwright/test';
import { configureIssuer } from './control';
import { parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY } from '../../client/src/features/physical-draft/storage';
const panel = (p: Page) => p.getByRole('dialog', { name: 'Account and local work', exact: true });
const roomFields = (p: Page) => p.getByTestId('physical-room-inspector');
const roomField = (p: Page, label: string) => roomFields(p).getByLabel(new RegExp('^' + label + ' \\((ft|m)\\)$'));
const openingFields = (p: Page) => p.getByTestId('physical-opening-inspector');
const currentKey = (context: string) => context === 'unassigned' ? PHYSICAL_DRAFT_STORAGE_KEY : `modern-floor-planner:context:v1:${context}:${PHYSICAL_DRAFT_STORAGE_KEY}`;
async function account(p: Page) { if (!await panel(p).isVisible()) await p.getByRole('button', { name: 'Account', exact: true }).click(); await expect(panel(p)).toBeVisible(); }
async function closeAccount(p: Page) { await panel(p).getByRole('button', { name: 'Close', exact: true }).click(); await expect(panel(p)).toBeHidden(); }
async function signIn(p: Page, who: 'A' | 'B' | 'C' = 'A') {
  await account(p); await expect(panel(p).getByRole('button', { name: 'Sign in', exact: true })).toBeEnabled();
  await panel(p).getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.getByRole('button', { name: 'Continue as Account ' + who, exact: true }).click();
  await expect(panel(p)).toContainText(new RegExp('account-' + who.toLowerCase()));
  expect(new URL(p.url()).search).toBe('');
}
async function createWorkspace(p: Page, suffix: string) {
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
async function selectWorkspace(p: Page, id: string) {
  await account(p); await panel(p).getByRole('combobox', { name: 'Workspace', exact: true }).selectOption(id);
  await panel(p).getByRole('button', { name: 'Select workspace', exact: true }).click(); await expect(panel(p)).toBeHidden();
}
async function commit(field: Locator, value: string) { await field.fill(value); await field.press('Enter'); await field.press('Tab'); }
async function physical(p: Page, name = 'Local Alpha') {
  if (!p.url().endsWith('/physical-draft')) await p.goto('/physical-draft');
  if (await p.getByRole('region', { name: 'Choose local working context' }).isVisible()) {
    await account(p); await panel(p).getByRole('button', { name: 'Resume workspace local work', exact: true }).click();
  }
  await p.getByRole('button', { name: 'New physical draft', exact: true }).click();
  await p.getByRole('button', { name: 'Add room', exact: true }).click();
  await roomFields(p).getByLabel('Room name', { exact: true }).fill(name); await roomFields(p).getByLabel('Room name', { exact: true }).press('Enter');
  for (const [label, value] of [['Length','12 ft'],['Width','10 ft'],['Ceiling height','8 ft']]) await commit(roomField(p, label), value);
}
async function registry(p: Page, context?: string) {
  const scope = context ?? await p.evaluate(() => sessionStorage.getItem('modern-floor-planner:working-context:v1') || 'unassigned');
  const raw = await p.evaluate(key => sessionStorage.getItem(key), currentKey(scope));
  const parsed = parseRegistry(raw); expect(parsed.status).toBe('recovered');
  if (parsed.status !== 'recovered') throw Error('Missing valid physical recovery');
  return { raw, scope, registry: parsed.registry, draft: parsed.registry.drafts.find(d => d.id === parsed.registry.selectedDraftId)! };
}
async function pending(p: Page) {
  await p.getByRole('button', { name: 'Create window', exact: true }).click();
  await commit(openingFields(p).getByLabel('Window height', { exact: true }), '3 ft');
  await openingFields(p).getByLabel('Window height', { exact: true }).fill('3 ft -');
  const takeoff = p.getByTestId('takeoff-panel');
  await takeoff.getByRole('checkbox', { name: 'Measure Floor area', exact: true }).check();
  await takeoff.getByRole('combobox', { name: 'Configure work', exact: true }).selectOption('floor-area');
  await takeoff.getByRole('button', { name: 'All current rooms', exact: true }).click();
  await takeoff.getByLabel('Waste percentage', { exact: true }).fill('10.');
  await roomField(p,'Length').fill('12 ft -');
}
async function drawLegacy(p: Page, name: string) {
  await p.goto('/');
  if (await p.getByRole('region', { name: 'Choose local working context' }).isVisible()) {
    await account(p); await panel(p).getByRole('button', { name: 'Resume workspace local work', exact: true }).click();
  }
  await p.getByRole('button', { name: 'Draw Room', exact: true }).click();
  const b = (await p.getByTestId('canvas-viewport').boundingBox())!;
  await p.mouse.move(b.x+90,b.y+100); await p.mouse.down(); await p.mouse.move(b.x+330,b.y+280,{steps:5}); await p.mouse.up();
  await p.getByRole('button', { name: 'Select & Move', exact: true }).click();
  await p.locator('.room-box').click(); await p.locator('#roomName').fill(name);
}
async function saveLegacy(p: Page, name: string) {
  await p.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  const dialog = p.getByRole('dialog', { name: 'Save Sketch', exact: true });
  await dialog.getByLabel('Sketch Name').fill(name); await dialog.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  await expect(dialog).toBeHidden();
}
test.beforeEach(async ({}, info) => { await configureIssuer({ subjectPrefix: 'browser-' + info.testId.replace(/[^A-Za-z0-9_-]/g, '').slice(-40) }); });
test.afterEach(async ({ page }) => {
  // No URL/header/body dump: protocol secrets are excluded from artifacts.
  if (!page.isClosed() && page.url().startsWith(process.env.MFP_ACCOUNTS_APP_ORIGIN!)) expect(await page.evaluate(() => Object.entries(sessionStorage).filter(([key,value]) => /access_token|refresh_token|id_token|contextToken|authorizationCode/i.test(key + value)).length)).toBe(0);
});

test('real OIDC redirect preserves unapplied local dimensions, opening and waste without assigning or uploading them', async ({ page }) => {
  const errors: string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  const mutations: string[]=[]; page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/floor-plans') && r.method()!=='GET') mutations.push(r.method());});
  await physical(page); await pending(page); const before = await registry(page, 'unassigned');
  await signIn(page); await expect(panel(page)).toContainText('Local drafts have not been uploaded or assigned');
  const workspace = await createWorkspace(page,'anonymous-preservation');
  await expect(page.getByRole('button',{name:'New physical draft',exact:true})).toBeVisible();
  await expect(page.getByTestId('physical-draft-id')).toHaveCount(0);
  expect((await registry(page,'unassigned')).raw).toBe(before.raw);
  await account(page); await panel(page).getByRole('button',{name:'Resume unassigned local-only work',exact:true}).click();
  await expect(roomField(page,'Length')).toHaveValue('12 ft -');
  expect((await registry(page,'unassigned')).draft).toEqual(before.draft);
  await page.getByTestId('takeoff-panel').getByLabel('Waste percentage',{exact:true}).focus();
  await expect(page.getByTestId('takeoff-panel').getByLabel('Waste percentage',{exact:true})).toHaveValue('10.');
  expect(mutations).toEqual([]); expect(errors).toEqual([]); expect(workspace.id).toBeTruthy();
  await page.screenshot({path:test.info().outputPath('account-local-recovery-desktop.png'),fullPage:true});
});

test('private legacy records cannot enter unassigned recovery or reappear after A signs out and B signs in', async ({ page }) => {
  await page.goto('/'); await signIn(page); await createWorkspace(page,'private-A');
  await drawLegacy(page,'Private room A'); await saveLegacy(page,'Private saved sketch A');
  await account(page); await panel(page).getByRole('button',{name:'Resume unassigned local-only work',exact:true}).click();
  await page.getByRole('button',{name:'Load Sketch',exact:true}).click();
  await expect(page.getByRole('dialog',{name:'Load Sketch',exact:true}).getByRole('alert')).toContainText('Select and resume');
  await expect(page.getByText('Private saved sketch A',{exact:true})).toHaveCount(0);
  await page.getByRole('dialog',{name:'Load Sketch',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
  await account(page); await panel(page).getByRole('button',{name:'Sign out',exact:true}).click();
  await signIn(page,'B'); await createWorkspace(page,'private-B');
  await expect(page.locator('.room-box')).toHaveCount(0);
  await page.getByRole('button',{name:'Load Sketch',exact:true}).click();
  await expect(page.getByText('Private saved sketch A',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('dialog',{name:'Load Sketch',exact:true})).toContainText("You don't have any saved sketches yet.");
  await page.getByRole('dialog',{name:'Load Sketch',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
  await page.goto('/quick-room'); await page.goBack();
  await expect(page.getByText('Private room A',{exact:true})).toHaveCount(0);
});

test('same-page workspace switches preserve exact raw fields, evidence and committed Undo history in separate contexts', async ({ page }) => {
  await page.goto('/physical-draft'); await signIn(page); const a = await createWorkspace(page,'context-A');
  await physical(page,'Workspace A room'); await commit(roomField(page,'Ceiling height'),'9 ft'); await pending(page);
  const before = await registry(page); const undoName = await page.getByRole('group',{name:'Committed edit history'}).getByRole('button',{name:/^Undo /}).textContent();
  const b = await createWorkspace(page,'context-B'); await expect(page.getByTestId('physical-draft-id')).toHaveCount(0);
  await physical(page,'Workspace B room'); const bBefore = await registry(page);
  await selectWorkspace(page,a.id); await expect(roomField(page,'Length')).toHaveValue('12 ft -');
  expect((await registry(page)).draft).toEqual(before.draft);
  await expect(page.getByRole('group',{name:'Committed edit history'}).getByRole('button',{name:/^Undo /})).toHaveText(undoName!);
  expect((await registry(page,bBefore.scope)).raw).toBe(bBefore.raw);
  await selectWorkspace(page,b.id); await expect(roomFields(page).getByLabel('Room name',{exact:true})).toHaveValue('Workspace B room');
});

test('cross-tab logout and identity change hide old private rows and reject an old session-context operation', async ({ page, context }) => {
  await page.goto('/'); await signIn(page); await createWorkspace(page,'cross-tab-A'); await drawLegacy(page,'Cross-tab private A'); await saveLegacy(page,'Cross-tab saved A');
  const sessionA = await page.evaluate(async()=>fetch('/api/auth/session',{cache:'no-store'}).then(r=>r.json()));
  let release!:()=>void; const held=new Promise<void>(r=>release=r); let fetched!:()=>void; const received=new Promise<void>(r=>fetched=r);
  await page.route('**/api/floor-plans',async route=>{if(route.request().method()!=='GET')return route.continue(); const response=await route.fetch();fetched();await held;await route.fulfill({response});});
  await page.getByRole('button',{name:'Load Sketch',exact:true}).click(); await received;
  const other=await context.newPage(); await other.goto('/'); await account(other);
  await panel(other).getByRole('button',{name:'Sign out',exact:true}).click();
  try { await signIn(other,'B'); } catch {
    const safeLocation = new URL(other.url());
    throw new Error('Second tab sign-in stopped at ' + safeLocation.origin + safeLocation.pathname + '; account alert: ' + (await panel(other).getByRole('alert').textContent().catch(()=> 'none')));
  }
  await createWorkspace(other,'cross-tab-B'); release();
  await expect(page.getByText('Cross-tab saved A',{exact:true})).toHaveCount(0);
  await expect(page.locator('.room-box')).toHaveCount(0);
  const status=await page.evaluate(async old=>(await fetch('/api/floor-plans',{method:'POST',headers:{'Content-Type':'application/json','X-MFP-Request':'1','X-MFP-Context':old.contextToken,'X-MFP-Workspace-Id':old.workspace.id},body:JSON.stringify({name:'Must never save',rooms:[]})})).status,sessionA);
  expect(status).toBe(409); await other.close();
});

test('provider cancellation and token failure return to local recovery without exposing protocol parameters', async ({ page }) => {
  await physical(page,'Cancelled sign-in room'); await roomField(page,'Width').fill('10 ft -'); const before=await registry(page,'unassigned');
  await account(page); await panel(page).getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Cancel sign-in',exact:true}).click();
  await expect(panel(page)).toContainText('Sign-in cancelled.'); expect(new URL(page.url()).search).toBe('');
  await closeAccount(page); await expect(roomField(page,'Width')).toHaveValue('10 ft -'); expect((await registry(page,'unassigned')).draft).toEqual(before.draft);
  await configureIssuer({mode:'token-failure'}); await account(page); await panel(page).getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Continue as Account A',exact:true}).click();
  await expect(panel(page)).toContainText('Sign-in could not be completed.'); expect(new URL(page.url()).search).toBe('');
  expect((await registry(page,'unassigned')).draft).toEqual(before.draft);
});

test('failed recovery prevents redirect and logout while preserving current pending input in memory', async ({ page }) => {
  await physical(page,'Quota retained room');
  await page.evaluate(()=>{(window as any).originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Synthetic quota','QuotaExceededError');};});
  await roomField(page,'Length').fill('12 ft -');
  const transitions:string[]=[];page.on('request',r=>{if(r.method()==='POST'&&/\/api\/auth\/(login|logout|workspace)$/.test(new URL(r.url()).pathname))transitions.push('transition');});
  await account(page); await panel(page).getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(panel(page).getByRole('alert')).toContainText('Refresh recovery is unavailable'); expect(transitions).toEqual([]);
  await closeAccount(page); await expect(roomField(page,'Length')).toHaveValue('12 ft -');
  await page.evaluate(()=>{Storage.prototype.setItem=(window as any).originalStorageSet;});
});

test('phone account controls preserve a valid unapplied field on pointer and keyboard focus transfer', async ({ page }) => {
  await page.setViewportSize({width:390,height:844}); await physical(page,'Phone local room');
  await roomField(page,'Length').fill('13 ft'); const before=await registry(page,'unassigned');
  await account(page); expect((await registry(page,'unassigned')).draft).toEqual(before.draft);
  await expect(panel(page).getByRole('button',{name:'Sign in',exact:true})).toBeEnabled();
  await page.screenshot({path:test.info().outputPath('account-local-recovery-phone.png'),fullPage:true});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await closeAccount(page); await expect(roomField(page,'Length')).toHaveValue('13 ft');
  expect((await registry(page,'unassigned')).draft).toEqual(before.draft);
  // A transition checkpoint cannot override later edits in Quick Rooms' own
  // validated cache when this disposable page is reloaded.
  await page.goto('/quick-room'); await page.getByRole('button',{name:'Add room',exact:true}).click();
  const quick = page.getByTestId('quick-room-card').first();
  await commit(quick.getByLabel('Length',{exact:true}), '12 ft');
  await account(page); await panel(page).getByRole('button',{name:'Resume unassigned local-only work',exact:true}).click();
  await expect(panel(page)).toBeHidden();
  await quick.getByLabel('Length',{exact:true}).fill('13 ft -');
  const raw = await page.evaluate(()=>sessionStorage.getItem('modern-floor-planner:quick-rooms:v1'));
  await page.reload(); await expect(page.getByTestId('quick-room-card').first().getByLabel('Length',{exact:true})).toHaveValue('13 ft -');
  expect(await page.evaluate(()=>sessionStorage.getItem('modern-floor-planner:quick-rooms:v1'))).toBe(raw);
});

test('only the fixture certificate pin permits the isolated HTTPS origin', async () => {
  const browser=await chromium.launch({args:[]});
  try {const context=await browser.newContext({ignoreHTTPSErrors:false});const page=await context.newPage();await expect(page.goto(process.env.MFP_ACCOUNTS_APP_ORIGIN!)).rejects.toThrow(/CERT_AUTHORITY_INVALID/);await context.close();}
  finally {await browser.close();}
});
