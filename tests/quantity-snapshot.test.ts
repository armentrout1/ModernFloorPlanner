import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalJson, copyJson } from '../shared/quantities/canonicalJson';
import { sha256Canonical } from '../shared/quantities/fingerprint';
import { evaluateQuantities, createQuantitySnapshot, verifyQuantitySnapshot, quantitySnapshotSchema } from '../shared/quantities/snapshot';
import { calculateQuantities } from '../shared/quantities/engine';
import { formatQuantity } from '../shared/quantities/display';
import { applyMeasurementAction } from '../shared/domain/measurementActions';
import { adaptMeasurementDocument } from '../shared/compatibility/legacyDocument';
import { unknownMeasurement } from '../shared/domain/measurements';
import { toMm } from '../shared/domain/units';
import { q001, measured, request, allSelections, AT, freezeDeep } from './fixtures/physical';

const metadata = (kind: 'evaluation' | 'confirmed' = 'confirmed') => ({ id: 'capture-1', createdAt: AT, kind });
async function evaluation(doc = q001(), requested = request(allSelections(doc))) {
  const result = await evaluateQuantities(doc, requested);
  assert.ok(result.ok, JSON.stringify(result));
  return result.evaluation;
}
test('canonical JSON sorts object keys by UTF-16, preserves arrays and special own keys', () => {
  assert.equal(canonicalJson({ b: 2, a: 1 }), '{"a":1,"b":2}');
  assert.equal(canonicalJson({ '2': 'two', '10': 'ten' }), '{"10":"ten","2":"two"}');
  assert.equal(canonicalJson([-0, 1, 0.5, 'é', '\ud800']), '[0,1,0.5,"é","\\ud800"]');
  const special = JSON.parse('{"__proto__":{"preserved":true},"constructor":{"x":1}}');
  assert.equal(canonicalJson(special), '{"__proto__":{"preserved":true},"constructor":{"x":1}}');
  assert.deepEqual(copyJson(special), special);
  assert.equal(({} as { preserved?: boolean }).preserved, undefined);
});
test('canonical JSON rejects coercion, sparse arrays, accessors, cycles and excess depth', () => {
  const cycle: { child?: unknown } = {}; cycle.child = cycle;
  let deep: unknown = 1; for (let i = 0; i < 102; i++) deep = { child: deep };
  const accessor = Object.defineProperty({}, 'read', { get() { throw new Error('getter must not execute'); }, enumerable: true });
  for (const value of [undefined, NaN, Infinity, 1n, new Date(), new Map(), [1, undefined], new Array(2),
    { value: undefined }, { [Symbol('key')]: 1 }, cycle, deep, accessor]) {
    assert.throws(() => canonicalJson(value));
  }
  assert.equal(canonicalJson([2, 1]), '[2,1]');
});
test('platform SHA-256 matches independent Node crypto over the documented canonical bytes', async () => {
  const payload = { b: 2, a: 1 };
  const expected = createHash('sha256').update('{"a":1,"b":2}', 'utf8').digest('hex');
  assert.equal(await sha256Canonical(payload), expected);
  assert.equal(await sha256Canonical({ a: 1, b: 2 }), expected);
});
test('calculation content/fingerprints repeat without fabricating a saved revision', async () => {
  const first = await evaluation(), second = await evaluation();
  assert.deepEqual(first, second);
  assert.equal(first.calculation.source.revisionId, null);
  assert.equal(first.calculation.source.revisionState, 'unsaved');
  assert.equal(first.calculation.status, 'complete');
  assert.equal(first.fingerprints.algorithm, 'SHA-256');
});
test('viewport, presentation, names, arbitrary metadata and legacy original do not change calculation fingerprints', async () => {
  const doc = q001(), first = await evaluation(doc);
  doc.viewport = { zoom: 9, x: 500 }; doc.name = 'Different display name';
  doc.metadata = { anything: { changed: true } };
  doc.rooms[0].name = 'Different room name'; doc.rooms[0].presentation = { xMm: toMm(100, 'mm'), yMm: toMm(-300, 'mm'), color: 'red' };
  doc.openings[0].metadata = { color: 'blue' };
  doc.compatibility = { adapterVersion: 'legacy-pixels-v1', original: { arbitrary: 'original evidence' },
    before: { rooms: 1, openings: 2 }, after: { rooms: 1, openings: 2 } };
  const second = await evaluation(doc);
  assert.deepEqual(second, first);
});
test('geometry changes change both hashes; provenance/confirmation change only content hash', async () => {
  const doc = q001(), first = await evaluation(doc);
  doc.rooms[0].length = measured('13 ft');
  const geometry = await evaluation(doc);
  assert.notEqual(geometry.fingerprints.geometry, first.fingerprints.geometry);
  assert.notEqual(geometry.fingerprints.content, first.fingerprints.content);
  const unconfirmed = q001(); unconfirmed.rooms[0].length = measured('12 ft', false);
  const provisional = await evaluation(unconfirmed);
  assert.equal(provisional.fingerprints.geometry, first.fingerprints.geometry);
  assert.notEqual(provisional.fingerprints.content, first.fingerprints.content);
  assert.equal(provisional.calculation.status, 'provisional');
  const evidence = q001(); const length = measured('12.0 ft');
  evidence.rooms[0].length = length;
  assert.equal((await evaluation(evidence)).fingerprints.geometry, first.fingerprints.geometry);
  assert.notEqual((await evaluation(evidence)).fingerprints.content, first.fingerprints.content);
});
test('selection, waste, opening basis and source identity are bound to calculation content', async () => {
  const doc = q001(), selected = request([{ output: 'floor-area', roomIds: ['room-1'], wasteFraction: 0 }]);
  const first = await evaluation(doc, selected);
  selected.selections[0].output = 'ceiling-area';
  assert.notEqual((await evaluation(doc, selected)).fingerprints.content, first.fingerprints.content);
  selected.selections[0].output = 'floor-area'; selected.selections[0].wasteFraction = .1;
  assert.notEqual((await evaluation(doc, selected)).fingerprints.content, first.fingerprints.content);
  selected.selections[0].wasteFraction = 0; selected.policy.openingMeasureBasis = 'rough';
  assert.notEqual((await evaluation(doc, selected)).fingerprints.content, first.fingerprints.content);
  selected.policy.openingMeasureBasis = 'finished'; doc.revisionId = 'revision-from-caller';
  const revised = await evaluation(doc, selected);
  assert.equal(revised.calculation.source.revisionState, 'identified');
  assert.notEqual(revised.fingerprints.content, first.fingerprints.content);
});
test('object insertion order is irrelevant to calculation fingerprints', async () => {
  function reverseKeys(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(reverseKeys);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reverseKeys(item)]));
    return value;
  }
  const doc = q001(), requested = request(allSelections(doc));
  const first = await evaluation(doc, requested), second = await evaluateQuantities(reverseKeys(doc), reverseKeys(requested));
  assert.ok(second.ok);
  assert.deepEqual(second.evaluation, first);
});
test('snapshot owns stable frozen source/result copies and captures before the first asynchronous hash', async () => {
  const doc = q001(), requested = request(allSelections(doc)), before = structuredClone(doc);
  const pending = createQuantitySnapshot(doc, requested, metadata());
  doc.rooms[0].length = measured('99 ft'); requested.selections.length = 0;
  const result = await pending; assert.ok(result.ok, JSON.stringify(result));
  const captured = result.snapshot;
  assert.deepEqual(captured.sourceDocument, before);
  assert.equal(Object.isFrozen(doc), false);
  assert.equal(Object.isFrozen(captured.sourceDocument.rooms[0].length), true);
  assert.equal(Object.isFrozen(captured.evaluation.calculation.records), true);
  assert.equal(Reflect.set(captured.sourceDocument.rooms[0], 'id', 'corrupted'), false);
  assert.equal(Reflect.set(captured.evaluation.calculation, 'status', 'blocked'), false);
  const serialized = JSON.stringify(captured);
  await evaluation(doc);
  assert.equal(JSON.stringify(captured), serialized);
  assert.ok((await verifyQuantitySnapshot(captured)).ok);
});
test('snapshot IDs/timestamps do not change deterministic calculation content', async () => {
  const doc = freezeDeep(q001()), requested = freezeDeep(request(allSelections(doc)));
  const first = await createQuantitySnapshot(doc, requested, metadata());
  const second = await createQuantitySnapshot(doc, requested, { ...metadata(), id: 'capture-2', createdAt: '2026-09-06T20:00:00.000Z' });
  assert.ok(first.ok && second.ok);
  assert.deepEqual(first.snapshot.evaluation, second.snapshot.evaluation);
  assert.notEqual(first.snapshot.captureFingerprint, second.snapshot.captureFingerprint);
});
test('confirmed snapshots reject provisional, blocked, empty and known-needs-review selections', async () => {
  for (const mode of ['unconfirmed', 'unknown', 'known-review', 'empty']) {
    const doc = q001();
    if (mode === 'unconfirmed') doc.rooms[0].length = measured('12 ft', false);
    if (mode === 'unknown') doc.rooms[0].length = unknownMeasurement('not measured');
    if (mode === 'known-review') {
      const length = measured('12 ft');
      doc.rooms[0].length = { ...length, provenance: { ...length.provenance, confirmation: { status: 'needs-review' } } };
    }
    const selected = request(mode === 'empty' ? [] : [{ output: 'floor-area', roomIds: ['room-1'], wasteFraction: 0 }]);
    const result = await createQuantitySnapshot(doc, selected, metadata());
    assert.ok(!result.ok); assert.equal(result.errors[0].code, 'CONFIRMED_SNAPSHOT_UNAVAILABLE');
    const provisional = await createQuantitySnapshot(doc, selected, metadata('evaluation'));
    assert.ok(provisional.ok, JSON.stringify(provisional));
    assert.equal(provisional.snapshot.instance.kind, 'evaluation');
  }
});
test('confirmation gate applies only selected outputs; inventory explicitly needs no dimension confirmation', async () => {
  const doc = q001(); doc.rooms[0].ceilingHeight = unknownMeasurement('not needed for floor');
  doc.openings[0].width = unknownMeasurement('not needed for identity');
  for (const requested of [
    request([{ output: 'floor-area', roomIds: ['room-1'], wasteFraction: 0 }]),
    request([{ output: 'opening-inventory', openingIds: ['door'] }]),
  ]) assert.ok((await createQuantitySnapshot(doc, requested, metadata())).ok);
});
test('snapshot validates metadata and version, and independently detects quantity/source tampering', async () => {
  for (const bad of [{}, { ...metadata(), id: ' ' }, { ...metadata(), createdAt: 'today' }, { ...metadata(), extra: true }]) {
    assert.equal((await createQuantitySnapshot(q001(), request(allSelections()), bad)).ok, false);
  }
  const result = await createQuantitySnapshot(q001(), request(allSelections()), metadata()); assert.ok(result.ok);
  assert.ok(quantitySnapshotSchema.safeParse(result.snapshot).success);
  const modified = structuredClone(result.snapshot) as any;
  modified.evaluation.calculation.outputs[0].total.net += 1;
  const verified = await verifyQuantitySnapshot(modified);
  assert.ok(!verified.ok); assert.equal(verified.errors[0].code, 'INVALID_SNAPSHOT');
  const sourceChanged = structuredClone(result.snapshot) as any;
  sourceChanged.sourceDocument.rooms[0].length = measured('13 ft');
  assert.ok(quantitySnapshotSchema.safeParse(sourceChanged).success);
  const integrity = await verifyQuantitySnapshot(sourceChanged);
  assert.ok(!integrity.ok); assert.equal(integrity.errors[0].code, 'SNAPSHOT_INTEGRITY_MISMATCH');
  const versioned = { ...structuredClone(result.snapshot), snapshotSchemaVersion: 'quantity-snapshot-v2' };
  assert.equal(quantitySnapshotSchema.safeParse(versioned).success, false);
});
test('legacy originals and supplied measurement action evidence are detached and retained in snapshots', async () => {
  const legacy = JSON.parse('{"id":9,"metadata":{"__proto__":{"keep":true}},"rooms":[{"id":"r","width":240,"height":200,"x":0,"y":0}]}');
  const adapted = adaptMeasurementDocument(legacy); assert.ok('document' in adapted);
  const doc = adapted.document, target = { entity: 'room', id: 'r', field: 'length' };
  const corrected = applyMeasurementAction(doc, target, { type: 'correct', at: AT, replacement: measured('13 ft') });
  assert.ok(corrected.ok);
  const events = [{ target, event: corrected.event }];
  const snapshot = await createQuantitySnapshot(corrected.document,
    request([{ output: 'floor-area', roomIds: ['r'], wasteFraction: 0 }]), metadata('evaluation'), events);
  assert.ok(snapshot.ok, JSON.stringify(snapshot));
  assert.deepEqual(snapshot.snapshot.sourceDocument.compatibility?.original, legacy);
  assert.deepEqual(snapshot.snapshot.measurementEvents, events);
  events[0].event.before = unknownMeasurement('later mutation');
  assert.notDeepEqual(snapshot.snapshot.measurementEvents, events);
  assert.ok((await verifyQuantitySnapshot(snapshot.snapshot)).ok);
  const rerun = adaptMeasurementDocument(snapshot.snapshot.sourceDocument);
  assert.ok('document' in rerun); assert.deepEqual(rerun.document, snapshot.snapshot.sourceDocument);
});
test('display formatting is explicit and never changes canonical engine amounts', () => {
  const result = calculateQuantities(q001(), request(allSelections())); assert.ok(result.ok);
  const floor = result.calculation.outputs.find(item => item.output === 'floor-area')!;
  const net = floor.total!.net;
  assert.deepEqual(formatQuantity({ value: net, unit: 'mm2' }, { unit: 'ft', fractionDigits: 2 }),
    { ok: true, formatted: '120.00', unitLabel: 'ft2', fractionDigits: 2 });
  assert.equal(floor.total!.net, net);
  assert.equal(formatQuantity({ value: 2, unit: 'count' }, { unit: 'ft', fractionDigits: 0 }).ok, false);
  assert.equal(formatQuantity({ value: 2.5, unit: 'count' }, { unit: 'count', fractionDigits: 0 }).ok, false);
  assert.equal(formatQuantity({ value: net, unit: 'mm2' }, { unit: 'm', fractionDigits: 13 }).ok, false);
});


