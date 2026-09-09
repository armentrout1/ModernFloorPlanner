import { z } from 'zod';
import { supportedPhysicalDocumentSchema, type PhysicalDocument } from '../domain/document';
import { elevationSchema, type Dimension } from '../domain/measurements';
import { transitionMeasurement } from '../domain/measurementActions';
import { calculateQuantities } from './engine';
import { calculationSchema } from './result';
import { ownFrozen, type DeepReadonly } from './immutability';
import { canonicalJson, copyJson } from './canonicalJson';
import { sha256Canonical } from './fingerprint';
import type { ContractError } from './policy';
import { levelOwnershipBasis } from '../domain/levels';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const fingerprintsSchema = z.object({
  algorithm: z.literal('SHA-256'), serialization: z.literal('mfp-json-v1'),
  geometryScope: z.enum(['physical-geometry-v1', 'physical-geometry-v2', 'physical-geometry-v3', 'physical-geometry-v4', 'physical-geometry-v5']), contentScope: z.enum(['calculation-content-v1', 'calculation-content-v2', 'calculation-content-v3', 'calculation-content-v4', 'calculation-content-v5']),
  geometry: hash, content: hash,
}).strict();
export const evaluationSchema = z.object({ calculation: calculationSchema, fingerprints: fingerprintsSchema }).strict().superRefine((value, context) => {
  const suffix = value.calculation.policyVersion === 'rectangular-flat-v4' ? (value.fingerprints.geometryScope === 'physical-geometry-v5' ? 'v5' : 'v4')
    : value.calculation.policyVersion === 'rectangular-flat-v3' ? 'v3'
    : value.calculation.policyVersion === 'rectangular-flat-v2' ? 'v2' : 'v1';
  if (value.fingerprints.geometryScope !== 'physical-geometry-' + suffix
      || value.fingerprints.contentScope !== 'calculation-content-' + suffix) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['fingerprints'], message: 'Fingerprint scopes must match calculation semantics' });
  }
});
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
  snapshotSchemaVersion: z.enum(['quantity-snapshot-v1', 'quantity-snapshot-v2', 'quantity-snapshot-v3', 'quantity-snapshot-v4', 'quantity-snapshot-v5']),
  instance: snapshotMetadataSchema,
  sourceDocument: supportedPhysicalDocumentSchema,
  measurementEvents: z.array(measurementEventCaptureSchema),
  evaluation: evaluationSchema,
  captureFingerprint: hash,
}).strict().superRefine((snapshot, context) => {
  const policy = snapshot.evaluation.calculation.policyVersion, document = snapshot.sourceDocument;
  const expectedVersion = document.schemaVersion === 5 ? 'quantity-snapshot-v5' : policy === 'rectangular-flat-v4' ? 'quantity-snapshot-v4'
    : policy === 'rectangular-flat-v3' ? 'quantity-snapshot-v3'
    : policy === 'rectangular-flat-v2' ? 'quantity-snapshot-v2' : 'quantity-snapshot-v1';
  const sourceAgrees = policy === 'rectangular-flat-v4' ? (document.schemaVersion === 4 || document.schemaVersion === 5) && document.quantityPolicyVersion === policy
    : policy === 'rectangular-flat-v3' ? document.schemaVersion === 3 && document.quantityPolicyVersion === policy
    : document.schemaVersion === 2 && (policy === 'rectangular-flat-v2'
      ? document.quantityPolicyVersion === policy && Boolean(document.calculationContract)
      : !document.calculationContract && (document.quantityPolicyVersion === null || document.quantityPolicyVersion === 'rectangular-flat-v1'));
  const expectedScope = expectedVersion.replace('quantity-snapshot-', '');
  if (snapshot.snapshotSchemaVersion !== expectedVersion || !sourceAgrees
      || snapshot.evaluation.fingerprints.geometryScope !== 'physical-geometry-' + expectedScope
      || snapshot.evaluation.fingerprints.contentScope !== 'calculation-content-' + expectedScope) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['snapshotSchemaVersion'], message: 'Snapshot, source contract and calculation versions must agree' });
  }
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

