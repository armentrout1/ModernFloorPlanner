import assert from 'node:assert/strict';
import test from 'node:test';
import { addRoom, createDraft, createRegistry, insertDraft, selectedDraft, updateDraft, selectDraft,
  editField, commitField, renameRoom, switchUnit, previewDocument, adoptPhysicalDraft,
  type PhysicalDraft, type RoomField } from '../client/src/features/physical-draft/state';
import { addOpening, editOpeningField, commitOpeningField, getOpeningFields, setOpeningBasis,
  deleteOpening, undoOpeningDelete, type OpeningField } from '../client/src/features/physical-draft/openingCommands';
import { setOutputEnabled, selectAllCurrentTargets, editWaste, commitWaste, getWasteField,
  takeoffScopeRevision, pendingWasteOutputs } from '../client/src/features/physical-draft/takeoffCommands';
import { captureFieldRevert, revertField, type FieldRevertTarget, type FieldRevertToken } from '../client/src/features/physical-draft/fieldRevert';
import { captureMeasurementReview, confirmMeasurement, captureApplicabilityReview, confirmApplicability } from '../client/src/features/physical-draft/reviewCommands';
import { parseRegistry, serializeRegistry, PHYSICAL_DRAFT_STORAGE_KEY } from '../client/src/features/physical-draft/storage';
import { createPhysicalDraftStore, type DraftStorage } from '../client/src/features/physical-draft/store';
import { calculateQuantities } from '../shared/quantities/engine';
import { toMm, toMm2 } from '../shared/domain/units';
import type { QuantityOutput } from '../shared/domain/geometryValidation';

const AT = '2026-09-09T02:00:00.000Z';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const roomTarget = (field: RoomField = 'length', id = 'room'): FieldRevertTarget => ({ kind: 'room', id, field });
const openingTarget = (field: OpeningField = 'width', id = 'door'): FieldRevertTarget => ({ kind: 'opening', id, field });
const wasteTarget = (output: QuantityOutput = 'floor-area'): FieldRevertTarget => ({ kind: 'waste', output });
function fixture() {
  let draft = addRoom(createDraft('draft'), 'room', 'Alpha');
  for (const [field, text] of [['length', '12 ft'], ['width', '10 ft'], ['ceilingHeight', '8 ft']] as const) {
    draft = commitField(editField(draft, 'room', field, text), 'room', field, AT);
  }
  draft = addOpening(draft, 'door', 'door', 'room:top', toMm(2.5, 'ft'), AT,
    { appearance: { style: 'double', swingSide: 'left', swingDirection: 'outward', metadata: { label: 'Keep appearance' } } });
  for (const [field, text] of [['width', '3 ft'], ['height', '7 ft'], ['sillHeight', '0 ft']] as const) {
    draft = commitOpeningField(editOpeningField(draft, 'door', field, text), 'door', field, AT);
  }
  draft = setOpeningBasis(draft, 'door', 'finished', AT);
  for (const output of ['floor-area', 'ceiling-area', 'gross-wall-area', 'net-wall-area', 'door-casing', 'opening-inventory'] as const) {
    draft = selectAllCurrentTargets(setOutputEnabled(draft, output, true), output);
  }
  return draft;
}
function output(draft: PhysicalDraft, name: QuantityOutput) {
  const result = calculateQuantities(previewDocument(draft), draft.request); assert.ok(result.ok);
  const found = result.calculation.outputs.find(item => item.output === name); assert.ok(found); return found;
}
function recover(draft: PhysicalDraft) {
  const parsed = parseRegistry(serializeRegistry(insertDraft(createRegistry(), draft)));
  assert.equal(parsed.status, 'recovered'); if (parsed.status !== 'recovered') throw Error('Expected recovery');
  return parsed.registry.drafts[0];
}
function revert(draft: PhysicalDraft, target: FieldRevertTarget) { return revertField(draft, captureFieldRevert(draft, target)); }
function onlyRawChanged(before: PhysicalDraft, after: PhysicalDraft, target: FieldRevertTarget) {
  const allowed = clone(before); allowed.localEditRevision++;
  if (target.kind === 'room') allowed.fields[target.id][target.field] = clone(after.fields[target.id][target.field]);
  else if (target.kind === 'opening') allowed.openingFields![target.id][target.field] = clone(getOpeningFields(after, target.id)[target.field]);
  else {
    allowed.takeoffState!.wasteFields[target.output] = clone(getWasteField(after, target.output));
    allowed.takeoffState!.scopeRevision++;
  }
  assert.deepEqual(after, allowed, 'Only the exact raw field and permitted monotonic counters may change');
}

