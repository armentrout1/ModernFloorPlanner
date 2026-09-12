import type { PhysicalSaveEnvelope, PhysicalSaveEvaluation } from './physicalSave';
/** Server identity is deliberately outside the portable local document. */
export interface PhysicalPlanRevision {
  planId: string; workspaceId: string; revisionId: string; revisionNumber: number;
  name: string; createdAt: string; createdBy: string;
  envelope: PhysicalSaveEnvelope; evaluation: PhysicalSaveEvaluation;
  payloadHash: string; etag: string;
  /** Current project state, not a mutation of this immutable saved revision. */
  archivedAt?: string | null;
  /** Only the copied first revision retains its source evaluation identity. */
  copiedFrom?: PhysicalPlanCopyOrigin;
}
export interface PhysicalPlanCopyOrigin { planId: string; revisionId: string }
export interface PhysicalPlanSummary {
  planId: string; name: string; currentRevisionId: string; revisionNumber: number;
  createdAt: string; updatedAt: string;
  archivedAt: string | null; lifecycleVersion: number; lifecycleEtag: string;
  copiedFrom: PhysicalPlanCopyOrigin | null;
}
export interface PhysicalPlanList { plans: PhysicalPlanSummary[]; nextCursor: string | null }
export const physicalRevisionEtag = (revisionId: string): string => `"mfp-physical-${revisionId}"`;

/** Head identity plus lifecycle generation prevents stale actions after archive/restore ABA. */
export const physicalLifecycleEtag = (revisionId: string, version: number): string => `"mfp-physical-lifecycle-${revisionId}-${version}"`;
export type PhysicalPlanOperation = 'duplicate' | 'archive' | 'restore';
export interface PhysicalPlanLifecycleApplied { planId: string; revisionId: string; archivedAt: string | null; lifecycleVersion: number }
export interface PhysicalPlanLifecycleResult {
  operation: PhysicalPlanOperation; replayed: boolean;
  /** The historical accepted outcome; replay never reapplies it. */
  applied: PhysicalPlanLifecycleApplied;
  /** Current outcome-target state, which may differ after subsequent actions. */
  plan: PhysicalPlanSummary; revision?: PhysicalPlanRevision;
}
