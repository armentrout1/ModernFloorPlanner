import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { PhysicalDocument } from '../shared/domain/document';
import { unknownMeasurement, type Dimension } from '../shared/domain/measurements';
import { toMm } from '../shared/domain/units';
import { evaluateQuantityReadiness, type OutputReadiness } from '../shared/quantities/readiness';
import { validateQuantityRequest, QUANTITY_POLICY_VERSION, type QuantitySelection } from '../shared/quantities/policy';
import { q001, measured, room, request, allSelections, freezeDeep } from './fixtures/physical';

const face = 'room-1:top';
function outputs(doc: PhysicalDocument, selections = allSelections(doc), gaps: { wallFaceId: string; openingId: string }[] = []) {
  const requested = request(selections); requested.policy.crownFullHeightGaps = gaps;
  const result = evaluateQuantityReadiness(doc, requested);
  assert.ok(result.ok, JSON.stringify(result));
  return result.outputs;
}
function selected(items: OutputReadiness[], output: string, wall = face) {
  const item = items.find(item => item.output === output && (!item.wallFaceIds.length || item.wallFaceIds.includes(wall)));
  assert.ok(item, output);
  return item;
}
const states = (item: OutputReadiness) => [item.numericBasis.status, item.geometry.status, item.confirmation.status];
const conflict = (): Dimension => ({ state: 'needs-review', valueMm: null, reason: 'Width conflict',
  candidates: ['3 ft', '32 in'].map((value, i) => ({ label: 'source ' + i,
    valueMm: measured(value).valueMm, provenance: measured(value).provenance })) });

test('Q-001 has sufficient valid confirmed dependencies for all selected quantities, without totals', () => {
  const doc = freezeDeep(q001()), before = structuredClone(doc);
  const items = outputs(doc);
  assert.equal(items.length, 25);
  for (const item of items) {
    assert.deepEqual(states(item), ['sufficient', 'valid', item.output === 'opening-inventory' ? 'not-required' : 'confirmed']);
    assert.equal('total' in item, false);
  }
  assert.deepEqual(doc, before);
  assert.equal(doc.quantityPolicyVersion, null);
});

test('missing ceiling height does not block floor, flat ceiling, floor trim or ordinary crown', () => {
  const doc = q001(); doc.rooms[0].ceilingHeight = unknownMeasurement('ceiling not measured');
  const items = outputs(doc);
  for (const output of ['floor-area', 'ceiling-area', 'baseboard', 'base-shoe', 'crown']) {
    assert.deepEqual(states(selected(items, output)), ['sufficient', 'valid', 'confirmed'], output);
  }
  assert.deepEqual(states(selected(items, 'gross-wall-area')), ['insufficient', 'undetermined', 'unresolved']);
  assert.deepEqual(states(selected(items, 'door-casing')), ['sufficient', 'undetermined', 'unresolved']);
});

test('missing window height blocks its net face but not gross area or floor-level runs', () => {
  const doc = q001(); doc.openings[1].height = unknownMeasurement('window height');
  const items = outputs(doc);
  for (const output of ['gross-wall-area', 'baseboard', 'base-shoe']) {
    assert.deepEqual(states(selected(items, output)), ['sufficient', 'valid', 'confirmed']);
  }
  const net = selected(items, 'net-wall-area');
  assert.deepEqual(states(net), ['insufficient', 'undetermined', 'unresolved']);
  assert.ok(net.numericBasis.findings.some(finding => finding.openingIds[0] === 'window'
    && JSON.stringify(finding.paths) === JSON.stringify([['openings', 1, 'height']])));
  assert.deepEqual(states(selected(items, 'net-wall-area', 'room-1:bottom')), ['sufficient', 'valid', 'confirmed']);
});

test('unknown sill cannot be assumed elevated; known elevated windows do not need width for floor runs', () => {
  const doc = q001(); doc.openings[1].width = unknownMeasurement('window width');
  for (const output of ['baseboard', 'base-shoe']) {
    assert.deepEqual(states(selected(outputs(doc), output)), ['sufficient', 'valid', 'confirmed']);
  }
  doc.openings[1].sillHeight = unknownMeasurement('sill not measured');
  for (const output of ['baseboard', 'base-shoe']) {
    const item = selected(outputs(doc), output);
    assert.deepEqual(states(item), ['insufficient', 'undetermined', 'unresolved']);
    assert.ok(item.numericBasis.findings.some(finding => finding.openingIds[0] === 'window'));
  }
});

