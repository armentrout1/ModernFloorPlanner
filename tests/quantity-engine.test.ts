import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateQuantities } from '../shared/quantities/engine';
import { calculationSchema } from '../shared/quantities/result';
import { validateGeometry, type QuantityOutput } from '../shared/domain/geometryValidation';
import type { PhysicalDocument } from '../shared/domain/document';
import { unknownMeasurement } from '../shared/domain/measurements';
import { toMm } from '../shared/domain/units';
import { adaptMeasurementDocument } from '../shared/compatibility/legacyDocument';
import { q001, room, measured, request, allSelections, freezeDeep } from './fixtures/physical';

const FT = 304.8, FT2 = 92903.04;
const close = (actual: number, expected: number, tolerance = 1e-7) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, actual + ' != ' + expected);
function calculate(document = q001(), selected = request(allSelections(document))) {
  const result = calculateQuantities(document, selected);
  assert.ok(result.ok, JSON.stringify(result));
  assert.ok(calculationSchema.safeParse(result.calculation).success);
  return result.calculation;
}
function output(calculation: ReturnType<typeof calculate>, name: QuantityOutput) {
  const item = calculation.outputs.find(item => item.output === name);
  assert.ok(item, name);
  return item;
}
function topRequest(output: 'net-wall-area' | 'baseboard' | 'base-shoe' | 'crown', wasteFraction = 0) {
  return request([{ output, wallFaceIds: ['room-1:top'], wasteFraction }]);
}
function withoutOpenings() { const doc = q001(); doc.openings = []; return doc; }

test('M2C Q-001: independent known answers for all ten outputs, selected top face and waste', () => {
  const result = calculate();
  assert.equal(result.status, 'complete');
  assert.deepEqual(result.source, { documentId: 'q-001', revisionId: null, revisionState: 'unsaved' });
  const expected: [QuantityOutput, number, number][] = [
    ['floor-area', 120, FT2], ['ceiling-area', 120, FT2],
    ['gross-wall-area', 352, FT2], ['net-wall-area', 319, FT2],
    ['baseboard', 41, FT], ['base-shoe', 41, FT], ['crown', 44, FT],
    ['door-casing', 17, FT], ['window-casing', 14, FT],
  ];
  for (const [name, net, factor] of expected) {
    const item = output(result, name);
    assert.equal(item.status, 'complete'); assert.equal(item.completeness, 'complete');
    assert.ok(item.total); close(item.total.net / factor, net);
  }
  close(output(result, 'net-wall-area').total!.rawDeductions / FT2, 33);
  close(output(result, 'net-wall-area').total!.gross / FT2, 352);
  close(output(result, 'baseboard').total!.gross / FT, 44);
  close(output(result, 'floor-area').total!.adjusted / FT2, 132);
  close(output(result, 'floor-area').total!.allowance / FT2, 12);
  assert.deepEqual(output(result, 'opening-inventory').inventory, { door: 1, window: 1, 'floor-level-opening': 0 });
  assert.equal(output(result, 'opening-inventory').total!.net, 2);
  const top = result.records.find(record => record.output === 'net-wall-area' && record.readiness.wallFaceIds[0] === 'room-1:top')!;
  close(top.amounts!.gross / FT2, 96); close(top.amounts!.net / FT2, 63);
  close(top.trace.contributions.find(item => item.openingId === 'door')!.raw / FT2, 21);
  close(top.trace.contributions.find(item => item.openingId === 'window')!.raw / FT2, 12);
  close(output(calculate(q001(), topRequest('baseboard')), 'baseboard').total!.net / FT, 9);
});

test('M2C net walls independently derive gross basis without a separate gross output selection', () => {
  const result = calculate(q001(), topRequest('net-wall-area'));
  assert.equal(result.outputs.length, 1);
  close(result.outputs[0].total!.gross / FT2, 96);
  close(result.outputs[0].total!.net / FT2, 63);
});

