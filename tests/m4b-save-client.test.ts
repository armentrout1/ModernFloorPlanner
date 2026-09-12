import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingSaveFields } from '../client/src/features/physical-draft/pendingSaveFields';
import { createPhysicalSaveManager, PhysicalSaveResponseError, type SaveBinding } from '../client/src/features/physical-draft/accountSaveState';
import { AccountContextChanged } from '../client/src/features/account/runtime';
import { createLevelDraft, editLevelName } from '../client/src/features/physical-draft/levelCommands';
import { addRoom, editField, commitField, renameRoom, type PhysicalDraft } from '../client/src/features/physical-draft/state';
import { addOpening, editOpeningField } from '../client/src/features/physical-draft/openingCommands';
import { upgradeExistingDraftToStairs, addStair, addLanding, addSurfaceOpening, createRoomLocalPlacement, editStairField, type StairFieldTarget } from '../client/src/features/physical-draft/stairCommands';
import { upgradeExistingDraftToLayout, addZone, addCabinet, editLayoutField, editLayoutText, setRoomUse, setZoneUse } from '../client/src/features/physical-draft/layoutCommands';
import { editWaste, setOutputEnabled } from '../client/src/features/physical-draft/takeoffCommands';
import { capturePhysicalSaveEnvelope } from '../shared/persistence/physicalSave';
import type { PhysicalPlanRevision } from '../shared/persistence/physicalPlan';
const AT='2026-09-10T04:00:00.000Z';
function fixture() {
  let d=addRoom(createLevelDraft('building','main'),'room','Kitchen');
  for(const [field,text] of [['length','12 ft'],['width','10 ft'],['ceilingHeight','8 ft']] as const)d=commitField(editField(d,'room',field,text),'room',field,AT);
  d=upgradeExistingDraftToStairs(d,'stairs',AT);
  d=addStair(d,'stair','Stair',{state:'modeled',levelId:'main',roomId:'room',placement:createRoomLocalPlacement(0,0)},AT);
  d=addLanding(d,'stair','lower','landing',AT);
  d=addSurfaceOpening(d,'hole','Hole',{roomId:'room',surface:'floor',placement:createRoomLocalPlacement(0,0)},null,AT);
  d=upgradeExistingDraftToLayout(d,'layout',AT);
  d=addZone(d,'zone','room','Zone',AT,createRoomLocalPlacement(0,0));
  d=addCabinet(d,'cabinet','room','Cabinet',AT,createRoomLocalPlacement(0,0));
  d=setRoomUse(d,'room',{value:'custom',customLabel:'Kitchen',source:'manual'},AT);
  d=setZoneUse(d,'zone',{value:'custom',customLabel:'Cooking',source:'manual'},AT);
  return addOpening(d,'door','door',d.document.rooms[0].wallFaces[0].id,1000,AT,{widthMm:800});
}
function pending(d:PhysicalDraft) { const fields=pendingSaveFields(d);assert.equal(fields.length,1);return fields[0]; }
test('Save blocks every room measurement family; applying unknown is deliberate and does not confirm',()=>{
  for(const field of ['length','width','ceilingHeight'] as const){const d=editField(fixture(),'room',field,'');const before=JSON.stringify(d);const p=pending(d);assert.match(p.label,/Kitchen/);const clean=p.apply(d,AT);assert.equal(pendingSaveFields(clean).length,0);assert.equal(clean.document.rooms[0][field].state,'unknown');assert.equal(JSON.stringify(d),before);}
});
test('Save sees all opening width height sill and offset edits and reverts only the targeted raw field',()=>{
  for(const field of ['width','height','sillHeight','offset'] as const){const d=editOpeningField(fixture(),'door',field,'2 ft -');const clean=pending(d).revert(d);assert.equal(pendingSaveFields(clean).length,0);assert.deepEqual(clean.document,d.document);assert.deepEqual(clean.events,d.events);}
});
test('Save sees pending names on hidden levels and preserves invalid text until Apply or Revert',()=>{
  const d=editLevelName(fixture(),'main',' ');const p=pending(d);assert.match(p.label,/level name/);assert.throws(()=>p.apply(d,AT));const clean=p.revert(d);assert.equal(pendingSaveFields(clean).length,0);assert.deepEqual(clean.document,d.document);
});
test('Save sees stair, endpoint, landing, hole and surface-placement pending fields',()=>{
  const targets:StairFieldTarget[]=[{kind:'stair',id:'stair',field:'width'},{kind:'stair',id:'stair',field:'run'},{kind:'stair',id:'stair',field:'totalRise'},
    {kind:'endpoint',id:'stair',role:'lower',field:'x'},{kind:'endpoint',id:'stair',role:'lower',field:'y'},
    ...(['width','depth','x','y'] as const).map(field=>({kind:'landing' as const,id:'stair',role:'lower' as const,field})),
    ...(['width','length'] as const).map(field=>({kind:'surface-opening' as const,id:'hole',field})),
    ...(['x','y'] as const).map(field=>({kind:'surface-placement' as const,id:'hole',roomId:'room',surface:'floor' as const,field}))];
  for(const target of targets){const d=editStairField(fixture(),target,'1 ft -');const clean=pending(d).revert(d);assert.equal(pendingSaveFields(clean).length,0);assert.deepEqual(clean.document,d.document);}
});
test('Save sees all zone and cabinet dimension and placement fields',()=>{
  for(const kind of ['zone','cabinet'] as const)for(const field of kind==='zone'?['length','width','x','y'] as const:['length','depth','height','x','y'] as const){
    const target=kind==='zone'?{kind,id:'zone',field:field as 'length'|'width'|'x'|'y'}:{kind,id:'cabinet',field:field as 'length'|'depth'|'height'|'x'|'y'};
    const d=editLayoutField(fixture(),target,'1 ft -'),clean=pending(d).revert(d);assert.equal(pendingSaveFields(clean).length,0);assert.deepEqual(clean.document,d.document);
  }
});
test('Save sees room/zone custom-use and zone/cabinet labels without auto-applying them',()=>{
  const targets=[{kind:'room-use',id:'room',field:'customLabel'},{kind:'zone-use',id:'zone',field:'customLabel'},{kind:'zone',id:'zone',field:'name'},{kind:'cabinet',id:'cabinet',field:'name'}] as const;
  for(const target of targets){const d=editLayoutText(fixture(),target,'New pending name'),p=pending(d);assert.equal(pendingSaveFields(p.apply(d,AT)).length,0);const reverted=p.revert(d);assert.equal(pendingSaveFields(reverted).length,0);assert.deepEqual(reverted.document,d.document);}
});
test('Save sees waste edits separately from the previously committed request',()=>{
  const d=editWaste(setOutputEnabled(fixture(),'floor-area',true),'floor-area','10.'),p=pending(d),clean=p.revert(d);assert.equal(pendingSaveFields(clean).length,0);assert.deepEqual(clean.request,d.request);
});
function deferred<T>() {let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{resolve,reject,promise};}
function harness() {
  let count=0,valid=true; const replies:ReturnType<typeof deferred<PhysicalPlanRevision>>[]=[],sent:any[]=[],persisted=new Map<string,SaveBinding>();
  const manager=createPhysicalSaveManager({authorize:async()=>({epoch:1}),assert:()=>{if(!valid)throw new AccountContextChanged();},key:()=>`key-${++count}`,load:id=>persisted.get(id)??null,persist:(id,b)=>{persisted.set(id,b);},send:async intent=>{sent.push(intent);const reply=deferred<PhysicalPlanRevision>();replies.push(reply);return reply.promise;}});
  const result=(d:PhysicalDraft,n=1):PhysicalPlanRevision=>({planId:'plan',workspaceId:'workspace',revisionId:`revision-${n}`,revisionNumber:n,name:d.document.name,createdAt:AT,createdBy:'actor',envelope:capturePhysicalSaveEnvelope(d),evaluation:{} as PhysicalPlanRevision['evaluation'],payloadHash:`hash-${n}`,etag:`"revision-${n}"`});
  let expectedSends=0; const started=async()=>{const expected=++expectedSends;const until=Date.now()+2000;while(sent.length<expected&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,1));assert.equal(sent.length,expected);};
  return{manager,replies,sent,persisted,result,started,invalidate:()=>{valid=false;}};
}
test('duplicate Save clicks serialize and acknowledge only the submitted local revision',async()=>{
  const f=harness(),d=fixture(),p=f.manager.save(d);await f.started();await f.manager.save(d);assert.equal(f.sent.length,1);
  const edited=renameRoom(d,'room','Changed while saving');f.replies[0].resolve(f.result(d));await p;
  assert.equal(f.manager.state(d.id).phase,'saved');assert.equal(f.manager.state(d.id).binding!.savedLocalRevision,d.localEditRevision);assert.notEqual(f.manager.state(d.id).binding!.savedLocalRevision,edited.localEditRevision);assert.equal(edited.document.rooms[0].name,'Changed while saving');
});
test('loss after commit retries exact original payload/key even after local edits',async()=>{
  const f=harness(),d=fixture(),first=f.manager.save(d);await f.started();f.replies[0].reject(Error('response lost'));await first;assert.equal(f.manager.state(d.id).retryable,true);
  const newer=renameRoom(d,'room','Newer'),retry=f.manager.save(newer,'retry');await f.started();assert.deepEqual(f.sent[1],f.sent[0]);f.replies[1].resolve(f.result(d));await retry;assert.equal(f.manager.state(d.id).binding!.savedLocalRevision,d.localEditRevision);assert.notEqual(newer.localEditRevision,d.localEditRevision);
});
test('conflict preserves candidate/base and only explicit Save as new removes If-Match binding',async()=>{
  const f=harness(),d=fixture();f.manager.opened(d.id,d.localEditRevision,f.result(d));const candidate=renameRoom(d,'room','Candidate'),save=f.manager.save(candidate);await f.started();f.replies[0].reject(new PhysicalSaveResponseError(412,'REVISION_CONFLICT','Newer revision'));await save;
  assert.equal(f.manager.state(d.id).phase,'conflict');assert.equal(f.manager.state(d.id).binding!.revisionId,'revision-1');const asNew=f.manager.save(candidate,'new');await f.started();assert.equal(f.sent[1].binding,null);assert.equal(f.sent[1].envelope.document.rooms[0].name,'Candidate');f.replies[1].resolve({...f.result(candidate),planId:'separate'});await asNew;assert.equal(f.manager.state(d.id).binding!.planId,'separate');
});
test('late Save response after logout cannot acknowledge or persist old private metadata',async()=>{
  const f=harness(),d=fixture(),save=f.manager.save(d);await f.started();f.invalidate();f.replies[0].resolve(f.result(d));await save;assert.equal(f.persisted.size,0);assert.equal(f.manager.state(d.id).phase,'failed');assert.equal(f.manager.state(d.id).binding,null);
});
test('a pending field blocks even retry and sends nothing; captured draft is never mutated',async()=>{
  const f=harness(),d=editField(fixture(),'room','length','12 ft -'),before=JSON.stringify(d);await assert.rejects(f.manager.save(d),/Apply or Revert/);assert.equal(f.sent.length,0);assert.equal(JSON.stringify(d),before);
});
test('accepted revision becomes next save condition; changed-key errors are not network retries',async()=>{
  const f=harness(),d=fixture();f.manager.opened(d.id,d.localEditRevision,f.result(d));const p=f.manager.save(renameRoom(d,'room','New'));await f.started();assert.equal(f.sent[0].binding.etag,'"revision-1"');f.replies[0].reject(new PhysicalSaveResponseError(409,'IDEMPOTENCY_CONFLICT','Key conflict'));await p;assert.equal(f.manager.state(d.id).retryable,false);assert.equal(f.manager.state(d.id).phase,'failed');assert.equal(f.manager.state(d.id).binding!.revisionId,'revision-1');
});

test('a second click after successful acknowledgement of the same local revision is a no-op',async()=>{
  const f=harness(),d=fixture(),save=f.manager.save(d);await f.started();f.replies[0].resolve(f.result(d));await save;await f.manager.save(d);assert.equal(f.sent.length,1);assert.equal(f.manager.state(d.id).binding!.revisionNumber,1);
});
