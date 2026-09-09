import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useInputRevert } from '@/components/InputRevert';
import { captureFieldRevert, revertField } from './fieldRevert';
import type { PhysicalDraft } from './state';
import { QUANTITY_OUTPUTS, type QuantityOutput } from '@shared/domain/geometryValidation';
import type { QuantitySelection } from '@shared/quantities/policy';
import { setOutputEnabled, setOutputTargets, selectAllCurrentTargets, setTakeoffBasis, setCrownGaps,
  getWasteField, editWaste, commitWaste, wasteError } from './takeoffCommands';
import { buildTakeoffReadModel, OUTPUT_LABELS, type DrawingSourceScope } from './takeoffReadModel';
import { TakeoffResults } from './TakeoffResults';

type Change = (change: (draft: PhysicalDraft) => PhysicalDraft, expectedRevision?: number) => boolean;
type Face = { openingId: string; wallFaceId: string };
type Choice = { key: string; label: string; value: string | Face };
const faceKey = (face: Face) => JSON.stringify([face.openingId, face.wallFaceId]);
const keyOf = (value: string | Face) => typeof value === 'string' ? value : faceKey(value);
export function scopeChoices(draft: PhysicalDraft, output: QuantityOutput): Choice[] {
  const rooms = draft.document.rooms;
  const walls = rooms.flatMap(room => room.wallFaces.map(wall => ({ key: wall.id, label: (room.name || 'Room') + ' · ' + wall.side + ' wall', value: wall.id })));
  if (output === 'floor-area' || output === 'ceiling-area') return rooms.map(room => ({ key: room.id, label: room.name || 'Room', value: room.id }));
  if (output === 'door-casing' || output === 'window-casing') return openingFaces(draft).filter(choice =>
    draft.document.openings.find(opening => opening.id === (choice.value as Face).openingId)?.kind === (output === 'door-casing' ? 'door' : 'window'));
  if (output === 'opening-inventory') return draft.document.openings.map(opening => ({ key: opening.id, label: openingLabel(draft, opening.id), value: opening.id }));
  return walls;
}
export function openingLabel(draft: PhysicalDraft, id: string): string {
  const opening = draft.document.openings.find(item => item.id === id);
  if (!opening) return 'Removed opening';
  const index = draft.document.openings.filter(item => item.kind === opening.kind).findIndex(item => item.id === id) + 1;
  return (opening.kind === 'door' ? 'Door' : opening.kind === 'window' ? 'Window' : 'Opening') + ' ' + index;
}
function openingFaces(draft: PhysicalDraft): Choice[] {
  return draft.document.openings.flatMap(opening => opening.attachments.map(face => {
    const room = draft.document.rooms.find(room => room.wallFaces.some(wall => wall.id === face.wallFaceId));
    const wall = room?.wallFaces.find(wall => wall.id === face.wallFaceId);
    const value = { openingId: opening.id, wallFaceId: face.wallFaceId };
    return { key: faceKey(value), label: openingLabel(draft, opening.id) + ' · ' + (room?.name || 'Room') + ' · ' + wall?.side + ' wall', value };
  }));
}
function targets(selection: QuantitySelection): (string | Face)[] {
  return 'roomIds' in selection ? selection.roomIds : 'wallFaceIds' in selection ? selection.wallFaceIds : 'openingIds' in selection ? selection.openingIds : selection.faces;
}
function targetNoun(output: QuantityOutput) { return output === 'floor-area' || output === 'ceiling-area' ? 'rooms' : output.includes('casing') ? 'faces' : output === 'opening-inventory' ? 'openings' : 'walls'; }
export function TakeoffPanel({ draft, update, onFocus, review, showScope, onShowScope }: {
  draft: PhysicalDraft; update: Change; onFocus: (scope: DrawingSourceScope) => void; review: ReactNode;
  showScope: boolean; onShowScope: (show: boolean) => void;
}) {
  const [active, setActive] = useState<QuantityOutput>('floor-area');
  const [reviewVisible, setReviewVisible] = useState(false);
  const model = useMemo(() => buildTakeoffReadModel(draft), [draft]);
  const output = draft.request.selections.some(selection => selection.output === active) ? active : draft.request.selections[0]?.output;
  const selection = draft.request.selections.find(selection => selection.output === output);
  const choices = output ? scopeChoices(draft, output) : [];
  const chosen = selection ? targets(selection) : [];
  const selectedKeys = new Set(chosen.map(keyOf));
  const waste = output && output !== 'opening-inventory' ? getWasteField(draft, output) : null;
  function toggleTarget(choice: Choice, include: boolean) {
    if (!output || !selection) return;
    const values = include ? [...chosen, choice.value] : chosen.filter(value => keyOf(value) !== choice.key);
    update(current => setOutputTargets(current, output, values as string[] | Face[]), draft.localEditRevision);
  }
  return <section data-testid="takeoff-panel" aria-label="Measured takeoff" className="space-y-4 rounded-lg border bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">Measured takeoff</h2>
      <p className="mt-1 text-sm text-slate-600">Choose work and its targets. Inspecting a room or moving the camera does not change this scope.</p></div>
      <Button variant="outline" size="sm" aria-expanded={reviewVisible} onClick={() => setReviewVisible(value => !value)}>Review inputs</Button>
    </div>
    <fieldset><legend className="mb-2 text-sm font-semibold">Work to measure</legend>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">{QUANTITY_OUTPUTS.map(value => <label key={value} className="flex items-center gap-2 rounded-md border p-2 text-sm">
        <input type="checkbox" aria-label={'Measure ' + OUTPUT_LABELS[value]} checked={draft.request.selections.some(selection => selection.output === value)}
          onChange={event => { const checked = event.target.checked; update(current => setOutputEnabled(current, value, checked)); if (checked) setActive(value); }} />{OUTPUT_LABELS[value]}</label>)}</div>
    </fieldset>
    <div className="grid gap-4 border-t pt-4 lg:grid-cols-2">
      <div><label className="grid gap-1 text-sm font-medium">Opening measurement basis for takeoff
        <select className="h-10 w-full rounded-md border bg-white px-2" value={draft.request.policy.openingMeasureBasis}
          onChange={event => { const value = event.target.value as typeof draft.request.policy.openingMeasureBasis; update(current => setTakeoffBasis(current, value)); }}>
          <option value="finished">Finished</option><option value="nominal">Nominal</option><option value="clear">Clear</option><option value="rough">Rough</option>
        </select></label><p className="mt-1 text-xs leading-5 text-slate-500">Opening measurements must match this basis. Choosing a policy does not convert their dimensions.</p></div>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={showScope} onChange={event => onShowScope(event.target.checked)} />Show takeoff scope in drawing</label>
    </div>
    {selection && output ? <fieldset className="min-w-0 rounded-md border bg-slate-50 p-3" data-testid="takeoff-scope-controls">
      <legend className="px-1 text-sm font-semibold">Explicit targets and waste</legend>
      <div className="flex flex-wrap items-end gap-3"><label className="grid min-w-0 basis-full gap-1 text-sm font-medium sm:flex-1">Configure work
        <select className="h-10 w-full min-w-0 rounded-md border bg-white px-2" value={output} onChange={event => setActive(event.target.value as QuantityOutput)}>
          {draft.request.selections.map(item => <option key={item.output} value={item.output}>{OUTPUT_LABELS[item.output]}</option>)}
        </select></label>
        <Button size="sm" variant="outline" onClick={() => update(current => selectAllCurrentTargets(current, output))}>All current {targetNoun(output)}</Button>
        <Button size="sm" variant="outline" onClick={() => update(current => setOutputTargets(current, output, []))}>Clear targets</Button>
      </div>
      <p className="my-3 text-xs text-slate-600">{chosen.length} selected · {choices.filter(choice => !selectedKeys.has(choice.key)).length} current targets not included. Newly added targets are not included automatically.</p>
      <div className="grid max-h-52 gap-2 overflow-y-auto sm:grid-cols-2">{choices.map(choice => <label key={choice.key} className="flex items-start gap-2 text-sm">
        <input className="mt-1" type="checkbox" aria-label={'Include ' + choice.label} checked={selectedKeys.has(choice.key)} onChange={event => toggleTarget(choice, event.target.checked)} />{choice.label}
      </label>)}{!choices.length ? <p className="text-sm text-slate-600">No available {targetNoun(output)} yet.</p> : null}</div>
      {waste ? <WasteInput key={output} draft={draft} output={output} update={update} /> : <p className="mt-3 text-xs text-slate-600">Inventory counts physical identities; no waste is applied.</p>}
      {output === 'crown' ? <fieldset className="mt-4 border-t pt-3"><legend className="text-sm font-medium">Explicit full-height gaps</legend>
        <p className="mb-2 text-xs leading-5 text-slate-600">Only deduct selected, measured floor-to-ceiling gaps. The engine checks their full height; ordinary doors are not deducted automatically.</p>
        <div className="grid max-h-44 gap-2 overflow-y-auto sm:grid-cols-2">{openingFaces(draft).map(choice => <label key={choice.key} className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" aria-label={'Deduct full-height gap ' + choice.label} checked={draft.request.policy.crownFullHeightGaps.some(face => faceKey(face) === choice.key)}
            onChange={event => { const include = event.target.checked; const faces = include ? [...draft.request.policy.crownFullHeightGaps, choice.value as Face] : draft.request.policy.crownFullHeightGaps.filter(face => faceKey(face) !== choice.key); update(current => setCrownGaps(current, faces), draft.localEditRevision); }} />{choice.label}
        </label>)}</div>
      </fieldset> : null}
    </fieldset> : null}
    {draft.takeoffState?.notice ? <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">{draft.takeoffState.notice.message}</p> : null}
    {model.errors.length ? <ul className="space-y-1 text-sm text-amber-900">{model.errors.map((error, index) => <li key={error.code + index}>{error.message}</li>)}</ul> : null}
    <TakeoffResults outputs={model.outputs} onFocus={onFocus} />
    {reviewVisible ? review : null}
    <p className="border-t pt-3 text-xs leading-5 text-slate-500">These are measured finish quantities. Waste-adjusted values are not boxes, sheets, gallons, prices or an order-ready construction materials list. Input review is not professional verification or code compliance. Recovery is temporary in this browser tab.</p>
  </section>;
}

