import assert from 'node:assert/strict';
import test from 'node:test';
import { createPhysicalDraftStore, type DraftStorage } from '../client/src/features/physical-draft/store';
import { addRoom, createDraft, createRegistry, insertDraft, selectedDraft, adoptLegacyDraft, adoptPhysicalDraft,
  editField, commitField, renameRoom, switchUnit, type PhysicalDraft, type RoomField } from '../client/src/features/physical-draft/state';
import { addOpening, deleteOpening, undoOpeningDelete, moveOpening, editOpeningField, commitOpeningField,
  getOpeningFields, type OpeningField } from '../client/src/features/physical-draft/openingCommands';
import { setOutputEnabled, selectAllCurrentTargets, editWaste, getWasteField } from '../client/src/features/physical-draft/takeoffCommands';
import { captureFieldRevert, revertField } from '../client/src/features/physical-draft/fieldRevert';
import { captureMeasurementReview, confirmMeasurement, resolveMeasurementCandidate,
  captureApplicabilityReview, confirmApplicability } from '../client/src/features/physical-draft/reviewCommands';
import { serializeRegistry, parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY } from '../client/src/features/physical-draft/storage';
import { createQuantitySnapshot, verifyQuantitySnapshot } from '../shared/quantities/snapshot';
import { toMm } from '../shared/domain/units';
import { q001, request as legacyRequest } from './fixtures/physical';

const AT = '2026-09-09T15:00:00.000Z';
const LATER = '2026-09-09T15:01:00.000Z';
const clone = <T,>(value: T): T => structuredClone(value);
class MemoryStorage implements DraftStorage {
  value: string | null = null;
  getItem(key: string) { assert.equal(key, PHYSICAL_DRAFT_STORAGE_KEY); return this.value; }
  setItem(key: string, value: string) { assert.equal(key, PHYSICAL_DRAFT_STORAGE_KEY); this.value = value; }
  removeItem(key: string) { assert.equal(key, PHYSICAL_DRAFT_STORAGE_KEY); this.value = null; }
}
function roomCommit(draft: PhysicalDraft, field: RoomField, text: string) {
  return commitField(editField(draft, 'room', field, text), 'room', field, AT);
}
function openingCommit(draft: PhysicalDraft, id: string, field: OpeningField, text: string) {
  return commitOpeningField(editOpeningField(draft, id, field, text), id, field, AT);
}
function fixture() {
  let draft = addRoom(createDraft('draft'), 'room', 'Alpha');
  draft = roomCommit(roomCommit(roomCommit(draft, 'length', '12 ft'), 'width', '10 ft'), 'ceilingHeight', '8 ft');
  draft = addOpening(draft, 'door', 'door', 'room:top', toMm(2.5, 'ft'), AT,
    { widthMm: toMm(32, 'in'), appearance: { style: 'single', swingSide: 'left', swingDirection: 'outward', metadata: { retained: true } } });
  draft = openingCommit(openingCommit(draft, 'door', 'height', '7 ft'), 'door', 'sillHeight', '0 ft');
  for (const output of ['floor-area', 'ceiling-area'] as const) {
    draft = selectAllCurrentTargets(setOutputEnabled(draft, output, true), output);
  }
  return draft;
}
function imported() {
  return adoptLegacyDraft({ name: 'Preserved import', marker: { nested: ['untouched'] }, rooms: [
    { id: 'room', name: 'Imported', x: 40, y: 60, width: 240, height: 200, color: '#abcdef', objects: [
      { id: 'door', type: 'door', wallSide: 'top', position: 25, size: 80,
        doorProperties: { width: 36, height: 80, style: 'double', swingSide: 'left', swingDirection: 'outward' } },
    ] },
  ] }, 'imported');
}
function harness(seed = fixture()) {
  const storage = new MemoryStorage();
  storage.value = serializeRegistry(insertDraft(createRegistry(), seed));
  const store = createPhysicalDraftStore(() => storage); store.hydrate();
  const current = () => {
    const value = selectedDraft(store.getSnapshot().registry); assert.ok(value); return value;
  };
  function edit(change: (draft: PhysicalDraft) => PhysicalDraft) {
    const before = current();
    assert.equal(store.updateDraft(before.id, before.localEditRevision, change), true, store.getSnapshot().error);
    return current();
  }
  function commitRoom(field: RoomField, text: string) {
    edit(draft => editField(draft, 'room', field, text));
    return edit(draft => commitField(draft, 'room', field, LATER));
  }
  function commitOpening(field: OpeningField, text: string) {
    edit(draft => editOpeningField(draft, 'door', field, text));
    return edit(draft => commitOpeningField(draft, 'door', field, LATER));
  }
  function undo() { const draft = current(); assert.equal(store.undo(draft.id, draft.localEditRevision, LATER), true, store.getSnapshot().error); return current(); }
  function redo() { const draft = current(); assert.equal(store.redo(draft.id, draft.localEditRevision, LATER), true, store.getSnapshot().error); return current(); }
  function recover() {
    const result = parseRegistry(storage.value); assert.equal(result.status, 'recovered');
    if (result.status !== 'recovered') throw Error('Expected current valid recovery');
    assert.deepEqual(result.registry, store.getSnapshot().registry);
  }
  return { storage, store, current, edit, commitRoom, commitOpening, undo, redo, recover };
}

