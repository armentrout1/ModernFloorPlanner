import { copyJson } from '../quantities/canonicalJson';
import { physicalDocumentV5Schema, type PhysicalDocumentV5 } from '../domain/document';
import { LAYOUT_CONTRACT_VERSION, createUnspecifiedRoomUse } from '../domain/layout';
import { assertSupportedPhysicalDocument, PhysicalDraftImportError } from './physicalDraft';
/** Detached interpretation of CURRENT schema4. Full editor lineage belongs to its caller. */
export function upgradePhysicalDocumentToLayout(input: unknown): PhysicalDocumentV5 {
  const current: unknown = copyJson(input);
  assertSupportedPhysicalDocument(current);
  if (current.schemaVersion !== 4) throw new PhysicalDraftImportError('PHYSICAL_V4_REQUIRED', 'Layout upgrade requires the current supported stair-capable schema4 document.');
  const document: PhysicalDocumentV5 = { ...current, schemaVersion: 5,
    layoutContract: { version: LAYOUT_CONTRACT_VERSION, roomUses: Object.fromEntries(current.rooms.map(room => [room.id, createUnspecifiedRoomUse()])), zones: [], cabinetBlocks: [] } };
  physicalDocumentV5Schema.parse(document);
  return document;
}