test('unresolved door width blocks only selected width-dependent work', () => {
  const doc = q001(); doc.openings[0].width = conflict();
  const items = outputs(doc);
  for (const output of ['net-wall-area', 'baseboard', 'base-shoe', 'door-casing']) {
    assert.equal(selected(items, output).numericBasis.status, 'insufficient', output);
  }
  for (const output of ['floor-area', 'ceiling-area', 'gross-wall-area', 'crown', 'opening-inventory']) {
    assert.equal(selected(items, output).numericBasis.status, 'sufficient', output);
  }
  assert.deepEqual(states(selected(items, 'baseboard', 'room-1:bottom')), ['sufficient', 'valid', 'confirmed']);
});

test('numeric availability, invalid geometry and confirmation remain independent', () => {
  const doc = q001(); doc.openings[0].width = measured('3 ft', false);
  doc.openings[0].attachments[0].offsetMm = toMm(1, 'mm');
  const item = selected(outputs(doc), 'net-wall-area');
  assert.deepEqual(states(item), ['sufficient', 'invalid', 'provisional']);
  assert.ok(item.confirmation.findings.some(finding => finding.code === 'MEASUREMENT_UNCONFIRMED'));
  doc.openings[0].width = measured('3 ft');
  assert.deepEqual(states(selected(outputs(doc), 'net-wall-area')), ['sufficient', 'invalid', 'confirmed']);
});

test('known measurement carrying needs-review provenance stays numerically available but unresolved', () => {
  const doc = q001(), width = measured('3 ft');
  doc.openings[0].width = { ...width, provenance: { ...width.provenance, confirmation: { status: 'needs-review' } } };
  const item = selected(outputs(doc), 'baseboard');
  assert.deepEqual(states(item), ['sufficient', 'valid', 'unresolved']);
  assert.equal(item.confirmation.findings.length, 1);
});

test('missing dimensions on an unselected wall/room do not block selected work', () => {
  const doc = q001(); doc.rooms[0].width = unknownMeasurement('unselected axis');
  const unrelated = room('other'); unrelated.length = unknownMeasurement('other length');
  unrelated.ceilingHeight = unknownMeasurement('other ceiling'); doc.rooms.push(unrelated);
  const otherWindow = structuredClone(doc.openings[1]); otherWindow.id = 'other-window';
  otherWindow.attachments = [{ wallFaceId: 'other:left', anchor: 'center', offsetMm: toMm(700, 'mm') }];
  otherWindow.height = unknownMeasurement('other opening'); doc.openings.push(otherWindow);
  const selections: QuantitySelection[] = [{ output: 'net-wall-area', wallFaceIds: [face], wasteFraction: 0 }];
  assert.deepEqual(states(outputs(doc, selections)[0]), ['sufficient', 'valid', 'confirmed']);
  assert.equal(evaluateQuantityReadiness(doc, request(selections)).validation.findings.length > 0, true);
});

test('floor-level width and sill suffice for trim even when opening height is unknown', () => {
  const doc = q001(); doc.openings[0].height = unknownMeasurement('door height');
  const item = selected(outputs(doc), 'baseboard');
  assert.deepEqual(states(item), ['sufficient', 'valid', 'confirmed']);
  assert.ok(!item.confirmation.dependencies.some(ref => ref.field === 'height' || ref.field === 'ceilingHeight'));
});

test('overlapping floor interruptions have a local interval error without requiring heights', () => {
  const doc = q001(), second = structuredClone(doc.openings[0]); second.id = 'second-door';
  second.height = unknownMeasurement('not measured'); doc.openings.push(second);
  const item = selected(outputs(doc), 'base-shoe');
  assert.equal(item.geometry.status, 'invalid');
  assert.ok(item.geometry.findings.some(finding => finding.code === 'FLOOR_RUN_OVERLAP'
    && finding.openingIds.includes('second-door')));
  assert.equal(item.numericBasis.status, 'sufficient');
});

