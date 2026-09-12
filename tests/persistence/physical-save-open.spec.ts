import { test, expect, type Page } from '@playwright/test';
import { configureIssuer } from '../accounts/control';
import { signIn,createWorkspace,selectWorkspace,physical,roomField,commit,selectedPhysical,savePanel,saveButton,savePhysical,schemaFive } from './browser-helpers';
import { capturePhysicalSaveEnvelope } from '../../shared/persistence/physicalSave';
import { api, counts } from '../autosave/helpers';

// Every primary drawing below is constructed through the compiled UI. OIDC,
// cookies, authorization routes and durable PostgreSQL are the normal composition.
test.beforeEach(async({},info)=>configureIssuer({subjectPrefix:'save-browser-'+info.testId.replace(/[^A-Za-z0-9_-]/g,'').slice(-40)}));
async function bindingFor(p:Page,draftId:string){
 return p.evaluate(id=>{
  const context=sessionStorage.getItem('modern-floor-planner:working-context:v1');
  const key=`modern-floor-planner:context:v1:${context}:modern-floor-planner:physical-save-bindings:v1`;
  return JSON.parse(sessionStorage.getItem(key)??'{"bindings":{}}').bindings[id];
 },draftId);
}
async function openFirst(p:Page){await savePanel(p).getByRole('button',{name:'Open saved plan',exact:true}).click();await savePanel(p).getByRole('button',{name:'Open separate copy',exact:true}).first().click();await expect(savePanel(p)).toContainText('Opened a separate local copy.');await expect(p.getByTestId('physical-save-status')).toHaveText(/^Saved revision /);}

test('real sign-in, explicit schema5 Save/Open and fresh empty browser context retrieve SQL content',async({page,browser})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/physical-draft');await signIn(page);const workspace=await createWorkspace(page,'SaveOpen');
 await physical(page,'Saved room');await schemaFive(page);const original=await selectedPhysical(page);const saved=await savePhysical(page);
 expect(saved.envelope).toEqual(capturePhysicalSaveEnvelope(original));expect(saved.envelope.document.schemaVersion).toBe(5);
 await savePanel(page).scrollIntoViewIfNeeded();await page.screenshot({path:test.info().outputPath('physical-save-success.png'),fullPage:true});
 await openFirst(page);const opened=await selectedPhysical(page);expect(opened.id).not.toBe(original.id);expect(capturePhysicalSaveEnvelope(opened)).toEqual(saved.envelope);
 const fresh=await browser.newContext({baseURL:process.env.MFP_ACCOUNTS_APP_ORIGIN});try{
  const p=await fresh.newPage();await p.goto('/physical-draft');expect(await p.evaluate(()=>Object.entries(sessionStorage).filter(([k])=>k.includes('editor-draft')).length)).toBe(0);
  await signIn(p);await selectWorkspace(p,workspace.id);await expect(p.getByTestId('physical-draft-id')).toHaveCount(0);
  const read=p.waitForResponse(r=>new URL(r.url()).pathname===`/api/physical-plans/${saved.planId}`&&r.request().method()==='GET');await openFirst(p);expect((await read).status()).toBe(200);
  expect(capturePhysicalSaveEnvelope(await selectedPhysical(p))).toEqual(saved.envelope);await expect(roomField(p,'Length')).toHaveValue('12 ft');
  await savePanel(p).scrollIntoViewIfNeeded();await p.screenshot({path:test.info().outputPath('physical-open-fresh-session.png'),fullPage:true});
 }finally{await fresh.close();}expect(errors).toEqual([]);
});

