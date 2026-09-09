import { z } from 'zod';
import type { PhysicalDocumentV4 } from '../domain/document';
import { ENDPOINT_ROLES } from '../domain/stairs';
import { coordinateMeasurementSchema } from '../domain/measurements';
import { validateStairGeometry, type StairGeometryCheck } from '../domain/stairGeometry';
const id = z.string().min(1), path = z.array(z.union([z.string(), z.number().int().nonnegative()]));
export const surfaceReadinessSchema = z.object({
  roomId: id, surface: z.enum(['floor', 'ceiling']), status: z.enum(['valid', 'provisional', 'blocked']),
  surfaceOpeningIds: z.array(id), stairIds: z.array(id),
  findings: z.array(z.object({ code: id, path, message: z.string(), id: id.optional() }).strict()),
  evidence: z.array(z.object({ openingId: id, field: z.enum(['width', 'length', 'x', 'y']),
    attachmentIndex: z.number().int().nonnegative().optional(), measurement: coordinateMeasurementSchema }).strict()),
}).strict();
export type SurfaceReadiness = z.infer<typeof surfaceReadinessSchema>;
export function evaluateSurfaceReadiness(document: PhysicalDocumentV4, roomId: string, surface: 'floor' | 'ceiling', suppliedChecks?: readonly StairGeometryCheck[]): SurfaceReadiness {
  const result: SurfaceReadiness = { roomId, surface, status: 'valid', surfaceOpeningIds: [], stairIds: [], findings: [], evidence: [] };
  const checks = suppliedChecks ?? validateStairGeometry(document).checks;
  document.stairsContract.stairs.forEach((stair, index) => {
    for (const role of ENDPOINT_ROLES) {
      const endpoint = stair.endpoints[role];
      if (endpoint.state !== 'modeled' || endpoint.roomId !== roomId) continue;
      result.stairIds.push(stair.id);
      const impact = stair.surfaceImpacts[role][surface];
      if (impact.state === 'unresolved') result.findings.push({ code: 'SURFACE_IMPACT_UNRESOLVED', id: stair.id,
        path: ['stairsContract', 'stairs', index, 'surfaceImpacts', role, surface], message: impact.reason });
    }
  });
  document.stairsContract.surfaceOpenings.forEach((opening, index) => {
    const ai = opening.attachments.findIndex(attachment => attachment.roomId === roomId && attachment.surface === surface);
    if (ai < 0) return;
    result.surfaceOpeningIds.push(opening.id);
    const attachment = opening.attachments[ai], base = ['stairsContract', 'surfaceOpenings', index] as (string | number)[];
    result.evidence.push({ openingId: opening.id, field: 'width', measurement: opening.width },
      { openingId: opening.id, field: 'length', measurement: opening.length },
      { openingId: opening.id, field: 'x', attachmentIndex: ai, measurement: attachment.placement.x },
      { openingId: opening.id, field: 'y', attachmentIndex: ai, measurement: attachment.placement.y });
    for (const check of checks.filter(check => check.kind === 'surface-opening' && check.id === opening.id && check.attachmentIndex === ai)) {
      if (check.status !== 'valid') result.findings.push({ code: check.status === 'invalid' ? 'SURFACE_OPENING_INVALID' : 'SURFACE_OPENING_UNRESOLVED',
        id: opening.id, path: check.paths[0] ?? base, message: check.message });
    }
    for (const item of result.evidence.filter(item => item.openingId === opening.id)) {
      const measurement = item.measurement;
      if (measurement.state !== 'known' || measurement.provenance.confirmation.status === 'needs-review')
        result.findings.push({ code: 'SURFACE_MEASUREMENT_UNRESOLVED', id: opening.id,
          path: item.field === 'width' || item.field === 'length' ? [...base, item.field] : [...base, 'attachments', ai, 'placement', item.field],
          message: 'Surface-opening ' + item.field + ' requires an explicit resolved measurement.' });
    }
  });
  result.surfaceOpeningIds.sort(); result.stairIds = Array.from(new Set(result.stairIds)).sort();
  result.status = result.findings.length ? 'blocked' : result.evidence.some(item =>
    item.measurement.state === 'known' && item.measurement.provenance.confirmation.status !== 'confirmed') ? 'provisional' : 'valid';
  return result;
}