test('invalid room Revert restores 12 ft and independent 120 sq ft without changing domain or evidence', () => {
  const before = editField(fixture(), 'room', 'length', '12 ft -'), frozen = clone(before);
  assert.equal(output(before, 'floor-area').total, null);
  const after = revert(before, roomTarget());
  assert.deepEqual(after.fields.room.length, { text: '12 ft', unit: 'ft', dirty: false });
  assert.ok(Math.abs(output(after, 'floor-area').total!.net - toMm2(120, 'ft')) < 1e-6);
  onlyRawChanged(before, after, roomTarget()); assert.deepEqual(before, frozen);
});

test('valid but uncommitted text is cancelled without a correction event or confirmation change', () => {
  let draft = fixture();
  draft = confirmMeasurement(draft, captureMeasurementReview(draft, { entity: 'room', id: 'room', field: 'length' }), AT);
  draft = confirmApplicability(draft, captureApplicabilityReview(draft, 'room', 'walls'), AT);
  const before = editField(draft, 'room', 'length', '14 ft');
  const after = revert(before, roomTarget()); onlyRawChanged(before, after, roomTarget());
  assert.deepEqual(after.document, draft.document); assert.deepEqual(after.events, draft.events);
  assert.deepEqual(after.reviewState, draft.reviewState); assert.deepEqual(recover(after), after);
});

test('reverting each room field leaves another unfinished field and its dependent totals blocked', () => {
  for (const field of ['length', 'width', 'ceilingHeight'] as const) {
    const other = field === 'width' ? 'length' : 'width';
    let before = editField(editField(fixture(), 'room', field, 'unfinished'), 'room', other, '10 ft -');
    before = switchUnit(before, 'm');
    const rawOther = clone(before.fields.room[other]), after = revert(before, roomTarget(field));
    onlyRawChanged(before, after, roomTarget(field)); assert.deepEqual(after.fields.room[other], rawOther);
    assert.equal(after.fields.room[field].unit, 'm'); assert.equal(after.fields.room[other].unit, 'ft');
    assert.equal(output(after, 'floor-area').total, null); assert.deepEqual(recover(after), after);
  }
});

test('active-unit Revert formats the retained measurement rather than parsing pending text or replacing provenance', () => {
  const before = switchUnit(editField(fixture(), 'room', 'length', '999 meters -'), 'm');
  const after = revert(before, roomTarget());
  assert.deepEqual(after.fields.room.length, { text: '3.6576 m', unit: 'm', dirty: false });
  onlyRawChanged(before, after, roomTarget());
  assert.equal(after.document.rooms[0].length.state, 'known');
  if (after.document.rooms[0].length.state === 'known') assert.equal(after.document.rooms[0].length.provenance.input, '12 ft');
});

test('all opening dimensions and center offset cancel raw edits while preserving identity, attachments and history', () => {
  let draft = fixture();
  draft = confirmMeasurement(draft, captureMeasurementReview(draft, { entity: 'opening', id: 'door', field: 'width' }), AT);
  for (const [field, expected] of [['width', '0.9144 m'], ['height', '2.1336 m'], ['sillHeight', '0 m'], ['offset', '0.762 m']] as const) {
    const before = switchUnit(editOpeningField(draft, 'door', field, 'bad -'), 'm');
    const after = revert(before, openingTarget(field)); onlyRawChanged(before, after, openingTarget(field));
    assert.deepEqual(getOpeningFields(after, 'door')[field], { text: expected, unit: 'm', dirty: false });
    assert.deepEqual(recover(after), after);
  }
});

test('syntactically valid geometry-rejected opening values can be cancelled with no physical correction or move', () => {
  for (const [field, text] of [['width', '99 ft'], ['height', '99 ft'], ['offset', '99 ft'], ['sillHeight', '99 ft']] as const) {
    const before = editOpeningField(fixture(), 'door', field, text), snapshot = clone(before);
    assert.throws(() => commitOpeningField(before, 'door', field, AT), /fit|beyond|floor|sill|wall|height|horizontal/i);
    assert.deepEqual(before, snapshot);
    const after = revert(before, openingTarget(field)); onlyRawChanged(before, after, openingTarget(field));
    assert.equal(getOpeningFields(after, 'door')[field].dirty, false); assert.deepEqual(recover(after), after);
  }
});

