import { createUnspecifiedRoomUse } from '@shared/domain/layout';
import { reformatLayoutFields, maskLayoutFields, type LayoutRawEntry, type LayoutTextEntry, type LayoutAction } from './layoutCommands';
import { CLOCKWISE_WALLS, type PhysicalDocument, type PhysicalRoom } from '@shared/domain/document';
import { createProposedRoomApplicability, roomApplicabilitySchema, type AppDeclaration, type RoomApplicability } from '@shared/domain/applicability';
import { applyMeasurementAction, type MeasurementEvent } from '@shared/domain/measurementActions';
import { unknownMeasurement, type Dimension } from '@shared/domain/measurements';
import type { MeasurementRef } from '@shared/domain/geometryValidation';
import { parseMeasurement, formatMeasurement } from '@shared/domain/parseMeasurement';
import { QUANTITY_POLICY_VERSION_V2, QUANTITY_POLICY_VERSION_V3, QUANTITY_POLICY_VERSION_V4, type QuantityRequest } from '@shared/quantities/policy';
import { copyJson } from '@shared/quantities/canonicalJson';
import { assertSupportedPhysicalDocument, importLegacyPhysicalDraft, upgradePhysicalDraft,
  type PhysicalDraftSource } from '@shared/compatibility/physicalDraft';
import { parseDraft as parseQuickDraft } from '../quick-room/storage';
import type { QuickRoomDraft } from '../quick-room/state';
import { openingFieldsFor, type OpeningFields, type OpeningEvent, type OpeningDeleteUndo } from './openingCommands';
import type { TakeoffState } from './takeoffCommands';
import { recordApplicabilityDeclaration, type ReviewState } from './reviewCommands';

import { reformatStairFields, maskStairFields, type StairRawEntry, type StairAction } from './stairCommands';
import type { HistoryEvidence } from './historyEvidence';

