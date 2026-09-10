import { z } from 'zod';
import { supportedPhysicalDocumentSchema, type PhysicalDocument } from '../domain/document';
import { assertSupportedPhysicalDocument, importLegacyPhysicalDraft } from '../compatibility/physicalDraft';
import { quantityRequestSchema, validateQuantityRequest, type QuantityRequest } from '../quantities/policy';
import { canonicalJson, copyJson } from '../quantities/canonicalJson';
import { sha256Canonical } from '../quantities/fingerprint';
import { createQuantitySnapshot, type QuantitySnapshot } from '../quantities/snapshot';
// These existing modules are pure state/validation code: no React, browser storage,
// or account runtime. Reuse their frozen recovery/evidence rules on both sides.
import { committedFieldText, ROOM_FIELDS, type PhysicalDraft, type InputUnit } from '../../client/src/features/physical-draft/state';
import { openingFieldsFor } from '../../client/src/features/physical-draft/openingCommands';
import { validateRegistry } from '../../client/src/features/physical-draft/storage';
import { parseDraft as parseQuickDraft } from '../../client/src/features/quick-room/storage';

export const MAX_PHYSICAL_SAVE_BYTES = 4 * 1024 * 1024;
export const PHYSICAL_SAVE_VERSION = 'mfp-physical-save-v1' as const;
const MAX_NODES = 150_000, MAX_DEPTH = 80, MAX_ARRAY = 20_000, MAX_STRING = 1_048_576;
// Active openingDeleteUndo is an editor command recovery slot, not a performed
// restoration. Its deleted geometry remains in openingEvents.delete.before;
// completed restore/undo/redo actions remain in these retained evidence streams.
const EVIDENCE_KEYS = ['source', 'events', 'openingEvents', 'reviewState', 'historyEvidence',
  'stairEvents', 'layoutEvents', 'levelUpgradeLineage', 'stairUpgradeLineage', 'layoutUpgradeLineage'] as const;
type EvidenceKey = typeof EVIDENCE_KEYS[number];
export type PhysicalSaveEvidence = Pick<PhysicalDraft, EvidenceKey>;
export interface PhysicalSaveEnvelope {
  version: typeof PHYSICAL_SAVE_VERSION;
  document: PhysicalDocument;
  request: QuantityRequest;
  evidence: PhysicalSaveEvidence;
}
export interface PhysicalSaveEvaluation {
  version: 'mfp-physical-save-evaluation-v1';
  planId: string;
  revisionId: string;
  payloadHash: string;
  snapshot: QuantitySnapshot;
}
export class PhysicalSaveError extends Error {
  constructor(public readonly code: string, message: string) { super(message); this.name = 'PhysicalSaveError'; }
}
const fail = (code: string, message: string): never => { throw new PhysicalSaveError(code, message); };
const clone = <T,>(input: T): T => copyJson(input) as unknown as T;
const id = z.string().min(1).max(256).refine(value => !!value.trim() && !/[\u0000-\u001f\u007f]/.test(value));
const evidenceSchema = z.object({ source: z.unknown(), events: z.array(z.unknown()),
  openingEvents: z.array(z.unknown()).optional(), reviewState: z.unknown().optional(),
  historyEvidence: z.unknown().optional(), stairEvents: z.array(z.unknown()).optional(),
  layoutEvents: z.array(z.unknown()).optional(), levelUpgradeLineage: z.unknown().optional(),
  stairUpgradeLineage: z.unknown().optional(), layoutUpgradeLineage: z.unknown().optional(),
}).strict();
const envelopeSchema = z.object({ version: z.literal(PHYSICAL_SAVE_VERSION),
  document: supportedPhysicalDocumentSchema, request: quantityRequestSchema, evidence: evidenceSchema }).strict();

/** Bounds run before recursive schema validation, copying, or hashing. Nothing is
 * truncated. Historical source strings remain exact or the entire save fails. */