function stairsGeometryBasis(document: Extract<PhysicalDocument, { schemaVersion: 4 | 5 }>) {
  const placement = (value: import('../domain/stairs').StairPlacement) => ({ anchor: value.anchor,
    x: numericMeasurement(value.x), y: numericMeasurement(value.y), rotation: value.rotation });
  const endpoint = (value: import('../domain/stairs').StairEndpoint) => value.state === 'unresolved' ? { state: value.state }
    : { state: value.state, roomId: value.roomId, levelId: value.levelId, placement: placement(value.placement) };
  const landing = (value: import('../domain/stairs').Landing | null) => value ? { id: value.id,
    width: numericMeasurement(value.width), depth: numericMeasurement(value.depth), placement: placement(value.placement) } : null;
  const impact = (value: import('../domain/stairs').SurfaceImpact) => value.state === 'deduct'
    ? { state: value.state, openingIds: [...value.openingIds].sort() } : { state: value.state };
  return { version: document.stairsContract.version,
    stairs: document.stairsContract.stairs.map(stair => ({ id: stair.id, width: numericMeasurement(stair.width),
      run: numericMeasurement(stair.run), totalRise: numericMeasurement(stair.totalRise),
      endpoints: { lower: endpoint(stair.endpoints.lower), upper: endpoint(stair.endpoints.upper) },
      landings: { lower: landing(stair.landings.lower), upper: landing(stair.landings.upper) },
      surfaceImpacts: { lower: { floor: impact(stair.surfaceImpacts.lower.floor), ceiling: impact(stair.surfaceImpacts.lower.ceiling) },
        upper: { floor: impact(stair.surfaceImpacts.upper.floor), ceiling: impact(stair.surfaceImpacts.upper.ceiling) } },
      alignment: { state: stair.alignment.state } })),
    surfaceOpenings: document.stairsContract.surfaceOpenings.map(opening => ({ id: opening.id,
      geometry: opening.geometry, width: numericMeasurement(opening.width), length: numericMeasurement(opening.length),
      associatedStairId: opening.associatedStairId, attachments: opening.attachments.map(attachment => ({
        roomId: attachment.roomId, surface: attachment.surface, placement: placement(attachment.placement) })) })) };
}
function stairsEvidenceBasis(document: Extract<PhysicalDocument, { schemaVersion: 4 | 5 }>) {
  return { version: document.stairsContract.version,
    stairs: document.stairsContract.stairs.map(({ name, ...evidence }) => evidence),
    surfaceOpenings: document.stairsContract.surfaceOpenings.map(({ name, ...evidence }) => evidence) };
}

function layoutGeometryBasis(document: Extract<PhysicalDocument, { schemaVersion: 5 }>) {
  const placement = (value: import('../domain/layout').LayoutPlacement) => ({ anchor: value.anchor,
    x: numericMeasurement(value.x), y: numericMeasurement(value.y), rotation: value.rotation });
  return { version: document.layoutContract.version,
    zones: document.layoutContract.zones.map(zone => ({ id: zone.id, roomId: zone.roomId, quantityEffect: zone.quantityEffect,
      width: numericMeasurement(zone.width), length: numericMeasurement(zone.length), placement: placement(zone.placement) })),
    cabinetBlocks: document.layoutContract.cabinetBlocks.map(cabinet => ({ id: cabinet.id, roomId: cabinet.roomId, zoneId: cabinet.zoneId,
      quantityEffect: cabinet.quantityEffect, length: numericMeasurement(cabinet.length), depth: numericMeasurement(cabinet.depth),
      height: numericMeasurement(cabinet.height), placement: placement(cabinet.placement) })) };
}

/** Whole physical document scope, including unselected geometry, but no names,
 * presentation, viewport, arbitrary metadata, compatibility originals or review history.
 * Candidate order remains meaningful and is never sorted.
 */
