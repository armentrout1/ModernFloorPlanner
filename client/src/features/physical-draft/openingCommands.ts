import { z } from 'zod';
import { physicalOpeningSchema, type PhysicalDocument, type PhysicalOpening } from '@shared/domain/document';
import { applyMeasurementAction } from '@shared/domain/measurementActions';
import { unknownMeasurement } from '@shared/domain/measurements';
import { parseMeasurement, formatMeasurement } from '@shared/domain/parseMeasurement';
import { validateGeometry, wallIndex } from '@shared/domain/geometryValidation';
import { elevationMmSchema, positiveMmSchema } from '@shared/domain/units';
import { copyJson, canonicalJson } from '@shared/quantities/canonicalJson';
import { quantityRequestSchema, type QuantityRequest } from '@shared/quantities/policy';
import { pruneTakeoffTargets, restoreTakeoffRequest, takeoffScopeRevision } from './takeoffCommands';
import { copyDraftForEdit, committedFieldText, PhysicalDraftError, previewDocument,
  type PhysicalDraft, type FieldDraft, type InputUnit } from './state';

export const OPENING_FIELDS = ['width', 'height', 'sillHeight', 'offset'] as const;
export type OpeningField = typeof OPENING_FIELDS[number];
export type OpeningFields = Record<OpeningField, FieldDraft>;
const id = z.string().refine(value => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value));
const atSchema = z.string().datetime({ offset: true });
const raw = z.object({ text: z.string(), unit: z.enum(['ft', 'm']), dirty: z.boolean() }).strict();
export const openingFieldsSchema = z.object({ width: raw, height: raw, sillHeight: raw, offset: raw }).strict();
export const openingEventSchema = z.object({
  action: z.enum(['add', 'move', 'correct', 'preset', 'clear', 'basis', 'appearance', 'delete', 'restore']),
  at: atSchema, id, before: physicalOpeningSchema.nullable(), after: physicalOpeningSchema.nullable(),
  input: z.object({ field: z.enum(OPENING_FIELDS), text: z.string(), unit: z.enum(['ft', 'm']) }).strict().optional(),
}).strict().superRefine((event, ctx) => {
  if ((event.before && event.before.id !== event.id) || (event.after && event.after.id !== event.id)
      || (event.action === 'add' && (event.before !== null || event.after === null))
      || (event.action === 'delete' && (event.before === null || event.after !== null))
      || (event.action === 'restore' && (event.before !== null || event.after === null))
      || (!['add', 'delete', 'restore'].includes(event.action) && (!event.before || !event.after))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Opening event must retain its exact target identity and action shape' });
  }
  if (event.before && event.after) {
    const allowed = event.action === 'move' ? ['attachments'] : event.action === 'basis' ? ['measureBasis']
      : event.action === 'appearance' ? ['appearance'] : ['width', 'height', 'sillHeight'];
    const omitted = (opening: PhysicalOpening) => Object.fromEntries(Object.entries(opening).filter(([key]) => !allowed.includes(key)));
    const changed = allowed.filter(key => canonicalJson(Object.fromEntries(Object.entries(event.before!).filter(([name]) => name === key)))
      !== canonicalJson(Object.fromEntries(Object.entries(event.after!).filter(([name]) => name === key))));
    if (canonicalJson(omitted(event.before)) !== canonicalJson(omitted(event.after)) || changed.length > 1
        || (event.action === 'move' && (event.before.attachments.length !== 1 || event.after.attachments.length !== 1))
        || (event.action === 'appearance' && event.after.kind !== 'door')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'An opening action may change only its declared field or attachment' });
    }
  }
});
export type OpeningEvent = z.infer<typeof openingEventSchema>;
export const openingDeleteUndoSchema = z.object({
  opening: physicalOpeningSchema, index: z.number().int().nonnegative(), fields: openingFieldsSchema,
  requestBefore: quantityRequestSchema, requestAfter: quantityRequestSchema,
  scopeRevisionAfter: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
}).strict();
export type OpeningDeleteUndo = z.infer<typeof openingDeleteUndoSchema>;
export interface OpeningOptions { widthMm?: number; appearance?: PhysicalOpening['appearance'] }
export interface OpeningValidation { status: 'valid' | 'invalid' | 'undetermined'; messages: string[] }
const copy = <T,>(value: T): T => copyJson(value) as unknown as T;
function fail(code: string, message: string): never { throw new PhysicalDraftError(code, message); }
const openingIn = (draft: PhysicalDraft, openingId: string) => draft.document.openings.find(opening => opening.id === openingId)
  ?? fail('OPENING_NOT_FOUND', 'The selected opening is no longer in this draft.');
