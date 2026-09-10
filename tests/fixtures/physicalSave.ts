import { createDraft, addRoom, editField, commitField, type PhysicalDraft } from '../../client/src/features/physical-draft/state';
import { createLevelDraft, addLevel } from '../../client/src/features/physical-draft/levelCommands';
import { upgradeExistingDraftToStairs, createRoomLocalPlacement, addStair, setStairEndpoint, addLanding,
  addSurfaceOpening, editStairField, commitStairField, setSurfaceImpact } from '../../client/src/features/physical-draft/stairCommands';
import { upgradeExistingDraftToLayout, addZone, addCabinet, setCabinetZone, setRoomUse,
  editLayoutField, commitLayoutField } from '../../client/src/features/physical-draft/layoutCommands';
import { addOpening } from '../../client/src/features/physical-draft/openingCommands';
import { setOutputEnabled, selectAllCurrentTargets, editWaste, commitWaste } from '../../client/src/features/physical-draft/takeoffCommands';

export const PHYSICAL_SAVE_TEST_AT = '2026-09-10T05:00:00.000Z';
const ft = 304.8, at = PHYSICAL_SAVE_TEST_AT;
export function measuredSaveRoom(draft: PhysicalDraft, roomId: string, length = '12 ft', width = '10 ft', height = '8 ft'): PhysicalDraft {
  let next = addRoom(draft, roomId, roomId);
  for (const [field, text] of [['length', length], ['width', width], ['ceilingHeight', height]] as const)
    next = commitField(editField(next, roomId, field, text), roomId, field, at);
  return next;
}
export function selectedSaveWork(draft: PhysicalDraft): PhysicalDraft {
  for (const output of ['floor-area', 'ceiling-area', 'gross-wall-area'] as const)
    draft = selectAllCurrentTargets(setOutputEnabled(draft, output, true), output);
  return draft;
}
export function basicPhysicalSaveDraft(): PhysicalDraft {
  return selectedSaveWork(measuredSaveRoom(createDraft('local-source', 'Save test'), 'room'));
}
/** Supported commands only; intentionally unconfirmed evidence is preserved. */
export function richPhysicalSaveDraft(): PhysicalDraft {
  let draft = measuredSaveRoom(createLevelDraft('level-source', 'lower-level', 'Two-level save'), 'lower-room');
  draft = addLevel(draft, 'upper-level', 'Upper');
  draft = measuredSaveRoom(draft, 'upper-room', '15 ft');
  draft = upgradeExistingDraftToStairs(draft, 'stairs-source', at);
  draft = addStair(draft, 'stair', 'Straight stair', { state: 'modeled', levelId: 'lower-level',
    roomId: 'lower-room', placement: createRoomLocalPlacement(ft, ft) }, at);
  draft = setStairEndpoint(draft, 'stair', 'upper', { state: 'modeled', levelId: 'upper-level',
    roomId: 'upper-room', placement: createRoomLocalPlacement(ft, ft) }, at);
  draft = addLanding(draft, 'stair', 'lower', 'lower-landing', at);
  draft = addLanding(draft, 'stair', 'upper', 'upper-landing', at);
  draft = addSurfaceOpening(draft, 'hole', 'Explicit floor hole', { roomId: 'upper-room', surface: 'floor',
    placement: createRoomLocalPlacement(ft, ft) }, 'stair', at);
  for (const [field, text] of [['width', '3 ft'], ['length', '6 ft']] as const) {
    const target = { kind: 'surface-opening', id: 'hole', field } as const;
    draft = commitStairField(editStairField(draft, target, text), target, at);
  }
  for (const role of ['lower', 'upper'] as const) for (const surface of ['floor', 'ceiling'] as const)
    draft = setSurfaceImpact(draft, 'stair', role, surface, role === 'upper' && surface === 'floor'
      ? { state: 'deduct', openingIds: ['hole'] }
      : { state: 'no-deduction' }, at);
  draft = upgradeExistingDraftToLayout(draft, 'layout-source', at);
  draft = setRoomUse(draft, 'upper-room', { value: 'kitchen', customLabel: null, source: 'manual' }, at);
  draft = addZone(draft, 'zone', 'upper-room', 'Kitchen zone', at, createRoomLocalPlacement(ft, ft));
  for (const [field, text] of [['width', '6 ft'], ['length', '4 ft']] as const) {
    const target = { kind: 'zone', id: 'zone', field } as const;
    draft = commitLayoutField(editLayoutField(draft, target, text), target, at);
  }
  draft = addCabinet(draft, 'cabinet', 'upper-room', 'Fixed island', at, createRoomLocalPlacement(ft, ft));
  for (const [field, text] of [['length', '4 ft'], ['depth', '2 ft'], ['height', '3 ft']] as const) {
    const target = { kind: 'cabinet', id: 'cabinet', field } as const;
    draft = commitLayoutField(editLayoutField(draft, target, text), target, at);
  }
  draft = setCabinetZone(draft, 'cabinet', 'zone', at);
  draft = addOpening(draft, 'door', 'door', 'lower-room:top', 3 * ft, at, { widthMm: 3 * ft,
    appearance: { style: 'bifold', swingDirection: 'outward', swingSide: 'right', metadata: { historicalStyle: 'retained' } } });
  draft = addOpening(draft, 'window', 'window', 'upper-room:top', 8 * ft, at, { widthMm: 3 * ft });
  draft = selectedSaveWork(draft);
  return commitWaste(editWaste(draft, 'floor-area', '10'), 'floor-area');
}
