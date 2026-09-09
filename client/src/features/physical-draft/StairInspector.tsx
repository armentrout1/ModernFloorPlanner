import { validateStairGeometry } from '@shared/domain/stairGeometry';
import { previewDocument } from './state';
import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useInputRevert } from '@/components/InputRevert';
import type { PhysicalDraft } from './state';
import { getStairField, editStairField, commitStairField, revertStairField, stairFieldError,
  renameStair, setStairEndpoint, setStairPlacement, addLanding, removeLanding, setLandingPlacement,
  setSurfaceImpact, deleteStair, deleteSurfaceOpening, setSurfaceOpeningAttachment,
  renameSurfaceOpening, setStairAlignment, createRoomLocalPlacement, type StairFieldTarget } from './stairCommands';

export type StairChange = (change: (draft: PhysicalDraft) => PhysicalDraft, expectedRevision?: number) => boolean;
const now = () => new Date().toISOString();
const selectClass = 'h-10 w-full min-w-0 rounded-md border bg-white px-2 text-sm';
const roles = ['lower', 'upper'] as const;
const surfaces = ['floor', 'ceiling'] as const;
const cap = (text: string) => text[0].toUpperCase() + text.slice(1);

function Measure({ draft, target, label, update }: { draft: PhysicalDraft; target: StairFieldTarget; label: string; update: StairChange }) {
  const input = getStairField(draft, target), composing = useRef(false), inputRef = useRef<HTMLInputElement>(null);
  const id = 'stair-field-' + JSON.stringify(target), error = stairFieldError(draft, target);
  const commit = () => update(current => stairFieldError(current, target) ? current : commitStairField(current, target, now()));
  const revert = useInputRevert(inputRef, { name: 'Revert ' + label.toLowerCase(), identity: draft.id + id,
    revision: draft.localEditRevision, pending: input.dirty,
    onLeave: () => { if (!composing.current) commit(); },
    onRevert: () => update(current => revertStairField(current, target), draft.localEditRevision) });
  return <div className="relative min-w-0">
    <label className="block min-h-[3rem] pr-14 md:min-h-[2rem] text-sm font-medium" htmlFor={id}>{label} ({input.unit})</label>
    <Input ref={inputRef} id={id} type="text" value={input.text} autoComplete="off" spellCheck={false}
      aria-invalid={Boolean(error)} aria-describedby={id + '-help'} data-physical-pending={input.dirty ? 'true' : undefined}
      placeholder="Unknown until entered" onChange={event => update(current => editStairField(current, target, event.target.value))}
      onBlur={event => { if (!composing.current && !revert.skipBlur(event)) commit(); }}
      onKeyDown={event => {
        if (revert.onInputKeyDown(event, composing.current)) return;
        if (event.key === 'Enter' && !event.repeat && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); commit(); }
      }} onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={event => { composing.current = false; if (document.activeElement !== event.currentTarget && !revert.isDeferredFocus(document.activeElement)) commit(); }} />
    {revert.control}<p id={id + '-help'} className={'mt-1 text-xs leading-5 ' + (error ? 'text-red-700' : 'text-slate-500')}>
      {error || (input.dirty ? 'Unapplied edit; required quantities remain incomplete.' : 'Measured or proposed input; no automatic confirmation.')}
      {input.unit !== draft.displayUnit ? ' This unfinished edit keeps its original unit context.' : ''}</p>
  </div>;
}

