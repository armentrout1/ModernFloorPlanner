import { stairRoomDependencies } from './stairCommands';
import { createBuildingLevel, createBuildingLevels } from '@shared/domain/levels';
import { upgradePhysicalDocumentToLevels } from '@shared/compatibility/levels';
import { assertSupportedPhysicalDocument } from '@shared/compatibility/physicalDraft';
import { QUANTITY_POLICY_VERSION_V3 } from '@shared/quantities/policy';
import { copyJson } from '@shared/quantities/canonicalJson';
import { createDraft, copyDraftForEdit, PhysicalDraftError, type PhysicalDraft } from './state';

const copy = <T,>(value: T): T => copyJson(value) as unknown as T;
function fail(code: string, message: string): never { throw new PhysicalDraftError(code, message); }
function validId(id: string): boolean { return typeof id === 'string' && !!id.trim() && !/[\u0000-\u001f\u007f]/.test(id); }
function nameValue(name: string): string {
  if (typeof name !== 'string' || !name.trim() || /[\u0000-\u001f\u007f]/.test(name)) fail('INVALID_LEVEL_NAME', 'Enter a nonblank level name.');
  return name.trim();
}
function levels(draft: PhysicalDraft) {
  if (draft.document.schemaVersion === 2) fail('LEVEL_UPGRADE_REQUIRED', 'Create an explicit building-level copy before editing levels.');
  return draft.document.buildingLevels;
}
function requireLevel(draft: PhysicalDraft, id: string) {
  const found = levels(draft).levels.find(level => level.id === id);
  if (!found) fail('LEVEL_NOT_FOUND', 'That level is no longer in this draft.');
  return found;
}
export function activeLevelId(draft: PhysicalDraft): string | null {
  return draft.document.schemaVersion !== 2 ? draft.levelView?.activeLevelId ?? null : null;
}
export function roomLevelId(draft: PhysicalDraft, roomId: string): string | null {
  return draft.document.schemaVersion !== 2 && Object.hasOwn(draft.document.buildingLevels.roomLevels, roomId)
    ? draft.document.buildingLevels.roomLevels[roomId] : null;
}
export function roomsOnLevel(draft: PhysicalDraft, levelId: string) {
  requireLevel(draft, levelId);
  return draft.document.rooms.filter(room => roomLevelId(draft, room.id) === levelId);
}
export function createLevelDraft(id: string, initialLevelId: string, name = 'Building draft'): PhysicalDraft {
  if (!validId(initialLevelId)) fail('INVALID_LEVEL_ID', 'A level needs a distinct nonblank ID.');
  const draft = createDraft(id, name);
  draft.document = { ...draft.document, schemaVersion: 3, quantityPolicyVersion: QUANTITY_POLICY_VERSION_V3,
    buildingLevels: createBuildingLevels([], initialLevelId), calculationContract: draft.document.calculationContract!, editorContract: draft.document.editorContract! };
  draft.request.policy.version = QUANTITY_POLICY_VERSION_V3;
  draft.source.operation = 'new-physical-level-draft-v1';
  draft.levelView = { version: 'physical-level-view-v1', activeLevelId: initialLevelId };
  assertSupportedPhysicalDocument(draft.document);
  return draft;
}
/** Detached copy of the live editor state, never a reinterpretation of its older source.original. */
export function upgradeExistingDraftToLevels(draft: PhysicalDraft, newId: string, unassignedLevelId: string, at: string): PhysicalDraft {
  if (!validId(newId) || newId === draft.id || !validId(unassignedLevelId)) fail('INVALID_UPGRADE_ID', 'The building-level copy needs new draft and level identities.');
  if (draft.document.schemaVersion !== 2) fail('LEVEL_UPGRADE_REQUIRED', 'This draft already uses the building-level contract.');
  if (!Number.isFinite(Date.parse(at)) || !at.includes('T')) fail('INVALID_UPGRADE_TIME', 'A valid upgrade timestamp is required.');
  const next = copy(draft);
  next.id = newId;
  next.localEditRevision = 0;
  next.document = upgradePhysicalDocumentToLevels(draft.document, unassignedLevelId);
  next.request.policy.version = QUANTITY_POLICY_VERSION_V3;
  if (next.openingDeleteUndo) {
    next.openingDeleteUndo.requestBefore.policy.version = QUANTITY_POLICY_VERSION_V3;
    next.openingDeleteUndo.requestAfter.policy.version = QUANTITY_POLICY_VERSION_V3;
  }
  next.levelView = { version: 'physical-level-view-v1', activeLevelId: unassignedLevelId };
  next.levelUpgradeLineage = { version: 'physical-level-upgrade-v1', sourceDraftId: draft.id,
    sourceRevision: draft.localEditRevision, at, originalDraft: copy(draft) };
  assertSupportedPhysicalDocument(next.document);
  return next;
}
export function selectLevel(draft: PhysicalDraft, levelId: string): PhysicalDraft {
  requireLevel(draft, levelId);
  if (activeLevelId(draft) === levelId) return draft;
  const next = copyDraftForEdit(draft);
  next.levelView = { ...next.levelView, version: 'physical-level-view-v1', activeLevelId: levelId };
  return next;
}
export function addLevel(draft: PhysicalDraft, id: string, name: string): PhysicalDraft {
  const current = levels(draft);
  if (!validId(id) || current.levels.some(level => level.id === id)) fail('INVALID_LEVEL_ID', 'A level needs a new distinct nonblank ID.');
  const next = copyDraftForEdit(draft), contract = levels(next);
  const order = current.levels.length ? Math.max(...current.levels.map(level => level.displayOrder)) + 1 : 0;
  if (!Number.isSafeInteger(order)) fail('INVALID_LEVEL_ORDER', 'The level display order cannot be advanced safely.');
  contract.levels.push(createBuildingLevel(id, nameValue(name), order));
  next.levelView = { ...next.levelView, version: 'physical-level-view-v1', activeLevelId: id };
  assertSupportedPhysicalDocument(next.document);
  return next;
}
export function editLevelName(draft: PhysicalDraft, id: string, text: string): PhysicalDraft {
  const current = requireLevel(draft, id);
  if (typeof text !== 'string') fail('INVALID_LEVEL_NAME', 'Enter a level name as text.');
  const pending = draft.levelView?.pendingNames;
  const hasPending = !!pending && Object.hasOwn(pending, id);
  const shown = hasPending ? pending![id] : current.name;
  if (shown === text && !(hasPending && text === current.name)) return draft;
  const next = copyDraftForEdit(draft);
  const remaining = Object.entries(next.levelView!.pendingNames ?? {}).filter(([key]) => key !== id);
  if (text !== current.name) remaining.push([id, text]);
  if (remaining.length) next.levelView!.pendingNames = Object.fromEntries(remaining);
  else delete next.levelView!.pendingNames;
  return next;
}
export function renameLevel(draft: PhysicalDraft, id: string, name: string): PhysicalDraft {
  const current = requireLevel(draft, id), value = nameValue(name);
  const pending = draft.levelView?.pendingNames;
  if (current.name === value && (!pending || !Object.hasOwn(pending, id))) return draft;
  const next = copyDraftForEdit(draft);
  requireLevel(next, id).name = value;
  if (next.levelView?.pendingNames) {
    const remaining = Object.entries(next.levelView.pendingNames).filter(([key]) => key !== id);
    if (remaining.length) next.levelView.pendingNames = Object.fromEntries(remaining);
    else delete next.levelView.pendingNames;
  }
  return next;
}
export function reorderLevels(draft: PhysicalDraft, orderedIds: string[]): PhysicalDraft {
  const current = levels(draft), existing = current.levels.map(level => level.id);
  if (orderedIds.length !== existing.length || new Set(orderedIds).size !== existing.length || orderedIds.some(id => !existing.includes(id))) fail('INVALID_LEVEL_ORDER', 'Level order must contain each current level exactly once.');
  const sorted = [...current.levels].sort((a, b) => a.displayOrder - b.displayOrder).map(level => level.id);
  if (sorted.every((id, index) => id === orderedIds[index])) return draft;
  const next = copyDraftForEdit(draft);
  for (const level of levels(next).levels) level.displayOrder = orderedIds.indexOf(level.id);
  return next;
}
/** Reassignment is deliberately a single-room action; related ownership is never expanded silently. */
export function assignRoomLevel(draft: PhysicalDraft, roomId: string, levelId: string, expectedActiveLevelId?: string): PhysicalDraft {
  requireLevel(draft, levelId);
  if (expectedActiveLevelId !== undefined && activeLevelId(draft) !== expectedActiveLevelId) fail('STALE_LEVEL_EDIT', 'The active level changed. Retry the assignment from the current level.');
  const room = draft.document.rooms.find(item => item.id === roomId);
  if (!room) fail('ROOM_NOT_FOUND', 'The selected room is no longer in this draft.');
  if (roomLevelId(draft, roomId) === levelId) return draft;
  assertRoomReassignment(draft, roomId);
  const next = copyDraftForEdit(draft);
  levels(next).roomLevels = Object.fromEntries([...Object.entries(levels(next).roomLevels).filter(([id]) => id !== roomId), [roomId, levelId]]);
  next.levelView = { ...next.levelView, version: 'physical-level-view-v1', activeLevelId: levelId };
  assertSupportedPhysicalDocument(next.document);
  return next;
}
export function assertRoomReassignment(draft: PhysicalDraft, roomId: string): void {
  const room = draft.document.rooms.find(item => item.id === roomId);
  if (!room) fail('ROOM_NOT_FOUND', 'The selected room is no longer in this draft.');
  const dependencies = stairRoomDependencies(draft, roomId);
  if (dependencies.length) fail('STAIR_ROOM_DEPENDENCIES', 'Resolve these room dependencies before reassignment: ' + dependencies.join(', ') + '. No related ownership was moved.');
  const groups = draft.document.editorContract?.groups.filter(group => group.roomIds.includes(roomId) && group.roomIds.length > 1) ?? [];
  const walls = new Set(room.wallFaces.map(wall => wall.id));
  const shared = draft.document.openings.filter(opening => opening.attachments.length > 1 && opening.attachments.some(face => walls.has(face.wallFaceId)));
  if (groups.length || shared.length) {
    const related = new Set(groups.flatMap(group => group.roomIds).filter(id => id !== roomId));
    for (const opening of shared) for (const face of opening.attachments) {
      const owner = draft.document.rooms.find(item => item.wallFaces.some(wall => wall.id === face.wallFaceId));
      if (owner && owner.id !== roomId) related.add(owner.id);
    }
    const names = Array.from(related).map(id => draft.document.rooms.find(item => item.id === id)?.name || id);
    fail('RELATED_ROOM_LEVELS', `Cannot move this room alone: ${groups.length ? 'group membership' : ''}${groups.length && shared.length ? ' and ' : ''}${shared.length ? 'shared opening ' + shared.map(item => item.id).join(', ') : ''} also involves ${names.join(', ')}. Related-room reassignment is not supported in this slice.`);
  }
}