test('two real browser clients conflict visibly and preserve the candidate while opening latest separately',async({page,browser})=>{
 await page.goto('/physical-draft');await signIn(page);const workspace=await createWorkspace(page,'Conflict');await physical(page,'Shared room');await schemaFive(page);const first=await savePhysical(page);
 const context=await browser.newContext({baseURL:process.env.MFP_ACCOUNTS_APP_ORIGIN});try{
  const p=await context.newPage();await p.goto('/physical-draft');await signIn(p);await selectWorkspace(p,workspace.id);await openFirst(p);const candidateId=(await selectedPhysical(p)).id;
  await commit(roomField(page,'Ceiling height'),'9 ft');const second=await savePhysical(page);expect(second.revisionNumber).toBe(2);
  await commit(roomField(p,'Ceiling height'),'10 ft');const candidateDraft=await selectedPhysical(p),candidate=capturePhysicalSaveEnvelope(candidateDraft),oldBinding=await bindingFor(p,candidateId);
  expect(oldBinding.planId).toBe(first.planId);expect(oldBinding.revisionId).toBe(first.revisionId);expect(oldBinding.etag).toBe(first.etag);
  const uiPosts:string[]=[];p.on('request',request=>{if(request.method()==='POST'&&new URL(request.url()).pathname===`/api/physical-plans/${first.planId}/revisions`)uiPosts.push(request.url());});
  // The durable coordinator detects a definitely-unsent stale base through a real authorized GET before POST.
  const currentRead=p.waitForResponse(r=>r.request().method()==='GET'&&new URL(r.url()).pathname===`/api/physical-plans/${first.planId}`);
  await saveButton(p).click();const currentResponse=await currentRead;expect(currentResponse.status()).toBe(200);expect((await currentResponse.json()).revisionId).toBe(second.revisionId);
  await expect(p.getByTestId('physical-save-status')).toContainText('Conflict');expect(await selectedPhysical(p)).toEqual(candidateDraft);
  expect(capturePhysicalSaveEnvelope(await selectedPhysical(p))).toEqual(candidate);expect(await bindingFor(p,candidateId)).toEqual(oldBinding);expect(uiPosts).toEqual([]);
  expect(await counts(first.planId)).toEqual({revisions:2,receipts:2});
  // Retain independent server enforcement: authenticated exact stale candidate/base still receives 412.
  const rejected=await api(p,`/api/physical-plans/${first.planId}/revisions`,'POST',candidate,{'Idempotency-Key':crypto.randomUUID(),'If-Match':first.etag});
  expect(rejected.status).toBe(412);expect(rejected.value.code).toBe('REVISION_CONFLICT');expect(await counts(first.planId)).toEqual({revisions:2,receipts:2});
  const currentAfterReject=await api(p,`/api/physical-plans/${first.planId}`);expect(currentAfterReject.status).toBe(200);
  expect(currentAfterReject.value.revisionId).toBe(second.revisionId);expect(currentAfterReject.value.etag).toBe(second.etag);expect(currentAfterReject.value.envelope).toEqual(second.envelope);
  expect(await selectedPhysical(p)).toEqual(candidateDraft);expect(await bindingFor(p,candidateId)).toEqual(oldBinding);
  await savePanel(p).scrollIntoViewIfNeeded();await p.screenshot({path:test.info().outputPath('physical-save-conflict.png'),fullPage:true});
  await savePanel(p).getByRole('button',{name:'Open latest as separate copy',exact:true}).click();await expect(p.getByTestId('physical-save-status')).toHaveText('Saved revision 2');await expect(roomField(p,'Ceiling height')).toHaveValue('9 ft');
  await p.getByRole('combobox',{name:'Selected physical draft',exact:true}).selectOption(candidateId);expect(capturePhysicalSaveEnvelope(await selectedPhysical(p))).toEqual(candidate);
  const create=p.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname==='/api/physical-plans');await savePanel(p).getByRole('button',{name:'Save candidate as new plan',exact:true}).click();const copy=await(await create).json();expect(copy.planId).not.toBe(first.planId);expect(copy.envelope).toEqual(candidate);
 }finally{await context.close();}
});

test('opening a server plan preserves a different draft with unfinished text and no implicit upload',async({page})=>{
 const uploads:string[]=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/physical-plans')&&r.method()==='POST')uploads.push(r.url());});
 await page.goto('/physical-draft');await signIn(page);await createWorkspace(page,'PreserveOpen');await physical(page);const saved=await savePhysical(page);await physical(page,'Unsaved second room');await roomField(page,'Length').fill('7 ft -');const candidate=await selectedPhysical(page);
 await openFirst(page);expect((await selectedPhysical(page)).id).not.toBe(candidate.id);expect(uploads).toHaveLength(1);
 await page.getByRole('combobox',{name:'Selected physical draft',exact:true}).selectOption(candidate.id);await expect(roomField(page,'Length')).toHaveValue('7 ft -');expect((await selectedPhysical(page)).document).toEqual(candidate.document);expect(saved.planId).toBeTruthy();
});
