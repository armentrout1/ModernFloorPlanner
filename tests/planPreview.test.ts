import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getPlanPreviewBounds } from '../client/src/utils/planPreview';
import type { Room, RoomObject, SwingSide, WallSide } from '../client/src/utils/types';

function withDoor(wallSide: WallSide, swingSide: SwingSide = 'right'): Room {
  return { id: 'room', x: 100, y: 200, width: 400, height: 320, objects: [{
    id: 'door', type: 'door', wallSide, position: 50, size: 17,
    doorProperties: { width: 36, height: 80, style: 'single', swingDirection: 'outward', swingSide },
  }] };
}

test('empty plans have no bounds, while zero extents are left for the viewport to handle', () => {
  assert.equal(getPlanPreviewBounds([]), null);
  assert.deepEqual(getPlanPreviewBounds([{ id: 'point', x: -12, y: 8, width: 0, height: 0 }]),
    { x: -12, y: 8, width: 0, height: 0 });
});

test('negative and distant fractional rooms produce bounds in their actual coordinate system', () => {
  const rooms: Room[] = [
    { id: 'negative', x: -400.5, y: -300.25, width: 200.25, height: 100.5 },
    { id: 'distant', x: 10000.125, y: 20000.75, width: 400.5, height: 320.25 },
  ];
  assert.deepEqual(getPlanPreviewBounds(rooms), { x: -400.5, y: -300.25, width: 10801.125, height: 20621.25 });
  assert.deepEqual(getPlanPreviewBounds([rooms[1]]), { x: 10000.125, y: 20000.75, width: 400.5, height: 320.25 });
});

const outswingBounds = {
  top: { x: 100, y: 144, width: 400, height: 376 },
  right: { x: 100, y: 200, width: 456, height: 320 },
  bottom: { x: 100, y: 200, width: 400, height: 376 },
  left: { x: 44, y: 200, width: 456, height: 320 },
};
for (const wall of Object.keys(outswingBounds) as WallSide[]) {
  test(`${wall} outswing fits both stored hinge sides using actual door width`, () => {
    for (const side of ['left', 'right'] as const) {
      assert.deepEqual(getPlanPreviewBounds([withDoor(wall, side)]), outswingBounds[wall]);
    }
  });
}

test('sliding doors add their real bar bounds without an invisible swing extent', () => {
  const room = withDoor('top');
  room.objects![0].doorProperties!.style = 'sliding';
  room.objects![0].doorProperties!.width = 360;
  // 600px wide around the 200px center extends 100px beyond either room edge.
  assert.deepEqual(getPlanPreviewBounds([room]), { x: 0, y: 200, width: 600, height: 320 });
});

test('large inward swings and bars remain included even when legacy geometry exceeds room extents', () => {
  const room = withDoor('top');
  room.objects![0].doorProperties!.swingDirection = 'inward';
  room.objects![0].doorProperties!.width = 360;
  assert.deepEqual(getPlanPreviewBounds([room]), { x: 0, y: 200, width: 600, height: 604 });
});

test('legacy doors preserve the rendered40px bar and60px swing, not their conflicting saved size', () => {
  const room: Room = { id: 'small', x: -10, y: -20, width: 20, height: 20,
    objects: [{ id: 'old', type: 'door', wallSide: 'top', position: 50, size: 200 }] };
  assert.deepEqual(getPlanPreviewBounds([room]), { x: -30, y: -20, width: 60, height: 64 });
  assert.equal(Object.hasOwn(room.objects![0], 'doorProperties'), false);
});

test('horizontal legacy windows use actual saved width beyond the room, independent of height metadata', () => {
  const room: Room = { id: 'room', x: 300, y: 400, width: 200, height: 120,
    objects: [{ id: 'window', type: 'window', wallSide: 'top', position: 50, size: 300, windowProperties: { height: 1000 } }] };
  assert.deepEqual(getPlanPreviewBounds([room]), { x: 250, y: 400, width: 300, height: 120 });
});

test('vertical legacy windows use actual saved width and off-center attachment', () => {
  const room: Room = { id: 'room', x: 300, y: 400, width: 200, height: 120,
    objects: [{ id: 'window', type: 'window', wallSide: 'right', position: 25, size: 300 }] };
  assert.deepEqual(getPlanPreviewBounds([room]), { x: 300, y: 280, width: 200, height: 300 });
});

test('bounds preserve frozen saved rooms, openings, optional fields and custom metadata', () => {
  const room = { ...withDoor('left'), name: 'Saved room', groupId: 'group', custom: { note: 'Keep exact' } };
  const extra: RoomObject = { id: 'window', type: 'window', wallSide: 'bottom', position: 12.375, size: 73.125, windowProperties: { height: 42.25 } };
  room.objects!.push(extra);
  const rooms = [room];
  const before = structuredClone(rooms);
  function freeze(value: unknown): void {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
  }
  freeze(rooms);
  assert.notEqual(getPlanPreviewBounds(rooms), null);
  assert.deepEqual(rooms, before);
});
