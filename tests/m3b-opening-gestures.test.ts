import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pointerToWorld, findPhysicalWall, moveOpeningPreview, gestureMatchesDraft, type PointerView } from '../client/src/features/physical-draft/openingGeometry';
import { projectPhysicalRooms } from '../client/src/features/physical-draft/projection';
import { createDraft } from '../client/src/features/physical-draft/state';
import { createOpeningProposal, validateOpeningPlacement } from '../client/src/features/physical-draft/openingCommands';
import { q001, room, measured, freezeDeep } from './fixtures/physical';
import { createProposedRoomApplicability } from '../shared/domain/applicability';
import { unknownMeasurement } from '../shared/domain/measurements';
import { toMm } from '../shared/domain/units';
import { canonicalJson } from '../shared/quantities/canonicalJson';

const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
function display() {
  const doc = q001(); delete doc.rooms[0].presentation;
  return { doc, rooms: projectPhysicalRooms(doc).rooms };
}

test('M3B pointer transform accounts for current viewport borders, scroll, gutters and scale', () => {
  const view: PointerView = { bounds: { left: 100, top: 80, clientLeft: 2, clientTop: 3 }, scroll: { x: 260, y: 120 }, origin: { x: 300, y: 200 }, scale: 2 };
  assert.deepEqual(pointerToWorld({ x: 330, y: 242 }, view), { x: 94, y: 39.5 });
  // The inspector moved the viewport 50px, while the same physical point also moved.
  assert.deepEqual(pointerToWorld({ x: 380, y: 242 }, { ...view, bounds: { ...view.bounds, left: 150 } }), { x: 94, y: 39.5 });
  // Re-read all current camera values after zoom/pan; never reuse the initial press frame.
  assert.deepEqual(pointerToWorld({ x: 239, y: 182.75 }, { ...view, scale: .5, bounds: { ...view.bounds, left: 150 } }), { x: 94, y: 39.5 });
});

test('M3B pointer transform rejects invalid scale and nonfinite coordinates rather than placing a default', () => {
  const view = { bounds: { left: 0, top: 0 }, scroll: { x: 0, y: 0 }, origin: { x: 0, y: 0 }, scale: 1 };
  for (const scale of [0, -1, Infinity, NaN]) assert.equal(pointerToWorld({ x: 10, y: 20 }, { ...view, scale }), null);
  assert.equal(pointerToWorld({ x: Infinity, y: 20 }, view), null);
});

test('M3B noncentral wall placement converts bottom and left exactly once into clockwise center distance', () => {
  const { doc, rooms } = display();
  const cases = [
    [{ x: 50, y: 0 }, 'top', 2.5], [{ x: 240, y: 70 }, 'right', 3.5],
    [{ x: 40, y: 200 }, 'bottom', 10], [{ x: 0, y: 40 }, 'left', 8],
  ] as const;
  for (const [point, side, feet] of cases) {
    const target = findPhysicalWall(point, doc, rooms, 8)!;
    assert.ok(target); assert.equal(target.side, side); assert.equal(target.wallFaceId, 'room-1:' + side); near(target.offsetMm, toMm(feet, 'ft'));
  }
  assert.equal(findPhysicalWall({ x: 120, y: 100 }, doc, rooms, 8), null);
  assert.equal(findPhysicalWall({ x: -1, y: -100 }, doc, rooms, 8), null);
});

test('M3B zoom/pan/reflow transform followed by wall targeting retains fractional physical offset', () => {
  const { doc, rooms } = display(); const targetX = 52.8125;
  for (const scale of [.25, .75, 1, 2.5]) {
    const view = { bounds: { left: 177.25, top: 90.5 }, scroll: { x: 113.5, y: 77.25 }, origin: { x: 330, y: 231 }, scale };
    const client = { x: 177.25 + 330 + targetX * scale - 113.5, y: 90.5 + 231 - 77.25 };
    const target = findPhysicalWall(pointerToWorld(client, view)!, doc, rooms, 16 / scale)!;
    assert.equal(target.side, 'top'); near(target.offsetMm, targetX * 304.8 / 20);
  }
});

test('M3B cross-room target uses auto-layout only for hit location and writes no physical presentation', () => {
  const { doc } = display(); doc.rooms.push(room('room-2')); delete doc.rooms[1].presentation;
  const before = canonicalJson(doc), projection = projectPhysicalRooms(doc);
  const target = findPhysicalWall({ x: 540, y: 60 }, doc, projection.rooms, 8)!;
  assert.equal(target.roomId, 'room-2'); assert.equal(target.side, 'right'); near(target.offsetMm, 914.4);
  const proposal = moveOpeningPreview(doc.openings[0], target);
  assert.equal(proposal.id, doc.openings[0].id); assert.equal(proposal.attachments[0].wallFaceId, 'room-2:right');
  const unchanged = (opening: typeof proposal) => ({ ...opening, attachments: [] });
  assert.deepEqual(unchanged(proposal), unchanged(doc.openings[0]));
  assert.equal(canonicalJson(doc), before); assert.equal(doc.rooms[1].presentation, undefined);
});