function boundedJson(input: unknown): unknown {
  let nodes = 0;
  const ancestors = new Set<object>();
  const credentials = new Set(['cookie', 'cookies', 'authorization', 'access_token', 'refresh_token', 'id_token',
    'accessToken', 'refreshToken', 'idToken', 'contextToken', 'sessionIdHash', 'sessionSecret', 'clientSecret']);
  function validString(value: string): void {
    if (value.length > MAX_STRING) fail('SAVE_TOO_LARGE', 'A retained source string exceeds the supported size. Nothing was saved.');
    // PostgreSQL JSONB cannot preserve U+0000 or lone UTF-16 surrogates. Reject
    // the whole save explicitly; replacing characters would corrupt source text.
    if (/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(value))
      fail('INVALID_SAVE_JSON', 'Physical save text must contain valid Unicode without NUL characters. Original text is unchanged.');
  }
  function visit(value: unknown, depth: number): void {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) fail('SAVE_TOO_LARGE', 'This physical document exceeds the supported evidence size or depth. Nothing was saved.');
    if (typeof value === 'string') validString(value);
    if (value === null || typeof value !== 'object') return;
    if (ancestors.has(value)) fail('INVALID_SAVE_JSON', 'Physical saves require finite acyclic plain JSON.');
    ancestors.add(value);
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Object.keys(descriptors).filter(key => !(Array.isArray(value) && key === 'length'));
    if ((Array.isArray(value) && value.length > MAX_ARRAY) || keys.length > MAX_ARRAY)
      fail('SAVE_TOO_LARGE', 'A physical document collection exceeds its supported size. Nothing was saved.');
    for (const key of keys) {
      validString(key);
      if (credentials.has(key)) fail('PRIVATE_CONTEXT_IN_SAVE', 'Account credentials and session context cannot be stored in a physical document.');
      const descriptor = descriptors[key];
      if (!('value' in descriptor)) fail('INVALID_SAVE_JSON', 'Physical saves cannot contain executable properties.');
      visit(descriptor.value, depth + 1);
    }
    ancestors.delete(value);
  }
  visit(input, 0);
  let owned: unknown;
  try { owned = copyJson(input); }
  catch { return fail('INVALID_SAVE_JSON', 'Physical saves require finite acyclic plain JSON.'); }
  if (new TextEncoder().encode(canonicalJson(owned)).byteLength > MAX_PHYSICAL_SAVE_BYTES)
    fail('SAVE_TOO_LARGE', 'This complete physical save exceeds the 4 MiB limit. Nothing was saved.');
  return owned;
}

/** Rebuild only disposable editor state; preserve committed source and all action
 * evidence. Raw bundles inside historical evidence are frozen recorded originals,
 * not pending fields in the currently saved document or an active Undo stack. */
function restoreOwned(envelope: PhysicalSaveEnvelope, newLocalDraftId: string, displayUnit: InputUnit): PhysicalDraft {
  const document = clone(envelope.document);
  const fields = Object.fromEntries(document.rooms.map(room => [room.id, Object.fromEntries(ROOM_FIELDS.map(field =>
    [field, { text: committedFieldText(room[field], displayUnit), unit: displayUnit, dirty: false }]))])) as PhysicalDraft['fields'];
  return { id: newLocalDraftId, localEditRevision: 0, document, displayUnit, fields,
    request: clone(envelope.request), ...clone(envelope.evidence),
    openingFields: Object.fromEntries(document.openings.map(opening => [opening.id, openingFieldsFor(opening, displayUnit)])),
    ...(document.schemaVersion === 2 ? {} : { levelView: { version: 'physical-level-view-v1' as const,
      activeLevelId: [...document.buildingLevels.levels].sort((a, b) => a.displayOrder - b.displayOrder)[0].id } }),
  };
}

