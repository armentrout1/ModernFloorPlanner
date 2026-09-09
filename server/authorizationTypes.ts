import type { FloorPlan, InsertFloorPlan } from '@shared/schema';
/** Established only by the server verified-identity adapter. */
export interface VerifiedIdentity { issuer: string; subject: string }
export type WorkspaceRole = 'owner' | 'editor' | 'viewer';
export type MembershipStatus = 'active' | 'revoked';
export interface Workspace { id: string; name: string; createdAt: string; updatedAt: string }
export interface Membership { principalId: string; role: WorkspaceRole; status: MembershipStatus }
export interface MembershipUpdate { role?: WorkspaceRole; status?: MembershipStatus }
export class AuthorizationError extends Error {
  readonly code: 'ACCESS_DENIED' | 'NOT_FOUND';
  constructor(readonly status: 403 | 404) {
    super(status === 404 ? 'Resource not found' : 'Access denied');
    this.name = 'AuthorizationError'; this.code = status === 404 ? 'NOT_FOUND' : 'ACCESS_DENIED';
  }
}
export interface AuthorizationStorage {
  getFloorPlans(identity: VerifiedIdentity, workspaceId: string): Promise<FloorPlan[]>;
  getFloorPlan(identity: VerifiedIdentity, workspaceId: string, id: number): Promise<FloorPlan>;
  createFloorPlan(identity: VerifiedIdentity, workspaceId: string, input: InsertFloorPlan): Promise<FloorPlan>;
  updateFloorPlan(identity: VerifiedIdentity, workspaceId: string, id: number, updates: Partial<InsertFloorPlan>): Promise<FloorPlan>;
  deleteFloorPlan(identity: VerifiedIdentity, workspaceId: string, id: number): Promise<boolean>;
  getWorkspace(identity: VerifiedIdentity, workspaceId: string): Promise<Workspace>;
  updateWorkspaceName(identity: VerifiedIdentity, workspaceId: string, name: string): Promise<Workspace>;
  getMemberships(identity: VerifiedIdentity, workspaceId: string): Promise<Membership[]>;
  updateMembership(identity: VerifiedIdentity, workspaceId: string, targetPrincipalId: string, update: MembershipUpdate): Promise<Membership>;
}
