import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyMeasurementAction, transitionMeasurement } from '../shared/domain/measurementActions';
import { unknownMeasurement, type Dimension } from '../shared/domain/measurements';
import { adaptMeasurementDocument } from '../shared/compatibility/legacyDocument';
import { evaluateQuantityReadiness } from '../shared/quantities/readiness';
import { AT, q001, measured, request, freezeDeep } from './fixtures/physical';

const later = '2026-09-06T14:15:00.000Z';
function conflict(): Dimension {
  return { state: 'needs-review', valueMm: null, reason: 'Original sources disagree', candidates: [
    { label: 'imported width', valueMm: measured('32 in').valueMm,
      provenance: { ...measured('32 in', false).provenance, source: 'imported', confirmation: { status: 'needs-review' } } },
    { label: 'model width', valueMm: measured('3 ft').valueMm,
      provenance: { ...measured('3 ft', false).provenance, source: 'imported', confirmation: { status: 'needs-review' } } },
  ] };
}
test('known confirmation is explicit, timestamped, detached and repeatable', () => {
  const measurement = freezeDeep(measured('32 in', false)), action = freezeDeep({ type: 'confirm', at: AT });
  const before = structuredClone(measurement), result = transitionMeasurement(measurement, action);
  assert.ok(result.ok);
  assert.deepEqual(result.measurement.provenance.confirmation, { status: 'confirmed', confirmedAt: AT });
  assert.equal(result.measurement.valueMm, before.valueMm);
  assert.deepEqual(result.event.before, before);
  assert.deepEqual(result, transitionMeasurement(measurement, action));
  result.event.after.provenance.input = 'event-only';
  assert.equal(result.measurement.provenance.input, '32 in');
  assert.deepEqual(measurement, before);
});

test('unknown or conflicting measurements cannot be confirmed implicitly', () => {
  for (const measurement of [unknownMeasurement('missing'), conflict()]) {
    const result = transitionMeasurement(measurement, { type: 'confirm', at: AT });
    assert.ok(!result.ok); assert.equal(result.code, 'CANNOT_CONFIRM_UNRESOLVED');
  }
});

test('candidate resolution requires an explicit existing index and never chooses the first', () => {
  const measurement = freezeDeep(conflict());
  for (const candidateIndex of [undefined, -1, .5, 2, '0']) {
    assert.equal(transitionMeasurement(measurement, { type: 'resolve-candidate', at: AT, candidateIndex }).ok, false);
  }
  const resolved = transitionMeasurement(measurement, { type: 'resolve-candidate', at: AT, candidateIndex: 1 });
  assert.ok(resolved.ok);
  assert.equal(resolved.measurement.valueMm, measured('3 ft').valueMm);
  assert.equal(resolved.measurement.provenance.source, 'imported');
  assert.deepEqual(resolved.measurement.provenance.confirmation, { status: 'unconfirmed' });
  assert.equal(resolved.event.candidateIndex, 1);
  assert.deepEqual(resolved.event.before, measurement);
  const confirmed = transitionMeasurement(resolved.measurement, { type: 'confirm', at: later });
  assert.ok(confirmed.ok);
  assert.equal(confirmed.measurement.provenance.confirmation.status, 'confirmed');
});

test('candidate evidence and returned measurement do not alias the source or event', () => {
  const measurement = conflict(), before = structuredClone(measurement);
  const result = transitionMeasurement(measurement, { type: 'resolve-candidate', at: AT, candidateIndex: 0 });
  assert.ok(result.ok); assert.equal(result.event.before.state, 'needs-review');
  if (result.event.before.state !== 'needs-review') throw new Error('review');
  result.event.before.candidates[0].provenance.components[0].text = 'changed event';
  result.measurement.provenance.components[0].text = 'changed result';
  assert.deepEqual(measurement, before);
  assert.equal(result.event.after.provenance.components[0].text, '32');
});

