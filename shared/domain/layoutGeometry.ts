import { physicalDocumentV5Schema, type PhysicalRoom } from './document';
import { functionalZoneSchema, cabinetBlockSchema, type FunctionalZone, type CabinetBlock } from './layout';
import { placementBounds, type PlanBounds } from './stairGeometry';
import { exceedsTolerance } from './geometryValidation';
import { multiply, elevatedInterval, checked } from '../quantities/arithmetic';
export type LayoutEntity = FunctionalZone | CabinetBlock;
export type LayoutCheckStatus = 'valid' | 'invalid' | 'undetermined' | 'review';
export interface LayoutGeometryCheck { kind: 'zone' | 'cabinet'; id: string; roomId: string;
  relatedIds?: string[]; code: 'ZONE_FIT' | 'CABINET_FIT' | 'ZONE_OVERLAP' | 'CABINET_ZONE_MISMATCH' | 'CABINET_HEIGHT_UNKNOWN' | 'INVALID_LAYOUT_DOCUMENT';
  status: LayoutCheckStatus; paths: (string | number)[][]; message: string }
export const LAYOUT_FOOTPRINT_LABEL = 'Gross plan footprint — within parent room; not additive' as const;
export interface LayoutFootprint { status: 'known' | 'unknown' | 'invalid'; areaMm2: number | null;
  confirmation: 'confirmed' | 'provisional' | null; label: typeof LAYOUT_FOOTPRINT_LABEL }
const isCabinet = (entity: LayoutEntity): entity is CabinetBlock => 'depth' in entity;
/** A zone uses width along local X; a cabinet run uses length along local X. */
export function layoutBounds(entity: LayoutEntity): PlanBounds | null {
  return isCabinet(entity) ? placementBounds(entity.length, entity.depth, entity.placement)
    : placementBounds(entity.width, entity.length, entity.placement);
}
/** Gross dimensions only: does not add to finish area, allocate overlap or deduct voids. */
export function grossLayoutFootprint(entity: LayoutEntity): LayoutFootprint {
  const base = { areaMm2: null, confirmation: null, label: LAYOUT_FOOTPRINT_LABEL } as const;
  if (!(isCabinet(entity) ? cabinetBlockSchema : functionalZoneSchema).safeParse(entity).success) return { ...base, status: 'invalid' };
  const a = isCabinet(entity) ? entity.length : entity.width, b = isCabinet(entity) ? entity.depth : entity.length;
  if (a.state !== 'known' || b.state !== 'known' || a.provenance.confirmation.status === 'needs-review' || b.provenance.confirmation.status === 'needs-review') return { ...base, status: 'unknown' };
  try { return { ...base, status: 'known', areaMm2: multiply(a.valueMm, b.valueMm),
    confirmation: a.provenance.confirmation.status === 'confirmed' && b.provenance.confirmation.status === 'confirmed' ? 'confirmed' : 'provisional' }; }
  catch { return { ...base, status: 'invalid' }; }
}
function validBounds(bounds: PlanBounds): boolean {
  try { for (const value of Object.values(bounds)) checked(value, 'layout footprint');
    elevatedInterval(bounds.x, bounds.width); elevatedInterval(bounds.y, bounds.height); return true;
  } catch { return false; }
}
const contains = (outer: PlanBounds, inner: PlanBounds) => !exceedsTolerance(outer.x, inner.x) && !exceedsTolerance(outer.y, inner.y)
  && !exceedsTolerance(inner.x + inner.width, outer.x + outer.width) && !exceedsTolerance(inner.y + inner.height, outer.y + outer.height);