function WasteInput({ draft, output, update }: { draft: PhysicalDraft; output: QuantityOutput; update: Change }) {
  const composing = useRef(false), inputRef = useRef<HTMLInputElement>(null);
  const waste = getWasteField(draft, output), error = waste.dirty ? wasteError(waste) : null;
  const revert = useInputRevert(inputRef, {
    name: 'Revert ' + OUTPUT_LABELS[output].replace(/ area$/, '').toLowerCase() + ' waste',
    identity: draft.id + ':' + output, revision: draft.localEditRevision, pending: waste.dirty,
    onLeave: () => { if (!composing.current) applyWaste(); },
    onRevert: () => {
      const token = captureFieldRevert(draft, { kind: 'waste', output });
      return update(current => revertField(current, token), token.revision);
    },
  });
  function applyWaste() {
    // Keep malformed text inline; a second error at the page top would move the next click.
    update(current => wasteError(getWasteField(current, output)) ? current : commitWaste(current, output));
  }
  return <div className="relative mt-4 max-w-xs"><label className="block min-h-7 pr-16 text-sm font-medium" htmlFor="takeoff-waste">Waste percentage</label>
    <Input ref={inputRef} id="takeoff-waste" type="text" className="mt-1 bg-white" value={waste.text} aria-invalid={Boolean(error)} aria-describedby="takeoff-waste-help"
      onChange={event => { const text = event.target.value; update(current => editWaste(current, output, text)); }}
      onBlur={event => { if (!composing.current && !revert.skipBlur(event)) applyWaste(); }}
      onCompositionStart={() => { composing.current = true; }} onCompositionEnd={event => {
        composing.current = false;
        if (document.activeElement !== event.currentTarget && !revert.isDeferredFocus(document.activeElement)) applyWaste();
      }}
      onKeyDown={event => {
        if (revert.onInputKeyDown(event, composing.current)) return;
        if (event.key === 'Enter' && !composing.current && !event.nativeEvent.isComposing && !event.repeat) {
          event.preventDefault(); applyWaste();
        }
      }} />
    {revert.control}
    <p id="takeoff-waste-help" className={'mt-1 text-xs leading-5 ' + (error ? 'text-red-700' : 'text-slate-600')}>{error || '0% by default. 10% means 0.10, applied once to the net measured quantity.'}</p>
  </div>;
}
