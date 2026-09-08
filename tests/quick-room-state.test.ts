import assert from 'node:assert/strict';
import test from 'node:test';
import { physicalDocumentSchema } from '../shared/domain/document';
import { parseMeasurement } from '../shared/domain/parseMeasurement';
import { toMm, toMm2 } from '../shared/domain/units';
import { calculateQuantities } from '../shared/quantities/engine';
import { measurementEventCaptureSchema } from '../shared/quantities/snapshot';
import { addRoom, commitField, createDraft, duplicateRoom, editField, fieldError, previewDocument,
  removeRoom, renameRoom, requestForRooms, ROOM_FIELDS, switchUnit, type QuickRoomDraft, type RoomField } from '../client/src/features/quick-room/state';
import { parseDraft, serializeDraft, QUICK_ROOM_STORAGE_KEY } from '../client/src/features/quick-room/storage';

const AT = '2026-09-07T12:00:00.000Z';
function enter(draft: QuickRoomDraft, id: string, field: RoomField, text: string): QuickRoomDraft {
  return commitField(editField(draft, id, field, text), id, field, AT);
}
function complete(): QuickRoomDraft {
  let draft = addRoom(createDraft(), 'one', 'Bedroom');
  draft = enter(draft, 'one', 'length', '12 ft');
  draft = enter(draft, 'one', 'width', '10 ft');
  return enter(draft, 'one', 'ceilingHeight', '8 ft');
}
function evaluation(draft: QuickRoomDraft) {
  const document = previewDocument(draft), result = calculateQuantities(document, requestForRooms(document));
  assert.ok(result.ok);
  return result.calculation;
}
function output(draft: QuickRoomDraft, name: 'floor-area' | 'ceiling-area' | 'gross-wall-area') {
  const result = evaluation(draft).outputs.find(value => value.output === name);
  assert.ok(result);
  return result;
}
function known(text: string) {
  const parsed = parseMeasurement(text);
  assert.ok(parsed.ok);
  return parsed.measurement;
}

test('Quick Rooms starts with no verified zero project or invented dimensions', () => {
  const empty = createDraft();
  assert.equal(evaluation(empty).status, 'empty');
  const draft = addRoom(empty, 'one');
  assert.ok(physicalDocumentSchema.safeParse(draft.document).success);
  assert.equal(draft.document.id, null);
  assert.equal(draft.document.revisionId, null);
  assert.equal(draft.document.rooms[0].name, 'Room 1');
  for (const field of ROOM_FIELDS) assert.equal(draft.document.rooms[0][field].state, 'unknown');
  assert.equal(output(draft, 'floor-area').total, null);
  assert.equal(empty.document.rooms.length, 0);
});

test('entered 12x10x8 uses the real engine for 120 floor, 120 ceiling and 352 gross walls', () => {
  const draft = complete();
  for (const [name, expected] of [['floor-area', 120], ['ceiling-area', 120], ['gross-wall-area', 352]] as const) {
    const result = output(draft, name);
    assert.equal(result.status, 'provisional');
    assert.ok(Math.abs(result.total!.net - toMm2(expected, 'ft')) < 1e-6);
    assert.equal(result.total!.allowance, 0);
  }
  assert.equal(draft.events.length, 3);
  assert.ok(draft.events.every(event => measurementEventCaptureSchema.safeParse(event).success));
  assert.ok(ROOM_FIELDS.every(field => draft.document.rooms[0][field].state === 'known'
    && draft.document.rooms[0][field].provenance.confirmation.status === 'unconfirmed'));
});

test('clearing ceiling height keeps floor and ceiling available, gross walls unavailable', () => {
  const before = complete();
  const draft = enter(before, 'one', 'ceilingHeight', '');
  assert.equal(draft.document.rooms[0].ceilingHeight.state, 'unknown');
  assert.equal(output(draft, 'floor-area').status, 'provisional');
  assert.equal(output(draft, 'ceiling-area').status, 'provisional');
  assert.equal(output(draft, 'gross-wall-area').total, null);
  assert.equal(draft.events.length, before.events.length);
  assert.deepEqual(draft.events, before.events);
});

