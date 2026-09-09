import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { physicalDocumentV4Schema, physicalDocumentV5Schema, type PhysicalDocumentV5 } from '../shared/domain/document';
import { createFunctionalZone, createCabinetBlock, createUnspecifiedRoomUse, roomUseSchema, type LayoutPlacement } from '../shared/domain/layout';
import { layoutBounds, grossLayoutFootprint, validateLayoutGeometry } from '../shared/domain/layoutGeometry';
import { upgradePhysicalDocumentToLayout } from '../shared/compatibility/layout';
import { upgradePhysicalDocumentToStairs } from '../shared/compatibility/stairs';
import { upgradePhysicalDocumentToLevels } from '../shared/compatibility/levels';
import { assertSupportedPhysicalDocument, upgradePhysicalDraft } from '../shared/compatibility/physicalDraft';
import { calculateQuantities } from '../shared/quantities/engine';
import { evaluateQuantities, createQuantitySnapshot, verifyQuantitySnapshot, quantitySnapshotSchema, evaluationSchema } from '../shared/quantities/snapshot';
import { canonicalJson } from '../shared/quantities/canonicalJson';
import { createProposedRoomApplicability, APPLICABILITY_FIELDS } from '../shared/domain/applicability';
import { createSurfaceOpening } from '../shared/domain/stairs';
import { createBuildingLevel } from '../shared/domain/levels';
import { unknownMeasurement } from '../shared/domain/measurements';
import type { QuantityRequest } from '../shared/quantities/policy';
import { q001, measured, room, freezeDeep, AT } from './fixtures/physical';
const ft = 304.8, copy = <T,>(value:T):T => structuredClone(value);
const near = (a:number,b:number) => assert.ok(Math.abs(a-b)<1e-8, `${a} expected ${b}`);
function profile() { const p = createProposedRoomApplicability(); for (const f of APPLICABILITY_FIELDS) p[f].confirmation={status:'confirmed',confirmedAt:AT}; return p; }
function base4() {
  const d=q001();d.openings=[];d.rooms[0].length=measured('20 ft');d.rooms[0].width=measured('15 ft');d.rooms[0].ceilingHeight=measured('8 ft');
  d.quantityPolicyVersion='rectangular-flat-v2';d.calculationContract={version:'room-applicability-v1',rooms:{'room-1':profile()}};d.editorContract={version:'sketch-editor-v1',groups:[]};
  const levels=upgradePhysicalDocumentToLevels(d,'basement');levels.buildingLevels.levels[0]=createBuildingLevel('basement','Basement',0);return upgradePhysicalDocumentToStairs(levels);
}
function doc() { return upgradePhysicalDocumentToLayout(base4()); }
function position(x='1 ft',y='1 ft',rotation:LayoutPlacement['rotation']=0):LayoutPlacement { return {anchor:'room-local-top-left',x:measured(x,true,'elevation'),y:measured(y,true,'elevation'),rotation}; }
function withLayout(d=doc()) {
  const zone=createFunctionalZone('zone','room-1','Kitchenette');zone.use={value:'kitchen',customLabel:null,source:'manual'};zone.width=measured('8 ft');zone.length=measured('6 ft');zone.placement=position();
  const cabinet=createCabinetBlock('cabinet','room-1');cabinet.length=measured('6 ft');cabinet.depth=measured('2 ft');cabinet.height=measured('3 ft');cabinet.placement=position('2 ft','2 ft');cabinet.zoneId=zone.id;
  d.layoutContract.zones.push(zone);d.layoutContract.cabinetBlocks.push(cabinet);return d;
}
function request(d:ReturnType<typeof base4>|PhysicalDocumentV5):QuantityRequest { const ids=d.rooms.map(r=>r.id);return {policy:{version:'rectangular-flat-v4',openingMeasureBasis:'finished',crownFullHeightGaps:[]},selections:[
  {output:'floor-area',roomIds:ids,wasteFraction:0},{output:'ceiling-area',roomIds:ids,wasteFraction:0},{output:'gross-wall-area',wallFaceIds:d.rooms.flatMap(r=>r.wallFaces.map(w=>w.id)),wasteFraction:0}]}; }