function validateSource(draft: PhysicalDraft): void {
  const source = draft.source;
  try {
    if (source.kind === 'new') {
      if (source.original !== null) fail('INVALID_SAVE_EVIDENCE', 'A newly created document must not claim an imported original.');
    } else if (source.kind === 'legacy') importLegacyPhysicalDraft(source.original);
    else if (source.kind === 'physical') {
      assertSupportedPhysicalDocument(source.original);
      if (source.original.schemaVersion !== 2) fail('INVALID_SAVE_EVIDENCE', 'Physical adoption evidence must retain its supported original version.');
    } else if (parseQuickDraft(JSON.stringify(source.original)).status !== 'recovered')
      fail('INVALID_SAVE_EVIDENCE', 'Retained Quick Rooms source evidence is invalid.');
  } catch (error) {
    if (error instanceof PhysicalSaveError) throw error;
    fail('INVALID_SAVE_EVIDENCE', 'Retained imported source evidence is invalid or unsupported.');
  }
}

/** Full structural, reference, request and retained-evidence validation. Saving a
 * supported unknown or invalid-fit geometry remains valid work in progress. */
export function parsePhysicalSaveEnvelope(input: unknown): PhysicalSaveEnvelope {
  const owned = boundedJson(input);
  if (!envelopeSchema.safeParse(owned).success) fail('INVALID_SAVE_ENVELOPE', 'Choose a supported complete physical save envelope; malformed content was not saved.');
  const envelope = owned as PhysicalSaveEnvelope;
  try { assertSupportedPhysicalDocument(envelope.document); }
  catch { fail('UNSUPPORTED_SAVE_DOCUMENT', 'This physical content is not supported for safe Save/Open.'); }
  if (envelope.document.id !== null || envelope.document.revisionId !== null)
    fail('CLIENT_SERVER_IDENTITY', 'Server plan and revision identities must not be supplied inside a local document.');
  if (envelope.document.rooms.length > 1000 || envelope.document.openings.length > 5000)
    fail('SAVE_TOO_LARGE', 'This physical document exceeds the supported room or opening count.');
  if (!validateQuantityRequest(envelope.document, envelope.request).ok)
    fail('INVALID_SAVE_REQUEST', 'Selected work or its targets do not belong to this physical document.');
  // A synthetic identity is used only for unchanged recovery validation. It never
  // becomes a server identity, submitted local ID, or persisted registry entry.
  let localId = 'save-envelope-validation';
  const origins = EVIDENCE_KEYS.flatMap(key => key.endsWith('UpgradeLineage') && envelope.evidence[key]
    ? [(envelope.evidence[key] as { sourceDraftId: string }).sourceDraftId] : []);
  while (origins.includes(localId)) localId += '-copy';
  const draft = restoreOwned(envelope, localId, 'ft');
  const registry = validateRegistry({ version: 'mfp-editor-draft-v4', localEditRevision: 0,
    selectedDraftId: localId, drafts: [draft] });
  if (registry.status !== 'recovered') fail('INVALID_SAVE_EVIDENCE', registry.status === 'empty'
    ? 'The retained physical evidence is empty.' : registry.message);
  validateSource(draft);
  return envelope;
}

function pendingFieldNames(draft: PhysicalDraft): string[] {
  const names: string[] = [];
  for (const [roomId, fields] of Object.entries(draft.fields)) for (const [field, raw] of Object.entries(fields))
    if (raw.dirty) names.push(`${roomId}: ${field}`);
  for (const [openingId, fields] of Object.entries(draft.openingFields ?? {})) for (const [field, raw] of Object.entries(fields))
    if (raw.dirty) names.push(`${openingId}: ${field}`);
  for (const [levelId, text] of Object.entries(draft.levelView?.pendingNames ?? {})) {
    const level = draft.document.schemaVersion === 2 ? null : draft.document.buildingLevels.levels.find(item => item.id === levelId);
    if (!level || text !== level.name) names.push(`${levelId}: level name`);
  }
  for (const entry of Object.values(draft.stairFields ?? {})) if (entry.raw.dirty) names.push(`${entry.target.id}: ${entry.target.field}`);
  for (const entry of Object.values(draft.layoutFields ?? {})) if (entry.raw.dirty) names.push(`${entry.target.id}: ${entry.target.field}`);
  for (const entry of Object.values(draft.layoutTexts ?? {})) if (entry.dirty) names.push(`${entry.target.id}: label`);
  for (const [output, raw] of Object.entries(draft.takeoffState?.wasteFields ?? {})) if (raw.dirty) names.push(`${output}: waste`);
  return names;
}

