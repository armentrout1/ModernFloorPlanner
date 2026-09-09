import { layoutHistoryParts, guardLayoutHistory, applyLayoutHistory } from './layoutHistory';
import { layoutRoomDependencies } from './layoutCommands';
import { stairHistoryParts, guardStairHistory, applyStairHistory } from './stairHistory';
import { stairRoomDependencies } from './stairCommands';
import { assertSupportedPhysicalDocument } from '@shared/compatibility/physicalDraft';
import { assertRoomReassignment, roomLevelId } from './levelCommands';
import type { PhysicalOpening, PhysicalRoom } from '@shared/domain/document';
import { validateGeometry, type QuantityOutput } from '@shared/domain/geometryValidation';
import type { AppDeclaration, ApplicabilityField } from '@shared/domain/applicability';
import type { Dimension } from '@shared/domain/measurements';
import type { QuantitySelection } from '@shared/quantities/policy';
import { copyDraftForEdit, committedFieldText, PhysicalDraftError, type PhysicalDraft, type FieldDraft } from './state';
import { getOpeningFields, openingFieldsFor, type OpeningFields } from './openingCommands';
import { getWasteField, restoreTakeoffRequest, takeoffScopeRevision } from './takeoffCommands';
import { recordApplicabilityDeclaration } from './reviewCommands';
import { copyHistory as copy, equalHistoryValue as equal, historyTargetKey as key, historyValueAt, restoredHistoryValue,
  type HistoryChange, type HistoryTarget, type HistoryEvent } from './historyEvidence';