test('history rejects stale revisions and foreign draft identities without consuming either stack', () => {
  const h = harness(); h.commitRoom('ceilingHeight', '9 ft');
  const before = clone(h.store.getSnapshot()), raw = h.storage.value, draft = h.current();
  assert.equal(h.store.undo('another-draft', draft.localEditRevision, LATER), false);
  assert.equal(h.store.undo(draft.id, draft.localEditRevision - 1, LATER), false);
  assert.deepEqual(h.store.getSnapshot().registry, before.registry);
  assert.deepEqual(h.store.getSnapshot().history, before.history); assert.equal(h.storage.value, raw);
  h.undo();
  const undone = clone(h.store.getSnapshot()), undoneRaw = h.storage.value;
  assert.equal(h.store.redo(draft.id, draft.localEditRevision, LATER), false);
  assert.deepEqual(h.store.getSnapshot().registry, undone.registry);
  assert.deepEqual(h.store.getSnapshot().history, undone.history); assert.equal(h.storage.value, undoneRaw);
  h.redo(); h.recover();
});

test('missing targets, reused domain IDs and mutation of frozen state fail without erasing history', () => {
  const h = harness(); h.commitRoom('ceilingHeight', '9 ft');
  const before = clone(h.store.getSnapshot()), raw = h.storage.value;
  for (const change of [
    (draft: PhysicalDraft) => moveOpening(draft, 'removed-opening', 'room:top', toMm(4, 'ft'), LATER),
    (draft: PhysicalDraft) => addOpening(draft, 'door', 'window', 'room:right', toMm(4, 'ft'), LATER),
    (draft: PhysicalDraft) => addRoom(draft, 'room', 'Reused room'),
    (draft: PhysicalDraft) => { draft.document.rooms[0].name = 'Unauthorized in-place write'; return draft; },
  ]) {
    const draft = h.current(); assert.equal(h.store.updateDraft(draft.id, draft.localEditRevision, change), false);
    assert.deepEqual(h.store.getSnapshot().registry, before.registry);
    assert.deepEqual(h.store.getSnapshot().history, before.history); assert.equal(h.storage.value, raw);
  }
  assert.equal(h.undo().document.rooms[0].ceilingHeight.valueMm, toMm(8, 'ft')); h.recover();
});

test('failed targeted opening recovery preserves the newer chronological undo entry', () => {
  let seed = deleteOpening(fixture(), 'door', AT);
  seed = addOpening(seed, 'blocker', 'door', 'room:top', toMm(2.5, 'ft'), AT, { widthMm: toMm(32, 'in') });
  seed = openingCommit(openingCommit(seed, 'blocker', 'height', '7 ft'), 'blocker', 'sillHeight', '0 ft');
  const h = harness(seed); h.edit(draft => renameRoom(draft, 'room', 'Later name'));
  const before = clone(h.store.getSnapshot()), raw = h.storage.value, draft = h.current();
  assert.equal(h.store.updateDraft(draft.id, draft.localEditRevision, current => undoOpeningDelete(current, LATER)), false);
  assert.match(h.store.getSnapshot().error, /overlap|fit|opening/i);
  assert.deepEqual(h.store.getSnapshot().registry, before.registry);
  assert.deepEqual(h.store.getSnapshot().history, before.history); assert.equal(h.storage.value, raw);
  const undone = h.undo(); assert.equal(undone.document.rooms[0].name, 'Alpha');
  assert.deepEqual(undone.document.openings, before.registry.drafts[0].document.openings);
  assert.ok(undone.openingDeleteUndo); h.recover();
});

