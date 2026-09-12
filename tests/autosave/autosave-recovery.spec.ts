import {test,expect} from '@playwright/test';
import {configureIssuer} from '../accounts/control';
import {capturePhysicalSaveEnvelope} from '../../shared/persistence/physicalSave';
import {richPhysicalSaveDraft} from '../fixtures/physicalSave';
import {setup,autosave,recoveryStatus,counts,api,roomField,roomFields,commit,selectedPhysical,savePanel,saveButton,
  signIn,selectWorkspace,closeAccount,openFirst,resumeLocal,discoverResume,deferred,account,panel,membership,quantity,setAutosave,branchForSelected} from './helpers';

test.beforeEach(async({},info)=>configureIssuer({subjectPrefix:'autosave-'+info.testId.replace(/[^A-Za-z0-9_-]/g,'').slice(-40)}));

test('A: explicit first Save and opt-in produce one immutable height revision, retrieved by a fresh authorized browser',async({page,browser})=>{
  const {saved,workspace}=await setup(page,'ceiling');
  await expect(autosave(page)).not.toBeChecked();await setAutosave(page);
  await commit(roomField(page,'Ceiling height'),'9 ft');
  await expect(page.getByTestId('physical-save-status')).toHaveText('Saved revision 2');
  expect(await counts(saved.planId)).toEqual({revisions:2,receipts:2});
  const old=await api(page,`/api/physical-plans/${saved.planId}/revisions/${saved.revisionId}`);
  expect(old.value.envelope).toEqual(saved.envelope);
  expect(old.value.envelope.document.rooms[0].ceilingHeight.valueMm).toBeCloseTo(8*304.8);
  await savePanel(page).scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath('autosave-acknowledged.png'),fullPage:true});
  const fresh=await browser.newContext({baseURL:process.env.MFP_ACCOUNTS_APP_ORIGIN});
  try{
    const p=await fresh.newPage();await p.goto('/physical-draft');
    expect(await p.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.includes('editor-draft')))).toEqual([]);
    await signIn(p);await selectWorkspace(p,workspace.id);await openFirst(p);
    await expect(roomField(p,'Ceiling height')).toHaveValue('9 ft');
    const read=await api(p,'/api/physical-plans/'+saved.planId);
    expect(read.value.envelope.document.rooms[0].ceilingHeight.valueMm).toBeCloseTo(9*304.8);
    expect(quantity(read.value,'gross-wall-area').net).toBeCloseTo(396,8);
    expect(quantity(old.value,'gross-wall-area').net).toBeCloseTo(352,8);
    expect(quantity(read.value,'floor-area').net).toBeCloseTo(120,8);
    expect(quantity(read.value,'ceiling-area').net).toBeCloseTo(120,8);
    await expect(autosave(p)).not.toBeChecked();
  }finally{await fresh.close();}
});