test('unknown room/opening values and needs-review candidates restore blank text without resolving domain state', () => {
  const blank = addRoom(createDraft('unknown'), 'room');
  const unknown = editField(blank, 'room', 'ceilingHeight', '8 ft');
  const unknownAfter = revert(unknown, roomTarget('ceilingHeight'));
  assert.equal(unknownAfter.fields.room.ceilingHeight.text, ''); onlyRawChanged(unknown, unknownAfter, roomTarget('ceilingHeight'));
  const original = fixture().document, known = original.rooms[0].length, width = original.openings[0].width;
  assert.equal(known.state, 'known'); assert.equal(width.state, 'known');
  if (known.state !== 'known' || width.state !== 'known') throw Error('Fixture requires known values');
  original.rooms[0].length = { state: 'needs-review', valueMm: null, reason: 'Two retained candidates', candidates: [
    { label: 'First', valueMm: known.valueMm, provenance: clone(known.provenance) },
    { label: 'Second', valueMm: toMm(13, 'ft'), provenance: clone(known.provenance) }] };
  original.openings[0].width = { state: 'needs-review', valueMm: null, reason: 'Conflicting retained widths', candidates: [
    { label: 'First', valueMm: width.valueMm, provenance: clone(width.provenance) },
    { label: 'Second', valueMm: toMm(2.5, 'ft'), provenance: clone(width.provenance) }] };
  original.openings[0].height = { state: 'unknown', valueMm: null, reason: 'Unmeasured height' };
  let draft = adoptPhysicalDraft(original, 'candidates');
  for (const [target, pending] of [
    [roomTarget(), editField(draft, 'room', 'length', '12 ft')],
    [openingTarget(), editOpeningField(draft, 'door', 'width', '3 ft')],
    [openingTarget('height'), editOpeningField(draft, 'door', 'height', '7 ft')],
  ] as const) {
    const after = revert(pending, target); onlyRawChanged(pending, after, target);
    assert.deepEqual(after.document, original); assert.deepEqual(recover(after), after);
    assert.equal(target.kind === 'room' ? after.fields.room.length.text : getOpeningFields(after, 'door')[target.field as OpeningField].text, '');
  }
});

test('zero center offset and zero sill remain measured zeros when their pending text is reverted', () => {
  let draft = addRoom(createDraft('zero'), 'room');
  draft = addOpening(draft, 'zero-opening', 'window', 'room:top', 0, AT);
  draft = commitOpeningField(editOpeningField(draft, 'zero-opening', 'sillHeight', '0 ft'), 'zero-opening', 'sillHeight', AT);
  for (const field of ['offset', 'sillHeight'] as const) {
    const before = editOpeningField(draft, 'zero-opening', field, '1 ft');
    const after = revert(before, openingTarget(field, 'zero-opening'));
    onlyRawChanged(before, after, openingTarget(field, 'zero-opening'));
    assert.deepEqual(getOpeningFields(after, 'zero-opening')[field], { text: '0 ft', unit: 'ft', dirty: false });
    assert.deepEqual(recover(after), after);
  }
});

test('committed 10 percent waste is restored exactly while unrelated pending fields and scope remain', () => {
  let draft = commitWaste(editWaste(fixture(), 'floor-area', '10.00'), 'floor-area');
  draft = editWaste(draft, 'net-wall-area', '11.'); draft = editOpeningField(draft, 'door', 'height', 'bad');
  const before = editWaste(draft, 'floor-area', '25'), after = revert(before, wasteTarget());
  onlyRawChanged(before, after, wasteTarget()); assert.deepEqual(getWasteField(after, 'floor-area'), { text: '10', dirty: false });
  assert.deepEqual(pendingWasteOutputs(after), ['net-wall-area']);
  const total = output(after, 'floor-area').total!;
  assert.equal(total.wasteFraction, 0.1);
  for (const [key, feet] of [['net', 120], ['allowance', 12], ['adjusted', 132]] as const) assert.ok(Math.abs(total[key]! - toMm2(feet, 'ft')) < 1e-6);
  assert.deepEqual(recover(after), after);
});

test('tiny and large committed decimal waste restores plain text and remains valid recovery without changing the fraction', () => {
  for (const text of ['0.000000000000001', '1000000000000000000000']) {
    const committed = commitWaste(editWaste(fixture(), 'floor-area', text), 'floor-area');
    const before = editWaste(committed, 'floor-area', 'unfinished'), after = revert(before, wasteTarget());
    onlyRawChanged(before, after, wasteTarget()); assert.equal(getWasteField(after, 'floor-area').text, text);
    assert.deepEqual(after.request, committed.request); assert.deepEqual(recover(after), after);
  }
});