test('M2C missing window height preserves floor/gross and labels the 256 sq ft partial net subtotal', () => {
  const doc = q001(); doc.openings[1].height = unknownMeasurement('Not measured');
  const result = calculate(doc);
  assert.equal(result.status, 'blocked');
  close(output(result, 'floor-area').total!.net / FT2, 120);
  close(output(result, 'gross-wall-area').total!.net / FT2, 352);
  const walls = output(result, 'net-wall-area');
  assert.equal(walls.status, 'blocked'); assert.equal(walls.total, null);
  assert.equal(walls.completeness, 'partial'); close(walls.subtotal!.net / FT2, 256);
  assert.deepEqual(walls.excludedTargetIds, ['wall:"room-1:top"']);
  assert.equal(walls.includedTargetIds.length, 3);
  assert.ok(result.records.find(record => record.output === 'net-wall-area' && record.status === 'blocked')!.readiness.geometry.findings.length);
  // Floor trim classification does not need elevated window height.
  close(output(result, 'baseboard').total!.net / FT, 41);
});

test('M2C known unconfirmed dimensions produce provisional numbers, never confirmed results', () => {
  const doc = q001(); doc.rooms[0].length = measured('12 ft', false);
  const result = calculate(doc);
  assert.equal(result.status, 'provisional');
  assert.equal(output(result, 'floor-area').status, 'provisional');
  close(output(result, 'floor-area').total!.net / FT2, 120);
  assert.equal(output(result, 'opening-inventory').status, 'complete');
});

test('M2C known measurements marked needs-review remain blocked rather than provisional', () => {
  const doc = q001(), length = doc.rooms[0].length;
  assert.equal(length.state, 'known');
  if (length.state === 'known') length.provenance.confirmation = { status: 'needs-review' };
  const result = calculate(doc, request([{ output: 'floor-area', roomIds: ['room-1'], wasteFraction: 0 }]));
  assert.equal(result.status, 'blocked'); assert.equal(result.records[0].amounts, null);
  assert.ok(result.records[0].errors.some(error => error.code === 'UNRESOLVED_CONFIRMATION'));
});

test('M2C unresolved/conflicting widths block relevant quantities but preserve unrelated floor work', () => {
  const doc = q001(), opening = doc.openings[0], first = measured('32 in'), second = measured('36 in');
  opening.width = { state: 'needs-review', valueMm: null, reason: 'Conflict', candidates: [
    { label: 'entered', valueMm: first.valueMm, provenance: first.provenance },
    { label: 'saved', valueMm: second.valueMm, provenance: second.provenance },
  ] };
  const result = calculate(doc);
  assert.equal(output(result, 'net-wall-area').total, null);
  close(output(result, 'floor-area').total!.net / FT2, 120);
  const blocked = result.records.find(record => record.output === 'baseboard' && record.status === 'blocked')!;
  assert.equal(blocked.evidence.find(item => item.ref.id === 'door' && item.ref.field === 'width')!.measurement.state, 'needs-review');
});

test('M2C no openings and elevated windows preserve gross perimeter floor runs', () => {
  const empty = calculate(withoutOpenings());
  close(output(empty, 'net-wall-area').total!.net / FT2, 352);
  close(output(empty, 'baseboard').total!.net / FT, 44);
  assert.equal(empty.outputs.some(item => item.output === 'opening-inventory'), false);
  const doc = q001(); doc.openings = [doc.openings[1]];
  close(output(calculate(doc), 'baseboard').total!.net / FT, 44);
});

test('M2C multiple separated zero-sill doors deduct each actual interruption once', () => {
  const doc = q001(); doc.openings = [doc.openings[0]];
  doc.openings.push({ ...structuredClone(doc.openings[0]), id: 'door-2',
    attachments: [{ wallFaceId: 'room-1:top', anchor: 'center', offsetMm: toMm(8, 'ft') }] });
  const result = calculate(doc, topRequest('baseboard'));
  close(result.outputs[0].total!.net / FT, 6);
  close(result.outputs[0].total!.rawDeductions / FT, 6);
  assert.equal(result.records[0].trace.contributions.length, 2);
});

