import assert from 'node:assert/strict';
import test from 'node:test';
import { createDraft, createRegistry, insertDraft, addRoom, editField, commitField, renameRoom, switchUnit,
  previewDocument, setApplicability, adoptPhysicalDraft, adoptLegacyDraft, type PhysicalDraft } from '../client/src/features/physical-draft/state';
import { addOpening, editOpeningField, commitOpeningField, setOpeningBasis, deleteOpening, undoOpeningDelete,
  moveOpening, getOpeningFields } from '../client/src/features/physical-draft/openingCommands';
import { TAKEOFF_OUTPUTS, setOutputEnabled, setOutputTargets, selectAllCurrentTargets, setTakeoffBasis, setCrownGaps,
  getWasteField, editWaste, commitWaste, pendingWasteOutputs, wasteError, dismissTakeoffNotice,
  takeoffScopeRevision } from '../client/src/features/physical-draft/takeoffCommands';
import { captureMeasurementReview, confirmMeasurement, resolveMeasurementCandidate, correctMeasurement,
  captureApplicabilityReview, confirmApplicability, measurementReviewError } from '../client/src/features/physical-draft/reviewCommands';
import { parseRegistry, serializeRegistry, validateRegistry } from '../client/src/features/physical-draft/storage';
import { calculateQuantities } from '../shared/quantities/engine';
import { validateQuantityRequest } from '../shared/quantities/policy';
import { toMm, toMm2 } from '../shared/domain/units';
import { parseMeasurement } from '../shared/domain/parseMeasurement';
import { type MeasurementRef } from '../shared/domain/geometryValidation';
import { type QuantityOutput } from '../shared/domain/geometryValidation';
import { canonicalJson } from '../shared/quantities/canonicalJson';

const AT = '2026-09-09T01:00:00.000Z';
const LATER = '2026-09-09T01:01:00.000Z';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const ref = (field: 'length' | 'width' | 'ceilingHeight'): MeasurementRef => ({ entity: 'room', id: 'room', field });
function room(draft = createDraft('draft'), id = 'room') {
  draft = addRoom(draft, id);
  for (const [field, text] of [['length', '12 ft'], ['width', '10 ft'], ['ceilingHeight', '8 ft']] as const) {
    draft = commitField(editField(draft, id, field, text), id, field, AT);
  }
  return draft;
}
function fixture() {
  let draft = room();
  for (const [id, kind, width, height, sill, offset] of [['door', 'door', '3 ft', '7 ft', '0 ft', 2.5], ['window', 'window', '4 ft', '3 ft', '3 ft', 8]] as const) {
    draft = addOpening(draft, id, kind, 'room:top', toMm(offset, 'ft'), AT,
      kind === 'door' ? { appearance: { style: 'single', swingSide: 'right', swingDirection: 'inward', metadata: {} } } : {});
    for (const [field, text] of [['width', width], ['height', height], ['sillHeight', sill]] as const) {
      draft = commitOpeningField(editOpeningField(draft, id, field, text), id, field, AT);
    }
    draft = setOpeningBasis(draft, id, 'finished', AT);
  }
  for (const output of TAKEOFF_OUTPUTS) draft = selectAllCurrentTargets(setOutputEnabled(draft, output, true), output);
  return draft;
}
function calculate(draft: PhysicalDraft) {
  const result = calculateQuantities(previewDocument(draft), draft.request); assert.ok(result.ok); return result.calculation;
}
function output(draft: PhysicalDraft, name: QuantityOutput) { const found = calculate(draft).outputs.find(item => item.output === name); assert.ok(found); return found; }
function recover(draft: PhysicalDraft) {
  const result = parseRegistry(serializeRegistry(insertDraft(createRegistry(), draft))); assert.equal(result.status, 'recovered');
  if (result.status !== 'recovered') throw Error('Not recovered'); return result.registry.drafts[0];
}
function confirmAll(draft: PhysicalDraft) {
  for (const field of ['length', 'width', 'ceilingHeight'] as const) draft = confirmMeasurement(draft, captureMeasurementReview(draft, ref(field)), AT);
  for (const opening of draft.document.openings) for (const field of ['width', 'height', 'sillHeight'] as const) {
    draft = confirmMeasurement(draft, captureMeasurementReview(draft, { entity: 'opening', id: opening.id, field }), AT);
  }
  for (const field of ['ceiling', 'walls', 'crownPath'] as const) draft = confirmApplicability(draft, captureApplicabilityReview(draft, 'room', field), AT);
  return draft;
}