test('zero committed waste restores zero and clean fields cannot roll back committed values', () => {
  let draft = fixture();
  const before = editWaste(draft, 'floor-area', '10.'); const after = revert(before, wasteTarget());
  assert.deepEqual(getWasteField(after, 'floor-area'), { text: '0', dirty: false }); onlyRawChanged(before, after, wasteTarget());
  draft = commitField(editField(after, 'room', 'length', '13 ft'), 'room', 'length', AT);
  draft = commitOpeningField(editOpeningField(draft, 'door', 'height', '6 ft'), 'door', 'height', AT);
  draft = commitWaste(editWaste(draft, 'floor-area', '15'), 'floor-area');
  for (const target of [roomTarget(), openingTarget('height'), wasteTarget()]) assert.equal(revert(draft, target), draft);
  assert.equal(draft.fields.room.length.text, '13 ft'); assert.equal(getWasteField(draft, 'floor-area').text, '15');
});

test('captured actions reject another draft, newer edit, unit change and duplicate application atomically', () => {
  const draft = editField(fixture(), 'room', 'length', 'pending'); const token = captureFieldRevert(draft, roomTarget());
  for (const newer of [{ ...draft, id: 'other' }, editField(draft, 'room', 'length', 'new pending'),
    renameRoom(draft, 'room', 'New name'), switchUnit(draft, 'm'), revertField(draft, token)]) {
    const before = clone(newer); assert.throws(() => revertField(newer, token), /draft changed/i); assert.deepEqual(newer, before);
  }
  const target = roomTarget(); const captured = captureFieldRevert(draft, target);
  if (target.kind === 'room') target.field = 'width';
  assert.deepEqual(captured.target, roomTarget(), 'Capture does not retain the caller’s mutable target object');
});

test('missing/deleted/disabled targets and malformed tokens never fall back to another field', () => {
  let draft = editOpeningField(fixture(), 'door', 'width', 'pending');
  const token = captureFieldRevert(draft, openingTarget()), deleted = deleteOpening(draft, 'door', AT);
  assert.throws(() => revertField(deleted, token), /draft changed/i);
  assert.throws(() => captureFieldRevert(deleted, openingTarget()), /no longer/i);
  for (const target of [roomTarget('length', 'missing'), { kind: 'room', id: 'room', field: 'name' },
    { kind: 'opening', id: 'door', field: 'appearance' }, wasteTarget('crown'), wasteTarget('opening-inventory')]) {
    assert.throws(() => captureFieldRevert(draft, target as FieldRevertTarget));
  }
  const roomToken = captureFieldRevert(draft, roomTarget());
  for (const bad of [null, { ...roomToken, revision: -1 }, { ...roomToken, revision: NaN }, { ...roomToken, extra: true },
    { ...roomToken, target: { ...roomTarget(), field: '__proto__' } }]) assert.throws(() => revertField(draft, bad as FieldRevertToken));
});

test('registry selection guard rejects a held Revert after switching to another draft with no writes', () => {
  const draft = editField(fixture(), 'room', 'length', 'pending'), token = captureFieldRevert(draft, roomTarget());
  let registry = insertDraft(insertDraft(createRegistry(), draft), createDraft('other'));
  const before = clone(registry);
  assert.throws(() => updateDraft(registry, draft.id, token.revision, current => revertField(current, token)), /selected draft changed/i);
  assert.deepEqual(registry, before);
  registry = selectDraft(registry, draft.id);
  registry = updateDraft(registry, draft.id, token.revision, current => revertField(current, token));
  assert.equal(selectedDraft(registry)!.fields.room.length.dirty, false);
});

test('opening delete then raw waste edit and Revert cannot resurrect stale casing or inventory scope on Undo', () => {
  const original = fixture(), deleted = deleteOpening(original, 'door', AT);
  const pending = editWaste(deleted, 'floor-area', '10.'), reverted = revert(pending, wasteTarget());
  onlyRawChanged(pending, reverted, wasteTarget()); assert.ok(takeoffScopeRevision(reverted) > takeoffScopeRevision(pending));
  const restored = undoOpeningDelete(recover(reverted), AT);
  assert.deepEqual(restored.document, original.document); assert.deepEqual(restored.request, deleted.request);
  assert.deepEqual(restored.takeoffState!.wasteFields, reverted.takeoffState!.wasteFields);
  assert.deepEqual(restored.events, original.events); assert.deepEqual(recover(restored), restored);
});

