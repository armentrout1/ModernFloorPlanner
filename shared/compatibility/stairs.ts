import { copyJson } from '../quantities/canonicalJson';
import { physicalDocumentV4Schema, type PhysicalDocumentV4 } from '../domain/document';
import { STAIRS_CONTRACT_VERSION } from '../domain/stairs';
import { assertSupportedPhysicalDocument, PhysicalDraftImportError } from './physicalDraft';
/** Explicit current schema3 interpretation. Client retains full draft lineage separately. */
export function upgradePhysicalDocumentToStairs(input: unknown): PhysicalDocumentV4 {
  const current: unknown = copyJson(input);
  assertSupportedPhysicalDocument(current);
  if (current.schemaVersion !== 3) throw new PhysicalDraftImportError('PHYSICAL_V3_REQUIRED', 'First use the supported building-level workflow; stair upgrade requires the current schema3 document.');
  const document: PhysicalDocumentV4 = { ...current, schemaVersion: 4, quantityPolicyVersion: 'rectangular-flat-v4',
    stairsContract: { version: STAIRS_CONTRACT_VERSION, stairs: [], surfaceOpenings: [] } };
  physicalDocumentV4Schema.parse(document);
  return document;
}