test('snapshot rejects impossible or target-incompatible measurement events', async () => {
  const target = { entity: 'room', id: 'room-1', field: 'length' };
  const before = measured('12 ft', false);
  const invalidEvents = [
    { action: 'confirm', at: AT, before: unknownMeasurement('missing'), after: measured('12 ft') },
    { action: 'confirm', at: AT, before: measured('0 mm', false, 'elevation'), after: measured('0 mm', true, 'elevation') },
    { action: 'resolve-candidate', at: AT, before, candidateIndex: 99, after: measured('12 ft', false) },
    { action: 'confirm', at: AT, before, after: measured('13 ft') },
    { action: 'correct', at: AT, before, after: measured('13 ft') },
  ];
  for (const event of invalidEvents) {
    const result = await createQuantitySnapshot(q001(), request(allSelections()), metadata(), [{ target, event }]);
    assert.ok(!result.ok);
    assert.equal(result.errors[0].code, 'INVALID_SNAPSHOT_METADATA');
  }
  const sill = applyMeasurementAction(q001(), { entity: 'opening', id: 'door', field: 'sillHeight' }, { type: 'confirm', at: AT });
  assert.ok(sill.ok);
  assert.ok((await createQuantitySnapshot(sill.document, request(allSelections()), metadata(),
    [{ target: sill.target, event: sill.event }])).ok);
});
