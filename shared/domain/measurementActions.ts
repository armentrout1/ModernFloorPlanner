import { z } from 'zod';
import { dimensionSchema, elevationSchema, type Dimension, type KnownMeasurement } from './measurements';
import { adaptMeasurementDocument } from '../compatibility/legacyDocument';
import { validateGeometry, measurementAt, type MeasurementRef, type GeometryReport } from './geometryValidation';
import { physicalDocumentV3Schema, type PhysicalDocument } from './document';
import { copyJson } from '../quantities/canonicalJson';

const timestamp = z.string().datetime({ offset: true });
const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('confirm'), at: timestamp }).strict(),
  z.object({ type: z.literal('resolve-candidate'), at: timestamp, candidateIndex: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('correct'), at: timestamp, replacement: z.unknown() }).strict(),
]);
const targetSchema = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('room'), id: z.string().min(1), field: z.enum(['length', 'width', 'ceilingHeight']) }).strict(),
  z.object({ entity: z.literal('opening'), id: z.string().min(1), field: z.enum(['width', 'height', 'sillHeight']) }).strict(),
]);
export interface MeasurementEvent {
  action: 'confirm' | 'resolve-candidate' | 'correct'; at: string;
  before: Dimension; after: KnownMeasurement; candidateIndex?: number;
}
export type TransitionResult = { ok: true; measurement: KnownMeasurement; event: MeasurementEvent }
  | { ok: false; code: string; message: string };

/** Pure transition; the event is returned source evidence, not a persisted audit service.
 * Callers must retain the event alongside their later revision when adopting this API.
 */
export function transitionMeasurement(input: unknown, actionInput: unknown, kind: 'dimension' | 'elevation' = 'dimension'): TransitionResult {
  const schema = kind === 'elevation' ? elevationSchema : dimensionSchema;
  const current = schema.safeParse(input), action = actionSchema.safeParse(actionInput);
  if (!current.success || !action.success) return { ok: false, code: 'INVALID_MEASUREMENT_ACTION', message: 'Valid measurement, explicit action and timestamp are required' };
  const before = structuredClone(current.data), selected = action.data;
  let after: KnownMeasurement;
  if (selected.type === 'confirm') {
    if (before.state !== 'known') return { ok: false, code: 'CANNOT_CONFIRM_UNRESOLVED', message: 'Explicitly resolve or supply the measurement first' };
    after = { ...before, provenance: { ...before.provenance, confirmation: { status: 'confirmed', confirmedAt: selected.at } } };
  } else if (selected.type === 'resolve-candidate') {
    if (before.state !== 'needs-review' || !before.candidates[selected.candidateIndex]) return {
      ok: false, code: 'INVALID_CANDIDATE', message: 'Select an explicit existing candidate; no automatic default',
    };
    const chosen = before.candidates[selected.candidateIndex];
    after = { state: 'known', valueMm: chosen.valueMm,
      provenance: { ...structuredClone(chosen.provenance), confirmation: { status: 'unconfirmed' } } };
  } else {
    const replacement = schema.safeParse(selected.replacement);
    if (!replacement.success || replacement.data.state !== 'known' || replacement.data.provenance.source === 'imported') return {
      ok: false, code: 'INVALID_CORRECTION', message: 'Supply a known correction with new manual/traced/device/inferred evidence, not the original import',
    };
    after = structuredClone(replacement.data);
    after.provenance.confirmation = { status: 'unconfirmed' };
  }
  return { ok: true, measurement: structuredClone(after),
    event: { action: selected.type, at: selected.at, before, after: structuredClone(after),
      ...(selected.type === 'resolve-candidate' ? { candidateIndex: selected.candidateIndex } : {}) } };
}

export type DocumentActionResult = { ok: true; document: PhysicalDocument; target: MeasurementRef;
  event: MeasurementEvent; validation: GeometryReport } | { ok: false; code: string; message: string };

export function applyMeasurementAction(input: unknown, targetInput: unknown, action: unknown): DocumentActionResult {
  const target = targetSchema.safeParse(targetInput);
  if (!target.success) return { ok: false, code: 'INVALID_MEASUREMENT_TARGET', message: 'Select an explicit room/opening measurement field' };
  const version = (input as { schemaVersion?: unknown } | null)?.schemaVersion;
  if (version !== 2 && version !== 3) return {
    ok: false, code: 'V2_REQUIRED', message: 'Adapt legacy data explicitly before physical measurement actions',
  };
  let document: PhysicalDocument;
  if (version === 2) {
    const adapted = adaptMeasurementDocument(input);
    if (!('document' in adapted)) return { ok: false, code: 'INVALID_DOCUMENT', message: 'Expected structurally valid JSON v2 document' };
    document = adapted.document;
  } else {
    try { document = copyJson(input) as unknown as PhysicalDocument; }
    catch { return { ok: false, code: 'INVALID_DOCUMENT', message: 'Expected finite plain JSON physical data' }; }
    if (!physicalDocumentV3Schema.safeParse(document).success) return { ok: false, code: 'INVALID_DOCUMENT', message: 'Expected a valid level-owned physical document' };
  }
  const ref = target.data;
  const exists = ref.entity === 'room' ? document.rooms.some(room => room.id === ref.id) : document.openings.some(opening => opening.id === ref.id);
  if (!exists) return { ok: false, code: 'INVALID_MEASUREMENT_TARGET', message: 'Measurement owner does not exist' };
  const result = transitionMeasurement(measurementAt(document, ref), action,
    ref.entity === 'opening' && ref.field === 'sillHeight' ? 'elevation' : 'dimension');
  if (!result.ok) return result;
  if (ref.entity === 'room') document.rooms.find(room => room.id === ref.id)![ref.field] = result.measurement;
  else document.openings.find(opening => opening.id === ref.id)![ref.field] = result.measurement;
  // Resize/correction may make geometry invalid. Keep the explicit correction and
  // report it; never move openings, clamp values or erase other measurement evidence.
  return { ok: true, document, target: ref, event: result.event, validation: validateGeometry(document) };
}
