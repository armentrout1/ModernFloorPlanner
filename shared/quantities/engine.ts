import { adaptMeasurementDocument } from '../compatibility/legacyDocument';
import type { PhysicalDocument, PhysicalOpening } from '../domain/document';
import { atFloor, measurementAt, wallIndex, type QuantityOutput, type MeasurementRef } from '../domain/geometryValidation';
import { evaluateQuantityReadiness, type OutputReadiness } from './readiness';
import { validateQuantityRequest, QUANTITY_POLICY_VERSION, type ContractError, type QuantityRequest } from './policy';
import { ownFrozen, type DeepReadonly } from './immutability';
import { copyJson } from './canonicalJson';
import { add, subtract, multiply, sum, checked, nonnegative, limited, interval, elevatedInterval, intersect, span, unionLength, unionArea,
  ArithmeticFailure, type Interval, type Rectangle } from './arithmetic';
import { RESULT_SCHEMA_VERSION, ENGINE_VERSION, calculationSchema,
  type Calculation, type Amounts, type QuantityRecord, type QuantityAggregate, type QuantityTrace } from './result';

export type CalculationResult = { ok: true; calculation: DeepReadonly<Calculation> } | { ok: false; errors: ContractError[] };
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const refKey = (ref: MeasurementRef) => JSON.stringify([ref.entity, ref.id, ref.field]);
const emptyCounts = () => ({ door: 0, window: 0, 'floor-level-opening': 0 });
const unitFor = (output: QuantityOutput) => output === 'opening-inventory' ? 'count' as const
  : output.includes('area') ? 'mm2' as const : 'mm' as const;
const targetFor = (readiness: OutputReadiness) => readiness.output === 'opening-inventory' ? 'inventory'
  : readiness.wallFaceIds.length ? readiness.output.includes('casing')
    ? 'face:' + JSON.stringify([readiness.wallFaceIds[0], readiness.openingIds[0]])
    : 'wall:' + JSON.stringify(readiness.wallFaceIds[0])
  : 'room:' + JSON.stringify(readiness.roomIds[0]);
function amounts(gross: number, rawDeductions: number, effectiveDeductions: number, wasteFraction: number | null): Amounts {
  const net = nonnegative(subtract(gross, effectiveDeductions), 'net quantity');
  const allowance = wasteFraction === null ? 0 : multiply(net, wasteFraction);
  return { gross, rawDeductions, effectiveDeductions, net, wasteFraction,
    allowance, adjusted: nonnegative(add(net, allowance), 'adjusted quantity') };
}
function blockedReasons(readiness: OutputReadiness): ContractError[] {
  const errors: ContractError[] = [];
  if (readiness.numericBasis.status !== 'sufficient') errors.push({
    code: 'NUMERIC_BASIS_INSUFFICIENT', path: [], message: 'Required numeric basis is missing or unresolved' });
  if (readiness.geometry.status !== 'valid') errors.push({
    code: readiness.geometry.status === 'invalid' ? 'GEOMETRY_INVALID' : 'GEOMETRY_UNDETERMINED',
    path: [], message: 'Relevant geometry is ' + readiness.geometry.status });
  if (readiness.confirmation.status === 'unresolved') errors.push({
    code: 'UNRESOLVED_CONFIRMATION', path: [], message: 'Required measurement confirmation cannot be resolved to usable evidence' });
  return errors;
}
function failure(error: unknown, id: string): ContractError {
  return error instanceof ArithmeticFailure ? { ...error.detail, id } : {
    code: 'CALCULATION_FAILURE', path: [], id, message: 'The selected record could not be evaluated safely' };
}

/** Pure rectangular quantities. Explicit v2 only; callers may adapt legacy JSON separately.
 * No clocks, hashes, viewport state, display rounding, persistence or implicit selections.
 */