const timestamp = (at: string) => { if (!atSchema.safeParse(at).success) fail('INVALID_ACTION_TIME', 'An explicit valid action timestamp is required.'); };
const sharedMove = () => fail('SHARED_OPENING_MOVE', 'This opening has two shared attachments. Moving either face requires a coordinated shared-opening operation.');
const fieldKind = (field: OpeningField) => field === 'sillHeight' || field === 'offset' ? 'elevation' as const : 'dimension' as const;

export function openingFieldsFor(opening: PhysicalOpening, unit: InputUnit): OpeningFields {
  return Object.fromEntries(OPENING_FIELDS.map(field => [field, { unit, dirty: false,
    text: field === 'offset' ? formatMeasurement(opening.attachments[0].offsetMm, unit, 6).replace(/(\.\d*?[1-9])0+(?= )|\.0+(?= )/g, '$1')
      : committedFieldText(opening[field], unit),
  }])) as OpeningFields;
}
export function getOpeningFields(draft: PhysicalDraft, openingId: string): OpeningFields {
  const opening = openingIn(draft, openingId);
  return draft.openingFields && Object.hasOwn(draft.openingFields, openingId) ? draft.openingFields[openingId] : openingFieldsFor(opening, draft.displayUnit);
}
function setFields(draft: PhysicalDraft, openingId: string, fields: OpeningFields) {
  draft.openingFields = Object.fromEntries([...Object.entries(draft.openingFields ?? {}), [openingId, fields]]);
}
function record(draft: PhysicalDraft, action: OpeningEvent['action'], openingId: string, before: PhysicalOpening | null,
  after: PhysicalOpening | null, at: string, input?: OpeningEvent['input']) {
  timestamp(at);
  draft.openingEvents = [...(draft.openingEvents ?? []), { action, at, id: openingId, before: copy(before), after: copy(after), ...(input ? { input: copy(input) } : {}) }];
}
function proposalWidth(valueMm: number) {
  positiveMmSchema.parse(valueMm);
  return { state: 'known' as const, valueMm: positiveMmSchema.parse(valueMm), provenance: {
    source: 'inferred' as const, input: 'Explicit proposed opening preset', unit: 'mm' as const,
    components: [{ text: String(valueMm), unit: 'mm' as const, precision: { kind: 'unavailable' as const } }],
    confirmation: { status: 'unconfirmed' as const },
  } };
}
export function createOpeningProposal(openingId: string, kind: PhysicalOpening['kind'], wallFaceId: string,
  offsetMm: number, options: OpeningOptions = {}): PhysicalOpening {
  id.parse(openingId); id.parse(wallFaceId);
  const opening: PhysicalOpening = { id: openingId, kind,
    width: options.widthMm === undefined ? unknownMeasurement('Opening width has not been entered') : proposalWidth(options.widthMm),
    height: unknownMeasurement('Opening height has not been entered'), sillHeight: unknownMeasurement('Opening sill/elevation has not been entered'),
    measureBasis: 'unknown', attachments: [{ wallFaceId, anchor: 'center', offsetMm: elevationMmSchema.parse(offsetMm) }],
    ...(options.appearance ? { appearance: copy(options.appearance) } : {}), metadata: {},
  };
  if (kind !== 'door' && options.appearance) fail('NOT_A_DOOR', 'Only doors have door style, hinge and swing properties.');
  physicalOpeningSchema.parse(opening);
  return opening;
}
function diagnostics(document: PhysicalDocument, openingId: string): OpeningValidation {
  const report = validateGeometry(document);
  if (!report.structuralValid) return { status: 'invalid', messages: report.findings.map(finding => finding.message) };
  const checks = report.checks.filter(check => check.openingIds.includes(openingId));
  const invalid = checks.filter(check => check.status === 'invalid');
  const undetermined = checks.filter(check => check.status === 'undetermined');
  const opening = document.openings.find(item => item.id === openingId);
  const basis = opening?.measureBasis === 'unknown' ? ['Measurement basis is unknown; choose its measured basis before using opening deductions.'] : [];
  if (opening?.kind === 'door' && !opening.appearance) basis.push('Door appearance is unrecorded; review style, hinge and swing explicitly.');
  if (opening?.width.state === 'needs-review') basis.push('Conflicting opening widths need an explicit measurement correction; the historical symbol is not a chosen width.');
  const walls = wallIndex(document);
  for (const attachment of opening?.attachments ?? []) {
    const room = walls.get(attachment.wallFaceId)?.room;
    const profile = room && document.calculationContract?.rooms[room.id]?.walls;
    if (!profile || profile.value !== 'vertical-uniform') basis.push('Vertical fit is not verified: the attached room wall model is ' + (profile?.value ?? 'unknown') + '. ' + (profile?.detail ?? 'Review uniform finished-wall height.'));
  }
  return { status: invalid.length ? 'invalid' : undetermined.length || basis.length ? 'undetermined' : 'valid',
    messages: Array.from(new Set([...invalid, ...undetermined].map(check => (check.status === 'undetermined' ? 'Not verified: ' : '') + check.message).concat(basis))) };
}
export function openingValidationMessages(draft: PhysicalDraft, openingId: string): OpeningValidation {
  openingIn(draft, openingId);
  return diagnostics(previewDocument(draft), openingId);
}
export function validateOpeningPlacement(draft: PhysicalDraft, opening: PhysicalOpening): OpeningValidation {
  const document = previewDocument(draft), index = document.openings.findIndex(item => item.id === opening.id);
  const candidate = copy(opening), fields = draft.openingFields && Object.hasOwn(draft.openingFields, opening.id) ? draft.openingFields[opening.id] : undefined;
  if (fields) {
    for (const field of ['width', 'height', 'sillHeight'] as const) if (fields[field].dirty) candidate[field] = unknownMeasurement('Finish the pending opening edit before verifying fit');
    if (fields.offset.dirty) candidate.width = unknownMeasurement('Finish the pending center position before verifying fit');
  }
  if (index < 0) document.openings.push(candidate); else document.openings[index] = candidate;
  return diagnostics(document, opening.id);
}
function assertGeometry(document: PhysicalDocument, openingId: string, codes?: string[]) {
  const report = validateGeometry(document);
  const invalid = report.checks.filter(check => check.status === 'invalid' && check.openingIds.includes(openingId)
    && (!codes || codes.includes(check.code)));
  if (!report.structuralValid || invalid.length) fail('INVALID_OPENING_GEOMETRY', !report.structuralValid
    ? 'The opening must retain valid existing wall attachments and unique identities.' : Array.from(new Set(invalid.map(check => check.message))).join(' '));
}
export function addOpening(draft: PhysicalDraft, openingId: string, kind: PhysicalOpening['kind'], wallFaceId: string,
  offsetMm: number, at: string, options: OpeningOptions = {}): PhysicalDraft {
  timestamp(at);
  if (draft.document.openings.some(item => item.id === openingId)) fail('DUPLICATE_OPENING_ID', 'An opening with this identity already exists.');
  const opening = createOpeningProposal(openingId, kind, wallFaceId, offsetMm, options);
  const next = copyDraftForEdit(draft); next.document.openings.push(opening);
  assertGeometry(next.document, openingId);
  setFields(next, openingId, openingFieldsFor(opening, next.displayUnit));
  record(next, 'add', openingId, null, opening, at);
  return next;
}
export function editOpeningField(draft: PhysicalDraft, openingId: string, field: OpeningField, text: string): PhysicalDraft {
  if (!OPENING_FIELDS.includes(field)) fail('INVALID_FIELD', 'Choose a supported opening measurement.');
  const opening = openingIn(draft, openingId);
  if (field === 'offset' && opening.attachments.length !== 1) sharedMove();
  const fields = getOpeningFields(draft, openingId);
  if (fields[field].text === text) return draft;
  const next = copyDraftForEdit(draft);
  setFields(next, openingId, { ...copy(fields), [field]: { ...fields[field], text, dirty: true } });
  return next;
}
export function openingFieldError(field: FieldDraft, key: OpeningField): string | null {
  if (!field.text.trim()) return key === 'offset' ? 'Enter a center distance; the current attachment is preserved until a valid position is entered.' : null;
  const parsed = parseMeasurement(field.text, { selectedUnit: field.unit, kind: fieldKind(key) });
  return parsed.ok ? null : parsed.message;
}
function commitRaw(draft: PhysicalDraft, openingId: string, field: OpeningField, input: FieldDraft, at: string,
  preset: boolean): PhysicalDraft {
  const before = openingIn(draft, openingId); timestamp(at);
  if (field === 'offset' && before.attachments.length !== 1) sharedMove();
  if (!input.text.trim() && field === 'offset') fail('INVALID_OPENING_POSITION', openingFieldError(input, field)!);
  const next = copyDraftForEdit(draft);
  let after = openingIn(next, openingId);
  if (!input.text.trim()) after[field as 'width' | 'height' | 'sillHeight'] = unknownMeasurement('Opening measurement cleared explicitly');
  else {
    const parsed = parseMeasurement(input.text, { selectedUnit: input.unit, kind: fieldKind(field) });
    if (!parsed.ok) fail('INVALID_OPENING_MEASUREMENT', parsed.message);
    if (field === 'offset') after.attachments[0].offsetMm = parsed.measurement.valueMm;
    else {
      if (preset) parsed.measurement.provenance.source = 'inferred';
      const target = { entity: 'opening' as const, id: openingId, field };
      const applied = applyMeasurementAction(next.document, target, { type: 'correct', at, replacement: parsed.measurement });
      if (!applied.ok) fail(applied.code, applied.message);
      next.document = applied.document; next.events.push({ target, event: applied.event }); after = openingIn(next, openingId);
    }
  }
  assertGeometry(next.document, openingId, field === 'width' || field === 'offset'
    ? ['HORIZONTAL_FIT', 'OPENING_OVERLAP'] : ['VERTICAL_FIT', 'FLOOR_LEVEL_SILL', 'OPENING_OVERLAP']);
  const fields = copy(getOpeningFields(draft, openingId));
  fields[field] = input.unit === next.displayUnit ? { ...input, dirty: false }
    : openingFieldsFor(after, next.displayUnit)[field];
  setFields(next, openingId, fields);
  record(next, !input.text.trim() ? 'clear' : preset ? 'preset' : field === 'offset' ? 'move' : 'correct', openingId, before, after, at, { field, text: input.text, unit: input.unit });
  return next;
}
export function commitOpeningField(draft: PhysicalDraft, openingId: string, field: OpeningField, at: string): PhysicalDraft {
  const input = getOpeningFields(draft, openingId)[field];
  if (!input.dirty) return draft;
  return commitRaw(draft, openingId, field, input, at, false);
}
export function applyOpeningPreset(draft: PhysicalDraft, openingId: string, field: OpeningField, text: string, at: string): PhysicalDraft {
  if (field !== 'width' && field !== 'height') fail('INVALID_PRESET', 'Common size presets apply to opening width or height only.');
  return commitRaw(draft, openingId, field, { text, unit: draft.displayUnit, dirty: true }, at, true);
}
export function moveOpening(draft: PhysicalDraft, openingId: string, wallFaceId: string, offsetMm: number, at: string): PhysicalDraft {
  const before = openingIn(draft, openingId); timestamp(at);
  if (before.attachments.length !== 1) sharedMove();
  if (getOpeningFields(draft, openingId).offset.dirty) fail('PENDING_OPENING_POSITION', 'Finish the pending center-position edit before dragging this opening. Your raw position text is preserved.');
  const offset = elevationMmSchema.safeParse(offsetMm);
  if (!offset.success) fail('INVALID_OPENING_POSITION', 'Opening center distance must be finite and nonnegative.');
  if (before.attachments[0].wallFaceId === wallFaceId && before.attachments[0].offsetMm === offset.data) return draft;
  const next = copyDraftForEdit(draft), after = openingIn(next, openingId);
  after.attachments = [{ wallFaceId, anchor: 'center', offsetMm: offset.data }];
  assertGeometry(next.document, openingId);
  const fields = copy(getOpeningFields(draft, openingId));
  fields.offset = openingFieldsFor(after, next.displayUnit).offset;
  setFields(next, openingId, fields); record(next, 'move', openingId, before, after, at);
  pruneTakeoffTargets(next, 'The opening moved to another wall.');
  return next;
}
export function setOpeningBasis(draft: PhysicalDraft, openingId: string, basis: PhysicalOpening['measureBasis'], at: string): PhysicalDraft {
  const before = openingIn(draft, openingId); timestamp(at);
  if (!['unknown', 'nominal', 'clear', 'finished', 'rough'].includes(basis)) fail('INVALID_BASIS', 'Choose a supported measured opening basis.');
  if (before.measureBasis === basis) return draft;
  const next = copyDraftForEdit(draft), after = openingIn(next, openingId); after.measureBasis = basis;
  record(next, 'basis', openingId, before, after, at); return next;
}
export function setOpeningAppearance(draft: PhysicalDraft, openingId: string, appearance: NonNullable<PhysicalOpening['appearance']>, at: string): PhysicalDraft {
  const before = openingIn(draft, openingId); timestamp(at);
  if (before.kind !== 'door') fail('NOT_A_DOOR', 'Only doors have door style, hinge and swing properties.');
  const after = { ...copy(before), appearance: copy(appearance) };
  if (!physicalOpeningSchema.safeParse(after).success) fail('INVALID_APPEARANCE', 'Choose a complete supported door appearance.');
  if (canonicalJson(after) === canonicalJson(before)) return draft;
  const next = copyDraftForEdit(draft); next.document.openings = next.document.openings.map(item => item.id === openingId ? after : item);
  record(next, 'appearance', openingId, before, after, at); return next;
}
export function deleteOpening(draft: PhysicalDraft, openingId: string, at: string): PhysicalDraft {
  const opening = openingIn(draft, openingId); timestamp(at);
  const next = copyDraftForEdit(draft);
  next.openingDeleteUndo = { opening: copy(opening), index: draft.document.openings.findIndex(item => item.id === openingId),
    fields: copy(getOpeningFields(draft, openingId)), requestBefore: copy(draft.request), requestAfter: copy(draft.request) };
  next.document.openings = next.document.openings.filter(item => item.id !== openingId);
  next.openingFields = Object.fromEntries(Object.entries(next.openingFields ?? {}).filter(([key]) => key !== openingId));
  pruneTakeoffTargets(next, 'The opening was deleted.');
  next.openingDeleteUndo.requestAfter = copy(next.request);
  next.openingDeleteUndo.scopeRevisionAfter = takeoffScopeRevision(next);
  record(next, 'delete', openingId, opening, null, at); return next;
}
export function undoOpeningDelete(draft: PhysicalDraft, at: string): PhysicalDraft {
  const undo = draft.openingDeleteUndo;
  if (!undo) return draft;
  timestamp(at);
  if (draft.document.openings.some(item => item.id === undo.opening.id)) fail('STALE_OPENING_UNDO', 'This opening identity is already present; the newer opening was not replaced.');
  const walls = wallIndex(draft.document);
  if (undo.opening.attachments.some(attachment => !walls.has(attachment.wallFaceId))) fail('STALE_OPENING_UNDO', 'An original parent wall no longer exists. The opening cannot be safely restored.');
  const next = copyDraftForEdit(draft);
  next.document.openings.splice(Math.min(undo.index, next.document.openings.length), 0, copy(undo.opening));
  assertGeometry(next.document, undo.opening.id);
  setFields(next, undo.opening.id, copy(undo.fields));
  if (canonicalJson(next.request) === canonicalJson(undo.requestAfter)
      && (undo.scopeRevisionAfter === undefined ? !next.takeoffState : takeoffScopeRevision(next) === undo.scopeRevisionAfter)) {
    restoreTakeoffRequest(next, undo.requestBefore);
  }
  // A later scope choice is independent of geometry undo and must not be replaced.
  delete next.openingDeleteUndo;
  record(next, 'restore', undo.opening.id, null, undo.opening, at); return next;
}
