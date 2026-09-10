import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { physicalPlans, physicalPlanRevisions, physicalSaveReceipts } from '@shared/schema';
import { parsePhysicalSaveEnvelope, physicalSavePayloadHash, evaluatePhysicalSave, PhysicalSaveError,
  type PhysicalSaveEnvelope, type PhysicalSaveEvaluation } from '@shared/persistence/physicalSave';
import { physicalRevisionEtag, type PhysicalPlanList, type PhysicalPlanRevision } from '@shared/persistence/physicalPlan';
import { AuthorizationError, type VerifiedIdentity } from './authorizationTypes';
import { getDatabase, type Database } from './db';
import { withWorkspaceAuthorization, type WorkspaceTransaction } from './workspaceAuthorization';
export type { PhysicalPlanRevision, PhysicalPlanSummary, PhysicalPlanList } from '@shared/persistence/physicalPlan';

export class PhysicalPlanStorageError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'INVALID_DOCUMENT' | 'IDEMPOTENCY_CONFLICT' | 'REVISION_CONFLICT' | 'PRECONDITION_REQUIRED',
    readonly status: 400 | 409 | 412 | 422 | 428, message: string) { super(message); this.name = 'PhysicalPlanStorageError'; }
}
const uuid = z.string().uuid();
const canonicalUuid = (value: string): string => typeof value === 'string' ? value.toLowerCase() : value;
const expectedRevision = /^"mfp-physical-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"$/;
const missing = (): never => { throw new AuthorizationError(404); };
const invalid = (): never => { throw new PhysicalPlanStorageError('INVALID_REQUEST', 400, 'Invalid physical plan request'); };
type RevisionRow = typeof physicalPlanRevisions.$inferSelect;
const dto = (row: RevisionRow): PhysicalPlanRevision => ({ planId: row.planId, workspaceId: row.workspaceId,
  revisionId: row.id, revisionNumber: row.revisionNumber, name: row.name,
  createdAt: new Date(row.createdAt).toISOString(), createdBy: row.createdBy,
  envelope: row.envelope as PhysicalSaveEnvelope, evaluation: row.evaluation as PhysicalSaveEvaluation,
  payloadHash: row.payloadHash, etag: physicalRevisionEtag(row.id) });
function parseEnvelope(input: unknown) {
  try { return parsePhysicalSaveEnvelope(input); }
  catch (error) { if (error instanceof PhysicalSaveError) throw new PhysicalPlanStorageError('INVALID_DOCUMENT', 422, error.message); throw error; }
}
async function readRevision(tx: WorkspaceTransaction, workspaceId: string, planId: string, revisionId: string): Promise<PhysicalPlanRevision> {
  const [row] = await tx.select().from(physicalPlanRevisions).where(and(eq(physicalPlanRevisions.workspaceId, workspaceId),
    eq(physicalPlanRevisions.planId, planId), eq(physicalPlanRevisions.id, revisionId)));
  return row ? dto(row) : missing();
}
/** The advisory hash only serializes matching keys (collisions serialize too).
 * Actual receipt identity always compares every full scope field. Authorization
 * locks are acquired first and retained until the save or replay commits. */