test('M3B adjoining room wall hit prefers the room interior under the pointer without inferring a shared link', () => {
  const { doc } = display(); doc.rooms.push(room('room-2'));
  doc.rooms[1].presentation = { xMm: toMm(12, 'ft'), yMm: toMm(0, 'mm') };
  const target = findPhysicalWall({ x: 244, y: 60 }, doc, projectPhysicalRooms(doc).rooms, 8)!;
  assert.equal(target.roomId, 'room-2'); assert.equal(target.side, 'left'); near(target.offsetMm, toMm(7, 'ft'));
  assert.equal(moveOpeningPreview(doc.openings[0], target).attachments.length, 1);
});

test('M3B pointer corner positions are not clamped and demonstrated invalid width remains rejected', () => {
  const { doc, rooms } = display(); doc.openings = [];
  const target = findPhysicalWall({ x: 0, y: 0 }, doc, rooms, 8)!;
  assert.equal(target.offsetMm, 0);
  const draft = createDraft('preview-draft'); draft.document.rooms = doc.rooms;
  draft.document.calculationContract!.rooms = { 'room-1': createProposedRoomApplicability() };
  draft.fields = { 'room-1': { length: { text: '12 ft', unit: 'ft', dirty: false }, width: { text: '10 ft', unit: 'ft', dirty: false }, ceilingHeight: { text: '8 ft', unit: 'ft', dirty: false } } };
  const proposal = createOpeningProposal('candidate', 'window', target.wallFaceId, target.offsetMm, { widthMm: 812.8 });
  const before = canonicalJson(draft), validation = validateOpeningPlacement(draft, proposal);
  assert.equal(validation.status, 'invalid'); assert.equal(proposal.attachments[0].offsetMm, 0); assert.equal(canonicalJson(draft), before);
  const centered = { ...proposal, attachments: [{ ...proposal.attachments[0], offsetMm: toMm(6, 'ft') }] };
  assert.equal(validateOpeningPlacement(draft, centered).status, 'undetermined');
});

test('M3B move preview preserves unknown dimensions, provenance, appearance and original nested data', () => {
  const { doc, rooms } = display(); const opening = doc.openings[0];
  opening.height = unknownMeasurement('Height not measured'); opening.width = measured('32 3/8 in');
  opening.appearance = { style: 'bifold', swingDirection: 'outward', swingSide: 'left', metadata: { finish: ['oak'] } };
  const before = canonicalJson(opening), target = findPhysicalWall({ x: 0, y: 40 }, doc, rooms, 8)!;
  const preview = moveOpeningPreview(freezeDeep(opening), target);
  assert.deepEqual(preview.height, opening.height); assert.deepEqual(preview.width, opening.width); assert.deepEqual(preview.appearance, opening.appearance);
  (preview.appearance!.metadata.finish as string[]).push('changed preview');
  assert.equal(canonicalJson(opening), before);
});

test('M3B two-face shared opening cannot be detached by a pointer preview', () => {
  const { doc, rooms } = display(); doc.rooms.push(room('room-2'));
  doc.openings[0].attachments.push({ wallFaceId: 'room-2:top', anchor: 'center', offsetMm: toMm(3, 'ft') });
  const before = canonicalJson(doc.openings[0]), target = findPhysicalWall({ x: 50, y: 0 }, doc, rooms, 8)!;
  assert.throws(() => moveOpeningPreview(doc.openings[0], target), /both attachments/);
  assert.equal(canonicalJson(doc.openings[0]), before);
});

test('M3B opening gesture stamp rejects newer edits and draft switches even with identical room IDs', () => {
  const stamp = { draftId: 'one', revision: 5, pointerId: 9 };
  assert.equal(gestureMatchesDraft(stamp, { id: 'one', localEditRevision: 5 }), true);
  assert.equal(gestureMatchesDraft(stamp, { id: 'one', localEditRevision: 6 }), false);
  assert.equal(gestureMatchesDraft(stamp, { id: 'two', localEditRevision: 5 }), false);
});

test('M3B floor-level opening projects a measured wall gap without door or window fabrication', () => {
  const { doc } = display(); doc.openings = [{ ...doc.openings[0], kind: 'floor-level-opening', width: measured('32 in') }];
  const before = canonicalJson(doc), projection = projectPhysicalRooms(doc);
  assert.equal(projection.rooms[0].objects!.length, 0);
  const gap = projection.floorLevelOpenings['room-1'][0];
  assert.equal(gap.id, doc.openings[0].id); near(gap.size, 32 * 20 / 12); assert.equal(gap.wallSide, 'top');
  assert.equal(Object.hasOwn(gap, 'doorProperties'), false); assert.equal(canonicalJson(doc), before);
  doc.openings[0].width = unknownMeasurement('Gap not measured');
  assert.equal(projectPhysicalRooms(doc).floorLevelOpenings['room-1'], undefined);
  assert.ok(projectPhysicalRooms(doc).notices.some(value => /not a measured/.test(value)));
});