test('correction invalidates previous confirmation and retains original evidence in the event', () => {
  const before = { ...measured('32 in'), provenance: { ...measured('32 in').provenance, source: 'imported' as const } };
  const replacement = freezeDeep(measured('34 in'));
  const result = transitionMeasurement(freezeDeep(before), { type: 'correct', at: later, replacement });
  assert.ok(result.ok);
  assert.equal(result.measurement.valueMm, measured('34 in').valueMm);
  assert.equal(result.measurement.provenance.source, 'manual');
  assert.deepEqual(result.measurement.provenance.confirmation, { status: 'unconfirmed' });
  assert.deepEqual(result.event.before, before);
  assert.equal(result.event.at, later);
  assert.equal(replacement.provenance.confirmation.status, 'confirmed');
});

test('even a same-value correction resets confirmation; unknown can be filled explicitly', () => {
  const replacement = measured('3 ft');
  for (const current of [replacement, unknownMeasurement('missing')]) {
    const result = transitionMeasurement(current, { type: 'correct', at: AT, replacement });
    assert.ok(result.ok);
    assert.equal(result.measurement.provenance.confirmation.status, 'unconfirmed');
  }
});

test('corrections require positive known new evidence, with zero allowed only for elevations', () => {
  const current = measured('3 ft');
  const imported = { ...current, provenance: { ...current.provenance, source: 'imported' } };
  for (const replacement of [unknownMeasurement('missing'), conflict(), imported, measured('0 mm', true, 'elevation'), {}]) {
    const result = transitionMeasurement(current, { type: 'correct', at: AT, replacement });
    assert.ok(!result.ok); assert.equal(result.code, 'INVALID_CORRECTION');
  }
  const zero = measured('0 mm', true, 'elevation');
  const elevation = transitionMeasurement(zero, { type: 'correct', at: AT, replacement: zero }, 'elevation');
  assert.ok(elevation.ok); assert.equal(elevation.measurement.valueMm, 0);
});

test('actions reject missing/malformed timestamps, unknown actions and extra fields', () => {
  for (const action of [null, {}, { type: 'confirm' }, { type: 'confirm', at: 'yesterday' },
    { type: 'confirm', at: AT, implicitly: true }, { type: 'choose-default', at: AT }]) {
    const result = transitionMeasurement(measured('3 ft'), action);
    assert.ok(!result.ok); assert.equal(result.code, 'INVALID_MEASUREMENT_ACTION');
  }
});

test('room resize returns invalid opening fit without moving openings or changing unrelated evidence', () => {
  const doc = freezeDeep(q001()), before = structuredClone(doc);
  const target = { entity: 'room', id: 'room-1', field: 'length' };
  const result = applyMeasurementAction(doc, target, { type: 'correct', at: later, replacement: measured('3 ft') });
  assert.ok(result.ok);
  assert.ok(result.validation.checks.some(check => check.code === 'HORIZONTAL_FIT' && check.status === 'invalid'));
  assert.deepEqual(result.document.openings, before.openings);
  assert.deepEqual(result.document.rooms[0].ceilingHeight, before.rooms[0].ceilingHeight);
  assert.deepEqual(result.document.rooms[0].metadata, before.rooms[0].metadata);
  assert.equal(result.document.rooms[0].length.state, 'known');
  if (result.document.rooms[0].length.state === 'known') assert.equal(result.document.rooms[0].length.provenance.confirmation.status, 'unconfirmed');
  assert.deepEqual(doc, before);
  assert.deepEqual(result, applyMeasurementAction(doc, target, { type: 'correct', at: later, replacement: measured('3 ft') }));
});