async function receipt(tx: WorkspaceTransaction, scope: { principalId: string; workspaceId: string; operation: 'create' | 'append'; resource: string; idempotencyKey: string }, requestHash: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(scope)}, 74381))`);
  const [existing] = await tx.select().from(physicalSaveReceipts).where(and(
    eq(physicalSaveReceipts.principalId, scope.principalId), eq(physicalSaveReceipts.workspaceId, scope.workspaceId),
    eq(physicalSaveReceipts.operation, scope.operation), eq(physicalSaveReceipts.resource, scope.resource), eq(physicalSaveReceipts.idempotencyKey, scope.idempotencyKey)));
  if (!existing) return null;
  if (existing.requestHash !== requestHash) throw new PhysicalPlanStorageError('IDEMPOTENCY_CONFLICT', 409, 'This save key was already used for different content or a different base revision');
  return readRevision(tx, scope.workspaceId, existing.planId, existing.revisionId);
}
const requestHash = (payloadHash: string, ifMatch: string | null) => createHash('sha256').update(JSON.stringify([payloadHash, ifMatch])).digest('hex');
async function appendStoredRevision(tx: WorkspaceTransaction, workspaceId: string, principalId: string, planId: string,
  revisionId: string, revisionNumber: number, envelope: PhysicalSaveEnvelope, payloadHash: string) {
  const rows = await tx.execute(sql`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as created_at`);
  const createdAt = String(rows[0].created_at);
  // This is the shared engine's server evaluation, never a submitted browser total.
  let evaluation: PhysicalSaveEvaluation;
  try { evaluation = await evaluatePhysicalSave(envelope, { planId, revisionId, createdAt }); }
  catch (error) { if (error instanceof PhysicalSaveError) throw new PhysicalPlanStorageError('INVALID_DOCUMENT', 422, error.message); throw error; }
  if (evaluation.payloadHash !== payloadHash) throw new Error('Physical save payload identity changed during evaluation');
  const [row] = await tx.insert(physicalPlanRevisions).values({ id: revisionId, workspaceId, planId, revisionNumber,
    name: envelope.document.name ?? 'Untitled plan', envelope, evaluation, payloadHash, createdBy: principalId, createdAt }).returning();
  return dto(row);
}
export class PhysicalPlanStorage {
  constructor(private readonly database: () => Database = getDatabase) {}
  list(identity: VerifiedIdentity, workspaceId: string, input: { limit?: number; cursor?: string } = {}): Promise<PhysicalPlanList> {
    workspaceId = canonicalUuid(workspaceId);
    return withWorkspaceAuthorization(this.database, identity, workspaceId, 'read', async tx => {
      const parsed = z.object({ limit: z.number().int().min(1).max(50).default(20), cursor: uuid.optional() }).strict().safeParse(input);
      if (!parsed.success) return invalid();
      const { limit, cursor } = parsed.data;
      const rows = await tx.select({ planId: physicalPlans.id, name: physicalPlanRevisions.name,
        currentRevisionId: physicalPlans.currentRevisionId, revisionNumber: physicalPlanRevisions.revisionNumber,
        createdAt: physicalPlans.createdAt, updatedAt: physicalPlans.updatedAt }).from(physicalPlans)
        .innerJoin(physicalPlanRevisions, and(eq(physicalPlanRevisions.workspaceId, physicalPlans.workspaceId),
          eq(physicalPlanRevisions.planId, physicalPlans.id), eq(physicalPlanRevisions.id, physicalPlans.currentRevisionId)))
        .where(and(eq(physicalPlans.workspaceId, workspaceId), cursor ? gt(physicalPlans.id, cursor) : undefined))
        .orderBy(physicalPlans.id).limit(limit + 1);
      const plans = rows.slice(0, limit).map(row => ({ ...row, createdAt: new Date(row.createdAt).toISOString(), updatedAt: new Date(row.updatedAt).toISOString() }));
      return { plans, nextCursor: rows.length > limit ? plans[plans.length - 1].planId : null };
    });
  }
  read(identity: VerifiedIdentity, workspaceId: string, planId: string): Promise<PhysicalPlanRevision> {
    if (!uuid.safeParse(planId).success) return Promise.reject(new AuthorizationError(404));
    planId = canonicalUuid(planId);
    workspaceId = canonicalUuid(workspaceId);
    return withWorkspaceAuthorization(this.database, identity, workspaceId, 'read', async tx => {
      const [plan] = await tx.select().from(physicalPlans).where(and(eq(physicalPlans.workspaceId, workspaceId), eq(physicalPlans.id, planId)));
      return plan ? readRevision(tx, workspaceId, planId, plan.currentRevisionId) : missing();
    });
  }
  readRevision(identity: VerifiedIdentity, workspaceId: string, planId: string, revisionId: string): Promise<PhysicalPlanRevision> {
    if (!uuid.safeParse(planId).success || !uuid.safeParse(revisionId).success) return Promise.reject(new AuthorizationError(404));
    planId = canonicalUuid(planId); revisionId = canonicalUuid(revisionId);
    workspaceId = canonicalUuid(workspaceId);
    return withWorkspaceAuthorization(this.database, identity, workspaceId, 'read', tx => readRevision(tx, workspaceId, planId, revisionId));
  }
  create(identity: VerifiedIdentity, workspaceId: string, input: unknown, idempotencyKey: string): Promise<PhysicalPlanRevision> {
    workspaceId = canonicalUuid(workspaceId);
    return withWorkspaceAuthorization(this.database, identity, workspaceId, 'write', async (tx, principalId) => {
      if (!uuid.safeParse(idempotencyKey).success) return invalid();
      idempotencyKey = canonicalUuid(idempotencyKey);
      const envelope = parseEnvelope(input), payloadHash = await physicalSavePayloadHash(envelope);
      const scope = { principalId, workspaceId, operation: 'create' as const, resource: 'collection', idempotencyKey };
      const hash = requestHash(payloadHash, null), previous = await receipt(tx, scope, hash);
      if (previous) return previous;
      const planId = randomUUID(), revisionId = randomUUID();
      await tx.insert(physicalPlans).values({ id: planId, workspaceId, currentRevisionId: revisionId, createdBy: principalId });
      const saved = await appendStoredRevision(tx, workspaceId, principalId, planId, revisionId, 1, envelope, payloadHash);
      await tx.insert(physicalSaveReceipts).values({ ...scope, requestHash: hash, planId, revisionId });
      return saved;
    });
  }
  append(identity: VerifiedIdentity, workspaceId: string, planId: string, input: unknown,
    options: { idempotencyKey: string; ifMatch: string | undefined }): Promise<PhysicalPlanRevision> {
    if (!uuid.safeParse(planId).success) return Promise.reject(new AuthorizationError(404));
    planId = canonicalUuid(planId);
    workspaceId = canonicalUuid(workspaceId);
    return withWorkspaceAuthorization(this.database, identity, workspaceId, 'write', async (tx, principalId) => {
      if (!options || !uuid.safeParse(options.idempotencyKey).success) return invalid();
      if (options.ifMatch === undefined) throw new PhysicalPlanStorageError('PRECONDITION_REQUIRED', 428, 'An exact If-Match revision is required');
      if (typeof options.ifMatch !== 'string' || !expectedRevision.test(options.ifMatch)) return invalid();
      const envelope = parseEnvelope(input), payloadHash = await physicalSavePayloadHash(envelope);
      const scope = { principalId, workspaceId, operation: 'append' as const, resource: planId, idempotencyKey: canonicalUuid(options.idempotencyKey) };
      const hash = requestHash(payloadHash, options.ifMatch), previous = await receipt(tx, scope, hash);
      if (previous) return previous;
      const [plan] = await tx.select().from(physicalPlans).where(and(eq(physicalPlans.workspaceId, workspaceId), eq(physicalPlans.id, planId))).for('update');
      if (!plan) return missing();
      if (physicalRevisionEtag(plan.currentRevisionId) !== options.ifMatch) throw new PhysicalPlanStorageError('REVISION_CONFLICT', 412, 'A newer server revision exists. Your local draft has not been overwritten.');
      const current = await readRevision(tx, workspaceId, planId, plan.currentRevisionId);
      if (current.revisionNumber >= 2147483647) return invalid();
      const revisionId = randomUUID(), saved = await appendStoredRevision(tx, workspaceId, principalId, planId, revisionId, current.revisionNumber + 1, envelope, payloadHash);
      await tx.update(physicalPlans).set({ currentRevisionId: revisionId, updatedAt: sql`clock_timestamp()` }).where(eq(physicalPlans.id, planId));
      await tx.insert(physicalSaveReceipts).values({ ...scope, requestHash: hash, planId, revisionId });
      return saved;
    });
  }
}
export const physicalPlanStorage = new PhysicalPlanStorage();
