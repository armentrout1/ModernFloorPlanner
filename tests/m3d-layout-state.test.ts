import assert from 'node:assert/strict';
import test from 'node:test';
import { createLevelDraft, addLevel, selectLevel, assignRoomLevel } from '../client/src/features/physical-draft/levelCommands';
import { createRegistry, insertDraft, selectedDraft, addRoom, editField, commitField, switchUnit, previewDocument, type PhysicalDraft } from '../client/src/features/physical-draft/state';
import { createPhysicalDraftStore, type DraftStorage } from '../client/src/features/physical-draft/store';
import { serializeRegistry, parseRegistry, validateRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY, STAIRS_PHYSICAL_DRAFT_STORAGE_KEY as V3, PREVIOUS_PHYSICAL_DRAFT_STORAGE_KEY as V2, LEGACY_PHYSICAL_DRAFT_STORAGE_KEY as V1 } from '../client/src/features/physical-draft/storage';
import { upgradeExistingDraftToStairs, createRoomLocalPlacement, addStair, editStairField, addSurfaceOpening, commitStairField, setSurfaceImpact } from '../client/src/features/physical-draft/stairCommands';
import { upgradeExistingDraftToLayout, layoutIn, roomUseIn, zoneIn, cabinetIn, setRoomUse, addZone, renameZone, setZoneUse, setZonePlacement, deleteZone, addCabinet, setCabinetPlacement, setCabinetZone, deleteCabinet, editLayoutField, commitLayoutField, revertLayoutField, getLayoutField, layoutFieldError, editLayoutText, commitLayoutText, getLayoutText, revertLayoutText, type LayoutFieldTarget } from '../client/src/features/physical-draft/layoutCommands';
import { setOutputEnabled, selectAllCurrentTargets, editWaste, commitWaste } from '../client/src/features/physical-draft/takeoffCommands';
import { buildTakeoffReadModel } from '../client/src/features/physical-draft/takeoffReadModel';
import { emptyHistory, recordHistoryCommit, restoreHistory } from '../client/src/features/physical-draft/history';
import { validateHistoryEvidence } from '../client/src/features/physical-draft/historyEvidence';
import { grossLayoutFootprint, validateLayoutGeometry } from '../shared/domain/layoutGeometry';
const AT='2026-09-09T12:00:00.000Z', ft=304.8;
const copy=<T,>(v:T):T=>JSON.parse(JSON.stringify(v));
class Memory implements DraftStorage {
  values=new Map<string,string>(); reads:string[]=[]; writes:string[]=[]; quota=false;
  getItem(k:string){this.reads.push(k);return this.values.get(k)??null;}
  setItem(k:string,v:string){if(this.quota)throw new Error('quota');this.writes.push(k);this.values.set(k,v);}
  removeItem(k:string){this.values.delete(k);}
}
function measured(d:PhysicalDraft,id='room',length='20 ft',width='15 ft',height='8 ft'){
  d=addRoom(d,id,id==='room'?'Kitchen':id);
  for(const [field,text] of [['length',length],['width',width],['ceilingHeight',height]] as const)d=commitField(editField(d,id,field,text),id,field,AT);
  return d;
}
function oldDraft(){return upgradeExistingDraftToStairs(measured(createLevelDraft('building','main')),'stairs',AT);}
function draft(){return upgradeExistingDraftToLayout(oldDraft(),'layout',AT);}
function set(d:PhysicalDraft,target:LayoutFieldTarget,text:string){return commitLayoutField(editLayoutField(d,target,text),target,AT);}
function withZone(d=draft(),id='zone',roomId='room'){
  d=addZone(d,id,roomId,'Kitchen zone',AT,createRoomLocalPlacement(0,0));
  d=set(d,{kind:'zone',id,field:'width'},'8 ft');return set(d,{kind:'zone',id,field:'length'},'6 ft');
}
function withCabinet(d=withZone(),id='cabinet',roomId='room'){
  d=addCabinet(d,id,roomId,'Island block',AT,createRoomLocalPlacement(ft,ft));
  d=set(d,{kind:'cabinet',id,field:'length'},'6 ft');return set(d,{kind:'cabinet',id,field:'depth'},'2 ft');
}
function usable(d:PhysicalDraft){for(const output of ['floor-area','ceiling-area','gross-wall-area']as const){d=setOutputEnabled(d,output,true);d=selectAllCurrentTargets(d,output);}return d;}
function recover(d:PhysicalDraft){const reg=insertDraft(createRegistry(),d),r=parseRegistry(serializeRegistry(reg));assert.equal(r.status,'recovered',JSON.stringify(r));if(r.status==='recovered')assert.deepEqual(r.registry,reg);}
function fixture(d=draft(),storage=new Memory()){
  const store=createPhysicalDraftStore(()=>storage);assert.ok(store.dispatch(reg=>insertDraft(reg,d)),store.getSnapshot().error);
  const current=()=>selectedDraft(store.getSnapshot().registry)!;
  const update=(fn:(d:PhysicalDraft)=>PhysicalDraft)=>assert.ok(store.updateDraft(current().id,current().localEditRevision,fn),store.getSnapshot().error);
  const undo=()=>assert.ok(store.undo(current().id,current().localEditRevision,AT),store.getSnapshot().error);
  const redo=()=>assert.ok(store.redo(current().id,current().localEditRevision,AT),store.getSnapshot().error);
  const apply=(target:LayoutFieldTarget,text:string)=>{update(d=>editLayoutField(d,target,text));update(d=>commitLayoutField(d,target,AT));};
  return{store,current,update,undo,redo,apply,storage};
}

