import assert from 'node:assert/strict';
import test from 'node:test';
import { createDraft, createRegistry, insertDraft, selectDraft, addRoom, renameRoom, editField, commitField, switchUnit,
  setApplicability, selectedDraft, previewDocument, type PhysicalDraft, type RoomField } from '../client/src/features/physical-draft/state';
import { createPhysicalDraftStore, type DraftStorage } from '../client/src/features/physical-draft/store';
import { addOpening, editOpeningField, commitOpeningField, moveOpening, deleteOpening, undoOpeningDelete,
  setOpeningBasis, setOpeningAppearance, getOpeningFields, type OpeningField } from '../client/src/features/physical-draft/openingCommands';
import { captureMeasurementReview, confirmMeasurement, captureApplicabilityReview, confirmApplicability } from '../client/src/features/physical-draft/reviewCommands';
import { editWaste, commitWaste, setOutputEnabled, selectAllCurrentTargets, setOutputTargets, setTakeoffBasis, setCrownGaps,
  getWasteField, takeoffScopeRevision } from '../client/src/features/physical-draft/takeoffCommands';
import { captureFieldRevert, revertField } from '../client/src/features/physical-draft/fieldRevert';
import { parseRegistry, serializeRegistry, PHYSICAL_DRAFT_STORAGE_KEY } from '../client/src/features/physical-draft/storage';
import { calculateQuantities } from '../shared/quantities/engine';
import { toMm, toMm2 } from '../shared/domain/units';
const AT = '2026-09-08T23:20:00.000Z';
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const appearance = { style: 'single' as const, swingSide: 'right' as const, swingDirection: 'inward' as const, metadata: { retained: true } };
function base(id = 'draft') {
  let draft = addRoom(createDraft(id), 'room', 'Alpha');
  for (const [field, text] of [['length', '12 ft'], ['width', '10 ft'], ['ceilingHeight', '8 ft']] as const) draft = commitField(editField(draft, 'room', field, text), 'room', field, AT);
  draft = setOutputEnabled(draft, 'floor-area', true); draft = selectAllCurrentTargets(draft, 'floor-area');
  return draft;
}
function withDoor(draft = base()) {
  draft = addOpening(draft, 'door', 'door', 'room:top', toMm(3, 'ft'), AT, { appearance });
  for (const [field, text] of [['width', '3 ft'], ['height', '7 ft'], ['sillHeight', '0']] as const) draft = commitOpeningField(editOpeningField(draft, 'door', field, text), 'door', field, AT);
  return setOpeningBasis(draft, 'door', 'finished', AT);
}
function fixture(draft = base(), storage?: DraftStorage) {
  const memory = new Map<string, string>();
  const backing: DraftStorage = storage ?? { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value); }, removeItem: key => { memory.delete(key); } };
  const store = createPhysicalDraftStore(() => backing);
  assert.equal(store.dispatch(reg => insertDraft(reg, draft)), true);
  const current = () => selectedDraft(store.getSnapshot().registry)!;
  const update = (change: (draft: PhysicalDraft) => PhysicalDraft, options?: { nameSession?: string }) => {
    assert.equal(store.updateDraft(current().id, current().localEditRevision, change, options), true, store.getSnapshot().error);
  };
  const undo = () => assert.equal(store.undo(current().id, current().localEditRevision, AT), true, store.getSnapshot().error);
  const redo = () => assert.equal(store.redo(current().id, current().localEditRevision, AT), true, store.getSnapshot().error);
  const roomEdit = (field: RoomField, text: string) => { update(d => editField(d, 'room', field, text)); update(d => commitField(d, 'room', field, AT)); };
  const openingEdit = (field: OpeningField, text: string) => { update(d => editOpeningField(d, 'door', field, text)); update(d => commitOpeningField(d, 'door', field, AT)); };
  return { store, current, update, undo, redo, roomEdit, openingEdit, memory, backing };
}
function floor(draft: PhysicalDraft) { const result = calculateQuantities(previewDocument(draft), draft.request); assert.ok(result.ok); return result.calculation.outputs.find(output => output.output === 'floor-area')!.total?.net; }

