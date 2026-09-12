import test from 'node:test';
import assert from 'node:assert/strict';
import { addRoom, editField, insertDraft, selectedDraft, type PhysicalDraft } from '../client/src/features/physical-draft/state';
import { createLevelDraft, addLevel, editLevelName, roomLevelId } from '../client/src/features/physical-draft/levelCommands';
import { upgradeExistingDraftToStairs, addStair, addSurfaceOpening, createRoomLocalPlacement, deleteStair, deleteSurfaceOpening } from '../client/src/features/physical-draft/stairCommands';
import { getRoomNameInput, editRoomNameInput, commitRoomNameInput, revertRoomNameInput,
  getBuildingNameInput, editBuildingNameInput, commitBuildingNameInput, revertBuildingNameInput,
  editRoomLevelInput, commitRoomLevelInput, revertRoomLevelInput } from '../client/src/features/physical-draft/pendingInputs';
import { pendingSaveFields } from '../client/src/features/physical-draft/pendingSaveFields';
import { serializeRegistry, parseRegistry, validateRegistry } from '../client/src/features/physical-draft/storage';
import { createPhysicalDraftStore } from '../client/src/features/physical-draft/store';
import { capturePhysicalSaveEnvelope } from '../shared/persistence/physicalSave';
const AT = '2026-09-10T05:00:00.000Z';
function base() { return addLevel(addRoom(createLevelDraft('draft', 'main'), 'room', 'Alpha'), 'upper', 'Upper'); }
function building() {
  let d = upgradeExistingDraftToStairs(base(), 'stairs-draft', AT);
  d = addStair(d, 'stair', 'Stair', { state: 'modeled', levelId: 'main', roomId: 'room', placement: createRoomLocalPlacement() }, AT);
  return addSurfaceOpening(d, 'hole', 'Hole', { roomId: 'room', surface: 'floor', placement: createRoomLocalPlacement() }, null, AT);
}
const registry = (d: PhysicalDraft) => ({ version: 'mfp-editor-draft-v4' as const, localEditRevision: 0, selectedDraftId: d.id, drafts: [d] });
function stored(d: PhysicalDraft) { const result = parseRegistry(serializeRegistry(registry(d))); assert.equal(result.status, 'recovered'); if (result.status !== 'recovered') throw Error(); return result.registry.drafts[0]; }
function fixture(d = base()) {
  const memory = new Map<string, string>();
  const store = createPhysicalDraftStore(() => ({ getItem: k => memory.get(k) ?? null, setItem: (k, v) => { memory.set(k, v); }, removeItem: k => { memory.delete(k); } }));
  assert.equal(store.dispatch(r => insertDraft(r, d)), true);
  const current = () => selectedDraft(store.getSnapshot().registry)!;
  const update = (f: (d: PhysicalDraft) => PhysicalDraft) => assert.equal(store.updateDraft(current().id, current().localEditRevision, f), true, store.getSnapshot().error);
  return { store, current, update };
}
test('room-name typing is raw, independently recoverable and excluded from the outgoing envelope until explicit Apply', () => {
  const original = base(), d = editRoomNameInput(original, 'room', '  Unfinished room ✨  ');
  assert.deepEqual(d.document, original.document); assert.equal(getRoomNameInput(stored(d), 'room').text, '  Unfinished room ✨  ');
  assert.throws(() => capturePhysicalSaveEnvelope(d), /Apply|Revert|pending|unfinished/i);
  const field = pendingSaveFields(d).find(f => f.key === 'room-name:room')!;
  const applied = field.apply(d, AT); assert.equal(applied.document.rooms[0].name, '  Unfinished room ✨  ');
  assert.equal(pendingSaveFields(applied).length, 0); assert.ok(!('pendingInputs' in capturePhysicalSaveEnvelope(applied)));
  const reverted = field.revert(d); assert.deepEqual(reverted.document, original.document); assert.equal(reverted.pendingInputs, undefined);
});
test('all new name and assignment raw values survive together without committing geometry, quantities or evidence', () => {
  const original = building(); let d = editRoomNameInput(original, 'room', 'New room');
  d = editBuildingNameInput(d, 'stair', 'stair', ' '); d = editBuildingNameInput(d, 'surface-opening', 'hole', 'Opening pending');
  d = editRoomLevelInput(d, 'room', 'upper'); d = editField(d, 'room', 'length', '12 ft -'); d = editLevelName(d, 'main', 'Raw level');
  const recovered = stored(d); assert.deepEqual(recovered, d); assert.deepEqual(d.document, original.document);
  assert.deepEqual(d.request, original.request); assert.deepEqual(d.events, original.events);
  assert.equal(pendingSaveFields(recovered).length, 6); assert.throws(() => capturePhysicalSaveEnvelope(recovered));
});
test('invalid object names remain raw and deletion cannot discard them', () => {
  for (const [kind, id] of [['stair', 'stair'], ['surface-opening', 'hole']] as const) {
    const d = editBuildingNameInput(building(), kind, id, '  '), before = JSON.stringify(d);
    assert.throws(() => commitBuildingNameInput(d, kind, id));
    assert.throws(() => kind === 'stair' ? deleteStair(d, id, AT) : deleteSurfaceOpening(d, id, AT), /Apply or Revert/);
    assert.equal(JSON.stringify(d), before); assert.equal(getBuildingNameInput(stored(d), kind, id).text, '  ');
    assert.equal(pendingSaveFields(revertBuildingNameInput(d, kind, id)).length, 0);
  }
});
test('room assignments are draft-owned pending actions and Apply/Revert preserve other raw inputs', () => {
  const original = base(), renamed = editRoomNameInput(original, 'room', 'Pending name'), raw = editRoomLevelInput(renamed, 'room', 'upper');
  assert.equal(roomLevelId(raw, 'room'), 'main'); assert.deepEqual(stored(raw).pendingInputs, raw.pendingInputs);
  const applied = commitRoomLevelInput(raw, 'room'); assert.equal(roomLevelId(applied, 'room'), 'upper'); assert.equal(getRoomNameInput(applied, 'room').text, 'Pending name');
  assert.equal(applied.pendingInputs?.roomLevels.room, undefined); assert.equal(pendingSaveFields(applied).length, 1);
  const reverted = revertRoomLevelInput(raw, 'room'); assert.equal(roomLevelId(reverted, 'room'), 'main'); assert.equal(getRoomNameInput(reverted, 'room').dirty, true);
});
test('typing adds no history while one explicit room-name Apply gives one guarded Undo transaction', () => {
  const f = fixture(); for (const text of ['B', 'Be', 'Beta']) f.update(d => editRoomNameInput(d, 'room', text));
  assert.equal(f.store.getSnapshot().history.undoLabel, null); f.update(d => commitRoomNameInput(d, 'room'));
  assert.match(f.store.getSnapshot().history.undoLabel!, /room name/); assert.equal(f.current().historyEvidence?.events.length, 1);
  f.update(d => editRoomNameInput(d, 'room', 'Even newer')); const before = JSON.stringify(f.current());
  assert.equal(f.store.undo(f.current().id, f.current().localEditRevision, AT), false); assert.equal(JSON.stringify(f.current()), before);
  f.update(d => revertRoomNameInput(d, 'room')); assert.equal(f.store.undo(f.current().id, f.current().localEditRevision, AT), true);
  assert.equal(f.current().document.rooms[0].name, 'Alpha');
});
test('pending room assignment blocks Undo of that assignment and level removal while preserving the candidate', () => {
  const f = fixture(); f.update(d => editRoomLevelInput(d, 'room', 'upper')); f.update(d => commitRoomLevelInput(d, 'room'));
  f.update(d => editRoomLevelInput(d, 'room', 'main')); const before = JSON.stringify(f.current());
  assert.equal(f.store.undo(f.current().id, f.current().localEditRevision, AT), false); assert.equal(JSON.stringify(f.current()), before);
  const levels = fixture(addRoom(createLevelDraft('fresh', 'main'), 'room'));
  levels.update(d => addLevel(d, 'upper', 'Upper')); levels.update(d => editRoomLevelInput(d, 'room', 'upper'));
  assert.equal(levels.store.undo(levels.current().id, levels.current().localEditRevision, AT), false); assert.match(levels.store.getSnapshot().error, /pending room assignment/);
});
test('pending names guard object history, and unrelated name raw survives other committed edits', () => {
  const f = fixture(building()); f.update(d => editBuildingNameInput(d, 'stair', 'stair', 'Main stair')); f.update(d => commitBuildingNameInput(d, 'stair', 'stair'));
  f.update(d => editBuildingNameInput(d, 'stair', 'stair', 'Unfinished next stair'));
  assert.equal(f.store.undo(f.current().id, f.current().localEditRevision, AT), false); assert.match(f.store.getSnapshot().error, /pending object name/);
  f.update(d => editRoomNameInput(d, 'room', 'Room pending')); f.update(d => revertBuildingNameInput(d, 'stair', 'stair'));
  assert.equal(f.store.undo(f.current().id, f.current().localEditRevision, AT), true); assert.equal(getRoomNameInput(f.current(), 'room').text, 'Room pending');
});
test('legacy draft caches remain compatible while impossible pending ownership is rejected without reinterpretation', () => {
  const old = base(); assert.equal(validateRegistry(registry(old)).status, 'recovered'); assert.equal(old.pendingInputs, undefined);
  const invalid = editRoomLevelInput(old, 'room', 'upper'); invalid.pendingInputs!.roomLevels.room.from = 'missing';
  assert.equal(validateRegistry(registry(invalid)).status, 'corrupt');
  const missing = editRoomNameInput(old, 'room', 'Pending'); missing.pendingInputs!.roomNames.gone = { text: 'Missing', dirty: true };
  assert.equal(validateRegistry(registry(missing)).status, 'corrupt');
});
