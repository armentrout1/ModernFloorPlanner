import { commitRoomNameInput, revertRoomNameInput, commitBuildingNameInput, revertBuildingNameInput, commitRoomLevelInput, revertRoomLevelInput } from './pendingInputs';
import { commitField, ROOM_FIELDS, type PhysicalDraft } from './state';
import { commitOpeningField, OPENING_FIELDS } from './openingCommands';
import { captureFieldRevert, revertField } from './fieldRevert';
import { commitWaste, TAKEOFF_OUTPUTS } from './takeoffCommands';
import { commitStairField, revertStairField } from './stairCommands';
import { commitLayoutField, revertLayoutField, commitLayoutText, revertLayoutText } from './layoutCommands';
import { editLevelName, renameLevel } from './levelCommands';

export interface PendingSaveField {
  key: string; label: string; text: string;
  apply(draft: PhysicalDraft, at: string): PhysicalDraft;
  revert(draft: PhysicalDraft): PhysicalDraft;
}
const label = (field: string) => ({ ceilingHeight: 'ceiling height', sillHeight: 'sill height', totalRise: 'total rise', customLabel: 'custom use' }[field] ?? field);
/** Read every draft-owned raw field, including fields on hidden rooms/levels. */
export function pendingSaveFields(draft: PhysicalDraft): PendingSaveField[] {
  const pending: PendingSaveField[] = [];
  for (const [id, raw] of Object.entries(draft.pendingInputs?.roomNames ?? {})) if (raw.dirty) pending.push({
    key: `room-name:${id}`, label: `${draft.document.rooms.find(room => room.id === id)?.name || 'Room'}: room name`, text: raw.text,
    apply: current => commitRoomNameInput(current, id), revert: current => revertRoomNameInput(current, id) });
  for (const [key, raw] of Object.entries(draft.pendingInputs?.buildingNames ?? {})) if (raw.dirty) pending.push({
    key: `building-name:${key}`, label: `${raw.kind} ${raw.id.slice(0, 8)}: name`, text: raw.text,
    apply: current => commitBuildingNameInput(current, raw.kind, raw.id), revert: current => revertBuildingNameInput(current, raw.kind, raw.id) });
  for (const [id, value] of Object.entries(draft.pendingInputs?.roomLevels ?? {})) pending.push({
    key: `room-level:${id}`, label: `${draft.document.rooms.find(room => room.id === id)?.name || 'Room'}: room level assignment`,
    text: draft.document.schemaVersion !== 2 ? draft.document.buildingLevels.levels.find(level => level.id === value.to)?.name || value.to : value.to,
    apply: current => commitRoomLevelInput(current, id), revert: current => revertRoomLevelInput(current, id) });
  for (const room of draft.document.rooms) for (const field of ROOM_FIELDS) {
    const raw = draft.fields[room.id]?.[field];
    if (raw?.dirty) pending.push({ key: `room:${room.id}:${field}`, label: `${room.name || 'Room'}: ${label(field)}`, text: raw.text,
      apply: (current, at) => commitField(current, room.id, field, at),
      revert: current => revertField(current, captureFieldRevert(current, { kind: 'room', id: room.id, field })) });
  }
  for (const opening of draft.document.openings) for (const field of OPENING_FIELDS) {
    const raw = draft.openingFields?.[opening.id]?.[field];
    if (raw?.dirty) pending.push({ key: `opening:${opening.id}:${field}`, label: `${opening.kind} ${opening.id.slice(0, 8)}: ${label(field)}`, text: raw.text,
      apply: (current, at) => commitOpeningField(current, opening.id, field, at),
      revert: current => revertField(current, captureFieldRevert(current, { kind: 'opening', id: opening.id, field })) });
  }
  for (const [id, text] of Object.entries(draft.levelView?.pendingNames ?? {})) {
    const level = draft.document.schemaVersion !== 2 ? draft.document.buildingLevels.levels.find(item => item.id === id) : null;
    if (level && text !== level.name) pending.push({ key: `level:${id}`, label: `${level.name}: level name`, text,
      apply: current => renameLevel(current, id, current.levelView!.pendingNames![id]),
      revert: current => editLevelName(current, id, current.document.schemaVersion !== 2 ? current.document.buildingLevels.levels.find(item => item.id === id)!.name : '') });
  }
  for (const [key, entry] of Object.entries(draft.stairFields ?? {})) if (entry.raw.dirty) {
    const target = entry.target;
    pending.push({ key: `stair:${key}`, label: `${target.kind} ${target.id.slice(0, 8)}${'role' in target ? ' ' + target.role : ''}: ${label(target.field)}`, text: entry.raw.text,
      apply: (current, at) => commitStairField(current, target, at), revert: current => revertStairField(current, target) });
  }
  for (const [key, entry] of Object.entries(draft.layoutFields ?? {})) if (entry.raw.dirty) pending.push({
    key: `layout:${key}`, label: `${entry.target.kind} ${entry.target.id.slice(0, 8)}: ${label(entry.target.field)}`, text: entry.raw.text,
    apply: (current, at) => commitLayoutField(current, entry.target, at), revert: current => revertLayoutField(current, entry.target) });
  for (const [key, entry] of Object.entries(draft.layoutTexts ?? {})) if (entry.dirty) pending.push({
    key: `layout-text:${key}`, label: `${entry.target.kind} ${entry.target.id.slice(0, 8)}: ${label(entry.target.field)}`, text: entry.text,
    apply: (current, at) => commitLayoutText(current, entry.target, at), revert: current => revertLayoutText(current, entry.target) });
  for (const output of TAKEOFF_OUTPUTS) {
    const raw = draft.takeoffState?.wasteFields[output];
    if (raw?.dirty) pending.push({ key: `waste:${output}`, label: `${output}: waste`, text: raw.text,
      apply: current => commitWaste(current, output), revert: current => revertField(current, captureFieldRevert(current, { kind: 'waste', output })) });
  }
  return pending;
}