function fit(bounds: PlanBounds | null, room: PhysicalRoom | undefined): { status: LayoutCheckStatus; message: string } {
  if (!bounds || !room || room.length.state !== 'known' || room.width.state !== 'known') return { status: 'undetermined', message: 'Known footprint dimensions, room dimensions and room-local X/Y are required to verify placement.' };
  if (!validBounds(bounds)) return { status: 'invalid', message: 'The layout footprint exceeds the supported arithmetic range or loses its measured extent.' };
  if (!contains({ x: 0, y: 0, width: room.length.valueMm, height: room.width.valueMm }, bounds)) return { status: 'invalid', message: 'The layout footprint extends outside its parent room. Correct it; no automatic shrinking or movement is applied.' };
  return { status: 'valid', message: 'The footprint fits its parent room within 0.01 mm geometry tolerance; edge-touching is allowed.' };
}
export function validateLayoutGeometry(input: unknown): { status: LayoutCheckStatus; checks: LayoutGeometryCheck[] } {
  const parsed = physicalDocumentV5Schema.safeParse(input);
  if (!parsed.success) return { status: 'invalid', checks: [{ kind: 'zone', id: 'document', roomId: '', code: 'INVALID_LAYOUT_DOCUMENT', status: 'invalid',
    paths: parsed.error.issues.map(issue => issue.path), message: 'Repair structural room-use, zone and cabinet references before interpreting their layout.' }] };
  const document = parsed.data, contract = document.layoutContract, checks: LayoutGeometryCheck[] = [];
  for (const kind of ['zone', 'cabinet'] as const) {
    const key = kind === 'zone' ? 'zones' : 'cabinetBlocks';
    contract[key].forEach((entity, index) => {
      const base = ['layoutContract', key, index] as (string | number)[];
      checks.push({ kind, id: entity.id, roomId: entity.roomId, code: kind === 'zone' ? 'ZONE_FIT' : 'CABINET_FIT',
        paths: [[...base, 'placement'], [...base, kind === 'zone' ? 'width' : 'length'], [...base, kind === 'zone' ? 'length' : 'depth']],
        ...fit(layoutBounds(entity), document.rooms.find(room => room.id === entity.roomId)) });
    });
  }
  for (let i = 0; i < contract.zones.length; i++) for (let j = i + 1; j < contract.zones.length; j++) {
    const a = contract.zones[i], b = contract.zones[j]; if (a.roomId !== b.roomId) continue;
    const ab = layoutBounds(a), bb = layoutBounds(b); if (!ab || !bb || !validBounds(ab) || !validBounds(bb)) continue;
    if (Math.min(ab.x + ab.width, bb.x + bb.width) > Math.max(ab.x, bb.x) && Math.min(ab.y + ab.height, bb.y + bb.height) > Math.max(ab.y, bb.y)) {
      for (const [zone, other, index] of [[a, b, i], [b, a, j]] as const) checks.push({ kind: 'zone', id: zone.id, roomId: zone.roomId,
        relatedIds: [other.id], code: 'ZONE_OVERLAP', status: 'review', paths: [['layoutContract', 'zones', index, 'placement']],
        message: 'Functional zones overlap. Review the layout ambiguity; no area allocation, partition or extra finish quantity is inferred.' });
    }
  }
  contract.cabinetBlocks.forEach((cabinet, index) => {
    const path = ['layoutContract', 'cabinetBlocks', index] as (string | number)[];
    if (cabinet.height.state !== 'known') checks.push({ kind: 'cabinet', id: cabinet.id, roomId: cabinet.roomId, code: 'CABINET_HEIGHT_UNKNOWN', status: 'undetermined',
      paths: [[...path, 'height']], message: 'Cabinet height is unresolved; plan footprint can still be shown. No volume, countertop or installation quantity is inferred.' });
    if (cabinet.zoneId === null) return;
    const zone = contract.zones.find(zone => zone.id === cabinet.zoneId)!, zb = layoutBounds(zone), cb = layoutBounds(cabinet);
    const unknown = !zb || !cb || !validBounds(zb) || !validBounds(cb);
    if (unknown || !contains(zb!, cb!)) checks.push({ kind: 'cabinet', id: cabinet.id, roomId: cabinet.roomId, relatedIds: [zone.id], code: 'CABINET_ZONE_MISMATCH',
      status: unknown ? 'undetermined' : 'review', paths: [[...path, 'zoneId'], [...path, 'placement']],
      message: unknown ? 'The cabinet association is retained; incomplete geometry cannot yet verify containment in its zone.'
        : 'The cabinet footprint is outside its explicitly associated zone. Review that association; movement does not silently change it.' });
  });
  return { status: checks.some(check => check.status === 'invalid') ? 'invalid' : checks.some(check => check.status === 'undetermined') ? 'undetermined'
    : checks.some(check => check.status === 'review') ? 'review' : 'valid', checks };
}