test('M2C precise 32-inch door and fractional/metric equivalents retain physical quantities', () => {
  const quantities: number[] = [];
  for (const dimension of ['32 in', '2 ft 8 in', '812.8 mm', '81.28 cm', '0.8128 m']) {
    const doc = q001(); doc.openings[0].width = measured(dimension);
    const result = calculate(doc, topRequest('baseboard'));
    close(result.outputs[0].total!.rawDeductions, 812.8);
    close(result.outputs[0].total!.net, 3657.6 - 812.8);
    quantities.push(result.outputs[0].total!.net);
  }
  quantities.forEach(value => close(value, quantities[0]));
  const precise = q001(); precise.openings[0].width = measured('32 1/8 in');
  close(output(calculate(precise, topRequest('baseboard')), 'baseboard').total!.rawDeductions, 816 - .025);
});

test('M2C shared physical door inventory once, deductions and casing per explicitly selected attachment', () => {
  const doc = q001(); doc.openings = [doc.openings[0]]; doc.rooms.push(room('room-2'));
  doc.openings[0].attachments.push({ wallFaceId: 'room-2:bottom', anchor: 'center', offsetMm: toMm(6, 'ft') });
  const result = calculate(doc, request([
    { output: 'opening-inventory', openingIds: ['door'] },
    { output: 'net-wall-area', wallFaceIds: ['room-1:top', 'room-2:bottom'], wasteFraction: 0 },
    { output: 'door-casing', faces: [{ wallFaceId: 'room-1:top', openingId: 'door' }, { wallFaceId: 'room-2:bottom', openingId: 'door' }], wasteFraction: 0 },
  ]));
  assert.equal(output(result, 'opening-inventory').total!.net, 1);
  close(output(result, 'net-wall-area').total!.rawDeductions / FT2, 42);
  close(output(result, 'door-casing').total!.net / FT, 34);
  assert.equal(result.records.filter(record => record.output === 'door-casing').length, 2);
});

test('M2C crown deducts explicit full-height gaps and leaves ordinary openings intact', () => {
  const ordinary = calculate(q001(), topRequest('crown'));
  close(ordinary.outputs[0].total!.net / FT, 12);
  const doc = q001(); doc.openings = [doc.openings[0]];
  doc.openings[0].kind = 'floor-level-opening'; doc.openings[0].height = measured('8 ft');
  const selected = topRequest('crown');
  selected.policy.crownFullHeightGaps = [{ wallFaceId: 'room-1:top', openingId: 'door' }];
  close(calculate(doc, selected).outputs[0].total!.net / FT, 9);
  doc.openings[0].height = measured('7 ft');
  const blocked = calculate(doc, selected);
  assert.equal(blocked.outputs[0].total, null);
  assert.ok(blocked.records[0].readiness.geometry.findings.some(item => item.code === 'CROWN_GAP_FULL_HEIGHT'));
});

test('M2C explicit basis mismatch blocks opening-derived work without rewriting measurements', () => {
  const doc = q001(), selected = topRequest('net-wall-area');
  selected.policy.openingMeasureBasis = 'rough';
  const before = JSON.stringify(doc), result = calculate(doc, selected);
  assert.equal(result.outputs[0].total, null);
  assert.ok(result.records[0].readiness.numericBasis.findings.some(item => item.code === 'OPENING_BASIS_MISMATCH'));
  assert.equal(JSON.stringify(doc), before);
});

test('M2C invalid and duplicate selections are contract errors; empty selections select nothing', () => {
  for (const ids of [['missing'], ['room-1', 'room-1']]) {
    const result = calculateQuantities(q001(), request([{ output: 'floor-area', roomIds: ids, wasteFraction: 0 }]));
    assert.equal(result.ok, false);
  }
  const empty = calculate(q001(), request([{ output: 'floor-area', roomIds: [], wasteFraction: 0 }]));
  assert.equal(empty.status, 'empty'); assert.deepEqual(empty.records, []); assert.deepEqual(empty.outputs, []);
  const malformed = calculateQuantities(q001(), { ...topRequest('baseboard'), callerTotals: { net: 0 } });
  assert.equal(malformed.ok, false);
  assert.equal(calculateQuantities(q001(), { policy: { version: 'next' }, selections: [] }).ok, false);
});