function calc(d:ReturnType<typeof base4>|PhysicalDocumentV5,req=request(d)) { const r=calculateQuantities(d,req);assert.ok(r.ok,JSON.stringify(r));return r.calculation; }
function check(d:PhysicalDocumentV5,code:string,id='zone') { return validateLayoutGeometry(d).checks.find(c=>c.id===id&&c.code===code)!; }

test('schema5 strictly owns explicit room uses, unique physical IDs, same-room zone associations and layout-only effects',()=>{
  const d=withLayout();assert.ok(physicalDocumentV5Schema.safeParse(d).success);assert.doesNotThrow(()=>assertSupportedPhysicalDocument(d));
  for(const mutate of [(x:any)=>delete x.layoutContract.roomUses['room-1'],(x:any)=>x.layoutContract.roomUses.extra=createUnspecifiedRoomUse(),
    (x:any)=>x.layoutContract.zones[0].roomId='missing',(x:any)=>x.layoutContract.zones[0].id='room-1',
    (x:any)=>x.layoutContract.cabinetBlocks[0].id='zone',(x:any)=>x.layoutContract.cabinetBlocks[0].zoneId='missing',
    (x:any)=>x.layoutContract.cabinetBlocks[0].quantityEffect='deduct-floor',(x:any)=>x.layoutContract.zones[0].levelId='basement',
    (x:any)=>x.layoutContract.version='future',(x:any)=>x.layoutContract.cabinetBlocks[0].family='appliance']){
      const bad=copy(d);mutate(bad);assert.equal(physicalDocumentV5Schema.safeParse(bad).success,false);
  }
  const other=room('other');d.rooms.push(other);d.calculationContract.rooms.other=profile();d.buildingLevels.roomLevels.other='basement';d.layoutContract.roomUses.other=createUnspecifiedRoomUse();
  d.layoutContract.cabinetBlocks[0].roomId='other';assert.equal(physicalDocumentV5Schema.safeParse(d).success,false);
});

test('explicit current4 upgrade is detached, keeps stairs/source metadata, never infers use from names and freezes older consumers',()=>{
  const old=base4();old.rooms[0].name='Kitchen';old.rooms[0].metadata={source:{fixture:'edited-current'}};old.metadata={original:{schemaVersion:2}};
  const hole=createSurfaceOpening('hole','room-1','floor');old.stairsContract.surfaceOpenings.push(hole);
  freezeDeep(old);const before=canonicalJson(old),up=upgradePhysicalDocumentToLayout(old);
  const {layoutContract,schemaVersion,...rest}=up;assert.equal(schemaVersion,5);const {schemaVersion:oldVersion,...oldRest}=old;assert.deepEqual(rest,oldRest);
  assert.deepEqual(up.rooms,old.rooms);assert.deepEqual(up.stairsContract,old.stairsContract);assert.equal(layoutContract.roomUses['room-1'].value,'unspecified');
  up.rooms[0].name='New';assert.equal(canonicalJson(old),before);assert.equal(physicalDocumentV4Schema.safeParse(up).success,false);assert.throws(()=>upgradePhysicalDraft(up));assert.throws(()=>upgradePhysicalDocumentToLayout(up));
  const mislabeled={...up,schemaVersion:4};assert.equal(calculateQuantities(mislabeled,request(old)).ok,false);
});

test('prototype-like room and layout IDs remain own keys through validation and capture',async()=>{
  const old=base4(),r=old.rooms[0];r.id='__proto__';old.calculationContract.rooms=Object.fromEntries([['__proto__',profile()]]);old.buildingLevels.roomLevels=Object.fromEntries([['__proto__','basement']]);
  const d=upgradePhysicalDocumentToLayout(old);assert.ok(Object.hasOwn(d.layoutContract.roomUses,'__proto__'));assert.ok(physicalDocumentV5Schema.safeParse(d).success);
  const z=createFunctionalZone('constructor','__proto__');d.layoutContract.zones.push(z);assert.ok(physicalDocumentV5Schema.safeParse(d).success);
  const s=await createQuantitySnapshot(d,request(d),{id:'prototype',createdAt:AT,kind:'evaluation'});assert.ok(s.ok);assert.ok(Object.hasOwn(s.snapshot.sourceDocument.schemaVersion===5?s.snapshot.sourceDocument.layoutContract.roomUses:{},'__proto__'));assert.ok((await verifyQuantitySnapshot(s.snapshot)).ok);
});

