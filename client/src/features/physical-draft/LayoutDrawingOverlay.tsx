import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { PhysicalDocument } from '@shared/domain/document';
import { layoutBounds, validateLayoutGeometry } from '@shared/domain/layoutGeometry';
import type { LayoutPlacement } from '@shared/domain/layout';
import type { PlanBounds } from '@shared/domain/stairGeometry';
import type { Room } from '@/utils/types';
import type { PhysicalDraft } from './state';
import type { BuildingSelection } from './StairControls';
import type { StairChange } from './StairInspector';
import { pointerToWorld } from './openingGeometry';
import { createRoomLocalPlacement } from './stairCommands';
import { setZonePlacement, setCabinetPlacement } from './layoutCommands';

const px=(mm:number)=>mm*20/304.8;
type Mark={kind:'zone'|'cabinet';id:string;roomId:string;name:string;bounds:PlanBounds;placement:LayoutPlacement;invalid:boolean};
type Drag={mark:Mark;pointerId:number;revision:number;draftId:string;levelId:string|null|undefined;element:Element;start:{x:number;y:number};moved:boolean};
export function LayoutDrawingOverlay({document,draft,rooms,levelId,scale,origin,viewport,selected,onSelect,update}:{
  document:PhysicalDocument;draft:PhysicalDraft;rooms:Room[];levelId:string|null|undefined;scale:number;origin:{x:number;y:number};viewport:RefObject<HTMLDivElement>;
  selected:BuildingSelection|null;onSelect:(value:BuildingSelection)=>void;update:StairChange;
}) {
  const drag=useRef<Drag|null>(null),[preview,setPreview]=useState<{id:string;x:number;y:number}|null>(null),[message,setMessage]=useState('');
  const space=useRef(false);
  const cancel=useCallback(()=>{const previous=drag.current;drag.current=null;setPreview(null);if(previous){previous.element.removeAttribute('data-physical-gesture');if(previous.element.hasPointerCapture(previous.pointerId))previous.element.releasePointerCapture(previous.pointerId);}},[]);
  const marks=useMemo(()=>{
    if(document.schemaVersion!==5)return [];
    const result:Mark[]=[],checks=validateLayoutGeometry(document).checks,visible=new Set(rooms.map(room=>room.id));
    for(const kind of ['zone','cabinet'] as const)for(const entity of kind==='zone'?document.layoutContract.zones:document.layoutContract.cabinetBlocks){
      if(!visible.has(entity.roomId))continue;const bounds=layoutBounds(entity);if(!bounds)continue;
      if(!Object.values(bounds).every(value=>Number.isFinite(value)&&Math.abs(px(value))<1e7))continue;
      result.push({kind,id:entity.id,roomId:entity.roomId,name:entity.name,bounds,placement:entity.placement,invalid:checks.some(check=>check.id===entity.id&&check.status==='invalid')});
    }
    return result;
  },[document,rooms]);
  useEffect(()=>{cancel();},[draft.id,draft.localEditRevision,levelId,scale,origin.x,origin.y,cancel]);
  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{if(event.code==='Space'){space.current=event.type==='keydown';if(space.current)cancel();}if(event.type==='keydown'&&['Escape','Control','Meta','Alt'].includes(event.key))cancel();};
    const lost=()=>{space.current=false;cancel();};
    const hidden=()=>{if(window.document.hidden)lost();};
    const second=(event:globalThis.PointerEvent)=>{if(drag.current&&event.pointerId!==drag.current.pointerId)cancel();};
    window.addEventListener('keydown',keyboard);window.addEventListener('keyup',keyboard);window.addEventListener('blur',lost);window.addEventListener('physical-layout-change',cancel);window.addEventListener('pointerdown',second,true);
    const element=viewport.current;element?.addEventListener('wheel',cancel,{passive:true});window.document.addEventListener('visibilitychange',hidden);
    const observer=new ResizeObserver(cancel);if(element)observer.observe(element);
    return()=>{cancel();observer.disconnect();element?.removeEventListener('wheel',cancel);window.document.removeEventListener('visibilitychange',hidden);window.removeEventListener('keydown',keyboard);window.removeEventListener('keyup',keyboard);window.removeEventListener('blur',lost);window.removeEventListener('physical-layout-change',cancel);window.removeEventListener('pointerdown',second,true);};
  },[cancel,viewport]);
  function point(event:PointerEvent){const box=viewport.current;if(!box)return null;const bounds=box.getBoundingClientRect();return pointerToWorld({x:event.clientX,y:event.clientY},{bounds:{left:bounds.left,top:bounds.top,clientLeft:box.clientLeft,clientTop:box.clientTop},scroll:{x:box.scrollLeft,y:box.scrollTop},origin,scale});}
  function start(event:PointerEvent<Element>,mark:Mark){
    if(!event.isPrimary||event.button!==0||event.ctrlKey||event.metaKey||event.altKey||space.current)return;
    const start=point(event);if(!start)return;event.preventDefault();event.stopPropagation();onSelect({kind:mark.kind,id:mark.id,roomId:mark.roomId});setMessage('');
    drag.current={mark,pointerId:event.pointerId,revision:draft.localEditRevision,draftId:draft.id,levelId,element:event.currentTarget,start,moved:false};
    event.currentTarget.setAttribute('data-physical-gesture','active');event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent<Element>){const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;
    if(event.buttons!==1||event.ctrlKey||event.metaKey||event.altKey||space.current){cancel();return;}const current=point(event);if(!current)return;
    const dx=current.x-active.start.x,dy=current.y-active.start.y;active.moved ||= Math.hypot(dx,dy)*scale>3;
    if(active.moved)setPreview({id:active.mark.id,x:active.mark.bounds.x+dx*304.8/20,y:active.mark.bounds.y+dy*304.8/20});event.preventDefault();event.stopPropagation();
  }
  function finish(event:PointerEvent<Element>){const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();cancel();
    if(!active.moved||active.draftId!==draft.id||active.levelId!==levelId||active.revision!==draft.localEditRevision||event.button!==0||event.buttons!==0||event.ctrlKey||event.metaKey||event.altKey||space.current)return;
    const currentPoint=point(event);if(!currentPoint)return;
    const x=active.mark.bounds.x+(currentPoint.x-active.start.x)*304.8/20,y=active.mark.bounds.y+(currentPoint.y-active.start.y)*304.8/20;
    const placement=createRoomLocalPlacement(x,y,active.mark.placement.rotation),at=new Date().toISOString();
    const accepted=update(current=>active.mark.kind==='zone'?setZonePlacement(current,active.mark.id,placement,at):setCabinetPlacement(current,active.mark.id,placement,at),active.revision);
    if(!accepted)setMessage('Placement was not accepted. Correct the parent-room fit; dimensions were not changed.');
  }
  return <>
    {marks.map(mark=>{const room=rooms.find(room=>room.id===mark.roomId)!,position=preview?.id===mark.id?preview:mark.bounds;
      const active=selected?.id===mark.id&&selected.kind===mark.kind,width=px(mark.bounds.width),height=px(mark.bounds.height),color=mark.invalid?'#dc2626':mark.kind==='zone'?'#b45309':'#0f766e';
      const events={onPointerDown:(event:PointerEvent<Element>)=>start(event,mark),onPointerMove:move,onPointerUp:finish,onPointerCancel:cancel,onLostPointerCapture:()=>{if(drag.current)cancel();}};
      return <div key={mark.id} data-testid={mark.kind+'-'+mark.id} data-building-object="true" data-zone-id={mark.kind==='zone'?mark.id:undefined} data-cabinet-id={mark.kind==='cabinet'?mark.id:undefined}
        data-room-id={mark.roomId} data-mm-x={mark.bounds.x} data-mm-y={mark.bounds.y} data-mm-width={mark.bounds.width} data-mm-height={mark.bounds.height} data-selected={active}
        style={{position:'absolute',left:room.x+px(position.x),top:room.y+px(position.y),width,height,pointerEvents:'none',zIndex:mark.kind==='zone'?2800:2900}}>
        <svg className="absolute inset-0 h-full w-full overflow-visible" style={{pointerEvents:'none'}}>
          <rect data-layout-hit="true" x="0" y="0" width={width} height={height} fill={mark.kind==='zone'?'none':'#ccfbf1dd'} stroke={color} strokeWidth={(active?3:1.5)/scale} strokeDasharray={mark.kind==='zone'?`${6/scale} ${4/scale}`:undefined}
            style={{pointerEvents:mark.kind==='zone'?'stroke':'all',touchAction:'none',cursor:'grab'}} {...events} />
          {mark.kind==='zone'?<rect aria-hidden="true" x="0" y="0" width={width} height={height} fill="none" stroke="transparent" strokeWidth={10/scale} style={{pointerEvents:'stroke',touchAction:'none',cursor:'grab'}} {...events}/>:null}
        </svg>
        <button type="button" aria-label={'Select '+mark.kind+': '+mark.name} aria-pressed={active} title={'Drag to place '+mark.name} data-layout-handle="true" {...events}
          onClick={event=>{event.preventDefault();event.stopPropagation();onSelect({kind:mark.kind,id:mark.id,roomId:mark.roomId});}}
          style={{position:'absolute',left:Math.min(width/4,8/scale),top:Math.min(height/4,8/scale),pointerEvents:'auto',touchAction:'none',cursor:'grab',maxWidth:Math.max(width-8/scale,16),fontSize:Math.min(12/scale,14),padding:'2px 4px',background:'#ffffffee',border:'1px solid '+color,borderRadius:3,color:'#0f172a',overflowWrap:'anywhere'}}>
          {mark.kind==='zone'?'Zone · ':'Cabinet · '}{mark.name}{mark.invalid?' · correct fit':''}
        </button>
      </div>;
    })}
    {message?<span role="status" className="absolute left-0 top-0 bg-amber-50 p-2 text-xs" style={{zIndex:6500}}>{message}</span>:null}
  </>;
}