export function StairInspector({ draft, stairId, update, onNavigate, onDeleted }: {
  draft: PhysicalDraft; stairId: string; update: StairChange; onNavigate: (levelId: string, roomId: string, stairId: string) => void; onDeleted: () => void;
}) {
  if ((draft.document.schemaVersion !== 4 && draft.document.schemaVersion !== 5)) return null;
  const doc = draft.document, stair = doc.stairsContract.stairs.find(item => item.id === stairId);
  if (!stair) return null;
  return <div data-testid="physical-stair-inspector" data-stair-id={stair.id} className="min-w-0 space-y-4">
    <div><h2 className="font-semibold">Straight stair</h2><p className="text-xs text-slate-500">One assembly · {stair.id}</p></div>
    <label className="grid gap-1 text-sm font-medium">Stair name<Input value={stair.name} onChange={event => update(current => renameStair(current, stair.id, event.target.value))} /></label>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      <Measure {...{ draft, update }} target={{ kind: 'stair', id: stair.id, field: 'width' }} label="Stair width" />
      <Measure {...{ draft, update }} target={{ kind: 'stair', id: stair.id, field: 'run' }} label="Horizontal run" />
      <Measure {...{ draft, update }} target={{ kind: 'stair', id: stair.id, field: 'totalRise' }} label="Total rise" />
    </div>
    <p className="text-xs leading-5 text-slate-600">Run excludes landings. Rise is separate from ceiling height and level elevation. Tread marks are schematic; no riser count or code compliance is calculated.</p>
    {roles.map(role => {
      const endpoint = stair.endpoints[role], title = cap(role), other = stair.endpoints[role === 'lower' ? 'upper' : 'lower'];
      const landing = stair.landings[role];
      const modeled = endpoint.state === 'modeled';
      const rooms = modeled ? doc.rooms.filter(room => doc.buildingLevels.roomLevels[room.id] === endpoint.levelId) : [];
      return <fieldset key={role} className="min-w-0 space-y-3 border-t pt-3" data-testid={'physical-endpoint-' + role}>
        <legend className="text-sm font-semibold">{title} endpoint</legend>
        <p className="text-sm font-medium">{role === 'lower' ? 'UP to ' : 'DOWN to '}{other.state === 'modeled' ? doc.buildingLevels.levels.find(level => level.id === other.levelId)?.name : 'destination not modeled'}</p>
        <label className="grid gap-1 text-sm">{title} level<select className={selectClass} data-physical-layout-control value={modeled ? endpoint.levelId : ''}
          onChange={event => { const levelId = event.target.value, room = doc.rooms.find(room => doc.buildingLevels.roomLevels[room.id] === levelId);
            if (!levelId) update(current => setStairEndpoint(current, stair.id, role, { state: 'unresolved', reason: 'Destination not modeled.' }, now()));
            else if (room) update(current => setStairEndpoint(current, stair.id, role, { state: 'modeled', levelId, roomId: room.id, placement: createRoomLocalPlacement() }, now()));
          }}><option value="">Destination not modeled</option>{[...doc.buildingLevels.levels].sort((a,b) => a.displayOrder-b.displayOrder).map(level =>
            <option key={level.id} value={level.id} disabled={!doc.rooms.some(room => doc.buildingLevels.roomLevels[room.id] === level.id)}>{level.name}{!doc.rooms.some(room => doc.buildingLevels.roomLevels[room.id] === level.id) ? ' — add a room first' : ''}</option>)}</select></label>
        {modeled ? <>
          <label className="grid gap-1 text-sm">{title} room<select className={selectClass} data-physical-layout-control value={endpoint.roomId} onChange={event => update(current => setStairEndpoint(current, stair.id, role, { ...endpoint, roomId: event.target.value, placement: createRoomLocalPlacement() }, now()))}>
            {rooms.map(room => <option key={room.id} value={room.id}>{room.name || 'Unnamed room'}</option>)}</select></label>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{(['x','y'] as const).map(field => <Measure key={field} {...{ draft, update }} target={{ kind: 'endpoint', id: stair.id, role, field }} label={title + ' ' + field.toUpperCase()} />)}</div>
          <label className="grid gap-1 text-sm">{title} orientation<select className={selectClass} data-physical-layout-control value={endpoint.placement.rotation} onChange={event => update(current => setStairPlacement(current, stair.id, role, { ...endpoint.placement, rotation: Number(event.target.value) as 0|90|180|270 }, now()))}>
            {[0,90,180,270].map(rotation => <option key={rotation} value={rotation}>{rotation}° · run {({0:'right',90:'down',180:'left',270:'up'} as Record<number,string>)[rotation]}</option>)}</select></label>
          <Button size="sm" variant="outline" data-physical-layout-control onClick={() => onNavigate(endpoint.levelId, endpoint.roomId, stair.id)}>Go to {title.toLowerCase()} endpoint</Button>
          {landing ? <fieldset data-testid={'physical-landing-' + role} className="space-y-3 rounded-md border p-3"><legend className="text-sm font-medium">{title} landing</legend>
            <p className="text-xs text-slate-500">Inside this room's measured floor; not extra floor area.</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{(['width','depth','x','y'] as const).map(field => <Measure key={field} {...{ draft, update }} target={{ kind:'landing',id:stair.id,role,field }} label={'Landing ' + (field === 'x' || field === 'y' ? field.toUpperCase() : field)} />)}</div>
            <label className="grid gap-1 text-sm">Landing orientation<select className={selectClass} value={landing.placement.rotation} data-physical-layout-control onChange={event => update(current => setLandingPlacement(current, stair.id, role, { ...landing.placement, rotation:Number(event.target.value) as 0|90|180|270 }, now()))}>{[0,90,180,270].map(value => <option key={value} value={value}>{value}°</option>)}</select></label>
            <Button size="sm" variant="outline" data-physical-layout-control onClick={() => update(current => removeLanding(current, stair.id, role, now()))}>Remove {role} landing</Button>
          </fieldset> : <Button size="sm" variant="outline" data-physical-layout-control onClick={() => update(current => addLanding(current, stair.id, role, crypto.randomUUID(), now()))}>Add {role} landing</Button>}
          {surfaces.map(surface => { const impact=stair.surfaceImpacts[role][surface], label=title+' '+surface, openings=doc.stairsContract.surfaceOpenings.filter(opening => opening.attachments.some(a => a.roomId===endpoint.roomId && a.surface===surface));
            return <div key={surface} className="space-y-2"><label className="grid gap-1 text-sm">{label} impact<select className={selectClass} data-physical-layout-control value={impact.state} onChange={event => {
              const state=event.target.value; update(current => setSurfaceImpact(current,stair.id,role,surface,state==='unresolved'?{state,reason:'Finish impact not reviewed.'}:state==='no-deduction'?{state}:{state:'deduct',openingIds:openings[0]?[openings[0].id]:[]},now()));
            }}><option value="unresolved">Not reviewed / unresolved</option><option value="no-deduction">No deduction for this finish</option><option value="deduct" disabled={!openings.length}>Deduct specified surface opening</option></select></label>
            {impact.state==='deduct' ? <label className="grid gap-1 text-sm">{label} opening<select className={selectClass} data-physical-layout-control value={impact.openingIds[0]??''} onChange={event => update(current => setSurfaceImpact(current,stair.id,role,surface,{state:'deduct',openingIds:[event.target.value]},now()))}>{openings.map(opening => <option key={opening.id} value={opening.id}>{opening.name}</option>)}</select></label> : null}</div>;
          })}
        </> : <p className="text-xs text-amber-800">This endpoint has no modeled room or finish surface. No elevation or destination is assumed.</p>}
      </fieldset>;
    })}
    <p className="text-xs leading-5 text-slate-600">X/Y are the rotated bounding rectangle's top-left, measured from its room's top-left. Each endpoint has its own placement. Matching screen positions do not establish vertical alignment.</p>
    <label className="flex gap-2 text-sm"><input type="checkbox" checked={stair.alignment.state==='room-local-reviewed'} onChange={event => update(current => setStairAlignment(current,stair.id,{state:event.target.checked?'room-local-reviewed':'unreviewed',detail:event.target.checked?'Room-local placements reviewed; surveyed vertical alignment is not established.':'Endpoint placement alignment has not been reviewed.'},now()))} />Room-local placements reviewed</label>
    <div role="status" data-testid="stair-geometry-findings" className="space-y-1 text-xs text-amber-800">{validateStairGeometry(previewDocument(draft)).checks.filter(check => check.status !== 'valid' && (check.id === stair.id || Object.values(stair.landings).some(landing => landing?.id === check.id))).map((check,index) => <p key={index}>{check.role ? cap(check.role) + ': ' : ''}{check.message}</p>)}</div>
    <p className="text-xs text-amber-800">Independently specified openings still deduct from their attached finish; choosing “No deduction” here does not erase them. Tread/riser finishes, framing, stringers, rails and structural clearance are not included.</p>
    <Button variant="outline" data-physical-layout-control onClick={() => { if(update(current => deleteStair(current,stair.id,now()))) onDeleted(); }}>Delete stair; keep surface openings</Button>
  </div>;
}