test('room use is explicit intent with preserved custom text, no fake labels or measurement approval',()=>{
  assert.ok(roomUseSchema.safeParse({value:'custom',customLabel:'',source:'manual'}).success);
  assert.ok(roomUseSchema.safeParse({value:'custom',customLabel:'Maker space',source:'imported'}).success);
  assert.equal(roomUseSchema.safeParse({value:'kitchen',customLabel:null,source:'unspecified'}).success,false);
  assert.equal(roomUseSchema.safeParse({value:'bedroom',customLabel:'Extra',source:'manual'}).success,false);
  const d=withLayout(),before=copy(d.rooms),selected=request(d),answers=calc(d,selected);
  d.layoutContract.roomUses['room-1']={value:'living-recreation',customLabel:null,source:'manual'};d.layoutContract.zones[0].name='Custom living zone';
  assert.deepEqual(d.rooms,before);assert.deepEqual(calc(d,selected),answers);
});

test('shared gross footprint is 48/12 sq ft, non-additive and independent of unknown cabinet height',()=>{
  const d=withLayout(),z=d.layoutContract.zones[0],c=d.layoutContract.cabinetBlocks[0];
  near(grossLayoutFootprint(z).areaMm2!/ft**2,48);near(grossLayoutFootprint(c).areaMm2!/ft**2,12);assert.match(grossLayoutFootprint(z).label,/within parent room; not additive/);
  c.height=unknownMeasurement('Not entered');assert.equal(check(d,'CABINET_FIT','cabinet').status,'valid');assert.equal(check(d,'CABINET_HEIGHT_UNKNOWN','cabinet').status,'undetermined');near(grossLayoutFootprint(c).areaMm2!/ft**2,12);
  c.depth=unknownMeasurement('No depth');assert.equal(grossLayoutFootprint(c).status,'unknown');assert.equal(layoutBounds(c),null);
});

test('all 90 degree rotations preserve dimensions and explicit top-left anchors without changing measurements',()=>{
  const d=withLayout(),z=d.layoutContract.zones[0],c=d.layoutContract.cabinetBlocks[0],before=copy({zwidth:z.width,zlength:z.length,clength:c.length,cdepth:c.depth});
  for(const rotation of [0,90,180,270]as const){z.placement.rotation=rotation;c.placement.rotation=rotation;const flip=rotation===90||rotation===270;
    assert.deepEqual(layoutBounds(z),{x:ft,y:ft,width:(flip?6:8)*ft,height:(flip?8:6)*ft});assert.deepEqual(layoutBounds(c),{x:2*ft,y:2*ft,width:(flip?2:6)*ft,height:(flip?6:2)*ft});}
  assert.deepEqual({zwidth:z.width,zlength:z.length,clength:c.length,cdepth:c.depth},before);
});

test('edge-touching fits; .01mm tolerance cannot turn .011mm overrun into valid or silently clamp values',()=>{
  const d=withLayout(),z=d.layoutContract.zones[0];z.placement=position('0 ft','0 ft');z.width=measured('20 ft');z.length=measured('15 ft');assert.equal(check(d,'ZONE_FIT').status,'valid');
  for(const [extra,expected] of [[.009,'valid'],[.01,'valid'],[.011,'invalid']]as const){z.width={...measured('20 ft'),valueMm:20*ft+extra}as any;const before=canonicalJson(d);assert.equal(check(d,'ZONE_FIT').status,expected);assert.equal(canonicalJson(d),before);}
  d.rooms[0].length=measured('10 ft');assert.equal(check(d,'ZONE_FIT').status,'invalid');assert.equal(d.layoutContract.zones.length,1);
});

