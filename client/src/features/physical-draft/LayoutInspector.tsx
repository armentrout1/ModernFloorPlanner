import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useInputRevert } from '@/components/InputRevert';
import type { RoomUseDeclaration } from '@shared/domain/layout';
import { grossLayoutFootprint, validateLayoutGeometry } from '@shared/domain/layoutGeometry';
import { formatQuantity } from '@shared/quantities/display';
import { previewDocument, type PhysicalDraft } from './state';
import type { StairChange } from './StairInspector';
import { getLayoutField, editLayoutField, commitLayoutField, revertLayoutField, layoutFieldError,
  getLayoutText, editLayoutText, commitLayoutText, revertLayoutText, layoutTextError,
  setRoomUse, setZoneUse, setZonePlacement, setCabinetPlacement, setCabinetZone, deleteZone, deleteCabinet,
  type LayoutFieldTarget, type LayoutTextTarget } from './layoutCommands';

const now = () => new Date().toISOString();
const selectClass = 'h-10 w-full min-w-0 rounded-md border bg-white px-2 text-sm';
const uses = [ ['unspecified','Unspecified'], ['kitchen','Kitchen'], ['bathroom','Bathroom'],
  ['living-recreation','Living/Recreation'], ['bedroom','Bedroom'], ['utility-laundry','Utility/Laundry'],
  ['storage','Storage'], ['custom','Custom'] ] as const;

function Measure({ draft, target, label, update }: { draft: PhysicalDraft; target: LayoutFieldTarget; label: string; update: StairChange }) {
  const input = getLayoutField(draft, target), composing = useRef(false), inputRef = useRef<HTMLInputElement>(null);
  const id = 'layout-field-' + JSON.stringify(target), error = layoutFieldError(draft, target);
  const commit = () => update(current => layoutFieldError(current, target) ? current : commitLayoutField(current, target, now()));
  const revert = useInputRevert(inputRef, { name: 'Revert ' + label.toLowerCase(), identity: draft.id + id,
    revision: draft.localEditRevision, pending: input.dirty,
    onLeave: () => {},
    onRevert: () => update(current => revertLayoutField(current, target), draft.localEditRevision) });
  return <div className="relative min-w-0">
    <label className="block min-h-[3rem] pr-14 text-sm font-medium md:min-h-[2rem]" htmlFor={id}>{label} ({input.unit})</label>
    <Input ref={inputRef} id={id} type="text" value={input.text} autoComplete="off" spellCheck={false}
      aria-invalid={Boolean(error)} aria-describedby={id + '-help'} data-physical-pending={input.dirty ? 'true' : undefined}
      placeholder="Unknown until entered" onChange={event => update(current => editLayoutField(current, target, event.target.value))}
      onKeyDown={event => {
        if (revert.onInputKeyDown(event, composing.current)) return;
        if (event.key === 'Enter' && !event.repeat && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); commit(); }
      }} onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; }} />
    {revert.control}<p id={id + '-help'} className={'mt-1 text-xs leading-5 ' + (error ? 'text-red-700' : 'text-slate-500')}>
      {error || (input.dirty ? 'Unapplied layout edit.' : 'Measured or proposed; no automatic confirmation.')}
      {input.unit !== draft.displayUnit ? ' This unfinished edit keeps its original unit context.' : ''}</p>
  </div>;
}

