import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteSelection, restoreDeletion } from '../client/src/utils/editorCommands';
import type { Room } from '../client/src/utils/types';

const room: Room = { id: 'room', x: 20, y: 30, width: 200, height: 240, name: 'Original',
  objects: [{ id: 'door', type: 'door', wallSide: 'right', position: 40, size: 53.33333333333333,
    doorProperties: { width: 32, height: 80, style: 'bifold', swingDirection: 'outward', swingSide: 'right' } }] };

test('opening wins over its selected parent; undo restores every property and leaves later edits', () => {
  const original = structuredClone(room);
  const result = deleteSelection([original], 'room', 'door')!;
  assert.equal(result.deleted.kind, 'opening');
  assert.equal(result.rooms.length, 1);
  assert.deepEqual(result.rooms[0].objects, []);
  const edited = result.rooms.map(room => ({ ...room, name: 'Later edit', x: 80 }));
  const restored = restoreDeletion(edited, result.deleted)!;
  assert.deepEqual(restored[0].objects, original.objects);
  assert.equal(restored[0].name, 'Later edit');
  assert.equal(restored[0].x, 80);
  assert.deepEqual(original, room);
});

test('room recovery restores original ordering and all nested openings without replacing other edits', () => {
  const other = { ...room, id: 'other', objects: [] };
  const result = deleteSelection([room, other], 'room', null)!;
  const restored = restoreDeletion([{ ...other, name: 'Keep me' }], result.deleted)!;
  assert.deepEqual(restored[0], room);
  assert.equal(restored[1].name, 'Keep me');
  assert.equal(restoreDeletion(restored, result.deleted), null);
});

test('stale opening selection cannot fall through to deleting a room', () => {
  assert.equal(deleteSelection([room], room.id, 'missing'), null);
  const result = deleteSelection([room], room.id, 'door')!;
  assert.equal(restoreDeletion([], result.deleted), null);
  assert.equal(restoreDeletion([room], result.deleted), null);
});
