import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { applicationPrincipals, externalIdentities, workspaces, workspaceMemberships, floorPlans,
  type FloorPlan, type StoredFloorPlan, type InsertFloorPlan } from '@shared/schema';
import { createLegacyFloorPlanSchema, updateLegacyFloorPlanSchema } from '@shared/legacyValidation';
import { getDatabase, type Database } from './db';
import { assertSessionBinding, verifiedAccountIdentitySchema } from './accountStorage';
import { AuthorizationError, type AuthorizationStorage, type VerifiedIdentity, type Membership, type MembershipUpdate } from './authorizationTypes';
export type IStorage = AuthorizationStorage;
export type { AuthorizationStorage } from './authorizationTypes';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const uuid = z.string().uuid(), identitySchema = verifiedAccountIdentitySchema;
const membershipUpdate = z.object({ role: z.enum(['owner', 'editor', 'viewer']).optional(), status: z.enum(['active', 'revoked']).optional() }).strict().refine(value => Object.keys(value).length > 0);
const workspaceName = z.string().trim().min(1).max(200);
const planId = z.number().int().positive().max(2147483647);
const dto = ({ workspaceId: _ownership, ...record }: StoredFloorPlan): FloorPlan => record;
const denied = (): never => { throw new AuthorizationError(403); };
const missing = (): never => { throw new AuthorizationError(404); };
/** Authorization and scoped SQL share a transaction. Lock order is always
 * browser context (when session-bound), workspace, identity/principal, membership. Membership administration obtains
 * the conflicting workspace lock, never trusting an earlier browser role. */
