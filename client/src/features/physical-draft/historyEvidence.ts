import { z } from 'zod';
import { physicalOpeningSchema, physicalRoomSchema } from '@shared/domain/document';
import { dimensionSchema, elevationSchema } from '@shared/domain/measurements';
import { roomApplicabilitySchema } from '@shared/domain/applicability';
import { quantityRequestSchema } from '@shared/quantities/policy';
import { canonicalJson, copyJson } from '@shared/quantities/canonicalJson';
import type { PhysicalDraft } from './state';

const id = z.string().min(1);
const output = z.enum(['floor-area', 'ceiling-area', 'gross-wall-area', 'net-wall-area', 'baseboard', 'base-shoe', 'crown', 'door-casing', 'window-casing', 'opening-inventory']);
const targetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('room'), id }).strict(),
  z.object({ kind: z.literal('room-name'), id }).strict(),
  z.object({ kind: z.literal('room-measurement'), id, field: z.enum(['length', 'width', 'ceilingHeight']) }).strict(),
  z.object({ kind: z.literal('applicability'), id, field: z.enum(['ceiling', 'walls', 'crownPath']) }).strict(),
  z.object({ kind: z.literal('opening'), id }).strict(),
  z.object({ kind: z.literal('opening-measurement'), id, field: z.enum(['width', 'height', 'sillHeight']) }).strict(),
  z.object({ kind: z.literal('opening-position'), id }).strict(),
  z.object({ kind: z.literal('opening-basis'), id }).strict(),
  z.object({ kind: z.literal('opening-appearance'), id }).strict(),
  z.object({ kind: z.literal('takeoff-output'), output }).strict(),
  z.object({ kind: z.literal('takeoff-basis') }).strict(),
  z.object({ kind: z.literal('crown-gaps') }).strict(),
]);
export type HistoryTarget = z.infer<typeof targetSchema>;
const raw = z.object({ text: z.string(), unit: z.enum(['ft', 'm']), dirty: z.boolean() }).strict();
const roomBundle = z.object({ room: physicalRoomSchema, index: z.number().int().nonnegative(),
  applicability: roomApplicabilitySchema,
  fields: z.object({ length: raw, width: raw, ceilingHeight: raw }).strict(),
}).strict();
const openingBundle = z.object({ opening: physicalOpeningSchema, index: z.number().int().nonnegative(),
  fields: z.object({ width: raw, height: raw, sillHeight: raw, offset: raw }).strict(),
}).strict();
function valueValid(target: HistoryTarget, value: unknown): boolean {
  switch (target.kind) {
    case 'room': return value === null || (roomBundle.safeParse(value).success && (value as z.infer<typeof roomBundle>).room.id === target.id);
    case 'opening': return value === null || (openingBundle.safeParse(value).success && (value as z.infer<typeof openingBundle>).opening.id === target.id);
    case 'room-name': return value === null || typeof value === 'string';
    case 'room-measurement': return dimensionSchema.safeParse(value).success;
    case 'opening-measurement': return (target.field === 'sillHeight' ? elevationSchema : dimensionSchema).safeParse(value).success;
    case 'applicability': {
      const base = { ceiling: { value: 'flat', source: 'proposed', confirmation: { status: 'unconfirmed' } },
        walls: { value: 'vertical-uniform', source: 'proposed', confirmation: { status: 'unconfirmed' } },
        crownPath: { value: 'rectangular-horizontal', source: 'proposed', confirmation: { status: 'unconfirmed' } } };
      return roomApplicabilitySchema.safeParse({ ...base, [target.field]: value }).success;
    }
    case 'opening-position': return physicalOpeningSchema.shape.attachments.safeParse(value).success;
    case 'opening-basis': return physicalOpeningSchema.shape.measureBasis.safeParse(value).success;
    case 'opening-appearance': return value === null || physicalOpeningSchema.shape.appearance.unwrap().safeParse(value).success;
    case 'takeoff-output': return value === null || (quantityRequestSchema.shape.selections.element.safeParse(value).success && (value as { output: string }).output === target.output);
    case 'takeoff-basis': return quantityRequestSchema.shape.policy.shape.openingMeasureBasis.safeParse(value).success;
    case 'crown-gaps': return quantityRequestSchema.shape.policy.shape.crownFullHeightGaps.safeParse(value).success;
  }
}
export interface HistoryChange { target: HistoryTarget; before: unknown; after: unknown; beforeIndex?: number | null; afterIndex?: number | null }
const changeSchema = z.object({ target: targetSchema, before: z.unknown(), after: z.unknown(), beforeIndex: z.number().int().nonnegative().nullable().optional(), afterIndex: z.number().int().nonnegative().nullable().optional() }).strict().superRefine((change, ctx) => {
  if ((change.target.kind === 'takeoff-output' && (!Object.hasOwn(change, 'beforeIndex') || !Object.hasOwn(change, 'afterIndex')))
      || (change.target.kind !== 'takeoff-output' && (change.beforeIndex !== undefined || change.afterIndex !== undefined))) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Only output transactions retain explicit selection positions.' });
  if (!Object.hasOwn(change, 'before') || !Object.hasOwn(change, 'after') || !valueValid(change.target, change.before) || !valueValid(change.target, change.after)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'History values must match their declared physical target.' });
  }
});
export const historyEvidenceSchema = z.object({ version: z.literal('physical-history-evidence-v1'), events: z.array(z.object({
  id, transactionId: id, action: z.enum(['commit', 'undo', 'redo', 'boundary']), at: z.string().datetime({ offset: true }), label: z.string().min(1),
  changes: z.array(changeSchema), sourceEventId: id.optional(), preservedLaterScope: z.boolean().optional(),
}).strict()) }).strict();
export type HistoryEvent = Omit<z.infer<typeof historyEvidenceSchema>['events'][number], 'changes'> & { changes: HistoryChange[] };
export interface HistoryEvidence { version: 'physical-history-evidence-v1'; events: HistoryEvent[] }
export const equalHistoryValue = (a: unknown, b: unknown): boolean => a !== undefined && b !== undefined && canonicalJson(a) === canonicalJson(b);
export function semanticHistoryValue(target: HistoryTarget, value: any): unknown {
  if ((target.kind === 'room' || target.kind === 'opening') && value !== null && value !== undefined) {
    const { fields: _fields, index: _index, ...committed } = value; return committed;
  }
  return value;
}
export const historyTargetKey = (target: HistoryTarget) => canonicalJson(target);
export const copyHistory = <T,>(value: T): T => copyJson(value) as unknown as T;
/** Restoration is a local edit, not a fresh measurement or a renewed approval. */
export function restoredHistoryValue(target: HistoryTarget, value: unknown): unknown {
  const next = copyHistory(value) as any;
  if (target.kind === 'room-measurement' || target.kind === 'opening-measurement') {
    if (next.state === 'known') next.provenance.confirmation = { status: 'unconfirmed' };
  } else if (target.kind === 'applicability') next.confirmation = { status: 'unconfirmed' };
  return next;
}
export function historyValueAt(draft: PhysicalDraft, target: HistoryTarget): unknown {
  const room = 'id' in target ? draft.document.rooms.find(item => item.id === target.id) : undefined;
  const opening = 'id' in target ? draft.document.openings.find(item => item.id === target.id) : undefined;
  switch (target.kind) {
    case 'room': return room ? { room, index: draft.document.rooms.indexOf(room), applicability: draft.document.calculationContract!.rooms[target.id], fields: draft.fields[target.id] } : null;
    case 'room-name': return room ? room.name ?? null : undefined;
    case 'room-measurement': return room?.[target.field];
    case 'applicability': return room ? draft.document.calculationContract!.rooms[target.id][target.field] : undefined;
    case 'opening': return opening ? { opening, index: draft.document.openings.indexOf(opening), fields: draft.openingFields?.[target.id] } : null;
    case 'opening-measurement': return opening?.[target.field];
    case 'opening-position': return opening?.attachments;
    case 'opening-basis': return opening?.measureBasis;
    case 'opening-appearance': return opening ? opening.appearance ?? null : undefined;
    case 'takeoff-output': return draft.request.selections.find(item => item.output === target.output) ?? null;
    case 'takeoff-basis': return draft.request.policy.openingMeasureBasis;
    case 'crown-gaps': return draft.request.policy.crownFullHeightGaps;
  }
}
/** Local consistency proof only; it never authenticates a user or changes frozen quantity snapshots. */
export function validateHistoryEvidence(draft: PhysicalDraft): string | null {
  if (!draft.historyEvidence) return null;
  const byId = new Map<string, HistoryEvent>(), latest = new Map<string, HistoryChange>();
  const entities = new Map<string, { target: HistoryTarget; value: any }>();
  for (const event of draft.historyEvidence.events) {
    if (byId.has(event.id)) return 'Stored history contains duplicate action identities.';
    const keys = event.changes.map(change => historyTargetKey(change.target));
    if (new Set(keys).size !== keys.length) return 'A stored history action repeats a target.';
    if (event.action === 'undo' || event.action === 'redo') {
      const source = event.sourceEventId && byId.get(event.sourceEventId);
      if (!source || source.transactionId !== event.transactionId || source.action === 'boundary'
          || (event.action === 'redo' && source.action !== 'undo') || (event.action === 'undo' && source.action === 'undo')) return 'A history restoration has no matching earlier transaction.';
      for (const change of event.changes) {
        const original = source.changes.find(item => historyTargetKey(item.target) === historyTargetKey(change.target));
        if (!original || !equalHistoryValue(semanticHistoryValue(change.target, change.before), semanticHistoryValue(change.target, original.after))
            || !equalHistoryValue(semanticHistoryValue(change.target, change.after), semanticHistoryValue(change.target, restoredHistoryValue(change.target, original.before)))) return 'A history restoration disagrees with its retained target evidence.';
      }
      const omitted = source.changes.filter(change => !keys.includes(historyTargetKey(change.target)));
      if (omitted.some(change => !event.preservedLaterScope || !['takeoff-output', 'crown-gaps'].includes(change.target.kind))) return 'A history restoration omitted a physical target.';
    } else if (event.sourceEventId || event.preservedLaterScope) return 'A history commit cannot impersonate a restoration.';
    for (const change of event.changes) {
      const key = historyTargetKey(change.target), previous = latest.get(key);
      if (previous && !['room', 'opening'].includes(change.target.kind) && !equalHistoryValue(previous.after, change.before)) return 'Stored history actions disagree with their preceding target value.';
      if (change.target.kind === 'room' || change.target.kind === 'opening') {
        // A remove/recreate event owns the whole entity. Earlier leaf values no longer
        // describe its current incarnation; the complete entity is retained in this event.
        for (const [oldKey, old] of Array.from(latest.entries())) if ('id' in old.target && old.target.id === change.target.id) latest.delete(oldKey);
      }
      if (change.target.kind === 'room' || change.target.kind === 'opening') {
        entities.set(JSON.stringify([change.target.kind, change.target.id]), { target: change.target, value: copyHistory(semanticHistoryValue(change.target, change.after)) });
      } else if ('id' in change.target) {
        const entityKind = change.target.kind.startsWith('opening-') ? 'opening' : 'room';
        const retained = entities.get(JSON.stringify([entityKind, change.target.id]));
        if (retained?.value) {
          const entity = retained.value[entityKind], value = copyHistory(change.after);
          if (change.target.kind === 'room-name') { if (value === null) delete entity.name; else entity.name = value; }
          else if (change.target.kind === 'room-measurement' || change.target.kind === 'opening-measurement') entity[change.target.field] = value;
          else if (change.target.kind === 'applicability') retained.value.applicability[change.target.field] = value;
          else if (change.target.kind === 'opening-position') entity.attachments = value;
          else if (change.target.kind === 'opening-basis') entity.measureBasis = value;
          else if (change.target.kind === 'opening-appearance') { if (value === null) delete entity.appearance; else entity.appearance = value; }
        }
      }
      latest.set(key, change);
    }
    byId.set(event.id, event);
  }
  for (const change of Array.from(latest.values())) {
    const actual = historyValueAt(draft, change.target);
    if (change.target.kind === 'room' || change.target.kind === 'opening') {
      if ((actual === null) !== (change.after === null)) return 'Stored entity history disagrees with the current draft.';
    } else if (actual !== undefined && !equalHistoryValue(actual, change.after)) return 'Stored history disagrees with its current committed target.';
  }
  for (const { target, value } of Array.from(entities.values())) {
    if (!equalHistoryValue(value, semanticHistoryValue(target, historyValueAt(draft, target)))) return 'Stored entity restoration disagrees with current geometry or metadata.';
  }
  return null;
}
