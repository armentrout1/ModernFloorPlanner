import { CLOCKWISE_WALLS, physicalDocumentSchema, type PhysicalDocument, type PhysicalRoom } from '@shared/domain/document';
import { unknownMeasurement, type Dimension } from '@shared/domain/measurements';
import { applyMeasurementAction, type MeasurementEvent } from '@shared/domain/measurementActions';
import { formatMeasurement, parseMeasurement } from '@shared/domain/parseMeasurement';
import { QUANTITY_POLICY_VERSION, type QuantityRequest } from '@shared/quantities/policy';

export const ROOM_FIELDS = ['length', 'width', 'ceilingHeight'] as const;
export type RoomField = typeof ROOM_FIELDS[number];
export type InputUnit = 'ft' | 'm';
export interface FieldDraft { text: string; unit: InputUnit; dirty: boolean }
export interface CapturedRoomEvent {
  target: { entity: 'room'; id: string; field: RoomField };
  event: MeasurementEvent;
}
export interface QuickRoomDraft {
  version: 'quick-room-draft-v1';
  document: PhysicalDocument;
  displayUnit: InputUnit;
  fields: Record<string, Record<RoomField, FieldDraft>>;
  events: CapturedRoomEvent[];
}

export class QuickRoomError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'QuickRoomError'; }
}

const documentKeys = new Set(['schemaVersion', 'id', 'name', 'revisionId', 'quantityPolicyVersion', 'rooms', 'openings', 'review', 'metadata']);
const roomKeys = new Set(['id', 'name', 'length', 'width', 'ceilingHeight', 'wallFaces', 'presentation', 'metadata']);

/** This workflow owns unsaved room-only documents. Never silently lose future or
 * legacy-adapter content when cloning a room or recovering a versioned draft.
 */
export function assertRoomOnlyDocument(document: PhysicalDocument): void {
  if (!physicalDocumentSchema.safeParse(document).success) throw new QuickRoomError('INVALID_DOCUMENT', 'The physical room document is invalid.');
  if (document.id !== null || document.revisionId !== null || document.openings.length || document.review.length
      || (document.quantityPolicyVersion !== null && document.quantityPolicyVersion !== QUANTITY_POLICY_VERSION)
      || Object.keys(document).some(key => !documentKeys.has(key))
      || document.rooms.some(room => Object.keys(room).some(key => !roomKeys.has(key)))) {
    throw new QuickRoomError('UNSUPPORTED_DOCUMENT', 'This Quick Rooms draft contains unsupported content. Keep the original document unchanged.');
  }
}

export function createDraft(): QuickRoomDraft {
  return {
    version: 'quick-room-draft-v1',
    document: { schemaVersion: 2, id: null, name: 'Quick Rooms', revisionId: null,
      quantityPolicyVersion: QUANTITY_POLICY_VERSION, rooms: [], openings: [], review: [], metadata: {} },
    displayUnit: 'ft', fields: {}, events: [],
  };
}

function findRoom(draft: QuickRoomDraft, id: string): PhysicalRoom {
  const room = draft.document.rooms.find(value => value.id === id);
  if (!room || !Object.prototype.hasOwnProperty.call(draft.fields, id)) {
    throw new QuickRoomError('ROOM_NOT_FOUND', 'The selected room no longer exists.');
  }
  return room;
}

function roomFields(unit: InputUnit): Record<RoomField, FieldDraft> {
  return { length: { text: '', unit, dirty: false }, width: { text: '', unit, dirty: false },
    ceilingHeight: { text: '', unit, dirty: false } };
}

function newWalls(id: string): PhysicalRoom['wallFaces'] {
  return CLOCKWISE_WALLS.map(side => ({ id: id + ':' + side, side })) as PhysicalRoom['wallFaces'];
}

function checkNewRoom(draft: QuickRoomDraft, room: PhysicalRoom): void {
  const document = { ...draft.document, rooms: [...draft.document.rooms, room] };
  if (!physicalDocumentSchema.safeParse(document).success) {
    throw new QuickRoomError('INVALID_ROOM_ID', 'A new room and its wall faces need distinct valid IDs.');
  }
}

export function addRoom(draft: QuickRoomDraft, id: string, name = 'Room ' + (draft.document.rooms.length + 1)): QuickRoomDraft {
  assertRoomOnlyDocument(draft.document);
  const room: PhysicalRoom = { id, name, length: unknownMeasurement('Length has not been entered'),
    width: unknownMeasurement('Width has not been entered'), ceilingHeight: unknownMeasurement('Ceiling height has not been entered'),
    wallFaces: newWalls(id), metadata: {} };
  checkNewRoom(draft, room);
  const next = structuredClone(draft);
  next.document.rooms.push(room);
  next.fields = { ...next.fields, [id]: roomFields(draft.displayUnit) };
  return next;
}

export function renameRoom(draft: QuickRoomDraft, id: string, name: string): QuickRoomDraft {
  if (findRoom(draft, id).name === name) return draft;
  const next = structuredClone(draft);
  findRoom(next, id).name = name;
  return next;
}

export function editField(draft: QuickRoomDraft, id: string, field: RoomField, text: string): QuickRoomDraft {
  findRoom(draft, id);
  if (draft.fields[id][field].text === text) return draft;
  const next = structuredClone(draft);
  next.fields[id][field] = { ...next.fields[id][field], text, dirty: true };
  return next;
}