test('new and empty work scope means none; enable creates empty targets and explicit all captures current IDs only', () => {
  const draft = room(); assert.deepEqual(draft.request.selections, []); assert.equal(calculate(draft).status, 'empty');
  const enabled = setOutputEnabled(draft, 'floor-area', true);
  assert.deepEqual(enabled.request.selections, [{ output: 'floor-area', roomIds: [], wasteFraction: 0 }]);
  assert.deepEqual(calculate(enabled).outputs, []); assert.equal(calculate(enabled).status, 'empty');
  const selected = selectAllCurrentTargets(enabled, 'floor-area');
  const extra = addRoom(selected, 'other'); assert.deepEqual(extra.request, selected.request);
  const allNow = selectAllCurrentTargets(extra, 'floor-area');
  assert.deepEqual(allNow.request.selections[0], { output: 'floor-area', roomIds: ['room', 'other'], wasteFraction: 0 });
  assert.deepEqual(setOutputEnabled(allNow, 'floor-area', false).request.selections, []);
});

test('custom scope, basis and waste survive room/name/dimension/unit edits and addRoom', () => {
  let draft = fixture(); draft = setOutputTargets(draft, 'net-wall-area', ['room:top']);
  draft = setTakeoffBasis(draft, 'rough'); draft = commitWaste(editWaste(draft, 'floor-area', '10'), 'floor-area');
  const request = clone(draft.request);
  draft = renameRoom(draft, 'room', 'Renamed'); draft = addRoom(draft, 'new');
  draft = switchUnit(editField(draft, 'room', 'length', '13 ft'), 'm');
  assert.deepEqual(draft.request, request); assert.deepEqual(recover(draft).request, request);
});

test('wrong-kind, missing, duplicate and non-attached targets are rejected atomically', () => {
  const draft = fixture(), before = canonicalJson(draft);
  assert.throws(() => setOutputTargets(draft, 'floor-area', ['absent']), /existing distinct/);
  assert.throws(() => setOutputTargets(draft, 'net-wall-area', ['room:top', 'room:top']), /existing distinct/);
  assert.throws(() => setOutputTargets(draft, 'door-casing', [{ openingId: 'window', wallFaceId: 'room:top' }]), /requested kind/);
  assert.throws(() => setCrownGaps(draft, [{ openingId: 'door', wallFaceId: 'room:bottom' }]), /requested kind/);
  assert.throws(() => setOutputTargets(draft, 'floor-area', [{ openingId: 'door', wallFaceId: 'room:top' }]), /string/);
  assert.equal(canonicalJson(draft), before);
});

test('explicit UI fixture preserves engine gross, deductions, net, casing, trim and inventory arithmetic', () => {
  const draft = fixture();
  for (const [name, expected] of [['floor-area', 120], ['ceiling-area', 120], ['gross-wall-area', 352], ['net-wall-area', 319]] as const) {
    assert.ok(Math.abs(output(draft, name).total!.net - toMm2(expected, 'ft')) < 1e-6);
  }
  for (const [name, expected] of [['baseboard', 41], ['base-shoe', 41], ['crown', 44], ['door-casing', 17], ['window-casing', 14]] as const) {
    assert.ok(Math.abs(output(draft, name).total!.net - toMm(expected, 'ft')) < 1e-6);
  }
  assert.ok(Math.abs(output(draft, 'net-wall-area').total!.effectiveDeductions - toMm2(33, 'ft')) < 1e-6);
  assert.equal(output(draft, 'opening-inventory').total!.net, 2);
  let top = setOutputTargets(draft, 'gross-wall-area', ['room:top']); top = setOutputTargets(top, 'net-wall-area', ['room:top']);
  top = setOutputTargets(top, 'baseboard', ['room:top']);
  assert.ok(Math.abs(output(top, 'gross-wall-area').total!.net - toMm2(96, 'ft')) < 1e-6);
  assert.ok(Math.abs(output(top, 'net-wall-area').total!.net - toMm2(63, 'ft')) < 1e-6);
  assert.ok(Math.abs(output(top, 'baseboard').total!.net - toMm(9, 'ft')) < 1e-6);
});