export function SurfaceOpeningInspector({draft,openingId,update,onDeleted}:{draft:PhysicalDraft;openingId:string;update:StairChange;onDeleted:()=>void}) {
  if((draft.document.schemaVersion !== 4 && draft.document.schemaVersion !== 5))return null;
  const doc=draft.document,opening=doc.stairsContract.surfaceOpenings.find(item=>item.id===openingId);
  if(!opening)return null;
  return <div data-testid="physical-surface-opening-inspector" data-surface-opening-id={opening.id} className="space-y-4 min-w-0">
    <h2 className="font-semibold">Surface opening</h2><p className="text-xs text-slate-500">{opening.id}</p>
    <label className="grid gap-1 text-sm">Surface opening name<Input value={opening.name} onChange={event=>update(current=>renameSurfaceOpening(current,opening.id,event.target.value))}/></label>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{(['width','length'] as const).map(field=><Measure key={field} {...{draft,update}} target={{kind:'surface-opening',id:opening.id,field}} label={'Opening '+field}/>)}</div>
    {opening.attachments.map((attachment,index)=><fieldset key={attachment.roomId+attachment.surface} className="space-y-3 border-t pt-3" data-testid={'surface-attachment-'+index}>
      <legend className="text-sm font-semibold">Affected finish surface</legend>
      <label className="grid gap-1 text-sm">Room<select className={selectClass} value={attachment.roomId} data-physical-layout-control onChange={event=>update(current=>setSurfaceOpeningAttachment(current,opening.id,opening.attachments.map((a,i)=>i===index?{...a,roomId:event.target.value,placement:createRoomLocalPlacement()}:a),now()))}>
        {doc.rooms.map(room=><option key={room.id} value={room.id}>{doc.buildingLevels.levels.find(level=>level.id===doc.buildingLevels.roomLevels[room.id])?.name} · {room.name||'Unnamed room'}</option>)}</select></label>
      <label className="grid gap-1 text-sm">Affected surface<select className={selectClass} value={attachment.surface} data-physical-layout-control onChange={event=>update(current=>setSurfaceOpeningAttachment(current,opening.id,opening.attachments.map((a,i)=>i===index?{...a,surface:event.target.value as 'floor'|'ceiling'}:a),now()))}><option value="floor">Floor</option><option value="ceiling">Ceiling</option></select></label>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{(['x','y'] as const).map(field=><Measure key={field} {...{draft,update}} target={{kind:'surface-placement',id:opening.id,roomId:attachment.roomId,surface:attachment.surface,field}} label={'Opening '+field.toUpperCase()}/>)}</div>
      <label className="grid gap-1 text-sm">Opening orientation<select className={selectClass} value={attachment.placement.rotation} data-physical-layout-control onChange={event=>update(current=>setSurfaceOpeningAttachment(current,opening.id,opening.attachments.map((a,i)=>i===index?{...a,placement:{...a.placement,rotation:Number(event.target.value) as 0|90|180|270}}:a),now()))}>{[0,90,180,270].map(value=><option key={value} value={value}>{value}°</option>)}</select></label>
    </fieldset>)}
    <div role="status" data-testid="surface-geometry-findings" className="space-y-1 text-xs text-amber-800">{validateStairGeometry(previewDocument(draft)).checks.filter(check => check.id === opening.id && check.status !== 'valid').map((check,index) => <p key={index}>{check.message}</p>)}</div>
    <p className="text-xs leading-5 text-slate-600">This explicitly specified opening deducts only its attached finish surfaces. Internal rectangles must remain inside the room; wall-boundary cuts and irregular openings are unsupported. X/Y uses the room-local rotated top-left anchor.</p>
    <p className="text-xs text-amber-800">Associated stair: {opening.associatedStairId?doc.stairsContract.stairs.find(stair=>stair.id===opening.associatedStairId)?.name:'None'}. Stair dimensions do not determine this opening.</p>
    <Button variant="outline" data-physical-layout-control onClick={()=>{if(update(current=>deleteSurfaceOpening(current,opening.id,now())))onDeleted();}}>Delete surface opening</Button>
  </div>;
}