export class DatabaseStorage implements AuthorizationStorage {
  constructor(private readonly database: () => Database = getDatabase) {}
  private async authorized<T>(identity: VerifiedIdentity, workspaceId: string, permission: 'read' | 'write' | 'owner', operation: (tx: Transaction, principalId: string) => Promise<T>, exclusiveWorkspace = false): Promise<T> {
    if (!identitySchema.safeParse(identity).success || !uuid.safeParse(workspaceId).success) return missing();
    return this.database().transaction(async tx => {
      const sessionPrincipalId = await assertSessionBinding(tx, identity, workspaceId);
      const [workspace] = await tx.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.id, workspaceId)).for(exclusiveWorkspace ? 'update' : 'share');
      if (!workspace) return missing();
      const [principal] = await tx.select({ id: applicationPrincipals.id }).from(externalIdentities)
        .innerJoin(applicationPrincipals, eq(externalIdentities.principalId, applicationPrincipals.id))
        .where(and(eq(externalIdentities.issuer, identity.issuer), eq(externalIdentities.subject, identity.subject), eq(externalIdentities.status, 'active'), eq(applicationPrincipals.status, 'active'))).for('share');
      if (!principal || sessionPrincipalId !== undefined && sessionPrincipalId !== principal.id) return missing();
      const [membership] = await tx.select({ role: workspaceMemberships.role }).from(workspaceMemberships)
        .where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.principalId, principal.id), eq(workspaceMemberships.status, 'active'))).for('share');
      if (!membership) return missing();
      if (permission === 'owner' && membership.role !== 'owner' || permission === 'write' && membership.role === 'viewer') return denied();
      return operation(tx, principal.id);
    });
  }
  getFloorPlans(identity: VerifiedIdentity, workspaceId: string): Promise<FloorPlan[]> {
    return this.authorized(identity, workspaceId, 'read', async tx => (await tx.select().from(floorPlans).where(eq(floorPlans.workspaceId, workspaceId)).orderBy(floorPlans.updatedAt)).map(dto));
  }
  getFloorPlan(identity: VerifiedIdentity, workspaceId: string, id: number): Promise<FloorPlan> {
    if (!planId.safeParse(id).success) return Promise.reject(new AuthorizationError(404));
    return this.authorized(identity, workspaceId, 'read', async tx => {
      const [plan] = await tx.select().from(floorPlans).where(and(eq(floorPlans.workspaceId, workspaceId), eq(floorPlans.id, id))); return plan ? dto(plan) : missing();
    });
  }
  createFloorPlan(identity: VerifiedIdentity, workspaceId: string, input: InsertFloorPlan): Promise<FloorPlan> {
    return this.authorized(identity, workspaceId, 'write', async tx => {
      const value = createLegacyFloorPlanSchema.safeParse(input); if (!value.success) return denied();
      const [plan] = await tx.insert(floorPlans).values({ ...value.data, workspaceId }).returning(); return dto(plan);
    });
  }
  updateFloorPlan(identity: VerifiedIdentity, workspaceId: string, id: number, updates: Partial<InsertFloorPlan>): Promise<FloorPlan> {
    if (!planId.safeParse(id).success) return Promise.reject(new AuthorizationError(404));
    return this.authorized(identity, workspaceId, 'write', async tx => {
      const value = updateLegacyFloorPlanSchema.safeParse(updates); if (!value.success) return denied();
      const [plan] = await tx.update(floorPlans).set(value.data).where(and(eq(floorPlans.workspaceId, workspaceId), eq(floorPlans.id, id))).returning(); return plan ? dto(plan) : missing();
    });
  }
  deleteFloorPlan(identity: VerifiedIdentity, workspaceId: string, id: number): Promise<boolean> {
    if (!planId.safeParse(id).success) return Promise.reject(new AuthorizationError(404));
    return this.authorized(identity, workspaceId, 'write', async tx => {
      const rows = await tx.delete(floorPlans).where(and(eq(floorPlans.workspaceId, workspaceId), eq(floorPlans.id, id))).returning({ id: floorPlans.id }); return rows.length ? true : missing();
    });
  }
  getWorkspace(identity: VerifiedIdentity, workspaceId: string) {
    return this.authorized(identity, workspaceId, 'read', async tx => (await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId)))[0]);
  }
  updateWorkspaceName(identity: VerifiedIdentity, workspaceId: string, name: string) {
    return this.authorized(identity, workspaceId, 'owner', async tx => {
      const value = workspaceName.safeParse(name); if (!value.success) return denied();
      return (await tx.update(workspaces).set({ name: value.data, updatedAt: sql`now()` }).where(eq(workspaces.id, workspaceId)).returning())[0];
    }, true);
  }
  getMemberships(identity: VerifiedIdentity, workspaceId: string): Promise<Membership[]> {
    return this.authorized(identity, workspaceId, 'owner', async tx => tx.select({ principalId: workspaceMemberships.principalId, role: workspaceMemberships.role, status: workspaceMemberships.status }).from(workspaceMemberships).where(eq(workspaceMemberships.workspaceId, workspaceId)).orderBy(workspaceMemberships.principalId));
  }
  updateMembership(identity: VerifiedIdentity, workspaceId: string, targetPrincipalId: string, update: MembershipUpdate): Promise<Membership> {
    if (!uuid.safeParse(targetPrincipalId).success) return Promise.reject(new AuthorizationError(404));
    return this.authorized(identity, workspaceId, 'owner', async tx => {
      const parsed = membershipUpdate.safeParse(update); if (!parsed.success) return denied();
      const [target] = await tx.select().from(workspaceMemberships).where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.principalId, targetPrincipalId))).for('update');
      if (!target) return missing();
      const next = { ...target, ...parsed.data };
      if (target.role === 'owner' && target.status === 'active' && (next.role !== 'owner' || next.status !== 'active')) {
        const remaining = await tx.select({ id: workspaceMemberships.principalId }).from(workspaceMemberships)
          .innerJoin(applicationPrincipals, eq(applicationPrincipals.id, workspaceMemberships.principalId))
          .where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.role, 'owner'), eq(workspaceMemberships.status, 'active'), eq(applicationPrincipals.status, 'active')));
        if (!remaining.some(member => member.id !== targetPrincipalId)) return denied();
      }
      return (await tx.update(workspaceMemberships).set(parsed.data).where(and(eq(workspaceMemberships.workspaceId, workspaceId), eq(workspaceMemberships.principalId, targetPrincipalId))).returning({ principalId: workspaceMemberships.principalId, role: workspaceMemberships.role, status: workspaceMemberships.status }))[0];
    }, true);
  }
}
export const storage: AuthorizationStorage = new DatabaseStorage();