test('M2C invalid relevant geometry stays unavailable and unrelated floor work remains usable', () => {
  const doc = q001(); doc.openings[0].attachments[0].offsetMm = toMm(0, 'mm');
  const result = calculate(doc);
  assert.equal(output(result, 'net-wall-area').total, null);
  assert.equal(output(result, 'baseboard').total, null);
  assert.ok(result.records.find(record => record.output === 'baseboard' && record.status === 'blocked')!.errors.some(error => error.code === 'GEOMETRY_INVALID'));
  close(output(result, 'floor-area').total!.net / FT2, 120);
});

test('M2C accepted boundary tolerance intersects effective deductions without changing raw dimensions', () => {
  const doc = q001(); doc.openings = [doc.openings[0]];
  doc.rooms[0].length = measured('1000 mm'); doc.rooms[0].width = measured('1000 mm'); doc.rooms[0].ceilingHeight = measured('1000 mm');
  doc.openings[0].width = measured('1000.01 mm'); doc.openings[0].height = measured('1000.005 mm');
  doc.openings[0].attachments[0].offsetMm = toMm(500, 'mm');
  const before = JSON.stringify(doc);
  const result = calculate(doc, request([
    { output: 'net-wall-area', wallFaceIds: ['room-1:top'], wasteFraction: 0 },
    { output: 'baseboard', wallFaceIds: ['room-1:top'], wasteFraction: 0 },
  ]));
  const trim = output(result, 'baseboard').total!;
  assert.equal(trim.gross, 1000); assert.equal(trim.effectiveDeductions, 1000); assert.equal(trim.net, 0);
  close(trim.rawDeductions, 1000.01);
  const walls = output(result, 'net-wall-area').total!;
  assert.equal(walls.effectiveDeductions, 1_000_000); assert.equal(walls.net, 0);
  assert.ok(walls.rawDeductions > walls.effectiveDeductions);
  assert.ok(result.records.every(record => record.trace.adjustments.some(item => item.code === 'BOUNDARY_INTERSECTION')));
  assert.equal(JSON.stringify(doc), before);
  doc.openings[0].width = measured('1000.04 mm');
  assert.equal(output(calculate(doc, topRequest('baseboard')), 'baseboard').total, null);
});

test('M2C accepted overlap is unioned once in trim and wall rectangles; positive tiny gaps remain gaps', () => {
  const doc = q001(); doc.rooms[0].length = measured('1000 mm'); doc.rooms[0].ceilingHeight = measured('1000 mm');
  doc.openings = [doc.openings[0]]; doc.openings[0].width = measured('500.005 mm');
  doc.openings[0].height = measured('1000 mm'); doc.openings[0].attachments[0].offsetMm = toMm(250.0025, 'mm');
  doc.openings.push({ ...structuredClone(doc.openings[0]), id: 'door-2', width: measured('500 mm'),
    attachments: [{ wallFaceId: 'room-1:top', anchor: 'center', offsetMm: toMm(750, 'mm') }] });
  const result = calculate(doc, request([
    { output: 'baseboard', wallFaceIds: ['room-1:top'], wasteFraction: 0 },
    { output: 'net-wall-area', wallFaceIds: ['room-1:top'], wasteFraction: 0 },
  ]));
  assert.equal(output(result, 'baseboard').total!.net, 0); assert.equal(output(result, 'net-wall-area').total!.net, 0);
  close(result.records.find(record => record.output === 'baseboard')!.trace.overlapAdjustment, .005);
  close(result.records.find(record => record.output === 'net-wall-area')!.trace.overlapAdjustment, 5);
  doc.openings[0].width = measured('499.995 mm'); doc.openings[0].attachments[0].offsetMm = toMm(249.9975, 'mm');
  close(calculate(doc, topRequest('baseboard')).outputs[0].total!.net, .005);
});

test('M2C stacked rectangles with a positive vertical gap deduct separate areas without bridging the gap', () => {
  const doc = q001(); doc.rooms[0].length = measured('1000 mm'); doc.rooms[0].ceilingHeight = measured('1000 mm');
  doc.openings = [doc.openings[0]]; const first = doc.openings[0];
  first.kind = 'window'; first.width = measured('100 mm'); first.height = measured('499.995 mm');
  first.attachments[0].offsetMm = toMm(500, 'mm');
  doc.openings.push({ ...structuredClone(first), id: 'window-2', height: measured('500 mm'), sillHeight: measured('500 mm', true, 'elevation') });
  const total = calculate(doc, topRequest('net-wall-area')).outputs[0].total!;
  close(total.effectiveDeductions, 99_999.5); close(total.net, 900_000.5);
});

