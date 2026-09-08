import { z } from 'zod';
import { physicalDocumentSchema } from '@shared/domain/document';
import { assertSupportedPhysicalDocument, PhysicalDraftImportError } from '@shared/compatibility/physicalDraft';
import { copyJson } from '@shared/quantities/canonicalJson';
import { quantityRequestSchema, validateQuantityRequest, QUANTITY_POLICY_VERSION_V2 } from '@shared/quantities/policy';
import { measurementEventCaptureSchema } from '@shared/quantities/snapshot';
import { parseMeasurement } from '@shared/domain/parseMeasurement';
import { committedFieldText, PhysicalDraftError, ROOM_FIELDS, type PhysicalDraftRegistry } from './state';
import { openingFieldsSchema, openingEventSchema, openingDeleteUndoSchema, openingFieldsFor, OPENING_FIELDS } from './openingCommands';

export const PHYSICAL_DRAFT_STORAGE_KEY = 'modern-floor-planner:editor-draft:v1';
const id = z.string().refine(value => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value));
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const field = z.object({ text: z.string(), unit: z.enum(['ft', 'm']), dirty: z.boolean() }).strict();
const source = z.object({ kind: z.enum(['new', 'quick-rooms', 'legacy', 'physical']),
  operation: z.enum(['new-physical-draft-v1', 'legacy-pixels-v2', 'physical-draft-upgrade-v1']),
  original: z.unknown(), review: z.array(z.string()),
}).strict();
const draft = z.object({ id, localEditRevision: revision, document: physicalDocumentSchema,
  displayUnit: z.enum(['ft', 'm']),
  fields: z.record(z.object({ length: field, width: field, ceilingHeight: field }).strict()),
  events: z.array(measurementEventCaptureSchema), request: quantityRequestSchema, source,
  openingFields: z.record(openingFieldsSchema).optional(),
  openingEvents: z.array(openingEventSchema).optional(),
  openingDeleteUndo: openingDeleteUndoSchema.optional(),
}).strict();
const registrySchema = z.object({ version: z.literal('mfp-editor-draft-v1'), localEditRevision: revision,
  selectedDraftId: id.nullable(), drafts: z.array(draft),
}).strict();
export type RegistryReadResult = { status: 'empty' } | { status: 'recovered'; registry: PhysicalDraftRegistry }
  | { status: 'corrupt' | 'unsupported'; message: string };
const corrupt = (message: string): RegistryReadResult => ({ status: 'corrupt', message });

