import { z } from 'zod';
import { physicalDocumentSchema } from '@shared/domain/document';
import { parseMeasurement } from '@shared/domain/parseMeasurement';
import { copyJson } from '@shared/quantities/canonicalJson';
import { measurementEventCaptureSchema } from '@shared/quantities/snapshot';
import { assertRoomOnlyDocument, committedFieldText, QuickRoomError, ROOM_FIELDS, type QuickRoomDraft } from './state';

export const QUICK_ROOM_STORAGE_KEY = 'modern-floor-planner:quick-rooms:v1';
const fieldSchema = z.object({ text: z.string(), unit: z.enum(['ft', 'm']), dirty: z.boolean() }).strict();
const envelopeSchema = z.object({
  version: z.literal('quick-room-draft-v1'), document: physicalDocumentSchema,
  displayUnit: z.enum(['ft', 'm']),
  fields: z.record(z.object({ length: fieldSchema, width: fieldSchema, ceilingHeight: fieldSchema }).strict()),
  events: z.array(measurementEventCaptureSchema),
}).strict();

export type DraftReadResult = { status: 'empty' } | { status: 'recovered'; draft: QuickRoomDraft }
  | { status: 'corrupt' | 'unsupported'; message: string };

function validateEnvelope(input: unknown): DraftReadResult {
  let copied: unknown;
  try { copied = copyJson(input); }
  catch { return { status: 'corrupt', message: 'The stored Quick Rooms draft is not valid finite JSON.' }; }
  if (typeof copied !== 'object' || copied === null || Array.isArray(copied)) {
    return { status: 'corrupt', message: 'The stored Quick Rooms draft has an invalid shape.' };
  }
  if ((copied as { version?: unknown }).version !== 'quick-room-draft-v1') {
    return { status: 'unsupported', message: 'This stored Quick Rooms draft uses an unsupported version.' };
  }
  const parsed = envelopeSchema.safeParse(copied);
  if (!parsed.success) return { status: 'corrupt', message: 'The stored Quick Rooms draft or its measurement evidence is invalid.' };
  try { assertRoomOnlyDocument(parsed.data.document); }
  catch (error) {
    return { status: error instanceof QuickRoomError && error.code === 'UNSUPPORTED_DOCUMENT' ? 'unsupported' : 'corrupt',
      message: error instanceof Error ? error.message : 'The stored physical document is invalid.' };
  }
  const draft = parsed.data;
  const ids = draft.document.rooms.map(room => room.id);
  if (Object.keys(draft.fields).length !== ids.length || ids.some(id => !Object.prototype.hasOwnProperty.call(draft.fields, id))) {
    return { status: 'corrupt', message: 'Stored room fields do not match the physical rooms.' };
  }
  for (const room of draft.document.rooms) for (const field of ROOM_FIELDS) {
    const measurement = room[field], raw = draft.fields[room.id][field];
    if (measurement.state === 'known' && measurement.provenance.confirmation.status !== 'unconfirmed') {
      return { status: 'unsupported', message: 'Quick Rooms currently supports unverified measurements only; the existing draft is preserved.' };
    }
    if (raw.dirty) continue;
    if (measurement.state !== 'known') {
      if (raw.text.trim() !== '') return { status: 'corrupt', message: 'An unresolved measurement cannot have committed text.' };
    } else {
      const text = parseMeasurement(raw.text, { selectedUnit: raw.unit });
      // Accept the exact shared-formatter presentation after a unit switch, or
      // original committed syntax that round-trips to the same physical value.
      // Never trust dirty:false alone to display the previous quantity.
      if (raw.text !== committedFieldText(measurement, raw.unit)
          && (!text.ok || text.measurement.valueMm !== measurement.valueMm)) {
        return { status: 'corrupt', message: 'Stored visible text disagrees with its committed measurement.' };
      }
    }
  }
  if (draft.events.some(capture => capture.target.entity !== 'room' || capture.event.action !== 'correct'
      || capture.event.after.state !== 'known' || capture.event.after.provenance.confirmation.status !== 'unconfirmed')) {
    return { status: 'unsupported', message: 'This draft contains measurement actions outside the Quick Rooms workflow.' };
  }
  // Preserve original validated plain JSON rather than normalizing arbitrary
  // metadata with a schema output. Every returned object is detached from input.
  return { status: 'recovered', draft: copied as QuickRoomDraft };
}

/** No browser globals or writes here. Callers must preserve corrupt/unsupported
 * bytes and handle Storage access/quota failures visibly, without clear().
 */
export function parseDraft(raw: string | null): DraftReadResult {
  if (raw === null) return { status: 'empty' };
  let value: unknown;
  try { value = JSON.parse(raw); }
  catch { return { status: 'corrupt', message: 'The stored Quick Rooms draft cannot be read as JSON.' }; }
  return validateEnvelope(value);
}

export function serializeDraft(draft: QuickRoomDraft): string {
  const result = validateEnvelope(draft);
  if (result.status !== 'recovered') {
    throw new QuickRoomError('INVALID_DRAFT_CACHE', result.status === 'empty' ? 'An empty envelope cannot be cached.' : result.message);
  }
  return JSON.stringify(result.draft);
}
