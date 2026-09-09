import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptMeasurementDocument } from '../shared/compatibility/legacyDocument';
import { importLegacyPhysicalDraft, upgradePhysicalDraft } from '../shared/compatibility/physicalDraft';
import { toMm, toMm2 } from '../shared/domain/units';
import { parseMeasurement } from '../shared/domain/parseMeasurement';
import { calculateQuantities } from '../shared/quantities/engine';
import { createDraft as createQuick, addRoom as addQuickRoom, editField as editQuick,
  commitField as commitQuick, switchUnit as switchQuick, removeRoom as removeQuickRoom } from '../client/src/features/quick-room/state';
import { createRegistry, createDraft, adoptQuickDraft, adoptLegacyDraft, adoptPhysicalDraft, addRoom, renameRoom,
  editField, commitField, switchUnit, previewDocument, insertDraft, selectDraft, selectedDraft, updateDraft,
  setApplicability, type PhysicalDraft, type RoomField } from '../client/src/features/physical-draft/state';
import { parseRegistry, serializeRegistry, PHYSICAL_DRAFT_STORAGE_KEY, LEGACY_PHYSICAL_DRAFT_STORAGE_KEY } from '../client/src/features/physical-draft/storage';
import { createPhysicalDraftStore, type DraftStorage } from '../client/src/features/physical-draft/store';

import { setOutputEnabled, selectAllCurrentTargets } from '../client/src/features/physical-draft/takeoffCommands';

