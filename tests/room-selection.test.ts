import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandRoomGroups, translateRooms } from '../client/src/utils/roomSelection';
import { restoreDeletion } from '../client/src/utils/editorCommands';
import { legacyRoomsSchema } from '../shared/legacyValidation';
import type { Room } from '../client/src/utils/types';

const rooms: Room[] = [
  { id: 'a', groupId: 'house', x: 20.5, y: -10.25, width: 200, height: 240,
    objects: [{ id: 'window', type: 'window', wallSide: 'top', position: 50, size: 60, windowProperties: { height: 48 } }] },
  { id: 'b', groupId: 'house', x: 220.5, y: -10.25, width: 200, height: 240 },
  { id: 'c', x: 500, y: 0, width: 100, height: 100 },
];
test('explicit groups expand without merging touching ungrouped rooms or opening identity', () => {
  assert.deepEqual(expandRoomGroups(rooms, ['a']), ['a', 'b']);
  assert.deepEqual(expandRoomGroups(rooms, ['c']), ['c']);
  const moved = translateRooms(rooms, ['a', 'b'], -23.75, 68.5);
  assert.equal(moved[1].x - moved[0].x, 200);
  assert.equal(moved[1].y, moved[0].y);
  assert.deepEqual(moved[0].objects, rooms[0].objects);
  assert.equal(moved[2], rooms[2]);
});
test('group deletion undo restores every member and opening without replacing later unrelated edits', () => {
  const later = { ...rooms[2], name: 'Later edit' };
  const restored = restoreDeletion([later], { kind: 'rooms', items: rooms.slice(0,2).map((room,index) => ({ room,index })) });
  assert.deepEqual(restored, [rooms[0], rooms[1], later]);
  assert.equal(restoreDeletion(rooms, { kind: 'rooms', items: [{ room: rooms[0], index: 0 }] }), null);
});
test('legacy API validates optional group and window metadata without changing old sketches', () => {
  assert.deepEqual(legacyRoomsSchema.parse(rooms), rooms);
  const legacy = [{ id: 'old', x: 0, y: 0, width: 20, height: 20 }];
  assert.deepEqual(legacyRoomsSchema.parse(legacy), legacy);
  for (const groupId of ['', 42, 'x'.repeat(129)]) assert.equal(legacyRoomsSchema.safeParse([{ ...rooms[0], groupId }]).success, false);
  for (const height of [0, -1, Infinity, '48']) assert.equal(legacyRoomsSchema.safeParse([{ ...rooms[0], objects: [{ ...rooms[0].objects![0], windowProperties: { height } }] }]).success, false);
});