test('special room/opening IDs and unrelated field maps survive exact Revert and recovery', () => {
  let draft = addRoom(createDraft('special'), '__proto__');
  draft = commitField(editField(draft, '__proto__', 'length', '12 ft'), '__proto__', 'length', AT);
  draft = addOpening(draft, 'constructor', 'window', '__proto__:top', 0, AT);
  const pendingRoom = editField(draft, '__proto__', 'length', 'pending');
  const restoredRoom = revert(pendingRoom, roomTarget('length', '__proto__')); onlyRawChanged(pendingRoom, restoredRoom, roomTarget('length', '__proto__'));
  const pendingOpening = editOpeningField(restoredRoom, 'constructor', 'height', '3 ft');
  const restoredOpening = revert(pendingOpening, openingTarget('height', 'constructor')); onlyRawChanged(pendingOpening, restoredOpening, openingTarget('height', 'constructor'));
  assert.deepEqual(recover(restoredOpening), restoredOpening);
});

class Storage implements DraftStorage {
  values = new Map<string, string>(); failWrite = false; writes = 0;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrite) throw Error('Quota exceeded'); this.writes++; this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

test('guarded Revert survives exact storage recovery with other unfinished text and confirmation evidence', () => {
  let draft = fixture(); draft = confirmMeasurement(draft, captureMeasurementReview(draft, { entity: 'room', id: 'room', field: 'length' }), AT);
  draft = editField(editField(draft, 'room', 'length', '12 ft -'), 'room', 'width', '10 ft -'); draft = switchUnit(draft, 'm');
  const storage = new Storage(), store = createPhysicalDraftStore(() => storage);
  assert.ok(store.dispatch(registry => insertDraft(registry, draft)));
  const current = selectedDraft(store.getSnapshot().registry)!, token = captureFieldRevert(current, roomTarget());
  assert.ok(store.updateDraft(current.id, token.revision, value => revertField(value, token)));
  const after = selectedDraft(store.getSnapshot().registry)!; onlyRawChanged(current, after, roomTarget());
  const reload = createPhysicalDraftStore(() => storage); reload.hydrate();
  assert.deepEqual(reload.getSnapshot().registry, store.getSnapshot().registry);
  assert.equal(after.fields.room.length.text, '3.6576 m'); assert.equal(after.fields.room.width.unit, 'ft');
  assert.equal(output(after, 'floor-area').total, null);
});

test('failed recovery write keeps the reverted memory draft, prior raw bytes and visible limitation', () => {
  const draft = editField(fixture(), 'room', 'length', '12 ft -'), storage = new Storage(), store = createPhysicalDraftStore(() => storage);
  assert.ok(store.dispatch(registry => insertDraft(registry, draft)));
  const bytes = storage.values.get(PHYSICAL_DRAFT_STORAGE_KEY), token = captureFieldRevert(draft, roomTarget()); storage.failWrite = true;
  assert.ok(store.updateDraft(draft.id, token.revision, current => revertField(current, token)));
  const snapshot = store.getSnapshot(); onlyRawChanged(draft, selectedDraft(snapshot.registry)!, roomTarget());
  assert.equal(snapshot.cache, 'unavailable'); assert.match(snapshot.message, /held in memory.*could not be saved/i);
  assert.equal(storage.values.get(PHYSICAL_DRAFT_STORAGE_KEY), bytes); assert.equal(storage.writes, 1);
  assert.equal(parseRegistry(bytes!).status, 'recovered');
});

test('stale store Revert leaves newer memory and recoverable bytes untouched and reports the rejected action', () => {
  const draft = editField(fixture(), 'room', 'length', 'pending'), token = captureFieldRevert(draft, roomTarget());
  const storage = new Storage(), store = createPhysicalDraftStore(() => storage);
  store.dispatch(registry => insertDraft(registry, draft));
  assert.ok(store.updateDraft(draft.id, draft.localEditRevision, current => editField(current, 'room', 'length', 'new pending')));
  const registry = store.getSnapshot().registry, bytes = storage.values.get(PHYSICAL_DRAFT_STORAGE_KEY), writes = storage.writes;
  assert.equal(store.updateDraft(draft.id, token.revision, current => revertField(current, token)), false);
  assert.equal(store.getSnapshot().registry, registry); assert.equal(storage.values.get(PHYSICAL_DRAFT_STORAGE_KEY), bytes);
  assert.equal(storage.writes, writes); assert.match(store.getSnapshot().error, /selected draft changed/i);
});
