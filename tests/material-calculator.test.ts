import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateDoorWidthFeet, calculateMaterials } from '../client/src/utils/materialCalculator';
import type { Room, RoomObject } from '../client/src/utils/types';

const room = (objects?: RoomObject[], overrides: Partial<Room> = {}): Room => ({
  id: 'room-1', x: 0, y: 0, width: 200, height: 240, objects, ...overrides,
});

const door = (widthInches: number, id = 'door-1'): RoomObject => ({
  id, type: 'door', wallSide: 'top', position: 50,
  // Historical sketches can have this stale pixel size alongside an entered width.
  size: 40,
  doorProperties: {
    width: widthInches, height: 80, style: 'single',
    swingDirection: 'inward', swingSide: 'right',
  },
});

const window = (id = 'window-1'): RoomObject => ({
  id, type: 'window', wallSide: 'bottom', position: 50, size: 30,
});

function assertTrim(objects: RoomObject[] | undefined, expected: number) {
  const result = calculateMaterials([room(objects)]);
  assert.equal(result.baseboardFeet, expected);
  assert.equal(result.baseShoeboardFeet, expected);
  assert.equal(result.totalWallLengthFeet, 44);
  assert.equal(result.totalArea, 120);
  return result;
}

// These assertions are independently calculated physical examples for the legacy
// 20-pixels-per-foot document format; no saved sketches are migrated.
test('10 by 12 feet contributes its 44-foot perimeter once with no openings', () => {
  assertTrim(undefined, 44);
  assertTrim([], 44);
});

test('one 3-foot door deducts from both baseboard and base shoe', () => {
  const result = assertTrim([door(36)], 41);
  assert.equal(result.doorCount, 1);
  assert.deepEqual(result.doorSizes, [{ width: 3, count: 1 }]);
});

test('elevated windows never add another perimeter or deduct trim', () => {
  assertTrim([window(), window('window-2')], 44);
  const result = assertTrim([door(36), window(), window('window-2')], 41);
  assert.equal(result.windowCount, 2);
});

test('3-foot and 2.5-foot doors deduct exactly once for 38.5 feet of trim', () => {
  const result = assertTrim([door(36), door(30, 'door-2'), window()], 38.5);
  assert.deepEqual(result.doorSizes, [{ width: 2.5, count: 1 }, { width: 3, count: 1 }]);
});

test('32-inch entered widths retain their precision and their own size group', () => {
  const result = calculateMaterials([room([door(32), door(30, 'door-2'), door(32, 'door-3')])]);
  assert.equal(calculateDoorWidthFeet(door(32)), 32 / 12);
  assert.ok(Math.abs(result.baseboardFeet - (44 - (32 + 30 + 32) / 12)) < 1e-12);
  assert.equal(result.baseShoeboardFeet, result.baseboardFeet);
  assert.deepEqual(result.doorSizes, [{ width: 30 / 12, count: 1 }, { width: 32 / 12, count: 2 }]);
});

test('legacy doors without dimension properties retain their pixel-width conversion', () => {
  const legacy: RoomObject = { id: 'old-door', type: 'door', wallSide: 'left', position: 50, size: 60 };
  const snapshot = structuredClone(legacy);
  const result = assertTrim([legacy], 41);
  assert.deepEqual(result.widthWarnings, []);
  assert.deepEqual(legacy, snapshot);
});

test('invalid historical dimension properties fall back to a valid legacy pixel size', () => {
  for (const width of [0, -10, Number.NaN, Number.POSITIVE_INFINITY]) {
    const legacy = { ...door(width), size: 60 };
    assert.equal(calculateDoorWidthFeet(legacy), 3);
  }
});

test('fractional entered inches are not rounded for deductions or grouping', () => {
  const result = calculateMaterials([room([door(32.5)])]);
  assert.equal(result.baseboardFeet, 44 - 32.5 / 12);
  assert.deepEqual(result.doorSizes, [{ width: 32.5 / 12, count: 1 }]);
});

test('all supported door styles use the entered opening width', () => {
  for (const style of ['single', 'double', 'sliding', 'bifold'] as const) {
    const opening = door(36);
    opening.doorProperties!.style = style;
    assertTrim([opening], 41);
  }
});

test('conflicting legacy widths produce a review warning without rewriting data', () => {
  const saved = room([door(36)], { name: 'Kitchen' });
  const original = structuredClone(saved);
  const result = calculateMaterials([saved]);
  assert.deepEqual(result.widthWarnings, [{
    roomId: 'room-1', roomName: 'Kitchen', doorId: 'door-1', wallSide: 'top',
    enteredWidthInches: 36, sketchWidthInches: 24,
  }]);
  assert.deepEqual(saved, original);
});

test('consistent widths and conversion precision do not produce false review warnings', () => {
  const opening = { ...door(32), size: (32 / 12) * 20 };
  assert.deepEqual(calculateMaterials([room([opening])]).widthWarnings, []);
});

test('multiple rooms contribute independently and calculations never mutate sketches', () => {
  const rooms = [room([door(36), window()]), room([door(30)], { id: 'room-2', x: 800, y: 500 })];
  const original = structuredClone(rooms);
  const result = calculateMaterials(rooms);
  assert.equal(result.baseboardFeet, 82.5);
  assert.equal(result.baseShoeboardFeet, 82.5);
  assert.equal(result.totalWallLengthFeet, 88);
  assert.equal(result.totalArea, 240);
  assert.equal(result.doorCount, 2);
  assert.equal(result.windowCount, 1);
  assert.deepEqual(rooms, original);
});

test('an empty sketch has no material quantities', () => {
  assert.deepEqual(calculateMaterials([]), {
    widthWarnings: [], baseboardFeet: 0, baseShoeboardFeet: 0, totalWallLengthFeet: 0,
    totalArea: 0, doorCount: 0, windowCount: 0, doorSizes: [],
  });
});
