import { Button } from '@/components/ui/button';
import type { PhysicalDraft } from './state';
import { activeLevelId } from './levelCommands';
import { addStair, addSurfaceOpening, createRoomLocalPlacement } from './stairCommands';
import type { StairChange } from './StairInspector';

export type BuildingSelection = { kind:'stair'|'surface-opening'|'zone'|'cabinet'; id:string; roomId:string; role?:'lower'|'upper'; surface?:'floor'|'ceiling' };
export function StairControls({draft,roomId,selected,update,onUpgrade,onSelect,blocked}:{
  draft:PhysicalDraft;roomId:string|null;selected:BuildingSelection|null;update:StairChange;onUpgrade:()=>void;
  onSelect:(selection:BuildingSelection)=>void;blocked:boolean;
}) {
  if(draft.document.schemaVersion===2)return null;
  if(draft.document.schemaVersion===3)return <div className="rounded-lg border bg-white p-3 text-sm">
    <Button variant="outline" disabled={blocked} data-physical-layout-control onClick={onUpgrade}>Enable stairs and surface openings</Button>
    <p className="mt-2 text-xs text-slate-600">Creates a working copy of this current building draft. The original draft and captured quantities stay unchanged.</p>
  </div>;
  const doc=draft.document,levelId=activeLevelId(draft),visibleRooms=new Set(doc.rooms.filter(room=>doc.buildingLevels.roomLevels[room.id]===levelId).map(room=>room.id));
  const stairs=doc.stairsContract.stairs.flatMap(stair=>(['lower','upper'] as const).flatMap(role=>{const endpoint=stair.endpoints[role];return endpoint.state==='modeled'&&endpoint.levelId===levelId?[{stair,role,roomId:endpoint.roomId}]:[];}));
  const openings=doc.stairsContract.surfaceOpenings.flatMap(opening=>opening.attachments.filter(attachment=>visibleRooms.has(attachment.roomId)).map(attachment=>({opening,attachment})));
  const selectedRoom=roomId&&visibleRooms.has(roomId)?roomId:null;
  return <section aria-label="Stairs and surface openings" className="min-w-0 space-y-3 rounded-lg border bg-white p-3">
    <div className="flex flex-wrap gap-2">
      <Button size="sm" variant="outline" disabled={blocked||!selectedRoom} data-physical-layout-control onClick={()=>{
        if(!selectedRoom||!levelId)return;const id=crypto.randomUUID();
        if(update(current=>addStair(current,id,'Stair '+(doc.stairsContract.stairs.length+1),{state:'modeled',levelId,roomId:selectedRoom,placement:createRoomLocalPlacement()},new Date().toISOString())))onSelect({kind:'stair',id,roomId:selectedRoom,role:'lower'});
      }}>Add stair</Button>
      <Button size="sm" variant="outline" disabled={blocked||!selectedRoom} data-physical-layout-control onClick={()=>{
        if(!selectedRoom)return;const id=crypto.randomUUID();
        if(update(current=>addSurfaceOpening(current,id,'Surface opening '+(doc.stairsContract.surfaceOpenings.length+1),{roomId:selectedRoom,surface:'floor',placement:createRoomLocalPlacement()},selected?.kind==='stair'?selected.id:null,new Date().toISOString())))onSelect({kind:'surface-opening',id,roomId:selectedRoom,surface:'floor'});
      }}>Add surface opening</Button>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Building objects on editing level">
      {stairs.map(({stair,role,roomId})=><Button key={stair.id+role} size="sm" variant={selected?.kind==='stair'&&selected.id===stair.id?'secondary':'outline'} className="h-auto max-w-full whitespace-normal text-left" data-physical-layout-control data-testid={'physical-stair-list-'+stair.id} data-stair-id={stair.id} data-endpoint-role={role} onClick={()=>onSelect({kind:'stair',id:stair.id,roomId,role})}>{stair.name} · {role==='lower'?'UP':'DOWN'}</Button>)}
      {openings.map(({opening,attachment})=><Button key={opening.id+attachment.roomId+attachment.surface} size="sm" variant={selected?.kind==='surface-opening'&&selected.id===opening.id?'secondary':'outline'} className="h-auto max-w-full whitespace-normal text-left" data-physical-layout-control data-testid={'physical-surface-opening-list-'+opening.id} data-surface-opening-id={opening.id} data-surface={attachment.surface} onClick={()=>onSelect({kind:'surface-opening',id:opening.id,roomId:attachment.roomId,surface:attachment.surface})}>{opening.name} · {attachment.surface}</Button>)}
      {!stairs.length&&!openings.length?<p className="text-xs text-slate-500">No stair or surface opening on this level. Select a room to add one.</p>:null}
    </div>
    <p className="text-xs text-slate-600">Stair layout, floor holes and ceiling holes are separate. Review each affected finish explicitly; landings inside rooms add no extra floor area.</p>
  </section>;
}
