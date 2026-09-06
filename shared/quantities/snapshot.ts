import { z } from 'zod';
import { physicalDocumentSchema, type PhysicalDocument } from '../domain/document';
import { elevationSchema, type Dimension } from '../domain/measurements';
import { transitionMeasurement } from '../domain/measurementActions';
import { calculateQuantities } from './engine';
import { calculationSchema } from './result';
import { ownFrozen, type DeepReadonly } from './immutability';
import { canonicalJson, copyJson } from './canonicalJson';
import { sha256Canonical } from './fingerprint';
import type { ContractError } from './policy';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const fingerprintsSchema = z.object({
  algorithm: z.literal('SHA-256'), serialization: z.literal('mfp-json-v1'),
  geometryScope: z.literal('physical-geometry-v1'), contentScope: z.literal('calculation-content-v1'),
  geometry: hash, content: hash,
}).strict();
export const evaluationSchema = z.object({ calculation: calculationSchema, fingerprints: fingerprintsSchema }).strict();
export type Evaluation = z.infer<typeof evaluationSchema>;
const target = z.discriminatedUnion('entity', [
  z.object({ entity: z.literal('room'), id: z.string().min(1), field: z.enum(['length', 'width', 'ceilingHeight']) }).strict(),
  z.object({ entity: z.literal('opening'), id: z.string().min(1), field: z.enum(['width', 'height', 'sillHeight']) }).strict(),
]);
const eventFields = {
  at: z.string().datetime({ offset: true }), before: elevationSchema,
  after: elevationSchema.refine(value => value.state === 'known', 'Event after must be known'),
};
export const measurementEventCaptureSchema = z.object({
  target,
  event: z.discriminatedUnion('action', [
    z.object({ ...eventFields, action: z.literal('confirm') }).strict(),
    z.object({ ...eventFields, action: z.literal('correct') }).strict(),
    z.object({ ...eventFields, action: z.literal('resolve-candidate'), candidateIndex: z.number().int().nonnegative() }).strict(),
  ]),
}).strict().superRefine((capture, context) => {
  const { event, target } = capture;
  const action = event.action === 'confirm' ? { type: 'confirm', at: event.at }
    : event.action === 'correct' ? { type: 'correct', at: event.at, replacement: event.after }
      : { type: 'resolve-candidate', at: event.at, candidateIndex: event.candidateIndex };
  const replayed = transitionMeasurement(event.before, action,
    target.entity === 'opening' && target.field === 'sillHeight' ? 'elevation' : 'dimension');
  if (!replayed.ok || canonicalJson(replayed.measurement) !== canonicalJson(event.after)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['event'],
      message: 'Captured event must describe a valid target-specific explicit measurement transition' });
  }
});
export const snapshotMetadataSchema = z.object({
  id: z.string().refine(value => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value)),
  createdAt: z.string().datetime({ offset: true }), kind: z.enum(['evaluation', 'confirmed']),
}).strict();
export const quantitySnapshotSchema = z.object({
  snapshotSchemaVersion: z.literal('quantity-snapshot-v1'),
  instance: snapshotMetadataSchema,
  sourceDocument: physicalDocumentSchema,
  measurementEvents: z.array(measurementEventCaptureSchema),
  evaluation: evaluationSchema,
  captureFingerprint: hash,
}).strict().superRefine((snapshot, context) => {
  if (snapshot.instance.kind === 'confirmed' && snapshot.evaluation.calculation.status !== 'complete') {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['instance', 'kind'], message: 'Confirmed snapshot requires nonempty complete selected outputs' });
  }
});
export type QuantitySnapshot = z.infer<typeof quantitySnapshotSchema>;
type Failure = { ok: false; errors: ContractError[] };
export type EvaluationOutcome = { ok: true; evaluation: DeepReadonly<Evaluation> } | Failure;
export type SnapshotOutcome = { ok: true; snapshot: DeepReadonly<QuantitySnapshot> } | Failure;
const failure = (code: string, message: string): Failure => ({ ok: false, errors: [{ code, path: [], message }] });

const numericMeasurement = (measurement: Dimension) => measurement.state === 'known'
  ? { state: measurement.state, valueMm: measurement.valueMm }
  : measurement.state === 'unknown' ? { state: measurement.state, valueMm: null }
    : { state: measurement.state, valueMm: null, candidates: measurement.candidates.map(candidate => candidate.valueMm) };

/** Whole physical document scope, including unselected geometry, but no names,
 * presentation, viewport, arbitrary metadata, compatibility originals or review history.
 * Candidate order remains meaningful and is never sorted.
 */
function geometryBasis(document: PhysicalDocument) {
  return {
    schemaVersion: document.schemaVersion,
    rooms: document.rooms.map(room => ({
      id: room.id, length: numericMeasurement(room.length), width: numericMeasurement(room.width),
      ceilingHeight: numericMeasurement(room.ceilingHeight), wallFaces: room.wallFaces,
    })),
    openings: document.openings.map(opening => ({
      id: opening.id, kind: opening.kind, width: numericMeasurement(opening.width),
      height: numericMeasurement(opening.height), sillHeight: numericMeasurement(opening.sillHeight),
      measureBasis: opening.measureBasis, attachments: opening.attachments,
    })),
  };
}
function evidenceBasis(document: PhysicalDocument) {
  return {
    rooms: document.rooms.map(room => ({ id: room.id, length: room.length, width: room.width, ceilingHeight: room.ceilingHeight })),
    openings: document.openings.map(opening => ({ id: opening.id, width: opening.width, height: opening.height, sillHeight: opening.sillHeight })),
  };
}

