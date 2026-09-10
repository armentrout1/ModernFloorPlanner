import { test, expect, type Page, type Locator } from '@playwright/test';
import { configureIssuer } from '../accounts/control';
import { richPhysicalSaveDraft } from '../fixtures/physicalSave';
import { capturePhysicalSaveEnvelope } from '../../shared/persistence/physicalSave';
import { account, panel, signIn, createWorkspace, selectWorkspace, physical, selectedPhysical, roomField, roomFields, commit, saveButton, savePanel, savePhysical } from './browser-helpers';

async function setup(page:Page,name='guards') { await page.goto('/physical-draft');await signIn(page);await createWorkspace(page,name); }
async function authorized(page:Page,path:string,method='GET',body?:unknown) {
  return page.evaluate(async({path,method,body})=>{
    const session=await fetch('/api/auth/session',{cache:'no-store'}).then(r=>r.json());
    const response=await fetch(path,{method,headers:{'Content-Type':'application/json','X-MFP-Request':'1','X-MFP-Context':session.contextToken,'X-MFP-Workspace-Id':session.workspace.id,'Idempotency-Key':crypto.randomUUID()},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,value:await response.json()};
  },{path,method,body});
}
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(yes=>resolve=yes);return{resolve,promise};}
test.beforeEach(async({},info)=>{await configureIssuer({subjectPrefix:'save-guards-'+info.testId.replace(/[^A-Za-z0-9_-]/g,'').slice(-40)});});

test('all visible pending families block Save with field-specific Apply/Revert and preserve committed SQL revision',async({page})=>{
  await setup(page,'all-fields');const created=await authorized(page,'/api/physical-plans','POST',capturePhysicalSaveEnvelope(richPhysicalSaveDraft()));expect(created.status).toBe(201);
  await savePanel(page).getByRole('button',{name:'Open saved plan',exact:true}).click();await savePanel(page).getByRole('button',{name:'Open separate copy',exact:true}).click();
  let writes=0;page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/physical-plans')&&r.method()==='POST')++writes;});
  async function guard(field:Locator,text:string,keyboard=false){
    await field.fill(text);const before=await selectedPhysical(page);
    if(keyboard){await saveButton(page).focus();await saveButton(page).press('Enter');}else await saveButton(page).click();
    await expect(page.getByLabel('Unfinished fields blocking Save')).toBeVisible();expect(await selectedPhysical(page)).toEqual(before);expect(writes).toBe(0);
    const row=savePanel(page).getByRole('button',{name:/^Revert pending /});expect(await row.count()).toBe(1);await row.click();expect(writes).toBe(0);
  }
  await guard(page.getByRole('textbox',{name:'Level name',exact:true}),'Pending main level');
  await guard(roomField(page,'Length'),'13 ft');
  await guard(roomField(page,'Ceiling height'),'9 ft',true);
  await page.getByTestId('physical-opening-list-door').click();await guard(page.getByTestId('physical-opening-inspector').getByLabel('Door height',{exact:true}),'7 ft -');
  await page.getByRole('combobox',{name:'Editing level',exact:true}).selectOption('upper-level');
  await page.getByTestId('physical-opening-list-window').click();await guard(page.getByTestId('physical-opening-inspector').getByLabel('Window height',{exact:true}),'3 ft -');
  await page.getByTestId('physical-stair-list-stair').click();await guard(page.getByTestId('physical-stair-inspector').getByLabel('Stair width (ft)',{exact:true}),'3 ft -');
  await guard(page.getByTestId('physical-endpoint-upper').getByLabel('Upper X (ft)',{exact:true}),'2 ft -');
  await guard(page.getByTestId('physical-landing-upper').getByLabel('Landing depth (ft)',{exact:true}),'3 ft -');
  await page.getByTestId('physical-surface-opening-list-hole').click();await guard(page.getByTestId('physical-surface-opening-inspector').getByLabel('Opening width (ft)',{exact:true}),'4 ft -');
  await guard(page.getByTestId('physical-surface-opening-inspector').getByLabel('Opening X (ft)',{exact:true}),'2 ft -');
  await page.getByRole('region',{name:'Room layout on editing level',exact:true}).getByRole('button',{name:'Select zone: Kitchen zone',exact:true}).click();await guard(page.getByLabel('Zone width (ft)',{exact:true}),'5 ft -');
  await guard(page.getByLabel('Zone name',{exact:true}),'Pending zone name');
  await page.getByRole('region',{name:'Room layout on editing level',exact:true}).getByRole('button',{name:'Select cabinet: Fixed island',exact:true}).click();await guard(page.getByLabel('Cabinet depth (ft)',{exact:true}),'3 ft -');
  await guard(page.getByLabel('Cabinet name',{exact:true}),'Pending cabinet name');
  const takeoff=page.getByTestId('takeoff-panel');await takeoff.getByRole('combobox',{name:'Configure work',exact:true}).selectOption('floor-area');await guard(takeoff.getByLabel('Waste percentage',{exact:true}),'11.');
  const current=await authorized(page,'/api/physical-plans/'+created.value.planId);expect(current.value.revisionId).toBe(created.value.revisionId);expect(current.value.envelope).toEqual(created.value.envelope);expect(writes).toBe(0);
  await page.screenshot({path:test.info().outputPath('save-pending-fields-guard.png'),fullPage:true});
});