test('invalid visible edits mask stale dependent values without mutating canonical measurements', () => {
  const before = complete();
  const draft = editField(before, 'one', 'length', '12 ft 6');
  assert.equal(draft.fields.one.length.text, '12 ft 6');
  assert.ok(fieldError(draft.fields.one.length));
  assert.deepEqual(draft.document, before.document);
  assert.equal(output(draft, 'floor-area').total, null);
  assert.equal(output(draft, 'ceiling-area').total, null);
  assert.equal(output(draft, 'gross-wall-area').completeness, 'partial');
  assert.equal(commitField(draft, 'one', 'length', AT), draft);
  const corrected = enter(draft, 'one', 'length', '13 ft');
  assert.ok(Math.abs(output(corrected, 'floor-area').total!.net - toMm2(130, 'ft')) < 1e-6);
});

test('valid but uncommitted text and blank typing also hide prior totals', () => {
  const before = complete();
  for (const text of ['15', '']) {
    const draft = editField(before, 'one', 'length', text);
    assert.equal(fieldError(draft.fields.one.length), null);
    assert.equal(output(draft, 'floor-area').total, null);
    assert.equal(draft.document.rooms[0].length.valueMm, before.document.rooms[0].length.valueMm);
  }
});

test('zero, negative, exponent and invalid fractions never become valid dimensions', () => {
  for (const text of ['0', '-12 ft', '1e3', '3/0 in', '12 ft 12 in']) {
    const before = complete(), editing = editField(before, 'one', 'length', text);
    const draft = commitField(editing, 'one', 'length', AT);
    assert.equal(draft, editing);
    assert.ok(fieldError(draft.fields.one.length));
    assert.equal(output(draft, 'floor-area').total, null);
    assert.deepEqual(draft.document, before.document);
  }
});

test('equivalent imperial and metric syntax preserves the same 3810 mm length', () => {
  for (const text of ['12 ft 6 in', '12.5 ft', '3.81 m']) {
    const draft = enter(addRoom(createDraft(), 'one'), 'one', 'length', text);
    assert.equal(draft.document.rooms[0].length.valueMm, 3810);
    assert.equal(draft.fields.one.length.text, text);
    assert.equal(draft.document.rooms[0].length.state === 'known' && draft.document.rooms[0].length.provenance.input, text);
  }
});

test('fractional text is not reformatted on typing or commit', () => {
  const text = '12 ft 6 3/8 in';
  const editing = editField(addRoom(createDraft(), 'one'), 'one', 'length', text);
  assert.equal(editing.fields.one.length.text, text);
  const committed = commitField(editing, 'one', 'length', AT);
  assert.equal(committed.fields.one.length.text, text);
  assert.equal(committed.document.rooms[0].length.state === 'known' && committed.document.rooms[0].length.provenance.input, text);
});

test('Enter plus blur commits once and repeating unchanged edits is a no-op', () => {
  const original = addRoom(createDraft(), 'one');
  const editing = editField(original, 'one', 'length', '12');
  const entered = commitField(editing, 'one', 'length', AT);
  assert.equal(commitField(entered, 'one', 'length', AT), entered);
  assert.equal(editField(entered, 'one', 'length', '12'), entered);
  assert.equal(entered.events.length, 1);
  assert.equal(original.events.length, 0);
});

test('committed unit changes change presentation only and retain original provenance', () => {
  const before = complete();
  const metric = switchUnit(before, 'm');
  assert.equal(metric.fields.one.length.text, '3.6576 m');
  assert.equal(metric.fields.one.length.unit, 'm');
  assert.deepEqual(metric.document, before.document);
  assert.deepEqual(metric.events, before.events);
  assert.deepEqual(evaluation(metric), evaluation(before));
  const feet = switchUnit(metric, 'ft');
  assert.equal(feet.fields.one.length.text, '12 ft');
  assert.deepEqual(feet.document, before.document);
  assert.equal(commitField(metric, 'one', 'length', AT), metric);
});

test('an unresolved bare value retains feet context when project display changes to meters', () => {
  const editing = editField(complete(), 'one', 'length', '15');
  const metric = switchUnit(editing, 'm');
  assert.equal(metric.displayUnit, 'm');
  assert.deepEqual(metric.fields.one.length, { text: '15', unit: 'ft', dirty: true });
  const committed = commitField(metric, 'one', 'length', AT);
  assert.equal(committed.document.rooms[0].length.valueMm, toMm(15, 'ft'));
  assert.ok(Math.abs(output(committed, 'floor-area').total!.net - toMm2(150, 'ft')) < 1e-6);
});