test('M2C finite oversized dimensions, product overflow, underflow and waste overflow have structured errors', () => {
  for (const [length, width, waste] of [
    [1e16, 1, 0], [1e9, 1e9, 0], [1e-200, 1e-200, 0], [100, 100, 1e308],
  ]) {
    const doc = withoutOpenings(); doc.rooms[0].length = { ...measured('1 mm'), valueMm: toMm(length, 'mm') };
    doc.rooms[0].width = { ...measured('1 mm'), valueMm: toMm(width, 'mm') };
    const result = calculate(doc, request([{ output: 'floor-area', roomIds: ['room-1'], wasteFraction: waste }]));
    assert.equal(result.records[0].status, 'blocked'); assert.equal(result.records[0].amounts, null);
    assert.ok(result.records[0].errors.some(error => error.code.startsWith('ARITHMETIC_')));
    assert.equal(result.outputs[0].total, null);
    assert.ok(!JSON.stringify(result).includes('Infinity'));
  }
});

test('M2C aggregate addition overflow leaves individual rows inspectable without a selected total', () => {
  const doc = withoutOpenings(); doc.rooms.push(room('room-2'));
  for (const room of doc.rooms) { room.length = measured('90000000 mm'); room.width = measured('90000000 mm'); }
  const result = calculate(doc, request([{ output: 'floor-area', roomIds: ['room-1', 'room-2'], wasteFraction: 0 }]));
  assert.ok(result.records.every(record => record.amounts !== null));
  assert.equal(result.outputs[0].total, null); assert.equal(result.outputs[0].subtotal, null);
  assert.equal(result.outputs[0].completeness, 'none');
  assert.ok(result.outputs[0].errors.some(error => error.code === 'ARITHMETIC_RANGE'));
});

test('M2C multi-room allowance and adjusted aggregate sum rows without a second waste application', () => {
  const doc = withoutOpenings(); doc.rooms.push(room('room-2'));
  const result = calculate(doc, request([{ output: 'floor-area', roomIds: ['room-2', 'room-1'], wasteFraction: .1 }]));
  close(result.outputs[0].total!.net / FT2, 240); close(result.outputs[0].total!.allowance / FT2, 24);
  close(result.outputs[0].total!.adjusted / FT2, 264);
  assert.equal(result.outputs[0].total!.adjusted, result.records.reduce((sum, record) => sum + record.amounts!.adjusted, 0));
});

test('M2C frozen source remains unchanged; owned results and evidence are deeply detached and frozen', () => {
  const doc = q001(), selected = request(allSelections(doc)), original = JSON.stringify(doc);
  const result = calculate(freezeDeep(doc), freezeDeep(selected)), saved = JSON.stringify(result);
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(result.records[0].readiness));
  assert.ok(Object.isFrozen(result.records[0].evidence[0].measurement));
  assert.throws(() => { (result.records[0].evidence[0].measurement as any).state = 'unknown'; }, TypeError);
  assert.equal(JSON.stringify(doc), original);
  const mutable = q001(), earlier = calculate(mutable); mutable.rooms[0].length = measured('20 ft');
  calculate(mutable);
  close(output(earlier, 'floor-area').total!.net / FT2, 120);
  assert.equal(JSON.stringify(result), saved);
});

test('M2C viewport/metadata changes do not affect quantities or introduce presentation in results', () => {
  const doc = q001(), first = calculate(doc);
  doc.metadata.viewport = { zoom: 200, panX: -100 };
  doc.rooms[0].presentation = { xMm: toMm(1e6, 'mm'), yMm: toMm(-1e6, 'mm'), color: 'red' };
  const second = calculate(doc);
  assert.deepEqual(second, first);
});