test('B/K: rapid commits coalesce and view/no-op/off changes create no server revisions',async({page})=>{
 const{saved}=await setup(page,'coalesce',{extraLevel:true});await setAutosave(page);
 await commit(roomField(page,'Ceiling height'),'9 ft');await commit(roomField(page,'Ceiling height'),'10 ft');await commit(roomField(page,'Ceiling height'),'11 ft');
 await expect(page.getByTestId('physical-save-status')).toHaveText('Saved revision 2');
 expect((await api(page,'/api/physical-plans/'+saved.planId)).value.envelope.document.rooms[0].ceilingHeight.valueMm).toBeCloseTo(11*304.8);
 await commit(roomField(page,'Ceiling height'),'11 ft');
 const beforeNavigation=await selectedPhysical(page),envelope=capturePhysicalSaveEnvelope(beforeNavigation);
 if(beforeNavigation.document.schemaVersion===2)throw Error('The public fixture must include building levels.');
 const main=beforeNavigation.levelView!.activeLevelId,other=beforeNavigation.document.buildingLevels.levels.find(level=>level.id!==main)!;
 expect(other).toBeTruthy();
 await page.getByRole('tab',{name:'Drawing',exact:true}).click();
 const drawing=page.getByRole('region',{name:'Physical drawing',exact:true}),canvas=page.getByTestId('physical-canvas');
 await drawing.getByRole('button',{name:'Fit drawing',exact:true}).click();
 const room=page.getByTestId('physical-room-'+beforeNavigation.document.rooms[0].id),originalWidth=(await room.boundingBox())!.width;
 await drawing.getByRole('button',{name:'Zoom in',exact:true}).click();
 await expect.poll(async()=>(await room.boundingBox())!.width).toBeGreaterThan(originalWidth);
 const beforePan=await canvas.evaluate(node=>({x:node.scrollLeft,y:node.scrollTop}));
 await canvas.hover();await page.mouse.wheel(160,120);
 await expect.poll(()=>canvas.evaluate(node=>({x:node.scrollLeft,y:node.scrollTop}))).not.toEqual(beforePan);
 await drawing.getByRole('button',{name:'Zoom out',exact:true}).click();
 await expect.poll(async()=>(await room.boundingBox())!.width).toBeCloseTo(originalWidth,1);
 await page.getByRole('combobox',{name:'Editing level',exact:true}).selectOption(other.id);
 await expect(page.getByTestId('physical-view')).toHaveAttribute('data-active-level-id',other.id);
 await expect(room).toHaveCount(0);
 await page.getByRole('combobox',{name:'Editing level',exact:true}).selectOption(main);
 await expect(page.getByTestId('physical-view')).toHaveAttribute('data-active-level-id',main);
 await expect(room).toBeVisible();
 await page.setViewportSize({width:820,height:1100});
 const drawer=page.getByRole('dialog',{name:/^Edit room:/});
 if(await drawer.isVisible())await drawer.getByRole('button',{name:'Close inspector',exact:true}).click();
 await page.getByRole('button',{name:/^Edit selected room:/}).click();await expect(drawer).toBeVisible();
 await expect(drawer.getByLabel('Ceiling height (ft)',{exact:true})).toHaveValue('11 ft');
 await drawer.getByRole('button',{name:'Close inspector',exact:true}).click();await expect(drawer).toBeHidden();
 await page.setViewportSize({width:1600,height:1100});
 await expect(autosave(page)).toBeChecked();
 expect(capturePhysicalSaveEnvelope(await selectedPhysical(page))).toEqual(envelope);
 await page.evaluate(()=>{window.dispatchEvent(new Event('focus'));});
 await page.waitForTimeout(1800);expect(await counts(saved.planId)).toEqual({revisions:2,receipts:2});
 await setAutosave(page,false);await commit(roomField(page,'Ceiling height'),'12 ft');
 await page.waitForTimeout(1800);expect(await counts(saved.planId)).toEqual({revisions:2,receipts:2});
 await saveButton(page).click();await expect(page.getByTestId('physical-save-status')).toHaveText('Saved revision 3');
 expect(await counts(saved.planId)).toEqual({revisions:3,receipts:3});
});

test('C: raw text and original unit survive same-profile recovery; explicit Apply saves without measurement confirmation',async({page,context})=>{
 const{saved}=await setup(page,'raw-recovery');await setAutosave(page);
 await roomField(page,'Ceiling height').fill('9 ft -');const original=await selectedPhysical(page);const recoveryBranch=await branchForSelected(page);
 await expect(recoveryStatus(page)).toContainText(/Local checkpoint saved/i);await page.waitForTimeout(1800);
 expect(await counts(saved.planId)).toEqual({revisions:1,receipts:1});
 // A new page in the same profile shares IndexedDB but starts with empty sessionStorage.
 const p=await context.newPage();try{
  await p.goto('/physical-draft');await discoverResume(p,recoveryBranch);
  await expect(roomField(p,'Ceiling height')).toHaveValue('9 ft -');
  const resumed=await selectedPhysical(p);expect(resumed.fields).toEqual(original.fields);expect(resumed.events).toEqual(original.events);
  expect(resumed.document).toEqual(original.document);expect(resumed.request).toEqual(original.request);
  await expect(p.getByRole('group',{name:'Committed edit history'}).getByRole('button',{name:/^Undo(?: |$)/})).toBeDisabled();
  await savePanel(p).getByRole('button',{name:/^Revert pending .*ceiling/i}).click();
  await roomField(p,'Ceiling height').fill('9 ft');await savePanel(p).getByRole('button',{name:/^Apply pending .*ceiling/i}).click();
  await expect(p.getByTestId('physical-save-status')).toHaveText('Saved revision 2');
  const current=(await api(p,'/api/physical-plans/'+saved.planId)).value;
  expect(current.envelope.document.rooms[0].ceilingHeight.provenance.confirmation).toEqual(saved.envelope.document.rooms[0].ceilingHeight.provenance.confirmation);
  expect(current.envelope.request).toEqual(saved.envelope.request);expect(await counts(saved.planId)).toEqual({revisions:2,receipts:2});
 }finally{await p.close();}
});