test('clearing an old-unit edit releases its context before a new bare metric measurement', () => {
  const editing = editField(complete(), 'one', 'length', '15');
  const metric = switchUnit(editing, 'm');
  const cleared = enter(metric, 'one', 'length', '');
  assert.deepEqual(cleared.fields.one.length, { text: '', unit: 'm', dirty: false });
  assert.equal(cleared.document.rooms[0].length.state, 'unknown');
  const entered = enter(cleared, 'one', 'length', '3.81');
  assert.equal(entered.document.rooms[0].length.valueMm, 3810);
  assert.equal(entered.document.rooms[0].length.state === 'known' && entered.document.rooms[0].length.provenance.unit, 'm');
});

test('resolving an old-unit edit converts presentation to the selected unit while retaining parsed evidence', () => {
  const editing = editField(complete(), 'one', 'length', '12 ft 6 in');
  const metric = switchUnit(editing, 'm');
  const entered = commitField(metric, 'one', 'length', AT);
  assert.deepEqual(entered.fields.one.length, { text: '3.81 m', unit: 'm', dirty: false });
  assert.equal(entered.document.rooms[0].length.valueMm, 3810);
  const measurement = entered.document.rooms[0].length;
  assert.equal(measurement.state, 'known');
  if (measurement.state === 'known') {
    assert.equal(measurement.provenance.input, '12 ft 6 in');
    assert.equal(measurement.provenance.unit, 'ft-in');
  }
  assert.equal(commitField(entered, 'one', 'length', AT), entered);
  const next = enter(entered, 'one', 'length', '4');
  assert.equal(next.document.rooms[0].length.valueMm, 4000);
});

test('new metric fields use metric context without affecting older dirty fields', () => {
  const metric = switchUnit(createDraft(), 'm');
  const entered = enter(addRoom(metric, 'metric'), 'metric', 'length', '3.81');
  assert.equal(entered.document.rooms[0].length.valueMm, 3810);
  assert.equal(entered.fields.metric.length.unit, 'm');
});

test('duplicate creates independent IDs and state; editing its length yields project 270 and 752', () => {
  const original = complete();
  const copied = duplicateRoom(original, 'one', 'two');
  const first = copied.document.rooms[0], second = copied.document.rooms[1];
  assert.equal(second.name, 'Bedroom copy');
  assert.deepEqual(second.wallFaces.map(wall => wall.side), ['top', 'right', 'bottom', 'left']);
  assert.equal(new Set(copied.document.rooms.flatMap(room => [room.id, ...room.wallFaces.map(wall => wall.id)])).size, 10);
  assert.notEqual(first.length, second.length);
  assert.notEqual(copied.fields.one, copied.fields.two);
  assert.notEqual(copied.fields.one.length, copied.fields.two.length);
  assert.ok(Math.abs(output(copied, 'floor-area').total!.net - toMm2(240, 'ft')) < 1e-6);
  assert.ok(Math.abs(output(copied, 'gross-wall-area').total!.net - toMm2(704, 'ft')) < 1e-6);
  const edited = enter(copied, 'two', 'length', '15 ft');
  assert.deepEqual(edited.document.rooms[0], original.document.rooms[0]);
  assert.ok(Math.abs(output(edited, 'floor-area').total!.net - toMm2(270, 'ft')) < 1e-6);
  assert.ok(Math.abs(output(edited, 'gross-wall-area').total!.net - toMm2(752, 'ft')) < 1e-6);
  assert.equal(original.document.rooms.length, 1);
});

test('duplicate resets known confirmation, preserves unresolved candidates and clones presentation', () => {
  const original = complete();
  const room = original.document.rooms[0];
  assert.equal(room.length.state, 'known');
  if (room.length.state === 'known') room.length.provenance.confirmation = { status: 'confirmed', confirmedAt: AT };
  room.width = { state: 'needs-review', valueMm: null, reason: 'Choose explicitly', candidates: [
    { label: 'First', valueMm: known('9 ft').valueMm, provenance: known('9 ft').provenance },
    { label: 'Second', valueMm: known('10 ft').valueMm, provenance: known('10 ft').provenance },
  ] };
  original.fields.one.width = { text: '', unit: 'ft', dirty: false };
  room.presentation = { xMm: toMm(1, 'm'), yMm: toMm(2, 'm'), color: 'blue' };
  room.metadata = { nested: { labels: ['original'] } };
  const copied = duplicateRoom(original, 'one', 'two');
  const second = copied.document.rooms[1];
  assert.equal(second.length.state === 'known' && second.length.provenance.confirmation.status, 'unconfirmed');
  assert.equal(room.length.state === 'known' && room.length.provenance.confirmation.status, 'confirmed');
  assert.deepEqual(second.width, room.width);
  assert.notEqual(second.width, room.width);
  assert.deepEqual(second.presentation, room.presentation);
  assert.notEqual(second.presentation, room.presentation);
  assert.notEqual(second.metadata.nested, room.metadata.nested);
  assert.deepEqual(copied.events, original.events);
});