test('explicit layout upgrade preserves the full current source, pending fields, request and immutable schema4 lineage',()=>{
  let old=oldDraft();old=addStair(old,'stair','Future stair',{state:'unresolved',reason:'Not yet modeled'},AT);
  old=editStairField(old,{kind:'stair',id:'stair',field:'totalRise'},'9 ft -');old=editField(old,'room','width','15 ft -');
  old=usable(old);old=editWaste(old,'floor-area','10.');const before=copy(old),next=upgradeExistingDraftToLayout(old,'layout',AT);
  assert.deepEqual(old,before);assert.deepEqual(next.layoutUpgradeLineage?.originalDraft,before);
  for(const key of ['source','fields','events','stairFields','stairEvents','request','takeoffState','levelView']as const)assert.deepEqual(next[key],old[key]);
  assert.equal(next.document.schemaVersion,5);assert.equal(next.document.quantityPolicyVersion,'rectangular-flat-v4');assert.deepEqual(next.document.rooms,old.document.rooms);
  assert.deepEqual(roomUseIn(next,'room'),{value:'unspecified',customLabel:null,source:'unspecified'});recover(next);
});
test('room name never infers use; deliberate room and zone uses remain independent through history',()=>{
  const f=fixture(withZone());assert.equal(roomUseIn(f.current(),'room').value,'unspecified');
  f.update(d=>setRoomUse(d,'room',{value:'kitchen',customLabel:null,source:'manual'},AT));
  f.update(d=>setZoneUse(d,'zone',{value:'living-recreation',customLabel:null,source:'manual'},AT));
  assert.equal(roomUseIn(f.current(),'room').value,'kitchen');assert.equal(zoneIn(f.current(),'zone').use.value,'living-recreation');
  f.undo();assert.equal(zoneIn(f.current(),'zone').use.value,'unspecified');f.undo();assert.equal(roomUseIn(f.current(),'room').value,'unspecified');f.redo();recover(f.current());
});
test('adding rooms to schema5 creates explicit unspecified use with prototype-safe exact ownership',()=>{
  let d=draft();d=addRoom(d,'__proto__','Bathroom');d=addRoom(d,'constructor','Kitchen');
  assert.equal(Object.hasOwn(layoutIn(d).roomUses,'__proto__'),true);assert.equal(roomUseIn(d,'constructor').value,'unspecified');
  const f=fixture(d);f.update(current=>addRoom(current,'new','New'));f.undo();assert.equal(Object.hasOwn(layoutIn(f.current()).roomUses,'new'),false);f.redo();recover(f.current());
});
test('layout-only 48 and12 square-foot footprints never inflate300/300/560 finish quantities',()=>{
  const before=buildTakeoffReadModel(usable(draft())).outputs.map(o=>o.total);
  let d=usable(withCabinet());d=setCabinetZone(d,'cabinet','zone',AT);d=setRoomUse(d,'room',{value:'kitchen',customLabel:null,source:'manual'},AT);
  assert.deepEqual(buildTakeoffReadModel(d).outputs.map(o=>o.total),before);
  assert.deepEqual(before.map(t=>t?.net),['300.00 sq ft','300.00 sq ft','560.00 sq ft']);
  assert.ok(Math.abs(grossLayoutFootprint(zoneIn(d,'zone')).areaMm2!/(ft*ft)-48)<1e-10);
  assert.ok(Math.abs(grossLayoutFootprint(cabinetIn(d,'cabinet')).areaMm2!/(ft*ft)-12)<1e-10);
  assert.equal(cabinetIn(d,'cabinet').height.state,'unknown');recover(d);
});
test('existing explicit stair holes and measured waste stay252/25.2/277.2 after layout upgrade',()=>{
  let old=measured(createLevelDraft('building','base'),'lower','12 ft','10 ft','8 ft');old=addLevel(old,'upper','Upper');old=measured(old,'upper-room','15 ft','10 ft','8 ft');
  old=upgradeExistingDraftToStairs(old,'stairs',AT);old=addSurfaceOpening(old,'hole','Hole',{roomId:'upper-room',surface:'floor',placement:createRoomLocalPlacement(ft,ft)},null,AT);
  for(const [field,text]of [['width','3 ft'],['length','6 ft']]as const){const t={kind:'surface-opening',id:'hole',field}as const;old=commitStairField(editStairField(old,t,text),t,AT);}
  old=usable(old);old=commitWaste(editWaste(old,'floor-area','10'),'floor-area');const baseline=buildTakeoffReadModel(old).outputs[0];
  let next=upgradeExistingDraftToLayout(old,'layout',AT);next=withCabinet(withZone(next,'zone','upper-room'),'cabinet','upper-room');
  assert.deepEqual(buildTakeoffReadModel(next).outputs[0].total,baseline.total);assert.equal(baseline.total?.net,'252.00 sq ft');
  assert.equal(baseline.total?.allowance,'25.20 sq ft');assert.equal(baseline.total?.adjusted,'277.20 sq ft');recover(next);
});
test('unknown geometry remains unknown; explicit origin is unconfirmed and zero stays valid',()=>{
  const unknown=addZone(draft(),'zone','room','Zone',AT);assert.equal(zoneIn(unknown,'zone').placement.x.state,'unknown');assert.equal(grossLayoutFootprint(zoneIn(unknown,'zone')).status,'unknown');
  const known=withZone();assert.equal(zoneIn(known,'zone').placement.x.state==='known'&&zoneIn(known,'zone').placement.x.valueMm,0);
  assert.equal(zoneIn(known,'zone').placement.x.state==='known'&&zoneIn(known,'zone').placement.x.provenance.confirmation.status,'unconfirmed');recover(known);
});
test('invalid raw syntax stays pending and Enter followed by blur commits exactly once',()=>{
  let d=withZone();const t={kind:'zone',id:'zone',field:'width'}as const;d=editLayoutField(d,t,'8 ft -');const before=copy(d);
  assert.ok(layoutFieldError(d,t));assert.equal(commitLayoutField(d,t,AT),d);assert.deepEqual(d,before);
  d=editLayoutField(d,t,'9 ft');d=commitLayoutField(d,t,AT);const events=d.layoutEvents?.length;
  assert.equal(commitLayoutField(d,t,AT),d);assert.equal(d.layoutEvents?.length,events);recover(d);
});
test('pending layout masks only its footprint and never unrelated finish results',()=>{
  let d=usable(withCabinet());const totals=buildTakeoffReadModel(d).outputs.map(o=>o.total);d=editLayoutField(d,{kind:'zone',id:'zone',field:'width'},'8 ft -');
  const preview=previewDocument(d);assert.equal(preview.schemaVersion,5);if(preview.schemaVersion===5)assert.equal(grossLayoutFootprint(preview.layoutContract.zones[0]).status,'unknown');
  assert.deepEqual(buildTakeoffReadModel(d).outputs.map(o=>o.total),totals);assert.equal(grossLayoutFootprint(cabinetIn(d,'cabinet')).status,'known');recover(d);
});
test('units preserve pending raw context; Revert restores active units without changing document or evidence',()=>{
  let d=withZone();const t={kind:'zone',id:'zone',field:'width'}as const,before=copy(d.document),events=copy(d.layoutEvents);
  d=editLayoutField(d,t,'8 ft -');d=switchUnit(d,'m');assert.equal(getLayoutField(d,t).unit,'ft');d=revertLayoutField(d,t);assert.equal(getLayoutField(d,t).unit,'m');
  assert.deepEqual(d.document,before);assert.deepEqual(d.layoutEvents,events);d=set(d,t,'2.4384');assert.deepEqual(d.document,before);recover(d);
});
test('edge-touching placement fits; outside placement rejects atomically while dimension edits retain invalid findings',()=>{
  let d=withZone();d=setZonePlacement(d,'zone',createRoomLocalPlacement(12*ft,9*ft),AT);const prior=copy(d.document);
  assert.throws(()=>setZonePlacement(d,'zone',createRoomLocalPlacement(13*ft,9*ft),AT),/outside|fit/);assert.deepEqual(d.document,prior);
  const t={kind:'zone',id:'zone',field:'x'}as const;d=editLayoutField(d,t,'13 ft');assert.ok(layoutFieldError(d,t));assert.throws(()=>commitLayoutField(d,t,AT));
  assert.equal(getLayoutField(d,t).text,'13 ft');d=revertLayoutField(d,t);d=set(d,{kind:'zone',id:'zone',field:'width'},'9 ft');
  assert.deepEqual(zoneIn(d,'zone').placement,(prior.schemaVersion===5?prior.layoutContract.zones[0]:null)?.placement);
  assert.ok(validateLayoutGeometry(d.document).checks.some(c=>c.code==='ZONE_FIT'&&c.status==='invalid'));recover(d);
});
test('pending position prevents drag takeover while unrelated dimension/name drafts survive valid movement',()=>{
  let d=withZone();const x={kind:'zone',id:'zone',field:'x'}as const;d=editLayoutField(d,x,'1 ft -');assert.throws(()=>setZonePlacement(d,'zone',createRoomLocalPlacement(ft,0),AT),/pending/);
  d=revertLayoutField(d,x);d=editLayoutField(d,{kind:'zone',id:'zone',field:'width'},'8 ft -');d=editLayoutText(d,{kind:'zone',id:'zone',field:'name'},'Kitchen zone pending');
  d=setZonePlacement(d,'zone',createRoomLocalPlacement(ft,0),AT);assert.equal(getLayoutField(d,{kind:'zone',id:'zone',field:'width'}).text,'8 ft -');assert.equal(getLayoutText(d,{kind:'zone',id:'zone',field:'name'}).dirty,true);recover(d);
});
test('retained creation history accepts pending name and custom labels, which recover exactly without new history',()=>{
  const f=fixture();f.update(d=>addZone(d,'zone','room','Zone',AT));const evidence=copy(f.current().historyEvidence);
  f.update(d=>editLayoutText(d,{kind:'zone',id:'zone',field:'name'},'Unfinished name'));
  f.update(d=>editLayoutText(d,{kind:'zone-use',id:'zone',field:'customLabel'},'Breakfast area'));
  assert.deepEqual(f.current().historyEvidence,evidence);recover(f.current());assert.equal(validateHistoryEvidence(f.current()),null);
  assert.equal(f.store.undo(f.current().id,f.current().localEditRevision,AT),false);assert.match(f.store.getSnapshot().error!,/pending/);
});
test('Custom explicitly permits blank unfinished label; Apply makes one semantic history and Revert keeps saved use',()=>{
  const f=fixture(withZone());f.update(d=>setRoomUse(d,'room',{value:'custom',customLabel:'',source:'manual'},AT));recover(f.current());
  const t={kind:'room-use',id:'room',field:'customLabel'}as const;f.update(d=>editLayoutText(d,t,'Breakfast kitchen'));const count=f.current().historyEvidence!.events.length;
  f.update(d=>commitLayoutText(d,t,AT));assert.equal(f.current().historyEvidence!.events.length,count+1);assert.equal(roomUseIn(f.current(),'room').customLabel,'Breakfast kitchen');
  f.update(d=>editLayoutText(d,t,'Unapplied'));f.update(d=>revertLayoutText(d,t));assert.equal(roomUseIn(f.current(),'room').customLabel,'Breakfast kitchen');f.undo();assert.equal(roomUseIn(f.current(),'room').customLabel,'');recover(f.current());
});
test('zone deletion unlinks retained cabinet atomically and Undo preserves unrelated pending waste and scope',()=>{
  const f=fixture(setCabinetZone(usable(withCabinet()),'cabinet','zone',AT)),before=copy(f.current().document),request=copy(f.current().request);
  f.update(d=>deleteZone(d,'zone',AT));assert.equal(layoutIn(f.current()).zones.length,0);assert.equal(cabinetIn(f.current(),'cabinet').zoneId,null);assert.match(f.current().layoutNotice!.message,/unlinked 1/);
  f.update(d=>editWaste(d,'floor-area','10.'));const raw=copy(f.current().takeoffState);f.undo();assert.deepEqual(f.current().document,before);assert.deepEqual(f.current().request,request);assert.deepEqual(f.current().takeoffState,raw);
  f.redo();assert.equal(cabinetIn(f.current(),'cabinet').zoneId,null);recover(f.current());
});
test('delete and restore keeps clean name drafts, unit formatting and stable ordering',()=>{
  let d=withCabinet();d=editLayoutText(d,{kind:'zone',id:'zone',field:'name'},'Kitchen zone');d=withZone(d,'second');const f=fixture(d),before=copy(f.current().document);
  f.update(current=>deleteZone(current,'zone',AT));f.update(current=>switchUnit(current,'m'));f.undo();assert.deepEqual(f.current().document,before);assert.deepEqual(layoutIn(f.current()).zones.map(z=>z.id),['zone','second']);recover(f.current());
});
test('cabinet association only accepts the same room and room-level assignment carries both children',()=>{
  let d=withCabinet();d=measured(d,'other');d=withZone(d,'other-zone','other');assert.throws(()=>setCabinetZone(d,'cabinet','other-zone',AT),/parent room/);
  d=setCabinetZone(d,'cabinet','zone',AT);d=addLevel(d,'upper','Upper');const f=fixture(d),children=copy(layoutIn(d));f.update(current=>assignRoomLevel(current,'room','upper'));
  assert.deepEqual(layoutIn(f.current()),children);assert.equal(f.current().levelView?.activeLevelId,'upper');f.undo();assert.equal(f.store.getSnapshot().history.reveal?.roomId,'room');assert.equal(f.store.getSnapshot().history.reveal?.levelId,'main');recover(f.current());
});
test('an older room-creation inverse is blocked by later layout dependents without touching them',()=>{
  const empty=upgradeExistingDraftToLayout(upgradeExistingDraftToStairs(createLevelDraft('building','main'),'stairs',AT),'layout',AT);
  const added=addRoom(empty,'room','Room'),record=recordHistoryCommit(empty,added,emptyHistory());
  const later=addCabinet(addZone(record.draft,'zone','room','Zone',AT),'cabinet','room','Cabinet',AT),before=copy(later);
  assert.throws(()=>restoreHistory(later,record.history,'undo',AT),/dependent zones or cabinet blocks/);assert.deepEqual(later,before);
});
test('layout history restores changed measures unconfirmed while rotation retains unrelated approvals',()=>{
  let d=withCabinet();for(const value of [cabinetIn(d,'cabinet').length,cabinetIn(d,'cabinet').placement.x,cabinetIn(d,'cabinet').placement.y])if(value.state==='known')value.provenance.confirmation={status:'confirmed',confirmedAt:AT};
  const f=fixture(d),original=copy(cabinetIn(d,'cabinet'));f.update(current=>setCabinetPlacement(current,'cabinet',{...cabinetIn(current,'cabinet').placement,rotation:90},AT));f.undo();assert.deepEqual(cabinetIn(f.current(),'cabinet'),original);
  f.apply({kind:'cabinet',id:'cabinet',field:'length'},'7 ft');f.undo();const now=cabinetIn(f.current(),'cabinet');assert.equal(now.length.state==='known'&&now.length.provenance.confirmation.status,'unconfirmed');assert.deepEqual(now.placement,original.placement);recover(f.current());
});
test('creation/deletion, dimension and drag actions share one chronological history with exact target reveal',()=>{
  const f=fixture(withZone());f.update(d=>addCabinet(d,'cabinet','room','Cabinet',AT));f.apply({kind:'cabinet',id:'cabinet',field:'length'},'6 ft');f.undo();assert.equal(cabinetIn(f.current(),'cabinet').length.state,'unknown');
  f.undo();assert.equal(layoutIn(f.current()).cabinetBlocks.length,0);f.redo();assert.equal(f.store.getSnapshot().history.reveal?.cabinetId,'cabinet');f.redo();f.update(d=>deleteCabinet(d,'cabinet',AT));f.undo();assert.equal(cabinetIn(f.current(),'cabinet').id,'cabinet');recover(f.current());
});
test('same physical numeric or pointer values and unchanged names create no duplicate committed history',()=>{
  const f=fixture(withZone()),before=copy(f.current().document);f.apply({kind:'zone',id:'zone',field:'width'},'96 in');f.update(d=>renameZone(d,'zone','Kitchen zone',AT));f.update(d=>setZonePlacement(d,'zone',createRoomLocalPlacement(0,0),AT));
  assert.deepEqual(f.current().document,before);assert.equal(f.store.getSnapshot().history.undoLabel,null);recover(f.current());
});
test('large coordinates do not silently erase a representable half-millimeter move',()=>{
  let d=withZone();d=set(d,{kind:'zone',id:'zone',field:'width'},'1000 mm');d=set(d,{kind:'zone',id:'zone',field:'length'},'1000 mm');const room=d.document.rooms[0];assert.equal(room.length.state,'known');if(room.length.state==='known')room.length.valueMm=1e15+10000;
  // This synthetic precision fixture deliberately preserves its source-independent room field invariant.
  delete (d.fields as any).room;d.fields.room={length:{text:String((1e15+10000)/ft),unit:'ft',dirty:true},width:{text:'15',unit:'ft',dirty:false},ceilingHeight:{text:'8',unit:'ft',dirty:false}};
  d=setZonePlacement(d,'zone',createRoomLocalPlacement(1e15,0),AT);const next=setZonePlacement(d,'zone',createRoomLocalPlacement(1e15+0.5,0),AT);
  assert.equal(zoneIn(next,'zone').placement.x.state==='known'&&zoneIn(next,'zone').placement.x.valueMm,1e15+0.5);assert.notDeepEqual(next.document,d.document);
});
test('stale revisions and pending target conflicts reject without popping the history branch',()=>{
  const f=fixture(withZone()),rev=f.current().localEditRevision;f.apply({kind:'zone',id:'zone',field:'width'},'9 ft');const label=f.store.getSnapshot().history.undoLabel;
  assert.equal(f.store.updateDraft(f.current().id,rev,d=>renameZone(d,'zone','Stale',AT)),false);f.update(d=>editLayoutField(d,{kind:'zone',id:'zone',field:'width'},'10 ft -'));const before=copy(f.current());
  assert.equal(f.store.undo(f.current().id,f.current().localEditRevision,AT),false);assert.deepEqual(f.current(),before);assert.equal(f.store.getSnapshot().history.undoLabel,label);
  f.update(d=>revertLayoutField(d,{kind:'zone',id:'zone',field:'width'}));f.undo();const redo=f.store.getSnapshot().history.redoLabel;f.update(d=>switchUnit(d,'m'));assert.equal(f.store.getSnapshot().history.redoLabel,redo);f.redo();recover(f.current());
});
test('v4 recovery reads v3 without rewriting source bytes and detects fallback changes before saving',()=>{
  const storage=new Memory(),old=insertDraft(createRegistry(),oldDraft()),bytes=serializeRegistry(old);storage.values.set(V3,bytes);const store=createPhysicalDraftStore(()=>storage);store.hydrate();
  assert.deepEqual(storage.reads,[KEY,V3]);assert.deepEqual(storage.writes,[]);const d=selectedDraft(store.getSnapshot().registry)!;storage.values.set(V3,bytes+' ');
  assert.ok(store.updateDraft(d.id,d.localEditRevision,current=>editField(current,'room','length','20 ft -')));assert.equal(store.getSnapshot().cache,'conflict');assert.equal(storage.values.has(KEY),false);assert.equal(storage.values.get(V3),bytes+' ');
});
test('older keys remain byte-exact, cache failures retain memory/history, and reload has no session Undo',()=>{
  const storage=new Memory();storage.values.set(V1,serializeRegistry(insertDraft(createRegistry(),oldDraft())));const old=storage.values.get(V1);const f=fixture(withZone(),storage);
  assert.deepEqual(storage.reads.slice(0,4),[KEY,V3,V2,V1]);assert.equal(storage.values.get(V1),old);storage.quota=true;f.update(d=>renameZone(d,'zone','Memory zone',AT));assert.equal(f.store.getSnapshot().cache,'unavailable');f.undo();assert.equal(zoneIn(f.current(),'zone').name,'Kitchen zone');
  const reloaded=createPhysicalDraftStore(()=>storage);reloaded.hydrate();assert.equal(reloaded.getSnapshot().history.undoLabel,null);assert.equal(storage.values.get(V1),old);recover(f.current());
});
test('corrupt, future, dangling and forged layout recovery cannot overwrite retained bytes',()=>{
  const f=fixture(withZone());f.apply({kind:'zone',id:'zone',field:'width'},'9 ft');f.undo();const reg=copy(f.store.getSnapshot().registry);
  reg.drafts[0].layoutFields![Object.keys(reg.drafts[0].layoutFields!)[0]].raw.text='999 ft';assert.equal(validateRegistry(reg).status,'corrupt');
  const dangling=copy(f.store.getSnapshot().registry);dangling.drafts[0].layoutTexts={bad:{target:{kind:'zone',id:'missing',field:'name'},text:'pending',dirty:true}};assert.equal(validateRegistry(dangling).status,'corrupt');
  const forged=copy(f.store.getSnapshot().registry);forged.drafts[0].historyEvidence!.events.at(-1)!.sourceEventId='missing';assert.equal(validateRegistry(forged).status,'corrupt');
  const bad=new Memory();bad.values.set(KEY,'{"version":"future"}');const store=createPhysicalDraftStore(()=>bad);store.hydrate();assert.equal(store.getSnapshot().cache,'unsupported');assert.equal(store.dispatch(r=>insertDraft(r,draft())),false);assert.deepEqual(bad.writes,[]);
});
test('mixed registries remain v4 and old envelopes cannot pretend to contain schema5 layout',()=>{
  let reg=insertDraft(createRegistry(),draft());reg=insertDraft(reg,createLevelDraft('second','other'));assert.equal(reg.version,'mfp-editor-draft-v4');assert.equal(parseRegistry(serializeRegistry(reg)).status,'recovered');
  const downgraded=copy(reg);downgraded.version='mfp-editor-draft-v3';assert.equal(validateRegistry(downgraded).status,'corrupt');
});