test('explicit floor-level kind with elevated sill invalidates floor-run classification', () => {
  const doc = q001(); doc.openings[0].kind = 'floor-level-opening';
  doc.openings[0].sillHeight = measured('10 mm', true, 'elevation');
  assert.ok(selected(outputs(doc), 'baseboard').geometry.findings.some(f => f.code === 'FLOOR_LEVEL_SILL'));
});

test('crown ignores ordinary openings and validates only explicitly selected full-height gaps', () => {
  const doc = q001(); doc.openings = [doc.openings[0]];
  doc.openings[0].width = unknownMeasurement('unknown ordinary width');
  assert.deepEqual(states(selected(outputs(doc), 'crown')), ['sufficient', 'valid', 'confirmed']);
  doc.openings[0].width = measured('3 ft');
  const selections: QuantitySelection[] = [{ output: 'crown', wallFaceIds: [face], wasteFraction: .05 }];
  const gaps = [{ wallFaceId: face, openingId: 'door' }];
  const invalid = outputs(doc, selections, gaps)[0];
  assert.equal(invalid.geometry.status, 'invalid');
  assert.ok(invalid.geometry.findings.some(f => f.code === 'CROWN_GAP_FULL_HEIGHT'
    && f.paths.some(path => path.join('.') === 'rooms.0.ceilingHeight')));
  doc.openings[0].height = measured('8 ft');
  assert.deepEqual(states(outputs(doc, selections, gaps)[0]), ['sufficient', 'valid', 'confirmed']);
  doc.openings[0].sillHeight = unknownMeasurement('gap sill');
  assert.deepEqual(states(outputs(doc, selections, gaps)[0]), ['insufficient', 'undetermined', 'unresolved']);
});

test('shared opening supplies one identity basis and two independent selected deduction/casing faces', () => {
  const doc = q001(); doc.openings = [doc.openings[0]]; doc.rooms.push(room('room-2'));
  doc.openings[0].attachments.push({ wallFaceId: 'room-2:bottom', anchor: 'center', offsetMm: toMm(2.5, 'ft') });
  const selections: QuantitySelection[] = [
    { output: 'opening-inventory', openingIds: ['door'] },
    { output: 'net-wall-area', wallFaceIds: [face, 'room-2:bottom'], wasteFraction: 0 },
    { output: 'door-casing', faces: doc.openings[0].attachments.map(a => ({ wallFaceId: a.wallFaceId, openingId: 'door' })), wasteFraction: 0 },
  ];
  const items = outputs(doc, selections);
  assert.equal(items.length, 5);
  assert.deepEqual(items[0].openingIds, ['door']);
  assert.equal(items[0].numericBasis.dependencies.length, 0);
  assert.deepEqual(items.filter(i => i.output === 'net-wall-area').map(i => i.wallFaceIds), [[face], ['room-2:bottom']]);
  assert.ok(items.every(item => item.geometry.status === 'valid'));
  doc.rooms[1].ceilingHeight = measured('6 ft');
  const changed = outputs(doc, selections);
  assert.equal(selected(changed, 'net-wall-area', face).geometry.status, 'valid');
  assert.equal(selected(changed, 'net-wall-area', 'room-2:bottom').geometry.status, 'invalid');
  assert.equal(changed[0].numericBasis.status, 'sufficient');
});

test('inventory needs identities, not dimensions, and rejects unsupported same-room shared relationships', () => {
  const doc = q001(); doc.openings[0].width = conflict();
  const selections: QuantitySelection[] = [{ output: 'opening-inventory', openingIds: ['door'] }];
  assert.deepEqual(states(outputs(doc, selections)[0]), ['sufficient', 'valid', 'not-required']);
  doc.openings[0].attachments.push({ wallFaceId: 'room-1:bottom', anchor: 'center', offsetMm: toMm(700, 'mm') });
  assert.deepEqual(states(outputs(doc, selections)[0]), ['sufficient', 'invalid', 'not-required']);
});

test('casing reports exact neighboring opening whose missing extent prevents overlap validation', () => {
  const doc = q001(); doc.openings[1].height = unknownMeasurement('neighbor height');
  const item = selected(outputs(doc), 'door-casing');
  assert.equal(item.numericBasis.status, 'sufficient');
  assert.equal(item.geometry.status, 'undetermined');
  const reason = item.confirmation.findings.find(f => f.paths.some(path => path.join('.') === 'openings.1.height'));
  assert.deepEqual(reason?.openingIds, ['window']);
  assert.deepEqual(reason?.wallFaceIds, [face]);
});