export const HISTORY_LIMIT = 50 as const;
export interface HistoryUpdateOptions { nameSession?: string }
export interface HistoryEntry { id: string; eventId: string; label: string; changes: HistoryChange[]; scopeRevision: number; automaticScope: boolean; nameSession?: string }
export interface HistoryReveal { levelId: string; roomId?: string; openingId?: string; stairId?: string; surfaceOpeningId?: string; zoneId?: string; cabinetId?: string; endpointRole?: 'lower' | 'upper'; surface?: 'floor' | 'ceiling'; revision: number }
export interface DraftHistory { undo: HistoryEntry[]; redo: HistoryEntry[]; boundary: string | null; reveal?: HistoryReveal }
export interface HistorySummary { undoLabel: string | null; redoLabel: string | null; undoReason: string | null; redoReason: string | null; boundary: string | null; limit: 50; reveal?: HistoryReveal }
export const emptyHistory = (boundary: string | null = null): DraftHistory => ({ undo: [], redo: [], boundary });
function fail(message: string): never { throw new PhysicalDraftError('HISTORY_CONFLICT', message); }
const roomFields = ['length', 'width', 'ceilingHeight'] as const;
const openingMeasurements = ['width', 'height', 'sillHeight'] as const;
const applicabilityFields = ['ceiling', 'walls', 'crownPath'] as const;
const isScope = (target: HistoryTarget) => target.kind === 'takeoff-output' || target.kind === 'crown-gaps';
function bundleValue(draft: PhysicalDraft, target: HistoryTarget): unknown {
  const value = historyValueAt(draft, target);
  if (target.kind === 'opening' && value) return { ...(value as object), fields: getOpeningFields(draft, target.id) };
  return value;
}
function changesBetween(before: PhysicalDraft, after: PhysicalDraft): HistoryChange[] {
  const changes: HistoryChange[] = [];
  const add = (target: HistoryTarget) => {
    const old = bundleValue(before, target), next = bundleValue(after, target);
    if (!equal(old, next)) changes.push({ target, before: copy(old), after: copy(next), ...(target.kind === 'takeoff-output' ? { beforeIndex: old === null ? null : before.request.selections.findIndex(item => item.output === target.output), afterIndex: next === null ? null : after.request.selections.findIndex(item => item.output === target.output) } : {}) });
  };
  const ids = (a: { id: string }[], b: { id: string }[]) => Array.from(new Set([...a, ...b].map(item => item.id)));
  if (before.document.schemaVersion !== 2 && after.document.schemaVersion !== 2) {
    const old = before.document.buildingLevels.levels, next = after.document.buildingLevels.levels;
    for (const id of ids(old, next)) {
      if (!old.some(level => level.id === id) || !next.some(level => level.id === id)) add({ kind: 'level', id });
      else add({ kind: 'level-name', id });
    }
    if (old.length === next.length && old.every(level => next.some(item => item.id === level.id))) add({ kind: 'level-order' });
  }
  for (const id of ids(before.document.rooms, after.document.rooms)) {
    if (!before.document.rooms.some(room => room.id === id) || !after.document.rooms.some(room => room.id === id)) {
      add({ kind: 'room', id });
      if (before.document.schemaVersion !== 2 && after.document.schemaVersion !== 2) add({ kind: 'room-level', id });
      continue;
    }
    if (before.document.schemaVersion !== 2 && after.document.schemaVersion !== 2) add({ kind: 'room-level', id });
    add({ kind: 'room-name', id });
    roomFields.forEach(field => add({ kind: 'room-measurement', id, field }));
    applicabilityFields.forEach(field => add({ kind: 'applicability', id, field }));
  }
  for (const id of ids(before.document.openings, after.document.openings)) {
    if (!before.document.openings.some(opening => opening.id === id) || !after.document.openings.some(opening => opening.id === id)) { add({ kind: 'opening', id }); continue; }
    openingMeasurements.forEach(field => add({ kind: 'opening-measurement', id, field }));
    add({ kind: 'opening-position', id }); add({ kind: 'opening-basis', id }); add({ kind: 'opening-appearance', id });
  }
  if((before.document.schemaVersion === 4 || before.document.schemaVersion === 5)&&(after.document.schemaVersion === 4 || after.document.schemaVersion === 5))for(const object of ['stair','surface-opening'] as const){
    const old=object==='stair'?before.document.stairsContract.stairs:before.document.stairsContract.surfaceOpenings;
    const next=object==='stair'?after.document.stairsContract.stairs:after.document.stairsContract.surfaceOpenings;
    for(const id of ids(old,next)){if(!old.some(item=>item.id===id)||!next.some(item=>item.id===id))add({kind:'stair-object',object,id});
      else for(const part of stairHistoryParts(object))add({kind:'stair-part',object,id,part});}
  }
  if(before.document.schemaVersion===5&&after.document.schemaVersion===5){
    for(const id of ids(before.document.rooms,after.document.rooms))add({kind:'room-use',id});
    for(const object of ['zone','cabinet'] as const){
      const old=object==='zone'?before.document.layoutContract.zones:before.document.layoutContract.cabinetBlocks;
      const next=object==='zone'?after.document.layoutContract.zones:after.document.layoutContract.cabinetBlocks;
      for(const id of ids(old,next)){if(!old.some(item=>item.id===id)||!next.some(item=>item.id===id))add({kind:'layout-object',object,id});
        else for(const part of layoutHistoryParts(object))add({kind:'layout-part',object,id,part});}
    }
  }
  for (const output of Array.from(new Set([...before.request.selections, ...after.request.selections].map(item => item.output)))) add({ kind: 'takeoff-output', output });
  add({ kind: 'takeoff-basis' }); add({ kind: 'crown-gaps' });
  return changes;
}
const words = (text: string) => text.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/-/g, ' ').toLowerCase();
function labelFor(before: PhysicalDraft, after: PhysicalDraft, changes: HistoryChange[]): string {
  const target = changes[0].target;
  const openingKind = 'id' in target ? (after.document.openings.find(item => item.id === target.id) ?? before.document.openings.find(item => item.id === target.id))?.kind ?? 'opening' : 'opening';
  switch (target.kind) {
    case 'room-use': return 'room use change';
    case 'layout-object': return target.object+(changes[0].before===null?' creation':' deletion');
    case 'layout-part': return target.object+' '+words(target.part)+' change';
    case 'stair-object': return (target.object==='stair'?'stair':'surface opening')+(changes[0].before===null?' creation':' deletion');
    case 'stair-part': return (target.object==='stair'?'stair':'surface opening')+' '+words(target.part)+' change';
    case 'level': return changes[0].before === null ? 'level creation' : 'level deletion';
    case 'level-name': return 'level name change';
    case 'level-order': return 'level display order change';
    case 'room-level': return 'room level assignment';
    case 'room': return changes[0].before === null ? 'room creation' : 'room deletion';
    case 'room-name': return 'room name change';
    case 'room-measurement': return words(target.field) + ' change';
    case 'applicability': return words(target.field) + ' model change';
    case 'opening': return words(openingKind) + (changes[0].before === null ? ' creation' : ' deletion');
    case 'opening-measurement': return words(openingKind) + ' ' + words(target.field) + ' change';
    case 'opening-position': return words(openingKind) + ' move';
    case 'opening-basis': return words(openingKind) + ' measurement basis change';
    case 'opening-appearance': return words(openingKind) + ' appearance change';
    case 'takeoff-output': {
      const a = changes[0].before as QuantitySelection | null, b = changes[0].after as QuantitySelection | null;
      const suffix = !a || !b ? ' work selection change' : 'wasteFraction' in a && 'wasteFraction' in b && a.wasteFraction !== b.wasteFraction ? ' waste change' : ' targets change';
      return words(target.output).replace(/ area$/, '') + suffix;
    }
    case 'takeoff-basis': return 'takeoff measurement basis change';
    case 'crown-gaps': return 'crown gap selection change';
  }
}
function appendEvent(draft: PhysicalDraft, event: HistoryEvent): void {
  draft.historyEvidence = { version: draft.document.schemaVersion === 5 ? 'physical-history-evidence-v4' : draft.document.schemaVersion === 4 ? 'physical-history-evidence-v3' : draft.document.schemaVersion === 3 ? 'physical-history-evidence-v2' : 'physical-history-evidence-v1', events: [...(draft.historyEvidence?.events ?? []), copy(event)] };
}
function eventId(draft: PhysicalDraft): string { return `${draft.id}:history:${draft.localEditRevision}`; }
function actionTime(before: PhysicalDraft, after: PhysicalDraft): string {
  return after.layoutEvents?.slice(before.layoutEvents?.length??0).at(-1)?.at
    ?? after.stairEvents?.slice(before.stairEvents?.length??0).at(-1)?.at
    ?? after.events.slice(before.events.length).at(-1)?.event.at
    ?? after.openingEvents?.slice(before.openingEvents?.length ?? 0).at(-1)?.at
    ?? after.reviewState?.applicabilityEvents.slice(before.reviewState?.applicabilityEvents.length ?? 0).at(-1)?.at
    ?? new Date().toISOString();
}
export function recordHistoryCommit(before: PhysicalDraft, after: PhysicalDraft, history: DraftHistory,
  options: HistoryUpdateOptions = {}): { draft: PhysicalDraft; history: DraftHistory } {
  if (before === after) return { draft: after, history };
  const changes = changesBetween(before, after);
  const reviewed = after.events.slice(before.events.length).some(item => item.event.action === 'confirm' || item.event.action === 'resolve-candidate')
    || after.reviewState?.applicabilityEvents.slice(before.reviewState?.applicabilityEvents.length ?? 0).some(item => item.action === 'confirm');
  const targetedRestore = after.openingEvents?.slice(before.openingEvents?.length ?? 0).some(item => item.action === 'restore');
  const boundary = reviewed ? 'Explicit measurement or model review starts a new Undo/Redo history. Review approvals are not replayed.'
    : targetedRestore ? 'Undo opening delete restored its bounded recovery. General Undo/Redo history starts again here.' : null;
  if (!changes.length && !boundary) return { draft: after, history };
  const next = copy(after), id = eventId(next), at = actionTime(before, after);
  if (boundary) {
    appendEvent(next, { id, transactionId: id, action: 'boundary', at, label: boundary, changes });
    return { draft: next, history: emptyHistory(boundary) };
  }
  const baseLabel = labelFor(before, after, changes), targetLevel = revealFor(after, before, changes)?.levelId;
  const levelName = after.document.schemaVersion !== 2 ? after.document.buildingLevels.levels.find(level => level.id === targetLevel)?.name : null;
  const projectTakeoff = after.document.schemaVersion !== 2 && changes.every(change => ['takeoff-output', 'takeoff-basis', 'crown-gaps'].includes(change.target.kind));
  const label = projectTakeoff ? baseLabel + ' — project takeoff' : changes[0].target.kind === 'level-order' ? 'building level display order change' : levelName ? baseLabel + ' — ' + levelName : baseLabel, previous = history.undo.at(-1);
  const coalesce = options.nameSession && previous?.nameSession === options.nameSession && previous.changes.length === 1
    && changes.length === 1 && changes[0].target.kind === 'room-name' && key(previous.changes[0].target) === key(changes[0].target)
    && equal(previous.changes[0].after, changes[0].before) && next.historyEvidence?.events.at(-1)?.id === previous.eventId;
  if (coalesce && previous) {
    const merged = [{ ...copy(previous.changes[0]), after: copy(changes[0].after) }];
    const event = next.historyEvidence!.events.at(-1)!;
    Object.assign(event, { changes: merged, at });
    const entry = { ...previous, changes: merged, scopeRevision: takeoffScopeRevision(next) };
    const undo = history.undo.slice(0, -1);
    if (!equal(merged[0].before, merged[0].after)) undo.push(entry);
    return { draft: next, history: { undo, redo: [], boundary: history.boundary } };
  }
  appendEvent(next, { id, transactionId: id, action: 'commit', at, label, changes });
  const entry: HistoryEntry = { id, eventId: id, label, changes: copy(changes), scopeRevision: takeoffScopeRevision(next),
    automaticScope: changes.some(change => ['opening', 'opening-position'].includes(change.target.kind)) && changes.some(change => isScope(change.target)),
    ...(options.nameSession && changes.length === 1 && changes[0].target.kind === 'room-name' ? { nameSession: options.nameSession } : {}) };
  // A direct assignment moves the editing target into another view. Publish its
  // exact accepted target so that a remembered destination selection cannot hide it.
  const assignmentReveal = changes.length === 1 && changes[0].target.kind === 'room-level'
    && changes[0].before !== null && changes[0].after !== null ? revealFor(next, before, changes) : undefined;
  return { draft: next, history: { undo: [...history.undo, entry].slice(-HISTORY_LIMIT), redo: [], boundary: history.boundary,
    ...(assignmentReveal ? { reveal: assignmentReveal } : {}) } };
}
function requireClean(raw: FieldDraft | undefined, name: string): void {
  if (raw?.dirty) fail(`Apply or Revert the pending ${name} edit before Undo or Redo.`);
}
function comparable(target: HistoryTarget, value: any): unknown {
  if ((target.kind === 'opening' || target.kind === 'room' || target.kind === 'level' || target.kind === 'stair-object' || target.kind === 'layout-object') && value !== null && value !== undefined) {
    const { fields: _fields, texts: _texts, index: _index, ...semantic } = value; return semantic;
  }
  return value;
}
function guardTarget(draft: PhysicalDraft, change: HistoryChange): void {
  const { target } = change;
  const current = bundleValue(draft, target);
  if (!equal(comparable(target, current), comparable(target, change.after))) fail('The next history target changed or no longer exists. Its newer value has not been overwritten.');
  switch (target.kind) {
    case 'room-use': case 'layout-object': case 'layout-part': guardLayoutHistory(draft,target,restoredHistoryValue(target,change.before,change.after));break;
    case 'stair-object': case 'stair-part': guardStairHistory(draft,target,restoredHistoryValue(target,change.before,change.after));break;
    case 'level':
    case 'level-name':
      if (draft.levelView?.pendingNames && Object.hasOwn(draft.levelView.pendingNames, target.id)) fail('Apply the pending level name before Undo or Redo.');
      break;
    case 'room-measurement': requireClean(draft.fields[target.id]?.[target.field], words(target.field)); break;
    case 'opening-measurement': requireClean(getOpeningFields(draft, target.id)[target.field], words(target.field)); break;
    case 'opening-position': requireClean(getOpeningFields(draft, target.id).offset, 'opening position'); break;
    case 'room': if (current) Object.entries(draft.fields[target.id]).forEach(([field, raw]) => requireClean(raw, words(field))); break;
    case 'opening': if (current) Object.entries(getOpeningFields(draft, target.id)).forEach(([field, raw]) => requireClean(raw, words(field))); break;
    case 'takeoff-output': {
      const currentSelection = current as QuantitySelection | null, restored = change.before as QuantitySelection | null;
      if (currentSelection && 'wasteFraction' in currentSelection && (!restored || !('wasteFraction' in restored) || restored.wasteFraction !== currentSelection.wasteFraction)) {
        if (getWasteField(draft, target.output).dirty) fail(`Apply or Revert the pending ${words(target.output)} waste edit before Undo or Redo.`);
      }
      break;
    }
  }
}
function applyInverse(draft: PhysicalDraft, entry: HistoryEntry, at: string): { draft: PhysicalDraft; changes: HistoryChange[]; preservedLaterScope: boolean } {
  const preservedLaterScope = entry.automaticScope && entry.scopeRevision !== takeoffScopeRevision(draft);
  const effective = entry.changes.filter(change => !(preservedLaterScope && isScope(change.target)));
  effective.forEach(change => guardTarget(draft, change));
  const next = copyDraftForEdit(draft), openingChecks = new Set<string>();
  const request = copy(next.request);
  for (const change of effective) {
    const { target } = change, restored = restoredHistoryValue(target, change.before, change.after) as any;
    const room = 'id' in target ? next.document.rooms.find(item => item.id === target.id) : undefined;
    const opening = 'id' in target ? next.document.openings.find(item => item.id === target.id) : undefined;
    switch (target.kind) {
      case 'room-use': case 'layout-object': case 'layout-part': applyLayoutHistory(next,target,restored);break;
      case 'stair-object': case 'stair-part': applyStairHistory(next,target,restored);break;
      case 'level': {
        if (next.document.schemaVersion === 2) fail('This history requires the building-level contract.');
        const contract = next.document.buildingLevels;
        if (restored === null) {
          if (contract.levels.length <= 1 || Object.values(contract.roomLevels).includes(target.id)) fail('This level cannot be removed while it owns rooms or is the only level.');
          contract.levels = contract.levels.filter(level => level.id !== target.id);
          if (next.levelView?.activeLevelId === target.id) next.levelView.activeLevelId = [...contract.levels].sort((a, b) => a.displayOrder - b.displayOrder)[0].id;
        } else {
          if (restored.index > contract.levels.length) fail('The original level position can no longer be restored safely.');
          contract.levels.splice(restored.index, 0, copy(restored.level));
        }
        break;
      }
      case 'level-name': {
        if (next.document.schemaVersion === 2) fail('This history requires the building-level contract.');
        next.document.buildingLevels.levels.find(level => level.id === target.id)!.name = restored; break;
      }
      case 'level-order': {
        if (next.document.schemaVersion === 2) fail('This history requires the building-level contract.');
        const contract = next.document.buildingLevels;
        if (restored.length !== contract.levels.length || restored.some((item: { id: string }) => !contract.levels.some(level => level.id === item.id))) fail('The set of levels changed; the old order cannot replace it.');
        for (const level of contract.levels) level.displayOrder = restored.find((item: { id: string }) => item.id === level.id).displayOrder;
        break;
      }
      case 'room-level': {
        if (next.document.schemaVersion === 2) fail('This history requires the building-level contract.');
        if (restored !== null && room) assertRoomReassignment(next, target.id);
        next.document.buildingLevels.roomLevels = Object.fromEntries([
          ...Object.entries(next.document.buildingLevels.roomLevels).filter(([id]) => id !== target.id),
          ...(restored === null ? [] : [[target.id, restored]]),
        ]);
        break;
      }
      case 'room': {
        if (restored === null) {
          const layoutDependencies=layoutRoomDependencies(next,target.id);
          if(layoutDependencies.length)fail("This room has dependent zones or cabinet blocks: "+layoutDependencies.join(", ")+". Resolve those changes before Undo.");
          const stairDependencies=stairRoomDependencies(next,target.id);
          if(stairDependencies.length)fail('This room has dependent stairs or surface openings: '+stairDependencies.join(', ')+'. Resolve those changes before Undo.');
          const walls = new Set(room!.wallFaces.map(wall => wall.id));
          if (next.document.openings.some(item => item.attachments.some(face => walls.has(face.wallFaceId)))
              || next.document.editorContract?.groups.some(group => group.roomIds.includes(target.id))) fail('This room has dependent openings or group membership. Resolve those changes before Undo.');
          next.document.rooms = next.document.rooms.filter(item => item.id !== target.id);
          next.fields = Object.fromEntries(Object.entries(next.fields).filter(([id]) => id !== target.id));
          next.document.calculationContract!.rooms = Object.fromEntries(Object.entries(next.document.calculationContract!.rooms).filter(([id]) => id !== target.id));
        } else {
          if (restored.index > next.document.rooms.length) fail('The original room ordering can no longer be restored safely.');
          next.document.rooms.splice(restored.index, 0, copy(restored.room));
          next.fields = Object.fromEntries([...Object.entries(next.fields), [target.id, copy(restored.fields)]]);
          next.document.calculationContract!.rooms = Object.fromEntries([...Object.entries(next.document.calculationContract!.rooms), [target.id, copy(restored.applicability)]]);
          for (const field of roomFields) if (!next.fields[target.id][field].dirty) next.fields[target.id][field] = { text: committedFieldText(restored.room[field], next.displayUnit), unit: next.displayUnit, dirty: false };
        }
        break;
      }
      case 'room-name': if (restored === null) delete room!.name; else room!.name = restored; break;
      case 'room-measurement': room![target.field] = restored; next.fields[target.id][target.field] = { text: committedFieldText(restored, next.displayUnit), unit: next.displayUnit, dirty: false }; break;
      case 'applicability': {
        const before = next.document.calculationContract!.rooms[target.id][target.field];
        recordApplicabilityDeclaration(next, target.id, target.field, before, restored, at);
        next.document.calculationContract!.rooms[target.id][target.field] = restored; break;
      }
      case 'opening': {
        if (restored === null) {
          next.document.openings = next.document.openings.filter(item => item.id !== target.id);
          next.openingFields = Object.fromEntries(Object.entries(next.openingFields ?? {}).filter(([id]) => id !== target.id));
        } else {
          if (restored.index > next.document.openings.length) fail('The original opening ordering can no longer be restored safely.');
          next.document.openings.splice(restored.index, 0, copy(restored.opening));
          const fields: OpeningFields = copy(restored.fields), clean = openingFieldsFor(restored.opening, next.displayUnit);
          for (const field of ['width', 'height', 'sillHeight', 'offset'] as const) if (!fields[field].dirty) fields[field] = clean[field];
          next.openingFields = Object.fromEntries([...Object.entries(next.openingFields ?? {}), [target.id, fields]]);
          openingChecks.add(target.id);
        }
        if (next.openingDeleteUndo?.opening.id === target.id) delete next.openingDeleteUndo;
        break;
      }
      case 'opening-measurement': {
        opening![target.field] = restored;
        const fields = copy(getOpeningFields(next, target.id));
        fields[target.field] = openingFieldsFor(opening!, next.displayUnit)[target.field];
        next.openingFields = Object.fromEntries([...Object.entries(next.openingFields ?? {}), [target.id, fields]]);
        openingChecks.add(target.id); break;
      }
      case 'opening-position': {
        opening!.attachments = restored;
        const fields = copy(getOpeningFields(next, target.id)); fields.offset = openingFieldsFor(opening!, next.displayUnit).offset;
        next.openingFields = Object.fromEntries([...Object.entries(next.openingFields ?? {}), [target.id, fields]]);
        openingChecks.add(target.id); break;
      }
      case 'opening-basis': opening!.measureBasis = restored; break;
      case 'opening-appearance': if (restored === null) delete opening!.appearance; else opening!.appearance = restored; break;
      case 'takeoff-output': {
        const index = request.selections.findIndex(item => item.output === target.output);
        if (restored === null) request.selections = request.selections.filter(item => item.output !== target.output);
        else if (index >= 0) request.selections[index] = restored; else {
          if (change.beforeIndex === null || change.beforeIndex === undefined || change.beforeIndex > request.selections.length) fail('The previous work output ordering can no longer be restored safely.');
          request.selections.splice(change.beforeIndex, 0, restored);
        }
        const old = change.after as QuantitySelection | null;
        if (next.takeoffState && (restored === null || !old || ('wasteFraction' in old && old.wasteFraction !== restored.wasteFraction))) {
          next.takeoffState.wasteFields = Object.fromEntries(Object.entries(next.takeoffState.wasteFields).filter(([output]) => output !== target.output));
        }
        break;
      }
      case 'takeoff-basis': request.policy.openingMeasureBasis = restored; break;
      case 'crown-gaps': request.policy.crownFullHeightGaps = restored; break;
    }
  }
  restoreTakeoffRequest(next, request);
  if (next.takeoffState && !equal(draft.request, next.request)) next.takeoffState.notice = { message: 'Restored the previous committed takeoff setting. Later raw edits to other outputs are unchanged.', removedTargets: 0 };
  if (preservedLaterScope) {
    next.takeoffState = next.takeoffState ?? { version: 'takeoff-editor-v1', scopeRevision: 0, wasteFields: {}, notice: null };
    next.takeoffState.notice = { message: 'Restored the opening geometry. Later takeoff or raw-waste edits were preserved; previous pruned targets were not reselected.', removedTargets: 0 };
  }
  if (openingChecks.size) {
    const geometry = validateGeometry(next.document);
    const invalid = geometry.checks.filter(check => check.status === 'invalid' && check.openingIds.some(id => openingChecks.has(id)));
    if (!geometry.structuralValid || invalid.length) fail(!geometry.structuralValid ? 'This opening can no longer be restored on its original wall.' : Array.from(new Set(invalid.map(check => check.message))).join(' '));
  }
  assertSupportedPhysicalDocument(next.document);
  return { draft: next, changes: changesBetween(draft, next), preservedLaterScope };
}
export function restoreHistory(draft: PhysicalDraft, history: DraftHistory, direction: 'undo' | 'redo', at: string): { draft: PhysicalDraft; history: DraftHistory } {
  const entry = history[direction].at(-1);
  if (!entry) fail(`There is no committed edit to ${direction}.`);
  if (!Number.isFinite(Date.parse(at)) || !/T/.test(at)) fail('A valid history action timestamp is required.');
  const applied = applyInverse(draft, entry, at), id = eventId(applied.draft);
  if (direction === 'redo') {
    const original = draft.historyEvidence?.events.find(event => event.id === entry.id && event.action === 'commit');
    const originalDelete = original?.changes.find(change => change.target.kind === 'opening' && change.before !== null && change.after === null);
    const deletion = originalDelete && applied.changes.find(change => key(change.target) === key(originalDelete.target) && change.before !== null && change.after === null);
    if (deletion && deletion.target.kind === 'opening') {
      const bundle = deletion.before as { opening: PhysicalOpening; index: number; fields: OpeningFields };
      // Redo of the original delete is a newly applied deletion, so retain the
      // existing explicitly bounded recovery affordance with fresh scope guards.
      applied.draft.openingDeleteUndo = { opening: copy(bundle.opening), index: bundle.index, fields: copy(bundle.fields),
        requestBefore: copy(draft.request), requestAfter: copy(applied.draft.request), scopeRevisionAfter: takeoffScopeRevision(applied.draft) };
    }
  }
  appendEvent(applied.draft, { id, transactionId: entry.id, action: direction, at, label: entry.label, sourceEventId: entry.eventId,
    changes: applied.changes, ...(applied.preservedLaterScope ? { preservedLaterScope: true } : {}) });
  // The opposite action compares against the actual normalized restoration,
  // including unconfirmed provenance, rather than stale pre-review snapshots.
  const opposite: HistoryEntry = { ...entry, eventId: id,
    changes: copy(applied.changes),
    scopeRevision: takeoffScopeRevision(applied.draft), automaticScope: entry.automaticScope && !applied.preservedLaterScope };
  const reveal = revealFor(applied.draft, draft, applied.changes);
  if (reveal && applied.draft.levelView) applied.draft.levelView.activeLevelId = reveal.levelId;
  const nextHistory = { ...history, undo: [...history.undo], redo: [...history.redo], ...(reveal ? { reveal } : {}) };
  nextHistory[direction].pop();
  nextHistory[direction === 'undo' ? 'redo' : 'undo'].push(opposite);
  return { draft: applied.draft, history: nextHistory };
}
export function historySummary(draft: PhysicalDraft | null, history: DraftHistory): HistorySummary {
  const reason = (entry: HistoryEntry | undefined) => {
    if (!draft || !entry) return null;
    try { applyInverse(draft, entry, new Date().toISOString()); return null; }
    catch (error) { return error instanceof Error ? error.message : 'The current draft cannot safely replay this edit.'; }
  };
  return { undoLabel: history.undo.at(-1)?.label ?? null, redoLabel: history.redo.at(-1)?.label ?? null,
    undoReason: reason(history.undo.at(-1)), redoReason: reason(history.redo.at(-1)), boundary: history.boundary, limit: HISTORY_LIMIT, ...(history.reveal ? { reveal: history.reveal } : {}) };
}

