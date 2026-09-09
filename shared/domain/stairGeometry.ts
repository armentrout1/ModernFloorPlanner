import { physicalDocumentV4Schema, type PhysicalDocumentV4 } from './document';
import { ENDPOINT_ROLES, type StairAssembly, type StairPlacement, type EndpointRole } from './stairs';
import type { Dimension } from './measurements';
import { exceedsTolerance } from './geometryValidation';
export interface PlanBounds { x: number; y: number; width: number; height: number }
export interface StairGeometryCheck {
  kind: 'stair' | 'landing' | 'surface-opening'; id: string; role?: EndpointRole;
  roomId?: string; surface?: 'floor' | 'ceiling'; attachmentIndex?: number;
  status: 'valid' | 'invalid' | 'undetermined'; code: string; paths: (string | number)[][]; message: string;
}
/** Width is local X and length local Y at rotation zero; the anchor stays top-left. */
export function placementBounds(width: Dimension, length: Dimension, placement: StairPlacement): PlanBounds | null {
  if (width.state !== 'known' || length.state !== 'known' || placement.x.state !== 'known' || placement.y.state !== 'known') return null;
  const rotated = placement.rotation === 90 || placement.rotation === 270;
  return { x: placement.x.valueMm, y: placement.y.valueMm,
    width: rotated ? length.valueMm : width.valueMm, height: rotated ? width.valueMm : length.valueMm };
}
/** Stair run follows X at zero degrees; width is perpendicular to it. */
export function stairEndpointBounds(stair: StairAssembly, role: EndpointRole): PlanBounds | null {
  const endpoint = stair.endpoints[role];
  return endpoint.state === 'modeled' ? placementBounds(stair.run, stair.width, endpoint.placement) : null;
}
function invalidNumeric(bounds: PlanBounds) {
  if (Object.values(bounds).some(value => !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER)) return true;
  for (const [start, size] of [[bounds.x, bounds.width], [bounds.y, bounds.height]]) {
    const end = start + size, span = end - start;
    if (!Number.isFinite(end) || Math.abs(end) > Number.MAX_SAFE_INTEGER || span <= 0
        || Math.abs(span - size) > 1e-9 + 16 * Number.EPSILON * Math.abs(size)) return true;
  }
  return false;
}
function fit(bounds: PlanBounds | null, room: PhysicalDocumentV4['rooms'][number] | undefined, internal: boolean) {
  if (!bounds || !room || room.length.state !== 'known' || room.width.state !== 'known')
    return { status: 'undetermined' as const, message: 'Measured dimensions and room-local placement are required to verify this footprint.' };
  if (invalidNumeric(bounds)) return { status: 'invalid' as const, message: 'The footprint exceeds supported arithmetic range or loses its measured extent.' };
  const right = bounds.x + bounds.width, bottom = bounds.y + bounds.height;
  if (internal && (bounds.x <= 0 || bounds.y <= 0 || right >= room.length.valueMm || bottom >= room.width.valueMm))
    return { status: 'invalid' as const, message: 'Only fully internal rectangular surface openings are supported; boundary-touching or cutting data is retained but cannot supply a net quantity.' };
  if (exceedsTolerance(0, bounds.x) || exceedsTolerance(0, bounds.y)
      || exceedsTolerance(right, room.length.valueMm) || exceedsTolerance(bottom, room.width.valueMm))
    return { status: 'invalid' as const, message: 'The footprint extends outside its host room; correct dimensions or placement rather than moving it silently.' };
  return { status: 'valid' as const, message: internal ? 'Explicit rectangular opening fits strictly inside this room surface.' : 'Footprint fits its explicit host room within the 0.01 mm geometry tolerance.' };
}
export function validateStairGeometry(input: unknown): { status: 'valid' | 'invalid' | 'undetermined'; checks: StairGeometryCheck[] } {
  const parsed = physicalDocumentV4Schema.safeParse(input);
  if (!parsed.success) return { status: 'invalid', checks: [{ kind: 'stair', id: 'document',
    status: 'invalid', code: 'INVALID_STAIR_DOCUMENT', paths: parsed.error.issues.map(issue => issue.path),
    message: 'Repair structural stair, endpoint and surface references before interpreting their geometry.' }] };
  const document = input as PhysicalDocumentV4, checks: StairGeometryCheck[] = [];
  document.stairsContract.stairs.forEach((stair, index) => {
    const path = ['stairsContract', 'stairs', index] as (string | number)[];
    for (const role of ENDPOINT_ROLES) {
      const endpoint = stair.endpoints[role], landing = stair.landings[role];
      if (endpoint.state === 'unresolved') checks.push({ kind: 'stair', id: stair.id, role, status: 'undetermined',
        code: 'STAIR_DESTINATION_UNMODELED', paths: [[...path, 'endpoints', role]], message: endpoint.reason });
      else {
        const room = document.rooms.find(room => room.id === endpoint.roomId);
        checks.push({ kind: 'stair', id: stair.id, role, roomId: endpoint.roomId, code: 'STAIR_ENDPOINT_FIT',
          paths: [[...path, 'width'], [...path, 'run'], [...path, 'endpoints', role, 'placement']], ...fit(stairEndpointBounds(stair, role), room, false) });
        if (landing) checks.push({ kind: 'landing', id: landing.id, role, roomId: endpoint.roomId, code: 'LANDING_FIT',
          paths: [[...path, 'landings', role]], ...fit(placementBounds(landing.width, landing.depth, landing.placement), room, false) });
      }
    }
    if (stair.totalRise.state !== 'known') checks.push({ kind: 'stair', id: stair.id, status: 'undetermined',
      code: 'STAIR_RISE_UNKNOWN', paths: [[...path, 'totalRise']], message: 'Stair rise is unresolved; no elevation, riser count or code-compliance claim is inferred.' });
    if (stair.alignment.state !== 'room-local-reviewed') checks.push({ kind: 'stair', id: stair.id, status: 'undetermined',
      code: 'STAIR_ALIGNMENT_UNREVIEWED', paths: [[...path, 'alignment']], message: stair.alignment.detail });
  });
  document.stairsContract.surfaceOpenings.forEach((opening, index) => opening.attachments.forEach((attachment, ai) => {
    const path = ['stairsContract', 'surfaceOpenings', index] as (string | number)[];
    checks.push({ kind: 'surface-opening', id: opening.id, roomId: attachment.roomId, surface: attachment.surface,
      attachmentIndex: ai, code: 'SURFACE_OPENING_FIT', paths: [[...path, 'width'], [...path, 'length'], [...path, 'attachments', ai, 'placement']],
      ...(opening.geometry === 'unsupported' ? { status: 'invalid' as const, message: opening.detail }
        : fit(placementBounds(opening.width, opening.length, attachment.placement), document.rooms.find(room => room.id === attachment.roomId), true)) });
  }));
  return { status: checks.some(check => check.status === 'invalid') ? 'invalid' : checks.some(check => check.status === 'undetermined') ? 'undetermined' : 'valid', checks };
}
