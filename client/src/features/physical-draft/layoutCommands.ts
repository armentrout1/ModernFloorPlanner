import { z } from 'zod';
import { roomUseSchema, functionalZoneSchema, cabinetBlockSchema, layoutPlacementSchema,
  createFunctionalZone, createCabinetBlock, type RoomUseDeclaration, type FunctionalZone,
  type CabinetBlock, type LayoutPlacement } from '@shared/domain/layout';
import { validateLayoutGeometry } from '@shared/domain/layoutGeometry';
import { upgradePhysicalDocumentToLayout } from '@shared/compatibility/layout';
import { assertSupportedPhysicalDocument } from '@shared/compatibility/physicalDraft';
import { unknownMeasurement, type Dimension } from '@shared/domain/measurements';
import { parseMeasurement } from '@shared/domain/parseMeasurement';
import { canonicalJson, copyJson } from '@shared/quantities/canonicalJson';
import { committedFieldText, copyDraftForEdit, PhysicalDraftError, type PhysicalDraft, type FieldDraft, type InputUnit } from './state';

const id = z.string().min(1), raw = z.object({ text: z.string(), unit: z.enum(['ft', 'm']), dirty: z.boolean() }).strict();
export const layoutFieldTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('zone'), id, field: z.enum(['width', 'length', 'x', 'y']) }).strict(),
  z.object({ kind: z.literal('cabinet'), id, field: z.enum(['length', 'depth', 'height', 'x', 'y']) }).strict(),
]);
export type LayoutFieldTarget = z.infer<typeof layoutFieldTargetSchema>;
export const layoutRawEntrySchema = z.object({ target: layoutFieldTargetSchema, raw }).strict();
export type LayoutRawEntry = z.infer<typeof layoutRawEntrySchema>;
export const layoutTextTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('zone'), id, field: z.literal('name') }).strict(),
  z.object({ kind: z.literal('cabinet'), id, field: z.literal('name') }).strict(),
  z.object({ kind: z.literal('room-use'), id, field: z.literal('customLabel') }).strict(),
  z.object({ kind: z.literal('zone-use'), id, field: z.literal('customLabel') }).strict(),
]);
export type LayoutTextTarget = z.infer<typeof layoutTextTargetSchema>;
export const layoutTextEntrySchema = z.object({ target: layoutTextTargetSchema, text: z.string(), dirty: z.boolean() }).strict();
export type LayoutTextEntry = z.infer<typeof layoutTextEntrySchema>;
export const layoutActionSchema = z.object({ object: z.enum(['room-use', 'zone', 'cabinet']), id,
  action: z.enum(['use', 'add', 'rename', 'correct', 'clear', 'placement', 'association', 'delete', 'unlink']),
  at: z.string().datetime({ offset: true }), before: z.unknown(), after: z.unknown(),
  input: z.object({ target: layoutFieldTargetSchema, text: z.string(), unit: z.enum(['ft', 'm']) }).strict().optional(),
}).strict().superRefine((event, ctx) => {
  const schema = event.object === 'room-use' ? roomUseSchema : event.object === 'zone' ? functionalZoneSchema : cabinetBlockSchema;
  if (![event.before, event.after].every(value => value === null || (schema.safeParse(value).success
      && (event.object === 'room-use' || (value as { id: string }).id === event.id)))
      || (event.before === null && event.after === null)
      || (event.action === 'add' && (event.before !== null || event.after === null))
      || (event.action === 'delete' && (event.before === null || event.after !== null))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Layout actions must retain their exact declared identity and values.' });
  }
});
export type LayoutAction = z.infer<typeof layoutActionSchema>;
const copy = <T,>(value: T): T => copyJson(value) as unknown as T;
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const equivalentMm = (a: number, b: number) => Math.abs(a - b) <= Math.min(1e-9, Number.EPSILON * Math.max(Math.abs(a), Math.abs(b)) * 4);
function fail(message: string): never { throw new PhysicalDraftError('LAYOUT_EDIT_INVALID', message); }
export function layoutIn(draft: PhysicalDraft) {
  if (draft.document.schemaVersion !== 5) fail('Enable room uses, zones and cabinet blocks in an explicit working copy first.');
  return draft.document.layoutContract;
}
export function zoneIn(draft: PhysicalDraft, id: string): FunctionalZone {
  const found = layoutIn(draft).zones.find(item => item.id === id); if (!found) fail('The selected zone is no longer present.'); return found;
}
export function cabinetIn(draft: PhysicalDraft, id: string): CabinetBlock {
  const found = layoutIn(draft).cabinetBlocks.find(item => item.id === id); if (!found) fail('The selected cabinet block is no longer present.'); return found;
}
export function roomUseIn(draft: PhysicalDraft, roomId: string): RoomUseDeclaration {
  const contract = layoutIn(draft);
  if (!draft.document.rooms.some(room => room.id === roomId) || !Object.hasOwn(contract.roomUses, roomId)) fail('The selected room is no longer present.');
  return contract.roomUses[roomId];
}
export const layoutFieldKey = (target: LayoutFieldTarget) => canonicalJson(layoutFieldTargetSchema.parse(target));
export const layoutTextKey = (target: LayoutTextTarget) => canonicalJson(layoutTextTargetSchema.parse(target));
export function layoutMeasurementAt(draft: PhysicalDraft, target: LayoutFieldTarget): Dimension {
  layoutFieldTargetSchema.parse(target);
  if (target.kind === 'zone') { const entity = zoneIn(draft, target.id); return target.field === 'x' || target.field === 'y' ? entity.placement[target.field] : entity[target.field]; }
  const entity = cabinetIn(draft, target.id); return target.field === 'x' || target.field === 'y' ? entity.placement[target.field] : entity[target.field];
}
export function setLayoutMeasurement(draft: PhysicalDraft, target: LayoutFieldTarget, value: Dimension): void {
  layoutMeasurementAt(draft, target);
  if (target.kind === 'zone') { const entity = zoneIn(draft, target.id); if (target.field === 'x' || target.field === 'y') entity.placement[target.field] = value; else entity[target.field] = value; }
  else { const entity = cabinetIn(draft, target.id); if (target.field === 'x' || target.field === 'y') entity.placement[target.field] = value; else entity[target.field] = value; }
}
export function getLayoutField(draft: PhysicalDraft, target: LayoutFieldTarget): FieldDraft {
  const measurement = layoutMeasurementAt(draft, target), key = layoutFieldKey(target);
  return draft.layoutFields && Object.hasOwn(draft.layoutFields, key) ? draft.layoutFields[key].raw
    : { text: committedFieldText(measurement, draft.displayUnit), unit: draft.displayUnit, dirty: false };
}
export function setLayoutRaw(draft: PhysicalDraft, target: LayoutFieldTarget, value: FieldDraft): void {
  const key = layoutFieldKey(target);
  draft.layoutFields = Object.fromEntries([...Object.entries(draft.layoutFields ?? {}).filter(([id]) => id !== key), [key, { target: copy(target), raw: copy(value) }]]);
}
export function removeLayoutRaw(draft: PhysicalDraft, kind: 'zone' | 'cabinet', id: string): void {
  if (draft.layoutFields) draft.layoutFields = Object.fromEntries(Object.entries(draft.layoutFields).filter(([, entry]) => entry.target.kind !== kind || entry.target.id !== id));
  if (draft.layoutTexts) draft.layoutTexts = Object.fromEntries(Object.entries(draft.layoutTexts).filter(([, entry]) => entry.target.id !== id || (entry.target.kind !== kind && !(kind === 'zone' && entry.target.kind === 'zone-use'))));
}
export function editLayoutField(draft: PhysicalDraft, target: LayoutFieldTarget, text: string): PhysicalDraft {
  const current = getLayoutField(draft, target); if (typeof text !== 'string') fail('Enter measurement text.'); if (current.text === text) return draft;
  const next = copyDraftForEdit(draft); setLayoutRaw(next, target, { ...current, text, dirty: true }); return next;
}
function fit(draft: PhysicalDraft, kind: 'zone' | 'cabinet', id: string): void {
  const invalid = validateLayoutGeometry(draft.document).checks.filter(check => check.kind === kind && check.id === id
    && check.code === (kind === 'zone' ? 'ZONE_FIT' : 'CABINET_FIT') && check.status === 'invalid');
  if (invalid.length) fail(invalid.map(check => check.message).join(' '));
}
export const layoutFieldKind = (target: LayoutFieldTarget) => target.field === 'x' || target.field === 'y' ? 'coordinate' as const : 'dimension' as const;
export function layoutFieldError(draft: PhysicalDraft, target: LayoutFieldTarget): string | null {
  const field = getLayoutField(draft, target); if (!field.text.trim()) return null;
  const parsed = parseMeasurement(field.text, { selectedUnit: field.unit, kind: layoutFieldKind(target) }); if (!parsed.ok) return parsed.message;
  if (layoutFieldKind(target) === 'coordinate') {
    try { const next = copy(draft); setLayoutMeasurement(next, target, parsed.measurement); fit(next, target.kind, target.id); }
    catch (error) { return error instanceof Error ? error.message : 'This position cannot be applied.'; }
  }
  return null;
}
function finish(before: PhysicalDraft, next: PhysicalDraft, action: LayoutAction['action'], at: string, input?: LayoutAction['input']): PhysicalDraft {
  if (!z.string().datetime({ offset: true }).safeParse(at).success) fail('A valid layout action timestamp is required.');
  assertSupportedPhysicalDocument(next.document);
  const old = layoutIn(before), following = layoutIn(next), events: LayoutAction[] = [];
  for (const object of ['room-use', 'zone', 'cabinet'] as const) {
    const a = object === 'room-use' ? Object.entries(old.roomUses).map(([id, value]) => ({ id, value })) : object === 'zone' ? old.zones : old.cabinetBlocks;
    const b = object === 'room-use' ? Object.entries(following.roomUses).map(([id, value]) => ({ id, value })) : object === 'zone' ? following.zones : following.cabinetBlocks;
    for (const id of Array.from(new Set([...a, ...b].map(item => item.id)))) {
      const prior = object === 'room-use' ? old.roomUses[id] ?? null : a.find(item => item.id === id) ?? null;
      const after = object === 'room-use' ? following.roomUses[id] ?? null : b.find(item => item.id === id) ?? null;
      if (!equal(prior, after)) events.push({ object, id, action: prior === null ? 'add' : after === null ? 'delete' : action,
        at, before: copy(prior), after: copy(after), ...(input ? { input: copy(input) } : {}) });
    }
  }
  if (events.length) next.layoutEvents = [...(next.layoutEvents ?? []), ...events];
  return next;
}
export function commitLayoutField(draft: PhysicalDraft, target: LayoutFieldTarget, at: string): PhysicalDraft {
  const field = getLayoutField(draft, target); if (!field.dirty) return draft;
  const before = layoutMeasurementAt(draft, target); let value: Dimension;
  if (!field.text.trim()) value = unknownMeasurement('Measurement explicitly cleared in the layout editor.');
  else { const parsed = parseMeasurement(field.text, { selectedUnit: field.unit, kind: layoutFieldKind(target) }); if (!parsed.ok) return draft; value = parsed.measurement; }
  const next = copyDraftForEdit(draft);
  if (!(before.state === 'known' && value.state === 'known' && equivalentMm(before.valueMm, value.valueMm))
      && !(before.state === 'unknown' && value.state === 'unknown')) setLayoutMeasurement(next, target, value);
  if (layoutFieldKind(target) === 'coordinate') fit(next, target.kind, target.id);
  setLayoutRaw(next, target, field.unit === draft.displayUnit && field.text.trim() ? { ...field, dirty: false }
    : { text: committedFieldText(layoutMeasurementAt(next, target), draft.displayUnit), unit: draft.displayUnit, dirty: false });
  return finish(draft, next, field.text.trim() ? 'correct' : 'clear', at, { target, text: field.text, unit: field.unit });
}
export function revertLayoutField(draft: PhysicalDraft, target: LayoutFieldTarget): PhysicalDraft {
  const field = getLayoutField(draft, target); if (!field.dirty) return draft;
  const next = copyDraftForEdit(draft); setLayoutRaw(next, target, { text: committedFieldText(layoutMeasurementAt(next, target), next.displayUnit), unit: next.displayUnit, dirty: false }); return next;
}
export function reformatLayoutFields(draft: PhysicalDraft, unit: InputUnit): void {
  for (const entry of Object.values(draft.layoutFields ?? {})) if (!entry.raw.dirty) entry.raw = { text: committedFieldText(layoutMeasurementAt(draft, entry.target), unit), unit, dirty: false };
}
export function maskLayoutFields(draft: PhysicalDraft, document: PhysicalDraft['document']): void {
  if (document.schemaVersion !== 5) return;
  const preview = { ...draft, document };
  for (const entry of Object.values(draft.layoutFields ?? {})) if (entry.raw.dirty) setLayoutMeasurement(preview, entry.target, unknownMeasurement('Finish editing ' + entry.target.field + ' before interpreting this layout footprint.'));
}
function textAt(draft: PhysicalDraft, target: LayoutTextTarget): string {
  layoutTextTargetSchema.parse(target);
  return target.kind === 'zone' ? zoneIn(draft, target.id).name : target.kind === 'cabinet' ? cabinetIn(draft, target.id).name
    : target.kind === 'room-use' ? roomUseIn(draft, target.id).customLabel ?? '' : zoneIn(draft, target.id).use.customLabel ?? '';
}
export function getLayoutText(draft: PhysicalDraft, target: LayoutTextTarget): LayoutTextEntry {
  const text = textAt(draft, target), key = layoutTextKey(target);
  return draft.layoutTexts && Object.hasOwn(draft.layoutTexts, key) ? draft.layoutTexts[key] : { target, text, dirty: false };
}
export function editLayoutText(draft: PhysicalDraft, target: LayoutTextTarget, text: string): PhysicalDraft {
  const current = getLayoutText(draft, target); if (typeof text !== 'string') fail('Enter a text label.'); if (current.text === text) return draft;
  const next = copyDraftForEdit(draft), key = layoutTextKey(target);
  next.layoutTexts = Object.fromEntries([...Object.entries(next.layoutTexts ?? {}).filter(([id]) => id !== key), [key, { target: copy(target), text, dirty: text !== textAt(draft, target) }]]); return next;
}
export function layoutTextError(draft: PhysicalDraft, target: LayoutTextTarget): string | null {
  const text = getLayoutText(draft, target).text; return !text.trim() || /[\u0000-\u001f\u007f]/.test(text) ? 'Enter a nonblank label without control characters.' : null;
}
function clearText(draft: PhysicalDraft, target: LayoutTextTarget): void {
  if (draft.layoutTexts) draft.layoutTexts = Object.fromEntries(Object.entries(draft.layoutTexts).filter(([key]) => key !== layoutTextKey(target)));
}
export function commitLayoutText(draft: PhysicalDraft, target: LayoutTextTarget, at: string): PhysicalDraft {
  const entry = getLayoutText(draft, target); if (!entry.dirty || layoutTextError(draft, target)) return draft;
  const value = entry.text.trim(), next = copyDraftForEdit(draft); clearText(next, target);
  if (target.kind === 'zone') zoneIn(next, target.id).name = value;
  else if (target.kind === 'cabinet') cabinetIn(next, target.id).name = value;
  else if (target.kind === 'room-use') layoutIn(next).roomUses = Object.fromEntries([...Object.entries(layoutIn(next).roomUses).filter(([id]) => id !== target.id), [target.id, { value: 'custom', customLabel: value, source: 'manual' }]]);
  else zoneIn(next, target.id).use = { value: 'custom', customLabel: value, source: 'manual' };
  return finish(draft, next, target.field === 'name' ? 'rename' : 'use', at);
}
export function revertLayoutText(draft: PhysicalDraft, target: LayoutTextTarget): PhysicalDraft {
  if (!getLayoutText(draft, target).dirty) return draft; const next = copyDraftForEdit(draft); clearText(next, target); return next;
}
function requireCleanOwner(draft: PhysicalDraft, kind: 'zone' | 'cabinet', id: string, positionOnly = false): void {
  if (Object.values(draft.layoutFields ?? {}).some(entry => entry.target.kind === kind && entry.target.id === id && entry.raw.dirty
      && (!positionOnly || entry.target.field === 'x' || entry.target.field === 'y'))
      || (!positionOnly && Object.values(draft.layoutTexts ?? {}).some(entry => entry.target.id === id && entry.dirty && (entry.target.kind === kind || (kind === 'zone' && entry.target.kind === 'zone-use'))))) {
    fail('Apply or Revert the pending layout field before moving or deleting its owner.');
  }
}
function name(value: string): string { if (typeof value !== 'string' || !value.trim() || /[\u0000-\u001f\u007f]/.test(value)) fail('Enter a nonblank name.'); return value.trim(); }
export function upgradeExistingDraftToLayout(draft: PhysicalDraft, newId: string, at: string): PhysicalDraft {
  if (draft.document.schemaVersion !== 4) fail('Enable layout from a current stair-capable building draft. Existing drafts are preserved.');
  if (!newId.trim() || newId === draft.id || !z.string().datetime({ offset: true }).safeParse(at).success) fail('A layout copy needs a new identity and valid timestamp.');
  const next = copy(draft); next.id = newId; next.localEditRevision = 0; next.document = upgradePhysicalDocumentToLayout(draft.document);
  next.layoutUpgradeLineage = { version: 'physical-layout-upgrade-v1', sourceDraftId: draft.id, sourceRevision: draft.localEditRevision, at, originalDraft: copy(draft) };
  return next;
}
export function setRoomUse(draft: PhysicalDraft, roomId: string, use: RoomUseDeclaration, at: string): PhysicalDraft {
  use = roomUseSchema.parse(use); const old = roomUseIn(draft, roomId); if (equal(old, use)) return draft;
  if (getLayoutText(draft, { kind: 'room-use', id: roomId, field: 'customLabel' }).dirty) fail('Apply or Revert the pending custom room-use label first.');
  const next = copyDraftForEdit(draft); layoutIn(next).roomUses = Object.fromEntries([...Object.entries(layoutIn(next).roomUses).filter(([id]) => id !== roomId), [roomId, copy(use)]]); return finish(draft, next, 'use', at);
}
export function addZone(draft: PhysicalDraft, id: string, roomId: string, label: string, at: string, placement?: LayoutPlacement): PhysicalDraft {
  const next = copyDraftForEdit(draft), zone = createFunctionalZone(id, roomId, name(label)); if(placement) zone.placement = layoutPlacementSchema.parse(placement); layoutIn(next).zones.push(zone); return finish(draft, next, 'add', at);
}
export function renameZone(draft: PhysicalDraft, id: string, label: string, at = new Date().toISOString()): PhysicalDraft {
  const value = name(label); if (zoneIn(draft, id).name === value) return draft; if (getLayoutText(draft, { kind: 'zone', id, field: 'name' }).dirty) fail('Apply or Revert the pending zone name first.');
  const next = copyDraftForEdit(draft); zoneIn(next, id).name = value; return finish(draft, next, 'rename', at);
}
export function setZoneUse(draft: PhysicalDraft, id: string, use: RoomUseDeclaration, at: string): PhysicalDraft {
  use = roomUseSchema.parse(use); if (equal(zoneIn(draft, id).use, use)) return draft;
  if (getLayoutText(draft, { kind: 'zone-use', id, field: 'customLabel' }).dirty) fail('Apply or Revert the pending custom zone-use label first.');
  const next = copyDraftForEdit(draft); zoneIn(next, id).use = copy(use); return finish(draft, next, 'use', at);
}
function normalizedPlacement(prior: LayoutPlacement, value: LayoutPlacement): LayoutPlacement {
  const next = layoutPlacementSchema.parse(value);
  for (const field of ['x', 'y'] as const) { const a = prior[field], b = next[field]; if (a.state === 'known' && b.state === 'known' && equivalentMm(a.valueMm, b.valueMm)) next[field] = copy(a); }
  return next;
}
export function setZonePlacement(draft: PhysicalDraft, id: string, placement: LayoutPlacement, at: string): PhysicalDraft {
  const old = zoneIn(draft, id); placement = normalizedPlacement(old.placement, placement); if (equal(old.placement, placement)) return draft;
  requireCleanOwner(draft, 'zone', id, true); const next = copyDraftForEdit(draft); zoneIn(next, id).placement = copy(placement); fit(next, 'zone', id);
  for (const field of ['x', 'y'] as const) setLayoutRaw(next, { kind: 'zone', id, field }, { text: committedFieldText(placement[field], next.displayUnit), unit: next.displayUnit, dirty: false });
  return finish(draft, next, 'placement', at);
}
export function addCabinet(draft: PhysicalDraft, id: string, roomId: string, label: string, at: string, placement?: LayoutPlacement): PhysicalDraft {
  const next = copyDraftForEdit(draft), cabinet = createCabinetBlock(id, roomId, name(label)); if(placement) cabinet.placement = layoutPlacementSchema.parse(placement); layoutIn(next).cabinetBlocks.push(cabinet); return finish(draft, next, 'add', at);
}
export function renameCabinet(draft: PhysicalDraft, id: string, label: string, at = new Date().toISOString()): PhysicalDraft {
  const value = name(label); if (cabinetIn(draft, id).name === value) return draft; if (getLayoutText(draft, { kind: 'cabinet', id, field: 'name' }).dirty) fail('Apply or Revert the pending cabinet name first.');
  const next = copyDraftForEdit(draft); cabinetIn(next, id).name = value; return finish(draft, next, 'rename', at);
}
export function setCabinetPlacement(draft: PhysicalDraft, id: string, placement: LayoutPlacement, at: string): PhysicalDraft {
  const old = cabinetIn(draft, id); placement = normalizedPlacement(old.placement, placement); if (equal(old.placement, placement)) return draft;
  requireCleanOwner(draft, 'cabinet', id, true); const next = copyDraftForEdit(draft); cabinetIn(next, id).placement = copy(placement); fit(next, 'cabinet', id);
  for (const field of ['x', 'y'] as const) setLayoutRaw(next, { kind: 'cabinet', id, field }, { text: committedFieldText(placement[field], next.displayUnit), unit: next.displayUnit, dirty: false });
  return finish(draft, next, 'placement', at);
}
export function setCabinetZone(draft: PhysicalDraft, id: string, zoneId: string | null, at: string): PhysicalDraft {
  const cabinet = cabinetIn(draft, id); if (cabinet.zoneId === zoneId) return draft;
  if (zoneId !== null && zoneIn(draft, zoneId).roomId !== cabinet.roomId) fail('Associate a zone in this cabinet block’s parent room.');
  const next = copyDraftForEdit(draft); cabinetIn(next, id).zoneId = zoneId; return finish(draft, next, 'association', at);
}
export function deleteZone(draft: PhysicalDraft, id: string, at: string): PhysicalDraft {
  const zone = zoneIn(draft, id); requireCleanOwner(draft, 'zone', id); const next = copyDraftForEdit(draft), contract = layoutIn(next);
  const related = contract.cabinetBlocks.filter(block => block.zoneId === id); for (const cabinet of related) cabinet.zoneId = null;
  contract.zones = contract.zones.filter(item => item.id !== id); removeLayoutRaw(next, 'zone', id);
  next.layoutNotice = { message: `Deleted ${zone.name}; kept its parent room${related.length ? ' and unlinked ' + related.length + ' cabinet block(s), which remain in the room' : ''}. Undo restores the zone and associations.` };
  return finish(draft, next, 'unlink', at);
}
export function deleteCabinet(draft: PhysicalDraft, id: string, at: string): PhysicalDraft {
  cabinetIn(draft, id); requireCleanOwner(draft, 'cabinet', id); const next = copyDraftForEdit(draft);
  layoutIn(next).cabinetBlocks = layoutIn(next).cabinetBlocks.filter(item => item.id !== id); removeLayoutRaw(next, 'cabinet', id); return finish(draft, next, 'delete', at);
}
export function layoutRoomDependencies(draft: PhysicalDraft, roomId: string): string[] {
  if (draft.document.schemaVersion !== 5) return [];
  return [...draft.document.layoutContract.zones.filter(item => item.roomId === roomId).map(item => `zone ${item.name || item.id}`),
    ...draft.document.layoutContract.cabinetBlocks.filter(item => item.roomId === roomId).map(item => `cabinet block ${item.name || item.id}`)];
}
export function validateLayoutEditorState(draft: PhysicalDraft): string | null {
  if (draft.document.schemaVersion !== 5) return draft.layoutFields || draft.layoutTexts || draft.layoutEvents || draft.layoutUpgradeLineage || draft.layoutNotice ? 'Layout editor state requires the explicit layout document version.' : null;
  for (const [key, entry] of Object.entries(draft.layoutFields ?? {})) {
    if (key !== layoutFieldKey(entry.target)) return 'Stored layout field identity is inconsistent.';
    let value: Dimension; try { value = layoutMeasurementAt(draft, entry.target); } catch { return 'Stored layout field refers to a missing target.'; }
    if (!entry.raw.dirty) {
      if (value.state !== 'known') { if (entry.raw.text.trim()) return 'Unresolved layout dimensions cannot have committed text.'; }
      else { const parsed = parseMeasurement(entry.raw.text, { selectedUnit: entry.raw.unit, kind: layoutFieldKind(entry.target) });
        if (entry.raw.text !== committedFieldText(value, entry.raw.unit) && (!parsed.ok || !equivalentMm(parsed.measurement.valueMm, value.valueMm))) return 'Stored layout text disagrees with its committed dimension.'; }
    }
  }
  for (const [key, entry] of Object.entries(draft.layoutTexts ?? {})) {
    if (key !== layoutTextKey(entry.target)) return 'Stored layout label identity is inconsistent.';
    let text: string; try { text = textAt(draft, entry.target); } catch { return 'Stored layout label refers to a missing target.'; }
    if (!entry.dirty && entry.text !== text) return 'Stored layout label disagrees with its committed value.';
  }
  return null;
}
