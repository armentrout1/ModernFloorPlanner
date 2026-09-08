import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultDoorProperties, getDoorGeometry, getDoorHand, getStoredHinge } from '../client/src/utils/doorGeometry';
import type { DoorStyle, RoomObject, SwingDirection, SwingSide, WallSide } from '../client/src/utils/types';

const room = { width: 400, height: 320 };
function door(wallSide: WallSide = 'top', swingSide: SwingSide = 'right', swingDirection: SwingDirection = 'inward'): RoomObject {
  return { id: 'saved-door', type: 'door', wallSide, position: 25, size: 60,
    doorProperties: { style: 'single', swingSide, swingDirection, width: 36, height: 80 } };
}

test('door hand follows back-to-hinge facing-latch convention and encodes losslessly', () => {
  const cases: [SwingSide, SwingDirection, SwingSide][] = [
    ['left', 'inward', 'right'], ['right', 'inward', 'left'],
    ['left', 'outward', 'left'], ['right', 'outward', 'right'],
  ];
  for (const [stored, direction, hand] of cases) {
    assert.equal(getDoorHand(stored, direction), hand);
    assert.equal(getStoredHinge(hand, direction), stored);
    assert.equal(getStoredHinge(getDoorHand(stored, direction), direction), stored);
  }
});

test('reversing swing keeps the stored hinge while displayed hand changes', () => {
  for (const stored of ['left', 'right'] as const) {
    assert.notEqual(getDoorHand(stored, 'inward'), getDoorHand(stored, 'outward'));
    const inwardHand = getDoorHand(stored, 'inward');
    assert.equal(getStoredHinge(inwardHand === 'left' ? 'right' : 'left', 'inward'), stored === 'left' ? 'right' : 'left');
  }
});

const walls = {
  top: { bar: { x: 70, y: 0, width: 60, height: 8 }, origin: { x: 70, y: 4 }, transform: 'matrix(1 0 0 1 0 0)' },
  right: { bar: { x: 392, y: 50, width: 8, height: 60 }, origin: { x: 396, y: 50 }, transform: 'matrix(0 1 -1 0 0 0)' },
  bottom: { bar: { x: 70, y: 312, width: 60, height: 8 }, origin: { x: 130, y: 316 }, transform: 'matrix(-1 0 0 -1 0 0)' },
  left: { bar: { x: 0, y: 50, width: 8, height: 60 }, origin: { x: 4, y: 110 }, transform: 'matrix(0 -1 1 0 0 0)' },
};
for (const wall of Object.keys(walls) as WallSide[]) {
  test(`${wall} wall preserves saved opening bar, swing origin and rotation`, () => {
    const actual = getDoorGeometry(room, door(wall));
    assert.deepEqual(actual.bar, walls[wall].bar);
    assert.deepEqual(actual.origin, walls[wall].origin);
    assert.equal(actual.transform, walls[wall].transform);
    assert.equal(actual.size, 60);
    assert.equal(actual.swingSize, 60);
  });
}

const paths: [SwingSide, SwingDirection, string, string][] = [
  ['right', 'inward', 'M 60 0 L 60 60 M 0 0 A 60 60 0 0 0 60 60', 'M 60 0 L 0 0 A 60 60 0 0 0 60 60 Z'],
  ['right', 'outward', 'M 60 0 L 60 -60 M 0 0 A 60 60 0 0 1 60 -60', 'M 60 0 L 0 0 A 60 60 0 0 1 60 -60 Z'],
  ['left', 'inward', 'M 0 0 L 0 60 M 60 0 A 60 60 0 0 1 0 60', 'M 0 0 L 60 0 A 60 60 0 0 1 0 60 Z'],
  ['left', 'outward', 'M 0 0 L 0 -60 M 60 0 A 60 60 0 0 0 0 -60', 'M 0 0 L 60 0 A 60 60 0 0 0 0 -60 Z'],
];
for (const [side, direction, leafArcPath, sectorPath] of paths) {
  test(`stored ${side} / ${direction} keeps the leaf and closes only its actual quarter-circle sector`, () => {
    for (const wall of Object.keys(walls) as WallSide[]) {
      const geometry = getDoorGeometry(room, door(wall, side, direction));
      assert.equal(geometry.leafArcPath, leafArcPath);
      assert.equal(geometry.sectorPath, sectorPath);
    }
  });
}