test('one committed room transaction updates quantities; raw typing and Enter/blur do not add steps', () => {
  const f = fixture(), original = copy(f.current().document), evidence = copy(f.current().events);
  f.update(d => editField(d, 'room', 'length', '14 ft'));
  assert.equal(f.store.getSnapshot().history.undoLabel, null); assert.equal(floor(f.current()), undefined);
  f.update(d => commitField(d, 'room', 'length', AT));
  assert.equal(f.store.getSnapshot().history.undoLabel, 'length change'); assert.equal(floor(f.current()), toMm2(140, 'ft'));
  const revision = f.current().localEditRevision; f.update(d => commitField(d, 'room', 'length', AT)); assert.equal(f.current().localEditRevision, revision);
  f.undo(); assert.deepEqual(f.current().document, original); assert.equal(floor(f.current()), toMm2(120, 'ft'));
  assert.deepEqual(f.current().events.slice(0, evidence.length), evidence); assert.equal(f.current().historyEvidence!.events.at(-1)!.action, 'undo');
  assert.equal(f.store.getSnapshot().history.undoLabel, null); f.redo(); assert.equal(floor(f.current()), toMm2(140, 'ft'));
});
test('room creation reuses exact IDs on redo, respects active units, and does not copy original source into history', () => {
  const f = fixture(createDraft('empty'));
  f.update(d => addRoom(d, 'new-room')); const room = copy(f.current().document.rooms[0]);
  f.undo(); assert.equal(f.current().document.rooms.length, 0);
  f.update(d => switchUnit(d, 'm')); f.redo();
  assert.deepEqual(f.current().document.rooms[0], room); assert.equal(f.current().fields['new-room'].length.unit, 'm');
  assert.ok(!JSON.stringify(f.current().historyEvidence).includes('original'));
  f.undo(); assert.equal(f.current().document.rooms.length, 0);
});
test('name editing coalesces one explicit session and returning to the initial name leaves no transaction', () => {
  const f = fixture();
  for (const name of ['B', 'Be', 'Beta']) f.update(d => renameRoom(d, 'room', name), { nameSession: 'focus-1' });
  assert.equal(f.current().historyEvidence!.events.length, 1);
  f.undo(); assert.equal(f.current().document.rooms[0].name, 'Alpha'); f.redo(); assert.equal(f.current().document.rooms[0].name, 'Beta');
  f.update(d => renameRoom(d, 'room', 'B'), { nameSession: 'focus-2' }); f.update(d => renameRoom(d, 'room', 'Beta'), { nameSession: 'focus-2' });
  f.undo(); assert.equal(f.current().document.rooms[0].name, 'Alpha');
});
test('clear restores exact known value and unknown again without inventing a shared measurement event', () => {
  const f = fixture(), known = copy(f.current().document.rooms[0].ceilingHeight), count = f.current().events.length;
  f.roomEdit('ceilingHeight', ''); assert.equal(f.current().document.rooms[0].ceilingHeight.state, 'unknown');
  assert.equal(f.current().events.length, count); assert.equal(f.current().historyEvidence!.events[0].changes[0].after && (f.current().historyEvidence!.events[0].changes[0].after as any).state, 'unknown');
  f.undo(); assert.deepEqual(f.current().document.rooms[0].ceilingHeight, known);
  f.redo(); assert.equal(f.current().document.rooms[0].ceilingHeight.state, 'unknown'); assert.equal(f.current().fields.room.ceilingHeight.text, '');
});
test('formerly confirmed correction undo and repeated redo stay unconfirmed with immutable prior evidence', () => {
  let draft = base(); draft = confirmMeasurement(draft, captureMeasurementReview(draft, { entity: 'room', id: 'room', field: 'length' }), AT);
  const saved = copy(draft), f = fixture(draft);
  f.roomEdit('length', '14 ft');
  for (let i = 0; i < 2; i++) {
    f.undo(); const value = f.current().document.rooms[0].length; assert.equal(value.state, 'known');
    if (value.state === 'known') { assert.equal(value.valueMm, toMm(12, 'ft')); assert.equal(value.provenance.confirmation.status, 'unconfirmed'); }
    f.redo(); assert.equal(floor(f.current()), toMm2(140, 'ft'));
  }
  assert.deepEqual(draft, saved); assert.deepEqual(f.current().events.slice(0, saved.events.length), saved.events);
  assert.equal(parseRegistry(serializeRegistry(f.store.getSnapshot().registry)).status, 'recovered');
});
test('model declaration undo appends actual declare transition and never restores a previous approval', () => {
  let draft = base(); draft = confirmApplicability(draft, captureApplicabilityReview(draft, 'room', 'ceiling'), AT);
  const f = fixture(draft), prior = copy(draft.reviewState!.applicabilityEvents);
  f.update(d => setApplicability(d, 'room', 'ceiling', { value: 'unsupported', source: 'manual', detail: 'Vaulted', confirmation: { status: 'unconfirmed' } }, AT));
  f.undo(); assert.equal(f.current().document.calculationContract!.rooms.room.ceiling.value, 'flat');
  assert.equal(f.current().document.calculationContract!.rooms.room.ceiling.confirmation.status, 'unconfirmed');
  assert.deepEqual(f.current().reviewState!.applicabilityEvents.slice(0, prior.length), prior);
  f.redo(); assert.equal(f.current().document.calculationContract!.rooms.room.ceiling.value, 'unsupported'); f.undo();
  assert.equal(parseRegistry(serializeRegistry(f.store.getSnapshot().registry)).status, 'recovered');
});
test('opening move and dimension undo retain identity, style, other raw fields and exact physical coordinates', () => {
  const f = fixture(withDoor()), original = copy(f.current().document.openings[0]);
  f.update(d => moveOpening(d, 'door', 'room:right', toMm(5, 'ft'), AT));
  f.update(d => editOpeningField(d, 'door', 'height', '7 ft -'));
  f.undo(); assert.deepEqual(f.current().document.openings[0], original); assert.equal(getOpeningFields(f.current(), 'door').height.text, '7 ft -');
  f.redo(); assert.equal(f.current().document.openings[0].attachments[0].wallFaceId, 'room:right');
  f.openingEdit('width', '32 in'); f.undo(); assert.deepEqual(f.current().document.openings[0].width, original.width);
  assert.deepEqual(f.current().document.openings[0].appearance, original.appearance); assert.equal(getOpeningFields(f.current(), 'door').height.text, '7 ft -');
});
test('opening creation and general deletion restore IDs and clean fields in the active metric display', () => {
  const f = fixture(); f.update(d => addOpening(d, 'door', 'door', 'room:top', toMm(4, 'ft'), AT, { widthMm: toMm(32, 'in'), appearance }));
  const opening = copy(f.current().document.openings[0]); f.undo(); f.update(d => switchUnit(d, 'm')); f.redo(); assert.deepEqual(f.current().document.openings[0], opening);
  f.update(d => deleteOpening(d, 'door', AT)); f.update(d => switchUnit(d, 'ft')); f.undo();
  assert.deepEqual(f.current().document.openings[0], opening); assert.equal(getOpeningFields(f.current(), 'door').width.unit, 'ft');
  assert.equal(f.current().openingDeleteUndo, undefined); f.redo(); assert.equal(f.current().document.openings.length, 0);
});
test('zero opening sill is restored as zero, and unknown sill remains unresolved', () => {
  const f = fixture(withDoor()), original = copy(f.current().document.openings[0].sillHeight);
  f.openingEdit('sillHeight', ''); assert.equal(f.current().document.openings[0].sillHeight.state, 'unknown'); f.undo();
  assert.deepEqual(f.current().document.openings[0].sillHeight, original); assert.equal(getOpeningFields(f.current(), 'door').sillHeight.text, '0 ft');
  f.redo(); assert.equal(getOpeningFields(f.current(), 'door').sillHeight.text, '');
});
test('opening appearance and measurement basis are separate reversible committed transactions', () => {
  const f = fixture(withDoor()), original = copy(f.current().document.openings[0]);
  f.update(d => setOpeningBasis(d, 'door', 'rough', AT));
  f.update(d => setOpeningAppearance(d, 'door', { ...appearance, style: 'double', swingDirection: 'outward' }, AT));
  f.undo(); assert.deepEqual(f.current().document.openings[0].appearance, original.appearance); assert.equal(f.current().document.openings[0].measureBasis, 'rough');
  f.undo(); assert.deepEqual(f.current().document.openings[0], original); f.redo(); f.redo();
});
test('opening delete restores previous targets only without later scope interaction and preserves later waste raw edits', () => {
  let draft = withDoor(); draft = setOutputEnabled(draft, 'door-casing', true); draft = selectAllCurrentTargets(draft, 'door-casing');
  const f = fixture(draft), request = copy(draft.request);
  f.update(d => deleteOpening(d, 'door', AT)); f.undo(); assert.deepEqual(f.current().request, request); f.redo();
  f.update(d => editWaste(d, 'floor-area', '10x')); const raw = copy(getWasteField(f.current(), 'floor-area'));
  f.undo(); assert.deepEqual(getWasteField(f.current(), 'floor-area'), raw);
  assert.deepEqual((f.current().request.selections.find(s => s.output === 'door-casing') as any).faces, []);
  assert.match(f.current().takeoffState!.notice!.message, /Later takeoff/); assert.ok(f.current().document.openings.some(o => o.id === 'door'));
});
test('waste undo is guarded by pending raw; Revert does not erase redo or rewind scope revision', () => {
  const f = fixture(); f.update(d => editWaste(d, 'floor-area', '10')); f.update(d => commitWaste(d, 'floor-area'));
  f.undo(); const revision = takeoffScopeRevision(f.current());
  f.update(d => editWaste(d, 'floor-area', '2x')); assert.match(f.store.getSnapshot().history.redoReason!, /Apply or Revert/);
  const token = captureFieldRevert(f.current(), { kind: 'waste', output: 'floor-area' }); f.update(d => revertField(d, token));
  assert.ok(takeoffScopeRevision(f.current()) > revision); f.redo(); assert.equal(getWasteField(f.current(), 'floor-area').text, '10');
});
test('scope and policy transactions undo precisely without changing quantities source or unrelated raw waste', () => {
  let draft = withDoor(); draft = setOutputEnabled(draft, 'ceiling-area', true); draft = selectAllCurrentTargets(draft, 'ceiling-area');
  const f = fixture(draft), original = copy(draft.document);
  f.update(d => setOutputTargets(d, 'floor-area', [])); f.update(d => editWaste(d, 'ceiling-area', '5x'));
  f.undo(); assert.equal(floor(f.current()), toMm2(120, 'ft')); assert.equal(getWasteField(f.current(), 'ceiling-area').text, '5x');
  f.update(d => setTakeoffBasis(d, 'rough')); f.undo(); assert.equal(f.current().request.policy.openingMeasureBasis, 'finished');
  f.update(d => setCrownGaps(d, [{ wallFaceId: 'room:top', openingId: 'door' }])); f.undo(); assert.deepEqual(f.current().request.policy.crownFullHeightGaps, []);
  assert.deepEqual(f.current().document, original);
});
test('a new committed branch clears redo while raw edits, Revert, same-value name and unit switches preserve it', () => {
  const f = fixture(); f.roomEdit('length', '14 ft'); f.undo();
  f.update(d => switchUnit(d, 'm')); f.update(d => renameRoom(d, 'room', 'Alpha')); f.update(d => editField(d, 'room', 'width', '2x'));
  const token = captureFieldRevert(f.current(), { kind: 'room', id: 'room', field: 'width' }); f.update(d => revertField(d, token));
  assert.equal(f.store.getSnapshot().history.redoLabel, 'length change');
  f.update(d => renameRoom(d, 'room', 'New branch')); assert.equal(f.store.getSnapshot().history.redoLabel, null);
});
test('history is bounded to fifty committed transactions and independently retained per draft', () => {
  const f = fixture(); for (let i = 1; i <= 52; i++) f.update(d => renameRoom(d, 'room', 'Name ' + i));
  assert.equal(f.store.getSnapshot().history.limit, 50);
  assert.equal(f.store.dispatch(reg => insertDraft(reg, base('second'))), true); assert.equal(f.store.getSnapshot().history.undoLabel, null);
  f.update(d => renameRoom(d, 'room', 'Second name'));
  assert.equal(f.store.dispatch(reg => selectDraft(reg, 'draft')), true);
  for (let i = 0; i < 50; i++) f.undo(); assert.equal(f.current().document.rooms[0].name, 'Name 2'); assert.equal(f.store.getSnapshot().history.undoLabel, null);
  assert.equal(f.store.dispatch(reg => selectDraft(reg, 'second')), true); f.undo(); assert.equal(f.current().document.rooms[0].name, 'Alpha');
});
test('recovery retains latest committed state and typed evidence but deliberately starts empty history', () => {
  const f = fixture(withDoor()); f.openingEdit('width', '32 in'); f.undo(); f.update(d => editField(d, 'room', 'width', '10 ft -'));
  const exact = copy(f.current()), recovered = createPhysicalDraftStore(() => f.backing); recovered.hydrate();
  assert.deepEqual(selectedDraft(recovered.getSnapshot().registry), exact); assert.equal(recovered.getSnapshot().history.undoLabel, null); assert.equal(recovered.getSnapshot().history.redoLabel, null);
  assert.match(recovered.getSnapshot().history.boundary!, /page session/);
});
test('failed recovery writes preserve old bytes while accepting memory edit and its Undo/Redo atomically', () => {
  let raw: string | null = null, quota = false;
  const storage: DraftStorage = { getItem: () => raw, setItem: (_key, value) => { if (quota) throw new Error('Quota'); raw = value; }, removeItem: () => { raw = null; } };
  const f = fixture(base(), storage), previous = raw; quota = true;
  f.update(d => renameRoom(d, 'room', 'Memory only'));
  assert.equal(raw, previous); assert.equal(f.store.getSnapshot().cache, 'unavailable');
  f.undo(); assert.equal(f.current().document.rooms[0].name, 'Alpha'); f.redo(); assert.equal(f.current().document.rooms[0].name, 'Memory only'); assert.equal(raw, previous);
});
test('corrupt restoration evidence is rejected without overwriting stored bytes', () => {
  const f = fixture(withDoor()); f.update(d => moveOpening(d, 'door', 'room:right', toMm(4, 'ft'), AT)); f.undo();
  const bad = copy(f.store.getSnapshot().registry); bad.drafts[0].document.openings[0].attachments[0].wallFaceId = 'room:bottom';
  const raw = JSON.stringify(bad); assert.equal(parseRegistry(raw).status, 'corrupt');
  let writes = 0; const recovery = createPhysicalDraftStore(() => ({ getItem: () => raw, setItem: () => { writes++; }, removeItem: () => {} })); recovery.hydrate();
  assert.equal(recovery.getSnapshot().cache, 'corrupt'); assert.equal(recovery.getSnapshot().rawRecovery, raw); assert.equal(writes, 0);
});
test('forged stale source restoration and forged dimension zero fail typed recovery validation', () => {
  const f = fixture(); f.roomEdit('length', '14 ft'); f.undo();
  const bad = copy(f.store.getSnapshot().registry), event = bad.drafts[0].historyEvidence!.events.at(-1)!;
  (event.changes[0].before as any).valueMm = toMm(16, 'ft'); assert.equal(parseRegistry(JSON.stringify(bad)).status, 'corrupt');
  const zero = copy(f.store.getSnapshot().registry); (zero.drafts[0].historyEvidence!.events.at(-1)!.changes[0].after as any).valueMm = 0;
  assert.equal(parseRegistry(JSON.stringify(zero)).status, 'corrupt');
});
test('existing targeted deletion recovery establishes one explicit boundary after success', () => {
  const f = fixture(withDoor()); f.update(d => renameRoom(d, 'room', 'Changed'));
  f.update(d => deleteOpening(d, 'door', AT)); f.update(d => undoOpeningDelete(d, AT));
  assert.equal(f.store.getSnapshot().history.undoLabel, null); assert.equal(f.store.getSnapshot().history.redoLabel, null);
  assert.match(f.store.getSnapshot().history.boundary!, /Undo opening delete/);
  assert.equal(parseRegistry(serializeRegistry(f.store.getSnapshot().registry)).status, 'recovered');
});