test('empty scopes stay empty for every selection type', () => {
  const doc = q001();
  const result = evaluateQuantityReadiness(doc, request([])); assert.ok(result.ok);
  assert.deepEqual(result.outputs, []); assert.equal(result.selectionState, 'empty');
  const empty = allSelections(doc).map(selection => {
    if ('roomIds' in selection) return { ...selection, roomIds: [] };
    if ('wallFaceIds' in selection) return { ...selection, wallFaceIds: [] };
    if ('openingIds' in selection) return { ...selection, openingIds: [] };
    return { ...selection, faces: [] };
  });
  assert.deepEqual(outputs(doc, empty), []);
});

test('invalid IDs, repeated IDs/outputs, wrong kinds and unattached casing faces are errors', () => {
  const doc = q001();
  const invalid: QuantitySelection[][] = [
    [{ output: 'floor-area', roomIds: ['missing'], wasteFraction: 0 }],
    [{ output: 'net-wall-area', wallFaceIds: ['missing'], wasteFraction: 0 }],
    [{ output: 'opening-inventory', openingIds: ['missing'] }],
    [{ output: 'opening-inventory', openingIds: ['door', 'door'] }],
    [{ output: 'floor-area', roomIds: ['room-1', 'room-1'], wasteFraction: 0 }],
    [{ output: 'door-casing', faces: [{ wallFaceId: face, openingId: 'window' }], wasteFraction: 0 }],
    [{ output: 'window-casing', faces: [{ wallFaceId: 'room-1:left', openingId: 'window' }], wasteFraction: 0 }],
    [{ output: 'crown', wallFaceIds: [], wasteFraction: 0 }, { output: 'crown', wallFaceIds: [], wasteFraction: 0 }],
  ];
  for (const selection of invalid) {
    const result = evaluateQuantityReadiness(doc, request(selection));
    assert.equal(result.ok, false, JSON.stringify(selection));
    if (!result.ok) assert.ok(result.errors[0].path.length > 0);
  }
  const requested = request([]); requested.policy.crownFullHeightGaps = [{ wallFaceId: 'room-1:left', openingId: 'door' }];
  assert.equal(validateQuantityRequest(doc, requested).ok, false);
});

test('unsupported policy, document mismatch and malformed options fail without rewriting history', () => {
  const doc = q001(), requested = request([]);
  for (const version of [undefined, null, '', 'rectangular-flat-v2']) {
    const result = validateQuantityRequest(doc, { ...requested, policy: { ...requested.policy, version } });
    assert.ok(!result.ok); assert.equal(result.errors[0].code, 'UNSUPPORTED_POLICY_VERSION');
  }
  assert.ok(validateQuantityRequest(doc, requested).ok);
  assert.equal(doc.quantityPolicyVersion, null);
  doc.quantityPolicyVersion = 'old-policy';
  const mismatch = validateQuantityRequest(doc, requested); assert.ok(!mismatch.ok);
  assert.equal(mismatch.errors[0].code, 'DOCUMENT_POLICY_VERSION_MISMATCH');
  doc.quantityPolicyVersion = QUANTITY_POLICY_VERSION;
  for (const bad of [
    { ...requested, policy: { ...requested.policy, extra: true } },
    { ...requested, policy: { ...requested.policy, openingMeasureBasis: 'unknown' } },
    { ...requested, selections: [{ output: 'floor-area', roomIds: [] }] },
    { ...requested, selections: [{ output: 'opening-inventory', openingIds: [], wasteFraction: 0 }] },
  ]) assert.equal(validateQuantityRequest(doc, bad).ok, false);
});

test('waste is explicit decimal fraction, finite and nonnegative, without applying it', () => {
  const doc = q001();
  for (const wasteFraction of [NaN, Infinity, -Infinity, -.01, '10%']) {
    assert.equal(validateQuantityRequest(doc, request([{ output: 'floor-area', roomIds: ['room-1'], wasteFraction } as QuantitySelection])).ok, false);
  }
  for (const wasteFraction of [0, .1, 1, 2]) {
    const item = outputs(doc, [{ output: 'floor-area', roomIds: ['room-1'], wasteFraction }])[0];
    assert.equal(item.wasteFraction, wasteFraction);
    assert.equal('quantity' in item, false);
  }
});