export function calculateQuantities(input: unknown, requested: unknown): CalculationResult {
  try { input = copyJson(input); requested = copyJson(requested); }
  catch { return { ok: false, errors: [{ code: 'INVALID_JSON', path: [], message: 'Calculation inputs must be finite, acyclic plain JSON without accessors or omitted values' }] }; }
  if (!input || typeof input !== 'object' || (input as { schemaVersion?: unknown }).schemaVersion !== 2) {
    return { ok: false, errors: [{ code: 'EXPLICIT_V2_REQUIRED', path: ['schemaVersion'], message: 'Adapt legacy input explicitly before calculating physical quantities' }] };
  }
  const adapted = adaptMeasurementDocument(input);
  if (adapted.status !== 'already-v2') return { ok: false, errors: adapted.status === 'invalid'
    ? adapted.errors.map(error => ({ ...error, code: 'INVALID_DOCUMENT' }))
    : [{ code: 'INVALID_DOCUMENT', path: [], message: 'Expected a structurally valid finite JSON v2 document' }] };
  const document = adapted.document;
  const contract = validateQuantityRequest(document, requested);
  if (!contract.ok) return contract;
  const readiness = evaluateQuantityReadiness(document, contract.request);
  if (!readiness.ok) return { ok: false, errors: readiness.errors };
  const records = readiness.outputs.map(item => calculateRecord(document, contract.request, item))
    .sort((a, b) => compare(a.output, b.output) || compare(a.targetId, b.targetId));
  const outputs = Array.from(new Set(records.map(record => record.output))).sort(compare)
    .map(output => aggregate(output, records.filter(record => record.output === output)));
  const calculation: Calculation = {
    schemaVersion: RESULT_SCHEMA_VERSION, engineVersion: ENGINE_VERSION, policyVersion: QUANTITY_POLICY_VERSION,
    source: { documentId: document.id, revisionId: document.revisionId,
      revisionState: document.revisionId === null ? 'unsaved' : 'identified' },
    request: contract.request,
    status: !records.length ? 'empty' : outputs.some(output => output.status === 'blocked') ? 'blocked'
      : outputs.some(output => output.status === 'provisional') ? 'provisional' : 'complete',
    records, outputs,
  };
  const validated = calculationSchema.safeParse(calculation);
  if (!validated.success) return { ok: false, errors: validated.error.issues.map(issue => ({
    code: 'INVALID_CALCULATION_RESULT', path: issue.path, message: issue.message,
  })) };
  return { ok: true, calculation: ownFrozen(calculation) };
}

