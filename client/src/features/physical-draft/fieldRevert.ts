import { z } from 'zod';
import type { QuantityOutput } from '@shared/domain/geometryValidation';
import { committedFieldText, copyDraftForEdit, PhysicalDraftError, type PhysicalDraft, type RoomField } from './state';
import { getOpeningFields, openingFieldsFor, type OpeningField } from './openingCommands';
import { getWasteField, revertWaste, TAKEOFF_OUTPUTS } from './takeoffCommands';

export type FieldRevertTarget = { kind: 'room'; id: string; field: RoomField }
  | { kind: 'opening'; id: string; field: OpeningField }
  | { kind: 'waste'; output: QuantityOutput };
export interface FieldRevertToken { draftId: string; revision: number; target: FieldRevertTarget }

const id = z.string().refine(value => value.trim().length > 0);
const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('room'), id, field: z.enum(['length', 'width', 'ceilingHeight']) }).strict(),
  z.object({ kind: z.literal('opening'), id, field: z.enum(['width', 'height', 'sillHeight', 'offset']) }).strict(),
  z.object({ kind: z.literal('waste'), output: z.enum(TAKEOFF_OUTPUTS) }).strict(),
]);
const tokenSchema = z.object({ draftId: id, revision: z.number().int().nonnegative().safe(), target: targetSchema }).strict();
function fail(code: string, message: string): never { throw new PhysicalDraftError(code, message); }
function validateTarget(draft: PhysicalDraft, target: FieldRevertTarget): FieldRevertTarget {
  const parsed = targetSchema.safeParse(target);
  if (!parsed.success) fail('INVALID_FIELD_REVERT', 'Choose a supported unfinished measurement or waste field.');
  const value = parsed.data;
  if (value.kind === 'room') {
    if (!draft.document.rooms.some(room => room.id === value.id) || !Object.hasOwn(draft.fields, value.id)
      || !Object.hasOwn(draft.fields[value.id], value.field)) {
      fail('INVALID_FIELD_REVERT', 'This room field is no longer available. Select the current field.');
    }
  } else if (value.kind === 'opening') getOpeningFields(draft, value.id);
  else getWasteField(draft, value.output);
  return value;
}

/** Capture when offering this field's cancellation; never capture a replacement value. */
export function captureFieldRevert(draft: PhysicalDraft, target: FieldRevertTarget): FieldRevertToken {
  const checked = validateTarget(draft, target);
  return { draftId: draft.id, revision: draft.localEditRevision, target: checked };
}

/** Cancel one raw edit. The document, request and evidence are never restored from history. */
export function revertField(draft: PhysicalDraft, token: FieldRevertToken): PhysicalDraft {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) fail('INVALID_FIELD_REVERT', 'This field Revert action is invalid. Use the current field control.');
  if (parsed.data.draftId !== draft.id || parsed.data.revision !== draft.localEditRevision) {
    fail('STALE_FIELD_REVERT', 'The draft changed after this Revert action was prepared. Your newer edit is preserved; use the current field control.');
  }
  const target = validateTarget(draft, parsed.data.target);
  if (target.kind === 'waste') return revertWaste(draft, target.output);
  if (target.kind === 'room') {
    if (!draft.fields[target.id][target.field].dirty) return draft;
    const room = draft.document.rooms.find(item => item.id === target.id)!;
    const next = copyDraftForEdit(draft);
    next.fields[target.id][target.field] = {
      text: committedFieldText(room[target.field], draft.displayUnit), unit: draft.displayUnit, dirty: false,
    };
    return next;
  }
  const fields = getOpeningFields(draft, target.id);
  if (!fields[target.field].dirty) return draft;
  const opening = draft.document.openings.find(item => item.id === target.id)!;
  const next = copyDraftForEdit(draft);
  next.openingFields = Object.fromEntries([...Object.entries(next.openingFields ?? {}), [target.id,
    { ...getOpeningFields(next, target.id), [target.field]: openingFieldsFor(opening, draft.displayUnit)[target.field] },
  ]]);
  return next;
}
