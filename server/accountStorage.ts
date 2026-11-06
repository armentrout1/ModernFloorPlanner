import { randomUUID } from 'node:crypto';
import { and, eq, gte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { applicationPrincipals, externalIdentities, workspaces, workspaceMemberships,
  browserContexts, loginTransactions, workspaceCreationReceipts } from '@shared/schema';
import { getDatabase, type Database } from './db';
import type { VerifiedIdentity, SessionBinding, Workspace, WorkspaceRole } from './authorizationTypes';
export type { SessionBinding } from './authorizationTypes';

export const SESSION_IDLE_MS = 30 * 60_000;
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60_000;
export const ANONYMOUS_SESSION_MS = 30 * 60_000;
export const WORKSPACE_CREATE_LIMIT = 5;
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type ContextRow = typeof browserContexts.$inferSelect;
export interface BrowserContext {
  browserId: string; sessionIdHash: string; contextToken: string;
  status: 'anonymous' | 'authenticated' | 'revoked';
  issuer: string | null; subject: string | null; principalId: string | null;
  selectedWorkspaceId: string | null; authenticatedAt: number | null;
  lastSeenAt: number; absoluteExpiresAt: number; idleExpiresAt: number;
}
export interface Principal { id: string }
export interface AccountWorkspace { id: string; name: string; role: WorkspaceRole }
export type AccountErrorCode = 'STALE_CONTEXT' | 'SESSION_EXPIRED' | 'SESSION_REVOKED' | 'IDENTITY_REVOKED' | 'RATE_LIMIT' | 'IDEMPOTENCY_CONFLICT' | 'NOT_FOUND' | 'INVALID_REQUEST';
export class AccountStorageError extends Error {
  readonly status: 400 | 401 | 404 | 409 | 429;
  constructor(readonly code: AccountErrorCode) {
    const status = code === 'RATE_LIMIT' ? 429 : code === 'NOT_FOUND' ? 404 : code === 'INVALID_REQUEST' ? 400
      : code === 'STALE_CONTEXT' || code === 'IDEMPOTENCY_CONFLICT' ? 409 : 401;
    super(status === 429 ? 'Too many requests' : status === 404 ? 'Resource not found' : status === 409 ? 'Account context changed; refresh and retry' : status === 400 ? 'Invalid request' : 'Sign in again');
    this.name = 'AccountStorageError'; this.status = status;
  }
}
const fail = (code: AccountErrorCode): never => { throw new AccountStorageError(code); };
const uuid = z.string().uuid(), hash = z.string().regex(/^[0-9a-f]{64}$/);
const part = z.string().max(2048).refine(v => v.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(v));
export const sessionBindingSchema = z.object({ browserId: uuid, contextToken: uuid, sessionIdHash: hash }).strict();
export const verifiedAccountIdentitySchema = z.object({ issuer: part, subject: part, sessionBinding: sessionBindingSchema.optional() }).strict();
const creationInput = z.object({ name: z.string().trim().min(1).max(200), idempotencyKey: uuid }).strict();
const time = (now: number) => { if (!Number.isSafeInteger(now) || now < 0 || now > 8_639_999_000_000_000) fail('INVALID_REQUEST'); return now; };
const context = (row: ContextRow): BrowserContext => ({ ...row, authenticatedAt: row.authenticatedAt?.getTime() ?? null,
  lastSeenAt: row.lastSeenAt.getTime(), absoluteExpiresAt: row.absoluteExpiresAt.getTime(), idleExpiresAt: row.idleExpiresAt.getTime() });
const bindingOf = (row: ContextRow): SessionBinding => ({ browserId: row.browserId, contextToken: row.contextToken, sessionIdHash: row.sessionIdHash });
function alive(row: ContextRow, now: number) {
  if (row.status === 'revoked') fail('SESSION_REVOKED');
  if (row.absoluteExpiresAt.getTime() <= now || row.idleExpiresAt.getTime() <= now) fail('SESSION_EXPIRED');
}
async function lockedContext(tx: Transaction, binding: SessionBinding, mode: 'share' | 'update' = 'update') {
  if (!sessionBindingSchema.safeParse(binding).success) return fail('STALE_CONTEXT');
  const [row] = await tx.select().from(browserContexts).where(eq(browserContexts.browserId, binding.browserId)).for(mode);
  if (!row || row.sessionIdHash !== binding.sessionIdHash || row.contextToken !== binding.contextToken) return fail('STALE_CONTEXT');
  return row;
}
async function activePrincipal(tx: Transaction, identity: VerifiedIdentity): Promise<Principal> {
  if (!verifiedAccountIdentitySchema.safeParse(identity).success) return fail('INVALID_REQUEST');
  const [principal] = await tx.select({ id: applicationPrincipals.id, principalStatus: applicationPrincipals.status, identityStatus: externalIdentities.status }).from(externalIdentities)
    .innerJoin(applicationPrincipals, eq(applicationPrincipals.id, externalIdentities.principalId))
    .where(and(eq(externalIdentities.issuer, identity.issuer), eq(externalIdentities.subject, identity.subject))).for('share');
  if (!principal || principal.identityStatus !== 'active' || principal.principalStatus !== 'active') return fail('IDENTITY_REVOKED');
  return { id: principal.id };
}
/** Acquired BEFORE workspace/identity/membership locks. The conflicting context
 * UPDATE serializes logout, SID rotation and workspace switching with SQL writes.
 * Only the server identity resolver supplies this optional binding. */
export async function assertSessionBinding(tx: Transaction, identity: VerifiedIdentity, workspaceId: string | null | undefined, now = Date.now()): Promise<string | undefined> {
  time(now);
  if (!identity.sessionBinding) return;
  const row = await lockedContext(tx, identity.sessionBinding, 'share'); alive(row, Math.max(now, Date.now()));
  if (row.status !== 'authenticated' || row.issuer !== identity.issuer || row.subject !== identity.subject) return fail('STALE_CONTEXT');
  if (workspaceId !== undefined && row.selectedWorkspaceId !== workspaceId) return fail('STALE_CONTEXT');
  return row.principalId!;
}
async function provision(tx: Transaction, identity: VerifiedIdentity): Promise<Principal> {
  if (!verifiedAccountIdentitySchema.safeParse(identity).success) return fail('INVALID_REQUEST');
  // Exact issuer+subject is the identity key. Hash collisions only serialize;
  // the actual unique key is still the complete pair. No email/account merging.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([identity.issuer, identity.subject])}, 71229))`);
  const [existing] = await tx.select({ id: externalIdentities.principalId }).from(externalIdentities)
    .where(and(eq(externalIdentities.issuer, identity.issuer), eq(externalIdentities.subject, identity.subject)));
  if (existing) return activePrincipal(tx, identity);
  const [created] = await tx.insert(applicationPrincipals).values({}).returning({ id: applicationPrincipals.id });
  await tx.insert(externalIdentities).values({ issuer: identity.issuer, subject: identity.subject, principalId: created.id });
  return created;
}
async function memberWorkspace(tx: Transaction, principalId: string, workspaceId: string): Promise<AccountWorkspace> {
  if (!uuid.safeParse(workspaceId).success) return fail('NOT_FOUND');
  const [workspace] = await tx.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).for('share');
  if (!workspace) return fail('NOT_FOUND');
  const [membership] = await tx.select({ role: workspaceMemberships.role }).from(workspaceMemberships)
    .where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.principalId, principalId), eq(workspaceMemberships.status, 'active'))).for('share');
  if (!membership) return fail('NOT_FOUND');
  return { ...workspace, role: membership.role };
}
async function createWorkspaceForPrincipal(tx: Transaction, principal: Principal, input: z.infer<typeof creationInput>, now: number): Promise<Workspace> {
  // Serialize creation retries/rate accounting for this exact principal without
  // upgrading principal locks and inverting the existing workspace lock order.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${principal.id}, 92341))`);
  const [receipt] = await tx.select().from(workspaceCreationReceipts).where(and(eq(workspaceCreationReceipts.principalId, principal.id), eq(workspaceCreationReceipts.idempotencyKey, input.idempotencyKey)));
  if (receipt) {
    if (receipt.name !== input.name) return fail('IDEMPOTENCY_CONFLICT');
    await memberWorkspace(tx, principal.id, receipt.workspaceId);
    return (await tx.select().from(workspaces).where(eq(workspaces.id, receipt.workspaceId)))[0];
  }
  const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(workspaceCreationReceipts)
    .where(and(eq(workspaceCreationReceipts.principalId, principal.id), gte(workspaceCreationReceipts.createdAt, new Date(now - 60 * 60_000))));
  if (count.count >= WORKSPACE_CREATE_LIMIT) return fail('RATE_LIMIT');
  const [workspace] = await tx.insert(workspaces).values({ name: input.name }).returning();
  await tx.insert(workspaceMemberships).values({ workspaceId: workspace.id, principalId: principal.id, role: 'owner', status: 'active' });
  await tx.insert(workspaceCreationReceipts).values({ principalId: principal.id, idempotencyKey: input.idempotencyKey, workspaceId: workspace.id, name: input.name, createdAt: new Date(now) });
  return workspace;
}
export class AccountStorage {
  constructor(private readonly database: () => Database = getDatabase) {}
  async createAnonymousContext(browserId: string, sessionIdHash: string, now: number): Promise<BrowserContext> {
    time(now); if (!uuid.safeParse(browserId).success || !hash.safeParse(sessionIdHash).success) return fail('INVALID_REQUEST');
    return this.database().transaction(async tx => {
      const expires = new Date(now + ANONYMOUS_SESSION_MS);
      const inserted = await tx.insert(browserContexts).values({ browserId, sessionIdHash, contextToken: randomUUID(), status: 'anonymous',
        lastSeenAt: new Date(now), absoluteExpiresAt: expires, idleExpiresAt: expires }).onConflictDoNothing().returning();
      if (inserted.length) return context(inserted[0]);
      const [row] = await tx.select().from(browserContexts).where(eq(browserContexts.browserId, browserId)).for('share');
      if (!row || row.sessionIdHash !== sessionIdHash) return fail('STALE_CONTEXT');
      alive(row, now); return context(row); // Never overwrites an existing authenticated or revoked row.
    });
  }
  async authenticate(binding: SessionBinding, identity: VerifiedIdentity, newSessionIdHash: string | (() => Promise<string>), now: number): Promise<BrowserContext> {
    time(now);
    if ((typeof newSessionIdHash !== 'function' && !hash.safeParse(newSessionIdHash).success) ||
        !verifiedAccountIdentitySchema.safeParse(identity).success) return fail('INVALID_REQUEST');
    return this.database().transaction(async tx => {
      const row = await lockedContext(tx, binding); alive(row, now);
      if (row.status !== 'anonymous') return fail('STALE_CONTEXT');
      const principal = await provision(tx, identity);
      const activeMemberships = await tx.select({ workspaceId: workspaceMemberships.workspaceId }).from(workspaceMemberships)
        .where(and(eq(workspaceMemberships.principalId, principal.id), eq(workspaceMemberships.status, 'active'))).limit(2);
      const selectedWorkspaceId = activeMemberships.length === 1 ? activeMemberships[0].workspaceId : null;
      // Hold the browser-context lock while express-session rotates the SID so
      // concurrent login, logout, and workspace requests cannot win with stale state.
      alive(row, Math.max(now, Date.now()));
      const nextHash = typeof newSessionIdHash === 'function' ? await newSessionIdHash() : newSessionIdHash;
      if (!hash.safeParse(nextHash).success || nextHash === row.sessionIdHash) return fail('INVALID_REQUEST');
      alive(row, Math.max(now, Date.now()));
      const [updated] = await tx.update(browserContexts).set({
        sessionIdHash: nextHash,
        contextToken: randomUUID(),
        status: 'authenticated',
        issuer: identity.issuer,
        subject: identity.subject,
        principalId: principal.id,
        selectedWorkspaceId,
        authenticatedAt: new Date(now),
        lastSeenAt: new Date(now),
        absoluteExpiresAt: new Date(now + SESSION_ABSOLUTE_MS),
        idleExpiresAt: new Date(now + SESSION_IDLE_MS),
      }).where(eq(browserContexts.browserId, row.browserId)).returning();
      // Complete any historical OAuth correlation rows left by an older build.
      await tx.update(loginTransactions).set({ nonce: null, codeVerifier: null, completedAt: new Date(now) })
        .where(eq(loginTransactions.browserId, row.browserId));
      return context(updated);
    });
  }
  async getContext(browserId: string, sessionIdHash: string, now: number, options: { touch?: boolean } = {}): Promise<BrowserContext | null> {
    time(now); if (!uuid.safeParse(browserId).success || !hash.safeParse(sessionIdHash).success) return null;
    return this.database().transaction(async tx => {
      const [row] = await tx.select().from(browserContexts).where(eq(browserContexts.browserId, browserId)).for(options.touch ? 'update' : 'share');
      if (!row || row.sessionIdHash !== sessionIdHash || row.status === 'revoked' || row.absoluteExpiresAt.getTime() <= now || row.idleExpiresAt.getTime() <= now) return null;
      if (row.status === 'authenticated') {
        try { const principal = await activePrincipal(tx, { issuer: row.issuer!, subject: row.subject! }); if (principal.id !== row.principalId) return null; }
        catch (error) { if (error instanceof AccountStorageError && error.code === 'IDENTITY_REVOKED') return null; throw error; }
      }
      if (options.touch && row.status === 'authenticated' && now - row.lastSeenAt.getTime() >= 60_000) {
        const [updated] = await tx.update(browserContexts).set({ lastSeenAt: new Date(now), idleExpiresAt: new Date(Math.min(now + SESSION_IDLE_MS, row.absoluteExpiresAt.getTime())) })
          .where(eq(browserContexts.browserId, browserId)).returning(); return context(updated);
      }
      return context(row);
    });
  }
  async logout(binding: SessionBinding, now: number): Promise<void> {
    time(now); await this.database().transaction(async tx => {
      const row = await lockedContext(tx, binding);
      await tx.update(browserContexts).set({ status: 'revoked', contextToken: randomUUID(), issuer: null, subject: null, principalId: null,
        selectedWorkspaceId: null, authenticatedAt: null, idleExpiresAt: new Date(now), absoluteExpiresAt: new Date(now) }).where(eq(browserContexts.browserId, row.browserId));
      await tx.update(loginTransactions).set({ nonce: null, codeVerifier: null, completedAt: new Date(now) }).where(eq(loginTransactions.browserId, row.browserId));
    });
  }
  async selectWorkspace(binding: SessionBinding, workspaceId: string | null, now: number): Promise<BrowserContext> {
    time(now); if (workspaceId !== null && !uuid.safeParse(workspaceId).success) return fail('NOT_FOUND');
    return this.database().transaction(async tx => {
      const row = await lockedContext(tx, binding); alive(row, now);
      if (row.status !== 'authenticated') return fail('SESSION_REVOKED');
      // Workspace first, then identity/principal, then membership: same order as #19.
      if (workspaceId !== null) { const [exists] = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for('share'); if (!exists) return fail('NOT_FOUND'); }
      const principal = await activePrincipal(tx, { issuer: row.issuer!, subject: row.subject! });
      if (principal.id !== row.principalId) return fail('STALE_CONTEXT');
      if (workspaceId !== null) await memberWorkspace(tx, principal.id, workspaceId);
      if (row.selectedWorkspaceId === workspaceId) return context(row);
      const [updated] = await tx.update(browserContexts).set({ selectedWorkspaceId: workspaceId, contextToken: randomUUID() }).where(eq(browserContexts.browserId, row.browserId)).returning();
      return context(updated);
    });
  }
  async provisionVerifiedPrincipal(identity: VerifiedIdentity): Promise<Principal> {
    return this.database().transaction(tx => provision(tx, identity));
  }
  async getActivePrincipal(identity: VerifiedIdentity): Promise<Principal> {
    return this.database().transaction(async tx => { await assertSessionBinding(tx, identity, undefined); return activePrincipal(tx, identity); });
  }
  async listWorkspaces(identity: VerifiedIdentity): Promise<AccountWorkspace[]> {
    return this.database().transaction(async tx => {
      await assertSessionBinding(tx, identity, undefined); const principal = await activePrincipal(tx, identity);
      return tx.select({ id: workspaces.id, name: workspaces.name, role: workspaceMemberships.role }).from(workspaceMemberships)
        .innerJoin(workspaces, eq(workspaces.id, workspaceMemberships.workspaceId))
        .where(and(eq(workspaceMemberships.principalId, principal.id), eq(workspaceMemberships.status, 'active'))).orderBy(workspaces.createdAt, workspaces.id);
    });
  }
  async createWorkspace(identity: VerifiedIdentity, input: { name: string; idempotencyKey: string }, now: number): Promise<Workspace> {
    time(now); const parsed = creationInput.safeParse(input); if (!parsed.success || !verifiedAccountIdentitySchema.safeParse(identity).success) return fail('INVALID_REQUEST');
    return this.database().transaction(async tx => {
      await assertSessionBinding(tx, identity, null, now);
      const principal = await activePrincipal(tx, identity);
      return createWorkspaceForPrincipal(tx, principal, parsed.data, now);
    });
  }
  async createWorkspaceAndSelect(binding: SessionBinding, input: { name: string; idempotencyKey: string }, now: number): Promise<{ workspace: Workspace; context: BrowserContext }> {
    time(now); const parsed = creationInput.safeParse(input);
    if (!parsed.success || !sessionBindingSchema.safeParse(binding).success) return fail('INVALID_REQUEST');
    return this.database().transaction(async tx => {
      const [row] = await tx.select().from(browserContexts).where(eq(browserContexts.browserId, binding.browserId)).for('update');
      if (!row || row.sessionIdHash !== binding.sessionIdHash) return fail('STALE_CONTEXT');
      alive(row, now);
      if (row.status !== 'authenticated') return fail('STALE_CONTEXT');
      const principal = await activePrincipal(tx, { issuer: row.issuer!, subject: row.subject! });
      if (principal.id !== row.principalId) return fail('STALE_CONTEXT');
      const [receipt] = await tx.select().from(workspaceCreationReceipts).where(and(
        eq(workspaceCreationReceipts.principalId, principal.id),
        eq(workspaceCreationReceipts.idempotencyKey, parsed.data.idempotencyKey),
      ));
      if (receipt) {
        if (receipt.name !== parsed.data.name) return fail('IDEMPOTENCY_CONFLICT');
        if (row.selectedWorkspaceId !== receipt.workspaceId) return fail('STALE_CONTEXT');
        await memberWorkspace(tx, principal.id, receipt.workspaceId);
        const [workspace] = await tx.select().from(workspaces).where(eq(workspaces.id, receipt.workspaceId));
        return { workspace, context: context(row) };
      }
      if (row.contextToken !== binding.contextToken) return fail('STALE_CONTEXT');
      const workspace = await createWorkspaceForPrincipal(tx, principal, parsed.data, now);
      const [updated] = await tx.update(browserContexts).set({ selectedWorkspaceId: workspace.id, contextToken: randomUUID() })
        .where(eq(browserContexts.browserId, row.browserId)).returning();
      return { workspace, context: context(updated) };
    });
  }
}
export { AccountStorage as DatabaseAccountStorage };
