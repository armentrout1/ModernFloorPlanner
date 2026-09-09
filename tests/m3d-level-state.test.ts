import assert from 'node:assert/strict';
import test from 'node:test';
import { createLevelDraft, upgradeExistingDraftToLevels, addLevel, editLevelName, renameLevel, reorderLevels, assignRoomLevel, selectLevel, activeLevelId, roomLevelId, roomsOnLevel } from '../client/src/features/physical-draft/levelCommands';
import { createDraft, createRegistry, insertDraft, selectedDraft, selectDraft, addRoom, editField, commitField, switchUnit, previewDocument, type PhysicalDraft } from '../client/src/features/physical-draft/state';
import { createPhysicalDraftStore, type DraftStorage } from '../client/src/features/physical-draft/store';
import { parseRegistry, serializeRegistry, validateRegistry, PHYSICAL_DRAFT_STORAGE_KEY as KEY, LEGACY_PHYSICAL_DRAFT_STORAGE_KEY as OLD_KEY } from '../client/src/features/physical-draft/storage';
import { addOpening, editOpeningField, deleteOpening, undoOpeningDelete } from '../client/src/features/physical-draft/openingCommands';
import { setOutputEnabled, selectAllCurrentTargets, editWaste, setOutputTargets } from '../client/src/features/physical-draft/takeoffCommands';
import { captureMeasurementReview, confirmMeasurement } from '../client/src/features/physical-draft/reviewCommands';
import { historyEvidenceSchema } from '../client/src/features/physical-draft/historyEvidence';
import { canonicalJson } from '../shared/quantities/canonicalJson';
const AT = '2026-09-08T23:20:00.000Z';
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
class Memory implements DraftStorage {
  values = new Map<string, string>(); writes: string[] = []; reads: string[] = []; quota = false;
  getItem(key: string) { this.reads.push(key); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.quota) throw new Error('Quota'); this.writes.push(key); this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
function levelDoc(draft: PhysicalDraft) { assert.equal(draft.document.schemaVersion, 3); if (draft.document.schemaVersion !== 3) throw new Error('Expected levels'); return draft.document; }
function measured(draft: PhysicalDraft, id = 'room') {
  draft = addRoom(draft, id, id === 'room' ? 'Alpha' : id);
  for (const [field, text] of [['length', '12 ft'], ['width', '10 ft'], ['ceilingHeight', '8 ft']] as const) draft = commitField(editField(draft, id, field, text), id, field, AT);
  return draft;
}
function fixture(draft = measured(createLevelDraft('building', 'basement')), backing = new Memory()) {
  const store = createPhysicalDraftStore(() => backing);
  assert.ok(store.dispatch(reg => insertDraft(reg, draft)), store.getSnapshot().error);
  const current = () => selectedDraft(store.getSnapshot().registry)!;
  const update = (change: (draft: PhysicalDraft) => PhysicalDraft) => assert.ok(store.updateDraft(current().id, current().localEditRevision, change), store.getSnapshot().error);
  const undo = () => assert.ok(store.undo(current().id, current().localEditRevision, AT), store.getSnapshot().error);
  const redo = () => assert.ok(store.redo(current().id, current().localEditRevision, AT), store.getSnapshot().error);
  return { store, current, update, undo, redo, backing };
}
function recovered(draft: PhysicalDraft) { const reg = insertDraft(createRegistry(), draft); assert.equal(parseRegistry(serializeRegistry(reg)).status, 'recovered'); }

test('new building draft has one editable Main floor with unknown elevation; legacy constructor stays v2', () => {
  const draft = createLevelDraft('building', 'level'); const doc = levelDoc(draft);
  assert.equal(doc.buildingLevels.levels[0].name, 'Main floor'); assert.equal(activeLevelId(draft), 'level');
  assert.deepEqual(doc.buildingLevels.roomLevels, {}); assert.equal(doc.buildingLevels.levels[0].finishedFloorElevation.valueMm, null);
  assert.equal(doc.buildingLevels.levels[0].finishedFloorElevation.reference, null); assert.equal(createDraft('old').document.schemaVersion, 2);
  recovered(draft);
});
test('add rooms follows active level, including empty levels, without expanding explicit takeoff scope', () => {
  let draft = measured(createLevelDraft('building', 'basement'));
  draft = setOutputEnabled(draft, 'floor-area', true); draft = selectAllCurrentTargets(draft, 'floor-area'); const request = copy(draft.request);
  draft = addLevel(draft, 'upper', 'Upper'); assert.deepEqual(roomsOnLevel(draft, 'upper'), []);
  draft = addRoom(draft, 'bedroom', 'Bedroom'); assert.equal(roomLevelId(draft, 'bedroom'), 'upper');
  assert.equal(roomLevelId(draft, 'room'), 'basement'); assert.deepEqual(draft.request, request);
  recovered(draft);
});
test('switch level retains document, pending fields, units, request and evidence, increments revision and preserves redo', () => {
  const f = fixture(); f.update(d => addLevel(d, 'main', 'Main')); f.update(d => renameLevel(d, 'main', 'Main floor')); f.undo();
  f.update(d => editField(d, 'room', 'length', '12 ft -')); f.update(d => switchUnit(d, 'm'));
  const before = copy(f.current()), redo = f.store.getSnapshot().history.redoLabel;
  f.update(d => selectLevel(d, 'basement')); assert.equal(f.current().localEditRevision, before.localEditRevision + 1);
  for (const field of ['document', 'fields', 'events', 'request', 'historyEvidence'] as const) assert.deepEqual(f.current()[field], before[field]);
  assert.equal(f.current().fields.room.length.unit, 'ft'); assert.equal(f.store.getSnapshot().history.redoLabel, redo);
  f.redo(); assert.equal(activeLevelId(f.current()), 'main'); assert.equal(f.current().fields.room.length.text, '12 ft -');
});
test('level creation, rename and order are one chronological history with stable IDs and unknown elevations', () => {
  const f = fixture(createLevelDraft('building', 'base'));
  f.update(d => addLevel(d, 'main', 'Main')); f.update(d => addLevel(d, 'upper', 'Upper'));
  const physical = copy(levelDoc(f.current()).buildingLevels.levels.map(level => level.finishedFloorElevation));
  f.update(d => renameLevel(d, 'main', 'First floor')); f.update(d => reorderLevels(d, ['upper', 'base', 'main']));
  assert.deepEqual(levelDoc(f.current()).buildingLevels.levels.map(level => level.finishedFloorElevation), physical);
  f.undo(); assert.deepEqual(levelDoc(f.current()).buildingLevels.levels.map(level => level.displayOrder), [0, 1, 2]);
  f.undo(); assert.equal(levelDoc(f.current()).buildingLevels.levels[1].name, 'Main');
  f.undo(); assert.deepEqual(levelDoc(f.current()).buildingLevels.levels.map(level => level.id), ['base', 'main']);
  f.redo(); assert.deepEqual(levelDoc(f.current()).buildingLevels.levels.map(level => level.id), ['base', 'main', 'upper']);
  assert.equal(activeLevelId(f.current()), 'upper'); recovered(f.current());
});
test('room assignment preserves physical identity/raw/request, and direct assignment plus Undo/Redo reveal the exact room even on a populated destination', () => {
  const f = fixture(); f.update(d => addLevel(d, 'main', 'Main')); f.update(d => addRoom(d, 'destination-room', 'Already on Main'));
  f.update(d => editField(d, 'room', 'width', '10 ft -')); const before = copy(f.current());
  f.update(d => assignRoomLevel(d, 'room', 'main', 'main')); assert.equal(roomLevelId(f.current(), 'room'), 'main');
  assert.deepEqual(f.store.getSnapshot().history.reveal, { levelId: 'main', roomId: 'room', revision: f.current().localEditRevision });
  assert.deepEqual(f.current().document.rooms, before.document.rooms); assert.deepEqual(f.current().fields, before.fields); assert.deepEqual(f.current().request, before.request);
  f.undo(); assert.equal(roomLevelId(f.current(), 'room'), 'basement'); assert.equal(activeLevelId(f.current()), 'basement');
  assert.deepEqual(f.store.getSnapshot().history.reveal, { levelId: 'basement', roomId: 'room', revision: f.current().localEditRevision });
  f.redo(); assert.equal(roomLevelId(f.current(), 'room'), 'main'); assert.equal(activeLevelId(f.current()), 'main'); recovered(f.current());
});
test('existing measurement history reveals a hidden room level without filtering the chronological stack', () => {
  const f = fixture(); f.update(d => addLevel(d, 'main', 'Main'));
  f.update(d => editField(d, 'room', 'length', '13 ft')); f.update(d => commitField(d, 'room', 'length', AT));
  assert.match(f.store.getSnapshot().history.undoLabel!, /Main floor/); f.undo();
  assert.equal(activeLevelId(f.current()), 'basement'); assert.equal(f.store.getSnapshot().history.reveal?.roomId, 'room');
  f.redo(); assert.equal(activeLevelId(f.current()), 'basement');
});
test('room creation inverse includes membership, and a populated level cannot be undone out of order', () => {
  const f = fixture(createLevelDraft('building', 'base')); f.update(d => addLevel(d, 'upper', 'Upper'));
  f.update(d => addRoom(d, 'room')); f.undo(); assert.equal(Object.hasOwn(levelDoc(f.current()).buildingLevels.roomLevels, 'room'), false);
  f.undo(); assert.equal(levelDoc(f.current()).buildingLevels.levels.length, 1); f.redo(); f.redo();
  assert.equal(roomLevelId(f.current(), 'room'), 'upper'); assert.equal(activeLevelId(f.current()), 'upper'); recovered(f.current());
});
test('grouped room assignment is rejected with dependent room name and has no partial state change', () => {
  let draft = measured(createLevelDraft('building', 'base')); draft = measured(draft, 'second');
  draft.document.editorContract!.groups = [{ id: 'group', roomIds: ['room', 'second'] }]; draft = addLevel(draft, 'upper', 'Upper');
  const before = copy(draft); assert.throws(() => assignRoomLevel(draft, 'room', 'upper'), /group membership.*second/); assert.deepEqual(draft, before);
});
test('shared opening room assignment is rejected by attachment dependency without changing IDs or geometry', () => {
  let draft = measured(createLevelDraft('building', 'base')); draft = measured(draft, 'second');
  draft = addOpening(draft, 'shared', 'door', 'room:top', 1000, AT);
  draft.document.openings[0].attachments.push({ wallFaceId: 'second:top', anchor: 'center', offsetMm: 1000 });
  draft = addLevel(draft, 'upper', 'Upper'); const before = copy(draft);
  assert.throws(() => assignRoomLevel(draft, 'room', 'upper'), /shared opening shared.*second/); assert.deepEqual(draft, before);
});
test('level switch makes captured edits stale and failed assignment leaves both history stacks untouched', () => {
  const f = fixture(); f.update(d => addLevel(d, 'main', 'Main')); const id = f.current().id, revision = f.current().localEditRevision;
  f.update(d => selectLevel(d, 'basement')); const before = copy(f.store.getSnapshot().registry), history = copy(f.store.getSnapshot().history);
  assert.equal(f.store.updateDraft(id, revision, d => assignRoomLevel(d, 'room', 'main')), false);
  assert.deepEqual(f.store.getSnapshot().registry, before); assert.deepEqual(f.store.getSnapshot().history, history);
  assert.throws(() => assignRoomLevel(f.current(), 'room', 'main', 'main'), /active level changed/);
});
test('invalid IDs, blank names, unknown levels and partial/duplicate order do not mutate the draft', () => {
  const draft = createLevelDraft('building', 'base'), before = copy(draft);
  for (const action of [() => addLevel(draft, 'base', 'Again'), () => addLevel(draft, '', 'No'), () => renameLevel(draft, 'base', ' '), () => selectLevel(draft, 'missing'), () => reorderLevels(draft, []), () => reorderLevels(draft, ['base', 'base'])]) assert.throws(action);
  assert.deepEqual(draft, before); assert.equal(renameLevel(draft, 'base', 'Main floor'), draft); assert.equal(selectLevel(draft, 'base'), draft);
});
test('explicit old draft upgrade preserves the FULL live state, confirmed events, source originals and unknown ownership', () => {
  let old = measured(createDraft('old')); old = confirmMeasurement(old, captureMeasurementReview(old, { entity: 'room', id: 'room', field: 'length' }), AT);
  old = setOutputEnabled(old, 'floor-area', true); old = selectAllCurrentTargets(old, 'floor-area'); old = editWaste(old, 'floor-area', '10.');
  old = editField(old, 'room', 'width', '10 ft -'); const before = copy(old);
  const upgraded = upgradeExistingDraftToLevels(old, 'new', 'unassigned', AT);
  assert.deepEqual(old, before); assert.deepEqual(upgraded.document.rooms, old.document.rooms);
  for (const key of ['fields', 'events', 'source', 'takeoffState', 'reviewState'] as const) assert.deepEqual(upgraded[key], old[key]);
  assert.deepEqual(upgraded.levelUpgradeLineage!.originalDraft, old); assert.equal(upgraded.levelUpgradeLineage!.sourceRevision, old.localEditRevision);
  assert.equal(levelDoc(upgraded).buildingLevels.levels[0].ownership, 'unassigned'); assert.match(levelDoc(upgraded).buildingLevels.levels[0].name, /Unassigned/);
  assert.equal(roomLevelId(upgraded, 'room'), 'unassigned'); assert.equal(upgraded.request.policy.version, 'rectangular-flat-v3'); recovered(upgraded);
});
test('upgrade retains typed history captures and accepts new level evidence without rewriting the old capture', () => {
  const f = fixture(measured(createDraft('old'))); f.update(d => editField(d, 'room', 'length', '14 ft')); f.update(d => commitField(d, 'room', 'length', AT));
  const old = copy(f.current()), upgraded = upgradeExistingDraftToLevels(old, 'new', 'unassigned', AT);
  assert.deepEqual(upgraded.historyEvidence, old.historyEvidence); const next = fixture(upgraded); next.update(d => renameLevel(d, 'unassigned', 'Existing rooms'));
  assert.equal(next.current().historyEvidence!.version, 'physical-history-evidence-v2');
  assert.deepEqual(next.current().historyEvidence!.events.slice(0, old.historyEvidence!.events.length), old.historyEvidence!.events); recovered(next.current());
});
test('upgraded deletion recovery adapts active policy snapshots and preserves original tombstone in lineage', () => {
  let old = measured(createDraft('old')); old = addOpening(old, 'door', 'door', 'room:top', 1000, AT); old = deleteOpening(old, 'door', AT);
  const upgraded = upgradeExistingDraftToLevels(old, 'new', 'unassigned', AT);
  assert.equal(upgraded.openingDeleteUndo!.requestBefore.policy.version, 'rectangular-flat-v3');
  assert.deepEqual((upgraded.levelUpgradeLineage!.originalDraft as PhysicalDraft).openingDeleteUndo, old.openingDeleteUndo);
  const restored = undoOpeningDelete(upgraded, AT); assert.equal(restored.document.openings[0].id, 'door'); recovered(restored);
});
test('upgrade retains independent source entry and blocks already-upgraded or reused identities', () => {
  const old = measured(createDraft('old')), upgraded = upgradeExistingDraftToLevels(old, 'new', 'unassigned', AT);
  const reg = insertDraft(insertDraft(createRegistry(), old), upgraded); assert.equal(reg.drafts.length, 2); assert.deepEqual(reg.drafts[0], old);
  assert.throws(() => upgradeExistingDraftToLevels(upgraded, 'third', 'u', AT), /already uses/); assert.throws(() => upgradeExistingDraftToLevels(old, 'old', 'u', AT));
  assert.equal(parseRegistry(serializeRegistry(reg)).status, 'recovered');
});
test('new recovery key falls back to v1 without altering bytes; first accepted write migrates envelope only', () => {
  const memory = new Memory(), old = insertDraft(createRegistry(), measured(createDraft('old'))), raw = serializeRegistry(old);
  memory.values.set(OLD_KEY, raw); const store = createPhysicalDraftStore(() => memory); store.hydrate();
  assert.deepEqual(store.getSnapshot().registry, old); assert.equal(memory.writes.length, 0);
  const draft = selectedDraft(store.getSnapshot().registry)!;
  assert.ok(store.updateDraft(draft.id, draft.localEditRevision, d => editField(d, 'room', 'length', '12 ft -')));
  assert.equal(memory.values.get(OLD_KEY), raw); assert.deepEqual(memory.writes, [KEY]);
  const recovered = parseRegistry(memory.values.get(KEY)!); assert.equal(recovered.status, 'recovered');
  if (recovered.status === 'recovered') { assert.equal(recovered.registry.version, 'mfp-editor-draft-v4'); assert.equal(recovered.registry.drafts[0].document.schemaVersion, 2); }
});
test('new cache wins over v1 and corrupt new data never falls back or gets overwritten', () => {
  const memory = new Memory(); const old = serializeRegistry(insertDraft(createRegistry(), createDraft('old')));
  memory.values.set(OLD_KEY, old); memory.values.set(KEY, '{broken'); const store = createPhysicalDraftStore(() => memory); store.hydrate();
  assert.equal(store.getSnapshot().cache, 'corrupt'); assert.deepEqual(memory.reads, [KEY]);
  assert.equal(store.dispatch(reg => insertDraft(reg, createLevelDraft('new', 'level'))), false); assert.equal(memory.values.get(KEY), '{broken'); assert.equal(memory.values.get(OLD_KEY), old);
});
test('changed legacy source or newly appeared v2 cache blocks fallback overwrite while retaining accepted memory', () => {
  for (const changedKey of [OLD_KEY, KEY]) {
    const memory = new Memory(), old = serializeRegistry(insertDraft(createRegistry(), createDraft('old'))); memory.values.set(OLD_KEY, old);
    const store = createPhysicalDraftStore(() => memory); store.hydrate(); memory.values.set(changedKey, 'other editor bytes');
    assert.ok(store.dispatch(reg => insertDraft(reg, createLevelDraft('new', 'level')))); assert.equal(store.getSnapshot().cache, 'conflict');
    assert.equal(memory.values.get(changedKey), 'other editor bytes'); assert.deepEqual(memory.writes, []); assert.equal(store.getSnapshot().registry.drafts.length, 2);
  }
});
test('failed new-key storage write preserves v1 source and latest level change/history in memory', () => {
  const memory = new Memory(), old = serializeRegistry(insertDraft(createRegistry(), createDraft('old'))); memory.values.set(OLD_KEY, old);
  const f = fixture(createLevelDraft('new', 'base'), memory); const raw = memory.values.get(KEY); memory.quota = true;
  f.update(d => addLevel(d, 'upper', 'Upper')); assert.equal(f.store.getSnapshot().cache, 'unavailable'); assert.equal(memory.values.get(KEY), raw); assert.equal(memory.values.get(OLD_KEY), old);
  f.undo(); assert.equal(levelDoc(f.current()).buildingLevels.levels.length, 1);
});
test('reload restores active level and all pending field contexts but initializes empty session history', () => {
  const f = fixture(); f.update(d => addLevel(d, 'upper', 'Upper')); f.update(d => editField(d, 'room', 'length', '12 ft -'));
  f.update(d => addOpening(d, 'door', 'door', 'room:top', 1000, AT)); f.update(d => editOpeningField(d, 'door', 'height', '7 ft -'));
  f.update(d => switchUnit(d, 'm')); const before = copy(f.current()); const store = createPhysicalDraftStore(() => f.backing); store.hydrate();
  assert.deepEqual(selectedDraft(store.getSnapshot().registry), before); assert.equal(store.getSnapshot().history.undoLabel, null); assert.equal(store.getSnapshot().history.redoLabel, null);
  assert.equal(previewDocument(before).rooms[0].length.state, 'unknown');
});
test('recovery rejects missing/dangling/extra room membership, stale active level and unsupported envelope', () => {
  const original = insertDraft(createRegistry(), measured(createLevelDraft('building', 'base')));
  for (const mutate of [
    (d: any) => { delete d.document.buildingLevels.roomLevels.room; },
    (d: any) => { d.document.buildingLevels.roomLevels.room = 'missing'; },
    (d: any) => { d.document.buildingLevels.roomLevels.extra = 'base'; },
    (d: any) => { d.levelView.activeLevelId = 'missing'; },
    (d: any) => { d.document.buildingLevels.levels[0].finishedFloorElevation.valueMm = 0; },
  ]) { const bad = copy(original); mutate(bad.drafts[0]); assert.equal(validateRegistry(bad).status, 'corrupt'); }
  assert.equal(parseRegistry(JSON.stringify({ ...original, version: 'future' })).status, 'unsupported');
  assert.equal(validateRegistry({ ...original, version: 'mfp-editor-draft-v1' }).status, 'corrupt');
});
test('level history evidence rejects v1 relabeling, altered restored ownership and forged lineage', () => {
  const f = fixture(); f.update(d => addLevel(d, 'upper', 'Upper')); f.update(d => assignRoomLevel(d, 'room', 'upper')); f.undo();
  const invalidVersion = copy(f.current().historyEvidence!); invalidVersion.version = 'physical-history-evidence-v1'; assert.equal(historyEvidenceSchema.safeParse(invalidVersion).success, false);
  const bad = copy(f.store.getSnapshot().registry); levelDoc(bad.drafts[0]).buildingLevels.roomLevels.room = 'upper'; assert.equal(validateRegistry(bad).status, 'corrupt');
  const upgraded = upgradeExistingDraftToLevels(measured(createDraft('old')), 'new', 'unassigned', AT); upgraded.levelUpgradeLineage!.sourceRevision++;
  assert.equal(validateRegistry(insertDraft(createRegistry(), upgraded)).status, 'corrupt');
});
test('prototype-like room/level IDs are retained as own memberships through upgrade, history and recovery', () => {
  let draft = measured(createLevelDraft('building', 'base'), '__proto__');
  assert.equal(Object.hasOwn(levelDoc(draft).buildingLevels.roomLevels, '__proto__'), true); assert.equal(roomLevelId(draft, '__proto__'), 'base'); recovered(createLevelDraft('prototype-level', '__proto__'));
  const f = fixture(draft); f.update(d => addLevel(d, 'constructor', 'Upper')); f.update(d => assignRoomLevel(d, '__proto__', 'constructor')); f.undo(); f.redo();
  assert.equal(roomLevelId(f.current(), '__proto__'), 'constructor'); recovered(f.current());
  const old = measured(createDraft('old'), '__proto__'); const upgraded = upgradeExistingDraftToLevels(old, 'new', 'unassigned', AT); recovered(upgraded);
  assert.equal(canonicalJson({ safe: true }), '{"safe":true}');
});

test('global takeoff history is labeled project-wide and does not reveal or switch to an arbitrary level', () => {
  const f = fixture(); f.update(d => addLevel(d, 'main', 'Main'));
  f.update(d => setOutputEnabled(d, 'floor-area', true));
  assert.match(f.store.getSnapshot().history.undoLabel!, /project takeoff/);
  const active = activeLevelId(f.current()); f.undo(); assert.equal(activeLevelId(f.current()), active);
  assert.equal(f.store.getSnapshot().history.reveal, undefined);
});

test('pending level names survive level changes/reload, preserve redo and block removal until explicitly applied', () => {
  const f = fixture(createLevelDraft('building', 'base'));
  f.update(d => addLevel(d, 'upper', 'Upper')); f.update(d => renameLevel(d, 'upper', 'Upper floor')); f.undo();
  const redo = f.store.getSnapshot().history.redoLabel, document = copy(f.current().document), evidence = copy(f.current().historyEvidence);
  f.update(d => editLevelName(d, 'upper', 'Upper pending ')); f.update(d => selectLevel(d, 'base'));
  assert.equal(f.current().levelView!.pendingNames!.upper, 'Upper pending ');
  assert.deepEqual(f.current().document, document); assert.deepEqual(f.current().historyEvidence, evidence);
  assert.equal(f.store.getSnapshot().history.redoLabel, redo);
  const recovered = createPhysicalDraftStore(() => f.backing); recovered.hydrate();
  assert.deepEqual(selectedDraft(recovered.getSnapshot().registry), f.current());
  assert.equal(f.store.undo(f.current().id, f.current().localEditRevision, AT), false);
  assert.match(f.store.getSnapshot().error, /Apply the pending level name/);
  assert.equal(levelDoc(f.current()).buildingLevels.levels.length, 2);
  // Retyping the already committed name cancels only this raw edit and preserves redo.
  f.update(d => editLevelName(d, 'upper', 'Upper')); assert.equal(f.current().levelView!.pendingNames, undefined);
  assert.equal(f.store.getSnapshot().history.redoLabel, redo); f.redo();
  assert.equal(levelDoc(f.current()).buildingLevels.levels.find(level => level.id === 'upper')!.name, 'Upper floor');
  const bad = copy(f.store.getSnapshot().registry); bad.drafts[0].levelView!.pendingNames = { missing: 'Unattached' };
  assert.equal(validateRegistry(bad).status, 'corrupt');
});
