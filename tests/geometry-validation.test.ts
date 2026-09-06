import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateGeometry } from '../shared/domain/geometryValidation';
import { unknownMeasurement } from '../shared/domain/measurements';
import { toMm } from '../shared/domain/units';
import { adaptMeasurementDocument } from '../shared/compatibility/legacyDocument';
import { q001, measured, room, freezeDeep } from './fixtures/physical';

const check = (doc: unknown, code: string, wall?: string) => validateGeometry(doc).checks.find(item => item.code === code && (!wall || item.wallFaceIds.includes(wall)))!;
test('Q-001 is fully specified, non-overlapping geometry without calculating totals', () => {
  const result = validateGeometry(q001());
  assert.equal(result.structuralValid, true);
  assert.ok(result.checks.length > 0);
  assert.ok(result.checks.every(item => item.status === 'valid'));
  assert.deepEqual(result.findings, []);
});

for (const side of ['top', 'right', 'bottom', 'left'] as const) {
  test(side + ' uses clockwise center and the correct axis at noncentral/tolerance bounds', () => {
    const doc = q001(); doc.openings = [doc.openings[0]];
    const door = doc.openings[0], wall = 'room-1:' + side;
    door.width = measured('800 mm');
    door.attachments = [{ wallFaceId: wall, anchor: 'center', offsetMm: toMm(900, 'mm') }];
    assert.equal(check(doc, 'HORIZONTAL_FIT').status, 'valid');
    const length = ['top', 'bottom'].includes(side) ? doc.rooms[0].length.valueMm! : doc.rooms[0].width.valueMm!;
    for (const [overrun, expected] of [[0, 'valid'], [.009, 'valid'], [.01, 'valid'], [.011, 'invalid']] as const) {
      door.attachments[0].offsetMm = toMm(400 - overrun, 'mm');
      assert.equal(check(doc, 'HORIZONTAL_FIT').status, expected, 'start ' + overrun);
      door.attachments[0].offsetMm = toMm(length - 400 + overrun, 'mm');
      assert.equal(check(doc, 'HORIZONTAL_FIT').status, expected, 'end ' + overrun);
    }
  });
}

test('opening top at ceiling, inside tolerance and outside tolerance', () => {
  const doc = q001(); doc.openings = [doc.openings[0]];
  doc.rooms[0].ceilingHeight = measured('2000 mm');
  doc.openings[0].sillHeight = measured('1000 mm', true, 'elevation');
  for (const [overrun, expected] of [[0, 'valid'], [.009, 'valid'], [.01, 'valid'], [.011, 'invalid']] as const) {
    doc.openings[0].height = measured((1000 + overrun) + ' mm');
    assert.equal(check(doc, 'VERTICAL_FIT').status, expected, String(overrun));
  }
});

test('zero, missing and negative sill remain distinct', () => {
  const doc = q001(); doc.openings = [doc.openings[0]];
  assert.equal(check(doc, 'VERTICAL_FIT').status, 'valid');
  doc.openings[0].sillHeight = unknownMeasurement('not measured');
  assert.equal(check(doc, 'VERTICAL_FIT').status, 'undetermined');
  doc.openings[0].sillHeight = { ...measured('0 mm', true, 'elevation'), valueMm: toMm(-.001, 'mm') };
  assert.equal(validateGeometry(doc).structuralValid, false);
  assert.equal(validateGeometry(doc).findings[0].category, 'invalid-geometry');
});

test('explicit floor-level opening requires zero sill within tolerance', () => {
  const doc = q001(); doc.openings = [doc.openings[0]]; doc.openings[0].kind = 'floor-level-opening';
  for (const [sill, expected] of [[0, 'valid'], [.009, 'valid'], [.01, 'valid'], [.011, 'invalid']] as const) {
    doc.openings[0].sillHeight = measured(sill + ' mm', true, 'elevation');
    assert.equal(check(doc, 'FLOOR_LEVEL_SILL').status, expected);
  }
  doc.openings[0].sillHeight = unknownMeasurement('missing');
  assert.equal(check(doc, 'FLOOR_LEVEL_SILL').status, 'undetermined');
});

function overlapFixture() {
  const doc = q001();
  for (const opening of doc.openings) {
    opening.width = measured('600 mm'); opening.height = measured('1000 mm');
    opening.sillHeight = measured('0 mm', true, 'elevation'); opening.attachments[0].offsetMm = toMm(1000, 'mm');
  }
  return doc;
}
test('actual overlap requires horizontal AND vertical intersection', () => {
  const doc = overlapFixture();
  assert.equal(check(doc, 'OPENING_OVERLAP').status, 'invalid');
  doc.openings[1].sillHeight = measured('1200 mm', true, 'elevation');
  assert.equal(check(doc, 'OPENING_OVERLAP').status, 'valid');
  assert.equal(validateGeometry(doc).findings.some(item => item.code === 'STACKED_PRESENTATION_LIMITATION'), true);
});

