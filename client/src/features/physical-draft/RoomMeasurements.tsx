import { RoomUseControl } from './LayoutInspector';
import { useRef } from 'react';
import { RoomLevelAssignment } from './LevelControls';
import { usePhysicalDraft } from './provider';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useInputRevert } from '@/components/InputRevert';
import { captureFieldRevert, revertField } from './fieldRevert';
import { ROOM_FIELDS, renameRoom, editField, commitField, fieldError, setApplicability,
  type PhysicalDraft, type RoomField } from './state';
import type { RoomApplicability, ApplicabilityField } from '@shared/domain/applicability';

const fieldLabels: Record<RoomField, string> = { length: 'Length', width: 'Width', ceilingHeight: 'Ceiling height' };
const selectClass = 'mt-1 h-10 min-w-0 max-w-full w-full rounded-md border border-slate-300 bg-white px-2 text-sm';
type Change = (change: (draft: PhysicalDraft) => PhysicalDraft, expectedRevision?: number) => boolean;
function MeasurementField({ draft, roomId, field, update }: { draft: PhysicalDraft; roomId: string; field: RoomField; update: Change }) {
  const composing = useRef(false), input = draft.fields[roomId][field];
  const id = 'physical-' + roomId + '-' + field;
  const error = input.dirty ? fieldError(input) : null;
  const inputRef = useRef<HTMLInputElement>(null);
  const revert = useInputRevert(inputRef, {
    name: 'Revert ' + fieldLabels[field].toLowerCase(), identity: draft.id + ':' + roomId + ':' + field,
    revision: draft.localEditRevision, pending: input.dirty,
    onLeave: () => { if (!composing.current) commit(); },
    onRevert: () => {
      const token = captureFieldRevert(draft, { kind: 'room', id: roomId, field });
      return update(current => revertField(current, token), token.revision);
    },
  });
  const commit = () => update(current => commitField(current, roomId, field, new Date().toISOString()));
  const measurement = draft.document.rooms.find(room => room.id === roomId)![field];
  return <div className="relative min-w-0 [overflow-wrap:anywhere]">
    <Label className="block min-h-7 pr-16" htmlFor={id}>{fieldLabels[field]} ({input.unit})</Label>
    <Input ref={inputRef} id={id} className="mt-1 bg-white" type="text" value={input.text} autoComplete="off" spellCheck={false}
      data-physical-pending={input.dirty ? "true" : undefined} aria-invalid={error ? true : undefined} aria-describedby={id + '-help'}
      placeholder={field === 'ceilingHeight' ? 'Unknown until entered' : input.unit === 'ft' ? 'e.g. 12 ft 6 in' : 'e.g. 3.81 m'}
      onChange={event => update(current => editField(current, roomId, field, event.target.value))}
      onBlur={event => { if (!composing.current && !revert.skipBlur(event)) commit(); }}
      onKeyDown={event => {
        if (revert.onInputKeyDown(event, composing.current)) return;
        if (event.key !== 'Enter' || composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
        event.preventDefault(); if (!event.repeat) commit();
      }}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={event => { composing.current = false; if (document.activeElement !== event.currentTarget && !revert.isDeferredFocus(document.activeElement)) commit(); }} />
    {revert.control}
    <p id={id + '-help'} className={'mt-1 text-xs leading-5 ' + (error ? 'text-red-700' : 'text-slate-500')}>
      {error || (input.dirty ? 'Unapplied edit — dependent quantities are incomplete.' :
        measurement.state === 'known' ? (measurement.provenance.confirmation.status === 'confirmed' ? 'Confirmed measurement.' : 'Unconfirmed measurement.') : 'Not measured.')}
      {input.unit !== draft.displayUnit ? ' This unfinished edit keeps its original unit context.' : ''}
    </p>
  </div>;
}
const models = [
  { field: 'ceiling', label: 'Ceiling model', supported: 'flat', text: 'Flat ceiling', unsupported: 'Sloped / vaulted / other' },
  { field: 'walls', label: 'Wall model', supported: 'vertical-uniform', text: 'Uniform vertical walls', unsupported: 'Varying / stepped / other' },
  { field: 'crownPath', label: 'Crown path', supported: 'rectangular-horizontal', text: 'Rectangular horizontal path', unsupported: 'Sloped / custom path' },
] as const;
export function RoomMeasurements({ draft, roomId, update }: { draft: PhysicalDraft; roomId: string; update: Change }) {
  const { store } = usePhysicalDraft();
  const nameSession = useRef<string | null>(null);
  const room = draft.document.rooms.find(item => item.id === roomId)!;
  const applicability = draft.document.calculationContract!.rooms[roomId];
  function model(field: ApplicabilityField, value: string) {
    const declaration = { value, source: 'manual', confirmation: { status: 'unconfirmed' },
      ...(value === 'unknown' ? { detail: 'The user has not established this room model.' } :
        value === 'unsupported' ? { detail: 'The selected ceiling, wall or crown condition is outside the supported rectangular finish model.' } : {}) };
    update(current => setApplicability(current, roomId, field, declaration as RoomApplicability[typeof field]));
  }
  const openings = draft.document.openings.filter(opening => opening.attachments.some(attachment => room.wallFaces.some(wall => wall.id === attachment.wallFaceId)));
  const group = draft.document.editorContract?.groups.find(item => item.roomIds.includes(roomId));
  return <div className="space-y-4" data-testid="physical-room-inspector" data-room-id={roomId}>
    <RoomLevelAssignment key={draft.id + roomId} draft={draft} roomId={roomId} update={update} />
    <div><Label htmlFor={'physical-name-' + roomId}>Room name</Label>
      <Input id={'physical-name-' + roomId} className="mt-1 bg-white" value={room.name ?? ''}
        onFocus={() => { nameSession.current = crypto.randomUUID(); }}
        onBlur={() => { nameSession.current = null; }}
        onKeyDown={event => {
          if (event.key === 'Enter' && !event.repeat && !event.nativeEvent.isComposing && event.keyCode !== 229) {
            event.preventDefault(); nameSession.current = crypto.randomUUID();
          }
        }}
        onChange={event => {
          const name = event.target.value;
          store.updateDraft(draft.id, draft.localEditRevision, current => renameRoom(current, roomId, name),
            { nameSession: nameSession.current ?? undefined });
        }} /></div>
    <RoomUseControl draft={draft} roomId={roomId} update={update} />
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
      {ROOM_FIELDS.map(field => <MeasurementField key={roomId + ":" + field} {...{ draft, roomId, field, update }} />)}
    </div>
    <p className="text-xs leading-5 text-slate-600">Ceiling height is finished-floor to finished-ceiling height. It is separate from plan width, stair rise and rough framing height.</p>
    <fieldset className="space-y-3 border-t pt-3">
      <legend className="text-sm font-semibold">Calculation model</legend>
      {models.map(item => <div key={item.field}>
        <Label htmlFor={'physical-model-' + item.field}>{item.label}</Label>
        <select className={selectClass} id={'physical-model-' + item.field} value={applicability[item.field].value}
          onChange={event => model(item.field, event.target.value)}>
          <option value="unknown">Unknown — needs review</option><option value={item.supported}>{item.text}</option>
          <option value="unsupported">{item.unsupported}</option>
        </select>
      </div>)}
      <p className="text-xs leading-5 text-slate-500">Declaration changes start unconfirmed; use Review inputs for explicit review. {(draft.document.schemaVersion === 4 || draft.document.schemaVersion === 5) ? 'Flat ceiling supports separately specified internal rectangular openings; unmodeled voids, soffits and other shapes remain unsupported.' : 'Flat ceiling assumes no unmodeled voids or soffits.'} Uniform walls use the entered height around the room. Unsupported conditions block their dependent quantities.</p>
    </fieldset>
    {openings.length || group ? <div className="border-t pt-3 text-xs leading-5 text-slate-600">
      {group ? <p>Group preserved: {group.id} ({group.roomIds.length} rooms)</p> : null}
      {openings.length ? <p>{openings.length} opening{openings.length === 1 ? '' : 's'} retained, including their sizes, appearance and source evidence. Choose an opening from the list or drawing to edit it.</p> : null}
    </div> : null}
  </div>;
}