test('D: delayed acknowledgement preserves newer raw and committed edits and sends the later candidate once',async({page})=>{
 const{saved}=await setup(page,'inflight-auto');await setAutosave(page);
 const received=deferred(),release=deferred();let first=true;
 await page.route('**/api/physical-plans/*/revisions',async route=>{
  const response=await route.fetch();if(first){first=false;received.resolve();await release.promise;}await route.fulfill({response});
 });
 await commit(roomField(page,'Ceiling height'),'9 ft');await received.promise;
 await commit(roomField(page,'Ceiling height'),'10 ft');await roomField(page,'Width').fill('10 ft -');const newer=await selectedPhysical(page);
 release.resolve();await expect(page.getByTestId('physical-saved-revision')).toContainText('2');
 await expect(page.getByTestId('physical-save-status')).not.toHaveText('Saved revision 2');
 expect(await selectedPhysical(page)).toEqual(newer);await page.waitForTimeout(1800);
 expect(await counts(saved.planId)).toEqual({revisions:2,receipts:2});
 await savePanel(page).getByRole('button',{name:/^Revert pending .*width/i}).click();
 await expect(page.getByTestId('physical-save-status')).toHaveText('Saved revision 3');
 expect(await counts(saved.planId)).toEqual({revisions:3,receipts:3});
 expect((await api(page,'/api/physical-plans/'+saved.planId)).value.envelope.document.rooms[0].ceilingHeight.valueMm).toBeCloseTo(10*304.8);
});

test('E: endpoint unavailable, same-profile reload recovery and restored connectivity save exactly once',async({page})=>{
 const{saved}=await setup(page,'endpoint-unavailable');await setAutosave(page);
 await page.route('**/api/physical-plans/*/revisions',route=>route.abort('connectionfailed'));
 await commit(roomField(page,'Ceiling height'),'9 ft');await expect(page.getByTestId('physical-save-status')).toContainText(/failed/i);
 await expect(recoveryStatus(page)).toContainText(/Local checkpoint saved/i);await savePanel(page).scrollIntoViewIfNeeded();
 await page.screenshot({path:test.info().outputPath('autosave-unsent-checkpoint.png'),fullPage:true});
 const recoveryBranch=await branchForSelected(page);await page.reload();await discoverResume(page,recoveryBranch);await expect(roomField(page,'Ceiling height')).toHaveValue('9 ft');
 expect(await counts(saved.planId)).toEqual({revisions:1,receipts:1});
 await page.unroute('**/api/physical-plans/*/revisions');
 await savePanel(page).getByRole('button',{name:'Retry same save request',exact:true}).click();
 await expect(page.getByTestId('physical-save-status')).toHaveText('Saved revision 2');
 expect(await counts(saved.planId)).toEqual({revisions:2,receipts:2});
});

test('F/G: committed response lost, reload retains exact receipt intent then orders newer edits',async({page})=>{
 const{saved}=await setup(page,'receipt-replay');await setAutosave(page);
 const requests:{key:string,body:string|null,base:string}[]=[];const accepted=deferred();let lost=true;
 await page.route('**/api/physical-plans/*/revisions',async route=>{
  const req=route.request();requests.push({key:req.headers()['idempotency-key'],body:req.postData(),base:req.headers()['if-match']});
  const response=await route.fetch();if(lost){accepted.resolve();await route.abort('failed');}else await route.fulfill({response});
 });
 await commit(roomField(page,'Ceiling height'),'9 ft');await accepted.promise;await setAutosave(page,false);
 await commit(roomField(page,'Ceiling height'),'10 ft');await expect(recoveryStatus(page)).toContainText(/Local checkpoint saved/i);
 expect(await counts(saved.planId)).toEqual({revisions:2,receipts:2});
 const recoveryBranch=await branchForSelected(page);await page.reload();await discoverResume(page,recoveryBranch);lost=false;
 await savePanel(page).getByRole('button',{name:'Retry same save request',exact:true}).click();
 await expect(page.getByTestId('physical-saved-revision')).toContainText('2');
 expect(requests.at(-1)).toEqual(requests[0]);expect(await counts(saved.planId)).toEqual({revisions:2,receipts:2});
 await expect(roomField(page,'Ceiling height')).toHaveValue('10 ft');
 await setAutosave(page);await expect(page.getByTestId('physical-save-status')).toHaveText('Saved revision 3');
 expect(requests.at(-1)!.key).not.toBe(requests[0].key);expect(await counts(saved.planId)).toEqual({revisions:3,receipts:3});
});