test('nominal, clear, finished and rough bases stay distinct and are never converted', () => {
  const doc = q001(); doc.openings = [doc.openings[0]];
  const selections: QuantitySelection[] = [{ output: 'door-casing', faces: [{ wallFaceId: face, openingId: 'door' }], wasteFraction: 0 }];
  const before = structuredClone(doc.openings[0].width);
  for (const basis of ['nominal', 'clear', 'finished', 'rough'] as const) {
    doc.openings[0].measureBasis = basis;
    const requested = request(selections); requested.policy.openingMeasureBasis = basis;
    const result = evaluateQuantityReadiness(doc, requested); assert.ok(result.ok);
    assert.equal(result.outputs[0].numericBasis.status, 'sufficient');
    assert.equal(result.outputs[0].openingBases[0].measureBasis, basis);
    assert.equal(selected(outputs(doc, selections), 'door-casing').numericBasis.status, basis === 'finished' ? 'sufficient' : 'insufficient');
  }
  doc.openings[0].measureBasis = 'unknown';
  const item = outputs(doc, selections)[0];
  assert.equal(item.numericBasis.findings[0].code, 'OPENING_BASIS_UNKNOWN');
  assert.equal(item.geometry.status, 'valid');
  assert.deepEqual(doc.openings[0].width, before);
});

test('malformed v2 produces detailed structural errors rather than a readiness claim', () => {
  const doc = q001(); doc.openings[0].attachments[0].wallFaceId = 'missing';
  const result = evaluateQuantityReadiness(doc, request([]));
  assert.ok(!result.ok);
  assert.equal(result.errors[0].code, 'INVALID_DOCUMENT');
  assert.equal(result.validation.structuralValid, false);
  assert.ok(result.validation.findings.some(f => f.openingIds.includes('door') && f.paths.length));
});

test('frozen request and document produce repeatable detached readiness without history blockers', () => {
  const doc = q001(); doc.review.push({ code: 'conflicting-widths', roomId: 'room-1', openingId: 'door', field: 'width', message: 'Historical conflict' });
  const frozen = freezeDeep(doc), requested = freezeDeep(request(allSelections(doc))), before = structuredClone(doc);
  const result = evaluateQuantityReadiness(frozen, requested);
  assert.deepEqual(result, evaluateQuantityReadiness(frozen, requested));
  assert.ok(result.ok);
  assert.ok(result.outputs.every(item => item.numericBasis.status === 'sufficient'));
  assert.ok(result.validation.findings.some(f => f.category === 'compatibility-info'));
  result.outputs[0].roomIds.push('output-only');
  assert.deepEqual(frozen, before);
});


test('floor-run overlap uses endpoint magnitudes at the 0.01mm tolerance boundary', () => {
  for (const [amount, status] of [[.009, 'valid'], [.01, 'valid'], [.011, 'invalid']] as const) {
    const doc = q001(); const a = doc.openings[0], b = doc.openings[1];
    a.width = b.width = measured('40 mm');
    a.sillHeight = b.sillHeight = measured('0 mm', true, 'elevation');
    a.height = b.height = unknownMeasurement('not needed for floor runs');
    a.attachments[0].offsetMm = toMm(80, 'mm'); b.attachments[0].offsetMm = toMm(120 - amount, 'mm');
    assert.equal(selected(outputs(doc), 'baseboard').geometry.status, status);
  }
});

test('unknown ceiling on the other shared face does not block selected known face', () => {
  const doc = q001(); doc.openings = [doc.openings[0]]; doc.rooms.push(room('room-2'));
  doc.rooms[1].ceilingHeight = unknownMeasurement('other face ceiling');
  doc.openings[0].attachments.push({ wallFaceId: 'room-2:bottom', anchor: 'center', offsetMm: toMm(2.5, 'ft') });
  const items = outputs(doc, [{ output: 'net-wall-area', wallFaceIds: [face, 'room-2:bottom'], wasteFraction: 0 }]);
  assert.deepEqual(states(items[0]), ['sufficient', 'valid', 'confirmed']);
  assert.deepEqual(states(items[1]), ['insufficient', 'undetermined', 'unresolved']);
});
