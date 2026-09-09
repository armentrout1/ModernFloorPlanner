import { z } from 'zod';
import { roomUseSchema,functionalZoneSchema,cabinetBlockSchema,layoutPlacementSchema } from '@shared/domain/layout';
import { dimensionSchema } from '@shared/domain/measurements';
import { canonicalJson,copyJson } from '@shared/quantities/canonicalJson';
import { committedFieldText,PhysicalDraftError,type PhysicalDraft } from './state';
import { layoutIn,layoutRawEntrySchema,layoutTextEntrySchema,layoutMeasurementAt,layoutFieldKey,setLayoutRaw,
  removeLayoutRaw,getLayoutText,layoutTextKey,type LayoutRawEntry,type LayoutTextEntry } from './layoutCommands';

const id=z.string().min(1),object=z.enum(['zone','cabinet']);
export const roomUseTargetSchema=z.object({kind:z.literal('room-use'),id}).strict();
export const layoutObjectTargetSchema=z.object({kind:z.literal('layout-object'),object,id}).strict();
export const layoutPartTargetSchema=z.object({kind:z.literal('layout-part'),object,id,
  part:z.enum(['name','use','width','length','depth','height','placement','zoneId','roomId'])}).strict();
export type LayoutHistoryTarget=z.infer<typeof roomUseTargetSchema>|z.infer<typeof layoutObjectTargetSchema>|z.infer<typeof layoutPartTargetSchema>;
const copy=<T,>(value:T):T=>copyJson(value) as unknown as T;
const equal=(a:unknown,b:unknown)=>a!==undefined&&b!==undefined&&canonicalJson(a)===canonicalJson(b);
const zoneParts=['name','use','width','length','placement','roomId'] as const;
const cabinetParts=['name','length','depth','height','placement','zoneId','roomId'] as const;
export const layoutHistoryParts=(object:'zone'|'cabinet')=>object==='zone'?zoneParts:cabinetParts;
const objectSchema=(object:'zone'|'cabinet')=>object==='zone'?functionalZoneSchema:cabinetBlockSchema;
function owns(entry:LayoutRawEntry|LayoutTextEntry,target:Exclude<LayoutHistoryTarget,{kind:'room-use'}>):boolean {
  return entry.target.id===target.id&&(entry.target.kind===target.object||(target.object==='zone'&&entry.target.kind==='zone-use'));
}
export function validLayoutHistoryValue(target:LayoutHistoryTarget,value:unknown):boolean {
  if(target.kind==='room-use')return value===null||roomUseSchema.safeParse(value).success;
  if(target.kind==='layout-object')return value===null||z.object({entity:objectSchema(target.object),index:z.number().int().nonnegative(),
    fields:z.array(layoutRawEntrySchema),texts:z.array(layoutTextEntrySchema)}).strict().safeParse(value).success&&(value as any).entity.id===target.id;
  if(!(layoutHistoryParts(target.object) as readonly string[]).includes(target.part))return false;
  const schema=target.part==='use'?roomUseSchema:target.part==='placement'?layoutPlacementSchema:
    ['width','length','depth','height'].includes(target.part)?dimensionSchema:target.part==='zoneId'?id.nullable():z.string();
  return schema.safeParse(value).success;
}
export function layoutHistoryValue(draft:PhysicalDraft,target:LayoutHistoryTarget):unknown {
  if(draft.document.schemaVersion!==5)return target.kind==='layout-part'?undefined:null;
  if(target.kind==='room-use')return Object.hasOwn(draft.document.layoutContract.roomUses,target.id)?draft.document.layoutContract.roomUses[target.id]:null;
  const items=target.object==='zone'?draft.document.layoutContract.zones:draft.document.layoutContract.cabinetBlocks;
  const entity=items.find(item=>item.id===target.id);
  return target.kind==='layout-object'?entity?{entity,index:items.indexOf(entity as any),fields:Object.values(draft.layoutFields??{}).filter(entry=>owns(entry,target)),texts:Object.values(draft.layoutTexts??{}).filter(entry=>owns(entry,target))}:null:entity?(entity as any)[target.part]:undefined;
}
export function guardLayoutHistory(draft:PhysicalDraft,target:LayoutHistoryTarget,restored:unknown):void {
  if(target.kind==='room-use'){
    const key=layoutTextKey({kind:'room-use',id:target.id,field:'customLabel'});
    if(draft.layoutTexts?.[key]?.dirty)throw new PhysicalDraftError('HISTORY_CONFLICT','Apply or Revert the pending custom room-use label before Undo or Redo.');return;
  }
  const fields=Object.values(draft.layoutFields??{}).filter(entry=>owns(entry,target)),texts=Object.values(draft.layoutTexts??{}).filter(entry=>owns(entry,target));
  if(target.kind==='layout-object'){
    if(fields.some(entry=>entry.raw.dirty)||texts.some(entry=>entry.dirty))throw new PhysicalDraftError('HISTORY_CONFLICT','Apply or Revert pending layout fields before removing or restoring their owner.');return;
  }
  if(texts.some(entry=>entry.dirty&&((target.part==='name'&&entry.target.field==='name')||(target.part==='use'&&entry.target.field==='customLabel'))))throw new PhysicalDraftError('HISTORY_CONFLICT','Apply or Revert the pending layout label before Undo or Redo.');
  const trial=copy(draft),contract=layoutIn(trial),entity=(target.object==='zone'?contract.zones:contract.cabinetBlocks).find(item=>item.id===target.id)!;
  (entity as any)[target.part]=copy(restored);
  for(const entry of fields)if(entry.raw.dirty){let same=false;try{same=equal(layoutMeasurementAt(draft,entry.target),layoutMeasurementAt(trial,entry.target));}catch{}
    if(!same||target.part==='roomId')throw new PhysicalDraftError('HISTORY_CONFLICT','Apply or Revert the pending layout measurement before Undo or Redo.');}
}
export function applyLayoutHistory(draft:PhysicalDraft,target:LayoutHistoryTarget,restored:any):void {
  const before=copy(draft),contract=layoutIn(draft);
  if(target.kind==='room-use'){
    contract.roomUses=Object.fromEntries([...Object.entries(contract.roomUses).filter(([id])=>id!==target.id),...(restored===null?[]:[[target.id,copy(restored)]])]);
    if(draft.layoutTexts)draft.layoutTexts=Object.fromEntries(Object.entries(draft.layoutTexts).filter(([,entry])=>entry.target.kind!=='room-use'||entry.target.id!==target.id));return;
  }
  if(target.kind==='layout-object'){
    if(target.object==='zone'){
      if(restored===null)contract.zones=contract.zones.filter(item=>item.id!==target.id);
      else{if(restored.index>contract.zones.length)throw new Error('The original zone order cannot be restored.');contract.zones.splice(restored.index,0,copy(restored.entity));}
    }else{
      if(restored===null)contract.cabinetBlocks=contract.cabinetBlocks.filter(item=>item.id!==target.id);
      else{if(restored.index>contract.cabinetBlocks.length)throw new Error('The original cabinet order cannot be restored.');contract.cabinetBlocks.splice(restored.index,0,copy(restored.entity));}
    }
    removeLayoutRaw(draft,target.object,target.id);
    if(restored){for(const entry of restored.fields as LayoutRawEntry[])setLayoutRaw(draft,entry.target,entry.raw.dirty?entry.raw:{text:committedFieldText(layoutMeasurementAt(draft,entry.target),draft.displayUnit),unit:draft.displayUnit,dirty:false});
      for(const entry of restored.texts as LayoutTextEntry[])draft.layoutTexts=Object.fromEntries([...Object.entries(draft.layoutTexts??{}),[layoutTextKey(entry.target),copy(entry)]]);}
  }else{
    const entity=(target.object==='zone'?contract.zones:contract.cabinetBlocks).find(item=>item.id===target.id)!;(entity as any)[target.part]=copy(restored);
    for(const entry of Object.values(draft.layoutFields??{}).filter(entry=>owns(entry,target))){const value=layoutMeasurementAt(draft,entry.target);
      if(!entry.raw.dirty&&!equal(value,layoutMeasurementAt(before,entry.target)))setLayoutRaw(draft,entry.target,{text:committedFieldText(value,draft.displayUnit),unit:draft.displayUnit,dirty:false});}
    if(draft.layoutTexts)for(const [key,entry]of Object.entries(draft.layoutTexts))if(owns(entry,target)&&!entry.dirty&&((target.part==='name'&&entry.target.field==='name')||(target.part==='use'&&entry.target.field==='customLabel'))){delete draft.layoutTexts[key];}
  }
  delete draft.layoutNotice;
}