async function evaluateOwned(document: PhysicalDocument, requested: unknown): Promise<EvaluationOutcome> {
  const result = calculateQuantities(document, requested);
  if (!result.ok) return result;
  const geometry = geometryBasis(document), calculation = result.calculation;
  const [geometryHash, contentHash] = await Promise.all([
    sha256Canonical({ scope: 'physical-geometry-v1', geometry }),
    sha256Canonical({ scope: 'calculation-content-v1', geometry, evidence: evidenceBasis(document), calculation }),
  ]);
  const evaluation = {
    calculation, fingerprints: { algorithm: 'SHA-256' as const, serialization: 'mfp-json-v1' as const,
      geometryScope: 'physical-geometry-v1' as const, contentScope: 'calculation-content-v1' as const,
      geometry: geometryHash, content: contentHash },
  };
  const parsed = evaluationSchema.safeParse(evaluation);
  if (!parsed.success) return failure('INVALID_ENGINE_RESULT', 'Calculated result failed its versioned schema');
  return { ok: true, evaluation: ownFrozen(evaluation) };
}

/** Captures input synchronously before the first await. Never trusts caller totals. */
export async function evaluateQuantities(documentInput: unknown, requestInput: unknown): Promise<EvaluationOutcome> {
  let document: unknown, requested: unknown;
  try { document = copyJson(documentInput); requested = copyJson(requestInput); }
  catch { return failure('INVALID_JSON_INPUT', 'Expected finite acyclic plain JSON inputs'); }
  if (!physicalDocumentSchema.safeParse(document).success) return failure('INVALID_DOCUMENT', 'Explicit structurally valid v2 document required; adapt legacy separately');
  try { return await evaluateOwned(document as PhysicalDocument, requested); }
  catch { return failure('FINGERPRINT_FAILED', 'Platform SHA-256 or deterministic serialization failed'); }
}

/** Snapshot instance metadata is supplied by the caller and is not calculation content.
 * Returned evidence is captured, not persisted or authenticated. Prior action evidence
 * is bound by captureFingerprint along with the full preserved source and instance.
 */
export async function createQuantitySnapshot(documentInput: unknown, requestInput: unknown,
  metadataInput: unknown, measurementEventsInput: unknown = []): Promise<SnapshotOutcome> {
  let document: unknown, requested: unknown, metadata: unknown, events: unknown;
  try {
    document = copyJson(documentInput); requested = copyJson(requestInput);
    metadata = copyJson(metadataInput); events = copyJson(measurementEventsInput);
  } catch { return failure('INVALID_JSON_INPUT', 'Expected finite acyclic plain JSON snapshot inputs'); }
  const instance = snapshotMetadataSchema.safeParse(metadata);
  if (!instance.success || !z.array(measurementEventCaptureSchema).safeParse(events).success) {
    return failure('INVALID_SNAPSHOT_METADATA', 'Explicit snapshot ID, timestamp, kind and valid measurement-event captures required');
  }
  if (!physicalDocumentSchema.safeParse(document).success) return failure('INVALID_DOCUMENT', 'Explicit structurally valid v2 document required');
  try {
    const result = await evaluateOwned(document as PhysicalDocument, requested);
    if (!result.ok) return result;
    if (instance.data.kind === 'confirmed' && result.evaluation.calculation.status !== 'complete') {
      return failure('CONFIRMED_SNAPSHOT_UNAVAILABLE', 'Every selected output must be complete with required measurements confirmed; empty is not confirmed');
    }
    const capture = {
      snapshotSchemaVersion: 'quantity-snapshot-v1' as const, instance: instance.data,
      sourceDocument: document as PhysicalDocument,
      measurementEvents: events as z.infer<typeof measurementEventCaptureSchema>[],
      evaluation: result.evaluation,
    };
    // Never include the fingerprint being calculated in its own payload.
    const snapshot = { ...capture, captureFingerprint: await sha256Canonical(capture) };
    if (!quantitySnapshotSchema.safeParse(snapshot).success) return failure('INVALID_SNAPSHOT', 'Snapshot failed its versioned schema');
    // Keep owned original JSON, not Zod's normalized copy of arbitrary metadata.
    return { ok: true, snapshot: ownFrozen(snapshot) };
  } catch { return failure('FINGERPRINT_FAILED', 'Platform SHA-256 or deterministic serialization failed'); }
}

/** Schema validation alone does not prove calculation integrity. This optional
 * consumer check recalculates from the captured source rather than trusting totals.
 * Integrity is not authentication, ownership, issuance or persistence.
 */
export async function verifyQuantitySnapshot(input: unknown): Promise<{ ok: true } | Failure> {
  let captured: unknown;
  try { captured = copyJson(input); } catch { return failure('INVALID_SNAPSHOT', 'Expected serializable snapshot'); }
  const schema = quantitySnapshotSchema.safeParse(captured);
  if (!schema.success) return failure('INVALID_SNAPSHOT', 'Snapshot schema/version is invalid');
  const snapshot = captured as QuantitySnapshot;
  const rebuilt = await createQuantitySnapshot(snapshot.sourceDocument, snapshot.evaluation.calculation.request,
    snapshot.instance, snapshot.measurementEvents);
  if (!rebuilt.ok) return rebuilt;
  return canonicalJson(rebuilt.snapshot) === canonicalJson(snapshot)
    ? { ok: true } : failure('SNAPSHOT_INTEGRITY_MISMATCH', 'Captured source, calculation or fingerprints disagree');
}
