import { test, expect, chromium, type Page, type Locator } from '@playwright/test';
import { configureSupabase } from './control';
import { parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY } from '../../client/src/features/physical-draft/storage';
import { choosePlanCommand } from '../browser/editor-header-helpers';
const panel = (p: Page) => p.getByRole('dialog', { name: 'Account', exact: true })
  .or(p.getByRole('region', { name: 'Welcome to Modern Floor Planner', exact: true }));
const roomFields = (p: Page) => p.getByTestId('physical-room-inspector');
const roomField = (p: Page, label: string) => roomFields(p).getByLabel(new RegExp('^' + label + ' \\((ft|m)\\)$'));
const openingFields = (p: Page) => p.getByTestId('physical-opening-inspector');
const currentKey = (context: string) => context === 'unassigned' ? PHYSICAL_DRAFT_STORAGE_KEY : `modern-floor-planner:context:v1:${context}:${PHYSICAL_DRAFT_STORAGE_KEY}`;
async function account(p: Page) {
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
async function closeAccount(p: Page) {
  const dialog = p.getByRole('dialog', { name: 'Account', exact: true });
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  else await panel(p).getByRole('button', { name: 'Continue as guest', exact: true }).click();
  await expect(panel(p)).toBeHidden();
}
async function signIn(p: Page, who: 'A' | 'B' | 'C' = 'A') {
  await account(p);
  await panel(p).getByLabel('Email address', { exact: true }).fill(`account-${who.toLowerCase()}@example.test`);
  await panel(p).getByLabel('Password', { exact: true }).fill(`Password-ACCOUNT-${who}-1234`);
  await panel(p).getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect.poll(() => p.evaluate(() => fetch('/api/auth/session', { cache: 'no-store' }).then(response => response.json()).then(session => session.status))).toBe('authenticated');
  expect(new URL(p.url()).search).toBe('');
}
async function createWorkspace(p: Page, suffix: string) {
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
async function selectWorkspace(p: Page, id: string) {
  await account(p);
  const chooser = panel(p).getByRole('combobox', { name: 'Workspace', exact: true });
  if (await chooser.count()) {
    await chooser.selectOption(id);
    await panel(p).getByRole('button', { name: /^(Switch|Open) workspace$/ }).click();
  } else await panel(p).getByRole('button', { name: 'Continue planning', exact: true }).click();
  await expect(panel(p)).toBeHidden();
}
async function commit(field: Locator, value: string) { await field.fill(value); await field.press('Enter'); await field.press('Tab'); }
async function physical(p: Page, name = 'Local Alpha') {
  if (!p.url().endsWith('/physical-draft')) await p.goto('/physical-draft');
  if (await p.getByRole('region', { name: 'Welcome to Modern Floor Planner' }).isVisible()) {
    await account(p); await panel(p).getByRole('button', { name: 'Continue planning', exact: true }).click();
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
  if (await p.getByRole('region', { name: 'Welcome to Modern Floor Planner' }).isVisible()) {
    await account(p); await panel(p).getByRole('button', { name: 'Continue planning', exact: true }).click();
  }
  await p.getByRole('button', { name: 'Draw Room', exact: true }).click();
  const b = (await p.getByTestId('canvas-viewport').boundingBox())!;
  await p.mouse.move(b.x+90,b.y+100); await p.mouse.down(); await p.mouse.move(b.x+330,b.y+280,{steps:5}); await p.mouse.up();
  await p.getByRole('button', { name: 'Select & Move', exact: true }).click();
  await p.locator('.room-box').click(); await p.locator('#roomName').fill(name);
}
async function saveLegacy(p: Page, name: string) {
  await choosePlanCommand(p, 'Save plan');
  const dialog = p.getByRole('dialog', { name: 'Save plan', exact: true });
  await dialog.getByLabel('Plan name').fill(name); await dialog.getByRole('button', { name: 'Save plan', exact: true }).click();
  await expect(dialog).toBeHidden();
}
test.beforeEach(async ({}, info) => { await configureSupabase({ mode: 'normal', userDelayMs: 0, subjectPrefix: 'browser-' + info.testId.replace(/[^A-Za-z0-9_-]/g, '').slice(-40) }); });
test.afterEach(async ({ page }) => {
  // No URL/header/body dump: protocol secrets are excluded from artifacts.
  if (!page.isClosed() && page.url().startsWith(process.env.MFP_ACCOUNTS_APP_ORIGIN!)) expect(await page.evaluate(() => Object.entries(sessionStorage).filter(([key,value]) => /access_token|refresh_token|id_token|contextToken|authorizationCode/i.test(key + value)).length)).toBe(0);
});

test('first sign-in waits for an explicit workspace name and refresh resumes it without another create', async ({ page }) => {
  const creates: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/workspaces') creates.push(request.url());
  });
  await page.goto('/');
  await signIn(page);
  await expect(panel(page).getByRole('heading', { name: 'Name your workspace', exact: true })).toBeVisible();
  await expect(panel(page).getByLabel('Workspace name', { exact: true })).toHaveValue('');
  expect(creates).toHaveLength(0);
  const workspace = await createWorkspace(page, 'named-onboarding');
  expect(creates).toHaveLength(1);
  await expect(page.getByRole('button', { name: `Workspace: ${workspace.name}`, exact: true })).toBeVisible();
  await page.reload();
  await expect(panel(page)).toBeHidden();
  await expect(page.getByRole('button', { name: `Workspace: ${workspace.name}`, exact: true })).toBeVisible();
  expect(creates).toHaveLength(1);
});

test('My Plans duplicates a server plan and refresh reopens the verified current plan with honest save state', async ({ page }) => {
  await page.goto('/');
  await signIn(page);
  await createWorkspace(page, 'my-plans');
  await drawLegacy(page, 'Saved plan room');
  await saveLegacy(page, 'Kitchen plan');
  await expect(page.getByText('Saved to My Plans', { exact: true })).toBeVisible();

  await choosePlanCommand(page, 'My Plans');
  const plans = page.getByRole('dialog', { name: 'My Plans', exact: true });
  await expect(plans.getByText('Kitchen plan', { exact: true })).toBeVisible();
  const duplicated = page.waitForResponse(response => new URL(response.url()).pathname === '/api/floor-plans' && response.request().method() === 'POST');
  await plans.getByRole('button', { name: 'Options for Kitchen plan', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  expect((await duplicated).status()).toBe(201);
  await expect(plans.getByText('Kitchen plan copy', { exact: true })).toBeVisible();
  await plans.getByText('Kitchen plan copy', { exact: true }).click();
  await plans.getByRole('button', { name: 'Open plan', exact: true }).click();
  await expect(page.getByLabel('Current floor plan name', { exact: true })).toHaveValue('Kitchen plan copy');
  await page.reload();
  await expect(page.getByLabel('Current floor plan name', { exact: true })).toHaveValue('Kitchen plan copy');
  await expect(page.getByText('Saved to My Plans', { exact: true })).toBeVisible();
});

test('Google sign-in starts the configured Supabase provider flow with the exact app callback', async ({ page }) => {
  let authorizeUrl: URL | null = null;
  await page.route('**/auth/v1/authorize**', async route => {
    authorizeUrl = new URL(route.request().url());
    await route.fulfill({ status: 200, contentType: 'text/html', body: '<p>synthetic Google authorization handoff</p>' });
  });
  await page.goto('/');
  const appOrigin = new URL(page.url()).origin;
  await account(page);
  await panel(page).getByRole('button', { name: 'Continue with Google', exact: true }).click();
  await expect.poll(() => authorizeUrl?.searchParams.get('provider') ?? null).toBe('google');
  expect(authorizeUrl!.searchParams.get('redirect_to')).toBe(appOrigin + '/account/confirm');
});

test('native Supabase sign-in preserves unapplied local dimensions, opening and waste without assigning or uploading them', async ({ page }) => {
  const errors: string[]=[]; page.on('pageerror',e=>errors.push(e.message));
  const mutations: string[]=[]; page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/floor-plans') && r.method()!=='GET') mutations.push(r.method());});
  await physical(page); await pending(page); const before = await registry(page, 'unassigned');
  await signIn(page); await expect(panel(page)).toContainText('Local drafts remain separate');
  const workspace = await createWorkspace(page,'anonymous-preservation');
  await expect(page.getByRole('button',{name:'New physical draft',exact:true})).toBeVisible();
  await expect(page.getByTestId('physical-draft-id')).toHaveCount(0);
  expect((await registry(page,'unassigned')).raw).toBe(before.raw);
  await account(page); await panel(page).getByRole('button',{name:'Continue as guest',exact:true}).click();
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
  await account(page); await panel(page).getByRole('button',{name:'Continue as guest',exact:true}).click();
  await choosePlanCommand(page, 'My Plans');
  await expect(page.getByRole('dialog',{name:'My Plans',exact:true}).getByRole('alert')).toContainText('Select and resume');
  await expect(page.getByText('Private saved sketch A',{exact:true})).toHaveCount(0);
  await page.getByRole('dialog',{name:'My Plans',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
  await account(page); await panel(page).getByRole('button',{name:'Sign out',exact:true}).click();
  await signIn(page,'B'); await createWorkspace(page,'private-B');
  await expect(page.locator('.room-box')).toHaveCount(0);
  await choosePlanCommand(page, 'My Plans');
  await expect(page.getByText('Private saved sketch A',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('dialog',{name:'My Plans',exact:true})).toContainText('No saved plans yet.');
  await page.getByRole('dialog',{name:'My Plans',exact:true}).getByRole('button',{name:'Cancel',exact:true}).click();
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
  await choosePlanCommand(page, 'My Plans'); await received;
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

test('wrong credentials and provider failure retain local recovery without exposing provider details', async ({ page }) => {
  await physical(page,'Failed sign-in room'); await roomField(page,'Width').fill('10 ft -'); const before=await registry(page,'unassigned');
  await account(page); await panel(page).getByLabel('Email address',{exact:true}).fill('account-a@example.test');
  await panel(page).getByLabel('Password',{exact:true}).fill('wrong-password');
  await panel(page).getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(panel(page).getByRole('alert')).toContainText('email or password was not accepted'); expect(new URL(page.url()).search).toBe('');
  await closeAccount(page); await expect(roomField(page,'Width')).toHaveValue('10 ft -'); expect((await registry(page,'unassigned')).draft).toEqual(before.draft);
  await configureSupabase({mode:'token-failure'}); await account(page);
  await panel(page).getByLabel('Password',{exact:true}).fill('Password-ACCOUNT-A-1234');
  await panel(page).getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(panel(page).getByRole('alert')).toContainText('email or password was not accepted'); expect(new URL(page.url()).search).toBe('');
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
  await account(page); await panel(page).getByRole('button',{name:'Continue as guest',exact:true}).click();
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