test('M2C explicit legacy adaptation preserves JSON and idempotency without implicit calculation migration', () => {
  const legacy = { id: 9, custom: { preserved: true }, rooms: [{ id: 'old', width: 240, height: 200, x: 1, y: 2,
    objects: [{ id: 'door-old', type: 'door', wallSide: 'top', position: 50, size: 60 }] }] };
  assert.equal(calculateQuantities(legacy, request([])).ok, false);
  const converted = adaptMeasurementDocument(legacy); assert.ok('document' in converted);
  const before = JSON.stringify(converted.document);
  const result = calculate(converted.document, request([{ output: 'floor-area', roomIds: ['old'], wasteFraction: 0 }]));
  assert.equal(result.status, 'provisional'); close(result.outputs[0].total!.net / FT2, 120);
  assert.deepEqual(converted.document.compatibility!.original, legacy);
  assert.equal(JSON.stringify(converted.document), before);
  const again = adaptMeasurementDocument(converted.document); assert.ok('document' in again);
  assert.deepEqual(again.document, converted.document);
});

test('M2C malformed/cyclic/nonfinite v2 data returns a contract error, never a fabricated zero', () => {
  const cyclic = q001(); cyclic.metadata.self = cyclic;
  const nonfinite = q001(); nonfinite.metadata.invalid = Infinity;
  for (const value of [null, {}, cyclic, nonfinite, { ...q001(), rooms: [] }]) {
    const result = calculateQuantities(value, request([{ output: 'floor-area', roomIds: ['room-1'], wasteFraction: 0 }]));
    assert.equal(result.ok, false);
    if (!result.ok) assert.ok(result.errors.length);
  }
});

test('M2C deterministic properties: valid deductions bounded, waste monotone, sums reconcile, selection order irrelevant', () => {
  let seed = 1729;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let iteration = 0; iteration < 30; iteration++) {
    const doc = q001(); doc.openings = [doc.openings[0]]; doc.rooms.push(room('room-2'));
    const length = 3000 + Math.floor(random() * 8000) / 8, width = 2500 + Math.floor(random() * 8000) / 8,
      door = 500 + Math.floor(random() * 4000) / 8;
    doc.rooms[0].length = measured(length + ' mm'); doc.rooms[0].width = measured(width + ' mm');
    doc.openings[0].width = measured(door + ' mm'); doc.openings[0].attachments[0].offsetMm = toMm(length / 2, 'mm');
    const selected = request(allSelections(doc)), result = calculate(doc, selected);
    assert.equal(result.status, 'complete');
    for (const record of result.records) {
      assert.ok(record.amounts!.net <= record.amounts!.gross);
      assert.ok(record.amounts!.adjusted >= record.amounts!.net);
      assert.ok(record.amounts!.effectiveDeductions <= record.amounts!.rawDeductions + 1e-6);
    }
    for (const aggregate of result.outputs) {
      const rows = result.records.filter(record => record.output === aggregate.output);
      close(aggregate.total!.net, rows.reduce((sum, row) => sum + row.amounts!.net, 0));
      close(aggregate.total!.adjusted, rows.reduce((sum, row) => sum + row.amounts!.adjusted, 0));
    }
    const permuted = structuredClone(selected);
    permuted.selections.reverse();
    for (const item of permuted.selections) {
      if ('roomIds' in item) item.roomIds.reverse();
      else if ('wallFaceIds' in item) item.wallFaceIds.reverse();
      else if ('openingIds' in item) item.openingIds.reverse();
      else item.faces.reverse();
    }
    const reordered = calculate(doc, permuted);
    assert.deepEqual(reordered.outputs, result.outputs);
    assert.deepEqual(reordered.records.map(record => record.amounts), result.records.map(record => record.amounts));
    const metric = structuredClone(doc); metric.openings[0].width = measured((door / 10) + ' cm');
    close(output(calculate(metric, topRequest('baseboard')), 'baseboard').total!.net,
      output(calculate(doc, topRequest('baseboard')), 'baseboard').total!.net);
  }
});

