import { copyJson } from '../quantities/canonicalJson';
import { QUANTITY_POLICY_VERSION_V3 } from '../quantities/policy';
import { physicalDocumentV3Schema, type PhysicalDocumentV3 } from '../domain/document';
import { createBuildingLevels } from '../domain/levels';
import { createUnknownRoomApplicability } from '../domain/applicability';
import { assertSupportedPhysicalDocument, PhysicalDraftImportError } from './physicalDraft';

/** Explicit detached upgrade of CURRENT physical values, never compatibility.original.
 * Client lineage retains its full source draft, request and action evidence separately.
 */
export function upgradePhysicalDocumentToLevels(input: unknown, unassignedLevelId: string): PhysicalDocumentV3 {
  const current: unknown = copyJson(input);
  assertSupportedPhysicalDocument(current);
  if (current.schemaVersion !== 2) throw new PhysicalDraftImportError('PHYSICAL_V2_REQUIRED', 'Choose the current version-2 physical document for an explicit level upgrade.');
  if (current.quantityPolicyVersion !== null && !['rectangular-flat-v1', 'rectangular-flat-v2'].includes(current.quantityPolicyVersion))
    throw new PhysicalDraftImportError('UNSUPPORTED_POLICY', 'The source quantity policy is unsupported; keep its original unchanged.');
  const document = { ...current, schemaVersion: 3 as const, quantityPolicyVersion: QUANTITY_POLICY_VERSION_V3,
    calculationContract: current.calculationContract ?? { version: 'room-applicability-v1' as const,
      rooms: Object.fromEntries(current.rooms.map(room => [room.id, createUnknownRoomApplicability('Review the copied room model.', 'imported')])) },
    editorContract: current.editorContract ?? { version: 'sketch-editor-v1' as const, groups: [] },
    buildingLevels: createBuildingLevels(current.rooms.map(room => room.id), unassignedLevelId, 'Unassigned / existing', 'unassigned') };
  const valid = physicalDocumentV3Schema.safeParse(document);
  if (!valid.success) throw new PhysicalDraftImportError('INVALID_LEVEL_UPGRADE', valid.error.issues.map(issue => issue.message).join(' '));
  // Return the detached original values, not Zod-normalized opaque evidence.
  return document as PhysicalDocumentV3;
}
