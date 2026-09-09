import { z } from 'zod';
import { stairAssemblySchema,surfaceOpeningSchema,stairEndpointSchema,landingSchema,impactSchema } from '@shared/domain/stairs';
import { dimensionSchema } from '@shared/domain/measurements';
import { canonicalJson,copyJson } from '@shared/quantities/canonicalJson';
import { stairsIn,stairRawEntrySchema,stairMeasurementAt,stairFieldKey,setStairRaw,removeStairRaw,stairRoomDependencies,type StairRawEntry } from './stairCommands';
import { committedFieldText,PhysicalDraftError,type PhysicalDraft } from './state';
const part=z.enum(['name','width','run','totalRise','length','geometry','detail','associatedStairId','attachments','alignment','endpoint-lower','endpoint-upper','landing-lower','landing-upper','impact-lower-floor','impact-lower-ceiling','impact-upper-floor','impact-upper-ceiling']);
export const stairObjectTargetSchema=z.object({kind:z.literal('stair-object'),object:z.enum(['stair','surface-opening']),id:z.string().min(1)}).strict();
export const stairPartTargetSchema=z.object({kind:z.literal('stair-part'),object:z.enum(['stair','surface-opening']),id:z.string().min(1),part}).strict();
export type StairHistoryTarget=z.infer<typeof stairObjectTargetSchema>|z.infer<typeof stairPartTargetSchema>;
const stairParts=['name','width','run','totalRise','alignment','endpoint-lower','endpoint-upper','landing-lower','landing-upper','impact-lower-floor','impact-lower-ceiling','impact-upper-floor','impact-upper-ceiling'] as const;
const surfaceParts=['name','width','length','geometry','detail','associatedStairId','attachments'] as const;
export const stairHistoryParts=(object:StairHistoryTarget['object'])=>object==='stair'?stairParts:surfaceParts;
const copy=<T,>(value:T):T=>copyJson(value) as unknown as T;
const equal=(a:unknown,b:unknown)=>a!==undefined&&b!==undefined&&canonicalJson(a)===canonicalJson(b);
const owns=(entry:StairRawEntry,target:StairHistoryTarget)=>entry.target.id===target.id&&(target.object==='stair'?!entry.target.kind.startsWith('surface-'):entry.target.kind.startsWith('surface-'));
const objectSchema=(object:StairHistoryTarget['object'])=>object==='stair'?stairAssemblySchema:surfaceOpeningSchema;
export function stairPartValue(entity:any,part:string):unknown {
  const [kind,role,surface]=part.split('-');
  return kind==='endpoint'?entity.endpoints[role]:kind==='landing'?entity.landings[role]:kind==='impact'?entity.surfaceImpacts[role][surface]:entity[part];
}
export function setStairPart(entity:any,part:string,value:unknown):void {
  const [kind,role,surface]=part.split('-');
  if(kind==='endpoint')entity.endpoints[role]=copy(value);else if(kind==='landing')entity.landings[role]=copy(value);
  else if(kind==='impact')entity.surfaceImpacts[role][surface]=copy(value);else entity[part]=copy(value);
}
export function validStairHistoryValue(target:StairHistoryTarget,value:unknown):boolean {
  if(target.kind==='stair-object')return value===null||z.object({entity:objectSchema(target.object),index:z.number().int().nonnegative(),fields:z.array(stairRawEntrySchema)}).strict().safeParse(value).success&&(value as any).entity.id===target.id;
  if(!(stairHistoryParts(target.object) as readonly string[]).includes(target.part))return false;
  const schema=target.part.startsWith('endpoint-')?stairEndpointSchema:target.part.startsWith('landing-')?landingSchema.nullable():target.part.startsWith('impact-')?impactSchema:
    ['width','run','totalRise','length'].includes(target.part)?dimensionSchema:target.part==='alignment'?stairAssemblySchema.shape.alignment:
    target.part==='attachments'?surfaceOpeningSchema.shape.attachments:target.part==='geometry'?surfaceOpeningSchema.shape.geometry:
    target.part==='associatedStairId'?surfaceOpeningSchema.shape.associatedStairId:z.string();
  return schema.safeParse(value).success;
}
export function stairHistoryValue(draft:PhysicalDraft,target:StairHistoryTarget):unknown {
  if((draft.document.schemaVersion !== 4 && draft.document.schemaVersion !== 5))return target.kind==='stair-object'?null:undefined;
  const items=target.object==='stair'?draft.document.stairsContract.stairs:draft.document.stairsContract.surfaceOpenings;
  const entity=items.find(item=>item.id===target.id);
  return target.kind==='stair-object'?entity?{entity,index:items.indexOf(entity as any),fields:Object.values(draft.stairFields??{}).filter(entry=>owns(entry,target))}:null:entity?stairPartValue(entity,target.part):undefined;
}
export function provisionalStairValue(value:unknown,current?:unknown):unknown {
  if(equal(value,current))return copy(value);
  if(value===null||typeof value!=='object')return copy(value);
  if(Array.isArray(value))return value.map((item,index)=>{
    const list=Array.isArray(current)?current:[];
    const prior=item&&typeof item==='object'&&'roomId' in item&&'surface' in item
      ?list.find(candidate=>candidate?.roomId===item.roomId&&candidate?.surface===item.surface):list[index];
    return provisionalStairValue(item,prior);
  });
  const result=copy(value) as any,prior=current&&typeof current==='object'?current as any:{};
  if(result.state==='known'&&result.provenance)result.provenance.confirmation={status:'unconfirmed'};
  else for(const key of Object.keys(result))result[key]=provisionalStairValue(result[key],prior[key]);
  return result;
}
export function guardStairHistory(draft:PhysicalDraft,target:StairHistoryTarget,restored:unknown):void {
  const fields=Object.values(draft.stairFields??{}).filter(entry=>owns(entry,target));
  if(target.kind==='stair-object'){
    if(fields.some(entry=>entry.raw.dirty))throw new PhysicalDraftError('HISTORY_CONFLICT','Apply or Revert the pending stair/surface-opening field before removing or restoring its owner.');
    return;
  }
  // Only raw fields whose physical value or owner would change conflict with this inverse.
  const trial=copy(draft),contract=stairsIn(trial),entity=(target.object==='stair'?contract.stairs:contract.surfaceOpenings).find(item=>item.id===target.id)!;
  setStairPart(entity,target.part,restored);
  for(const entry of fields)if(entry.raw.dirty){
    let same=false;try{same=equal(stairMeasurementAt(draft,entry.target),stairMeasurementAt(trial,entry.target));}catch{}
    if(!same)throw new PhysicalDraftError('HISTORY_CONFLICT','Apply or Revert the pending stair/surface-opening field before Undo or Redo.');
  }
}
export function applyStairHistory(draft:PhysicalDraft,target:StairHistoryTarget,restored:any):void {
  const before=copy(draft),contract=stairsIn(draft);
  if(target.kind==='stair-object'){
    if(target.object==='stair'){
      if(restored===null){contract.stairs=contract.stairs.filter(item=>item.id!==target.id);}
      else {if(restored.index>contract.stairs.length)throw new Error('The original stair order cannot be restored.');contract.stairs.splice(restored.index,0,copy(restored.entity));}
    }else{
      if(restored===null){contract.surfaceOpenings=contract.surfaceOpenings.filter(item=>item.id!==target.id);}
      else{if(restored.index>contract.surfaceOpenings.length)throw new Error('The original surface-opening order cannot be restored.');contract.surfaceOpenings.splice(restored.index,0,copy(restored.entity));}
    }
    removeStairRaw(draft,t=>owns({target:t,raw:{text:'',unit:'ft',dirty:false}},target));
    if(restored)for(const entry of restored.fields as StairRawEntry[])setStairRaw(draft,entry.target,entry.raw.dirty?entry.raw:{text:committedFieldText(stairMeasurementAt(draft,entry.target),draft.displayUnit),unit:draft.displayUnit,dirty:false});
  }else{
    const entity=(target.object==='stair'?contract.stairs:contract.surfaceOpenings).find(item=>item.id===target.id)!;setStairPart(entity,target.part,restored);
    for(const entry of Object.values(draft.stairFields??{}).filter(entry=>owns(entry,target))){
      try{const value=stairMeasurementAt(draft,entry.target);if(!entry.raw.dirty&&!equal(value,stairMeasurementAt(before,entry.target)))setStairRaw(draft,entry.target,{text:committedFieldText(value,draft.displayUnit),unit:draft.displayUnit,dirty:false});}
      catch{removeStairRaw(draft,t=>stairFieldKey(t)===stairFieldKey(entry.target));}
    }
  }
}