test('M2C result schemas reject unit/status/extra-field tampering and nonfinite quantities', () => {
  const base = JSON.parse(JSON.stringify(calculate()));
  for (const mutate of [
    (value: any) => { value.records[0].unit = 'count'; },
    (value: any) => { value.records[0].status = 'blocked'; },
    (value: any) => { value.outputs[0].total.net = Infinity; },
    (value: any) => { value.source.revisionState = 'identified'; },
    (value: any) => { value.debugPage = true; },
    (value: any) => { value.outputs[0].unit = 'count'; },
    (value: any) => { value.records.push(value.records[0]); },
    (value: any) => { value.outputs.push(value.outputs[0]); },
    (value: any) => { value.outputs[0].subtotal.adjusted += 10; },
    (value: any) => { const row = value.records.find((row: any) => row.output === 'opening-inventory'); row.amounts.wasteFraction = .1; },
    (value: any) => { const row = value.records.find((row: any) => row.output === 'opening-inventory'); row.amounts.net = 1.5; },
  ]) {
    const changed = structuredClone(base); mutate(changed);
    assert.equal(calculationSchema.safeParse(changed).success, false);
  }
});

test('M2C direct engine rejects accessors and sparse request arrays without invoking getters', () => {
  let calls = 0;
  const doc = q001();
  Object.defineProperty(doc, 'schemaVersion', { get() { calls++; return 2; }, enumerable: true });
  assert.equal(calculateQuantities(doc, request([])).ok, false);
  assert.equal(calls, 0);
  const selected = request([]); selected.selections.length = 1;
  assert.equal(calculateQuantities(q001(), selected).ok, false);
});

test('M2C partial subtotal explicitly retains provisional included measurements', () => {
  const doc = q001();
  doc.openings[1].height = unknownMeasurement('Not measured');
  doc.rooms[0].length = measured('12 ft', false);
  const result = calculate(doc), aggregate = output(result, 'net-wall-area');
  assert.equal(aggregate.status, 'blocked'); assert.equal(aggregate.total, null);
  assert.equal(aggregate.completeness, 'partial'); assert.equal(aggregate.subtotalStatus, 'provisional');
  close(aggregate.subtotal!.net / FT2, 256);
});

test('M2C materially shortened spans at large offsets or elevations block trim, wall and casing quantities', () => {
  for (const orientation of ['horizontal', 'vertical']) {
    const doc = q001(); doc.openings = [doc.openings[0]];
    const opening = doc.openings[0];
    if (orientation === 'horizontal') {
      doc.rooms[0].length = { ...measured('1 mm'), valueMm: toMm(1e15 + 100, 'mm') };
      opening.width = measured('0.3 mm');
      opening.attachments[0].offsetMm = toMm(1e15, 'mm');
    } else {
      doc.rooms[0].ceilingHeight = { ...measured('1 mm'), valueMm: toMm(1e15 + 100, 'mm') };
      opening.height = measured('0.3 mm');
      opening.sillHeight = { ...measured('0 mm', true, 'elevation'), valueMm: toMm(1e15, 'mm') };
    }
    const casing = calculate(doc, request([{ output: 'door-casing',
      faces: [{ wallFaceId: 'room-1:top', openingId: 'door' }], wasteFraction: 0 }]));
    assert.equal(casing.records[0].amounts, null);
    assert.ok(casing.records[0].errors.some(error => error.code === 'ARITHMETIC_PRECISION_LOSS'));
    if (orientation === 'horizontal') {
      const trim = calculate(doc, topRequest('baseboard'));
      assert.equal(trim.records[0].amounts, null);
      assert.ok(trim.records[0].errors.some(error => error.code === 'ARITHMETIC_PRECISION_LOSS'));
    }
  }
});

test('M2C ordinary narrow in-bounds openings retain quantities and label roundoff without invented boundary clipping', () => {
  for (const width of ['0.3 mm', '0.2 mm']) {
    const doc = q001(); doc.openings = [doc.openings[0]];
    doc.openings[0].width = measured(width);
    doc.openings[0].attachments[0].offsetMm = toMm(1000, 'mm');
    const result = calculate(doc, request([
      { output: 'baseboard', wallFaceIds: ['room-1:top'], wasteFraction: 0 },
      { output: 'net-wall-area', wallFaceIds: ['room-1:top'], wasteFraction: 0 },
    ]));
    assert.equal(result.status, 'complete');
    for (const record of result.records) {
      assert.ok(record.amounts);
      assert.equal(record.trace.boundaryAdjustment, 0);
      assert.equal(record.trace.contributions[0].boundaryAdjustment, 0);
      assert.ok(record.trace.adjustments.some(item => item.code === 'FLOATING_POINT_ROUNDOFF'));
      assert.ok(!record.trace.adjustments.some(item => item.code === 'BOUNDARY_INTERSECTION'));
      assert.ok(record.trace.adjustments.every(item => item.unit === record.unit));
      const contribution = record.trace.contributions[0];
      close(contribution.raw - contribution.boundaryAdjustment - contribution.roundoffAdjustment, contribution.effectiveBeforeUnion);
      close(record.amounts.rawDeductions - record.trace.boundaryAdjustment - record.trace.overlapAdjustment
        - record.trace.roundoffAdjustment, record.amounts.effectiveDeductions);
    }
  }
});