test('horizontal touching and overlap tolerance boundaries', () => {
  const doc = overlapFixture();
  for (const [amount, expected] of [[0, 'valid'], [.009, 'valid'], [.01, 'valid'], [.011, 'invalid']] as const) {
    doc.openings[1].attachments[0].offsetMm = toMm(1600 - amount, 'mm');
    assert.equal(check(doc, 'OPENING_OVERLAP').status, expected);
  }
});

test('vertical touching and overlap tolerance boundaries', () => {
  const doc = overlapFixture();
  for (const [amount, expected] of [[0, 'valid'], [.009, 'valid'], [.01, 'valid'], [.011, 'invalid']] as const) {
    doc.openings[1].sillHeight = measured((1000 - amount) + ' mm', true, 'elevation');
    assert.equal(check(doc, 'OPENING_OVERLAP').status, expected);
  }
});

test('missing or unresolved extents yield undetermined fit and overlap', () => {
  const doc = q001();
  doc.openings[1].height = unknownMeasurement('height unknown');
  assert.equal(check(doc, 'OPENING_OVERLAP').status, 'undetermined');
  assert.equal(validateGeometry(doc).checks.find(item => item.code === 'VERTICAL_FIT' && item.openingIds[0] === 'window')!.status, 'undetermined');
  const width = measured('3 ft');
  doc.openings[0].width = { state: 'needs-review', valueMm: null, reason: 'width conflict',
    candidates: [{ label: 'a', valueMm: width.valueMm, provenance: width.provenance },
      { label: 'b', valueMm: toMm(1000, 'mm'), provenance: width.provenance }] };
  assert.equal(check(doc, 'HORIZONTAL_FIT').status, 'undetermined');
  assert.equal(validateGeometry(doc).findings.some(item => item.code === 'MEASUREMENT_UNRESOLVED'), true);
});

test('shared opening validates each room independently without layout adjacency', () => {
  const doc = q001(); doc.openings = [doc.openings[0]];
  const other = room('room-2'); other.presentation = { xMm: toMm(900000, 'mm'), yMm: toMm(-90000, 'mm') };
  doc.rooms.push(other);
  doc.openings[0].attachments.push({ wallFaceId: 'room-2:right', anchor: 'center', offsetMm: toMm(2.5, 'ft') });
  assert.ok(validateGeometry(doc).checks.every(item => item.status === 'valid'));
  other.width = measured('3 ft'); other.ceilingHeight = measured('6 ft');
  assert.equal(check(doc, 'HORIZONTAL_FIT', 'room-1:top').status, 'valid');
  assert.equal(check(doc, 'VERTICAL_FIT', 'room-1:top').status, 'valid');
  assert.equal(check(doc, 'HORIZONTAL_FIT', 'room-2:right').status, 'invalid');
  assert.equal(check(doc, 'VERTICAL_FIT', 'room-2:right').status, 'invalid');
});

test('two faces of the same room are an unsupported shared relationship', () => {
  const doc = q001();
  doc.openings[0].attachments.push({ wallFaceId: 'room-1:left', anchor: 'center', offsetMm: toMm(1000, 'mm') });
  const item = check(doc, 'SHARED_ATTACHMENT_ROOMS');
  assert.equal(item.status, 'invalid');
  assert.deepEqual(item.roomIds, ['room-1']);
  assert.ok(item.scopes.includes('opening-inventory'));
});

test('resize recomputes geometry without moving openings or changing evidence', () => {
  const before = q001(), resized = structuredClone(before);
  resized.rooms[0].length = measured('8 ft');
  const saved = structuredClone(resized); freezeDeep(resized);
  assert.equal(validateGeometry(resized).checks.some(item => item.code === 'HORIZONTAL_FIT' && item.status === 'invalid'), true);
  assert.deepEqual(resized, saved);
  assert.deepEqual(resized.openings, before.openings);
});

test('structural invalid dimensions, references and duplicate attachments are findings', () => {
  const mutations = [
    (doc: ReturnType<typeof q001>) => { doc.rooms[0].length = { ...measured('1 mm'), valueMm: toMm(0, 'mm') }; },
    (doc: ReturnType<typeof q001>) => { doc.openings[0].attachments[0].wallFaceId = 'missing'; },
    (doc: ReturnType<typeof q001>) => { doc.openings[0].attachments.push({ ...doc.openings[0].attachments[0] }); },
    (doc: ReturnType<typeof q001>) => { doc.rooms[0].wallFaces[0].side = 'bottom'; },
  ];
  for (const mutate of mutations) {
    const doc = q001(); mutate(doc);
    const report = validateGeometry(doc);
    assert.equal(report.structuralValid, false);
    assert.ok(report.findings.every(item => item.code === 'STRUCTURAL_INVALID' && item.paths.length));
  }
  const doc = q001(); doc.rooms[0].wallFaces[0].side = 'bottom';
  assert.deepEqual(validateGeometry(doc).findings[0].wallFaceIds, ['room-1:top']);
});