function calculateRecord(document: PhysicalDocument, request: QuantityRequest, readiness: OutputReadiness): QuantityRecord {
  const targetId = targetFor(readiness), output = readiness.output;
  const refs = Array.from(new Map([...readiness.numericBasis.dependencies, ...readiness.confirmation.dependencies]
    .map(ref => [refKey(ref), ref])).values()).sort((a, b) => compare(refKey(a), refKey(b)));
  const evidence = refs.map(ref => ({ ref, measurement: measurementAt(document, ref) }));
  const trace: QuantityTrace = { formula: '', basis: evidence.flatMap(item => item.measurement.state === 'known'
    ? [{ ref: item.ref, valueMm: item.measurement.valueMm }] : []),
    contributions: [], boundaryAdjustment: 0, overlapAdjustment: 0, roundoffAdjustment: 0, adjustments: [] };
  const errors = blockedReasons(readiness).map(error => ({ ...error, id: targetId }));
  const record: QuantityRecord = { targetId, output, unit: unitFor(output),
    status: errors.length ? 'blocked' : readiness.confirmation.status === 'provisional' ? 'provisional' : 'complete',
    readiness, evidence, amounts: null, trace, errors, inventory: null };
  if (errors.length) { trace.formula = 'Unavailable: see independent readiness and measurement evidence'; return record; }
  const value = (ref: MeasurementRef) => {
    const measurement = measurementAt(document, ref);
    if (measurement.state !== 'known') throw new ArithmeticFailure({
      code: 'UNRESOLVED_MEASUREMENT', path: [], id: ref.id, message: 'Required measurement is not known' });
    return checked(measurement.valueMm, ref.entity + ' ' + ref.field);
  };
  try {
    // Guard every consumed physical dimension, including fit/confirmation evidence.
    for (const item of evidence) if (item.measurement.state === 'known') checked(item.measurement.valueMm, 'measurement basis');
    // Readiness determines which fits matter. Validate representation of those
    // extents even for casing, which otherwise only uses width/height arithmetic.
    for (const check of readiness.geometry.checks) {
      if (!['HORIZONTAL_FIT', 'VERTICAL_FIT', 'OPENING_OVERLAP', 'FLOOR_RUN_OVERLAP'].includes(check.code)) continue;
      for (const id of check.openingIds) {
        const opening = document.openings.find(opening => opening.id === id)!;
        if (check.code !== 'VERTICAL_FIT') {
          for (const attachment of opening.attachments.filter(attachment => check.wallFaceIds.includes(attachment.wallFaceId))) {
            interval(attachment.offsetMm, value({ entity: 'opening', id, field: 'width' }));
          }
        }
        if (check.code === 'VERTICAL_FIT' || check.code === 'OPENING_OVERLAP') {
          elevatedInterval(value({ entity: 'opening', id, field: 'sillHeight' }),
            value({ entity: 'opening', id, field: 'height' }));
        }
      }
    }
    if (output === 'opening-inventory') {
      const counts = emptyCounts();
      for (const id of readiness.openingIds.slice().sort(compare)) {
        const opening = document.openings.find(opening => opening.id === id)!;
        counts[opening.kind] = add(counts[opening.kind], 1);
      }
      record.inventory = counts;
      trace.formula = 'Count distinct explicitly selected physical opening IDs by kind';
      record.amounts = amounts(sum(Object.values(counts)), 0, 0, null);
      return record;
    }
    const room = document.rooms.find(room => room.id === readiness.roomIds[0])!;
    if (output === 'floor-area' || output === 'ceiling-area') {
      trace.formula = 'room.length * room.width; no opening deductions; net * wasteFraction once';
      record.amounts = amounts(multiply(value({ entity: 'room', id: room.id, field: 'length' }),
        value({ entity: 'room', id: room.id, field: 'width' })), 0, 0, readiness.wasteFraction);
      return record;
    }
    const wallFaceId = readiness.wallFaceIds[0], wall = wallIndex(document).get(wallFaceId)!;
    if (output === 'door-casing' || output === 'window-casing') {
      const opening = document.openings.find(opening => opening.id === readiness.openingIds[0])!;
      const width = value({ entity: 'opening', id: opening.id, field: 'width' });
      const height = value({ entity: 'opening', id: opening.id, field: 'height' });
      trace.formula = output === 'door-casing' ? '2 * opening.height + opening.width per selected face'
        : '2 * opening.height + 2 * opening.width per selected face';
      record.amounts = amounts(add(multiply(2, height), multiply(output === 'door-casing' ? 1 : 2, width)), 0, 0, readiness.wasteFraction);
      return record;
    }
    const length = value({ entity: 'room', id: room.id, field: wall.axis });
    const isArea = output === 'gross-wall-area' || output === 'net-wall-area';
    const height = isArea ? value({ entity: 'room', id: room.id, field: 'ceilingHeight' }) : 0;
    const gross = isArea ? multiply(length, height) : length;
    const attached = document.openings.filter(opening => opening.attachments.some(attachment => attachment.wallFaceId === wallFaceId))
      .sort((a, b) => compare(a.id, b.id));
    const deductible = output === 'gross-wall-area' ? [] : output === 'net-wall-area' ? attached
      : output === 'crown' ? attached.filter(opening => request.policy.crownFullHeightGaps.some(gap =>
        gap.wallFaceId === wallFaceId && gap.openingId === opening.id))
      : attached.filter(opening => opening.sillHeight.state === 'known' && atFloor(opening.sillHeight.valueMm));
    const intervals: Interval[] = [], rectangles: Rectangle[] = [];
    for (const opening of deductible) {
      const width = value({ entity: 'opening', id: opening.id, field: 'width' });
      const rawX = interval(opening.attachments.find(attachment => attachment.wallFaceId === wallFaceId)!.offsetMm, width);
      const clippedX = intersect(rawX, length);
      let raw = width, rawCoverage = span(rawX), clipped = span(clippedX);
      let rawY: Interval | null = null, clippedY: Interval | null = null;
      if (isArea) {
        const openingHeight = value({ entity: 'opening', id: opening.id, field: 'height' });
        const sill = value({ entity: 'opening', id: opening.id, field: 'sillHeight' });
        rawY = elevatedInterval(sill, openingHeight);
        clippedY = intersect(rawY, height);
        raw = multiply(width, openingHeight);
        rawCoverage = multiply(span(rawX), span(rawY));
        clipped = multiply(span(clippedX), span(clippedY));
        rectangles.push({ x: clippedX, y: clippedY });
      } else intervals.push(clippedX);
      // True clipping is measured between coordinate bounds. The difference
      // between measured dimensions and their represented bounds is separate.
      const boundaryAdjustment = nonnegative(subtract(rawCoverage, clipped), 'boundary adjustment');
      const roundoffAdjustment = subtract(raw, rawCoverage);
      trace.contributions.push({ openingId: opening.id, wallFaceId, raw, effectiveBeforeUnion: clipped,
        boundaryAdjustment, roundoffAdjustment,
        rawBounds: { x: rawX, y: rawY }, effectiveBounds: { x: clippedX, y: clippedY } });
      if (roundoffAdjustment !== 0) trace.adjustments.push({ code: 'FLOATING_POINT_ROUNDOFF',
        amount: Math.abs(roundoffAdjustment), unit: isArea ? 'mm2' : 'mm',
        message: 'Measured dimensions and represented coordinate bounds differ within the explicit extent precision budget' });
    }
    const rawDeductions = sum(trace.contributions.map(item => item.raw));
    const clippedSum = sum(trace.contributions.map(item => item.effectiveBeforeUnion));
    const unit = isArea ? 'mm2' as const : 'mm' as const;
    const observedRoundoffBudget = sum(trace.contributions.map(item => Math.abs(item.roundoffAdjustment)));
    const covered = limited(isArea ? unionArea(rectangles) : unionLength(intervals), clippedSum, trace, 'deduction union', unit);
    let effective = limited(covered, rawDeductions, trace, 'measured deduction bound', unit, observedRoundoffBudget);
    effective = limited(effective, gross, trace, 'deduction coverage', unit, observedRoundoffBudget);
    trace.boundaryAdjustment = sum(trace.contributions.map(item => item.boundaryAdjustment));
    trace.overlapAdjustment = nonnegative(subtract(clippedSum, covered), 'combined union adjustment');
    // Signed residual reconciles raw - boundary - overlap - roundoff = effective.
    // Positive is representational loss; negative is representational gain.
    trace.roundoffAdjustment = subtract(subtract(subtract(rawDeductions, trace.boundaryAdjustment),
      trace.overlapAdjustment), effective);
    if (trace.boundaryAdjustment > 0) trace.adjustments.push({ code: 'BOUNDARY_INTERSECTION', amount: trace.boundaryAdjustment, unit,
      message: 'Raw coordinate coverage intersected with the measured face/run; original dimensions and offsets remain unchanged' });
    if (trace.overlapAdjustment > 0) trace.adjustments.push({ code: 'COVERAGE_UNION', amount: trace.overlapAdjustment, unit,
      message: 'Effective union counts actual shared coverage once; separate positive gaps are never bridged by tolerance' });
    trace.formula = isArea ? 'wall.length * wall.height minus union of intersected eligible opening rectangles'
      : output === 'crown' ? 'wall.length minus union of explicitly selected full-height gap intervals'
      : 'wall.length minus union of eligible zero-sill opening intervals';
    record.amounts = amounts(gross, rawDeductions, effective, readiness.wasteFraction);
  } catch (error) {
    record.status = 'blocked'; record.amounts = null; record.inventory = null;
    record.errors.push(failure(error, targetId));
  }
  return record;
}

