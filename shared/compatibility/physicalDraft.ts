import { supportedPhysicalDocumentSchema, type PhysicalDocument, type PhysicalDocumentV2 } from '../domain/document';
import { createUnknownRoomApplicability } from '../domain/applicability';
import { toMm } from '../domain/units';
import { copyJson, type JsonValue } from '../quantities/canonicalJson';
import { QUANTITY_POLICY_VERSION_V2 } from '../quantities/policy';
import { adaptMeasurementDocument } from './legacyDocument';

export class PhysicalDraftImportError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'PhysicalDraftImportError'; }
}

export interface PhysicalDraftSource {
  kind: 'new' | 'quick-rooms' | 'legacy' | 'physical';
  operation: 'new-physical-draft-v1' | 'new-physical-level-draft-v1' | 'new-physical-stair-draft-v1' | 'new-physical-layout-draft-v1' | 'legacy-pixels-v2' | 'physical-draft-upgrade-v1';
  original: JsonValue;
  review: string[];
}
export interface ImportedPhysicalDraft { document: PhysicalDocument; source: PhysicalDraftSource }

const documentKeys = new Set(['schemaVersion', 'id', 'name', 'revisionId', 'quantityPolicyVersion',
  'rooms', 'openings', 'review', 'metadata', 'compatibility', 'calculationContract', 'editorContract']);
const roomKeys = new Set(['id', 'name', 'length', 'width', 'ceilingHeight', 'wallFaces', 'presentation', 'metadata']);
const openingKeys = new Set(['id', 'kind', 'width', 'height', 'sillHeight', 'measureBasis', 'attachments', 'appearance', 'metadata']);

/** Unknown physical extensions are preserved by the caller, never opened in a partial editor.
 * Arbitrary metadata is opaque evidence: only a named importer may interpret a known field.
 */
export function assertSupportedPhysicalDocument(input: unknown): asserts input is PhysicalDocument {
  const parsed = supportedPhysicalDocumentSchema.safeParse(input);
  if (!parsed.success) throw new PhysicalDraftImportError('INVALID_DOCUMENT', 'The physical document or its declared model is invalid.');
  const document = input as PhysicalDocument;
  if (Object.keys(document).some(key => !documentKeys.has(key) && !((document.schemaVersion === 3 || document.schemaVersion === 4 || document.schemaVersion === 5) && key === 'buildingLevels') && !((document.schemaVersion === 4 || document.schemaVersion === 5) && key === 'stairsContract') && !(document.schemaVersion === 5 && key === 'layoutContract'))
      || document.rooms.some(room => Object.keys(room).some(key => !roomKeys.has(key)))
      || document.openings.some(opening => Object.keys(opening).some(key => !openingKeys.has(key)))) {
    throw new PhysicalDraftImportError('UNSUPPORTED_CONTENT', 'This document contains physical content this editor cannot safely edit. Keep the original unchanged.');
  }
}

function workingCopy(input: PhysicalDocumentV2): PhysicalDocumentV2 {
  const document = copyJson(input) as unknown as PhysicalDocumentV2;
  const previousPolicy = document.quantityPolicyVersion;
  if (previousPolicy !== null && previousPolicy !== 'rectangular-flat-v1' && previousPolicy !== QUANTITY_POLICY_VERSION_V2) {
    throw new PhysicalDraftImportError('UNSUPPORTED_POLICY', 'This document uses an unsupported quantity policy. Its original is preserved.');
  }
  // A local working copy is not a new saved revision of the source account document.
  document.id = null;
  document.revisionId = null;
  document.quantityPolicyVersion = QUANTITY_POLICY_VERSION_V2;
  if (previousPolicy !== QUANTITY_POLICY_VERSION_V2) {
    document.calculationContract = { version: 'room-applicability-v1', rooms: Object.fromEntries(document.rooms.map(room =>
      [room.id, createUnknownRoomApplicability('Review the ceiling, finished-wall height and crown model for this copied room.', 'imported')])) };
  }
  document.editorContract ??= { version: 'sketch-editor-v1', groups: [] };
  return document;
}

/** Explicit legacy adoption only. The frozen legacy-pixels-v1 implementation is unchanged. */
export function importLegacyPhysicalDraft(input: unknown): ImportedPhysicalDraft {
  const original = copyJson(input);
  if (!original || typeof original !== 'object' || Array.isArray(original)
      || ('schemaVersion' in original && original.schemaVersion !== 1)) {
    throw new PhysicalDraftImportError('LEGACY_REQUIRED', 'Choose a supported legacy sketch; physical documents require an explicit physical upgrade.');
  }
  const result = adaptMeasurementDocument(original);
  if (!('document' in result) || result.status === 'already-v2') {
    throw new PhysicalDraftImportError('INVALID_LEGACY_DOCUMENT', 'The legacy sketch is invalid or unsupported. No source data was changed.');
  }
  assertSupportedPhysicalDocument(result.document);
  const document = workingCopy(result.document);
  const sourceRooms = original.rooms as unknown as Array<{
    id: string; groupId?: string; objects?: Array<{ id: string; type: string; windowProperties?: { height: number } }>;
  }>;
  const groups = new Map<string, string[]>();
  for (const room of sourceRooms) {
    if (room.groupId !== undefined) groups.set(room.groupId, [...(groups.get(room.groupId) ?? []), room.id]);
    for (const object of room.objects ?? []) {
      if (object.type !== 'window' || !object.windowProperties) continue;
      const opening = document.openings.find(item => item.id === object.id)!;
      const height = object.windowProperties.height;
      // Input was validated by the actual legacy wire validator; no UI default is evidence.
      opening.height = { state: 'known', valueMm: toMm(height, 'in'), provenance: {
        source: 'imported', input: null, unit: 'in',
        components: [{ text: String(height), unit: 'in', precision: { kind: 'unavailable' } }],
        confirmation: { status: 'unconfirmed' },
      } };
    }
  }
  document.editorContract = { version: 'sketch-editor-v1', groups: Array.from(groups, ([id, roomIds]) => ({ id, roomIds })) };
  document.compatibility = { ...document.compatibility!, adapterVersion: 'legacy-pixels-v2' };
  assertSupportedPhysicalDocument(document);
  return { document, source: { kind: 'legacy', operation: 'legacy-pixels-v2', original,
    review: ['This is a detached temporary copy; the legacy sketch remains separate.',
      'Ceiling height, sill heights and unreviewed model declarations remain unknown.',
      ...document.review.map(item => item.message)] } };
}

/** Captured v2 measurements/metadata are never re-imported from compatibility.original.
 * The original is retained in full, including its policy, server identity and revision.
 */
export function upgradePhysicalDraft(input: unknown): ImportedPhysicalDraft {
  const original = copyJson(input);
  if (!original || typeof original !== 'object' || Array.isArray(original) || original.schemaVersion !== 2) {
    throw new PhysicalDraftImportError('PHYSICAL_REQUIRED', 'Choose a physical schema-version-2 document to copy.');
  }
  assertSupportedPhysicalDocument(original);
  const document = workingCopy(original as PhysicalDocumentV2);
  assertSupportedPhysicalDocument(document);
  return { document, source: { kind: 'physical', operation: 'physical-draft-upgrade-v1', original,
    review: ['The original physical document and any historical snapshots are unchanged.',
      'Preserved legacy metadata was not reinterpreted; current physical measurements take precedence.',
      ...(original.quantityPolicyVersion !== QUANTITY_POLICY_VERSION_V2
        ? ['Review the copied room model declarations before using ceiling, wall or crown quantities.'] : [])] } };
}
