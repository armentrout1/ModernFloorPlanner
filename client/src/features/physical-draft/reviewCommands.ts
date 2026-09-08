import { z } from 'zod';
import { roomApplicabilitySchema, APPLICABILITY_FIELDS, type AppDeclaration, type ApplicabilityField } from '@shared/domain/applicability';
import { measurementAt, type MeasurementRef } from '@shared/domain/geometryValidation';
import { applyMeasurementAction } from '@shared/domain/measurementActions';
import { dimensionSchema, elevationSchema, type Dimension } from '@shared/domain/measurements';
import { parseMeasurement } from '@shared/domain/parseMeasurement';
import { canonicalJson, copyJson } from '@shared/quantities/canonicalJson';
import { committedFieldText, copyDraftForEdit, PhysicalDraftError, ROOM_FIELDS, type PhysicalDraft, type InputUnit } from './state';
import { getOpeningFields } from './openingCommands';

const copy = <T,>(value: T): T => copyJson(value) as unknown as T;
const timestamp = z.string().datetime({ offset: true });
const targetSchema = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('room'), id: z.string().min(1), field: z.enum(['length', 'width', 'ceilingHeight']) }).strict(),
  z.object({ entity: z.literal('opening'), id: z.string().min(1), field: z.enum(['width', 'height', 'sillHeight']) }).strict(),
]);
const measurementOriginSchema = z.object({ target: targetSchema, measurement: elevationSchema }).strict().superRefine((value, ctx) => {
  if ((value.target.entity !== 'opening' || value.target.field !== 'sillHeight') && !dimensionSchema.safeParse(value.measurement).success) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Measurement evidence must use the target field dimension domain.' });
  }
});
function declarationValid(field: ApplicabilityField, declaration: unknown): boolean {
  const base = { ceiling: { value: 'flat', source: 'proposed', confirmation: { status: 'unconfirmed' } },
    walls: { value: 'vertical-uniform', source: 'proposed', confirmation: { status: 'unconfirmed' } },
    crownPath: { value: 'rectangular-horizontal', source: 'proposed', confirmation: { status: 'unconfirmed' } } };
  return APPLICABILITY_FIELDS.includes(field) && roomApplicabilitySchema.safeParse({ ...base, [field]: declaration }).success;
}
const declarationSchema = z.custom<AppDeclaration>(value => !!value && typeof value === 'object');
const applicabilityOriginSchema = z.object({ roomId: z.string().min(1), field: z.enum(APPLICABILITY_FIELDS), declaration: declarationSchema }).strict()
  .superRefine((value, ctx) => { if (!declarationValid(value.field, value.declaration)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid model evidence.' }); });
export const applicabilityEventSchema = z.object({ action: z.enum(['declare', 'confirm']), at: timestamp,
  roomId: z.string().min(1), field: z.enum(APPLICABILITY_FIELDS), before: declarationSchema, after: declarationSchema,
}).strict().superRefine((value, ctx) => {
  if (!declarationValid(value.field, value.before) || !declarationValid(value.field, value.after)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid model declaration history.' }); return;
  }
  if (value.action === 'confirm') {
    const expected = { ...copy(value.before), confirmation: { status: 'confirmed', confirmedAt: value.at } };
    if (['unknown', 'unsupported'].includes(value.before.value) || canonicalJson(expected) !== canonicalJson(value.after)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Model confirmation must preserve its exact supported declaration.' });
    }
  } else if (value.after.confirmation.status !== 'unconfirmed') ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Changing a model declaration requires a separate confirmation.' });
});
export type ApplicabilityEvent = z.infer<typeof applicabilityEventSchema>;
export const reviewStateSchema = z.object({ version: z.literal('draft-review-v1'),
  measurementOrigins: z.array(measurementOriginSchema), applicabilityOrigins: z.array(applicabilityOriginSchema),
  applicabilityEvents: z.array(applicabilityEventSchema),
}).strict();
export type ReviewState = z.infer<typeof reviewStateSchema>;
export interface MeasurementReviewToken { draftId: string; revision: number; target: MeasurementRef; before: Dimension }
export interface ApplicabilityReviewToken { draftId: string; revision: number; roomId: string; field: ApplicabilityField; before: AppDeclaration }
function fail(code: string, message: string): never { throw new PhysicalDraftError(code, message); }
function validTimestamp(at: string) { if (!timestamp.safeParse(at).success) fail('INVALID_ACTION_TIME', 'An explicit valid review timestamp is required.'); }
function requireTarget(draft: PhysicalDraft, target: MeasurementRef): Dimension {
  if (!targetSchema.safeParse(target).success) fail('INVALID_MEASUREMENT_TARGET', 'Select a supported room or opening measurement.');
  const owner = target.entity === 'room' ? draft.document.rooms.find(room => room.id === target.id) : draft.document.openings.find(opening => opening.id === target.id);
  if (!owner) fail('INVALID_MEASUREMENT_TARGET', 'The reviewed measurement no longer exists.');
  return measurementAt(draft.document, target);
}
export function measurementReviewError(draft: PhysicalDraft, target: MeasurementRef): string | null {
  const measurement = requireTarget(draft, target);
  const raw = target.entity === 'room' ? draft.fields[target.id][target.field] : getOpeningFields(draft, target.id)[target.field];
  if (raw.dirty) return 'Finish or cancel this raw measurement edit before reviewing the committed value.';
  if (measurement.state !== 'known') return measurement.state === 'needs-review' ? 'Choose a specific candidate or enter a correction before confirming.' : 'Enter a known measurement before confirming.';
  if (measurement.provenance.confirmation.status === 'needs-review') return 'Correct or explicitly resolve this measurement before confirming its evidence.';
  return null;
}
function checkMeasurementToken(draft: PhysicalDraft, token: MeasurementReviewToken) {
  const current = requireTarget(draft, token.target);
  if (token.draftId !== draft.id || token.revision !== draft.localEditRevision || canonicalJson(token.before) !== canonicalJson(current)) {
    fail('STALE_MEASUREMENT_REVIEW', 'The draft or measurement changed after this review opened. Reopen review for the current value.');
  }
  const raw = token.target.entity === 'room' ? draft.fields[token.target.id][token.target.field] : getOpeningFields(draft, token.target.id)[token.target.field];
  if (raw.dirty) fail('PENDING_MEASUREMENT_REVIEW', 'Finish or cancel this raw measurement edit before reviewing the committed value.');
}
export function captureMeasurementReview(draft: PhysicalDraft, target: MeasurementRef): MeasurementReviewToken {
  return { draftId: draft.id, revision: draft.localEditRevision, target: copy(target), before: copy(requireTarget(draft, target)) };
}
/** Origins capture pre-existing confirmed evidence; they are local recovery consistency, not authentication. */
export function ensureReviewState(draft: PhysicalDraft): void {
  if (draft.reviewState) return;
  const targets: MeasurementRef[] = draft.document.rooms.flatMap(room => ROOM_FIELDS.map(field => ({ entity: 'room' as const, id: room.id, field }))) as MeasurementRef[];
  targets.push(...draft.document.openings.flatMap(opening => (['width', 'height', 'sillHeight'] as const).map(field => ({ entity: 'opening' as const, id: opening.id, field }))));
  draft.reviewState = { version: 'draft-review-v1', measurementOrigins: targets.filter(target => {
    const value = measurementAt(draft.document, target); return value.state === 'known' && value.provenance.confirmation.status === 'confirmed';
  }).map(target => ({ target, measurement: copy(measurementAt(draft.document, target)) })),
  applicabilityOrigins: draft.document.rooms.flatMap(room => APPLICABILITY_FIELDS.map(field => ({ roomId: room.id, field,
    declaration: copy(draft.document.calculationContract!.rooms[room.id][field]) }))), applicabilityEvents: [] };
}
function measurementAction(draft: PhysicalDraft, token: MeasurementReviewToken, action: unknown): PhysicalDraft {
  checkMeasurementToken(draft, token);
  const applied = applyMeasurementAction(draft.document, token.target, action);
  if (!applied.ok) fail(applied.code, applied.message);
  const next = copyDraftForEdit(draft); ensureReviewState(next);
  next.document = applied.document; next.events.push({ target: copy(token.target), event: applied.event });
  const text = committedFieldText(applied.event.after, draft.displayUnit);
  if (token.target.entity === 'room') {
    // Confirmation changes evidence only, so preserve exact fractional input text.
    if (applied.event.action !== 'confirm') next.fields[token.target.id][token.target.field] = { text, unit: draft.displayUnit, dirty: false };
  } else {
    const fields = copy(getOpeningFields(next, token.target.id));
    if (applied.event.action !== 'confirm') fields[token.target.field] = { text, unit: draft.displayUnit, dirty: false };
    next.openingFields = Object.fromEntries([...Object.entries(next.openingFields ?? {}), [token.target.id, fields]]);
  }
  return next;
}
export function confirmMeasurement(draft: PhysicalDraft, token: MeasurementReviewToken, at: string): PhysicalDraft {
  checkMeasurementToken(draft, token); validTimestamp(at);
  const error = measurementReviewError(draft, token.target); if (error) fail('INELIGIBLE_MEASUREMENT_REVIEW', error);
  if (token.before.state === 'known' && token.before.provenance.confirmation.status === 'confirmed') return draft;
  return measurementAction(draft, token, { type: 'confirm', at });
}
export function resolveMeasurementCandidate(draft: PhysicalDraft, token: MeasurementReviewToken, candidateIndex: number, at: string): PhysicalDraft {
  validTimestamp(at); return measurementAction(draft, token, { type: 'resolve-candidate', candidateIndex, at });
}
export function correctMeasurement(draft: PhysicalDraft, token: MeasurementReviewToken, text: string, unit: InputUnit, at: string): PhysicalDraft {
  validTimestamp(at);
  const parsed = parseMeasurement(text, { selectedUnit: unit, kind: token.target.entity === 'opening' && token.target.field === 'sillHeight' ? 'elevation' : 'dimension' });
  if (!parsed.ok) fail('INVALID_MEASUREMENT_CORRECTION', parsed.message);
  return measurementAction(draft, token, { type: 'correct', replacement: parsed.measurement, at });
}
function declarationAt(draft: PhysicalDraft, roomId: string, field: ApplicabilityField): AppDeclaration {
  if (!draft.document.rooms.some(room => room.id === roomId) || !APPLICABILITY_FIELDS.includes(field)) fail('INVALID_MODEL_REVIEW', 'Choose an existing room and supported model declaration.');
  return draft.document.calculationContract!.rooms[roomId][field];
}
export function captureApplicabilityReview(draft: PhysicalDraft, roomId: string, field: ApplicabilityField): ApplicabilityReviewToken {
  return { draftId: draft.id, revision: draft.localEditRevision, roomId, field, before: copy(declarationAt(draft, roomId, field)) };
}
export function confirmApplicability(draft: PhysicalDraft, token: ApplicabilityReviewToken, at: string): PhysicalDraft {
  validTimestamp(at);
  const before = declarationAt(draft, token.roomId, token.field);
  if (draft.id !== token.draftId || draft.localEditRevision !== token.revision || canonicalJson(before) !== canonicalJson(token.before)) {
    fail('STALE_MODEL_REVIEW', 'The draft or model declaration changed after this review opened. Reopen review for the current declaration.');
  }
  if (['unknown', 'unsupported'].includes(before.value)) fail('INELIGIBLE_MODEL_REVIEW', 'An unknown or unsupported model cannot be confirmed as supported. Declare the actual supported model first.');
  if (before.confirmation.status === 'confirmed') return draft;
  const next = copyDraftForEdit(draft); ensureReviewState(next);
  const after: AppDeclaration = { ...copy(before), confirmation: { status: 'confirmed', confirmedAt: at } };
  const event: ApplicabilityEvent = { action: 'confirm', at, roomId: token.roomId, field: token.field, before: copy(before), after: copy(after) };
  next.document.calculationContract!.rooms[token.roomId] = { ...next.document.calculationContract!.rooms[token.roomId], [token.field]: after };
  next.reviewState!.applicabilityEvents.push(event); return next;
}
/** Called by the existing declaration command on its single copied edit. */
export function recordApplicabilityDeclaration(draft: PhysicalDraft, roomId: string, field: ApplicabilityField, before: AppDeclaration, after: AppDeclaration, at: string): void {
  validTimestamp(at); ensureReviewState(draft);
  const event: ApplicabilityEvent = { action: 'declare', at, roomId, field, before: copy(before), after: copy(after) };
  if (!applicabilityEventSchema.safeParse(event).success) fail('INVALID_MODEL', 'Model changes remain unconfirmed until an explicit separate review.');
  draft.reviewState!.applicabilityEvents.push(event);
}
const targetKey = (target: MeasurementRef) => JSON.stringify([target.entity, target.id, target.field]);
const modelKey = (roomId: string, field: ApplicabilityField) => JSON.stringify([roomId, field]);
function sourceDocument(draft: PhysicalDraft): unknown {
  const original = draft.source.original;
  if (draft.source.kind === 'quick-rooms' && original && typeof original === 'object' && !Array.isArray(original)) {
    return (original as { document?: unknown }).document;
  }
  return draft.source.kind === 'physical' ? original : null;
}
function sourceMeasurement(draft: PhysicalDraft, target: MeasurementRef): unknown {
  const source = sourceDocument(draft) as { rooms?: unknown[]; openings?: unknown[] } | null;
  const owners = target.entity === 'room' ? source?.rooms : source?.openings;
  if (!Array.isArray(owners)) return undefined;
  const owner = owners.find(value => value && typeof value === 'object' && (value as { id?: unknown }).id === target.id);
  return owner && (owner as Record<string, unknown>)[target.field];
}
function sourceDeclaration(draft: PhysicalDraft, roomId: string, field: ApplicabilityField): unknown {
  const source = sourceDocument(draft) as { calculationContract?: { rooms?: Record<string, Record<string, unknown>> } } | null;
  const rooms = source?.calculationContract?.rooms;
  return rooms && Object.hasOwn(rooms, roomId) ? rooms[roomId]?.[field] : undefined;
}
const equalEvidence = (left: unknown, right: unknown) => left !== undefined && right !== undefined && canonicalJson(left) === canonicalJson(right);

/** Current confirmation must match retained valid action/origin evidence, not merely a status flag. */
export function validateReviewEvidence(draft: PhysicalDraft): string | null {
  const latest = new Map(draft.events.map(capture => [targetKey(capture.target), capture.event.after]));
  const origins = new Map<string, Dimension>();
  for (const origin of draft.reviewState?.measurementOrigins ?? []) {
    const key = targetKey(origin.target);
    if (origins.has(key) || origin.measurement.state !== 'known' || origin.measurement.provenance.confirmation.status !== 'confirmed') return 'Stored measurement origins are inconsistent.';
    if (!equalEvidence(sourceMeasurement(draft, origin.target), origin.measurement)
        && !draft.events.some(capture => targetKey(capture.target) === key && equalEvidence(capture.event.after, origin.measurement))) {
      return 'A confirmed measurement origin has no matching imported or action evidence.';
    }
    origins.set(key, origin.measurement);
  }
  const targets: MeasurementRef[] = draft.document.rooms.flatMap(room => ROOM_FIELDS.map(field => ({ entity: 'room' as const, id: room.id, field }))) as MeasurementRef[];
  targets.push(...draft.document.openings.flatMap(opening => (['width', 'height', 'sillHeight'] as const).map(field => ({ entity: 'opening' as const, id: opening.id, field }))));
  for (const target of targets) {
    const current = measurementAt(draft.document, target);
    if (current.state !== 'known' || current.provenance.confirmation.status !== 'confirmed') continue;
    const key = targetKey(target), evidence = latest.get(key) ?? origins.get(key) ?? sourceMeasurement(draft, target);
    if (!equalEvidence(evidence, current)) return 'A current confirmed measurement disagrees with its retained review evidence.';
  }
  if (!draft.reviewState) {
    for (const room of draft.document.rooms) for (const field of APPLICABILITY_FIELDS) {
      const declaration = draft.document.calculationContract!.rooms[room.id][field];
      if (declaration.confirmation.status === 'confirmed' && !equalEvidence(sourceDeclaration(draft, room.id, field), declaration)) return 'A confirmed model has no matching imported or action evidence.';
    }
    return null;
  }
  const models = new Map<string, AppDeclaration>();
  for (const origin of draft.reviewState.applicabilityOrigins) {
    const key = modelKey(origin.roomId, origin.field);
    if (models.has(key)) return 'Stored model origins contain duplicate identities.';
    if (origin.declaration.confirmation.status === 'confirmed'
        && !equalEvidence(sourceDeclaration(draft, origin.roomId, origin.field), origin.declaration)) return 'A confirmed model origin disagrees with its imported evidence.';
    models.set(key, origin.declaration);
  }
  for (const event of draft.reviewState.applicabilityEvents) {
    const key = modelKey(event.roomId, event.field), before = models.get(key);
    if (before && canonicalJson(before) !== canonicalJson(event.before)) return 'Stored model review transitions disagree with their previous declaration.';
    models.set(key, event.after);
  }
  for (const room of draft.document.rooms) for (const field of APPLICABILITY_FIELDS) {
    const current = draft.document.calculationContract!.rooms[room.id][field];
    const evidence = models.get(modelKey(room.id, field));
    if (evidence ? canonicalJson(evidence) !== canonicalJson(current) : current.confirmation.status === 'confirmed') return 'A current model declaration disagrees with its retained review evidence.';
  }
  return null;
}
