import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ControlledOpeningSizeField } from '@/components/OpeningSizeField';
import { getDoorHand, getStoredHinge } from '@/utils/doorGeometry';
import type { PhysicalOpening, WallSide } from '@shared/domain/document';
import { formatMeasurement } from '@shared/domain/parseMeasurement';
import type { PhysicalDraft } from './state';
import * as commands from './openingCommands';
import { captureFieldRevert, revertField } from './fieldRevert';

export type PhysicalChange = (change: (draft: PhysicalDraft) => PhysicalDraft, expectedRevision?: number) => boolean;
const names: Record<PhysicalOpening['kind'], string> = { door: 'Door', window: 'Window', 'floor-level-opening': 'Opening' };
export const openingName = (opening: PhysicalOpening) => names[opening.kind];
const selectClass = 'mt-1 h-9 w-full min-w-0 rounded-md border bg-white px-2 text-sm';
const starts: Record<WallSide, string> = { top: 'top-left corner, toward the right', right: 'top-right corner, downward',
  bottom: 'bottom-right corner, toward the left', left: 'bottom-left corner, upward' };
const proposedAppearance: NonNullable<PhysicalOpening['appearance']> = {
  style: 'single', swingDirection: 'inward', swingSide: 'right', metadata: {},
};

export function OpeningList({ draft, roomId, selectedId, onSelect, update }: {
  draft: PhysicalDraft; roomId: string; selectedId: string | null;
  onSelect: (id: string) => void; update: PhysicalChange;
}) {
  const room = draft.document.rooms.find(item => item.id === roomId)!;
  const openings = draft.document.openings.filter(opening => opening.attachments.some(a => room.wallFaces.some(w => w.id === a.wallFaceId)));
  function create(kind: PhysicalOpening['kind']) {
    const id = crypto.randomUUID();
    const offset = room.length.state === 'known' ? room.length.valueMm / 2 : 0;
    if (update(current => commands.addOpening(current, id, kind, room.wallFaces[0].id, offset, new Date().toISOString(),
      { widthMm: (kind === 'door' ? 32 : 36) * 25.4, ...(kind === 'door' ? { appearance: proposedAppearance } : {}) }))) onSelect(id);
  }
  return <section className="space-y-3 rounded-lg border bg-white p-4" aria-label="Room openings">
    <h2 className="font-semibold">Doors and openings</h2>
    <div className="flex flex-wrap gap-2">
      {(['door', 'window', 'floor-level-opening'] as const).map(kind => <Button key={kind} size="sm" variant="outline"
        onClick={() => create(kind)}>Create {names[kind].toLowerCase()}</Button>)}
    </div>
    <p className="text-xs leading-5 text-slate-500">Proposed widths: door 32 in, window/opening 36 in. Enter actual size, height, sill and basis; fit remains unverified while required inputs are missing.</p>
    {openings.length ? <div className="grid gap-2" aria-label="Openings in selected room">
      {openings.map(opening => {
        const number = openings.filter(item => item.kind === opening.kind).findIndex(item => item.id === opening.id) + 1;
        const checks = commands.openingValidationMessages(draft, opening.id);
        const wall = room.wallFaces.find(w => opening.attachments.some(a => a.wallFaceId === w.id));
        return <Button key={opening.id} variant={selectedId === opening.id ? 'secondary' : 'outline'}
          data-testid={'physical-opening-list-' + opening.id} aria-pressed={selectedId === opening.id}
          className="h-auto min-w-0 justify-start whitespace-normal py-2 text-left" onClick={() => onSelect(opening.id)}>
          <span><span className="block">{names[opening.kind]} {number} · {wall?.side} wall</span>
            <span className="text-xs font-normal">{checks.status === 'invalid' ? 'Needs correction' : checks.status === 'undetermined' ? 'Incomplete / fit unverified' : 'Geometry fits · measurements need review'}
              {opening.attachments.length > 1 ? ' · shared on two faces' : ''}</span></span>
        </Button>;
      })}
    </div> : <p className="text-sm text-slate-500">No openings in this room.</p>}
  </section>;
}

