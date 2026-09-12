import { z } from 'zod';
import { createStairAssembly, createSurfaceOpening, stairAssemblySchema, surfaceOpeningSchema, placementSchema,
  stairEndpointSchema, impactSchema, type StairAssembly, type SurfaceOpening, type StairEndpoint,
  type StairPlacement, type EndpointRole, type SurfaceImpact } from '@shared/domain/stairs';
import { unknownMeasurement, dimensionSchema, coordinateMeasurementSchema, type Dimension } from '@shared/domain/measurements';
import { parseMeasurement } from '@shared/domain/parseMeasurement';
import { assertSupportedPhysicalDocument } from '@shared/compatibility/physicalDraft';
import { upgradePhysicalDocumentToStairs } from '@shared/compatibility/stairs';
import { canonicalJson, copyJson } from '@shared/quantities/canonicalJson';
import { QUANTITY_POLICY_VERSION_V4 } from '@shared/quantities/policy';
import { validateStairGeometry } from '@shared/domain/stairGeometry';
import { committedFieldText, copyDraftForEdit, PhysicalDraftError, type PhysicalDraft, type FieldDraft, type InputUnit } from './state';

const id = z.string().min(1), role = z.enum(['lower', 'upper']), surface = z.enum(['floor', 'ceiling']);
export const stairFieldTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('stair'), id, field: z.enum(['width', 'run', 'totalRise']) }).strict(),
  z.object({ kind: z.literal('endpoint'), id, role, field: z.enum(['x', 'y']) }).strict(),
  z.object({ kind: z.literal('landing'), id, role, field: z.enum(['width', 'depth', 'x', 'y']) }).strict(),
  z.object({ kind: z.literal('surface-opening'), id, field: z.enum(['width', 'length']) }).strict(),
  z.object({ kind: z.literal('surface-placement'), id, roomId: id, surface, field: z.enum(['x', 'y']) }).strict(),
]);
export type StairFieldTarget = z.infer<typeof stairFieldTargetSchema>;
const rawSchema = z.object({ text: z.string(), unit: z.enum(['ft', 'm']), dirty: z.boolean() }).strict();
export const stairRawEntrySchema = z.object({ target: stairFieldTargetSchema, raw: rawSchema }).strict();
export type StairRawEntry = z.infer<typeof stairRawEntrySchema>;
export const stairActionSchema = z.object({
  object: z.enum(['stair', 'surface-opening']), id, action: z.enum(['add', 'rename', 'correct', 'clear', 'endpoint', 'placement', 'landing', 'impact', 'alignment', 'attachments', 'delete', 'unlink']),
  at: z.string().datetime({ offset: true }), before: z.unknown(), after: z.unknown(),
  input: z.object({ target: stairFieldTargetSchema, text: z.string(), unit: z.enum(['ft', 'm']) }).strict().optional(),
}).strict().superRefine((event, ctx) => {
  const schema = event.object === 'stair' ? stairAssemblySchema : surfaceOpeningSchema;
  if (![event.before, event.after].every(value => value === null || (schema.safeParse(value).success && (value as {id:string}).id === event.id))
      || (event.before === null && event.after === null) || (event.action === 'add' && (event.before !== null || event.after === null))
      || (event.action === 'delete' && (event.before === null || event.after !== null))) ctx.addIssue({ code:z.ZodIssueCode.custom,message:'Stair evidence must retain its exact typed identity and action.' });
});
export type StairAction = z.infer<typeof stairActionSchema>;
const copy = <T,>(value:T):T => copyJson(value) as unknown as T;
const equal = (a:unknown,b:unknown) => canonicalJson(a) === canonicalJson(b);
// Unit conversion may differ by a few IEEE-754 ulps; this is not a geometry tolerance.
const equivalentMm=(a:number,b:number)=>Math.abs(a-b)<=Number.EPSILON*Math.max(Math.abs(a),Math.abs(b))*4;
function fail(message:string):never { throw new PhysicalDraftError('STAIR_EDIT_INVALID',message); }
export function stairsIn(draft:PhysicalDraft) {
  if ((draft.document.schemaVersion !== 4 && draft.document.schemaVersion !== 5)) fail('Enable stairs and surface openings in an explicit copy before editing them.');
  return draft.document.stairsContract;
}
export function stairIn(draft:PhysicalDraft,id:string):StairAssembly {
  const item=stairsIn(draft).stairs.find(item=>item.id===id); if(!item) fail('The selected stair is no longer in this draft.'); return item;
}
export function surfaceOpeningIn(draft:PhysicalDraft,id:string):SurfaceOpening {
  const item=stairsIn(draft).surfaceOpenings.find(item=>item.id===id); if(!item) fail('The selected surface opening is no longer in this draft.'); return item;
}
export const stairFieldKey = (target:StairFieldTarget):string => canonicalJson(stairFieldTargetSchema.parse(target));
export function stairMeasurementAt(draft:PhysicalDraft,target:StairFieldTarget):Dimension {
  stairFieldTargetSchema.parse(target);
  if(target.kind==='stair') return stairIn(draft,target.id)[target.field];
  if(target.kind==='endpoint') { const endpoint=stairIn(draft,target.id).endpoints[target.role]; if(endpoint.state!=='modeled') fail('Model this endpoint before editing its position.'); return endpoint.placement[target.field]; }
  if(target.kind==='landing') { const landing=stairIn(draft,target.id).landings[target.role]; if(!landing) fail('This landing is no longer present.'); return target.field==='x'||target.field==='y'?landing.placement[target.field]:landing[target.field]; }
  if(target.kind==='surface-opening') return surfaceOpeningIn(draft,target.id)[target.field];
  const attachment=surfaceOpeningIn(draft,target.id).attachments.find(item=>item.roomId===target.roomId&&item.surface===target.surface);
  if(!attachment) fail('This surface attachment is no longer present.'); return attachment.placement[target.field];
}
export function setStairMeasurement(draft:PhysicalDraft,target:StairFieldTarget,value:Dimension):void {
  stairMeasurementAt(draft,target);
  if(target.kind==='stair') stairIn(draft,target.id)[target.field]=value;
  else if(target.kind==='endpoint') { const endpoint=stairIn(draft,target.id).endpoints[target.role]; if(endpoint.state==='modeled') endpoint.placement[target.field]=value; }
  else if(target.kind==='landing') { const landing=stairIn(draft,target.id).landings[target.role]!; if(target.field==='x'||target.field==='y') landing.placement[target.field]=value; else landing[target.field]=value; }
  else if(target.kind==='surface-opening') surfaceOpeningIn(draft,target.id)[target.field]=value;
  else surfaceOpeningIn(draft,target.id).attachments.find(item=>item.roomId===target.roomId&&item.surface===target.surface)!.placement[target.field]=value;
}
export const stairFieldKind = (target:StairFieldTarget) => target.field==='x'||target.field==='y'?'coordinate' as const:'dimension' as const;
export function getStairField(draft:PhysicalDraft,target:StairFieldTarget):FieldDraft {
  const value=stairMeasurementAt(draft,target), key=stairFieldKey(target);
  return draft.stairFields && Object.hasOwn(draft.stairFields,key)?draft.stairFields[key].raw:{text:committedFieldText(value,draft.displayUnit),unit:draft.displayUnit,dirty:false};
}
export function setStairRaw(draft:PhysicalDraft,target:StairFieldTarget,raw:FieldDraft):void {
  const key=stairFieldKey(target); draft.stairFields=Object.fromEntries([...Object.entries(draft.stairFields??{}).filter(([id])=>id!==key),[key,{target:copy(target),raw:copy(raw)}]]);
}
export function editStairField(draft:PhysicalDraft,target:StairFieldTarget,text:string):PhysicalDraft {
  const raw=getStairField(draft,target); if(typeof text!=='string') fail('Enter a measurement as text.'); if(raw.text===text)return draft;
  const next=copyDraftForEdit(draft);setStairRaw(next,target,{...raw,text,dirty:true});return next;
}
export function stairFieldError(draft:PhysicalDraft,target:StairFieldTarget):string|null {
  const raw=getStairField(draft,target);if(!raw.text.trim())return null;
  const result=parseMeasurement(raw.text,{selectedUnit:raw.unit,kind:stairFieldKind(target)});if(!result.ok)return result.message;
  if(stairFieldKind(target)==='coordinate'){try{const next=copy(draft);setStairMeasurement(next,target,result.measurement);fitField(next,target);}catch(error){return error instanceof Error?error.message:'This position cannot be applied.';}}
  return null;
}
function finish(before:PhysicalDraft,next:PhysicalDraft,action:StairAction['action'],at:string,input?:StairAction['input']):PhysicalDraft {
  if(!z.string().datetime({offset:true}).safeParse(at).success)fail('A valid action timestamp is required.');
  assertSupportedPhysicalDocument(next.document);
  const old=stairsIn(before), following=stairsIn(next);
  const events:StairAction[]=[];
  for(const object of ['stair','surface-opening'] as const) {
    const a=object==='stair'?old.stairs:old.surfaceOpenings,b=object==='stair'?following.stairs:following.surfaceOpenings;
    for(const id of Array.from(new Set([...a,...b].map(item=>item.id)))) {
      const prior=a.find(item=>item.id===id)??null,after=b.find(item=>item.id===id)??null;
      if(!equal(prior,after))events.push({object,id,action:prior===null?'add':after===null?'delete':action,at,before:copy(prior),after:copy(after),...(input?{input:copy(input)}:{})});
    }
  }
  if(events.length)next.stairEvents=[...(next.stairEvents??[]),...events];
  return next;
}
export function commitStairField(draft:PhysicalDraft,target:StairFieldTarget,at:string):PhysicalDraft {
  const raw=getStairField(draft,target);if(!raw.dirty)return draft;
  const before=stairMeasurementAt(draft,target);
  let value:Dimension;
  if(!raw.text.trim())value=unknownMeasurement('Measurement explicitly cleared in the stair editor.');
  else {const result=parseMeasurement(raw.text,{selectedUnit:raw.unit,kind:stairFieldKind(target)});if(!result.ok)return draft;value=result.measurement;}
  const next=copyDraftForEdit(draft);
  // Re-entering the same physical value resolves presentation without replacing its provenance/approval.
  if(!(before.state==='known'&&value.state==='known'&&equivalentMm(before.valueMm,value.valueMm))&&!(before.state==='unknown'&&value.state==='unknown'&&!raw.text.trim()))setStairMeasurement(next,target,value);
  if(stairFieldKind(target)==='coordinate')fitField(next,target);
  const committed=stairMeasurementAt(next,target);
  setStairRaw(next,target,raw.unit===draft.displayUnit&&raw.text.trim()?{...raw,dirty:false}:{text:committedFieldText(committed,draft.displayUnit),unit:draft.displayUnit,dirty:false});
  return finish(draft,next,raw.text.trim()?'correct':'clear',at,{target,text:raw.text,unit:raw.unit});
}
export function revertStairField(draft:PhysicalDraft,target:StairFieldTarget):PhysicalDraft {
  const raw=getStairField(draft,target);if(!raw.dirty)return draft;
  const next=copyDraftForEdit(draft);setStairRaw(next,target,{text:committedFieldText(stairMeasurementAt(next,target),next.displayUnit),unit:next.displayUnit,dirty:false});return next;
}
export function reformatStairFields(draft:PhysicalDraft,unit:InputUnit):void {
  for(const entry of Object.values(draft.stairFields??{}))if(!entry.raw.dirty)entry.raw={text:committedFieldText(stairMeasurementAt(draft,entry.target),unit),unit,dirty:false};
}
export function maskStairFields(draft:PhysicalDraft,document:PhysicalDraft['document']):void {
  if((document.schemaVersion !== 4 && document.schemaVersion !== 5))return;
  const preview={...draft,document};
  for(const entry of Object.values(draft.stairFields??{}))if(entry.raw.dirty)setStairMeasurement(preview,entry.target,unknownMeasurement('Finish editing '+entry.target.field+' before calculating its dependent finish quantity.'));
}
function guardRaw(draft:PhysicalDraft,predicate:(target:StairFieldTarget)=>boolean):void {
  if(Object.values(draft.stairFields??{}).some(entry=>entry.raw.dirty&&predicate(entry.target)))fail('Apply or Revert the pending stair or surface-opening field before changing its placement, attachment, or deleting its owner.');
}
export function removeStairRaw(draft:PhysicalDraft,predicate:(target:StairFieldTarget)=>boolean):void {
  if(draft.stairFields)draft.stairFields=Object.fromEntries(Object.entries(draft.stairFields).filter(([,entry])=>!predicate(entry.target)));
}
const belongs = (target:StairFieldTarget,object:'stair'|'surface-opening',id:string) => target.id===id && (object==='stair'?!target.kind.startsWith('surface-'):target.kind.startsWith('surface-'));
function preserveUnchangedCoordinates(prior:StairPlacement,next:StairPlacement):StairPlacement {
  const result=copy(next);
  for(const field of ['x','y'] as const){const a=prior[field],b=result[field];if(a.state==='known'&&b.state==='known'&&equivalentMm(a.valueMm,b.valueMm))result[field]=copy(a);}
  return result;
}
export function createRoomLocalPlacement(xMm?:number,yMm?:number,rotation:StairPlacement['rotation']=0):StairPlacement {
  const measured=(value:number|undefined,label:string) => {
    if(value===undefined)return unknownMeasurement(label+' has not been entered.');
    // A pointer-produced numeric value carries no claim about typed decimal precision.
    const candidate={state:'known' as const,valueMm:value,provenance:{source:'manual' as const,input:null,unit:'mm' as const,components:[{text:String(value),unit:'mm' as const,precision:{kind:'unavailable' as const}}],confirmation:{status:'unconfirmed' as const}}};
    const validated=coordinateMeasurementSchema.safeParse(candidate);if(!validated.success)fail('The room-local position is outside the supported finite range.');return validated.data;
  };
  return placementSchema.parse({anchor:'room-local-top-left',x:measured(xMm,'Room-local X'),y:measured(yMm,'Room-local Y'),rotation});
}
function fit(next:PhysicalDraft,kind:'stair'|'landing'|'surface-opening',id:string,role?:EndpointRole):void {
  const report=validateStairGeometry(next.document);
  const invalid=report.checks.filter(check=>check.kind===kind&&check.id===id&&(!role||check.role===role)&&check.status==='invalid');
  if(invalid.length)fail(invalid.map(check=>check.message).join(' '));
}
function fitField(draft:PhysicalDraft,target:StairFieldTarget):void {
  if(target.kind==='endpoint')fit(draft,'stair',target.id,target.role);
  else if(target.kind==='landing')fit(draft,'landing',stairIn(draft,target.id).landings[target.role]!.id,target.role);
  else if(target.kind==='surface-placement')fit(draft,'surface-opening',target.id);
}
function name(text:string):string {if(typeof text!=='string'||!text.trim()||/[\u0000-\u001f\u007f]/.test(text))fail('Enter a nonblank name.');return text.trim();}
export function upgradeExistingDraftToStairs(draft:PhysicalDraft,newId:string,at:string):PhysicalDraft {
  if(draft.document.schemaVersion!==3)fail('Enable stairs from a building-level draft. The existing draft is preserved.');
  if(!newId.trim()||newId===draft.id||!z.string().datetime({offset:true}).safeParse(at).success)fail('A detached stair copy needs a new identity and valid timestamp.');
  const next=copy(draft);next.id=newId;next.localEditRevision=0;next.document=upgradePhysicalDocumentToStairs(draft.document);
  next.request.policy.version=QUANTITY_POLICY_VERSION_V4;
  if(next.openingDeleteUndo){next.openingDeleteUndo.requestBefore.policy.version=QUANTITY_POLICY_VERSION_V4;next.openingDeleteUndo.requestAfter.policy.version=QUANTITY_POLICY_VERSION_V4;}
  next.stairUpgradeLineage={version:'physical-stair-upgrade-v1',sourceDraftId:draft.id,sourceRevision:draft.localEditRevision,at,originalDraft:copy(draft)};
  return next;
}
export function addStair(draft:PhysicalDraft,id:string,label:string,lowerEndpoint:StairEndpoint,at:string):PhysicalDraft {
  const next=copyDraftForEdit(draft),stair=createStairAssembly(id,name(label));stair.endpoints.lower=stairEndpointSchema.parse(lowerEndpoint);stairsIn(next).stairs.push(stair);return finish(draft,next,'add',at);
}
export function renameStair(draft:PhysicalDraft,id:string,label:string,at=new Date().toISOString()):PhysicalDraft {
  const value=name(label);if(stairIn(draft,id).name===value)return draft;const next=copyDraftForEdit(draft);stairIn(next,id).name=value;return finish(draft,next,'rename',at);
}
export function renameSurfaceOpening(draft:PhysicalDraft,id:string,label:string,at=new Date().toISOString()):PhysicalDraft {
  const value=name(label);if(surfaceOpeningIn(draft,id).name===value)return draft;const next=copyDraftForEdit(draft);surfaceOpeningIn(next,id).name=value;return finish(draft,next,'rename',at);
}
export function setStairEndpoint(draft:PhysicalDraft,id:string,role:EndpointRole,endpoint:StairEndpoint,at:string):PhysicalDraft {
  endpoint=stairEndpointSchema.parse(endpoint);const selected=stairIn(draft,id),old=selected.endpoints[role];if(equal(old,endpoint))return draft;
  if(endpoint.state==='modeled'){const other=selected.endpoints[role==='lower'?'upper':'lower'];if(other.state==='modeled'&&other.levelId===endpoint.levelId)fail('Lower and upper stair endpoints must reference different building levels. The existing endpoint is unchanged.');if((draft.document.schemaVersion !== 4 && draft.document.schemaVersion !== 5)||!draft.document.rooms.some(room=>room.id===endpoint.roomId)||draft.document.buildingLevels.roomLevels[endpoint.roomId]!==endpoint.levelId)fail('Choose an existing room owned by the selected endpoint level.');}
  guardRaw(draft,t=>t.id===id&&(t.kind==='endpoint'||t.kind==='landing')&&t.role===role);
  const changedHost=old.state!==endpoint.state||(old.state==='modeled'&&endpoint.state==='modeled'&&(old.roomId!==endpoint.roomId||old.levelId!==endpoint.levelId));
  if(changedHost&&Object.values(stairIn(draft,id).surfaceImpacts[role]).some(impact=>impact.state==='deduct'))fail('Resolve this endpoint’s linked surface deductions before changing its host. Existing surface openings are preserved.');
  const next=copyDraftForEdit(draft);stairIn(next,id).endpoints[role]=copy(endpoint);
  if(changedHost){const unknown=()=>({state:'unresolved' as const,reason:'Endpoint host changed; review its finish-surface impact.'});stairIn(next,id).surfaceImpacts[role]={floor:unknown(),ceiling:unknown()};}
  removeStairRaw(next,t=>t.id===id&&t.kind==='endpoint'&&t.role===role);
  fit(next,'stair',id,role);return finish(draft,next,'endpoint',at);
}
export function setStairPlacement(draft:PhysicalDraft,id:string,role:EndpointRole,placement:StairPlacement,at:string):PhysicalDraft {
  const old=stairIn(draft,id).endpoints[role];if(old.state!=='modeled')fail('Choose the endpoint’s modeled room first.');
  placement=preserveUnchangedCoordinates(old.placement,placementSchema.parse(placement));if(equal(old.placement,placement))return draft;
  guardRaw(draft,t=>t.id===id&&t.kind==='endpoint'&&t.role===role);
  const next=copyDraftForEdit(draft),endpoint=stairIn(next,id).endpoints[role];if(endpoint.state==='modeled')endpoint.placement=copy(placement);
  fit(next,'stair',id,role);removeStairRaw(next,t=>t.id===id&&t.kind==='endpoint'&&t.role===role);return finish(draft,next,'placement',at);
}
export function addLanding(draft:PhysicalDraft,id:string,role:EndpointRole,landingId:string,at:string):PhysicalDraft {
  const stair=stairIn(draft,id);if(stair.landings[role])fail('This endpoint already has a landing.');if(stair.endpoints[role].state!=='modeled')fail('Model the endpoint before adding its landing.');
  const next=copyDraftForEdit(draft);stairIn(next,id).landings[role]={id:landingId,width:unknownMeasurement('Landing width has not been entered.'),depth:unknownMeasurement('Landing depth has not been entered.'),placement:createRoomLocalPlacement()};return finish(draft,next,'landing',at);
}
export function removeLanding(draft:PhysicalDraft,id:string,role:EndpointRole,at:string):PhysicalDraft {
  if(!stairIn(draft,id).landings[role])return draft;guardRaw(draft,t=>t.kind==='landing'&&t.id===id&&t.role===role);
  const next=copyDraftForEdit(draft);stairIn(next,id).landings[role]=null;removeStairRaw(next,t=>t.kind==='landing'&&t.id===id&&t.role===role);return finish(draft,next,'landing',at);
}
export function setLandingPlacement(draft:PhysicalDraft,id:string,role:EndpointRole,placement:StairPlacement,at:string):PhysicalDraft {
  const landing=stairIn(draft,id).landings[role];if(!landing)fail('This landing is no longer present.');placement=preserveUnchangedCoordinates(landing.placement,placementSchema.parse(placement));if(equal(landing.placement,placement))return draft;
  guardRaw(draft,t=>t.kind==='landing'&&t.id===id&&t.role===role&&(t.field==='x'||t.field==='y'));
  const next=copyDraftForEdit(draft);stairIn(next,id).landings[role]!.placement=copy(placement);fit(next,'landing',landing.id,role);
  removeStairRaw(next,t=>t.kind==='landing'&&t.id===id&&t.role===role&&(t.field==='x'||t.field==='y'));return finish(draft,next,'placement',at);
}
export function addSurfaceOpening(draft:PhysicalDraft,id:string,label:string,attachment:SurfaceOpening['attachments'][number],associatedStairId:string|null,at:string):PhysicalDraft {
  const next=copyDraftForEdit(draft),opening=createSurfaceOpening(id,attachment.roomId,attachment.surface,name(label));opening.attachments=[copy(attachment)];opening.associatedStairId=associatedStairId;stairsIn(next).surfaceOpenings.push(opening);return finish(draft,next,'add',at);
}
export function setSurfaceOpeningAttachment(draft:PhysicalDraft,id:string,attachments:SurfaceOpening['attachments'],at:string):PhysicalDraft {
  const opening=surfaceOpeningIn(draft,id);attachments=surfaceOpeningSchema.shape.attachments.parse(attachments).map(item=>{const prior=opening.attachments.find(old=>old.roomId===item.roomId&&old.surface===item.surface);return prior?{...item,placement:preserveUnchangedCoordinates(prior.placement,item.placement)}:item;});if(equal(opening.attachments,attachments))return draft;
  guardRaw(draft,t=>t.kind==='surface-placement'&&t.id===id);
  const next=copyDraftForEdit(draft);surfaceOpeningIn(next,id).attachments=copy(attachments);assertSupportedPhysicalDocument(next.document);fit(next,'surface-opening',id);
  removeStairRaw(next,t=>t.kind==='surface-placement'&&t.id===id);return finish(draft,next,'attachments',at);
}
export function setStairAlignment(draft:PhysicalDraft,id:string,alignment:StairAssembly['alignment'],at:string):PhysicalDraft {
  if(equal(stairIn(draft,id).alignment,alignment))return draft;const next=copyDraftForEdit(draft);stairIn(next,id).alignment=copy(alignment);return finish(draft,next,'alignment',at);
}
export function setSurfaceImpact(draft:PhysicalDraft,id:string,role:EndpointRole,surface:'floor'|'ceiling',impact:SurfaceImpact,at:string):PhysicalDraft {
  impact=impactSchema.parse(impact);if(equal(stairIn(draft,id).surfaceImpacts[role][surface],impact))return draft;
  const next=copyDraftForEdit(draft);stairIn(next,id).surfaceImpacts[role][surface]=copy(impact);return finish(draft,next,'impact',at);
}
export function deleteSurfaceOpening(draft:PhysicalDraft,id:string,at:string):PhysicalDraft {
  surfaceOpeningIn(draft,id);if(Object.values(draft.pendingInputs?.buildingNames??{}).some(raw=>raw.kind==='surface-opening'&&raw.id===id&&raw.dirty))throw new PhysicalDraftError('PENDING_INPUT_INVALID','Apply or Revert the pending surface opening name before deleting it.');guardRaw(draft,t=>belongs(t,'surface-opening',id));const next=copyDraftForEdit(draft),contract=stairsIn(next);
  contract.surfaceOpenings=contract.surfaceOpenings.filter(item=>item.id!==id);removeStairRaw(next,t=>belongs(t,'surface-opening',id));
  for(const stair of contract.stairs)for(const role of ['lower','upper'] as const)for(const surface of ['floor','ceiling'] as const){const impact=stair.surfaceImpacts[role][surface];if(impact.state==='deduct'&&impact.openingIds.includes(id))stair.surfaceImpacts[role][surface]={state:'unresolved',reason:'A referenced surface opening was deleted; review this finish-surface impact.'};}
  return finish(draft,next,'impact',at);
}
export function deleteStair(draft:PhysicalDraft,id:string,at:string):PhysicalDraft {
  stairIn(draft,id);if(Object.values(draft.pendingInputs?.buildingNames??{}).some(raw=>raw.kind==='stair'&&raw.id===id&&raw.dirty))throw new PhysicalDraftError('PENDING_INPUT_INVALID','Apply or Revert the pending stair name before deleting it.');guardRaw(draft,t=>belongs(t,'stair',id));const next=copyDraftForEdit(draft),contract=stairsIn(next);
  contract.stairs=contract.stairs.filter(item=>item.id!==id);removeStairRaw(next,t=>belongs(t,'stair',id));
  for(const opening of contract.surfaceOpenings)if(opening.associatedStairId===id)opening.associatedStairId=null;
  return finish(draft,next,'unlink',at);
}
export function stairRoomDependencies(draft:PhysicalDraft,roomId:string):string[] {
  if((draft.document.schemaVersion !== 4 && draft.document.schemaVersion !== 5))return [];
  return [...draft.document.stairsContract.stairs.flatMap(stair=>(['lower','upper'] as const).flatMap(role=>{const endpoint=stair.endpoints[role];return endpoint.state==='modeled'&&endpoint.roomId===roomId?[`${stair.name||stair.id} (${role} endpoint${stair.landings[role]?' and landing':''})`]:[];})),
    ...draft.document.stairsContract.surfaceOpenings.filter(opening=>opening.attachments.some(item=>item.roomId===roomId)).map(opening=>`${opening.name||opening.id} (surface opening)`)] ;
}
export function validateStairEditorState(draft:PhysicalDraft):string|null {
  if((draft.document.schemaVersion !== 4 && draft.document.schemaVersion !== 5))return draft.stairFields||draft.stairEvents||draft.stairUpgradeLineage?'Stair editor state requires the explicit stairs document version.':null;
  for(const [key,entry] of Object.entries(draft.stairFields??{})) {
    if(key!==stairFieldKey(entry.target))return 'Stored stair field identity is inconsistent.';
    let measurement:Dimension;try{measurement=stairMeasurementAt(draft,entry.target);}catch{return 'Stored stair fields reference a missing target.';}
    if(!entry.raw.dirty){if(measurement.state!=='known'){if(entry.raw.text.trim())return 'An unresolved stair measurement cannot have committed text.';}
      else {const parsed=parseMeasurement(entry.raw.text,{selectedUnit:entry.raw.unit,kind:stairFieldKind(entry.target)});if(entry.raw.text!==committedFieldText(measurement,entry.raw.unit)&&(!parsed.ok||!equivalentMm(parsed.measurement.valueMm,measurement.valueMm)))return 'Stored stair text disagrees with its committed measurement.';}}
  }
  return null;
}