test('correcting and undoing an imported conflict restores exact candidates, provenance and original JSON', () => {
  const h = harness(imported()), before = clone(h.current());
  assert.equal(before.document.openings[0].width.state, 'needs-review');
  h.commitOpening('width', '36 in');
  const committedEvents = clone(h.current().events), committedOpeningEvents = clone(h.current().openingEvents);
  const after = h.undo();
  assert.deepEqual(after.document, before.document);
  assert.deepEqual(getOpeningFields(after, 'door').width, { text: '', unit: 'ft', dirty: false });
  assert.deepEqual(after.source, before.source); assert.deepEqual(after.events, committedEvents);
  assert.deepEqual(after.openingEvents?.slice(0, committedOpeningEvents?.length), committedOpeningEvents);
  h.recover();
  const redone = h.redo(); assert.equal(redone.document.openings[0].width.valueMm, toMm(36, 'in'));
  assert.equal(redone.document.openings[0].width.state, 'known');
  if (redone.document.openings[0].width.state === 'known') assert.equal(redone.document.openings[0].width.provenance.confirmation.status, 'unconfirmed');
  assert.deepEqual(redone.source, before.source); h.recover();
});

test('undo of an entered imported unknown restores its reason; clear/undo keeps exact retained evidence', () => {
  const h = harness(imported()), unknown = clone(h.current().document.rooms[0].ceilingHeight);
  assert.equal(unknown.state, 'unknown');
  h.commitRoom('ceilingHeight', '8 ft');
  assert.deepEqual(h.undo().document.rooms[0].ceilingHeight, unknown); h.recover();
  const measured = clone(h.redo().document.rooms[0].ceilingHeight);
  h.commitRoom('ceilingHeight', '');
  assert.equal(h.current().document.rooms[0].ceilingHeight.state, 'unknown');
  assert.deepEqual(h.undo().document.rooms[0].ceilingHeight, measured);
  assert.equal(h.redo().document.rooms[0].ceilingHeight.state, 'unknown'); h.recover();
});

test('old v1/v2 snapshots still verify after correcting, undoing and redoing a confirmed imported value', async () => {
  const old = q001();
  const oldSnapshot = await createQuantitySnapshot(old, legacyRequest([{ output: 'floor-area', roomIds: ['room-1'], wasteFraction: 0 }]),
    { id: 'old-v1', createdAt: AT, kind: 'confirmed' });
  assert.ok(oldSnapshot.ok);
  const importedDraft = adoptPhysicalDraft(old, 'confirmed-import');
  importedDraft.request.selections = [{ output: 'floor-area', roomIds: ['room-1'], wasteFraction: 0 }];
  const currentSnapshot = await createQuantitySnapshot(importedDraft.document, importedDraft.request,
    { id: 'old-v2', createdAt: AT, kind: 'confirmed' });
  assert.ok(currentSnapshot.ok);
  const snapshots = [oldSnapshot.snapshot, currentSnapshot.snapshot], bytes = snapshots.map(value => JSON.stringify(value));
  const h = harness(importedDraft), original = clone(h.current().source);
  h.edit(draft => editField(draft, 'room-1', 'length', '13 ft'));
  h.edit(draft => commitField(draft, 'room-1', 'length', LATER));
  const originalEvents = clone(h.current().events);
  for (const [operation, length] of [[h.undo, 12], [h.redo, 13], [h.undo, 12]] as const) {
    const after = operation(), value = after.document.rooms[0].length;
    assert.equal(value.state, 'known');
    if (value.state === 'known') {
      assert.equal(value.valueMm, toMm(length, 'ft')); assert.equal(value.provenance.confirmation.status, 'unconfirmed');
    }
    assert.deepEqual(after.events, originalEvents); assert.deepEqual(after.source, original);
    h.recover();
    for (let index = 0; index < snapshots.length; index++) {
      assert.deepEqual(await verifyQuantitySnapshot(snapshots[index]), { ok: true });
      assert.equal(JSON.stringify(snapshots[index]), bytes[index]);
    }
  }
});