test('10 percent commits as 0.1 and engine applies allowance once after aggregate net', () => {
  const draft = commitWaste(editWaste(fixture(), 'floor-area', '10.00'), 'floor-area');
  assert.equal(getWasteField(draft, 'floor-area').text, '10.00');
  const result = output(draft, 'floor-area').total!;
  assert.equal(result.wasteFraction, 0.1); assert.ok(Math.abs(result.net - toMm2(120, 'ft')) < 1e-6);
  assert.ok(Math.abs(result.allowance! - toMm2(12, 'ft')) < 1e-6); assert.ok(Math.abs(result.adjusted! - toMm2(132, 'ft')) < 1e-6);
  assert.equal(commitWaste(draft, 'floor-area'), draft);
  assert.throws(() => editWaste(draft, 'opening-inventory', '10'), /no waste/);
});

test('unfinished or invalid percent is retained and never replaces committed waste or other output edits', () => {
  const draft = commitWaste(editWaste(fixture(), 'floor-area', '10'), 'floor-area');
  for (const text of ['', '5.', '-', '-1', '1e2', 'NaN', 'Infinity', '10%', '1/2']) {
    const dirty = editWaste(draft, 'floor-area', text);
    assert.ok(wasteError(getWasteField(dirty, 'floor-area'))); assert.throws(() => commitWaste(dirty, 'floor-area'));
    assert.deepEqual(dirty.request, draft.request); assert.deepEqual(pendingWasteOutputs(dirty), ['floor-area']);
    assert.equal(getWasteField(recover(dirty), 'floor-area').text, text);
    assert.equal(getWasteField(switchUnit(dirty, 'm'), 'floor-area').text, text);
  }
  const pendingValid = editWaste(draft, 'floor-area', '12'); assert.equal(wasteError(getWasteField(pendingValid, 'floor-area')), null);
  assert.deepEqual(pendingWasteOutputs(pendingValid), ['floor-area']);
  const zero = commitWaste(editWaste(pendingValid, 'floor-area', '0'), 'floor-area');
  assert.equal(output(zero, 'floor-area').total!.allowance, 0);
});

test('missing window height keeps independent results and exposes only a partial 256-square-foot wall subtotal', () => {
  const draft = fixture(), dirty = editOpeningField(draft, 'window', 'height', '');
  for (const next of [dirty, commitOpeningField(dirty, 'window', 'height', AT)]) {
    assert.ok(output(next, 'floor-area').total); assert.ok(output(next, 'gross-wall-area').total);
    const net = output(next, 'net-wall-area'); assert.equal(net.total, null); assert.equal(net.completeness, 'partial');
    assert.equal(net.subtotalStatus, 'provisional'); assert.equal(net.excludedTargetIds.length, 1); assert.equal(net.includedTargetIds.length, 3);
    assert.ok(Math.abs(net.subtotal!.net - toMm2(256, 'ft')) < 1e-6);
  }
});

test('explicit measurement review then independent model review changes provisional quantities to complete', () => {
  const draft = fixture(); assert.equal(output(draft, 'net-wall-area').status, 'provisional');
  const confirmed = confirmAll(draft);
  for (const result of calculate(confirmed).outputs) assert.equal(result.status, 'complete');
  assert.deepEqual(recover(confirmed), confirmed);
  assert.equal(confirmed.reviewState!.applicabilityEvents.length, 3);
  const length = confirmed.document.rooms[0].length; assert.equal(length.state, 'known');
  if (length.state === 'known') assert.equal(length.provenance.source, 'manual');
  assert.equal(confirmed.fields.room.length.text, draft.fields.room.length.text);
});

test('measurement confirmation is blocked for unknown or dirty fields and stale draft/revision/snapshot tokens', () => {
  const unknown = addRoom(createDraft('unknown'), 'room');
  assert.match(measurementReviewError(unknown, ref('length'))!, /known measurement/);
  assert.throws(() => confirmMeasurement(unknown, captureMeasurementReview(unknown, ref('length')), AT), /known measurement/);
  const draft = room(), token = captureMeasurementReview(draft, ref('length'));
  const dirty = editField(draft, 'room', 'length', '13 ft');
  assert.throws(() => confirmMeasurement(dirty, captureMeasurementReview(dirty, ref('length')), AT), /raw measurement edit/);
  assert.throws(() => confirmMeasurement(renameRoom(draft, 'room', 'New name'), token, AT), /changed after/);
  assert.throws(() => confirmMeasurement({ ...draft, id: 'different' }, token, AT), /changed after/);
  const forged = clone(token); const parsed = parseMeasurement('14 ft'); assert.ok(parsed.ok); forged.before = parsed.measurement;
  assert.throws(() => confirmMeasurement(draft, forged, AT), /changed after/);
});