test('overlapping zones produce ambiguity only, touching edges do not, and other parent rooms never overlap',()=>{
  const d=withLayout(),a=d.layoutContract.zones[0],b=copy(a);b.id='zone2';b.placement=position('8 ft','1 ft');d.layoutContract.zones.push(b);
  assert.equal(check(d,'ZONE_OVERLAP').status,'review');assert.deepEqual(check(d,'ZONE_OVERLAP').relatedIds,['zone2']);
  b.placement=position('9 ft','1 ft');assert.equal(check(d,'ZONE_OVERLAP'),undefined);
  const r=room('other');d.rooms.push(r);d.calculationContract.rooms.other=profile();d.layoutContract.roomUses.other=createUnspecifiedRoomUse();d.buildingLevels.roomLevels.other='basement';b.roomId='other';b.placement=position();assert.equal(check(d,'ZONE_OVERLAP'),undefined);
});

test('cabinet leaving an explicitly associated zone keeps association and flags review without blocking finish quantities',()=>{
  const d=withLayout(),c=d.layoutContract.cabinetBlocks[0],before=calc(d);c.placement=position('10 ft','10 ft');assert.equal(check(d,'CABINET_ZONE_MISMATCH','cabinet').status,'review');assert.equal(c.zoneId,'zone');assert.deepEqual(calc(d),before);
});

test('range and extent loss fail safely while unknown dimensions stay unknown and no geometry is mutated',()=>{
  const d=withLayout(),z=d.layoutContract.zones[0];z.width={...measured('1 ft'),valueMm:1e15}as any;z.length={...measured('1 ft'),valueMm:1e15}as any;assert.equal(grossLayoutFootprint(z).status,'invalid');
  z.width={...measured('1 ft'),valueMm:.1}as any;z.length=measured('1 ft');z.placement.x={...measured('1 ft',true,'elevation'),valueMm:1e15}as any;d.rooms[0].length={...measured('20 ft'),valueMm:2e15}as any;
  const before=canonicalJson(d);assert.equal(check(d,'ZONE_FIT').status,'invalid');assert.equal(canonicalJson(d),before);
});

test('layout5 evaluates through unchanged policy/engine/result4 and preserves 300/300/560 with no double counting',()=>{
  const old=base4(),baseline=calc(old),d=withLayout(upgradePhysicalDocumentToLayout(old));d.layoutContract.zones.push({...copy(d.layoutContract.zones[0]),id:'overlap'});
  const result=calc(d);assert.equal(result.engineVersion,'rectangular-engine-v4');assert.equal(result.schemaVersion,'quantity-result-v4');assert.deepEqual(result,baseline);
  for(const [output,expected]of[['floor-area',300],['ceiling-area',300],['gross-wall-area',560]]as const)near(result.outputs.find(o=>o.output===output)!.total!.net/ft**2,expected);
  const bad=request(d);bad.policy.version='rectangular-flat-v3';assert.equal(calculateQuantities(d,bad).ok,false);
});

test('retained stair voids remain 252 net / 25.2 waste / 277.2 adjusted after adding layout-only data',()=>{
  const old=base4();old.rooms[0].length=measured('12 ft');old.rooms[0].width=measured('10 ft');old.buildingLevels.levels.push(createBuildingLevel('main','Main',1));
  const upper=room('upper');upper.length=measured('15 ft');upper.width=measured('10 ft');upper.ceilingHeight=measured('9 ft');old.rooms.push(upper);old.calculationContract.rooms.upper=profile();old.buildingLevels.roomLevels.upper='main';
  const hole=createSurfaceOpening('void','upper','floor');hole.width=measured('3 ft');hole.length=measured('6 ft');hole.attachments[0].placement=position();old.stairsContract.surfaceOpenings.push(hole);
  const d=withLayout(upgradePhysicalDocumentToLayout(old)),req=request(d);req.selections[0]={output:'floor-area',roomIds:d.rooms.map(r=>r.id),wasteFraction:.1};
  assert.deepEqual(calc(d,req),calc(old,req));const total=calc(d,req).outputs.find(o=>o.output==='floor-area')!.total!;near(total.net/ft**2,252);near(total.allowance/ft**2,25.2);near(total.adjusted!/ft**2,277.2);
});

