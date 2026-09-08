import assert from 'node:assert/strict';
import { test } from 'node:test';
import { projectPhysicalRooms } from '../client/src/features/physical-draft/projection';
import { getDoorGeometry } from '../client/src/utils/doorGeometry';
import { adaptMeasurementDocument } from '../shared/compatibility/legacyDocument';
import { unknownMeasurement } from '../shared/domain/measurements';
import { toMm } from '../shared/domain/units';
import { q001, room, measured } from './fixtures/physical';

function legacy() {
  return { rooms: [{ id: 'room-1', name: 'Living', x: -45.25, y: 17.5, width: 240.5, height: 200.25, color: '#abcdef', groupId: 'original-group',
    objects: [
      { id: 'top-door', type: 'door', wallSide: 'top', position: 25.125, size: 32 * 20 / 12,
        doorProperties: { width: 32, height: 82.5, style: 'single', swingDirection: 'inward', swingSide: 'left', extra: { keep: ['source'] } } },
      { id: 'right-door', type: 'door', wallSide: 'right', position: 55.125, size: 36 * 20 / 12,
        doorProperties: { width: 36, height: 84, style: 'double', swingDirection: 'outward', swingSide: 'right' } },
      { id: 'bottom-window', type: 'window', wallSide: 'bottom', position: 40.25, size: 48 * 20 / 12,
        windowProperties: { height: 36, extra: { keep: ['source'] } } },
      { id: 'left-window', type: 'window', wallSide: 'left', position: 60.125, size: 30 * 20 / 12 },
    ] }] };
}
function adapted(source = legacy()) {
  const result = adaptMeasurementDocument(source); assert.ok('document' in result, JSON.stringify(result));
  return result.document;
}
function near(actual: number, expected: number) { assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`); }

test('M3B projection preserves clockwise all-wall offsets, saved door hinges and typed group authority', () => {
  const source = legacy(), doc = adapted(source), before = structuredClone(doc);
  doc.editorContract = { version: 'sketch-editor-v1', groups: [{ id: 'current-group', roomIds: ['room-1'] }] };
  const projected = projectPhysicalRooms(doc); assert.equal(projected.rooms.length, 1);
  const actual = projected.rooms[0], original = source.rooms[0];
  for (const field of ['x', 'y', 'width', 'height'] as const) near(actual[field], original[field]);
  assert.equal(actual.groupId, 'current-group'); assert.equal(actual.color, original.color);
  for (const expected of original.objects) {
    const object = actual.objects!.find(value => value.id === expected.id)!;
    assert.ok(object, expected.id); near(object.position, expected.position); assert.equal(object.wallSide, expected.wallSide);
    if (expected.doorProperties) {
      assert.equal(object.doorProperties!.swingSide, expected.doorProperties.swingSide);
      assert.equal(object.doorProperties!.swingDirection, expected.doorProperties.swingDirection);
      assert.equal(object.doorProperties!.style, expected.doorProperties.style);
      near(getDoorGeometry(actual, object).swingSize, expected.doorProperties.width * 20 / 12);
    }
  }
  assert.deepEqual(doc.compatibility, before.compatibility);
  assert.deepEqual(doc.rooms, before.rooms);
});

test('M3B unresolved legacy width renders only original symbol evidence and preserves unresolved candidates', () => {
  const source = legacy(); source.rooms[0].objects[0].size = 25;
  const doc = adapted(source), before = structuredClone(doc);
  assert.equal(doc.openings[0].width.state, 'needs-review');
  const projected = projectPhysicalRooms(doc), actual = projected.rooms[0].objects!.find(value => value.id === 'top-door')!;
  assert.ok(projected.notices.some(value => /top-door/.test(value) && /review|original/i.test(value)));
  assert.equal(actual.size, 25); assert.equal(actual.doorProperties!.width, 32);
  assert.equal(actual.doorProperties!.swingSide, 'left'); assert.equal(actual.doorProperties!.swingDirection, 'inward');
  assert.deepEqual(doc, before);
  doc.openings[0].width = unknownMeasurement('No width evidence'); delete doc.compatibility;
  assert.equal(projectPhysicalRooms(doc).rooms[0].objects!.some(value => value.id === 'top-door'), false);
});

test('M3B known physical door without appearance cannot use legacy guessed bar or swing widths', () => {
  const doc = q001(); doc.openings[0].width = measured('32 in');
  const projected = projectPhysicalRooms(doc), object = projected.rooms[0].objects!.find(value => value.id === 'door');
  // Slice 1 intentionally omits unsupported appearance instead of inventing its hand/style.
  assert.equal(object, undefined);
  assert.ok(projected.notices.some(value => /door/i.test(value) && /appearance|symbol/i.test(value)));
  assert.equal(doc.openings[0].width.state === 'known' && doc.openings[0].width.valueMm, 812.8);
});

test('M3B legacy missing-properties door retains source rendering with an explicit limitation', () => {
  const source = legacy(); delete (source.rooms[0].objects[0] as any).doorProperties;
  source.rooms[0].objects[0].size = 23.25;
  const doc = adapted(source), projected = projectPhysicalRooms(doc), object = projected.rooms[0].objects!.find(value => value.id === 'top-door')!;
  assert.ok(object); assert.equal(object.doorProperties, undefined);
  assert.equal(getDoorGeometry(projected.rooms[0], object).size, 40);
  assert.ok(projected.notices.some(value => /top-door/.test(value) && /legacy|original|fallback/i.test(value)));
});

test('M3B projection deeply detaches unresolved source symbols and known appearance metadata', () => {
  const doc = adapted();
  doc.openings.find(value => value.id === 'bottom-window')!.width = unknownMeasurement('Review the recorded width');
  const before = structuredClone(doc), projected = projectPhysicalRooms(doc);
  const window = projected.rooms[0].objects!.find(value => value.id === 'bottom-window')!;
  (window.windowProperties as any).extra.keep.push('changed view');
  const door = projected.rooms[0].objects!.find(value => value.id === 'top-door')!;
  const possibleMetadata = (door.doorProperties as any)?.metadata;
  if (possibleMetadata?.extra?.keep) possibleMetadata.extra.keep.push('changed view');
  projected.rooms[0].x += 100; window.position = 3;
  assert.deepEqual(doc, before);
});

test('M3B unsupported room range cannot hide later normal rooms or poison derived layout positions', () => {
  const doc = q001(); doc.openings = []; doc.rooms = [room('too-large'), room('normal'), room('next')];
  delete doc.rooms[0].presentation; delete doc.rooms[1].presentation; delete doc.rooms[2].presentation;
  doc.rooms[0].length = measured('1000000000 mm');
  const before = structuredClone(doc), projected = projectPhysicalRooms(doc);
  assert.deepEqual(projected.rooms.map(value => value.id), ['normal', 'next']);
  assert.equal(projected.rooms[0].x, 0); near(projected.rooms[1].x, 300);
  assert.ok(projected.notices.some(value => /too-large|outside/i.test(value)));
  assert.deepEqual(doc, before);
});

test('M3B missing room dimensions do not receive a measured-looking placeholder; physical edits update derived offsets', () => {
  const doc = q001(); doc.openings = []; doc.rooms.push(room('missing'));
  doc.rooms[1].width = unknownMeasurement('Unmeasured plan width');
  const projected = projectPhysicalRooms(doc);
  assert.deepEqual(projected.rooms.map(value => value.id), ['room-1']);
  assert.ok(projected.notices.some(value => /missing/.test(value)));
  const source = legacy(), imported = adapted(source);
  const originalOffset = imported.openings[0].attachments[0].offsetMm;
  imported.rooms[0].length = measured('15 ft');
  const updated = projectPhysicalRooms(imported).rooms[0];
  near(updated.objects![0].position, originalOffset / toMm(15, 'ft') * 100);
  assert.equal(imported.openings[0].attachments[0].offsetMm, originalOffset);
  assert.deepEqual(imported.compatibility!.original, source);
});