test('general Redo of an original delete renews its bounded targeted recovery without creating recovery for Undo creation', () => {
  let draft = withDoor(); draft = setOutputEnabled(draft, 'door-casing', true); draft = selectAllCurrentTargets(draft, 'door-casing');
  const f = fixture(draft), original = copy(draft.document.openings[0]);
  f.update(d => deleteOpening(d, 'door', AT)); f.undo(); f.redo();
  assert.deepEqual(f.current().openingDeleteUndo!.opening, original);
  assert.equal(f.current().openingDeleteUndo!.scopeRevisionAfter, takeoffScopeRevision(f.current()));
  f.update(d => editWaste(d, 'floor-area', '4x'));
  f.update(d => undoOpeningDelete(d, AT));
  assert.deepEqual(f.current().document.openings[0], original); assert.equal(getWasteField(f.current(), 'floor-area').text, '4x');
  assert.deepEqual((f.current().request.selections.find(s => s.output === 'door-casing') as any).faces, []);
  assert.equal(f.store.getSnapshot().history.undoLabel, null); assert.equal(f.store.getSnapshot().history.redoLabel, null);
  const created = fixture(); created.update(d => addOpening(d, 'door', 'door', 'room:top', toMm(3, 'ft'), AT, { appearance })); created.undo();
  assert.equal(created.current().openingDeleteUndo, undefined);
});