test('duplicate preserves incomplete form context and masks copied stale values', () => {
  const original = switchUnit(editField(complete(), 'one', 'length', '12 ft 6'), 'm');
  const copied = duplicateRoom(original, 'one', 'two');
  assert.deepEqual(copied.fields.two.length, { text: '12 ft 6', unit: 'ft', dirty: true });
  assert.equal(output(copied, 'floor-area').total, null);
});

test('unsupported openings and future physical properties are rejected without lossy duplication', () => {
  const original = complete();
  original.document.openings.push({ id: 'door', kind: 'door', width: known('3 ft'), height: known('7 ft'),
    sillHeight: { ...known('1 mm'), valueMm: toMm(0, 'mm') }, measureBasis: 'finished',
    attachments: [{ wallFaceId: 'one:top', anchor: 'center', offsetMm: toMm(6, 'ft') }], metadata: {} });
  const before = structuredClone(original);
  assert.throws(() => duplicateRoom(original, 'one', 'two'), /unsupported/i);
  assert.deepEqual(original, before);
  const future = complete();
  future.document.rooms[0].futureShape = { points: [1, 2] };
  assert.throws(() => duplicateRoom(future, 'one', 'two'), /unsupported/i);
});

test('room ID collisions include existing wall IDs and never mutate the input', () => {
  const original = complete();
  for (const id of ['one', 'one:top', '', 'bad\nID']) {
    assert.throws(() => addRoom(original, id), /distinct valid IDs/i);
    assert.throws(() => duplicateRoom(original, 'one', id), /distinct valid IDs/i);
  }
  assert.equal(original.document.rooms.length, 1);
});

test('rename and intended removal affect only the selected room while retaining action evidence', () => {
  const original = duplicateRoom(complete(), 'one', 'two');
  const renamed = renameRoom(original, 'two', 'A long custom room name with / and <text>');
  assert.equal(renamed.document.rooms[0].name, 'Bedroom');
  assert.equal(original.document.rooms[1].name, 'Bedroom copy');
  const removed = removeRoom(renamed, 'two');
  assert.equal(removed.document.rooms.length, 1);
  assert.equal(Object.prototype.hasOwnProperty.call(removed.fields, 'two'), false);
  assert.deepEqual(removed.events, original.events);
  assert.throws(() => removeRoom(removed, 'two'), /no longer exists/);
});

test('preview is detached and only selects room-only zero-waste quantities', () => {
  const draft = complete(), preview = previewDocument(draft);
  preview.rooms[0].name = 'changed preview';
  assert.equal(draft.document.rooms[0].name, 'Bedroom');
  const request = requestForRooms(preview);
  assert.deepEqual(request.selections.map(selection => selection.output), ['floor-area', 'ceiling-area', 'gross-wall-area']);
  assert.ok(request.selections.every(selection => 'wasteFraction' in selection && selection.wasteFraction === 0));
});

test('storage round-trip retains raw edits, unit contexts and action evidence without quantity totals', () => {
  const original = switchUnit(editField(complete(), 'one', 'length', '12 ft 6'), 'm');
  const serialized = serializeDraft(original);
  assert.equal(QUICK_ROOM_STORAGE_KEY, 'modern-floor-planner:quick-rooms:v1');
  const result = parseDraft(serialized);
  assert.equal(result.status, 'recovered');
  if (result.status !== 'recovered') return;
  assert.deepEqual(result.draft, original);
  assert.notEqual(result.draft.document, original.document);
  assert.equal(output(result.draft, 'floor-area').total, null);
  assert.deepEqual(Object.keys(JSON.parse(serialized)).sort(), ['version', 'document', 'displayUnit', 'fields', 'events'].sort());
});

test('unit-switched clean presentation recovers without rescaling or confirming canonical dimensions', () => {
  const original = switchUnit(complete(), 'm');
  const result = parseDraft(serializeDraft(original));
  assert.equal(result.status, 'recovered');
  if (result.status !== 'recovered') return;
  assert.deepEqual(result.draft.document, original.document);
  assert.equal(output(result.draft, 'floor-area').status, 'provisional');
});