/** Empty fields become unknown on commit. Nonempty partial/invalid text remains
 * a form draft. The UI can distinguish this from a clean unknown using dirty.
 */
export function fieldError(field: FieldDraft): string | null {
  if (!field.text.trim()) return null;
  const parsed = parseMeasurement(field.text, { selectedUnit: field.unit });
  return parsed.ok ? null : parsed.message;
}

export function commitField(draft: QuickRoomDraft, id: string, field: RoomField, at: string): QuickRoomDraft {
  findRoom(draft, id);
  const input = draft.fields[id][field];
  if (!input.dirty) return draft; // Enter followed by blur does not apply twice.
  if (!input.text.trim()) {
    const next = structuredClone(draft);
    findRoom(next, id)[field] = unknownMeasurement('Measurement cleared in Quick Rooms');
    next.fields[id][field] = { ...next.fields[id][field], unit: draft.displayUnit, dirty: false };
    return next;
  }
  const parsed = parseMeasurement(input.text, { selectedUnit: input.unit });
  if (!parsed.ok) return draft;
  const target = { entity: 'room' as const, id, field };
  const applied = applyMeasurementAction(draft.document, target, { type: 'correct', at, replacement: parsed.measurement });
  if (!applied.ok) throw new QuickRoomError(applied.code, applied.message);
  const next = structuredClone(draft);
  next.document = applied.document;
  // An unresolved edit retains its original input unit until this successful
  // commit. Release that context now, preserving the actual parsed provenance.
  next.fields[id][field] = input.unit === draft.displayUnit
    ? { ...next.fields[id][field], dirty: false }
    : { text: committedFieldText(findRoom(next, id)[field], draft.displayUnit), unit: draft.displayUnit, dirty: false };
  next.events.push({ target, event: applied.event });
  return next;
}

/** Display precision only. This string is never written back to physical data
 * unless the user explicitly edits and commits it as a new measurement.
 */
export function committedFieldText(measurement: Dimension, unit: InputUnit): string {
  if (measurement.state !== 'known') return '';
  return formatMeasurement(measurement.valueMm, unit, 6).replace(/(\.\d*?[1-9])0+(?= )|\.0+(?= )/g, '$1');
}

export function switchUnit(draft: QuickRoomDraft, unit: InputUnit): QuickRoomDraft {
  if (draft.displayUnit === unit) return draft;
  const next = structuredClone(draft);
  next.displayUnit = unit;
  for (const room of next.document.rooms) {
    for (const field of ROOM_FIELDS) {
      const input = next.fields[room.id][field];
      if (!input.dirty) next.fields[room.id][field] = { text: committedFieldText(room[field], unit), unit, dirty: false };
    }
  }
  return next;
}

function unconfirmed(measurement: Dimension): Dimension {
  const copy = structuredClone(measurement);
  if (copy.state === 'known') copy.provenance.confirmation = { status: 'unconfirmed' };
  return copy;
}

export function duplicateRoom(draft: QuickRoomDraft, id: string, newId: string): QuickRoomDraft {
  assertRoomOnlyDocument(draft.document);
  const original = findRoom(draft, id);
  const room = structuredClone(original);
  room.id = newId;
  room.name = (original.name?.trim() || 'Room') + ' copy';
  room.wallFaces = newWalls(newId);
  for (const field of ROOM_FIELDS) room[field] = unconfirmed(room[field]);
  checkNewRoom(draft, room);
  const next = structuredClone(draft);
  next.document.rooms.push(room);
  next.fields = { ...next.fields, [newId]: structuredClone(draft.fields[id]) };
  // Original events retain their original target IDs; duplication is not a
  // second field measurement or a fabricated correction/confirmation event.
  return next;
}

/** The UI must obtain the intended explicit confirmation before invoking this. */
export function removeRoom(draft: QuickRoomDraft, id: string): QuickRoomDraft {
  assertRoomOnlyDocument(draft.document);
  findRoom(draft, id);
  const next = structuredClone(draft);
  next.document.rooms = next.document.rooms.filter(room => room.id !== id);
  delete next.fields[id];
  // Retain prior action evidence; historical targets need not still exist.
  return next;
}

/** Even a valid but uncommitted edit masks its previous physical value. This
 * detached preview cannot expose stale totals or mutate canonical evidence.
 */
export function previewDocument(draft: QuickRoomDraft): PhysicalDocument {
  const document = structuredClone(draft.document);
  for (const room of document.rooms) for (const field of ROOM_FIELDS) {
    if (draft.fields[room.id][field].dirty) room[field] = unknownMeasurement('Finish editing ' + field + ' to calculate this quantity');
  }
  return document;
}

export function requestForRooms(document: PhysicalDocument): QuantityRequest {
  return {
    policy: { version: QUANTITY_POLICY_VERSION, openingMeasureBasis: 'finished', crownFullHeightGaps: [] },
    selections: document.rooms.length ? [
      { output: 'floor-area', roomIds: document.rooms.map(room => room.id), wasteFraction: 0 },
      { output: 'ceiling-area', roomIds: document.rooms.map(room => room.id), wasteFraction: 0 },
      { output: 'gross-wall-area', wallFaceIds: document.rooms.flatMap(room => room.wallFaces.map(wall => wall.id)), wasteFraction: 0 },
    ] : [],
  };
}