function revealFor(after: PhysicalDraft, before: PhysicalDraft, changes: HistoryChange[]): HistoryReveal | undefined {
  if (after.document.schemaVersion === 2 || changes.every(change => ['takeoff-output', 'takeoff-basis', 'crown-gaps'].includes(change.target.kind))) return undefined;
  const make = (levelId: string | null, roomId?: string, openingId?: string): HistoryReveal | undefined =>
    levelId && after.document.schemaVersion !== 2 && after.document.buildingLevels.levels.some(level => level.id === levelId)
      ? { levelId, ...(roomId ? { roomId } : {}), ...(openingId ? { openingId } : {}), revision: after.localEditRevision } : undefined;
  for (const change of changes) {
    const target = change.target;
    if (target.kind === 'level' || target.kind === 'level-name') {
      const found = make(target.id); if (found) return found;
    }
    if((target.kind==='stair-object'||target.kind==='stair-part')&&(after.document.schemaVersion === 4 || after.document.schemaVersion === 5)){
      const prior=(before.document.schemaVersion === 4 || before.document.schemaVersion === 5)?before.document.stairsContract:null;
      if(target.object==='stair'){
        const stair=after.document.stairsContract.stairs.find(item=>item.id===target.id)??prior?.stairs.find(item=>item.id===target.id);
        if(stair){const preferred=target.kind==='stair-part'&&target.part.includes('upper')?'upper':'lower';
          for(const role of [preferred,preferred==='lower'?'upper':'lower'] as const){const endpoint=stair.endpoints[role];if(endpoint.state==='modeled')return {...make(endpoint.levelId,endpoint.roomId)!,stairId:target.id,endpointRole:role};}}
      }else{
        const opening=after.document.stairsContract.surfaceOpenings.find(item=>item.id===target.id)??prior?.surfaceOpenings.find(item=>item.id===target.id);
        const attachment=opening?.attachments[0];if(attachment){const found=make(roomLevelId(after,attachment.roomId),attachment.roomId);if(found)return {...found,surfaceOpeningId:target.id,surface:attachment.surface};}
      }
    }
    if((target.kind==='layout-object'||target.kind==='layout-part')&&after.document.schemaVersion===5){
      const old=before.document.schemaVersion===5?before.document.layoutContract:null;
      const entity=target.object==='zone'?(after.document.layoutContract.zones.find(item=>item.id===target.id)??old?.zones.find(item=>item.id===target.id))
        :(after.document.layoutContract.cabinetBlocks.find(item=>item.id===target.id)??old?.cabinetBlocks.find(item=>item.id===target.id));
      if(entity){const found=make(roomLevelId(after,entity.roomId),entity.roomId);if(found)return {...found,...(target.object==='zone'?{zoneId:target.id}:{cabinetId:target.id})};}
    }
    if (!('id' in target)) continue;
    if (target.kind.startsWith('room') || target.kind === 'applicability') {
      const room = after.document.rooms.find(item => item.id === target.id);
      const found = make(roomLevelId(after, target.id) ?? roomLevelId(before, target.id), room?.id);
      if (found) return found;
    }
    if (target.kind.startsWith('opening')) {
      const opening = after.document.openings.find(item => item.id === target.id) ?? before.document.openings.find(item => item.id === target.id);
      const room = opening && [...after.document.rooms, ...before.document.rooms].find(item => item.wallFaces.some(wall => wall.id === opening.attachments[0].wallFaceId));
      const found = room && make(roomLevelId(after, room.id) ?? roomLevelId(before, room.id), after.document.rooms.some(item => item.id === room.id) ? room.id : undefined,
        after.document.openings.some(item => item.id === target.id) ? target.id : undefined);
      if (found) return found;
    }
  }
  return make(after.levelView?.activeLevelId ?? null);
}
