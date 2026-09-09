import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type RefObject } from 'react';
import type { PhysicalDocument } from '@shared/domain/document';
import { placementBounds, stairEndpointBounds, validateStairGeometry, type PlanBounds } from '@shared/domain/stairGeometry';
import type { StairPlacement } from '@shared/domain/stairs';
import type { Room } from '@/utils/types';
import type { PhysicalDraft } from './state';
import type { BuildingSelection } from './StairControls';
import type { StairChange } from './StairInspector';
import { pointerToWorld } from './openingGeometry';
import { createRoomLocalPlacement, setStairPlacement, setLandingPlacement, setSurfaceOpeningAttachment } from './stairCommands';

const px=(mm:number)=>mm*20/304.8;
type Mark={key:string;kind:'stair'|'landing'|'surface-opening';id:string;stairId?:string;role?:'lower'|'upper';surface?:'floor'|'ceiling';roomId:string;label:string;bounds:PlanBounds;placement:StairPlacement;invalid:boolean;selection:BuildingSelection};
type Drag={mark:Mark;pointerId:number;revision:number;draftId:string;levelId:string|null|undefined;element:HTMLButtonElement;start:{x:number;y:number};next:{x:number;y:number};moved:boolean};
export function StairDrawingOverlay({document,draft,rooms,levelId,scale,origin,viewport,selected,onSelect,update}:{
  document:PhysicalDocument;draft:PhysicalDraft;rooms:Room[];levelId:string|null|undefined;scale:number;origin:{x:number;y:number};viewport:RefObject<HTMLDivElement>;
  selected:BuildingSelection|null;onSelect:(value:BuildingSelection)=>void;update:StairChange;
}) {
  const drag=useRef<Drag|null>(null),[preview,setPreview]=useState<{key:string;x:number;y:number}|null>(null),[message,setMessage]=useState('');
  const space=useRef(false);
  const cancel=useCallback(()=>{const previous=drag.current;drag.current=null;setPreview(null);if(previous){delete previous.element.dataset.physicalGesture;if(previous.element.hasPointerCapture(previous.pointerId))previous.element.releasePointerCapture(previous.pointerId);}},[]);
  const marks=useMemo(()=>{
    if(document.schemaVersion!==4)return [];
    const result:Mark[]=[],checks=validateStairGeometry(document).checks;
    const visible=new Set(rooms.map(room=>room.id));
    for(const stair of document.stairsContract.stairs)for(const role of ['lower','upper'] as const){
      const endpoint=stair.endpoints[role];if(endpoint.state!=='modeled'||endpoint.levelId!==levelId||!visible.has(endpoint.roomId))continue;
      const other=stair.endpoints[role==='lower'?'upper':'lower'];
      const destination=other.state==='modeled'?document.buildingLevels.levels.find(level=>level.id===other.levelId)?.name:'destination not modeled';
      const bounds=stairEndpointBounds(stair,role),selection:BuildingSelection={kind:'stair',id:stair.id,role,roomId:endpoint.roomId};
      if(bounds)result.push({key:stair.id+'-'+role,kind:'stair',id:stair.id,role,roomId:endpoint.roomId,label:(role==='lower'?'UP to ':'DOWN to ')+destination,bounds,placement:endpoint.placement,selection,invalid:checks.some(check=>check.id===stair.id&&check.role===role&&check.status==='invalid')});
      const landing=stair.landings[role],landingBounds=landing?placementBounds(landing.width,landing.depth,landing.placement):null;
      if(landing&&landingBounds)result.push({key:landing.id,kind:'landing',id:landing.id,stairId:stair.id,role,roomId:endpoint.roomId,label:(role==='lower'?'Lower':'Upper')+' landing',bounds:landingBounds,placement:landing.placement,selection,invalid:checks.some(check=>check.id===landing.id&&check.status==='invalid')});
    }
    for(const opening of document.stairsContract.surfaceOpenings)for(const attachment of opening.attachments){
      if(!visible.has(attachment.roomId))continue;const bounds=placementBounds(opening.width,opening.length,attachment.placement);if(!bounds)continue;
      result.push({key:opening.id+'-'+attachment.roomId+'-'+attachment.surface,kind:'surface-opening',id:opening.id,roomId:attachment.roomId,surface:attachment.surface,label:opening.name+' · '+attachment.surface,bounds,placement:attachment.placement,selection:{kind:'surface-opening',id:opening.id,roomId:attachment.roomId,surface:attachment.surface},invalid:checks.some(check=>check.id===opening.id&&check.roomId===attachment.roomId&&check.surface===attachment.surface&&check.status==='invalid')});
    }
    return result.filter(mark=>Object.values(mark.bounds).every(value=>Number.isFinite(value)&&Math.abs(px(value))<1e7));
  },[document,rooms,levelId]);
  useEffect(()=>{cancel();},[draft.id,draft.localEditRevision,levelId,scale,origin.x,origin.y,cancel]);
  useEffect(()=>{
    const keyboard=(event:KeyboardEvent)=>{if(event.code==='Space'){space.current=event.type==='keydown';if(space.current)cancel();}if(event.type==='keydown'&&['Escape','Control','Meta','Alt'].includes(event.key))cancel();};
    const lost=()=>{space.current=false;cancel();};
    const hidden=()=>{if(window.document.hidden)lost();};
    const second=(event:globalThis.PointerEvent)=>{if(drag.current&&event.pointerId!==drag.current.pointerId)cancel();};
    window.addEventListener('keydown',keyboard);window.addEventListener('keyup',keyboard);window.addEventListener('blur',lost);window.addEventListener('physical-layout-change',cancel);window.addEventListener('pointerdown',second,true);
    const element=viewport.current; element?.addEventListener('wheel',cancel,{passive:true}); window.document.addEventListener('visibilitychange',hidden);
    const observer=new ResizeObserver(cancel);if(viewport.current)observer.observe(viewport.current);
    return()=>{cancel();observer.disconnect();element?.removeEventListener('wheel',cancel);window.document.removeEventListener('visibilitychange',hidden);window.removeEventListener('keydown',keyboard);window.removeEventListener('keyup',keyboard);window.removeEventListener('blur',lost);window.removeEventListener('physical-layout-change',cancel);window.removeEventListener('pointerdown',second,true);};
  },[cancel,viewport]);
  function point(event:PointerEvent){const box=viewport.current;if(!box)return null;const bounds=box.getBoundingClientRect();return pointerToWorld({x:event.clientX,y:event.clientY},{bounds:{left:bounds.left,top:bounds.top,clientLeft:box.clientLeft,clientTop:box.clientTop},scroll:{x:box.scrollLeft,y:box.scrollTop},origin,scale});}
  function start(event:PointerEvent<HTMLButtonElement>,mark:Mark){
    if(event.button!==0||event.ctrlKey||event.metaKey||event.altKey||space.current)return;
    const start=point(event);if(!start)return;event.preventDefault();event.stopPropagation();onSelect(mark.selection);setMessage('');
    drag.current={mark,pointerId:event.pointerId,revision:draft.localEditRevision,draftId:draft.id,levelId,element:event.currentTarget,start,next:{x:mark.bounds.x,y:mark.bounds.y},moved:false};
    event.currentTarget.dataset.physicalGesture='active';event.currentTarget.setPointerCapture(event.pointerId);
  }
  function move(event:PointerEvent<HTMLButtonElement>){const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;
    if(event.buttons!==1||event.ctrlKey||event.metaKey||event.altKey||space.current){cancel();return;}const current=point(event);if(!current)return;
    const dx=current.x-active.start.x,dy=current.y-active.start.y;active.moved ||= Math.hypot(dx,dy)*scale>3;
    active.next={x:active.mark.bounds.x+dx*304.8/20,y:active.mark.bounds.y+dy*304.8/20};
    if(active.moved)setPreview({key:active.mark.key,...active.next});event.preventDefault();event.stopPropagation();
  }
  function finish(event:PointerEvent<HTMLButtonElement>){const active=drag.current;if(!active||active.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();cancel();
    if(!active.moved||active.draftId!==draft.id||active.levelId!==levelId||active.revision!==draft.localEditRevision||event.button!==0||event.buttons!==0||event.ctrlKey||event.metaKey||event.altKey||space.current)return;
    const currentPoint=point(event);if(!currentPoint)return;
    const x=active.mark.bounds.x+(currentPoint.x-active.start.x)*304.8/20,y=active.mark.bounds.y+(currentPoint.y-active.start.y)*304.8/20;
    const placement=createRoomLocalPlacement(x,y,active.mark.placement.rotation),at=new Date().toISOString();
    const accepted=update(current=>{
      if(active.mark.kind==='stair')return setStairPlacement(current,active.mark.id,active.mark.role!,placement,at);
      if(active.mark.kind==='landing')return setLandingPlacement(current,active.mark.stairId!,active.mark.role!,placement,at);
      if(current.document.schemaVersion!==4)throw new Error('The building document changed.');
      const opening=current.document.stairsContract.surfaceOpenings.find(item=>item.id===active.mark.id);if(!opening)throw new Error('The surface opening changed.');
      return setSurfaceOpeningAttachment(current,opening.id,opening.attachments.map(a=>a.roomId===active.mark.roomId&&a.surface===active.mark.surface?{...a,placement}:a),at);
    },active.revision);
    if(!accepted)setMessage('Placement was not accepted. Check the host room and dimensions.');
  }
  return <>
    {marks.map(mark=>{const room=rooms.find(room=>room.id===mark.roomId)!;const position=preview?.key===mark.key?preview:mark.bounds;
      const active=selected?.id===mark.selection.id&&selected.kind===mark.selection.kind;
      const horizontal=mark.placement.rotation===0||mark.placement.rotation===180;
      const arrow=mark.placement.rotation+(mark.role==='upper'?180:0);
      return <button type="button" key={mark.key} data-testid={'physical-'+mark.kind+'-'+mark.id+(mark.role?'-'+mark.role:mark.surface?'-'+mark.surface:'')}
        data-building-object="true" data-stair-id={mark.kind==='stair'?mark.id:mark.stairId} data-surface-opening-id={mark.kind==='surface-opening'?mark.id:undefined} data-endpoint-role={mark.role}
        data-room-id={mark.roomId} data-mm-x={mark.bounds.x} data-mm-y={mark.bounds.y} data-mm-width={mark.bounds.width} data-mm-height={mark.bounds.height}
        aria-label={'Select '+mark.kind.replace('-',' ')+' '+mark.label} aria-pressed={active} title={mark.label+' · drag to change this room-local placement'}
        onPointerDown={event=>start(event,mark)} onPointerMove={move} onPointerUp={finish} onPointerCancel={cancel} onLostPointerCapture={()=>{if(drag.current)cancel();}}
        onClick={event=>{event.preventDefault();event.stopPropagation();}} onKeyDown={event=>{if(['Enter',' '].includes(event.key)&&!event.repeat&&!event.nativeEvent.isComposing){event.preventDefault();event.stopPropagation();onSelect(mark.selection);}}}
        style={{position:'absolute',left:room.x+px(position.x),top:room.y+px(position.y),width:px(mark.bounds.width),height:px(mark.bounds.height),zIndex:mark.kind==='surface-opening'?3300:3400,touchAction:'none',cursor:'grab',padding:0,
          border:(active?3:1.5)/scale+'px '+(mark.kind==='surface-opening'?'dashed':'solid')+' '+(mark.invalid?'#dc2626':mark.kind==='surface-opening'?'#7c3aed':'#334155'),
          background:mark.kind==='surface-opening'?'#f3e8ffbb':mark.kind==='landing'?'#e2e8f0dd':'#f8fafcee',color:'#0f172a'}}>
        {mark.kind==='stair'?<svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full pointer-events-none">
          {[1,2,3,4,5,6].map(n=><line key={n} x1={horizontal?n*100/7:0} x2={horizontal?n*100/7:100} y1={horizontal?0:n*100/7} y2={horizontal?100:n*100/7} stroke="#94a3b8" strokeWidth="1"/>)}
          <g transform={'rotate('+arrow+' 50 50)'}><path d="M15 50H85M70 38L85 50L70 62" fill="none" stroke="#0f172a" strokeWidth="3"/></g>
        </svg>:null}
        <span className="pointer-events-none absolute left-0 top-0 max-w-full rounded bg-white/95 px-1 text-left leading-tight" style={{fontSize:Math.min(12/scale,12),overflowWrap:'anywhere'}}>{mark.label}{mark.invalid?' · correct fit':''}</span>
      </button>;
    })}
    {message?<span role="status" className="absolute left-0 top-0 bg-amber-50 p-2 text-xs" style={{zIndex:6500}}>{message}</span>:null}
  </>;
}