const AT = '2026-09-08T12:00:00.000Z';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
function legacy() { return { name: 'Original', extra: { preserve: ['all', 'metadata'] }, rooms: [
  { id: 'one', name: 'Living', x: 40, y: 60, width: 240, height: 200, color: '#abcdef', groupId: 'group-a', objects: [
    { id: 'door', type: 'door', wallSide: 'bottom', position: 25, size: 60,
      doorProperties: { width: 36, height: 80, style: 'double', swingSide: 'left', swingDirection: 'outward' } },
    { id: 'window', type: 'window', wallSide: 'left', position: 20, size: 80, windowProperties: { height: 48 } },
    { id: 'old-window', type: 'window', wallSide: 'right', position: 50, size: 40 },
  ] },
  { id: 'two', name: 'Other', x: 280, y: 60, width: 120, height: 160, groupId: 'group-a', objects: [] },
] }; }
function enter(draft: PhysicalDraft, field: RoomField, text: string) {
  return commitField(editField(draft, 'one', field, text), 'one', field, AT);
}
function complete() {
  let draft = addRoom(createDraft('first'), 'one', 'Bedroom');
  draft = enter(draft, 'length', '12 ft');
  draft = enter(draft, 'width', '10 ft');
  draft = enter(draft, 'ceilingHeight', '8 ft');
  for (const output of ['floor-area', 'ceiling-area', 'gross-wall-area'] as const) draft = selectAllCurrentTargets(setOutputEnabled(draft, output, true), output);
  return draft;
}
function output(draft: PhysicalDraft, name: string) {
  const result = calculateQuantities(previewDocument(draft), draft.request);
  assert.ok(result.ok);
  const item = result.calculation.outputs.find(value => value.output === name);
  assert.ok(item);
  return item;
}
class MemoryStorage implements DraftStorage {
  values = new Map<string, string>(); reads: string[] = []; writes: string[] = []; removes: string[] = [];
  failRead = false; failWrite = false; failRemove = false;
  getItem(key: string) { this.reads.push(key); if (this.failRead) throw new Error('Denied'); return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { if (this.failWrite) throw new Error('Quota'); this.writes.push(key); this.values.set(key, value); }
  removeItem(key: string) { if (this.failRemove) throw new Error('Denied'); this.removes.push(key); this.values.delete(key); }
}

test('legacy-pixels-v2 retains original bytes, IDs, groups, style/hinge and promotes only recorded window height', () => {
  const input = legacy(), before = clone(input), result = importLegacyPhysicalDraft(input);
  assert.deepEqual(input, before);
  assert.deepEqual(result.source.original, before);
  assert.deepEqual(result.document.compatibility!.original, before);
  assert.equal(result.document.compatibility!.adapterVersion, 'legacy-pixels-v2');
  assert.deepEqual(result.document.editorContract!.groups, [{ id: 'group-a', roomIds: ['one', 'two'] }]);
  assert.deepEqual(result.document.rooms.map(room => room.id), ['one', 'two']);
  assert.deepEqual(result.document.openings.map(opening => opening.id), ['door', 'window', 'old-window']);
  const [door, window, oldWindow] = result.document.openings;
  assert.equal(door.appearance!.style, 'double');
  assert.equal(door.appearance!.swingSide, 'left');
  assert.equal(door.appearance!.swingDirection, 'outward');
  assert.equal(window.height.state, 'known');
  if (window.height.state === 'known') {
    assert.equal(window.height.valueMm, toMm(48, 'in'));
    assert.equal(window.height.provenance.source, 'imported');
    assert.equal(window.height.provenance.confirmation.status, 'unconfirmed');
  }
  assert.equal(oldWindow.height.state, 'unknown');
  assert.equal(window.sillHeight.state, 'unknown');
  assert.equal(result.document.rooms[0].ceilingHeight.state, 'unknown');
  assert.equal(result.document.calculationContract!.rooms.one.ceiling.value, 'unknown');
  input.rooms[0].name = 'Changed original';
  assert.equal(result.document.rooms[0].name, 'Living');
});

test('legacy v2 preserves width conflicts and clockwise non-midpoint bottom/left positions without altering v1', () => {
  const source = legacy(); source.rooms[0].objects[0].size = 80;
  const old = adaptMeasurementDocument(source); assert.ok('document' in old);
  const oldBefore = clone(old.document), imported = importLegacyPhysicalDraft(source).document;
  assert.equal(imported.openings[0].width.state, 'needs-review');
  assert.deepEqual(imported.openings[0].width, old.document.openings[0].width);
  assert.deepEqual(imported.openings.map(item => item.attachments), old.document.openings.map(item => item.attachments));
  assert.equal(imported.openings[0].attachments[0].offsetMm, toMm(9, 'ft'));
  assert.equal(imported.openings[1].attachments[0].offsetMm, toMm(8, 'ft'));
  assert.deepEqual(old.document, oldBefore);
  assert.equal(old.document.openings[1].height.state, 'unknown');
  assert.equal(old.document.compatibility!.adapterVersion, 'legacy-pixels-v1');
});

test('unsupported or invalid import is rejected instead of partially edited', () => {
  const invalid = legacy(); invalid.rooms[0].objects[1].windowProperties!.height = -1;
  assert.throws(() => importLegacyPhysicalDraft(invalid));
  const document = complete().document;
  assert.throws(() => upgradePhysicalDraft({ ...document, levels: [] }), /cannot safely edit/);
  assert.throws(() => importLegacyPhysicalDraft(document), /physical documents/);
});

test('captured-v2 upgrade preserves current physical data and never reinterprets compatibility originals', () => {
  const old = adaptMeasurementDocument(legacy()); assert.ok('document' in old);
  old.document.id = 45; old.document.revisionId = 'saved-revision';
  const measured = parseMeasurement('14 ft'); assert.ok(measured.ok);
  old.document.rooms[0].length = measured.measurement;
  const original = clone(old.document), upgraded = upgradePhysicalDraft(old.document);
  assert.deepEqual(old.document, original);
  assert.deepEqual(upgraded.source.original, original);
  assert.deepEqual(upgraded.document.rooms[0].length, measured.measurement);
  assert.equal(upgraded.document.openings[1].height.state, 'unknown');
  assert.equal(upgraded.document.compatibility!.adapterVersion, 'legacy-pixels-v1');
  assert.equal(upgraded.document.id, null); assert.equal(upgraded.document.revisionId, null);
  assert.deepEqual(upgradePhysicalDraft(upgraded.document).document, upgraded.document);
});

test('Quick Rooms explicit copy retains raw pending text, old-unit context and measurement events independently', () => {
  let quick = addQuickRoom(createQuick(), 'one');
  quick = commitQuick(editQuick(quick, 'one', 'length', '12 ft 6 in'), 'one', 'length', AT);
  quick = switchQuick(editQuick(quick, 'one', 'width', '9 ft 2'), 'm');
  const original = clone(quick), adopted = adoptQuickDraft(quick, 'quick-copy');
  assert.deepEqual(adopted.fields, quick.fields); assert.deepEqual(adopted.events, quick.events);
  assert.deepEqual(adopted.source.original, original); assert.deepEqual(quick, original);
  assert.equal(adopted.displayUnit, 'm'); assert.equal(adopted.fields.one.width.unit, 'ft');
  assert.equal(previewDocument(adopted).rooms[0].width.state, 'unknown');
  assert.equal(adopted.document.calculationContract!.rooms.one.walls.value, 'unknown');
});

test('independent adopted drafts never merge equal room IDs or room names', () => {
  const first = adoptLegacyDraft(legacy(), 'first'), second = adoptLegacyDraft(legacy(), 'second');
  let registry = insertDraft(insertDraft(createRegistry(), first), second);
  registry = updateDraft(registry, 'second', 0, draft => renameRoom(draft, 'one', 'Changed'));
  assert.equal(registry.drafts[0].document.rooms[0].name, 'Living');
  assert.equal(registry.drafts[1].document.rooms[0].name, 'Changed');
  assert.throws(() => insertDraft(registry, first), /existing draft was not replaced/);
});

test('room dimensions and height share one command/evidence stream and yield 120/120/352 then 396 walls', () => {
  const draft = complete();
  for (const [name, expected] of [['floor-area', 120], ['ceiling-area', 120], ['gross-wall-area', 352]] as const) {
    assert.equal(output(draft, name).status, 'provisional');
    assert.ok(Math.abs(output(draft, name).total!.net - toMm2(expected, 'ft')) < 0.000001);
  }
  const next = enter(draft, 'ceilingHeight', '9 ft');
  assert.ok(Math.abs(output(next, 'gross-wall-area').total!.net - toMm2(396, 'ft')) < 0.000001);
  assert.equal(next.events.length, 4);
  assert.equal(commitField(next, 'one', 'ceilingHeight', AT), next);
  assert.equal(draft.fields.one.ceilingHeight.text, '8 ft');
});

test('dirty raw text masks every dependent result, and clearing height preserves independent floor/ceiling', () => {
  const draft = complete(), dirty = editField(draft, 'one', 'length', '13 ft');
  assert.deepEqual(dirty.document, draft.document);
  assert.equal(output(dirty, 'floor-area').total, null);
  assert.equal(output(dirty, 'ceiling-area').total, null);
  const bad = editField(draft, 'one', 'ceilingHeight', '8 ft 2');
  assert.equal(commitField(bad, 'one', 'ceilingHeight', AT), bad);
  assert.equal(output(bad, 'gross-wall-area').total, null);
  const cleared = enter(bad, 'ceilingHeight', '');
  assert.equal(cleared.document.rooms[0].ceilingHeight.state, 'unknown');
  assert.deepEqual(cleared.events, draft.events);
  assert.ok(output(cleared, 'floor-area').total); assert.ok(output(cleared, 'ceiling-area').total);
});

test('switching units preserves raw context until valid commit/clear then releases it without changing evidence', () => {
  let draft = complete();
  const document = clone(draft.document), events = clone(draft.events);
  draft = switchUnit(draft, 'm');
  assert.deepEqual(draft.document, document); assert.deepEqual(draft.events, events);
  draft = switchUnit(editField(switchUnit(draft, 'ft'), 'one', 'length', '12 ft 6 in'), 'm');
  assert.equal(draft.fields.one.length.unit, 'ft');
  draft = commitField(draft, 'one', 'length', AT);
  assert.equal(draft.fields.one.length.unit, 'm');
  assert.equal(draft.fields.one.length.text, '3.81 m');
  draft = switchUnit(editField(switchUnit(draft, 'ft'), 'one', 'length', ' '), 'm');
  draft = commitField(draft, 'one', 'length', AT);
  draft = enter(draft, 'length', '3.81');
  const length = draft.document.rooms[0].length; assert.equal(length.state, 'known');
  if (length.state === 'known') assert.equal(length.valueMm, 3810);
});

test('unsupported ceiling blocks its output independently of explicitly supported walls', () => {
  const draft = setApplicability(complete(), 'one', 'ceiling', { value: 'unsupported', source: 'manual',
    confirmation: { status: 'unconfirmed' }, detail: 'Vaulted ceiling' });
  assert.equal(output(draft, 'ceiling-area').total, null);
  assert.ok(output(draft, 'gross-wall-area').total);
  assert.ok(output(draft, 'floor-area').total);
});

test('stale revision or changed selection rejects the entire edit without changing either draft', () => {
  let registry = insertDraft(insertDraft(createRegistry(), createDraft('a')), createDraft('b'));
  const before = clone(registry);
  assert.throws(() => updateDraft(registry, 'a', 0, draft => addRoom(draft, 'one')), /selected draft changed/);
  assert.deepEqual(registry, before);
  registry = selectDraft(registry, 'a');
  registry = updateDraft(registry, 'a', 0, draft => addRoom(draft, 'one'));
  assert.throws(() => updateDraft(registry, 'a', 0, draft => renameRoom(draft, 'one', 'Stale')), /selected draft changed/);
  assert.equal(selectedDraft(registry)!.document.rooms[0].name, 'Room 1');
});

test('full registry recovery retains metadata, groups, openings, source evidence, raw context and settings', () => {
  const imported = adoptLegacyDraft(legacy(), 'imported');
  const physical = editField(complete(), 'one', 'width', '10 ft 2');
  const registry = insertDraft(insertDraft(createRegistry(), imported), physical);
  const recovered = parseRegistry(serializeRegistry(registry));
  assert.equal(recovered.status, 'recovered');
  if (recovered.status === 'recovered') assert.deepEqual(recovered.registry, registry);
  assert.equal(parseRegistry(null).status, 'empty');
  assert.equal(parseRegistry('{').status, 'corrupt');
  assert.equal(parseRegistry('{"version":"future"}').status, 'unsupported');
});

test('own special IDs/metadata keys survive recovery without normalization or prototype mutation', () => {
  let draft = addRoom(createDraft('special'), '__proto__');
  draft.document.metadata = JSON.parse('{"__proto__":{"safe":"evidence"}}');
  const registry = insertDraft(createRegistry(), draft), read = parseRegistry(serializeRegistry(registry));
  assert.equal(read.status, 'recovered');
  if (read.status === 'recovered') assert.deepEqual(read.registry, registry);
  assert.equal(({} as { safe?: string }).safe, undefined);
});

test('recovery rejects forged clean text, omitted fields, unknown authoritative totals and tampered action evidence', () => {
  const source = insertDraft(createRegistry(), complete());
  const badText = clone(source); badText.drafts[0].fields.one.length.text = '99 ft';
  assert.equal(parseRegistry(JSON.stringify(badText)).status, 'corrupt');
  const missing = clone(source); delete (missing.drafts[0].fields.one as Partial<typeof missing.drafts[0]['fields']['one']>).width;
  assert.equal(parseRegistry(JSON.stringify(missing)).status, 'corrupt');
  assert.equal(parseRegistry(JSON.stringify({ ...source, totals: { floor: 12 } })).status, 'corrupt');
  const event = clone(source); event.drafts[0].events[0].event.action = 'confirm';
  assert.equal(parseRegistry(JSON.stringify(event)).status, 'corrupt');
  const future = clone(source); future.drafts[0].document.levels = [];
  assert.equal(parseRegistry(JSON.stringify(future)).status, 'unsupported');
});

test('physical snapshot identity cannot be presented as an active temporary revision', () => {
  const registry = insertDraft(createRegistry(), complete());
  registry.drafts[0].document.revisionId = 'server-revision';
  assert.equal(parseRegistry(JSON.stringify(registry)).status, 'corrupt');
});

test('store initializes lazily, touches only its own key and publishes stable immutable snapshots', () => {
  const storage = new MemoryStorage(); let factories = 0;
  const store = createPhysicalDraftStore(() => { factories++; return storage; });
  assert.equal(factories, 0); assert.equal(store.getSnapshot(), store.getSnapshot());
  store.hydrate(); store.hydrate(); assert.equal(factories, 1);
  assert.deepEqual(storage.reads, [PHYSICAL_DRAFT_STORAGE_KEY, LEGACY_PHYSICAL_DRAFT_STORAGE_KEY]);
  assert.ok(store.dispatch(registry => insertDraft(registry, complete())));
  assert.deepEqual(storage.writes, [PHYSICAL_DRAFT_STORAGE_KEY]);
  assert.throws(() => { store.getSnapshot().registry.drafts[0].document.rooms[0].name = 'Mutated'; });
  assert.equal(store.getSnapshot().registry.drafts[0].document.rooms[0].name, 'Bedroom');
});

test('corrupt/unsupported recovery blocks adoption and preserves exact original bytes until explicit discard', () => {
  for (const raw of ['{bad', '{"version":"future","data":[1,2]}']) {
    const storage = new MemoryStorage(); storage.values.set(PHYSICAL_DRAFT_STORAGE_KEY, raw);
    storage.values.set('modern-floor-planner:quick-rooms:v1', 'original quick draft');
    const store = createPhysicalDraftStore(() => storage);
    assert.equal(store.dispatch(registry => insertDraft(registry, complete())), false);
    assert.equal(store.getSnapshot().rawRecovery, raw); assert.equal(storage.values.get(PHYSICAL_DRAFT_STORAGE_KEY), raw);
    assert.equal(store.getSnapshot().registry.drafts.length, 0);
    assert.ok(store.discardRecovery()); assert.deepEqual(storage.removes, [PHYSICAL_DRAFT_STORAGE_KEY]);
    assert.equal(storage.values.get('modern-floor-planner:quick-rooms:v1'), 'original quick draft');
    assert.ok(store.dispatch(registry => insertDraft(registry, complete())));
  }
});

test('denied reads allow memory use without writing unseen recovery bytes', () => {
  const storage = new MemoryStorage(); storage.failRead = true;
  const store = createPhysicalDraftStore(() => storage);
  assert.ok(store.dispatch(registry => insertDraft(registry, complete())));
  assert.equal(store.getSnapshot().cache, 'unavailable');
  storage.failRead = false;
  assert.ok(store.updateDraft('first', complete().localEditRevision, draft => renameRoom(draft, 'one', 'Memory')));
  assert.equal(storage.writes.length, 0);
});

test('quota failure keeps newest edit in memory and old valid recovery intact', () => {
  const storage = new MemoryStorage(), store = createPhysicalDraftStore(() => storage);
  assert.ok(store.dispatch(registry => insertDraft(registry, complete())));
  const raw = storage.values.get(PHYSICAL_DRAFT_STORAGE_KEY);
  storage.failWrite = true;
  assert.ok(store.updateDraft('first', complete().localEditRevision, draft => renameRoom(draft, 'one', 'Newest')));
  assert.equal(store.getSnapshot().registry.drafts[0].document.rooms[0].name, 'Newest');
  assert.equal(storage.values.get(PHYSICAL_DRAFT_STORAGE_KEY), raw);
  assert.equal(store.getSnapshot().cache, 'unavailable');
});

test('external stored changes are detected before write and never overwritten by stale in-memory registry', () => {
  const storage = new MemoryStorage(), store = createPhysicalDraftStore(() => storage);
  store.hydrate(); storage.values.set(PHYSICAL_DRAFT_STORAGE_KEY, 'newer external draft');
  assert.ok(store.dispatch(registry => insertDraft(registry, complete())));
  assert.equal(store.getSnapshot().cache, 'conflict');
  assert.equal(storage.values.get(PHYSICAL_DRAFT_STORAGE_KEY), 'newer external draft');
  assert.equal(storage.writes.length, 0);
});

test('failed discard preserves current memory and recovery; stale callback failure is visible and atomic', () => {
  const storage = new MemoryStorage(), store = createPhysicalDraftStore(() => storage);
  store.dispatch(registry => insertDraft(registry, complete()));
  const before = store.getSnapshot().registry, raw = storage.values.get(PHYSICAL_DRAFT_STORAGE_KEY);
  assert.equal(store.updateDraft('first', 0, draft => renameRoom(draft, 'one', 'Old')), false);
  assert.equal(store.getSnapshot().registry, before); assert.match(store.getSnapshot().error, /selected draft changed/);
  storage.failRemove = true; assert.equal(store.discardRecovery(), false);
  assert.equal(store.getSnapshot().registry, before); assert.equal(storage.values.get(PHYSICAL_DRAFT_STORAGE_KEY), raw);
});

test('new-policy physical copies preserve valid declaration evidence and original source separately', () => {
  const original = complete().document;
  original.calculationContract!.rooms.one.walls = { value: 'vertical-uniform', source: 'manual', confirmation: { status: 'confirmed', confirmedAt: AT } };
  const copy = adoptPhysicalDraft(original, 'physical-copy');
  assert.deepEqual(copy.document.calculationContract, original.calculationContract);
  assert.deepEqual(copy.source.original, original);
  assert.notEqual(copy.document, original);
});

test('deleted Quick Rooms targets retain their historical action captures through adoption and recovery', () => {
  let quick = addQuickRoom(createQuick(), 'deleted');
  quick = commitQuick(editQuick(quick, 'deleted', 'length', '12 ft'), 'deleted', 'length', AT);
  quick = removeQuickRoom(quick, 'deleted');
  assert.equal(quick.document.rooms.length, 0); assert.equal(quick.events.length, 1);
  const adopted = adoptQuickDraft(quick, 'history');
  const recovered = parseRegistry(serializeRegistry(insertDraft(createRegistry(), adopted)));
  assert.equal(recovered.status, 'recovered');
  if (recovered.status === 'recovered') assert.deepEqual(recovered.registry.drafts[0].events, quick.events);
});