test('H: definitely-unsent recovered branch conflicts against another browser advance without rebasing',async({page,browser})=>{
 const{saved,workspace}=await setup(page,'unsent-conflict');
 await commit(roomField(page,'Ceiling height'),'10 ft');await expect(recoveryStatus(page)).toContainText(/Local checkpoint saved/i);
 const candidate=capturePhysicalSaveEnvelope(await selectedPhysical(page));const recoveryBranch=await branchForSelected(page);
 const fresh=await browser.newContext({baseURL:process.env.MFP_ACCOUNTS_APP_ORIGIN});try{
  const p=await fresh.newPage();await p.goto('/physical-draft');await signIn(p);await selectWorkspace(p,workspace.id);await openFirst(p);
  await commit(roomField(p,'Ceiling height'),'9 ft');await saveButton(p).click();await expect(p.getByTestId('physical-save-status')).toHaveText('Saved revision 2');
  await page.reload();await discoverResume(page,recoveryBranch);await expect(page.getByTestId('physical-save-status')).toContainText(/conflict/i);
  expect(capturePhysicalSaveEnvelope(await selectedPhysical(page))).toEqual(candidate);expect(await counts(saved.planId)).toEqual({revisions:2,receipts:2});
  await savePanel(page).scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath('autosave-recovery-conflict.png'),fullPage:true});
 }finally{await fresh.close();}
});

test('I: logout with an uncertain request hides recovery from B and rightful A may explicitly resume',async({page})=>{
 const{saved,workspace}=await setup(page,'identity-recovery');await setAutosave(page);let lost=true;
 await page.route('**/api/physical-plans/*/revisions',async route=>{const response=await route.fetch();if(lost)await route.abort('failed');else await route.fulfill({response});});
 await commit(roomField(page,'Ceiling height'),'9 ft');await expect(page.getByTestId('physical-save-status')).toContainText(/failed/i);
 await setAutosave(page,false);await expect(recoveryStatus(page)).toContainText(/Local checkpoint saved/i);
 const recoveryBranch=await branchForSelected(page);await account(page);await panel(page).getByRole('button',{name:'Sign out',exact:true}).click();await signIn(page,'B');
 await closeAccount(page);
 await expect(page.getByTestId('physical-saved-revision')).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Resume recovery',exact:true})).toHaveCount(0);
 await account(page);await panel(page).getByRole('button',{name:'Sign out',exact:true}).click();await signIn(page,'A');await selectWorkspace(page,workspace.id);
 await discoverResume(page,recoveryBranch);lost=false;await savePanel(page).getByRole('button',{name:'Retry same save request',exact:true}).click();
 await expect(page.getByTestId('physical-save-status')).toHaveText('Saved revision 2');expect(await counts(saved.planId)).toEqual({revisions:2,receipts:2});
});

test('I: current viewer and revoked permissions block pending autosave transmission',async({page})=>{
 const{saved,workspace}=await setup(page,'permission-pause');await setAutosave(page);
 const principal=await page.evaluate(async()=> (await fetch('/api/auth/session').then(r=>r.json())).principal.id);
 await membership(workspace.id,principal,{role:'viewer'});
 await commit(roomField(page,'Ceiling height'),'9 ft');
 await expect(page.getByTestId('physical-save-status')).not.toHaveText('Saved revision 2');await page.waitForTimeout(2000);
 expect(await counts(saved.planId)).toEqual({revisions:1,receipts:1});
 await membership(workspace.id,principal,{status:'revoked'});
 await page.reload();await expect(page.getByRole('button',{name:'Resume recovery',exact:true})).toHaveCount(0);
 expect(await counts(saved.planId)).toEqual({revisions:1,receipts:1});
});