/** Capture synchronously before account refresh/network awaits. This is a
 * persistence projection, never a migration or confirmation action. */
export function capturePhysicalSaveEnvelope(draft: PhysicalDraft): PhysicalSaveEnvelope {
  const pending = pendingFieldNames(draft);
  if (pending.length) fail('PENDING_SAVE_FIELDS', `Apply or Revert the pending fields before saving: ${pending.join('; ')}`);
  const evidence = Object.fromEntries(EVIDENCE_KEYS.filter(key => draft[key] !== undefined).map(key => [key, draft[key]]));
  return parsePhysicalSaveEnvelope({ version: PHYSICAL_SAVE_VERSION, document: draft.document, request: draft.request, evidence });
}

export function restorePhysicalSaveDraft(input: unknown, newLocalDraftId: string, displayUnit: InputUnit = 'ft'): PhysicalDraft {
  if (!id.safeParse(newLocalDraftId).success || !['ft', 'm'].includes(displayUnit)) fail('INVALID_LOCAL_SAVE_IDENTITY', 'A fresh local draft identity and supported display unit are required.');
  const envelope = parsePhysicalSaveEnvelope(input);
  if (['levelUpgradeLineage', 'stairUpgradeLineage', 'layoutUpgradeLineage'].some(key =>
    (envelope.evidence[key as EvidenceKey] as { sourceDraftId?: string } | undefined)?.sourceDraftId === newLocalDraftId))
    fail('INVALID_LOCAL_SAVE_IDENTITY', 'The opened draft must keep a distinct local identity from its historical originals.');
  return restoreOwned(envelope, newLocalDraftId, displayUnit);
}

/** Unlike geometry identity, this includes names, order, source text, appearance,
 * metadata, committed work and retained evidence. Object-key order is irrelevant. */
export async function physicalSavePayloadHash(input: PhysicalSaveEnvelope): Promise<string> {
  return sha256Canonical({ scope: PHYSICAL_SAVE_VERSION, envelope: parsePhysicalSaveEnvelope(input) });
}

/** Called by the authorized server transaction with server-created IDs/time.
 * No browser totals, hashes, capture IDs or claimed output status are accepted. */
export async function evaluatePhysicalSave(input: PhysicalSaveEnvelope,
  binding: { planId: string; revisionId: string; createdAt: string }): Promise<PhysicalSaveEvaluation> {
  const envelope = parsePhysicalSaveEnvelope(input);
  binding = { ...binding };
  if (!id.safeParse(binding.planId).success || !id.safeParse(binding.revisionId).success
      || !z.string().datetime({ offset: true }).safeParse(binding.createdAt).success)
    fail('INVALID_SAVE_BINDING', 'A server plan, revision and timestamp are required for a saved evaluation.');
  const sourceDocument = { ...clone(envelope.document), id: binding.planId, revisionId: binding.revisionId };
  const snapshot = await createQuantitySnapshot(sourceDocument, envelope.request,
    { id: binding.revisionId, createdAt: binding.createdAt, kind: 'evaluation' }, envelope.evidence.events);
  if (!snapshot.ok) return fail('SAVE_EVALUATION_FAILED', snapshot.errors.map(error => error.message).join(' '));
  return { version: 'mfp-physical-save-evaluation-v1', planId: binding.planId, revisionId: binding.revisionId,
    payloadHash: await physicalSavePayloadHash(envelope), snapshot: clone(snapshot.snapshot) as QuantitySnapshot };
}
