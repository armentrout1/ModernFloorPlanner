import { copyDraftForEdit, renameRoom, PhysicalDraftError, type PhysicalDraft } from './state';
import { assignRoomLevel, roomLevelId } from './levelCommands';
import { renameStair, renameSurfaceOpening } from './stairCommands';
const fail = (message: string): never => { throw new PhysicalDraftError('PENDING_INPUT_INVALID', message); };
function pending(draft: PhysicalDraft) {
  return draft.pendingInputs ??= { version: 'physical-pending-input-v1', roomNames: {}, buildingNames: {}, roomLevels: {} };
}
function tidy(draft: PhysicalDraft) {
  const value = draft.pendingInputs;
  if (value && !Object.keys(value.roomNames).length && !Object.keys(value.buildingNames).length && !Object.keys(value.roomLevels).length) delete draft.pendingInputs;
}
function roomName(draft: PhysicalDraft, id: string) {
  const room = draft.document.rooms.find(item => item.id === id); if (!room) return fail('The selected room is no longer present.');
  return room.name ?? '';
}
export function getRoomNameInput(draft: PhysicalDraft, id: string) {
  const name = roomName(draft, id);
  return draft.pendingInputs?.roomNames[id] ?? { text: name, dirty: false };
}
export function editRoomNameInput(draft: PhysicalDraft, id: string, text: string): PhysicalDraft {
  if (typeof text !== 'string') return fail('Enter a room name as text.');
  const committed = roomName(draft, id), before = getRoomNameInput(draft, id);
  if (before.text === text) return draft;
  const next = copyDraftForEdit(draft), values = pending(next);
  values.roomNames = Object.fromEntries([...Object.entries(values.roomNames).filter(([key]) => key !== id), ...(text === committed ? [] : [[id, { text, dirty: true }]])]);
  tidy(next); return next;
}
export function commitRoomNameInput(draft: PhysicalDraft, id: string): PhysicalDraft {
  const input = getRoomNameInput(draft, id); if (!input.dirty) return draft;
  const changed = renameRoom(draft, id, input.text), next = changed === draft ? copyDraftForEdit(draft) : changed;
  delete next.pendingInputs!.roomNames[id]; tidy(next); return next;
}
export function revertRoomNameInput(draft: PhysicalDraft, id: string): PhysicalDraft {
  if (!getRoomNameInput(draft, id).dirty) return draft;
  const next = copyDraftForEdit(draft); delete next.pendingInputs!.roomNames[id]; tidy(next); return next;
}
type BuildingNameKind = 'stair' | 'surface-opening';
function buildingName(draft: PhysicalDraft, kind: BuildingNameKind, id: string) {
  if (draft.document.schemaVersion !== 4 && draft.document.schemaVersion !== 5) return fail('Building names require the current stair editor.');
  const item = (kind === 'stair' ? draft.document.stairsContract.stairs : draft.document.stairsContract.surfaceOpenings).find(item => item.id === id);
  if (!item) return fail('The selected building object is no longer present.'); return item.name;
}
export const buildingNameKey = (kind: BuildingNameKind, id: string) => JSON.stringify([kind, id]);
export function getBuildingNameInput(draft: PhysicalDraft, kind: BuildingNameKind, id: string) {
  const text = buildingName(draft, kind, id);
  return draft.pendingInputs?.buildingNames[buildingNameKey(kind, id)] ?? { kind, id, text, dirty: false };
}
export function editBuildingNameInput(draft: PhysicalDraft, kind: BuildingNameKind, id: string, text: string): PhysicalDraft {
  if (typeof text !== 'string') return fail('Enter an object name as text.');
  if (getBuildingNameInput(draft, kind, id).text === text) return draft;
  const next = copyDraftForEdit(draft), value = pending(next), key = buildingNameKey(kind, id);
  value.buildingNames = Object.fromEntries([...Object.entries(value.buildingNames).filter(([old]) => old !== key), ...(text === buildingName(draft, kind, id) ? [] : [[key, { kind, id, text, dirty: true }]])]);
  tidy(next); return next;
}
export function commitBuildingNameInput(draft: PhysicalDraft, kind: BuildingNameKind, id: string): PhysicalDraft {
  const input = getBuildingNameInput(draft, kind, id); if (!input.dirty) return draft;
  const changed = kind === 'stair' ? renameStair(draft, id, input.text) : renameSurfaceOpening(draft, id, input.text);
  const next = changed === draft ? copyDraftForEdit(draft) : changed; delete next.pendingInputs!.buildingNames[buildingNameKey(kind, id)]; tidy(next); return next;
}
export function revertBuildingNameInput(draft: PhysicalDraft, kind: BuildingNameKind, id: string): PhysicalDraft {
  if (!getBuildingNameInput(draft, kind, id).dirty) return draft;
  const next = copyDraftForEdit(draft); delete next.pendingInputs!.buildingNames[buildingNameKey(kind, id)]; tidy(next); return next;
}
export function editRoomLevelInput(draft: PhysicalDraft, id: string, to: string): PhysicalDraft {
  const from = roomLevelId(draft, id);
  if (!from || draft.document.schemaVersion === 2 || !draft.document.buildingLevels.levels.some(level => level.id === to)) return fail('Choose an existing room and level.');
  if ((draft.pendingInputs?.roomLevels[id]?.to ?? from) === to) return draft;
  const next = copyDraftForEdit(draft), value = pending(next);
  value.roomLevels = Object.fromEntries([...Object.entries(value.roomLevels).filter(([key]) => key !== id), ...(from === to ? [] : [[id, { from, to }]])]);
  tidy(next); return next;
}
export function commitRoomLevelInput(draft: PhysicalDraft, id: string): PhysicalDraft {
  const input = draft.pendingInputs?.roomLevels[id]; if (!input) return draft;
  if (roomLevelId(draft, id) !== input.from) return fail('Room ownership changed. Revert this pending assignment before choosing another.');
  const changed = assignRoomLevel(draft, id, input.to), next = changed === draft ? copyDraftForEdit(draft) : changed;
  delete next.pendingInputs!.roomLevels[id]; tidy(next); return next;
}
export function revertRoomLevelInput(draft: PhysicalDraft, id: string): PhysicalDraft {
  if (!draft.pendingInputs?.roomLevels[id]) return draft;
  const next = copyDraftForEdit(draft); delete next.pendingInputs!.roomLevels[id]; tidy(next); return next;
}
export function validatePendingInputs(draft: PhysicalDraft): string | null {
  const value = draft.pendingInputs; if (!value) return null;
  try {
    for (const [id, raw] of Object.entries(value.roomNames)) if (!raw.dirty && raw.text !== roomName(draft, id)) return 'Stored room-name text disagrees with its committed value.'; else roomName(draft, id);
    for (const [key, raw] of Object.entries(value.buildingNames)) {
      if (key !== buildingNameKey(raw.kind, raw.id) || (!raw.dirty && raw.text !== buildingName(draft, raw.kind, raw.id))) return 'Stored object-name text has an invalid target or committed value.';
      buildingName(draft, raw.kind, raw.id);
    }
    for (const [id, target] of Object.entries(value.roomLevels)) if (draft.document.schemaVersion === 2 || target.from !== roomLevelId(draft, id) || !draft.document.buildingLevels.levels.some(level => level.id === target.to) || target.to === target.from) return 'Stored pending room assignment must retain existing source and destination levels.';
  } catch (error) { return error instanceof Error ? error.message : 'Stored pending input has an invalid target.'; }
  return null;
}
