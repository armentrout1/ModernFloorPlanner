import type { PhysicalDocumentWithStairs } from '../domain/document';
import type { QuantityTrace } from './result';
import { multiply, subtract, sum, nonnegative, limited, elevatedInterval, span, unionArea, type Rectangle, ArithmeticFailure } from './arithmetic';
/** Only called after surface-specific readiness validates every attached rectangle.
 * Uses the existing rectangle-union and arithmetic guards; no renderer coordinates.
 */
export function calculateSurfaceDeductions(document: PhysicalDocumentWithStairs, roomId: string, surface: 'floor' | 'ceiling', gross: number, trace: QuantityTrace) {
  const rectangles: Rectangle[] = [];
  trace.surfaceContributions = [];
  const room = document.rooms.find(room => room.id === roomId)!;
  for (const opening of [...document.stairsContract.surfaceOpenings].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const attachment = opening.attachments.find(attachment => attachment.roomId === roomId && attachment.surface === surface);
    if (!attachment) continue;
    if (opening.width.state !== 'known' || opening.length.state !== 'known'
        || attachment.placement.x.state !== 'known' || attachment.placement.y.state !== 'known'
        || room.length.state !== 'known' || room.width.state !== 'known') throw new ArithmeticFailure({
      code: 'SURFACE_MEASUREMENT_UNRESOLVED', path: [], message: 'Explicit opening and host dimensions are required.' });
    const rotation = attachment.placement.rotation, rotated = rotation === 90 || rotation === 270;
    const width = rotated ? opening.length.valueMm : opening.width.valueMm;
    const height = rotated ? opening.width.valueMm : opening.length.valueMm;
    const rawX = elevatedInterval(attachment.placement.x.valueMm, width), rawY = elevatedInterval(attachment.placement.y.valueMm, height);
    // Internal-only holes cannot be converted into boundary cuts by clipping.
    if (rawX.start <= 0 || rawY.start <= 0 || rawX.end >= room.length.valueMm || rawY.end >= room.width.valueMm)
      throw new ArithmeticFailure({ code: 'SURFACE_BOUNDARY_UNSUPPORTED', path: [], message: 'Boundary-touching/cutting openings do not provide a supported net finish quantity.' });
    const raw = multiply(opening.width.valueMm, opening.length.valueMm), represented = multiply(span(rawX), span(rawY));
    const roundoff = subtract(raw, represented);
    rectangles.push({ x: rawX, y: rawY });
    trace.surfaceContributions.push({ openingId: opening.id, roomId, surface, raw, effectiveBeforeUnion: represented,
      boundaryAdjustment: 0, roundoffAdjustment: roundoff, rawBounds: { x: rawX, y: rawY }, effectiveBounds: { x: { ...rawX }, y: { ...rawY } } });
    if (roundoff !== 0) trace.adjustments.push({ code: 'FLOATING_POINT_ROUNDOFF', unit: 'mm2', amount: Math.abs(roundoff),
      message: 'Measured opening dimensions and represented bounds differ within the existing extent precision budget.' });
  }
  const raw = sum(trace.surfaceContributions.map(item => item.raw));
  const represented = sum(trace.surfaceContributions.map(item => item.effectiveBeforeUnion));
  const budget = sum(trace.surfaceContributions.map(item => Math.abs(item.roundoffAdjustment)));
  const union = limited(unionArea(rectangles), represented, trace, 'surface opening union', 'mm2');
  let effective = limited(union, raw, trace, 'surface measured deduction bound', 'mm2', budget);
  effective = limited(effective, gross, trace, 'surface coverage bound', 'mm2', budget);
  trace.boundaryAdjustment = 0;
  trace.overlapAdjustment = nonnegative(subtract(represented, union), 'surface union adjustment');
  trace.roundoffAdjustment = subtract(subtract(raw, trace.overlapAdjustment), effective);
  if (trace.overlapAdjustment > 0) trace.adjustments.push({ code: 'COVERAGE_UNION', amount: trace.overlapAdjustment, unit: 'mm2',
    message: 'Explicit overlapping rectangles deduct their shared coverage once; separate positive gaps remain separate.' });
  return { raw, effective };
}
