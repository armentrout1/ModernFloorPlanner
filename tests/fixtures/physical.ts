import assert from 'node:assert/strict';
import type { PhysicalDocument, PhysicalRoom } from '../../shared/domain/document';
import { parseMeasurement } from '../../shared/domain/parseMeasurement';
import { toMm } from '../../shared/domain/units';
import { QUANTITY_POLICY_VERSION, type QuantityRequest, type QuantitySelection } from '../../shared/quantities/policy';
import { QUANTITY_OUTPUTS } from '../../shared/domain/geometryValidation';
export const AT = '2026-09-06T12:00:00.000Z';
export function measured(input: string, confirmed = true, kind: 'dimension' | 'elevation' = 'dimension') {
  const parsed = parseMeasurement(input, { kind });
  assert.ok(parsed.ok, input);
  return { ...parsed.measurement, provenance: { ...parsed.measurement.provenance,
    confirmation: confirmed ? { status: 'confirmed' as const, confirmedAt: AT } : { status: 'unconfirmed' as const },
  } };
}
export function room(id = 'room-1'): PhysicalRoom {
  return { id, name: id, length: measured('12 ft'), width: measured('10 ft'), ceilingHeight: measured('8 ft'),
    wallFaces: [{ id: id + ':top', side: 'top' }, { id: id + ':right', side: 'right' },
      { id: id + ':bottom', side: 'bottom' }, { id: id + ':left', side: 'left' }],
    presentation: { xMm: toMm(-123, 'mm'), yMm: toMm(77, 'mm') }, metadata: { untouched: { nested: [1, 2] } } };
}
export function q001(): PhysicalDocument {
  return { schemaVersion: 2, id: 'q-001', name: 'Q-001 validation only', revisionId: null, quantityPolicyVersion: null,
    rooms: [room()], openings: [
      { id: 'door', kind: 'door', width: measured('3 ft'), height: measured('7 ft'), sillHeight: measured('0 mm', true, 'elevation'),
        measureBasis: 'finished', attachments: [{ wallFaceId: 'room-1:top', anchor: 'center', offsetMm: toMm(2.5, 'ft') }], metadata: {} },
      { id: 'window', kind: 'window', width: measured('4 ft'), height: measured('3 ft'), sillHeight: measured('3 ft', true, 'elevation'),
        measureBasis: 'finished', attachments: [{ wallFaceId: 'room-1:top', anchor: 'center', offsetMm: toMm(8, 'ft') }], metadata: {} },
    ], review: [], metadata: { preserved: true } };
}
export function request(selections: QuantitySelection[]): QuantityRequest {
  return { policy: { version: QUANTITY_POLICY_VERSION, openingMeasureBasis: 'finished' as const, crownFullHeightGaps: [] as { wallFaceId: string; openingId: string }[] }, selections };
}
export function allSelections(doc = q001()): QuantitySelection[] {
  return QUANTITY_OUTPUTS.map(output => {
    if (output === 'floor-area' || output === 'ceiling-area') return { output, roomIds: doc.rooms.map(room => room.id), wasteFraction: .1 };
    if (output === 'opening-inventory') return { output, openingIds: doc.openings.map(opening => opening.id) };
    if (output === 'door-casing' || output === 'window-casing') return { output,
      faces: doc.openings.filter(opening => opening.kind === (output === 'door-casing' ? 'door' : 'window'))
        .flatMap(opening => opening.attachments.map(a => ({ wallFaceId: a.wallFaceId, openingId: opening.id }))), wasteFraction: 0 };
    return { output, wallFaceIds: doc.rooms.flatMap(room => room.wallFaces.map(wall => wall.id)), wasteFraction: 0 };
  });
}
export function freezeDeep<T>(input: T): T {
  if (input && typeof input === 'object') {
    for (const value of Object.values(input)) freezeDeep(value);
    Object.freeze(input);
  }
  return input;
}