test('candidate resolution retains alternatives, is never automatically confirmed, and rejects stale candidate review', () => {
  const source = { rooms: [{ id: 'room', x: 0, y: 0, width: 240, height: 200, objects: [
    { id: 'door', type: 'door', wallSide: 'top', position: 50, size: 80, doorProperties: { width: 36, height: 80, style: 'single', swingSide: 'right', swingDirection: 'inward' } },
  ] }] };
  const draft = adoptLegacyDraft(source, 'import'); const target = { entity: 'opening' as const, id: 'door', field: 'width' as const };
  const token = captureMeasurementReview(draft, target); assert.equal(token.before.state, 'needs-review');
  assert.throws(() => confirmMeasurement(draft, token, AT), /candidate/);
  assert.throws(() => resolveMeasurementCandidate(draft, token, 99, AT), /explicit existing candidate/);
  const resolved = resolveMeasurementCandidate(draft, token, 1, AT); const width = resolved.document.openings[0].width;
  assert.equal(width.state, 'known'); if (width.state === 'known') assert.equal(width.provenance.confirmation.status, 'unconfirmed');
  assert.deepEqual(resolved.events.at(-1)!.event.before, token.before); assert.equal(resolved.events.at(-1)!.event.candidateIndex, 1);
  assert.throws(() => confirmMeasurement(resolved, token, AT), /changed after/);
  assert.deepEqual(recover(resolved).source.original, source);
  const confirmed = confirmMeasurement(resolved, captureMeasurementReview(resolved, target), LATER);
  assert.deepEqual(recover(confirmed), confirmed);
});

test('correction clears only the changed confirmation and never removes geometry or application blockers', () => {
  const draft = confirmAll(fixture()), other = clone(draft.document.rooms[0].width);
  const corrected = correctMeasurement(draft, captureMeasurementReview(draft, ref('length')), '1 ft', 'ft', LATER);
  assert.deepEqual(corrected.document.rooms[0].width, other);
  const length = corrected.document.rooms[0].length; assert.equal(length.state, 'known');
  if (length.state === 'known') assert.equal(length.provenance.confirmation.status, 'unconfirmed');
  assert.equal(corrected.document.openings.length, 2); assert.equal(output(corrected, 'net-wall-area').total, null);
  const confirmed = confirmMeasurement(corrected, captureMeasurementReview(corrected, ref('length')), LATER);
  assert.equal(output(confirmed, 'net-wall-area').total, null); assert.deepEqual(recover(confirmed), confirmed);
});

test('room and opening raw corrections preserve review history and require separate reconfirmation', () => {
  let draft = confirmAll(fixture());
  draft = commitField(editField(draft, 'room', 'length', ''), 'room', 'length', AT);
  assert.equal(recover(draft).document.rooms[0].length.state, 'unknown');
  draft = commitField(editField(draft, 'room', 'length', '12 ft'), 'room', 'length', AT);
  const length = draft.document.rooms[0].length; assert.equal(length.state, 'known');
  if (length.state === 'known') assert.equal(length.provenance.confirmation.status, 'unconfirmed');
  draft = commitOpeningField(editOpeningField(draft, 'window', 'height', ''), 'window', 'height', AT);
  assert.equal(recover(draft).document.openings[1].height.state, 'unknown');
  draft = commitOpeningField(editOpeningField(draft, 'window', 'height', '3 ft'), 'window', 'height', AT);
  assert.deepEqual(recover(draft), draft);
});

test('separate unknown/unsupported model declarations cannot be confirmed and leave independent floor quantities usable', () => {
  const draft = confirmAll(fixture());
  const unsupported = setApplicability(draft, 'room', 'ceiling', { value: 'unsupported', source: 'manual', detail: 'Vaulted ceiling', confirmation: { status: 'unconfirmed' } }, AT);
  assert.equal(output(unsupported, 'ceiling-area').total, null); assert.ok(output(unsupported, 'floor-area').total); assert.ok(output(unsupported, 'net-wall-area').total);
  assert.throws(() => confirmApplicability(unsupported, captureApplicabilityReview(unsupported, 'room', 'ceiling'), AT), /cannot be confirmed/);
  assert.deepEqual(recover(unsupported), unsupported);
  assert.throws(() => setApplicability(draft, 'room', 'walls', { value: 'vertical-uniform', source: 'manual', confirmation: { status: 'confirmed', confirmedAt: AT } }, AT), /separate review/);
});