function geometryBasis(document: PhysicalDocument) {
  return {
    schemaVersion: document.schemaVersion,
    ...(document.schemaVersion === 5 ? { layout: layoutGeometryBasis(document) } : {}),
    ...((document.schemaVersion === 4 || document.schemaVersion === 5) ? { stairs: stairsGeometryBasis(document) } : {}),
    ...((document.schemaVersion === 3 || document.schemaVersion === 4 || document.schemaVersion === 5) ? { levelOwnership: levelOwnershipBasis(document.buildingLevels) } : {}),
    ...(document.calculationContract ? { applicability: {
      version: document.calculationContract.version,
      rooms: Object.fromEntries(Object.entries(document.calculationContract.rooms).map(([id, profile]) => [id, {
        ceiling: profile.ceiling.value, walls: profile.walls.value, crownPath: profile.crownPath.value,
      }])),
    } } : {}),
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
    ...(document.schemaVersion === 5 ? { layout: document.layoutContract } : {}),
    ...((document.schemaVersion === 4 || document.schemaVersion === 5) ? { stairs: stairsEvidenceBasis(document) } : {}),
    ...((document.schemaVersion === 3 || document.schemaVersion === 4 || document.schemaVersion === 5) ? { levelEvidence: document.buildingLevels.levels
      .map(level => ({ id: level.id, finishedFloorElevation: level.finishedFloorElevation }))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) } : {}),
    ...(document.calculationContract ? { applicability: document.calculationContract } : {}),
    rooms: document.rooms.map(room => ({ id: room.id, length: room.length, width: room.width, ceilingHeight: room.ceilingHeight })),
    openings: document.openings.map(opening => ({ id: opening.id, width: opening.width, height: opening.height, sillHeight: opening.sillHeight })),
  };
}

async function evaluateOwned(document: PhysicalDocument, requested: unknown): Promise<EvaluationOutcome> {
  const result = calculateQuantities(document, requested);
  if (!result.ok) return result;
  const geometry = geometryBasis(document), calculation = result.calculation;
  const v4 = calculation.policyVersion === 'rectangular-flat-v4', v3 = calculation.policyVersion === 'rectangular-flat-v3', v2 = calculation.policyVersion === 'rectangular-flat-v2';
  const geometryScope = document.schemaVersion === 5 ? 'physical-geometry-v5' as const : v4 ? 'physical-geometry-v4' as const : v3 ? 'physical-geometry-v3' as const : v2 ? 'physical-geometry-v2' as const : 'physical-geometry-v1' as const;
  const contentScope = document.schemaVersion === 5 ? 'calculation-content-v5' as const : v4 ? 'calculation-content-v4' as const : v3 ? 'calculation-content-v3' as const : v2 ? 'calculation-content-v2' as const : 'calculation-content-v1' as const;
  const [geometryHash, contentHash] = await Promise.all([
    sha256Canonical({ scope: geometryScope, geometry }),
    sha256Canonical({ scope: contentScope, geometry, evidence: evidenceBasis(document), calculation }),
  ]);
  const evaluation = {
    calculation, fingerprints: { algorithm: 'SHA-256' as const, serialization: 'mfp-json-v1' as const,
      geometryScope, contentScope,
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
  if (!supportedPhysicalDocumentSchema.safeParse(document).success) return failure('INVALID_DOCUMENT', 'Explicit structurally valid supported physical document required; adapt legacy separately');
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
  if (!supportedPhysicalDocumentSchema.safeParse(document).success) return failure('INVALID_DOCUMENT', 'Explicit structurally valid supported physical document required');
  try {
    const result = await evaluateOwned(document as PhysicalDocument, requested);
    if (!result.ok) return result;
    if (instance.data.kind === 'confirmed' && result.evaluation.calculation.status !== 'complete') {
      return failure('CONFIRMED_SNAPSHOT_UNAVAILABLE', 'Every selected output must be complete with required measurements confirmed; empty is not confirmed');
    }
    const capture = {
      snapshotSchemaVersion: (document as PhysicalDocument).schemaVersion === 5 ? 'quantity-snapshot-v5' as const : result.evaluation.calculation.policyVersion === 'rectangular-flat-v4' ? 'quantity-snapshot-v4' as const
        : result.evaluation.calculation.policyVersion === 'rectangular-flat-v3' ? 'quantity-snapshot-v3' as const
        : result.evaluation.calculation.policyVersion === 'rectangular-flat-v2' ? 'quantity-snapshot-v2' as const : 'quantity-snapshot-v1' as const, instance: instance.data,
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
