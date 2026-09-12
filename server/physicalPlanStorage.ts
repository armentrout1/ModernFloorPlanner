import { createHash, randomUUID } from 'node:crypto';
import { and, eq, gt, isNull, isNotNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { physicalPlans, physicalPlanRevisions, physicalSaveReceipts, physicalLifecycleReceipts } from '@shared/schema';
import { parsePhysicalSaveEnvelope, physicalSavePayloadHash, evaluatePhysicalSave, PhysicalSaveError,
  type PhysicalSaveEnvelope, type PhysicalSaveEvaluation } from '@shared/persistence/physicalSave';
import { physicalRevisionEtag, physicalLifecycleEtag, type PhysicalPlanList, type PhysicalPlanRevision, type PhysicalPlanSummary, type PhysicalPlanOperation, type PhysicalPlanLifecycleResult } from '@shared/persistence/physicalPlan';
import { AuthorizationError, type VerifiedIdentity } from './authorizationTypes';
import { getDatabase, type Database } from './db';
import { withWorkspaceAuthorization, type WorkspaceTransaction } from './workspaceAuthorization';
export type { PhysicalPlanRevision, PhysicalPlanSummary, PhysicalPlanList } from '@shared/persistence/physicalPlan';

export class PhysicalPlanStorageError extends Error {
  constructor(readonly code: 'INVALID_REQUEST' | 'INVALID_DOCUMENT' | 'IDEMPOTENCY_CONFLICT' | 'REVISION_CONFLICT' | 'PRECONDITION_REQUIRED' | 'PLAN_ARCHIVED' | 'LIFECYCLE_CONFLICT' | 'PROJECT_STATE_CONFLICT',
    readonly status: 400 | 409 | 412 | 422 | 428, message: string) { super(message); this.name = 'PhysicalPlanStorageError'; }
}
const uuid = z.string().uuid();
const canonicalUuid = (value: string): string => typeof value === 'string' ? value.toLowerCase() : value;
const expectedRevision = /^"mfp-physical-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"$/;
const expectedLifecycle = /^"mfp-physical-lifecycle-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-(0|[1-9][0-9]{0,9})"$/;
const missing = (): never => { throw new AuthorizationError(404); };
const invalid = (): never => { throw new PhysicalPlanStorageError('INVALID_REQUEST', 400, 'Invalid physical plan request'); };
type RevisionRow = typeof physicalPlanRevisions.$inferSelect;
type PlanRow = typeof physicalPlans.$inferSelect;
const iso = (value: string | null) => value === null ? null : new Date(value).toISOString();
const copyOrigin = (row: Pick<PlanRow, 'copiedFromPlanId' | 'copiedFromRevisionId'>) => row.copiedFromPlanId && row.copiedFromRevisionId
  ? { planId: row.copiedFromPlanId, revisionId: row.copiedFromRevisionId } : null;
const dto = (row: RevisionRow, plan?: PlanRow): PhysicalPlanRevision => ({ planId: row.planId, workspaceId: row.workspaceId,
  revisionId: row.id, revisionNumber: row.revisionNumber, name: row.name,
  createdAt: new Date(row.createdAt).toISOString(), createdBy: row.createdBy,
  envelope: row.envelope as PhysicalSaveEnvelope, evaluation: row.evaluation as PhysicalSaveEvaluation,
  payloadHash: row.payloadHash, etag: physicalRevisionEtag(row.id), archivedAt: iso(plan?.archivedAt ?? null),
  ...(row.revisionNumber === 1 && plan && copyOrigin(plan) ? { copiedFrom: copyOrigin(plan)! } : {}) });
const summaryColumns = { planId: physicalPlans.id, name: physicalPlanRevisions.name,
  currentRevisionId: physicalPlans.currentRevisionId, revisionNumber: physicalPlanRevisions.revisionNumber,
  createdAt: physicalPlans.createdAt, updatedAt: physicalPlans.updatedAt, archivedAt: physicalPlans.archivedAt,
  lifecycleVersion: physicalPlans.lifecycleVersion, copiedFromPlanId: physicalPlans.copiedFromPlanId, copiedFromRevisionId: physicalPlans.copiedFromRevisionId };
type SummaryRow = Pick<PhysicalPlanSummary, 'planId' | 'name' | 'currentRevisionId' | 'revisionNumber' | 'createdAt' | 'updatedAt' | 'archivedAt' | 'lifecycleVersion'>
  & Pick<PlanRow, 'copiedFromPlanId' | 'copiedFromRevisionId'>;
const summaryDto = (row: SummaryRow): PhysicalPlanSummary => ({ planId: row.planId, name: row.name,
  currentRevisionId: row.currentRevisionId, revisionNumber: row.revisionNumber, createdAt: iso(row.createdAt)!, updatedAt: iso(row.updatedAt)!,
  archivedAt: iso(row.archivedAt), lifecycleVersion: row.lifecycleVersion,
  lifecycleEtag: physicalLifecycleEtag(row.currentRevisionId, row.lifecycleVersion), copiedFrom: copyOrigin(row) });
async function readSummary(tx: WorkspaceTransaction, workspaceId: string, planId: string): Promise<PhysicalPlanSummary> {
  const [row] = await tx.select(summaryColumns).from(physicalPlans).innerJoin(physicalPlanRevisions,
    and(eq(physicalPlanRevisions.workspaceId, physicalPlans.workspaceId), eq(physicalPlanRevisions.planId, physicalPlans.id), eq(physicalPlanRevisions.id, physicalPlans.currentRevisionId)))
    .where(and(eq(physicalPlans.workspaceId, workspaceId), eq(physicalPlans.id, planId)));
  return row ? summaryDto(row) : missing();
}
function parseEnvelope(input: unknown) {
  try { return parsePhysicalSaveEnvelope(input); }
  catch (error) { if (error instanceof PhysicalSaveError) throw new PhysicalPlanStorageError('INVALID_DOCUMENT', 422, error.message); throw error; }
}
async function readRevision(tx: WorkspaceTransaction, workspaceId: string, planId: string, revisionId: string): Promise<PhysicalPlanRevision> {
  const [row] = await tx.select({ revision: physicalPlanRevisions, plan: physicalPlans }).from(physicalPlanRevisions)
    .innerJoin(physicalPlans, and(eq(physicalPlans.workspaceId, physicalPlanRevisions.workspaceId), eq(physicalPlans.id, physicalPlanRevisions.planId)))
    .where(and(eq(physicalPlanRevisions.workspaceId, workspaceId), eq(physicalPlanRevisions.planId, planId), eq(physicalPlanRevisions.id, revisionId)));
  return row ? dto(row.revision, row.plan) : missing();
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
  list(identity: VerifiedIdentity, workspaceId: string, input: { limit?: number; cursor?: string; status?: 'active' | 'archived' } = {}): Promise<PhysicalPlanList> {
    workspaceId = canonicalUuid(workspaceId);
    return withWorkspaceAuthorization(this.database, identity, workspaceId, 'read', async tx => {
      const parsed = z.object({ limit: z.number().int().min(1).max(50).default(20), cursor: uuid.optional(), status: z.enum(['active', 'archived']).default('active') }).strict().safeParse(input);
      if (!parsed.success) return invalid();
      const { limit, cursor, status } = parsed.data;
      const rows = await tx.select(summaryColumns).from(physicalPlans)
        .innerJoin(physicalPlanRevisions, and(eq(physicalPlanRevisions.workspaceId, physicalPlans.workspaceId),
          eq(physicalPlanRevisions.planId, physicalPlans.id), eq(physicalPlanRevisions.id, physicalPlans.currentRevisionId)))
        .where(and(eq(physicalPlans.workspaceId, workspaceId), status === 'active' ? isNull(physicalPlans.archivedAt) : isNotNull(physicalPlans.archivedAt), cursor ? gt(physicalPlans.id, cursor) : undefined))
        .orderBy(physicalPlans.id).limit(limit + 1);
      const plans = rows.slice(0, limit).map(summaryDto);
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
      // Accepted receipts above still resolve after archive. Only a genuinely new
      // write is rejected; lost acknowledgements must remain recoverable.
      if (plan.archivedAt !== null) throw new PhysicalPlanStorageError('PLAN_ARCHIVED', 409, 'This project is archived. Your local work is preserved; restore it or save a separate new plan.');
      if (physicalRevisionEtag(plan.currentRevisionId) !== options.ifMatch) throw new PhysicalPlanStorageError('REVISION_CONFLICT', 412, 'A newer server revision exists. Your local draft has not been overwritten.');
      const current = await readRevision(tx, workspaceId, planId, plan.currentRevisionId);
      if (current.revisionNumber >= 2147483647) return invalid();
      const revisionId = randomUUID(), saved = await appendStoredRevision(tx, workspaceId, principalId, planId, revisionId, current.revisionNumber + 1, envelope, payloadHash);
      await tx.update(physicalPlans).set({ currentRevisionId: revisionId, updatedAt: sql`clock_timestamp()` }).where(eq(physicalPlans.id, planId));
      await tx.insert(physicalSaveReceipts).values({ ...scope, requestHash: hash, planId, revisionId });
      return saved;
    });
  }
  lifecycle(identity: VerifiedIdentity, workspaceId: string, planId: string, operation: PhysicalPlanOperation, input: unknown,
    options: { idempotencyKey: string; ifMatch: string | undefined }): Promise<PhysicalPlanLifecycleResult> {
    if (!uuid.safeParse(planId).success) return Promise.reject(new AuthorizationError(404));
    workspaceId = canonicalUuid(workspaceId); planId = canonicalUuid(planId);
    return withWorkspaceAuthorization(this.database, identity, workspaceId, 'write', async (tx, principalId) => {
      const parsed = z.object({ revisionId: uuid }).strict().safeParse(input);
      if (!parsed.success || !['duplicate', 'archive', 'restore'].includes(operation) || !options || !uuid.safeParse(options.idempotencyKey).success) return invalid();
      if (options.ifMatch === undefined) throw new PhysicalPlanStorageError('PRECONDITION_REQUIRED', 428, 'The exact project lifecycle precondition is required.');
      if (typeof options.ifMatch !== 'string' || !expectedLifecycle.test(options.ifMatch)) return invalid();
      const sourceRevisionId = canonicalUuid(parsed.data.revisionId), idempotencyKey = canonicalUuid(options.idempotencyKey);
      const scope = { principalId, workspaceId, operation, resourcePlanId: planId, idempotencyKey };
      const hash = createHash('sha256').update(JSON.stringify([sourceRevisionId, options.ifMatch])).digest('hex');
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(scope)}, 74382))`);
      const [previous] = await tx.select().from(physicalLifecycleReceipts).where(and(
        eq(physicalLifecycleReceipts.principalId, principalId), eq(physicalLifecycleReceipts.workspaceId, workspaceId),
        eq(physicalLifecycleReceipts.operation, operation), eq(physicalLifecycleReceipts.resourcePlanId, planId), eq(physicalLifecycleReceipts.idempotencyKey, idempotencyKey)));
      if (previous) {
        if (previous.requestHash !== hash) throw new PhysicalPlanStorageError('IDEMPOTENCY_CONFLICT', 409, 'This lifecycle key was already used with different captured input.');
        // Hold the outcome target stable while returning both its current summary
        // and optional copied revision; a concurrent archive cannot split them.
        const [target] = await tx.select({ id: physicalPlans.id }).from(physicalPlans)
          .where(and(eq(physicalPlans.workspaceId, workspaceId), eq(physicalPlans.id, previous.resultPlanId))).for('share');
        if (!target) return missing();
        // Receipt replay is acknowledgement, not a second transition. Return the
        // current target state separately from its original accepted outcome.
        return { operation, replayed: true, applied: { planId: previous.resultPlanId, revisionId: previous.resultRevisionId,
          archivedAt: iso(previous.appliedArchivedAt), lifecycleVersion: previous.appliedLifecycleVersion },
          plan: await readSummary(tx, workspaceId, previous.resultPlanId),
          ...(operation === 'duplicate' ? { revision: await readRevision(tx, workspaceId, previous.resultPlanId, previous.resultRevisionId) } : {}) };
      }
      const [plan] = await tx.select().from(physicalPlans).where(and(eq(physicalPlans.workspaceId, workspaceId), eq(physicalPlans.id, planId))).for('update');
      if (!plan) return missing();
      if (plan.currentRevisionId !== sourceRevisionId || physicalLifecycleEtag(plan.currentRevisionId, plan.lifecycleVersion) !== options.ifMatch)
        throw new PhysicalPlanStorageError('LIFECYCLE_CONFLICT', 412, 'The project or its archive state changed. Refresh the project list and choose the current version.');
      let resultPlanId = planId, resultRevisionId = sourceRevisionId, revision: PhysicalPlanRevision | undefined;
      if (operation === 'duplicate') {
        // Copy the server-held capture exactly. Re-evaluating or rebinding its old
        // snapshot would replace historical identities, dates and engine evidence.
        const source = await readRevision(tx, workspaceId, planId, sourceRevisionId);
        resultPlanId = randomUUID(); resultRevisionId = randomUUID();
        const [target] = await tx.insert(physicalPlans).values({ id: resultPlanId, workspaceId, currentRevisionId: resultRevisionId,
          copiedFromPlanId: planId, copiedFromRevisionId: sourceRevisionId, createdBy: principalId }).returning();
        const [stored] = await tx.insert(physicalPlanRevisions).values({ id: resultRevisionId, workspaceId, planId: resultPlanId,
          revisionNumber: 1, name: source.name, envelope: source.envelope, evaluation: source.evaluation,
          payloadHash: source.payloadHash, createdBy: principalId }).returning();
        revision = dto(stored, target);
      } else {
        if ((operation === 'archive') === (plan.archivedAt !== null))
          throw new PhysicalPlanStorageError('PROJECT_STATE_CONFLICT', 409, operation === 'archive' ? 'This project is already archived.' : 'This project is already active.');
        if (plan.lifecycleVersion >= 2147483647) return invalid();
        await tx.update(physicalPlans).set({ archivedAt: operation === 'archive' ? sql`clock_timestamp()` : null,
          archivedBy: operation === 'archive' ? principalId : null, lifecycleVersion: plan.lifecycleVersion + 1,
          updatedAt: sql`clock_timestamp()` }).where(and(eq(physicalPlans.workspaceId, workspaceId), eq(physicalPlans.id, planId)));
      }
      const current = await readSummary(tx, workspaceId, resultPlanId);
      const applied = { planId: resultPlanId, revisionId: resultRevisionId, archivedAt: current.archivedAt, lifecycleVersion: current.lifecycleVersion };
      await tx.insert(physicalLifecycleReceipts).values({ ...scope, requestHash: hash, resultPlanId, resultRevisionId,
        appliedArchivedAt: applied.archivedAt, appliedLifecycleVersion: applied.lifecycleVersion });
      return { operation, replayed: false, applied, plan: current, ...(revision ? { revision } : {}) };
    });
  }
}
export const physicalPlanStorage = new PhysicalPlanStorage();
