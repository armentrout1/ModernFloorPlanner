import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { applicationPrincipals, externalIdentities, workspaces, workspaceMemberships } from '@shared/schema';
import type { Database } from './db';
import { assertSessionBinding, verifiedAccountIdentitySchema } from './accountStorage';
import { AuthorizationError, type VerifiedIdentity } from './authorizationTypes';
export type WorkspaceTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];
export type WorkspacePermission = 'read' | 'write' | 'owner';
const uuid = z.string().uuid(), identitySchema = verifiedAccountIdentitySchema;
const denied = (): never => { throw new AuthorizationError(403); };
const missing = (): never => { throw new AuthorizationError(404); };
/** One authorization boundary for legacy and physical repositories. Lock order:
 * browser context, workspace, identity/principal, membership, then resource.
 * Locks remain held through the complete SQL operation and its commit. */
export async function withWorkspaceAuthorization<T>(database: () => Database, identity: VerifiedIdentity,
  workspaceId: string, permission: WorkspacePermission,
  operation: (tx: WorkspaceTransaction, principalId: string) => Promise<T>, exclusiveWorkspace = false): Promise<T> {
    if (!identitySchema.safeParse(identity).success || !uuid.safeParse(workspaceId).success) return missing();
    return database().transaction(async tx => {
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