test('pending room-level assignment blocks Save without changing ownership and offers explicit Revert',async({page})=>{
  await setup(page,'level-proposal');await physical(page);await page.getByRole('button',{name:'Add level',exact:true}).click();await page.getByRole('combobox',{name:'Editing level',exact:true}).selectOption({label:'Main floor'});
  const assignment=roomFields(page).getByRole('combobox',{name:'Room level',exact:true});await assignment.selectOption({label:'Level 2'});const before=await selectedPhysical(page);
  await saveButton(page).click();await expect(savePanel(page)).toContainText('use Assign room or Revert room level before saving');expect(await selectedPhysical(page)).toEqual(before);
  await page.getByRole('button',{name:'Revert room level',exact:true}).click();await expect(assignment).not.toHaveValue(await page.getByRole('combobox',{name:'Editing level',exact:true}).locator('option').last().getAttribute('value')??'');
  await savePhysical(page);
});

test('edits during actual committed save stay unsaved; next revision contains those edits',async({page})=>{
  await setup(page,'inflight');await physical(page,'Before save');const submitted=await selectedPhysical(page),received=deferred(),release=deferred();let saved:any;
  await page.route('**/api/physical-plans',async route=>{if(route.request().method()!=='POST')return route.continue();const response=await route.fetch();saved=await response.json();received.resolve();await release.promise;await route.fulfill({response});});
  await saveButton(page).click();await received.promise;await expect(page.getByTestId('physical-save-status')).toHaveText('Saving…');
  await commit(roomField(page,'Ceiling height'),'9 ft');const newer=await selectedPhysical(page);expect(newer.localEditRevision).toBeGreaterThan(submitted.localEditRevision);release.resolve();
  await expect(page.getByTestId('physical-save-status')).toHaveText('Unsaved changes');await expect(roomField(page,'Ceiling height')).toHaveValue('9 ft');
  expect(saved.envelope.document.rooms[0].ceilingHeight.valueMm).toBeCloseTo(8*304.8);await page.unroute('**/api/physical-plans');
  const next=await savePhysical(page);expect(next.revisionNumber).toBe(2);expect(next.envelope.document.rooms[0].ceilingHeight.valueMm).toBeCloseTo(9*304.8);
  const old=await authorized(page,`/api/physical-plans/${saved.planId}/revisions/${saved.revisionId}`);expect(old.value.envelope).toEqual(saved.envelope);
});

