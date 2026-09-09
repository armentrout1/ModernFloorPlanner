import { expect, test, type Page } from '@playwright/test';

const NORMAL = 'http://127.0.0.1:4175';
const saveDialog = (page: Page) => page.getByRole('dialog', { name: 'Save Sketch', exact: true });
const loadDialog = (page: Page) => page.getByRole('dialog', { name: 'Load Sketch', exact: true });
const localRooms = (page: Page) => page.locator('.room-box');
const messages = {
  401: 'Sign in is required to access server-saved sketches. Your local drawing is unchanged.',
  403: 'You do not have permission to access these server-saved sketches. Your local drawing is unchanged.',
  404: 'This saved sketch is unavailable. Your local drawing is unchanged.',
  503: 'Server-saved sketches are unavailable. Your local drawing and unfinished input are unchanged.',
};
async function drawLocal(page: Page, url = '/') {
  await page.goto(url);
  await page.getByRole('button', { name: 'Draw Room', exact: true }).click();
  const box = await page.getByTestId('canvas-viewport').boundingBox();
  if (!box) throw new Error('Missing drawing viewport');
  await page.mouse.move(box.x + 80, box.y + 100); await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 260, { steps: 5 }); await page.mouse.up();
  await expect(localRooms(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Select & Move', exact: true }).click();
  await localRooms(page).click(); await page.locator('#roomName').fill('Unsaved local room');
}
async function openSave(page: Page, name = 'Unfinished local save name') {
  await page.getByRole('button', { name: 'Save Sketch', exact: true }).click();
  await saveDialog(page).getByLabel('Sketch Name').fill(name);
}
async function seed(page: Page) {
  const name = 'Private synthetic sketch ' + test.info().testId;
  const result = await page.request.post('/api/floor-plans', { data: {
    name, rooms: [{ id:'private-room', name:'Private synthetic room', x:40,y:40,width:200,height:200,objects:[] }],
    createdAt:'2026-09-09T00:00:00.000Z', updatedAt:'2026-09-09T00:00:00.000Z',
  }});
  expect(result.status()).toBe(201); return { ...await result.json(), name };
}
async function expectLocal(page: Page) {
  await expect(localRooms(page)).toHaveCount(1);
  await expect(page.locator('#roomName')).toHaveValue('Unsaved local room');
  await expect(page.getByTestId('room-private-room')).toHaveCount(0);
}
test.beforeEach(async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  (page as any).authPageErrors = errors;
});
test.afterEach(async ({ page }) => expect((page as any).authPageErrors).toEqual([]));

test('normal production composition denies Save and Load while preserving a real unsaved drawing and save name', async ({ page }) => {
  await drawLocal(page, NORMAL + '/');
  const requests: { method:string; body:any }[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname === '/api/floor-plans') requests.push({method:request.method(),body:request.postDataJSON()}); });
  await openSave(page); const response = page.waitForResponse(r => new URL(r.url()).pathname === '/api/floor-plans' && r.request().method() === 'POST');
  await saveDialog(page).getByRole('button', { name:'Save Sketch',exact:true }).click();
  const denied = await response; expect(denied.status()).toBe(503);
  expect(denied.headers()['cache-control']).toContain('no-store');
  await expect(saveDialog(page).getByRole('alert')).toHaveText(messages[503]);
  await expect(saveDialog(page).getByLabel('Sketch Name')).toHaveValue('Unfinished local save name');
  const sent = requests.find(request=>request.method==='POST')!.body;
  expect(sent.rooms).toHaveLength(1); expect(sent.rooms[0].name).toBe('Unsaved local room');
  await page.screenshot({path:test.info().outputPath('authorization-save-denied.png')});
  await saveDialog(page).getByRole('button',{name:'Cancel',exact:true}).click(); await expectLocal(page);
  await page.getByRole('button',{name:'Save Sketch',exact:true}).click();
  await expect(saveDialog(page).getByLabel('Sketch Name')).toHaveValue('Unfinished local save name');
  await saveDialog(page).getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('button',{name:'Load Sketch',exact:true}).click();
  await expect(loadDialog(page).getByRole('alert')).toHaveText(messages[503]);
  await expect(loadDialog(page).getByText("You don't have any saved sketches yet.",{exact:true})).toHaveCount(0);
  await expect(loadDialog(page).getByRole('button',{name:'Load Selected Sketch',exact:true})).toBeDisabled();
  await page.screenshot({path:test.info().outputPath('authorization-load-denied.png')});
  await loadDialog(page).getByRole('button',{name:'Cancel',exact:true}).click(); await expectLocal(page);
  const forged = await page.request.get(NORMAL + '/api/floor-plans', {headers:{'x-user-id':'ownerA','x-role':'owner','x-mfp-workspace-id':'11111111-1111-4111-8111-111111111111'}});
  expect(forged.status()).toBe(503);
  expect(requests.filter(request=>request.method==='POST')).toHaveLength(1);
});