function TextField({ draft, target, label, update }: { draft: PhysicalDraft; target: LayoutTextTarget; label: string; update: StairChange }) {
  const input = getLayoutText(draft, target), composing = useRef(false), inputRef = useRef<HTMLInputElement>(null);
  const id = 'layout-text-' + JSON.stringify(target), error = input.dirty ? layoutTextError(draft,target) : null;
  const commit = () => update(current => commitLayoutText(current, target, now()));
  const revert = useInputRevert(inputRef, { name: 'Revert ' + label.toLowerCase(), identity: draft.id + id,
    revision: draft.localEditRevision, pending: input.dirty,
    onLeave: () => {},
    onRevert: () => update(current => revertLayoutText(current, target), draft.localEditRevision) });
  return <div className="relative min-w-0">
    <label htmlFor={id} className="block min-h-[3rem] pr-14 text-sm font-medium md:min-h-[2rem]">{label}</label>
    <Input ref={inputRef} id={id} value={input.text} aria-invalid={Boolean(error)} aria-describedby={id+'-help'} data-physical-pending={input.dirty ? 'true' : undefined}
      onChange={event => update(current => editLayoutText(current, target, event.target.value))}
      onKeyDown={event => { if (revert.onInputKeyDown(event, composing.current)) return;
        if (event.key === 'Enter' && !event.repeat && !composing.current && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); commit(); } }}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={() => { composing.current = false; }} />
    {revert.control}<p id={id+'-help'} className={'mt-1 text-xs '+(error?'text-red-700':'text-slate-500')}>{error || (input.dirty ? 'Unapplied text; press Enter or use Apply to commit.' : '')}</p>
  </div>;
}