test('document actions validate explicit targets and require v2', () => {
  const doc = q001(), action = { type: 'confirm', at: AT };
  for (const target of [{ entity: 'room', id: 'missing', field: 'length' },
    { entity: 'room', id: 'room-1', field: 'sillHeight' }, { entity: 'opening', id: 'door', field: 'size' }, {}]) {
    const result = applyMeasurementAction(doc, target, action);
    assert.ok(!result.ok); assert.equal(result.code, 'INVALID_MEASUREMENT_TARGET');
  }
  const old = applyMeasurementAction({ rooms: [] }, { entity: 'room', id: 'room-1', field: 'length' }, action);
  assert.ok(!old.ok); assert.equal(old.code, 'V2_REQUIRED');
  const malformed = applyMeasurementAction({ schemaVersion: 2 }, { entity: 'room', id: 'room-1', field: 'length' }, action);
  assert.ok(!malformed.ok); assert.equal(malformed.code, 'INVALID_DOCUMENT');
});

test('current readiness clears after resolution and confirmation despite retained historical warnings', () => {
  const doc = q001(); doc.openings = [doc.openings[0]]; doc.openings[0].width = conflict();
  doc.review.push({ code: 'conflicting-widths', roomId: 'room-1', openingId: 'door', field: 'width', message: 'Historical import conflict' });
  const target = { entity: 'opening', id: 'door', field: 'width' };
  const requested = request([{ output: 'baseboard', wallFaceIds: ['room-1:top'], wasteFraction: 0 }]);
  const initial = evaluateQuantityReadiness(doc, requested); assert.ok(initial.ok);
  assert.equal(initial.outputs[0].numericBasis.status, 'insufficient');
  const resolved = applyMeasurementAction(doc, target, { type: 'resolve-candidate', at: AT, candidateIndex: 1 });
  assert.ok(resolved.ok);
  const provisional = evaluateQuantityReadiness(resolved.document, requested); assert.ok(provisional.ok);
  assert.equal(provisional.outputs[0].numericBasis.status, 'sufficient');
  assert.equal(provisional.outputs[0].confirmation.status, 'provisional');
  const confirmed = applyMeasurementAction(resolved.document, target, { type: 'confirm', at: later });
  assert.ok(confirmed.ok);
  const ready = evaluateQuantityReadiness(confirmed.document, requested); assert.ok(ready.ok);
  assert.equal(ready.outputs[0].confirmation.status, 'confirmed');
  assert.deepEqual(confirmed.document.review, doc.review);
  assert.ok(confirmed.validation.findings.some(f => f.code === 'HISTORICAL_COMPATIBILITY_REVIEW'));
});

test('legacy original JSON, unknown metadata and v2 reprocessing survive explicit correction', () => {
  const legacy = JSON.parse('{"id":9,"name":"Old sketch","extra":{"__proto__":{"keep":true}},"rooms":[{"id":"r","width":240,"height":200,"x":-10,"y":20,"objects":[{"id":"d","type":"door","wallSide":"top","position":25,"size":60,"doorProperties":{"width":32,"height":80,"style":"double","swingDirection":"outward","swingSide":"right","note":"keep"}}]}]}');
  const original = structuredClone(legacy), adapted = adaptMeasurementDocument(freezeDeep(legacy));
  assert.ok('document' in adapted);
  const doc = freezeDeep(adapted.document), before = structuredClone(doc);
  const result = applyMeasurementAction(doc, { entity: 'opening', id: doc.openings[0].id, field: 'width' },
    { type: 'correct', at: later, replacement: measured('34 in') });
  assert.ok(result.ok);
  assert.deepEqual(result.document.compatibility?.original, original);
  assert.deepEqual(result.document.openings[0].appearance, before.openings[0].appearance);
  assert.deepEqual(result.document.openings[0].attachments, before.openings[0].attachments);
  assert.deepEqual(result.event.before, before.openings[0].width);
  assert.equal(result.event.after.provenance.source, 'manual');
  assert.equal(Object.prototype.hasOwnProperty.call(result.document.compatibility!.original.extra, '__proto__'), true);
  const rerun = adaptMeasurementDocument(result.document); assert.ok('document' in rerun);
  assert.deepEqual(rerun.document, result.document);
  assert.deepEqual(doc, before); assert.deepEqual(legacy, original);
});