test('layout geometry and content hashes detect distinct changes while room names, camera and unrelated presentation remain excluded',async()=>{
  const d=withLayout(),req=request(d);const evaluate=async(x= d)=>{const r=await evaluateQuantities(x,req);assert.ok(r.ok);return r.evaluation;};const before=await evaluate();assert.equal(before.fingerprints.geometryScope,'physical-geometry-v5');assert.equal(before.fingerprints.contentScope,'calculation-content-v5');
  const name=copy(d);name.layoutContract.zones[0].name='Named';const renamed=await evaluate(name);assert.equal(renamed.fingerprints.geometry,before.fingerprints.geometry);assert.notEqual(renamed.fingerprints.content,before.fingerprints.content);assert.deepEqual(renamed.calculation,before.calculation);
  const use=copy(d);use.layoutContract.roomUses['room-1']={value:'bathroom',customLabel:null,source:'manual'};assert.notEqual((await evaluate(use)).fingerprints.content,before.fingerprints.content);
  const moved=copy(d);moved.layoutContract.cabinetBlocks[0].placement=position('3 ft','3 ft');assert.notEqual((await evaluate(moved)).fingerprints.geometry,before.fingerprints.geometry);
  const presentation=copy(d);presentation.metadata={camera:{x:99,zoom:2}};presentation.rooms[0].name='Renamed room';assert.deepEqual((await evaluate(presentation)).fingerprints,before.fingerprints);
  const evidence=copy(d);const m=evidence.layoutContract.zones[0].width;if(m.state==='known')m.provenance.confirmation={status:'unconfirmed'};const ev=await evaluate(evidence);assert.equal(ev.fingerprints.geometry,before.fingerprints.geometry);assert.notEqual(ev.fingerprints.content,before.fingerprints.content);
});

test('snapshot5 captures layout with policy4, is detached and rejects downgraded/mixed scopes or altered source evidence',async()=>{
  const d=withLayout(),before=copy(d),promise=createQuantitySnapshot(d,request(d),{id:'layout',createdAt:AT,kind:'confirmed'});d.layoutContract.zones[0].name='Caller mutated';
  const r=await promise;assert.ok(r.ok);assert.equal(r.snapshot.snapshotSchemaVersion,'quantity-snapshot-v5');assert.deepEqual(r.snapshot.sourceDocument,before);assert.ok(Object.isFrozen(r.snapshot.sourceDocument));assert.ok((await verifyQuantitySnapshot(r.snapshot)).ok);
  const bad=copy(r.snapshot)as any;bad.snapshotSchemaVersion='quantity-snapshot-v4';assert.equal(quantitySnapshotSchema.safeParse(bad).success,false);
  const scopes=copy(r.snapshot)as any;scopes.evaluation.fingerprints.geometryScope='physical-geometry-v4';scopes.evaluation.fingerprints.contentScope='calculation-content-v4';assert.equal(quantitySnapshotSchema.safeParse(scopes).success,false);
  const altered=copy(r.snapshot)as any;altered.sourceDocument.layoutContract.cabinetBlocks[0].name='Forged';assert.equal((await verifyQuantitySnapshot(altered)).ok,false);
  const mixed=copy(r.snapshot.evaluation)as any;mixed.fingerprints.contentScope='calculation-content-v4';assert.equal(evaluationSchema.safeParse(mixed).success,false);
});

test('historical v1-v4 snapshots regenerate exactly with unchanged policy and hashes',async()=>{
  for(const file of ['m3b-v1-snapshot.json','m3d-v2-snapshot.json','m3d-v3-snapshot.json','m3d-v4-snapshot.json']){
    const old=JSON.parse(readFileSync(new URL('./fixtures/'+file,import.meta.url),'utf8'));assert.ok((await verifyQuantitySnapshot(old)).ok,file);
    const made=await createQuantitySnapshot(old.sourceDocument,old.evaluation.calculation.request,old.instance,old.measurementEvents);assert.ok(made.ok,file);assert.equal(canonicalJson(made.snapshot),canonicalJson(old),file);
  }
});
