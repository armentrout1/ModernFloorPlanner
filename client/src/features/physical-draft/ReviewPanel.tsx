import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { measurementAt, type MeasurementRef } from '@shared/domain/geometryValidation';
import { formatMeasurement } from '@shared/domain/parseMeasurement';
import type { Dimension } from '@shared/domain/measurements';
import type { AppDeclaration, ApplicabilityField } from '@shared/domain/applicability';
import type { PhysicalDraft } from './state';
import { getOpeningFields } from './openingCommands';
import { captureMeasurementReview, confirmMeasurement, resolveMeasurementCandidate,
  captureApplicabilityReview, confirmApplicability } from './reviewCommands';
import type { DrawingSourceScope } from './takeoffReadModel';

const roomFields = [{ field: 'length', label: 'Length' }, { field: 'width', label: 'Width' }, { field: 'ceilingHeight', label: 'Ceiling height' }] as const;
const openingFields = [{ field: 'width', label: 'Width' }, { field: 'height', label: 'Height' }, { field: 'sillHeight', label: 'Sill height' }] as const;
const models = [{ field: 'ceiling', label: 'Ceiling model' }, { field: 'walls', label: 'Wall model' }, { field: 'crownPath', label: 'Crown path' }] as const;
type Session = { draftId: string; revision: number; label: string; unit: PhysicalDraft['displayUnit'] } & (
  { kind: 'measurement'; token: ReturnType<typeof captureMeasurementReview>; target: MeasurementRef; before: Dimension }
  | { kind: 'model'; token: ReturnType<typeof captureApplicabilityReview>; roomId: string; field: ApplicabilityField; before: AppDeclaration }
);
type Change = (change: (draft: PhysicalDraft) => PhysicalDraft, expectedRevision?: number) => boolean;
const emptyScope = (): DrawingSourceScope => ({ roomIds: [], wallFaceIds: [], openingIds: [], openingFaces: [] });
function valueText(measurement: Dimension, unit: PhysicalDraft['displayUnit']) {
  return measurement.state === 'known' ? formatMeasurement(measurement.valueMm, unit, 6) : measurement.state === 'needs-review' ? 'Conflicting candidates' : 'Unknown';
}
export function ReviewPanel({ draft, update, onFocus, commandError }: { draft: PhysicalDraft; update: Change; onFocus: (source: DrawingSourceScope) => void; commandError?: string | null }) {
  const options = [...draft.document.rooms.map(room => ({ key: 'room:' + room.id, entity: 'room' as const, id: room.id, label: room.name || 'Room' })),
    ...draft.document.openings.map(opening => {
      const kind = opening.kind === 'door' ? 'Door' : opening.kind === 'window' ? 'Window' : 'Opening';
      const index = draft.document.openings.filter(item => item.kind === opening.kind).findIndex(item => item.id === opening.id) + 1;
      const room = draft.document.rooms.find(room => room.wallFaces.some(wall => opening.attachments.some(face => face.wallFaceId === wall.id)));
      return { key: 'opening:' + opening.id, entity: 'opening' as const, id: opening.id, label: kind + ' ' + index + ' · ' + (room?.name || 'Room') };
    })];
  const reviewTrigger = useRef<HTMLButtonElement | null>(null);
  const reviewTarget = useRef<HTMLSelectElement | null>(null);
  const [selected, setSelected] = useState(''), [session, setSession] = useState<Session | null>(null);
  const [candidate, setCandidate] = useState(''), [message, setMessage] = useState('');
  const target = options.find(option => option.key === selected) ?? options[0];
  const stale = Boolean(session && (session.draftId !== draft.id || session.revision !== draft.localEditRevision));
  function openMeasurement(ref: MeasurementRef, label: string, trigger: HTMLButtonElement) {
    try { const token = captureMeasurementReview(draft, ref); reviewTrigger.current = trigger; setCandidate(''); setMessage('');
      setSession({ kind: 'measurement', token, target: ref, before: structuredClone(measurementAt(draft.document, ref)), label,
        draftId: draft.id, revision: draft.localEditRevision, unit: draft.displayUnit });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Finish this measurement before reviewing it.'); }
  }
  function openModel(roomId: string, field: ApplicabilityField, label: string, trigger: HTMLButtonElement) {
    try { const token = captureApplicabilityReview(draft, roomId, field); reviewTrigger.current = trigger; setMessage('');
      setSession({ kind: 'model', token, roomId, field, before: structuredClone(draft.document.calculationContract!.rooms[roomId][field]), label,
        draftId: draft.id, revision: draft.localEditRevision, unit: draft.displayUnit });
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Review this room model again.'); }
  }
  function confirm() {
    if (!session || stale) return;
    const applied = update(current => session.kind === 'measurement' ? confirmMeasurement(current, session.token, new Date().toISOString())
      : confirmApplicability(current, session.token, new Date().toISOString()), session.revision);
    if (applied) { setSession(null); setMessage('Reviewed input recorded. Geometry and applicability are checked separately.'); }
  }
  function resolve() {
    if (session?.kind !== 'measurement' || stale || candidate === '') return;
    const applied = update(current => resolveMeasurementCandidate(current, session.token, Number(candidate), new Date().toISOString()), session.revision);
    if (applied) { setSession(null); setMessage('Candidate selected. The measurement remains unconfirmed; review it separately.'); }
  }
  function editTarget() {
    if (!target) return;
    const scope = emptyScope();
    if (target.entity === 'room') scope.roomIds.push(target.id); else scope.openingIds.push(target.id);
    onFocus(scope);
  }
  return <section aria-label="Input review" data-testid="takeoff-review" className="space-y-4 rounded-lg border bg-slate-50 p-4">
    <div><h3 className="font-semibold">Review committed inputs</h3><p className="mt-1 text-xs leading-5 text-slate-600">Draft: {draft.document.name || 'Physical draft'} · {draft.id}. Confirm only values and room models you have reviewed. This records input review, not professional verification or code compliance.</p></div>
    {target ? <><div className="flex flex-wrap items-end gap-3"><label className="grid min-w-0 basis-full gap-1 text-sm font-medium sm:flex-1">Review target
      <select ref={reviewTarget} className="h-10 w-full rounded-md border bg-white px-2" value={target.key} onChange={event => setSelected(event.target.value)}>{options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label>
      <Button size="sm" variant="outline" onClick={editTarget}>Edit in inspector</Button></div>
      <div className="grid gap-3 md:grid-cols-3">{(target.entity === 'room' ? roomFields : openingFields).map(item => {
        const ref = { entity: target.entity, id: target.id, field: item.field } as MeasurementRef;
        const measurement = measurementAt(draft.document, ref);
        const raw = ref.entity === 'room' ? draft.fields[ref.id][ref.field] : getOpeningFields(draft, ref.id)[ref.field];
        return <article key={item.field} className="min-w-0 rounded-md border bg-white p-3" data-testid={'review-field-' + target.entity + '-' + target.id + '-' + item.field}>
          <h4 className="text-sm font-semibold">{item.label}</h4><p className="mt-2 text-sm tabular-nums">{valueText(measurement, draft.displayUnit)}</p>
          <p className="mt-1 break-words text-xs leading-5 text-slate-600">{measurement.state === 'known' ? 'Source: ' + measurement.provenance.source + ' · entered ' + (measurement.provenance.input ?? 'original input unavailable') + ' (' + measurement.provenance.unit + ')' : measurement.reason}</p>
          <p className="mt-1 text-xs text-amber-900">{raw.dirty ? 'Finish editing before review. Current text: ' + raw.text : measurement.state === 'known' ? measurement.provenance.confirmation.status === 'confirmed' ? 'Confirmed input' : 'Unconfirmed input' : 'Unresolved input'}</p>
          <Button className="mt-3" size="sm" variant="outline" disabled={raw.dirty} onClick={event => openMeasurement(ref, target.label + ' · ' + item.label, event.currentTarget)}>Review {item.label}</Button>
        </article>;
      })}</div>
      {target.entity === 'room' ? <div className="grid gap-3 md:grid-cols-3">{models.map(item => {
        const declaration = draft.document.calculationContract!.rooms[target.id][item.field];
        return <article key={item.field} className="rounded-md border bg-white p-3" data-testid={'review-model-' + target.id + '-' + item.field}>
          <h4 className="text-sm font-semibold">{item.label}</h4><p className="mt-2 text-sm">{declaration.value.replaceAll('-', ' ')}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">Source: {declaration.source} · {declaration.confirmation.status}{declaration.detail ? ' · ' + declaration.detail : ''}</p>
          <Button className="mt-3" size="sm" variant="outline" onClick={event => openModel(target.id, item.field, target.label + ' · ' + item.label, event.currentTarget)}>Review {item.label}</Button>
        </article>;
      })}</div> : null}
    </> : <p className="text-sm">Add a room before reviewing inputs.</p>}
    {message ? <p role="status" className="text-sm text-amber-900">{message}</p> : null}
    <Dialog open={Boolean(session)} onOpenChange={open => { if (!open) setSession(null); }}><DialogContent className="max-h-[85vh] overflow-y-auto" onCloseAutoFocus={event => {
      event.preventDefault();
      const trigger = reviewTrigger.current;
      if (trigger?.isConnected && !trigger.disabled) trigger.focus();
      else reviewTarget.current?.focus();
    }}>
      <DialogHeader><DialogTitle>{session?.kind === 'model' ? 'Review room model' : 'Review measurement'}</DialogTitle>
        <DialogDescription>Confirm the displayed input only. Geometry, completeness and supported room models remain independent checks.</DialogDescription></DialogHeader>
      {session ? <div className="space-y-4">
        <div><p className="font-semibold">{session.label}</p><p className="break-all text-xs text-slate-500">Draft {session.draftId} · edit {session.revision}</p></div>
        {session.kind === 'measurement' ? <>
          <p className="text-lg font-semibold">{valueText(session.before, session.unit)}</p>
          {session.before.state === 'known' ? <p className="break-words text-sm">Source: {session.before.provenance.source}. Original input: {session.before.provenance.input ?? 'unavailable'} ({session.before.provenance.unit}).</p> : <p className="text-sm text-amber-900">{session.before.reason}</p>}
          {session.before.state === 'needs-review' ? <><label className="grid gap-1 text-sm font-medium">Measurement candidate
            <select className="min-h-10 w-full rounded-md border bg-white px-2" value={candidate} disabled={stale} onChange={event => setCandidate(event.target.value)}>
              <option value="">Choose explicitly</option>{session.before.candidates.map((item, index) => <option key={index} value={index}>{item.label} · {formatMeasurement(item.valueMm, session.unit, 6)} · {item.provenance.source}</option>)}
            </select></label><Button disabled={stale || candidate === ''} onClick={resolve}>Resolve candidate</Button><p className="text-xs">Choosing a candidate does not confirm it. Its source and alternatives remain in review history.</p></> : null}
        </> : <><p className="text-lg font-semibold">{session.before.value.replaceAll('-', ' ')}</p><p className="text-sm">Source: {session.before.source}. {session.before.detail}</p>
          <p className="text-sm">{session.field === 'ceiling' ? 'Flat ceiling with no unmodeled slopes, voids or soffits.' : session.field === 'walls' ? 'Vertical walls use the entered ceiling height uniformly around this room.' : 'Crown follows the rectangular horizontal top perimeter; only explicitly selected full-height gaps are deducted.'}</p></>}
        {stale ? <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm">The draft changed while this review was open. Close and review the current value; unseen new values cannot be confirmed.</p> : null}
        {commandError ? <p role="alert" className="text-sm text-red-700">{commandError}</p> : null}
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setSession(null)}>Close review</Button>
          <Button disabled={stale || (session.kind === 'measurement' ? session.before.state !== 'known' || session.before.provenance.confirmation.status === 'needs-review' : ['unknown', 'unsupported'].includes(session.before.value))} onClick={confirm}>
            {session.kind === 'measurement' ? 'Confirm reviewed value' : 'Confirm reviewed model'}</Button></div>
      </div> : null}
    </DialogContent></Dialog>
  </section>;
}