function localToRoom(geometry: ReturnType<typeof getDoorGeometry>, x: number, y: number) {
  const [a, b, c, d] = geometry.transform.slice(7, -1).split(' ').map(Number);
  return { x: geometry.origin.x + a * x + c * y, y: geometry.origin.y + b * x + d * y };
}
const hingePoints = {
  top: { left: { x: 70, y: 4 }, right: { x: 130, y: 4 }, inward: { x: 0, y: 60 } },
  right: { left: { x: 396, y: 50 }, right: { x: 396, y: 110 }, inward: { x: -60, y: 0 } },
  bottom: { left: { x: 130, y: 316 }, right: { x: 70, y: 316 }, inward: { x: 0, y: -60 } },
  left: { left: { x: 4, y: 110 }, right: { x: 4, y: 50 }, inward: { x: 60, y: 0 } },
};
for (const wall of Object.keys(hingePoints) as WallSide[]) {
  test(`${wall} wall puts both hinges and open leaves on the correct physical sides`, () => {
    for (const side of ['left', 'right'] as const) {
      for (const direction of ['inward', 'outward'] as const) {
        const geometry = getDoorGeometry(room, door(wall, side, direction));
        const points = hingePoints[wall];
        const localHinge = side === 'left' ? 0 : 60;
        const sign = direction === 'inward' ? 1 : -1;
        assert.deepEqual(localToRoom(geometry, localHinge, 0), points[side]);
        assert.deepEqual(localToRoom(geometry, localHinge, sign * 60), {
          x: points[side].x + sign * points.inward.x,
          y: points[side].y + sign * points.inward.y,
        });
      }
    }
  });
}

test('legacy doors keep the historical 40-pixel bar and 60-pixel swing without adding metadata', () => {
  for (const wall of Object.keys(walls) as WallSide[]) {
    const legacy: RoomObject = { id: 'legacy', type: 'door', wallSide: wall, position: 25, size: 17 };
    const before = structuredClone(legacy);
    const geometry = getDoorGeometry(room, legacy);
    assert.equal(geometry.size, 40);
    assert.equal(geometry.swingSize, 60);
    assert.deepEqual(geometry.origin, walls[wall].origin);
    assert.equal(wall === 'top' || wall === 'bottom' ? geometry.bar.width : geometry.bar.height, 40);
    assert.deepEqual(geometry.doorProperties, { style: 'single', swingDirection: 'inward', swingSide: 'right', width: 36, height: 80 });
    assert.deepEqual(legacy, before);
    assert.equal(Object.hasOwn(legacy, 'doorProperties'), false);
  }
});

test('fractional explicit widths control geometry without normalizing saved size, position or metadata', () => {
  const saved = door('bottom', 'left', 'outward');
  saved.position = 37.125;
  saved.size = 17;
  saved.doorProperties!.width = 31.625;
  saved.doorProperties!.height = 83.25;
  const before = structuredClone(saved);
  Object.freeze(saved.doorProperties);
  Object.freeze(saved);
  const geometry = getDoorGeometry(room, saved);
  assert.equal(geometry.size, (31.625 * 20) / 12);
  assert.equal(geometry.swingSize, geometry.size);
  assert.equal(geometry.bar.x + geometry.bar.width / 2, 148.5);
  assert.deepEqual(saved, before);
  assert.deepEqual(geometry.doorProperties, before.doorProperties);
  assert.notEqual(geometry.doorProperties, saved.doorProperties);
});

test('all existing door styles retain the same stored geometry and style metadata', () => {
  const baseline = getDoorGeometry(room, door());
  for (const style of ['single', 'double', 'sliding', 'bifold'] as DoorStyle[]) {
    const saved = door();
    saved.doorProperties!.style = style;
    const geometry = getDoorGeometry(room, saved);
    assert.equal(geometry.doorProperties.style, style);
    assert.equal(geometry.leafArcPath, baseline.leafArcPath);
    assert.equal(geometry.sectorPath, baseline.sectorPath);
    assert.deepEqual(geometry.bar, baseline.bar);
  }
});

test('default door properties are fresh objects so previews cannot mutate later doors', () => {
  const first = createDefaultDoorProperties();
  first.width = 24;
  first.swingSide = 'left';
  assert.deepEqual(createDefaultDoorProperties(), { style: 'single', swingDirection: 'inward', swingSide: 'right', width: 36, height: 80 });
});