test('response loss after SQL commit retries same payload and key without creating another plan',async({page})=>{
  await setup(page,'lost-response');await physical(page,'Lost response original');let first=true;const requests:{key:string|undefined;body:string|null}[]=[];
  await page.route('**/api/physical-plans',async route=>{
    if(route.request().method()!=='POST')return route.continue();requests.push({key:route.request().headers()['idempotency-key'],body:route.request().postData()});
    const response=await route.fetch();expect(response.status()).toBe(201);if(first){first=false;await route.abort('failed');}else await route.fulfill({response});
  });
  await saveButton(page).click();await expect(page.getByTestId('physical-save-status')).toContainText('Save failed');
  await roomFields(page).getByLabel('Room name',{exact:true}).fill('Newer local name');const current=await selectedPhysical(page);
  await savePanel(page).getByRole('button',{name:'Retry same save request',exact:true}).click();await expect(page.getByTestId('physical-save-status')).toHaveText('Unsaved changes');
  expect(requests).toHaveLength(2);expect(requests[1]).toEqual(requests[0]);expect(await selectedPhysical(page)).toEqual(current);
  const list=await authorized(page,'/api/physical-plans');expect(list.value.plans).toHaveLength(1);expect(list.value.plans[0].revisionNumber).toBe(1);
  await page.unroute('**/api/physical-plans');const saved=await savePhysical(page);expect(saved.revisionNumber).toBe(2);expect(saved.envelope.document.rooms[0].name).toBe('Newer local name');
});

test('late SQL Save response after logout cannot repaint prior private revision or modify unassigned draft',async({page})=>{
  await setup(page,'late-logout');await physical(page,'Private old account');const old=await selectedPhysical(page),received=deferred(),release=deferred();
  await page.route('**/api/physical-plans',async route=>{if(route.request().method()!=='POST')return route.continue();const response=await route.fetch();expect(response.status()).toBe(201);received.resolve();await release.promise;try{await route.fulfill({response});}catch{/* Browser aborts old generation. */}});
  await saveButton(page).click();await received.promise;await account(page);await panel(page).getByRole('button',{name:'Sign out',exact:true}).click();release.resolve();
  await expect(page.getByTestId('physical-saved-revision')).toHaveCount(0);await expect(page.getByText('Private old account',{exact:true})).toHaveCount(0);
  await panel(page).getByRole('button',{name:'Resume unassigned local-only work',exact:true}).click();await expect(page.getByTestId('physical-draft-id')).toHaveCount(0);
  await page.getByRole('button',{name:'New physical draft',exact:true}).click();expect((await selectedPhysical(page)).id).not.toBe(old.id);await expect(page.getByTestId('physical-save-status')).toHaveText('Local-only');
});


test('late Save after switching workspaces cannot acknowledge another draft and both local contexts survive',async({page})=>{
  await page.goto('/physical-draft');await signIn(page);const a=await createWorkspace(page,'late-workspace-A');await physical(page,'Workspace A pending save');
  const original=await selectedPhysical(page),received=deferred(),release=deferred();
  await page.route('**/api/physical-plans',async route=>{if(route.request().method()!=='POST')return route.continue();const response=await route.fetch();expect(response.status()).toBe(201);received.resolve();await release.promise;try{await route.fulfill({response});}catch{/* Old generation may already be aborted. */}});
  await saveButton(page).click();await received.promise;
  const b=await createWorkspace(page,'late-workspace-B');await expect(page.getByTestId('physical-draft-id')).toHaveCount(0);await physical(page,'Workspace B untouched');const other=await selectedPhysical(page);
  release.resolve();await expect(page.getByTestId('physical-save-status')).toHaveText('Local-only');await expect(page.getByTestId('physical-saved-revision')).toHaveCount(0);expect(await selectedPhysical(page)).toEqual(other);
  await selectWorkspace(page,a.id);expect(await selectedPhysical(page)).toEqual(original);await expect(page.getByTestId('physical-saved-revision')).toHaveCount(0);
  await selectWorkspace(page,b.id);expect(await selectedPhysical(page)).toEqual(other);await expect(page.getByTestId('physical-save-status')).toHaveText('Local-only');
});