test('missing, corrupt, unsupported and future cache contents are classified without rewriting', () => {
  assert.deepEqual(parseDraft(null), { status: 'empty' });
  for (const raw of ['', '{', 'null', '[]', '3']) assert.equal(parseDraft(raw).status, 'corrupt');
  const unsupported = JSON.stringify({ version: 'quick-room-draft-v999', valuable: { original: true } });
  assert.equal(parseDraft(unsupported).status, 'unsupported');
  assert.equal(unsupported, '{"version":"quick-room-draft-v999","valuable":{"original":true}}');
  const extra = { ...complete(), totals: { floorArea: 999 } };
  assert.equal(parseDraft(JSON.stringify(extra)).status, 'corrupt');
});

test('cache rejects nonfinite measurements, stale field sets and duplicate physical IDs', () => {
  const nonfinite = serializeDraft(complete()).replace('3657.6000000000004', '1e999');
  assert.equal(parseDraft(nonfinite).status, 'corrupt');
  const stale = complete();
  stale.fields.stale = structuredClone(stale.fields.one);
  assert.equal(parseDraft(JSON.stringify(stale)).status, 'corrupt');
  const duplicate = duplicateRoom(complete(), 'one', 'two');
  duplicate.document.rooms[1].wallFaces[0].id = 'one:top';
  assert.equal(parseDraft(JSON.stringify(duplicate)).status, 'corrupt');
});

test('cache never trusts forged clean flags while visible text disagrees with canonical values', () => {
  for (const text of ['0', '15 ft', '12 ft 6', '']) {
    const draft = complete();
    draft.fields.one.length = { text, unit: 'ft', dirty: false };
    assert.equal(parseDraft(JSON.stringify(draft)).status, 'corrupt');
  }
  const unknown = addRoom(createDraft(), 'one');
  unknown.fields.one.length = { text: '12', unit: 'ft', dirty: false };
  assert.equal(parseDraft(JSON.stringify(unknown)).status, 'corrupt');
});

test('cache rejects restored confirmation and identified revisions instead of implying authority', () => {
  const confirmed = complete();
  const length = confirmed.document.rooms[0].length;
  if (length.state === 'known') length.provenance.confirmation = { status: 'confirmed', confirmedAt: AT };
  assert.equal(parseDraft(JSON.stringify(confirmed)).status, 'unsupported');
  const revision = complete();
  revision.document.revisionId = 'saved-revision';
  assert.equal(parseDraft(JSON.stringify(revision)).status, 'unsupported');
});

test('cache validates captured actions with existing replay rules', () => {
  const impossible = complete();
  impossible.events[0].event.after = known('13 ft');
  impossible.events[0].event.after.provenance.confirmation = { status: 'confirmed', confirmedAt: AT };
  assert.equal(parseDraft(JSON.stringify(impossible)).status, 'corrupt');
  const zero = complete();
  zero.events[0].event.after = { ...known('1 mm'), valueMm: toMm(0, 'mm') };
  assert.equal(parseDraft(JSON.stringify(zero)).status, 'corrupt');
});

test('cache rejects unsupported content instead of dropping it, including document extras', () => {
  const future = complete();
  future.document.futureGeometry = { keepMe: true };
  assert.equal(parseDraft(JSON.stringify(future)).status, 'unsupported');
  const compatibility = complete();
  compatibility.document.compatibility = { adapterVersion: 'legacy-pixels-v1', original: { keepMe: true },
    before: { rooms: 1, openings: 0 }, after: { rooms: 1, openings: 0 } };
  assert.equal(parseDraft(JSON.stringify(compatibility)).status, 'unsupported');
});

test('serialization rejects cyclic/exotic input rather than omitting or coercing original data', () => {
  const draft = complete();
  draft.document.metadata.cycle = draft.document.metadata;
  assert.throws(() => serializeDraft(draft), /finite JSON/);
  const exotic = complete();
  exotic.document.metadata.when = new Date(AT);
  assert.throws(() => serializeDraft(exotic), /finite JSON/);
});

test('historical correction evidence survives clearing and removing its original target', () => {
  const original = complete();
  const cleared = enter(original, 'one', 'length', '');
  const removed = removeRoom(cleared, 'one');
  assert.equal(removed.document.rooms.length, 0);
  assert.equal(removed.events.length, 3);
  const recovered = parseDraft(serializeDraft(removed));
  assert.equal(recovered.status, 'recovered');
  if (recovered.status === 'recovered') assert.equal(evaluation(recovered.draft).status, 'empty');
});