/** Validate without schema normalization: opaque source/metadata bytes must survive recovery. */
export function validateRegistry(input: unknown): RegistryReadResult {
  let copied: unknown;
  try { copied = copyJson(input); }
  catch { return corrupt('The stored physical draft registry is not finite plain JSON.'); }
  if (!copied || typeof copied !== 'object' || Array.isArray(copied)) return corrupt('The stored physical draft registry has an invalid shape.');
  if ((copied as { version?: unknown }).version !== 'mfp-editor-draft-v1') return {
    status: 'unsupported', message: 'This stored physical draft registry uses an unsupported version. Its contents are preserved.',
  };
  const parsed = registrySchema.safeParse(copied);
  if (!parsed.success) return corrupt('The stored physical draft, its raw fields, or its measurement evidence is invalid.');
  const registry = copied as PhysicalDraftRegistry;
  const ids = registry.drafts.map(item => item.id);
  if (new Set(ids).size !== ids.length || (registry.selectedDraftId !== null && !ids.includes(registry.selectedDraftId))) {
    return corrupt('Stored draft identities or the selected draft are inconsistent.');
  }
  for (const item of registry.drafts) {
    try { assertSupportedPhysicalDocument(item.document); }
    catch (error) { return { status: error instanceof PhysicalDraftImportError && error.code === 'UNSUPPORTED_CONTENT' ? 'unsupported' : 'corrupt',
      message: error instanceof Error ? error.message : 'The stored physical document is invalid.' }; }
    if (item.document.id !== null || item.document.revisionId !== null) return corrupt('A temporary draft cannot impersonate a saved document revision.');
    if (item.document.quantityPolicyVersion !== QUANTITY_POLICY_VERSION_V2 || !item.document.calculationContract || !item.document.editorContract) {
      return { status: 'unsupported', message: 'This draft has not explicitly adopted the supported physical editor contract. Its contents are preserved.' };
    }
    const roomIds = item.document.rooms.map(room => room.id);
    if (Object.keys(item.fields).length !== roomIds.length || roomIds.some(roomId => !Object.hasOwn(item.fields, roomId))) {
      return corrupt('Stored room fields do not match the physical document.');
    }
    for (const room of item.document.rooms) for (const key of ROOM_FIELDS) {
      const measurement = room[key], raw = item.fields[room.id][key];
      if (raw.dirty) continue;
      if (measurement.state !== 'known') {
        if (raw.text.trim()) return corrupt('An unresolved physical measurement cannot have committed text.');
      } else {
        const result = parseMeasurement(raw.text, { selectedUnit: raw.unit });
        if (raw.text !== committedFieldText(measurement, raw.unit)
            && (!result.ok || result.measurement.valueMm !== measurement.valueMm)) {
          return corrupt('Stored visible text disagrees with its physical measurement.');
        }
      }
    }
    if (!validateQuantityRequest(item.document, item.request).ok) return corrupt('Stored calculation settings reference invalid physical content.');
    const fieldOwners = Object.entries(item.openingFields ?? {}).map(([openingId, fields]) => ({
      opening: item.document.openings.find(value => value.id === openingId), fields,
    }));
    if (item.openingDeleteUndo) fieldOwners.push({ opening: item.openingDeleteUndo.opening, fields: item.openingDeleteUndo.fields });
    for (const { opening, fields } of fieldOwners) {
      if (!opening) return corrupt('Stored opening fields reference an opening that is not present.');
      for (const key of OPENING_FIELDS) {
        const field = fields[key];
        if (field.dirty) continue;
        const expected = openingFieldsFor(opening, field.unit)[key].text;
        const measurement = key === 'offset' ? { state: 'known', valueMm: opening.attachments[0].offsetMm } : opening[key];
        if (measurement.state !== 'known') {
          if (field.text.trim()) return corrupt('An unresolved opening measurement cannot have committed text.');
        } else {
          const parsedField = parseMeasurement(field.text, { selectedUnit: field.unit,
            kind: key === 'sillHeight' || key === 'offset' ? 'elevation' : 'dimension' });
          if (field.text !== expected && (!parsedField.ok || parsedField.measurement.valueMm !== measurement.valueMm)) {
            return corrupt('Stored opening text disagrees with its committed physical value.');
          }
        }
      }
    }
    if (item.openingDeleteUndo && item.document.openings.some(opening => opening.id === item.openingDeleteUndo!.opening.id)) {
      return corrupt('Stored opening deletion recovery conflicts with an existing opening identity.');
    }
    // Event captures are historical evidence. Their transitions are validated
    // above, but their former targets need not remain in the current document.
    const expectedOperation = item.source.kind === 'new' ? 'new-physical-draft-v1'
      : item.source.kind === 'legacy' ? 'legacy-pixels-v2' : 'physical-draft-upgrade-v1';
    if (item.source.operation !== expectedOperation || !Object.hasOwn(item.source, 'original')) return corrupt('Stored draft origin evidence is inconsistent.');
  }
  return { status: 'recovered', registry };
}

export function parseRegistry(raw: string | null): RegistryReadResult {
  if (raw === null) return { status: 'empty' };
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return corrupt('The stored physical draft registry cannot be read as JSON.'); }
  return validateRegistry(value);
}

export function serializeRegistry(registry: PhysicalDraftRegistry): string {
  const result = validateRegistry(registry);
  if (result.status !== 'recovered') throw new PhysicalDraftError('INVALID_DRAFT_CACHE',
    result.status === 'empty' ? 'An empty envelope cannot be cached.' : result.message);
  return JSON.stringify(result.registry);
}