test('model review tokens are stale after dimension or declaration edits and changing model evidence requires new confirmation', () => {
  const draft = fixture(), token = captureApplicabilityReview(draft, 'room', 'walls');
  assert.throws(() => confirmApplicability(editField(draft, 'room', 'length', '13 ft'), token, AT), /changed after/);
  const declared = setApplicability(draft, 'room', 'walls', { value: 'vertical-uniform', source: 'manual', detail: 'Uniform finished-wall height', confirmation: { status: 'unconfirmed' } }, AT);
  assert.throws(() => confirmApplicability(declared, token, AT), /changed after/);
  const confirmed = confirmApplicability(declared, captureApplicabilityReview(declared, 'room', 'walls'), AT);
  assert.equal(confirmed.reviewState!.applicabilityEvents.length, 2); assert.deepEqual(recover(confirmed), confirmed);
});

test('deleting selected opening prunes inventory, casing and crown targets atomically with a visible notice', () => {
  let draft = fixture(); draft = setCrownGaps(draft, [{ openingId: 'door', wallFaceId: 'room:top' }]);
  draft = editWaste(draft, 'floor-area', '12.'); const before = clone(draft.request);
  const deleted = deleteOpening(draft, 'door', AT);
  assert.equal(deleted.localEditRevision, draft.localEditRevision + 1); assert.ok(validateQuantityRequest(deleted.document, deleted.request).ok);
  assert.equal(deleted.takeoffState!.notice!.removedTargets, 3); assert.match(deleted.takeoffState!.notice!.message, /deleted/);
  assert.deepEqual(getWasteField(deleted, 'floor-area'), getWasteField(draft, 'floor-area'));
  const restored = undoOpeningDelete(renameRoom(deleted, 'room', 'Unrelated edit'), LATER);
  assert.deepEqual(restored.request, before); assert.equal(restored.document.rooms[0].name, 'Unrelated edit');
  assert.deepEqual(recover(restored), restored); assert.equal(dismissTakeoffNotice(restored).takeoffState!.notice, null);
});

test('bounded deletion undo never overwrites later scope choices even when changed away and back', () => {
  const deleted = deleteOpening(fixture(), 'door', AT), postDelete = clone(deleted.request);
  let edited = setOutputTargets(deleted, 'floor-area', []); edited = setOutputTargets(edited, 'floor-area', ['room']);
  assert.deepEqual(edited.request, postDelete); assert.ok(takeoffScopeRevision(edited) > takeoffScopeRevision(deleted));
  const restored = undoOpeningDelete(edited, AT); assert.deepEqual(restored.request, postDelete);
  assert.ok(restored.document.openings.some(opening => opening.id === 'door')); assert.deepEqual(recover(restored), restored);
});

test('bounded deletion undo preserves later unfinished waste and does not silently restore stale scope', () => {
  const deleted = deleteOpening(fixture(), 'door', AT), edited = editWaste(deleted, 'floor-area', '11.');
  const restored = undoOpeningDelete(edited, AT);
  assert.deepEqual(restored.request, deleted.request); assert.equal(getWasteField(restored, 'floor-area').text, '11.');
  assert.deepEqual(pendingWasteOutputs(restored), ['floor-area']);
});

test('cross-wall moves prune old face targets but retain selected physical inventory ID, work, waste and unrelated targets', () => {
  let draft = fixture(); draft = setCrownGaps(draft, [{ openingId: 'door', wallFaceId: 'room:top' }]);
  const moved = moveOpening(draft, 'door', 'room:bottom', toMm(2.5, 'ft'), AT);
  assert.equal(moved.localEditRevision, draft.localEditRevision + 1); assert.ok(validateQuantityRequest(moved.document, moved.request).ok);
  assert.equal(moved.takeoffState!.notice!.removedTargets, 2);
  const casing = moved.request.selections.find(item => item.output === 'door-casing'); assert.ok(casing && 'faces' in casing); assert.deepEqual(casing.faces, []);
  assert.equal(output(moved, 'opening-inventory').total!.net, 2); assert.deepEqual(recover(moved), moved);
});