test('explicit measurement/model confirmation and candidate resolution create visible chronological boundaries', () => {
  for (const kind of ['measurement', 'model', 'candidate'] as const) {
    const h = harness(kind === 'candidate' ? imported() : fixture());
    h.edit(draft => renameRoom(draft, 'room', 'Before review'));
    h.commitRoom('ceilingHeight', '9 ft'); h.undo();
    assert.ok(h.store.getSnapshot().history.undoLabel); assert.ok(h.store.getSnapshot().history.redoLabel);
    if (kind === 'measurement') h.edit(draft => confirmMeasurement(draft,
      captureMeasurementReview(draft, { entity: 'room', id: 'room', field: 'width' }), LATER));
    else if (kind === 'model') h.edit(draft => confirmApplicability(draft,
      captureApplicabilityReview(draft, 'room', 'walls'), LATER));
    else h.edit(draft => resolveMeasurementCandidate(draft,
      captureMeasurementReview(draft, { entity: 'opening', id: 'door', field: 'width' }), 0, LATER));
    const after = clone(h.store.getSnapshot());
    assert.equal(after.history.undoLabel, null); assert.equal(after.history.redoLabel, null);
    assert.match(after.history.boundary ?? '', /review|confirm|candidate|boundar/i);
    const current = h.current(); h.store.undo(current.id, current.localEditRevision, LATER); h.store.redo(current.id, current.localEditRevision, LATER);
    assert.deepEqual(h.store.getSnapshot().registry, after.registry); h.recover();
  }
});

test('undo preserves unrelated raw text and old unit contexts, but blocks the conflicting field until Revert', () => {
  const h = harness(); h.commitRoom('ceilingHeight', '9 ft');
  h.edit(draft => editField(draft, 'room', 'length', '12 ft -'));
  h.edit(draft => editOpeningField(draft, 'door', 'height', 'unfinished opening'));
  h.edit(draft => editWaste(draft, 'floor-area', '10.'));
  h.edit(draft => switchUnit(draft, 'm'));
  h.edit(draft => editField(draft, 'room', 'ceilingHeight', 'another unfinished edit'));
  const blocked = clone(h.store.getSnapshot()), raw = h.storage.value, draft = h.current();
  assert.equal(h.store.undo(draft.id, draft.localEditRevision, LATER), false);
  assert.match(h.store.getSnapshot().error, /pending|finish|apply|revert/i);
  assert.deepEqual(h.store.getSnapshot().registry, blocked.registry);
  assert.deepEqual(h.store.getSnapshot().history, blocked.history); assert.equal(h.storage.value, raw);
  h.edit(current => revertField(current, captureFieldRevert(current, { kind: 'room', id: 'room', field: 'ceilingHeight' })));
  const before = clone(h.current()), after = h.undo();
  assert.equal(after.document.rooms[0].ceilingHeight.valueMm, toMm(8, 'ft'));
  assert.deepEqual(after.fields.room.length, before.fields.room.length);
  assert.deepEqual(getOpeningFields(after, 'door'), getOpeningFields(before, 'door'));
  assert.deepEqual(getWasteField(after, 'floor-area'), getWasteField(before, 'floor-area'));
  assert.deepEqual(after.request, before.request); assert.deepEqual(after.source, before.source);
  assert.equal(after.fields.room.ceilingHeight.unit, 'm'); assert.equal(after.fields.room.length.unit, 'ft'); h.recover();
});

test('undoing output removal restores its exact request order without overwriting another output raw field', () => {
  const h = harness(), request = clone(h.current().request);
  h.edit(draft => setOutputEnabled(draft, 'floor-area', false));
  const removed = clone(h.current().request);
  h.edit(draft => editWaste(draft, 'ceiling-area', 'unfinished ceiling waste'));
  const pending = clone(getWasteField(h.current(), 'ceiling-area'));
  assert.deepEqual(h.undo().request, request, 'The original ordered quantity request must be restored exactly');
  assert.deepEqual(getWasteField(h.current(), 'ceiling-area'), pending); h.recover();
  assert.deepEqual(h.redo().request, removed);
  assert.deepEqual(getWasteField(h.current(), 'ceiling-area'), pending); h.recover();
});
