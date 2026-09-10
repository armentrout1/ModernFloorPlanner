import type { PhysicalSaveEnvelope, PhysicalSaveEvaluation } from './physicalSave';
/** Server identity is deliberately outside the portable local document. */
export interface PhysicalPlanRevision {
  planId: string; workspaceId: string; revisionId: string; revisionNumber: number;
  name: string; createdAt: string; createdBy: string;
  envelope: PhysicalSaveEnvelope; evaluation: PhysicalSaveEvaluation;
  payloadHash: string; etag: string;
}
export interface PhysicalPlanSummary {
  planId: string; name: string; currentRevisionId: string; revisionNumber: number;
  createdAt: string; updatedAt: string;
}
export interface PhysicalPlanList { plans: PhysicalPlanSummary[]; nextCursor: string | null }
export const physicalRevisionEtag = (revisionId: string): string => `"mfp-physical-${revisionId}"`;