function UseSelect({ label, value, onChange }: { label: string; value: RoomUseDeclaration; onChange: (value: RoomUseDeclaration) => void }) {
  return <label className="grid min-w-0 gap-1 text-sm font-medium">{label}<select className={selectClass} data-physical-layout-control value={value.value}
    onChange={event => onChange({ value: event.target.value as RoomUseDeclaration['value'], customLabel: event.target.value === 'custom' ? value.customLabel ?? '' : null, source: 'manual' })}>
    {uses.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
  </select></label>;
}

export function RoomUseControl({ draft, roomId, update }: { draft: PhysicalDraft; roomId: string; update: StairChange }) {
  if (draft.document.schemaVersion !== 5) return null;
  const use = draft.document.layoutContract.roomUses[roomId];
  return <div className="space-y-3">
    <UseSelect label="Room use" value={use} onChange={value => update(current => setRoomUse(current, roomId, value, now()))} />
    {use.value === 'custom' ? <TextField {...{ draft, update }} target={{kind:'room-use',id:roomId,field:'customLabel'}} label="Custom room use" /> : null}
    <p className="text-xs text-slate-600">Use describes intent. It does not change walls, measured quantities or selected work.</p>
  </div>;
}

export function LayoutInspector({ draft, kind, id, update, onDeleted }: {
  draft: PhysicalDraft; kind: 'zone'|'cabinet'; id: string; update: StairChange; onDeleted: () => void;
}) {
  if (draft.document.schemaVersion !== 5) return null;
  const doc = draft.document, entity = kind === 'zone' ? doc.layoutContract.zones.find(item => item.id === id) : doc.layoutContract.cabinetBlocks.find(item => item.id === id);
  if (!entity) return null;
  const preview = previewDocument(draft);
  const current = preview.schemaVersion === 5 ? (kind === 'zone' ? preview.layoutContract.zones.find(item => item.id === id) : preview.layoutContract.cabinetBlocks.find(item => item.id === id)) : entity;
  const footprint = grossLayoutFootprint(current ?? entity);
  const formatted = footprint.areaMm2 == null ? null : formatQuantity({value:footprint.areaMm2,unit:'mm2'}, {unit:draft.displayUnit,fractionDigits:2});
  const title = kind === 'zone' ? 'Zone' : 'Cabinet', fields = kind === 'zone' ? ['width','length','x','y'] as const : ['length','depth','height','x','y'] as const;
  const changeRotation = (rotation: 0|90|180|270) => update(current => kind === 'zone'
    ? setZonePlacement(current,id,{...entity.placement,rotation},now()) : setCabinetPlacement(current,id,{...entity.placement,rotation},now()));
  const zone = kind === 'zone' ? doc.layoutContract.zones.find(item => item.id === id) : null;
  const cabinet = kind === 'cabinet' ? doc.layoutContract.cabinetBlocks.find(item => item.id === id) : null;
  return <div className="min-w-0 space-y-4" data-testid={'physical-'+kind+'-inspector'} data-zone-id={zone?.id} data-cabinet-id={cabinet?.id}>
    <h2 className="font-semibold">{zone ? 'Functional zone' : 'Fixed cabinet block'}</h2>
    <TextField {...{draft,update}} target={{kind,id,field:'name'}} label={title+' name'} />
    {zone ? <><UseSelect label="Zone use" value={zone.use} onChange={value => update(current => setZoneUse(current,id,value,now()))} />
      {zone.use.value === 'custom' ? <TextField {...{draft,update}} target={{kind:'zone-use',id,field:'customLabel'}} label="Custom zone use" /> : null}</> : null}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">{fields.map(field => <Measure key={field} {...{draft,update}} target={{kind,id,field} as LayoutFieldTarget} label={title+' '+(field === 'x' || field === 'y' ? field.toUpperCase() : field)} />)}</div>
    <div className="grid min-w-0 grid-cols-[1fr_auto] items-end gap-2">
      <label className="grid gap-1 text-sm">Rotation<select className={selectClass} data-physical-layout-control value={entity.placement.rotation} onChange={event => changeRotation(Number(event.target.value) as 0|90|180|270)}>{[0,90,180,270].map(value => <option key={value} value={value}>{value}°</option>)}</select></label>
      <Button variant="outline" data-physical-layout-control onClick={() => changeRotation(((entity.placement.rotation+90)%360) as 0|90|180|270)}>Rotate {kind}</Button>
    </div>
    {cabinet ? <label className="grid gap-1 text-sm">Associated zone<select className={selectClass} data-physical-layout-control value={cabinet.zoneId ?? ''} onChange={event => update(current => setCabinetZone(current,id,event.target.value || null,now()))}>
      <option value="">None — no association</option>{doc.layoutContract.zones.filter(item => item.roomId === entity.roomId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label> : null}
    <div className="rounded-md border bg-slate-50 p-3 text-xs" data-testid="layout-footprint">
      <p>{footprint.label}.</p><p className="mt-1 font-semibold">{formatted?.ok ? formatted.formatted + (draft.displayUnit === 'ft' ? ' sq ft' : ' m²') : 'Unknown — enter plan dimensions'}</p>
      {formatted?.ok ? <p>{footprint.confirmation === 'confirmed' ? 'Confirmed dimension basis.' : 'Provisional dimension basis.'}</p> : null}
    </div>
    <div role="status" data-testid="layout-geometry-findings" className="space-y-1 text-xs text-amber-800">{validateLayoutGeometry(preview).checks.filter(check => check.id === id && check.status !== 'valid').map((check,index) => <p key={index}>{check.message}</p>)}</div>
    <p className="text-xs leading-5 text-slate-600">X/Y locate the rotated rectangle's top-left within its parent room. Drag its boundary in the drawing to place it. Rotation keeps that anchor.</p>
    <p className="text-xs leading-5 text-slate-600">{zone ? 'A virtual boundary creates no wall. An enclosed bathroom must be a physical room, not a Bathroom zone.' : 'Layout only. Cabinet materials, product counts, countertops and finish exclusions are not included. Moving a block does not change its zone association.'}</p>
    {zone && doc.layoutContract.cabinetBlocks.some(item => item.zoneId === id) ? <p className="text-xs text-amber-800">Deleting this zone will unlink and retain its cabinet blocks. Undo restores the association.</p> : null}
    <Button variant="outline" data-physical-layout-control onClick={() => { if(update(current => kind === 'zone' ? deleteZone(current,id,now()) : deleteCabinet(current,id,now()))) onDeleted(); }}>Delete {zone ? 'zone' : 'cabinet block'}</Button>
  </div>;
}