test('client distinguishes401 and403 without clearing local input or disguising denial as an empty list', async ({ page }) => {
  await drawLocal(page);
  for (const status of [401,403] as const) {
    await page.route('**/api/floor-plans', route=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({message:'Private server detail must not be displayed'})}));
    await openSave(page,'Keep this name '+status); await saveDialog(page).getByRole('button',{name:'Save Sketch',exact:true}).click();
    await expect(saveDialog(page).getByRole('alert')).toHaveText(messages[status]);
    await expect(saveDialog(page).getByLabel('Sketch Name')).toHaveValue('Keep this name '+status);
    await expect(page.getByText('Private server detail must not be displayed',{exact:true})).toHaveCount(0);
    await saveDialog(page).getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'Load Sketch',exact:true}).click();
    await expect(loadDialog(page).getByRole('alert')).toHaveText(messages[status]);
    await expect(loadDialog(page).getByText("You don't have any saved sketches yet.",{exact:true})).toHaveCount(0);
    await loadDialog(page).getByRole('button',{name:'Cancel',exact:true}).click(); await expectLocal(page);
    await page.unroute('**/api/floor-plans');
  }
});

for (const denial of [403,404] as const) test('Load rechecks a selected private record and clears cached rows after denial '+denial, async ({ page }) => {
  const plan=await seed(page); await drawLocal(page);
  await page.getByRole('button',{name:'Load Sketch',exact:true}).click();
  await loadDialog(page).getByText(plan.name,{exact:true}).click();
  let checks=0;
  await page.route('**/api/floor-plans/'+plan.id,route=>{checks++;return route.fulfill({status:denial,contentType:'application/json',body:'{}'});});
  await loadDialog(page).getByRole('button',{name:'Load Selected Sketch',exact:true}).click();
  await expect(loadDialog(page).getByRole('alert')).toHaveText(messages[denial]); expect(checks).toBe(1);
  await expect(loadDialog(page).getByText(plan.name,{exact:true})).toHaveCount(0);
  await page.route('**/api/floor-plans',route=>route.fulfill({status:401,contentType:'application/json',body:'{}'}));
  await loadDialog(page).getByRole('button',{name:'Cancel',exact:true}).click(); await expectLocal(page);
  await page.getByRole('button',{name:'Load Sketch',exact:true}).click();
  await expect(loadDialog(page).getByRole('alert')).toHaveText(messages[401]);
  await expect(loadDialog(page).getByText(plan.name,{exact:true})).toHaveCount(0);
});

test('denied rename preserves its raw name, respects composition and removes stale private previews', async ({ page }) => {
  const plan=await seed(page); await drawLocal(page);
  await page.getByRole('button',{name:'Load Sketch',exact:true}).click();
  await loadDialog(page).getByRole('button',{name:'Options for '+plan.name,exact:true}).click();
  await page.getByRole('menuitem',{name:'Rename',exact:true}).click();
  const input=loadDialog(page).getByLabel('New sketch name'); await input.fill('Preserve my unfinished rename');
  let writes=0; await page.route('**/api/floor-plans/'+plan.id,route=>{
    if(route.request().method()!=='PATCH')return route.continue();writes++;
    return route.fulfill({status:403,contentType:'application/json',body:'{}'});
  });
  await input.dispatchEvent('compositionstart'); await input.press('Enter'); expect(writes).toBe(0);
  await input.dispatchEvent('compositionend'); await input.press('Enter');
  await expect(loadDialog(page).getByRole('alert')).toHaveText(messages[403]);
  await expect(input).toHaveValue('Preserve my unfinished rename'); await expect(input).toBeEnabled();expect(writes).toBe(1);
  await expect(loadDialog(page).getByText(plan.name,{exact:true})).toHaveCount(0);
  expect((await (await page.request.get('/api/floor-plans/'+plan.id)).json()).name).toBe(plan.name);
  await page.unroute('**/api/floor-plans/'+plan.id); await input.press('Enter');
  await expect(input).toHaveCount(0); await expect(loadDialog(page).getByText('Preserve my unfinished rename',{exact:true})).toBeVisible();
  await loadDialog(page).getByRole('button',{name:'Cancel',exact:true}).click(); await expectLocal(page);
});

test('a late list response cannot repopulate private previews after a newer denied reopen', async ({ page }) => {
  const plan=await seed(page); await drawLocal(page); let calls=0,release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/api/floor-plans',async route=>{
    calls++;
    if(calls===1){await gate;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([plan])});}
    return route.fulfill({status:403,contentType:'application/json',body:'{}'});
  });
  try {
    await page.getByRole('button',{name:'Load Sketch',exact:true}).click(); await expect.poll(()=>calls).toBe(1);
    await loadDialog(page).getByRole('button',{name:'Cancel',exact:true}).click();
    await page.getByRole('button',{name:'Load Sketch',exact:true}).click();
    await expect(loadDialog(page).getByRole('alert')).toHaveText(messages[403]);
    const lateResponse=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/floor-plans' && response.status()===200);
    release(); await lateResponse;
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await expect(loadDialog(page).getByText(plan.name,{exact:true})).toHaveCount(0);
    await expect(loadDialog(page).getByRole('button',{name:'Load Selected Sketch',exact:true})).toBeDisabled();
  } finally {release();}
});
