import { createRoomLocalPlacement } from './stairCommands';
import { Button } from '@/components/ui/button';
import type { PhysicalDraft } from './state';
import type { StairChange } from './StairInspector';
import type { BuildingSelection } from './StairControls';
import { activeLevelId } from './levelCommands';
import { addZone, addCabinet } from './layoutCommands';

export function LayoutControls({draft,roomId,selected,update,onUpgrade,onSelect,blocked}:{
  draft:PhysicalDraft;roomId:string|null;selected:BuildingSelection|null;update:StairChange;onUpgrade:()=>void;
  onSelect:(selection:BuildingSelection)=>void;blocked:boolean;
}) {
  if(draft.document.schemaVersion===2 || draft.document.schemaVersion===3)return null;
  if(draft.document.schemaVersion===4)return <section className="rounded-lg border bg-white p-3 text-sm">
    <Button variant="outline" disabled={blocked} data-physical-layout-control onClick={onUpgrade}>Enable room layout in a new copy</Button>
    <p className="mt-2 text-xs text-slate-600">Adds room uses, virtual zones and cabinet blocks to a copy of the current edited building. Preserves the original draft.</p>
  </section>;
  const doc=draft.document,levelId=activeLevelId(draft),visible=new Set(doc.rooms.filter(room=>doc.buildingLevels.roomLevels[room.id]===levelId).map(room=>room.id));
  const zones=doc.layoutContract.zones.filter(item=>visible.has(item.roomId)),cabinets=doc.layoutContract.cabinetBlocks.filter(item=>visible.has(item.roomId));
  const selectedRoom=roomId&&visible.has(roomId)?roomId:null;
  function create(kind:'zone'|'cabinet') {
    if(!selectedRoom)return;const id=crypto.randomUUID(),at=new Date().toISOString();
    if(update(current=>kind==='zone' ? addZone(current,id,selectedRoom,'Zone '+(doc.layoutContract.zones.length+1),at,createRoomLocalPlacement(0,0))
      : addCabinet(current,id,selectedRoom,'Cabinet '+(doc.layoutContract.cabinetBlocks.length+1),at,createRoomLocalPlacement(0,0))))onSelect({kind,id,roomId:selectedRoom});
  }
  return <section aria-label="Room layout on editing level" className="min-w-0 space-y-3 rounded-lg border bg-white p-3">
    <div className="flex flex-wrap items-center gap-2"><h2 className="mr-auto text-sm font-semibold">Room layout</h2>
      <Button variant="outline" size="sm" disabled={blocked||!selectedRoom} data-physical-layout-control onClick={()=>create('zone')}>Create zone</Button>
      <Button variant="outline" size="sm" disabled={blocked||!selectedRoom} data-physical-layout-control onClick={()=>create('cabinet')}>Add cabinet block</Button>
    </div>
    <div className="flex flex-wrap gap-2" aria-label="Zones and cabinets on editing level">
      {zones.map(item=><Button key={item.id} variant={selected?.kind==='zone'&&selected.id===item.id?'secondary':'outline'} size="sm" data-physical-layout-control data-zone-id={item.id}
        className="h-auto max-w-full whitespace-normal text-left" aria-label={'Select zone: '+item.name} onClick={()=>onSelect({kind:'zone',id:item.id,roomId:item.roomId})}>Zone · {item.name}</Button>)}
      {cabinets.map(item=><Button key={item.id} variant={selected?.kind==='cabinet'&&selected.id===item.id?'secondary':'outline'} size="sm" data-physical-layout-control data-cabinet-id={item.id}
        className="h-auto max-w-full whitespace-normal text-left" aria-label={'Select cabinet: '+item.name} onClick={()=>onSelect({kind:'cabinet',id:item.id,roomId:item.roomId})}>Cabinet · {item.name}</Button>)}
      {!zones.length&&!cabinets.length?<p className="text-xs text-slate-500">Select a room to create a virtual zone or measured/proposed cabinet block.</p>:null}
    </div>
    <p className="text-xs text-slate-600">Zones and cabinets stay within their parent room and follow its level. New items start at an unconfirmed room-origin placement; enter dimensions, then drag to place. Cabinet materials and finish exclusions are not included.</p>
    {draft.layoutNotice ? <p role="status" className="text-xs text-amber-800">{draft.layoutNotice.message}</p> : null}
  </section>;
}