function aggregate(output: QuantityOutput, records: QuantityRecord[]): QuantityAggregate {
  const included = records.filter(record => record.amounts !== null), excluded = records.filter(record => record.amounts === null);
  const result: QuantityAggregate = {
    output, unit: unitFor(output), status: excluded.length ? 'blocked'
      : included.some(record => record.status === 'provisional') ? 'provisional' : 'complete',
    completeness: !included.length ? 'none' : excluded.length ? 'partial' : 'complete',
    subtotalStatus: 'unavailable',
    total: null, subtotal: null,
    includedTargetIds: included.map(record => record.targetId), excludedTargetIds: excluded.map(record => record.targetId),
    inventory: null, errors: excluded.flatMap(record => record.errors),
  };
  if (!included.length) return result;
  try {
    const rows = included.map(record => record.amounts!);
    const combined: Amounts = {
      gross: sum(rows.map(row => row.gross)), rawDeductions: sum(rows.map(row => row.rawDeductions)),
      effectiveDeductions: sum(rows.map(row => row.effectiveDeductions)), net: sum(rows.map(row => row.net)),
      wasteFraction: rows[0].wasteFraction, allowance: sum(rows.map(row => row.allowance)), adjusted: sum(rows.map(row => row.adjusted)),
    };
    // Sum existing allowance/adjusted rows; do not apply waste again.
    result.subtotal = combined;
    result.subtotalStatus = included.some(record => record.status === 'provisional') ? 'provisional' : 'complete';
    if (!excluded.length) result.total = combined;
    if (output === 'opening-inventory') {
      const counts = emptyCounts();
      for (const record of included) for (const kind of ['door', 'window', 'floor-level-opening'] as const) {
        counts[kind] = add(counts[kind], record.inventory![kind]);
      }
      result.inventory = counts;
    }
  } catch (error) {
    // Rows remain inspectable, but a failed aggregate is not a usable selected total/subtotal.
    result.status = 'blocked'; result.completeness = 'none'; result.subtotalStatus = 'unavailable'; result.total = null; result.subtotal = null;
    result.inventory = null; result.errors.push(failure(error, output));
  }
  return result;
}