test('malformed attachments return diagnostics rather than throwing', () => {
  const doc = q001() as unknown as { openings: { attachments: unknown }[] };
  doc.openings[0].attachments = { filter: 1 };
  assert.equal(validateGeometry(doc).structuralValid, false);
  assert.equal(validateGeometry(null).structuralValid, false);
});

test('nonfinite derived horizontal/vertical extents cannot pass', () => {
  const doc = q001(); doc.openings = [doc.openings[0]];
  doc.openings[0].width = { ...measured('1 mm'), valueMm: toMm(1e308, 'mm') };
  doc.openings[0].attachments[0].offsetMm = toMm(1.7e308, 'mm');
  assert.equal(check(doc, 'HORIZONTAL_FIT').status, 'invalid');
  doc.openings[0].height = { ...measured('1 mm'), valueMm: toMm(1e308, 'mm') };
  doc.openings[0].sillHeight = { ...measured('0 mm', true, 'elevation'), valueMm: toMm(1e308, 'mm') };
  assert.equal(check(doc, 'VERTICAL_FIT').status, 'invalid');
});

test('legacy out-of-bounds and unknown measurements remain preserved and v2 reprocessable', () => {
  const legacy = { rooms: [{ id: 'r', width: 240, height: 200, x: 0, y: 0, note: 'original',
    objects: [{ id: 'd', type: 'door', position: 0, size: 60, wallSide: 'top' }] }] };
  const adapted = adaptMeasurementDocument(freezeDeep(legacy));
  assert.ok('document' in adapted);
  const before = structuredClone(adapted.document);
  const report = validateGeometry(freezeDeep(adapted.document));
  assert.equal(report.structuralValid, true);
  assert.equal(check(adapted.document, 'HORIZONTAL_FIT').status, 'invalid');
  assert.equal(check(adapted.document, 'VERTICAL_FIT').status, 'undetermined');
  assert.deepEqual(adapted.document, before);
  assert.deepEqual(adapted.document.compatibility!.original, legacy);
  assert.equal(adaptMeasurementDocument(adapted.document).status, 'already-v2');
});

test('validation of frozen input is deterministic and separate from confirmation', () => {
  const doc = q001(); doc.openings[0].width = measured('3 ft', false);
  freezeDeep(doc);
  const report = validateGeometry(doc);
  assert.deepEqual(report, validateGeometry(doc));
  assert.ok(report.checks.every(item => item.status === 'valid'));
  assert.equal(report.findings.find(item => item.code === 'MEASUREMENT_UNCONFIRMED')!.openingIds[0], 'door');
});


test('small-coordinate horizontal and vertical overlap honor the exact 0.01mm boundary', () => {
  for (const axis of ['horizontal', 'vertical']) for (const [amount, status] of [[.009, 'valid'], [.01, 'valid'], [.011, 'invalid']] as const) {
    const doc = q001();
    const a = doc.openings[0], b = doc.openings[1];
    a.width = b.width = measured('40 mm'); a.height = b.height = measured('40 mm');
    a.sillHeight = measured('60 mm', true, 'elevation');
    b.sillHeight = measured((axis === 'vertical' ? 100 - amount : 60) + ' mm', true, 'elevation');
    a.attachments[0].offsetMm = toMm(80, 'mm');
    b.attachments[0].offsetMm = toMm(axis === 'horizontal' ? 120 - amount : 80, 'mm');
    assert.equal(check(doc, 'OPENING_OVERLAP').status, status, axis + ' ' + amount);
  }
});

test('mutating a report cannot change later validation scopes or the document', () => {
  const doc = freezeDeep(q001()), expected = validateGeometry(doc), mutated = validateGeometry(doc);
  for (const item of mutated.checks) item.scopes.length = 0;
  mutated.checks[0].paths[0].push('output-only');
  assert.deepEqual(validateGeometry(doc), expected);
});


test('small-coordinate start bounds honor exact tolerance on every wall orientation', () => {
  for (const side of ['top', 'right', 'bottom', 'left']) for (const [amount, status] of [[.009, 'valid'], [.01, 'valid'], [.011, 'invalid']] as const) {
    const doc = q001(); doc.openings = [doc.openings[0]];
    doc.openings[0].width = measured('200 mm');
    doc.openings[0].attachments = [{ wallFaceId: 'room-1:' + side, anchor: 'center', offsetMm: toMm(100 - amount, 'mm') }];
    assert.equal(check(doc, 'HORIZONTAL_FIT').status, status, side + ' ' + amount);
  }
});
