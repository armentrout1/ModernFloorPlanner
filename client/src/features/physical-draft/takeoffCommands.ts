import { z } from 'zod';
import type { QuantityOutput } from '@shared/domain/geometryValidation';
import { validateQuantityRequest, type QuantityRequest, type QuantitySelection } from '@shared/quantities/policy';
import { canonicalJson, copyJson } from '@shared/quantities/canonicalJson';
import { copyDraftForEdit, PhysicalDraftError, type PhysicalDraft } from './state';

export const TAKEOFF_OUTPUTS = ['floor-area', 'ceiling-area', 'gross-wall-area', 'net-wall-area', 'baseboard', 'base-shoe', 'crown', 'door-casing', 'window-casing', 'opening-inventory'] as const;
export type OpeningFace = { wallFaceId: string; openingId: string };
export interface WasteField { text: string; dirty: boolean }
const wasteFieldSchema = z.object({ text: z.string(), dirty: z.boolean() }).strict();
export const takeoffStateSchema = z.object({ version: z.literal('takeoff-editor-v1'),
  scopeRevision: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  wasteFields: z.record(wasteFieldSchema),
  notice: z.object({ message: z.string().min(1), removedTargets: z.number().int().nonnegative() }).strict().nullable(),
}).strict();
export type TakeoffState = z.infer<typeof takeoffStateSchema>;
const copy = <T,>(value: T): T => copyJson(value) as unknown as T;
function fail(message: string): never { throw new PhysicalDraftError('INVALID_TAKEOFF_EDIT', message); }
const state = (draft: PhysicalDraft): TakeoffState => draft.takeoffState ?? { version: 'takeoff-editor-v1', scopeRevision: 0, wasteFields: {}, notice: null };
export const takeoffScopeRevision = (draft: PhysicalDraft) => state(draft).scopeRevision;
function bump(draft: PhysicalDraft) {
  const current = state(draft);
  if (current.scopeRevision === Number.MAX_SAFE_INTEGER) fail('This takeoff edit counter cannot advance safely. Preserve the draft.');
  draft.takeoffState = { ...copy(current), scopeRevision: current.scopeRevision + 1 };
}
function outputValid(output: QuantityOutput) {
  if (!TAKEOFF_OUTPUTS.includes(output)) fail('Choose a supported work output.');
}
function selection(draft: PhysicalDraft, output: QuantityOutput): QuantitySelection {
  outputValid(output);
  return draft.request.selections.find(item => item.output === output) ?? fail('Select this work output before choosing its targets or waste.');
}
function replaceRequest(draft: PhysicalDraft, request: QuantityRequest): PhysicalDraft {
  const checked = validateQuantityRequest(draft.document, request);
  if (!checked.ok) fail(checked.errors.map(error => error.message).join(' '));
  if (canonicalJson(request) === canonicalJson(draft.request)) return draft;
  const next = copyDraftForEdit(draft); next.request = copy(request); bump(next); return next;
}
function emptySelection(output: QuantityOutput): QuantitySelection {
  if (output === 'opening-inventory') return { output, openingIds: [] };
  if (output === 'floor-area' || output === 'ceiling-area') return { output, roomIds: [], wasteFraction: 0 };
  if (output === 'door-casing' || output === 'window-casing') return { output, faces: [], wasteFraction: 0 };
  return { output, wallFaceIds: [], wasteFraction: 0 };
}
export function setOutputEnabled(draft: PhysicalDraft, output: QuantityOutput, enabled: boolean): PhysicalDraft {
  outputValid(output);
  const exists = draft.request.selections.some(item => item.output === output);
  if (exists === enabled) return draft;
  const request = copy(draft.request);
  request.selections = enabled ? [...request.selections, emptySelection(output)] : request.selections.filter(item => item.output !== output);
  const next = replaceRequest(draft, request);
  // A disabled output has no pending value or authoritative waste setting.
  if (next.takeoffState) next.takeoffState.wasteFields = Object.fromEntries(Object.entries(next.takeoffState.wasteFields).filter(([key]) => key !== output));
  return next;
}
export function setOutputTargets(draft: PhysicalDraft, output: QuantityOutput, targets: string[] | OpeningFace[]): PhysicalDraft {
  const current = selection(draft, output), request = copy(draft.request);
  const key = 'roomIds' in current ? 'roomIds' : 'wallFaceIds' in current ? 'wallFaceIds' : 'openingIds' in current ? 'openingIds' : 'faces';
  request.selections = request.selections.map(item => item.output === output ? { ...item, [key]: copy(targets) } as QuantitySelection : item);
  return replaceRequest(draft, request);
}
export function selectAllCurrentTargets(draft: PhysicalDraft, output: QuantityOutput): PhysicalDraft {
  const current = selection(draft, output);
  const targets = 'roomIds' in current ? draft.document.rooms.map(room => room.id)
    : 'wallFaceIds' in current ? draft.document.rooms.flatMap(room => room.wallFaces.map(wall => wall.id))
    : 'openingIds' in current ? draft.document.openings.map(opening => opening.id)
    : draft.document.openings.filter(opening => opening.kind === (output === 'door-casing' ? 'door' : 'window'))
      .flatMap(opening => opening.attachments.map(face => ({ openingId: opening.id, wallFaceId: face.wallFaceId })));
  return setOutputTargets(draft, output, targets);
}
export function setTakeoffBasis(draft: PhysicalDraft, basis: QuantityRequest['policy']['openingMeasureBasis']): PhysicalDraft {
  return replaceRequest(draft, { ...copy(draft.request), policy: { ...copy(draft.request.policy), openingMeasureBasis: basis } });
}
export function setCrownGaps(draft: PhysicalDraft, faces: OpeningFace[]): PhysicalDraft {
  return replaceRequest(draft, { ...copy(draft.request), policy: { ...copy(draft.request.policy), crownFullHeightGaps: copy(faces) } });
}
export function getWasteField(draft: PhysicalDraft, output: QuantityOutput): WasteField {
  const selected = selection(draft, output);
  if (!('wasteFraction' in selected)) fail('Opening inventory has no waste percentage.');
  const stored = state(draft).wasteFields;
  return Object.hasOwn(stored, output) ? copy(stored[output]) : { text: String(selected.wasteFraction * 100), dirty: false };
}
export function wasteError(raw: WasteField): string | null {
  const text = raw.text.trim();
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) return 'Enter a complete, nonnegative percentage, such as 0 or 10. This edit has not been applied.';
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || !Number.isFinite(value / 100)) return 'Enter a finite, nonnegative percentage. This edit has not been applied.';
  return null;
}
export function editWaste(draft: PhysicalDraft, output: QuantityOutput, text: string): PhysicalDraft {
  const current = getWasteField(draft, output);
  if (current.text === text) return draft;
  const next = copyDraftForEdit(draft); bump(next);
  next.takeoffState!.wasteFields = { ...next.takeoffState!.wasteFields, [output]: { text, dirty: true } };
  return next;
}
export function commitWaste(draft: PhysicalDraft, output: QuantityOutput): PhysicalDraft {
  const raw = getWasteField(draft, output);
  if (!raw.dirty) return draft;
  const error = wasteError(raw); if (error) fail(error);
  const next = copyDraftForEdit(draft); bump(next);
  next.request.selections = next.request.selections.map(item => item.output === output ? { ...item, wasteFraction: Number(raw.text.trim()) / 100 } as QuantitySelection : item);
  next.takeoffState!.wasteFields[output] = { ...raw, dirty: false };
  return next;
}
export function pendingWasteOutputs(draft: PhysicalDraft): QuantityOutput[] {
  return draft.request.selections.filter(item => item.output !== 'opening-inventory'
    && getWasteField(draft, item.output).dirty).map(item => item.output);
}
export function dismissTakeoffNotice(draft: PhysicalDraft): PhysicalDraft {
  if (!draft.takeoffState?.notice) return draft;
  const next = copyDraftForEdit(draft); next.takeoffState!.notice = null; return next;
}
/** Called only on an already-copied atomic geometry command. No second edit revision. */
export function pruneTakeoffTargets(draft: PhysicalDraft, reason: string): void {
  const rooms = new Set(draft.document.rooms.map(room => room.id));
  const walls = new Set(draft.document.rooms.flatMap(room => room.wallFaces.map(wall => wall.id)));
  const openings = new Map(draft.document.openings.map(opening => [opening.id, opening]));
  const validFace = (face: OpeningFace) => openings.get(face.openingId)?.attachments.some(attachment => attachment.wallFaceId === face.wallFaceId) === true;
  let removed = 0;
  const filter = <T,>(values: T[], predicate: (value: T) => boolean) => { const kept = values.filter(predicate); removed += values.length - kept.length; return kept; };
  const request = copy(draft.request);
  request.policy.crownFullHeightGaps = filter(request.policy.crownFullHeightGaps, validFace);
  request.selections = request.selections.map(item => 'roomIds' in item ? { ...item, roomIds: filter(item.roomIds, value => rooms.has(value)) }
    : 'wallFaceIds' in item ? { ...item, wallFaceIds: filter(item.wallFaceIds, value => walls.has(value)) }
    : 'openingIds' in item ? { ...item, openingIds: filter(item.openingIds, value => openings.has(value)) }
    : { ...item, faces: filter(item.faces, validFace) });
  if (!removed) return;
  draft.request = request; bump(draft);
  draft.takeoffState!.notice = { message: `${reason} Removed ${removed} unavailable takeoff target${removed === 1 ? '' : 's'}. The remaining work, targets and waste are unchanged.`, removedTargets: removed };
}
/** Restore only the bounded deletion's scope when there have been no later scope/raw-waste edits. */
export function restoreTakeoffRequest(draft: PhysicalDraft, request: QuantityRequest): void {
  if (!validateQuantityRequest(draft.document, request).ok) fail('The previous takeoff scope no longer fits the current document.');
  if (canonicalJson(draft.request) === canonicalJson(request)) return;
  draft.request = copy(request); bump(draft);
  draft.takeoffState!.notice = { message: 'Restored the deleted opening and its previous takeoff targets.', removedTargets: 0 };
}
export function validateTakeoffState(draft: PhysicalDraft): string | null {
  if (!draft.takeoffState) return null;
  for (const [output, raw] of Object.entries(draft.takeoffState.wasteFields)) {
    const selected = draft.request.selections.find(item => item.output === output);
    if (!selected || !('wasteFraction' in selected)) return 'Stored waste fields must belong to selected work with a waste allowance.';
    if (!raw.dirty && (wasteError(raw) || Number(raw.text.trim()) / 100 !== selected.wasteFraction)) return 'Stored waste text disagrees with its committed percentage.';
  }
  return null;
}