test('M2C fully absorbed waste and aggregate contributions return arithmetic precision errors', () => {
  const doc = withoutOpenings();
  const waste = calculate(doc, request([{ output: 'floor-area', roomIds: ['room-1'], wasteFraction: 1e-30 }]));
  assert.equal(waste.records[0].amounts, null);
  assert.ok(waste.records[0].errors.some(error => error.code === 'ARITHMETIC_PRECISION_LOSS'));
  doc.rooms.push(room('room-2'));
  doc.rooms[1].length = measured('0.000001 mm'); doc.rooms[1].width = measured('0.000001 mm');
  const aggregate = calculate(doc, request([{ output: 'floor-area', roomIds: ['room-1', 'room-2'], wasteFraction: 0 }]));
  assert.ok(aggregate.records.every(record => record.amounts !== null));
  assert.equal(aggregate.outputs[0].total, null); assert.equal(aggregate.outputs[0].subtotalStatus, 'unavailable');
  assert.ok(aggregate.outputs[0].errors.some(error => error.code === 'ARITHMETIC_PRECISION_LOSS'));
});

test('M2C fully absorbed nonzero deductions are unavailable rather than silently omitted', () => {
  const doc = q001(); doc.openings = [doc.openings[0]];
  doc.rooms[0].length = { ...measured('1 mm'), valueMm: toMm(1e15, 'mm') };
  doc.openings[0].width = measured('0.000001 mm');
  doc.openings[0].attachments[0].offsetMm = toMm(.0000005, 'mm');
  const result = calculate(doc, topRequest('baseboard'));
  assert.equal(result.records[0].amounts, null);
  assert.ok(result.records[0].errors.some(error => error.code === 'ARITHMETIC_PRECISION_LOSS'));
});

test('M2C narrow M2B regression: large-coordinate exact spans do not inflate the 0.01mm overrun tolerance', () => {
  const doc = q001(); doc.openings = [doc.openings[0]];
  doc.rooms[0].length = { ...measured('1 mm'), valueMm: toMm(1e15, 'mm') };
  doc.openings[0].width = measured('1 mm');
  doc.openings[0].attachments[0].offsetMm = toMm(1e15, 'mm');
  const horizontal = validateGeometry(doc).checks.find(check => check.code === 'HORIZONTAL_FIT')!;
  assert.equal(horizontal.status, 'invalid');
  const result = calculate(doc, topRequest('baseboard'));
  assert.equal(result.records[0].amounts, null);
  assert.ok(result.records[0].errors.some(error => error.code === 'GEOMETRY_INVALID'));
});

test('M2C narrow M2B regression: large-coordinate exact spans do not inflate the floor overlap tolerance', () => {
  const doc = q001(); doc.openings = [doc.openings[0]];
  doc.rooms[0].length = { ...measured('1 mm'), valueMm: toMm(1e15 + 100, 'mm') };
  doc.openings[0].width = measured('1 mm');
  doc.openings[0].attachments[0].offsetMm = toMm(1e15, 'mm');
  doc.openings.push({ ...structuredClone(doc.openings[0]), id: 'door-2',
    attachments: [{ wallFaceId: 'room-1:top', anchor: 'center', offsetMm: toMm(1e15 + .5, 'mm') }] });
  const result = calculate(doc, topRequest('baseboard'));
  assert.equal(result.records[0].amounts, null);
  assert.ok(result.records[0].readiness.geometry.checks.some(check => check.code === 'FLOOR_RUN_OVERLAP' && check.status === 'invalid'));
});
