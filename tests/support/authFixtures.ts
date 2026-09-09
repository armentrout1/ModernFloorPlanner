// Synthetic authorization adapters for separate test entry points only.
// No production module imports this file; request headers cannot select identities.
import { AuthorizationError, type AuthorizationStorage, type VerifiedIdentity } from '../../server/authorizationTypes';
import type { IdentityResolution, IdentityResolver } from '../../server/identity';
import type { FloorPlan, InsertFloorPlan } from '../../shared/schema';

export const TEST_WORKSPACE_A = '11111111-1111-4111-8111-111111111111';
export const TEST_WORKSPACE_B = '22222222-2222-4222-8222-222222222222';
export const TEST_ORIGIN = 'https://mfp-test.invalid';
export const TEST_IDENTITIES = Object.fromEntries(['ownerA','editorA','viewerA','ownerB','outsider'].map(subject => [subject, {
  issuer: 'https://synthetic-identity.mfp.invalid', subject,
}])) as Record<'ownerA'|'editorA'|'viewerA'|'ownerB'|'outsider', VerifiedIdentity>;
export const TEST_PRINCIPALS = {
  ownerA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', editorA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2',
  viewerA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3', ownerB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1',
  outsider: 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1',
};
export const identityKey = (identity: VerifiedIdentity) => JSON.stringify([identity.issuer, identity.subject]);
type Role = 'owner'|'editor'|'viewer';
type Member = { principalId: string; role: Role; status: 'active'|'revoked' };
export function createTestIdentityResolver(outcome?: IdentityResolution): IdentityResolver {
  return async () => outcome ?? ({ status: 'authenticated' as const, identity: TEST_IDENTITIES.ownerA,
    expiresAt: Date.now() + 60_000, authentication: 'session' as const });
}
export class FixtureAuthorizationStorage implements AuthorizationStorage {
  plans: FloorPlan[];
  ownership = new Map<number, string | null>();
  identities = new Map(Object.entries(TEST_IDENTITIES).map(([key, identity]) => [identityKey(identity), TEST_PRINCIPALS[key as keyof typeof TEST_PRINCIPALS]]));
  memberships = new Map<string, Map<string, Member>>();
  workspaces = new Map([TEST_WORKSPACE_A,TEST_WORKSPACE_B].map((id,index) => [id, {
    id, name: 'Synthetic workspace ' + (index ? 'B':'A'), createdAt:'2026-09-09T00:00:00.000Z', updatedAt:'2026-09-09T00:00:00.000Z',
  }]));
  reads = 0; writes = 0; failWrites = false; failReads = false;
  constructor(plans: FloorPlan[] = []) {
    this.plans = structuredClone(plans);
    for (const plan of plans) this.ownership.set(plan.id, TEST_WORKSPACE_A);
    this.memberships.set(TEST_WORKSPACE_A, new Map([
      [TEST_PRINCIPALS.ownerA,{principalId:TEST_PRINCIPALS.ownerA,role:'owner',status:'active'}],
      [TEST_PRINCIPALS.editorA,{principalId:TEST_PRINCIPALS.editorA,role:'editor',status:'active'}],
      [TEST_PRINCIPALS.viewerA,{principalId:TEST_PRINCIPALS.viewerA,role:'viewer',status:'active'}],
    ]));
    this.memberships.set(TEST_WORKSPACE_B,new Map([[TEST_PRINCIPALS.ownerB,{principalId:TEST_PRINCIPALS.ownerB,role:'owner',status:'active'}]]));
  }
  private authorize(identity: VerifiedIdentity, workspaceId: string, action:'read'|'write'|'owner' = 'read') {
    const id=this.identities.get(identityKey(identity)), member=id ? this.memberships.get(workspaceId)?.get(id) : null;
    if (!this.workspaces.has(workspaceId) || !member || member.status !== 'active') throw new AuthorizationError(404);
    if (action === 'owner' && member.role !== 'owner' || action === 'write' && member.role === 'viewer') throw new AuthorizationError(403);
    return member;
  }
  private record(workspaceId:string,id:number) {
    const plan=this.plans.find(plan=>plan.id===id);
    if (!plan || this.ownership.get(id)!==workspaceId) throw new AuthorizationError(404);
    return plan;
  }
  private read() { if(this.failReads)throw new Error('private fixture database detail'); this.reads++; }
  private write() { if(this.failWrites)throw new Error('private database detail'); this.writes++; }
  async getFloorPlans(identity:VerifiedIdentity,workspaceId:string) {
    this.authorize(identity,workspaceId);this.read();
    return structuredClone(this.plans.filter(plan=>this.ownership.get(plan.id)===workspaceId));
  }
  async getFloorPlan(identity:VerifiedIdentity,workspaceId:string,id:number) {
    this.authorize(identity,workspaceId);this.read();return structuredClone(this.record(workspaceId,id));
  }
  async createFloorPlan(identity:VerifiedIdentity,workspaceId:string,input:InsertFloorPlan) {
    this.authorize(identity,workspaceId,'write');this.write();
    const plan={...structuredClone(input),id:Math.max(0,...this.plans.map(plan=>plan.id))+1} as FloorPlan;
    this.plans.push(plan);this.ownership.set(plan.id,workspaceId);return structuredClone(plan);
  }
  async updateFloorPlan(identity:VerifiedIdentity,workspaceId:string,id:number,input:Partial<InsertFloorPlan>) {
    this.authorize(identity,workspaceId,'write');const plan=this.record(workspaceId,id);this.write();
    Object.assign(plan,structuredClone(input));return structuredClone(plan);
  }
  async deleteFloorPlan(identity:VerifiedIdentity,workspaceId:string,id:number) {
    this.authorize(identity,workspaceId,'write');this.record(workspaceId,id);this.write();
    this.plans=this.plans.filter(plan=>plan.id!==id);this.ownership.delete(id);return true;
  }
  async getWorkspace(identity:VerifiedIdentity,workspaceId:string) {
    this.authorize(identity,workspaceId);this.read();return structuredClone(this.workspaces.get(workspaceId)!);
  }
  async updateWorkspaceName(identity:VerifiedIdentity,workspaceId:string,name:string) {
    this.authorize(identity,workspaceId,'owner');this.write();const workspace=this.workspaces.get(workspaceId)!;
    workspace.name=name;return structuredClone(workspace);
  }
  async getMemberships(identity:VerifiedIdentity,workspaceId:string) {
    this.authorize(identity,workspaceId,'owner');this.read();return structuredClone([...this.memberships.get(workspaceId)!.values()]);
  }
  async updateMembership(identity:VerifiedIdentity,workspaceId:string,targetPrincipalId:string,changes:Partial<Pick<Member,'role'|'status'>>) {
    this.authorize(identity,workspaceId,'owner');const member=this.memberships.get(workspaceId)!.get(targetPrincipalId);
    if(!member)throw new AuthorizationError(404);this.write();Object.assign(member,changes);return structuredClone(member);
  }
}
export const createFixtureStorage = (plans: FloorPlan[] = []) => new FixtureAuthorizationStorage(plans);