test('J: independent same-profile pages preserve distinct branches and concurrent server writes conflict',async({page,context})=>{
 const{saved}=await setup(page,'two-branches');const p=await context.newPage();try{
  await p.goto('/physical-draft');await resumeLocal(p);await openFirst(p);
  await commit(roomField(page,'Ceiling height'),'9 ft');await commit(roomField(p,'Ceiling height'),'10 ft');
  await expect(recoveryStatus(page)).toContainText(/Local checkpoint saved/i);await expect(recoveryStatus(p)).toContainText(/Local checkpoint saved/i);
  await saveButton(page).click();await expect(page.getByTestId('physical-save-status')).toHaveText('Saved revision 2');
  await saveButton(p).click();await expect(p.getByTestId('physical-save-status')).toContainText(/conflict/i);
  await expect(roomField(page,'Ceiling height')).toHaveValue('9 ft');await expect(roomField(p,'Ceiling height')).toHaveValue('10 ft');
  expect(await counts(saved.planId)).toEqual({revisions:2,receipts:2});
 }finally{await p.close();}
});

test('L: denied IndexedDB prevents autosave but explicit Save remains available with honest local warning',async({page})=>{
 await page.addInitScript(()=>{IDBFactory.prototype.open=function(){throw new DOMException('Synthetic storage denial','SecurityError');};});
 const{saved}=await setup(page,'denied-journal');await expect(recoveryStatus(page)).toContainText(/unavailable/i);
 await autosave(page).click();await expect(recoveryStatus(page)).toContainText(/unavailable/i);await commit(roomField(page,'Ceiling height'),'9 ft');await page.waitForTimeout(2000);
 expect(await counts(saved.planId)).toEqual({revisions:1,receipts:1});await expect(roomField(page,'Ceiling height')).toHaveValue('9 ft');
 await saveButton(page).click();await expect(page.getByTestId('physical-save-status')).toHaveText('Saved revision 2');
 await expect(recoveryStatus(page)).toContainText(/unavailable/i);expect(await counts(saved.planId)).toEqual({revisions:2,receipts:2});
});

test('M: rich schema5 request/evidence and 252 + 25.2 = 277.2 survive journal recovery and authorized append',async({page})=>{
 await page.goto('/physical-draft');await signIn(page);
 const {createWorkspace}=await import('./helpers');await createWorkspace(page,'rich-recovery');
 const envelope=capturePhysicalSaveEnvelope(richPhysicalSaveDraft());
 const created=await api(page,'/api/physical-plans','POST',envelope,{'Idempotency-Key':crypto.randomUUID()});expect(created.status).toBe(201);
 await openFirst(page);await setAutosave(page);await roomField(page,'Ceiling height').fill('9 ft -');
 await expect(recoveryStatus(page)).toContainText(/Local checkpoint saved/i);const before=await selectedPhysical(page);const recoveryBranch=await branchForSelected(page);
 await page.reload();await discoverResume(page,recoveryBranch);const recovered=await selectedPhysical(page);
 expect(recovered.document).toEqual(before.document);expect(recovered.request).toEqual(before.request);expect(recovered.fields).toEqual(before.fields);
 for(const [key,value] of [['net',252],['allowance',25.2],['adjusted',277.2]] as const)expect(quantity(created.value,'floor-area')[key]).toBeCloseTo(value,8);
 await savePanel(page).getByRole('button',{name:/^Revert pending .*ceiling/i}).click();
 expect(capturePhysicalSaveEnvelope(await selectedPhysical(page))).toEqual(envelope);
 await commit(roomField(page,'Ceiling height'),'9 ft');await expect(page.getByTestId('physical-save-status')).toHaveText('Saved revision 2');
 const current=(await api(page,'/api/physical-plans/'+created.value.planId)).value;
 expect(current.envelope.document.layoutContract.zones).toEqual(envelope.document.layoutContract.zones);
 expect(current.envelope.document.layoutContract.cabinetBlocks).toEqual(envelope.document.layoutContract.cabinetBlocks);
 expect(current.envelope.request).toEqual(envelope.request);
 expect(await counts(created.value.planId)).toEqual({revisions:2,receipts:2});
});