test('shared opening all-current casing selects both attachment faces while inventory counts its identity once', () => {
  let draft = room(fixture(), 'other'); const door = draft.document.openings.find(opening => opening.id === 'door')!;
  door.attachments.push({ wallFaceId: 'other:top', anchor: 'center', offsetMm: toMm(2.5, 'ft') });
  draft = selectAllCurrentTargets(draft, 'door-casing');
  const casing = draft.request.selections.find(item => item.output === 'door-casing'); assert.ok(casing && 'faces' in casing);
  assert.equal(casing.faces.length, 2); assert.equal(output(draft, 'opening-inventory').total!.net, 2);
  assert.ok(Math.abs(output(draft, 'door-casing').total!.net - toMm(34, 'ft')) < 1e-6);
  const deleted = deleteOpening(draft, 'door', AT); assert.equal(deleted.takeoffState!.notice!.removedTargets, 3);
  const restored = undoOpeningDelete(deleted, AT); assert.deepEqual(restored.request, draft.request);
});

test('explicit crown gaps cannot invent full-height deductions and mismatched basis never gets relabeled', () => {
  let draft = fixture(); draft = setCrownGaps(draft, [{ openingId: 'door', wallFaceId: 'room:top' }]);
  assert.equal(output(draft, 'crown').total, null);
  draft = setTakeoffBasis(draft, 'nominal'); assert.equal(output(draft, 'net-wall-area').total, null);
  assert.equal(draft.document.openings[0].measureBasis, 'finished'); assert.ok(output(draft, 'floor-area').total);
});

test('recovery rejects forged current confirmations, altered review events, declared models and clean waste text', () => {
  const draft = confirmAll(fixture());
  for (const mutate of [
    (item: PhysicalDraft) => { const value = item.document.rooms[0].length; if (value.state === 'known') value.provenance.confirmation = { status: 'confirmed', confirmedAt: LATER }; },
    (item: PhysicalDraft) => { const value = item.events.at(-1)!.event.after; value.provenance.confirmation = { status: 'confirmed', confirmedAt: LATER }; },
    (item: PhysicalDraft) => { item.document.calculationContract!.rooms.room.walls.source = 'manual'; },
    (item: PhysicalDraft) => { item.reviewState!.applicabilityEvents.at(-1)!.after.confirmation = { status: 'confirmed', confirmedAt: LATER }; },
    (item: PhysicalDraft) => { item.takeoffState!.wasteFields['floor-area'] = { text: '10', dirty: false }; },
  ]) {
    const forged = clone(draft); mutate(forged);
    assert.equal(validateRegistry(insertDraft(createRegistry(), forged)).status, 'corrupt');
  }
});

test('older supported caches round-trip without adding scope/review state; confirmed physical imports require matching source', () => {
  const old = room(); assert.equal(old.takeoffState, undefined); assert.equal(old.reviewState, undefined); assert.deepEqual(recover(old), old);
  const confirmed = confirmAll(fixture()), imported = adoptPhysicalDraft(confirmed.document, 'import');
  assert.deepEqual(recover(imported).document, imported.document);
  const reviewed = confirmApplicability(imported, captureApplicabilityReview(imported, 'room', 'walls'), AT); assert.equal(reviewed, imported);
  const forged = clone(imported); forged.document.calculationContract!.rooms.room.walls.confirmation = { status: 'confirmed', confirmedAt: LATER };
  assert.equal(validateRegistry(insertDraft(createRegistry(), forged)).status, 'corrupt');
  const forgedNew = room(); const length = forgedNew.document.rooms[0].length;
  if (length.state === 'known') length.provenance.confirmation = { status: 'confirmed', confirmedAt: AT };
  assert.equal(validateRegistry(insertDraft(createRegistry(), forgedNew)).status, 'corrupt');
});

test('confirmed opening review survives deletion and bounded restore with its historical actions and raw fields', () => {
  const draft = confirmAll(fixture()), fields = clone(getOpeningFields(draft, 'door'));
  const recoveredDeleted = recover(deleteOpening(draft, 'door', AT)); const restored = undoOpeningDelete(recoveredDeleted, LATER);
  assert.deepEqual(recover(restored), restored); assert.deepEqual(getOpeningFields(restored, 'door'), fields); assert.deepEqual(restored.events, draft.events);
});

test('new rooms can be reviewed after existing review evidence without rewriting prior origins', () => {
  let draft = confirmAll(fixture()); const history = clone(draft.reviewState);
  draft = room(draft, '__proto__');
  draft = confirmApplicability(draft, captureApplicabilityReview(draft, '__proto__', 'walls'), AT);
  draft = confirmMeasurement(draft, captureMeasurementReview(draft, { entity: 'room', id: '__proto__', field: 'length' }), AT);
  assert.deepEqual(draft.reviewState!.measurementOrigins, history!.measurementOrigins); assert.deepEqual(recover(draft), draft);
});