export function OpeningMeasurements({ draft, openingId, update, onDeleted, commandError }: {
  draft: PhysicalDraft; openingId: string; update: PhysicalChange; onDeleted: () => void; commandError?: string;
}) {
  const opening = draft.document.openings.find(item => item.id === openingId)!;
  const attachment = opening.attachments[0];
  const room = draft.document.rooms.find(item => item.wallFaces.some(wall => wall.id === attachment.wallFaceId))!;
  const wall = room.wallFaces.find(item => item.id === attachment.wallFaceId)!;
  const raw = commands.getOpeningFields(draft, openingId);
  const shared = opening.attachments.length > 1;
  const validation = commands.openingValidationMessages(draft, openingId);
  function appearance(patch: Partial<NonNullable<PhysicalOpening['appearance']>>) {
    if (opening.appearance) update(current => commands.setOpeningAppearance(current, openingId,
      { ...opening.appearance!, ...patch }, new Date().toISOString()));
  }
  function measurement(field: 'width' | 'height' | 'sillHeight' | 'offset', label: string, choices: number[] = []) {
    const input = raw[field];
    const value = field === 'offset' ? null : opening[field];
    return <ControlledOpeningSizeField key={openingId + ':' + field} label={label}
      visibleLabel={(field === 'sillHeight' ? 'Sill / elevation' : field === 'offset' ? 'Center from start' : field === 'width' ? 'Width' : 'Height') + ' (' + input.unit + ')'}
      revert={{ name: 'Revert ' + label.toLowerCase(), identity: draft.id + ':' + openingId + ':' + field,
        revision: draft.localEditRevision, pending: input.dirty,
        onRevert: () => {
          const token = captureFieldRevert(draft, { kind: 'opening', id: openingId, field });
          return update(current => revertField(current, token), token.revision);
        } }}
      text={input.text} choices={choices} disabled={shared && field === 'offset'}
      error={input.dirty ? commands.openingFieldError(input, field) : null}
      hint={input.dirty ? 'Unapplied edit' + (input.unit !== draft.displayUnit ? ' · original unit context' : '') : value && value.state !== 'known' ? 'Not measured / needs review' : undefined}
      onChange={text => update(current => commands.editOpeningField(current, openingId, field, text))}
      onCommit={() => update(current => {
        // Keep unfinished text and its inline error without moving navigation
        // controls through a second, page-level error during input blur.
        const pending = commands.getOpeningFields(current, openingId)[field];
        return commands.openingFieldError(pending, field) ? current :
          commands.commitOpeningField(current, openingId, field, new Date().toISOString());
      })}
      onPreset={inches => update(current => commands.applyOpeningPreset(current, openingId, field, inches + ' in', new Date().toISOString()))} />;
  }
  return <div className="min-w-0 space-y-4" data-testid="physical-opening-inspector" data-opening-id={openingId}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold">{names[opening.kind]} properties</h2>
      <Button size="sm" variant="outline" onClick={() => {
        if (update(current => commands.deleteOpening(current, openingId, new Date().toISOString()))) onDeleted();
      }}>Delete {names[opening.kind].toLowerCase()}</Button>
    </div>
    {commandError ? <p role="alert" className="rounded border border-red-200 bg-red-50 p-2 text-xs leading-5 text-red-800">{commandError}</p> : null}
    <div className="grid min-w-0 grid-cols-2 gap-2">
      <div><Label htmlFor="opening-room" className="text-xs">Room</Label>
        <select id="opening-room" aria-label="Opening room" className={selectClass} value={room.id} disabled={shared}
          onChange={event => {
            const nextRoom = draft.document.rooms.find(item => item.id === event.target.value)!;
            const nextWall = nextRoom.wallFaces.find(item => item.side === wall.side)!;
            update(current => commands.moveOpening(current, openingId, nextWall.id, attachment.offsetMm, new Date().toISOString()));
          }}>
          {draft.document.rooms.map(item => <option key={item.id} value={item.id}>{item.name || 'Room'}</option>)}
        </select></div>
      <div><Label htmlFor="opening-wall" className="text-xs">Wall</Label>
        <select id="opening-wall" aria-label="Opening wall" className={selectClass} value={wall.id} disabled={shared}
          onChange={event => update(current => commands.moveOpening(current, openingId, event.target.value, attachment.offsetMm, new Date().toISOString()))}>
          {room.wallFaces.map(item => <option key={item.id} value={item.id}>{item.side[0].toUpperCase() + item.side.slice(1)} wall</option>)}
        </select></div>
      {measurement('width', names[opening.kind] + ' width', opening.kind === 'door' ? [24, 28, 30, 32, 36] : [24, 30, 36, 48, 60, 72])}
      {measurement('height', names[opening.kind] + ' height', opening.kind === 'door' ? [80, 84, 96] : [24, 36, 48, 60, 72])}
      {measurement('sillHeight', 'Sill height')}
      {measurement('offset', 'Position from wall start')}
    </div>
    <p className="text-xs leading-5 text-slate-600" data-testid="physical-anchor-help">Position is to the opening center. Clockwise start: {starts[wall.side]}. Sill is above finished floor.</p>
    {shared ? <p role="status" className="text-xs leading-5 text-amber-800">This is one shared opening on two faces. Moving it or editing its position is disabled because both attachments must remain linked. Dimension changes are checked against both rooms.
      {opening.attachments.map((face, index) => {
        const parent = draft.document.rooms.find(item => item.wallFaces.some(w => w.id === face.wallFaceId))!;
        const side = parent.wallFaces.find(w => w.id === face.wallFaceId)!.side;
        return <span key={face.wallFaceId} className="block">{index === 0 ? 'Primary' : 'Other'} face: {parent.name || 'Room'} · {side} wall · center {formatMeasurement(face.offsetMm, draft.displayUnit, 4)} from its clockwise start.</span>;
      })}</p> : null}
    <div><Label htmlFor="opening-basis" className="text-xs">Measurement basis</Label>
      <select id="opening-basis" className={selectClass} value={opening.measureBasis}
        onChange={event => update(current => commands.setOpeningBasis(current, openingId, event.target.value as PhysicalOpening['measureBasis'], new Date().toISOString()))}>
        <option value="unknown">Unknown — needs review</option><option value="finished">Finished</option>
        <option value="nominal">Nominal</option><option value="clear">Clear</option><option value="rough">Rough</option>
      </select></div>
    {opening.width.state === 'needs-review' ? <div className="text-xs leading-5 text-amber-800">
      <p>Imported widths conflict. Enter a measured correction explicitly; the original candidates remain preserved.</p>
      <ul>{opening.width.candidates.map((candidate, index) => <li key={index}>{formatMeasurement(candidate.valueMm, draft.displayUnit, 6)}</li>)}</ul>
    </div> : null}
    {opening.kind === 'door' ? opening.appearance ? <div className="space-y-3 border-t pt-3">
      <div><Label htmlFor="physical-door-style" className="text-xs">Door style</Label>
        <select id="physical-door-style" className={selectClass} value={opening.appearance.style}
          onChange={event => appearance({ style: event.target.value as NonNullable<PhysicalOpening['appearance']>['style'] })}>
          <option value="single">Single door</option><option value="double">Double door</option>
          <option value="sliding">Sliding door</option><option value="bifold">Bifold door</option>
        </select></div>
      {opening.appearance.style !== 'sliding' ? <div className="grid grid-cols-2 gap-2">
        <div><Label htmlFor="physical-door-swing" className="text-xs">Swing</Label>
          <select id="physical-door-swing" className={selectClass} value={opening.appearance.swingDirection}
            onChange={event => appearance({ swingDirection: event.target.value as 'inward' | 'outward' })}>
            <option value="inward">Inward</option><option value="outward">Outward</option>
          </select></div>
        <div><Label htmlFor="physical-door-hand" className="text-xs">Hand</Label>
          <select id="physical-door-hand" className={selectClass} value={getDoorHand(opening.appearance.swingSide, opening.appearance.swingDirection)}
            onChange={event => appearance({ swingSide: getStoredHinge(event.target.value as 'left' | 'right', opening.appearance!.swingDirection) })}>
            <option value="left">Left hand (LH)</option><option value="right">Right hand (RH)</option>
          </select></div>
      </div> : null}
      <p className="text-xs leading-5 text-slate-500">Hand is viewed with your back to the hinge jamb, facing the latch. Style and handing change the symbol, not measurements.</p>
    </div> : <div className="space-y-2 text-xs leading-5 text-amber-800"><p>Door appearance is unknown. A historical symbol is source evidence only.</p>
      <Button size="sm" variant="outline" onClick={() => update(current => commands.setOpeningAppearance(current, openingId, proposedAppearance, new Date().toISOString()))}>Set proposed door appearance</Button></div> : null}
    <p className="text-xs leading-5 text-slate-500">Common sizes are editable proposals, not field confirmation. Measurements remain unconfirmed until explicit review.</p>
    <div className={'rounded border p-3 text-xs leading-5 ' + (validation.status === 'invalid' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-900')}
      role={validation.status === 'invalid' ? 'alert' : 'status'} data-testid="physical-opening-validation">
      <p className="font-medium">{validation.status === 'invalid' ? 'Needs correction' : validation.status === 'undetermined' ? 'Incomplete / fit unverified' : 'Geometry fits available inputs; measurements need review'}</p>
      <ul>{validation.messages.map((message, index) => <li key={index}>{message}</li>)}</ul>
    </div>
  </div>;
}