export const ROOM_FIELDS = ['length', 'width', 'ceilingHeight'] as const;
export type RoomField = typeof ROOM_FIELDS[number];
export type InputUnit = 'ft' | 'm';
export interface FieldDraft { text: string; unit: InputUnit; dirty: boolean }
export interface CapturedMeasurementEvent { target: MeasurementRef; event: MeasurementEvent }
export interface PhysicalDraft {
  id: string;
  pendingInputs?: {
    version: 'physical-pending-input-v1';
    roomNames: Record<string, { text: string; dirty: boolean }>;
    buildingNames: Record<string, { kind: 'stair' | 'surface-opening'; id: string; text: string; dirty: boolean }>;
    roomLevels: Record<string, { from: string; to: string }>;
  };
  localEditRevision: number;
  document: PhysicalDocument;
  displayUnit: InputUnit;
  fields: Record<string, Record<RoomField, FieldDraft>>;
  events: CapturedMeasurementEvent[];
  request: QuantityRequest;
  source: PhysicalDraftSource;
  // Additive editor fields: Slice 1 caches lacking them remain unchanged.
  openingFields?: Record<string, OpeningFields>;
  openingEvents?: OpeningEvent[];
  openingDeleteUndo?: OpeningDeleteUndo;
  takeoffState?: TakeoffState;
  reviewState?: ReviewState;
  historyEvidence?: HistoryEvidence;
  layoutFields?: Record<string, LayoutRawEntry>;
  layoutTexts?: Record<string, LayoutTextEntry>;
  layoutEvents?: LayoutAction[];
  layoutNotice?: {message:string};
  layoutUpgradeLineage?: {version:'physical-layout-upgrade-v1';sourceDraftId:string;sourceRevision:number;at:string;originalDraft:unknown};
  stairFields?: Record<string, StairRawEntry>;
  stairEvents?: StairAction[];
  stairUpgradeLineage?: { version: 'physical-stair-upgrade-v1'; sourceDraftId: string; sourceRevision: number; at: string; originalDraft: unknown };
  levelView?: { version: 'physical-level-view-v1'; activeLevelId: string; pendingNames?: Record<string, string> };
  levelUpgradeLineage?: { version: 'physical-level-upgrade-v1'; sourceDraftId: string; sourceRevision: number; at: string; originalDraft: unknown };
}
export interface PhysicalDraftRegistry {
  version: 'mfp-editor-draft-v1' | 'mfp-editor-draft-v2' | 'mfp-editor-draft-v3' | 'mfp-editor-draft-v4';
  localEditRevision: number;
  selectedDraftId: string | null;
  drafts: PhysicalDraft[];
}
export class PhysicalDraftError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'PhysicalDraftError'; }
}
const validId = (id: string) => typeof id === 'string' && id.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(id);
const copy = <T,>(value: T): T => copyJson(value) as unknown as T;
const nextRevision = (revision: number) => {
  if (!Number.isSafeInteger(revision) || revision < 0 || revision === Number.MAX_SAFE_INTEGER) {
    throw new PhysicalDraftError('INVALID_REVISION', 'This draft edit counter cannot be advanced safely. Preserve the draft.');
  }
  return revision + 1;
};
const changed = (draft: PhysicalDraft): PhysicalDraft => ({ ...copy(draft), localEditRevision: nextRevision(draft.localEditRevision) });
export const copyDraftForEdit = changed;
function roomIn(draft: PhysicalDraft, id: string): PhysicalRoom {
  const room = draft.document.rooms.find(value => value.id === id);
  if (!room || !Object.hasOwn(draft.fields, id)) throw new PhysicalDraftError('ROOM_NOT_FOUND', 'The selected room is no longer in this draft.');
  return room;
}
function validField(field: RoomField) {
  if (!ROOM_FIELDS.includes(field)) throw new PhysicalDraftError('INVALID_FIELD', 'Choose a supported room measurement.');
}
export function committedFieldText(measurement: Dimension, unit: InputUnit): string {
  if (measurement.state !== 'known') return '';
  return formatMeasurement(measurement.valueMm, unit, 6).replace(/(\.\d*?[1-9])0+(?= )|\.0+(?= )/g, '$1');
}
function fieldsFor(document: PhysicalDocument, unit: InputUnit): PhysicalDraft['fields'] {
  return Object.fromEntries(document.rooms.map(room => [room.id, Object.fromEntries(ROOM_FIELDS.map(field =>
    [field, { text: committedFieldText(room[field], unit), unit, dirty: false }]))])) as PhysicalDraft['fields'];
}
export function requestForRooms(document: PhysicalDocument): QuantityRequest {
  return { policy: { version: ((document.schemaVersion === 4 || document.schemaVersion === 5)) ? QUANTITY_POLICY_VERSION_V4 : document.schemaVersion === 3 ? QUANTITY_POLICY_VERSION_V3 : QUANTITY_POLICY_VERSION_V2, openingMeasureBasis: 'finished', crownFullHeightGaps: [] },
    selections: document.rooms.length ? [
      { output: 'floor-area', roomIds: document.rooms.map(room => room.id), wasteFraction: 0 },
      { output: 'ceiling-area', roomIds: document.rooms.map(room => room.id), wasteFraction: 0 },
      { output: 'gross-wall-area', wallFaceIds: document.rooms.flatMap(room => room.wallFaces.map(wall => wall.id)), wasteFraction: 0 },
    ] : [] };
}
function entry(id: string, document: PhysicalDocument, source: PhysicalDraftSource, name?: string): PhysicalDraft {
  if (!validId(id)) throw new PhysicalDraftError('INVALID_DRAFT_ID', 'A local draft needs a distinct nonblank ID.');
  if (name !== undefined) document.name = name;
  assertSupportedPhysicalDocument(document);
  return { id, localEditRevision: 0, document, displayUnit: 'ft', fields: fieldsFor(document, 'ft'),
    events: [], request: requestForRooms(document), source };
}
export function createRegistry(): PhysicalDraftRegistry {
  return { version: 'mfp-editor-draft-v1', localEditRevision: 0, selectedDraftId: null, drafts: [] };
}
export function createDraft(id: string, name = 'Physical draft'): PhysicalDraft {
  return entry(id, { schemaVersion: 2, id: null, name, revisionId: null,
    quantityPolicyVersion: QUANTITY_POLICY_VERSION_V2, rooms: [], openings: [], review: [], metadata: {},
    calculationContract: { version: 'room-applicability-v1', rooms: {} },
    editorContract: { version: 'sketch-editor-v1', groups: [] } },
  { kind: 'new', operation: 'new-physical-draft-v1', original: null, review: [] });
}
export function adoptLegacyDraft(source: unknown, id: string, name?: string): PhysicalDraft {
  const imported = importLegacyPhysicalDraft(source);
  return entry(id, imported.document, imported.source, name);
}
export function adoptPhysicalDraft(source: unknown, id: string, name?: string): PhysicalDraft {
  const imported = upgradePhysicalDraft(source);
  return entry(id, imported.document, imported.source, name);
}
export function adoptQuickDraft(source: QuickRoomDraft, id: string, name?: string): PhysicalDraft {
  const original = copyJson(source);
  const validated = parseQuickDraft(JSON.stringify(original));
  if (validated.status !== 'recovered') throw new PhysicalDraftError('INVALID_QUICK_DRAFT',
    'The original Quick Rooms draft is invalid or unsupported. It has not been changed.');
  const imported = upgradePhysicalDraft(validated.draft.document);
  const draft = entry(id, imported.document, { ...imported.source, kind: 'quick-rooms', original }, name);
  draft.displayUnit = validated.draft.displayUnit;
  draft.fields = copy(validated.draft.fields);
  draft.events = copy(validated.draft.events);
  return draft;
}
export function insertDraft(registry: PhysicalDraftRegistry, draft: PhysicalDraft): PhysicalDraftRegistry {
  if (registry.drafts.some(item => item.id === draft.id)) throw new PhysicalDraftError('DUPLICATE_DRAFT_ID', 'Choose a new local draft identity; the existing draft was not replaced.');
  return { ...registry, version: draft.document.schemaVersion === 5 || registry.version === 'mfp-editor-draft-v4' ? 'mfp-editor-draft-v4' : draft.document.schemaVersion === 4 || registry.version === 'mfp-editor-draft-v3' ? 'mfp-editor-draft-v3' : draft.document.schemaVersion === 3 ? 'mfp-editor-draft-v2' : registry.version, localEditRevision: nextRevision(registry.localEditRevision), selectedDraftId: draft.id,
    drafts: [...registry.drafts, copy(draft)] };
}
export function selectDraft(registry: PhysicalDraftRegistry, id: string): PhysicalDraftRegistry {
  if (!registry.drafts.some(draft => draft.id === id)) throw new PhysicalDraftError('DRAFT_NOT_FOUND', 'That draft is no longer available.');
  if (registry.selectedDraftId === id) return registry;
  return { ...registry, selectedDraftId: id, localEditRevision: nextRevision(registry.localEditRevision) };
}
export function selectedDraft(registry: PhysicalDraftRegistry): PhysicalDraft | null {
  return registry.drafts.find(draft => draft.id === registry.selectedDraftId) ?? null;
}
export function updateDraft(registry: PhysicalDraftRegistry, id: string, expectedRevision: number,
  update: (draft: PhysicalDraft) => PhysicalDraft): PhysicalDraftRegistry {
  const draft = registry.drafts.find(value => value.id === id);
  if (!draft || registry.selectedDraftId !== id || draft.localEditRevision !== expectedRevision) {
    throw new PhysicalDraftError('STALE_DRAFT_EDIT', 'The selected draft changed. Your newer draft has not been overwritten; retry this edit in the current draft.');
  }
  const next = update(draft);
  if (next === draft) return registry;
  if (next.id !== id || next.localEditRevision !== expectedRevision + 1) {
    throw new PhysicalDraftError('INVALID_DRAFT_EDIT', 'A draft command must preserve its identity and advance exactly one local edit revision.');
  }
  return { ...registry, localEditRevision: nextRevision(registry.localEditRevision),
    drafts: registry.drafts.map(item => item.id === id ? next : item) };
}
export function addRoom(draft: PhysicalDraft, id: string, name = 'Room ' + (draft.document.rooms.length + 1)): PhysicalDraft {
  if (!validId(id)) throw new PhysicalDraftError('INVALID_ROOM_ID', 'A room needs a distinct nonblank ID.');
  const room: PhysicalRoom = { id, name, length: unknownMeasurement('Length has not been entered'),
    width: unknownMeasurement('Width has not been entered'), ceilingHeight: unknownMeasurement('Ceiling height has not been entered'),
    wallFaces: CLOCKWISE_WALLS.map(side => ({ id: id + ':' + side, side })) as PhysicalRoom['wallFaces'], metadata: {} };
  const next = changed(draft);
  next.document.rooms.push(room);
  if (next.document.schemaVersion !== 2) {
    const levelId = next.levelView?.activeLevelId;
    if (!levelId || !next.document.buildingLevels.levels.some(level => level.id === levelId)) throw new PhysicalDraftError('LEVEL_NOT_FOUND', 'Select an existing level before adding a room.');
    next.document.buildingLevels.roomLevels = Object.fromEntries([...Object.entries(next.document.buildingLevels.roomLevels), [id, levelId]]);
  }
  next.document.calculationContract!.rooms = Object.fromEntries([
    ...Object.entries(next.document.calculationContract!.rooms), [id, createProposedRoomApplicability()],
  ]);
  next.fields = Object.fromEntries([...Object.entries(next.fields), [id, fieldsFor({ ...next.document, rooms: [room] }, next.displayUnit)[id]]]);
  if(next.document.schemaVersion===5)next.document.layoutContract.roomUses=Object.fromEntries([...Object.entries(next.document.layoutContract.roomUses),[id,createUnspecifiedRoomUse()]]);
  assertSupportedPhysicalDocument(next.document);
  return next;
}
export function renameRoom(draft: PhysicalDraft, id: string, name: string): PhysicalDraft {
  if (roomIn(draft, id).name === name) return draft;
  const next = changed(draft);
  roomIn(next, id).name = name;
  return next;
}
export function editField(draft: PhysicalDraft, id: string, field: RoomField, text: string): PhysicalDraft {
  validField(field); roomIn(draft, id);
  if (draft.fields[id][field].text === text) return draft;
  const next = changed(draft);
  next.fields[id][field] = { ...next.fields[id][field], text, dirty: true };
  return next;
}
export function fieldError(field: FieldDraft): string | null {
  if (!field.text.trim()) return null;
  const parsed = parseMeasurement(field.text, { selectedUnit: field.unit });
  return parsed.ok ? null : parsed.message;
}
export function commitField(draft: PhysicalDraft, id: string, field: RoomField, at: string): PhysicalDraft {
  validField(field); roomIn(draft, id);
  const input = draft.fields[id][field];
  if (!input.dirty) return draft;
  if (!input.text.trim()) {
    const next = changed(draft);
    roomIn(next, id)[field] = unknownMeasurement('Measurement cleared in the physical draft');
    next.fields[id][field] = { text: input.text, unit: draft.displayUnit, dirty: false };
    return next;
  }
  const parsed = parseMeasurement(input.text, { selectedUnit: input.unit });
  if (!parsed.ok) return draft;
  const target = { entity: 'room' as const, id, field };
  const applied = applyMeasurementAction(draft.document, target, { type: 'correct', at, replacement: parsed.measurement });
  if (!applied.ok) throw new PhysicalDraftError(applied.code, applied.message);
  const next = changed(draft);
  next.document = applied.document;
  next.events.push({ target, event: applied.event });
  next.fields[id][field] = input.unit === draft.displayUnit ? { ...input, dirty: false }
    : { text: committedFieldText(roomIn(next, id)[field], draft.displayUnit), unit: draft.displayUnit, dirty: false };
  return next;
}
export function switchUnit(draft: PhysicalDraft, unit: InputUnit): PhysicalDraft {
  if (!['ft', 'm'].includes(unit)) throw new PhysicalDraftError('INVALID_UNIT', 'Choose feet or meters.');
  if (draft.displayUnit === unit) return draft;
  const next = changed(draft);
  next.displayUnit = unit;
  for (const room of next.document.rooms) for (const field of ROOM_FIELDS) {
    if (!next.fields[room.id][field].dirty) next.fields[room.id][field] = { text: committedFieldText(room[field], unit), unit, dirty: false };
  }
  if (next.openingFields) for (const opening of next.document.openings) {
    const fields = Object.hasOwn(next.openingFields, opening.id) ? next.openingFields[opening.id] : undefined;
    if (!fields) continue;
    const formatted = openingFieldsFor(opening, unit);
    for (const field of ['width', 'height', 'sillHeight', 'offset'] as const) if (!fields[field].dirty) fields[field] = formatted[field];
  }
  reformatStairFields(next, unit);
  reformatLayoutFields(next, unit);
  return next;
}
export function setApplicability(draft: PhysicalDraft, id: string, kind: keyof RoomApplicability, declaration: AppDeclaration, at = new Date().toISOString()): PhysicalDraft {
  roomIn(draft, id);
  if (!['ceiling', 'walls', 'crownPath'].includes(kind)) throw new PhysicalDraftError('INVALID_MODEL', 'Choose a supported model declaration.');
  const next = changed(draft);
  const current = next.document.calculationContract!.rooms[id];
  const proposed = { ...current, [kind]: copy(declaration) };
  if (!roomApplicabilitySchema.safeParse(proposed).success) throw new PhysicalDraftError('INVALID_MODEL', 'The model declaration is invalid; keep the supported value or explain what is unknown/unsupported.');
  recordApplicabilityDeclaration(next, id, kind, current[kind], declaration, at);
  next.document.calculationContract!.rooms[id] = proposed as RoomApplicability;
  return next;
}
/** Detached unresolved-field masking; neither canonical measurements nor originals are changed. */
export function previewDocument(draft: PhysicalDraft): PhysicalDocument {
  const document = copy(draft.document);
  for (const room of document.rooms) for (const field of ROOM_FIELDS) {
    if (draft.fields[room.id][field].dirty) room[field] = unknownMeasurement('Finish editing ' + field + ' to calculate this quantity');
  }
  for (const opening of document.openings) {
    const fields = draft.openingFields && Object.hasOwn(draft.openingFields, opening.id) ? draft.openingFields[opening.id] : undefined;
    if (!fields) continue;
    for (const field of ['width', 'height', 'sillHeight'] as const) if (fields[field].dirty) {
      opening[field] = unknownMeasurement('Finish editing opening ' + field + ' to calculate its dependent quantity');
    }
    // Physical-v2 requires a numeric offset. Keep the attachment, but block
    // dependent results until raw positioning is resolved; never invent zero.
    if (fields.offset.dirty) opening.width = unknownMeasurement('Finish editing opening center position to calculate its dependent quantity');
  }
  maskStairFields(draft, document);
  maskLayoutFields(draft, document);
  return document;
}
