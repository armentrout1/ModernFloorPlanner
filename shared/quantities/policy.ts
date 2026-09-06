import { z } from 'zod';
import type { PhysicalDocument } from '../domain/document';
import { wallIndex, type QuantityOutput } from '../domain/geometryValidation';

export const QUANTITY_POLICY_VERSION = 'rectangular-flat-v1' as const;
const id = z.string().refine(value => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value), 'Invalid ID');
const ids = z.array(id);
const face = z.object({ wallFaceId: id, openingId: id }).strict();
const waste = z.number().finite().nonnegative();
const selection = z.discriminatedUnion('output', [
  z.object({ output: z.literal('floor-area'), roomIds: ids, wasteFraction: waste }).strict(),
  z.object({ output: z.literal('ceiling-area'), roomIds: ids, wasteFraction: waste }).strict(),
  z.object({ output: z.literal('gross-wall-area'), wallFaceIds: ids, wasteFraction: waste }).strict(),
  z.object({ output: z.literal('net-wall-area'), wallFaceIds: ids, wasteFraction: waste }).strict(),
  z.object({ output: z.literal('baseboard'), wallFaceIds: ids, wasteFraction: waste }).strict(),
  z.object({ output: z.literal('base-shoe'), wallFaceIds: ids, wasteFraction: waste }).strict(),
  z.object({ output: z.literal('crown'), wallFaceIds: ids, wasteFraction: waste }).strict(),
  z.object({ output: z.literal('door-casing'), faces: z.array(face), wasteFraction: waste }).strict(),
  z.object({ output: z.literal('window-casing'), faces: z.array(face), wasteFraction: waste }).strict(),
  // Inventory is identity count basis, never a waste-adjusted purchasing count.
  z.object({ output: z.literal('opening-inventory'), openingIds: ids }).strict(),
]);
export const quantityRequestSchema = z.object({
  policy: z.object({
    version: z.literal(QUANTITY_POLICY_VERSION),
    openingMeasureBasis: z.enum(['nominal', 'clear', 'finished', 'rough']),
    crownFullHeightGaps: z.array(face),
  }).strict(),
  selections: z.array(selection),
}).strict();
export type QuantityRequest = z.infer<typeof quantityRequestSchema>;
export type QuantitySelection = QuantityRequest['selections'][number];
export interface ContractError { code: string; path: (string | number)[]; message: string; id?: string }
export type RequestResult = { ok: true; request: QuantityRequest } | { ok: false; errors: ContractError[] };

// Fixed policy semantics, not a configurable formula language or an aggregation engine.
export const QUANTITY_POLICY_RULES = Object.freeze({
  version: QUANTITY_POLICY_VERSION,
  floorArea: 'rectangle; no wall-opening deductions',
  ceilingArea: 'flat rectangle; no wall-opening deductions',
  grossWallArea: 'selected wall-face length times ceiling height',
  netWallArea: 'gross selected faces minus eligible attached door/window/floor-level opening area per face',
  baseboard: 'selected floor run minus union of zero-sill interruption intervals once per face',
  baseShoe: 'same floor-run interruption policy as baseboard',
  crown: 'selected top run; deduct only explicitly selected full-height gap intervals once per face',
  inventory: 'unique selected physical opening IDs; no dimension requirements or waste',
  doorCasing: 'two jamb heights plus head width per explicitly selected face',
  windowCasing: 'two heights plus two widths per explicitly selected face',
  waste: 'finite nonnegative decimal fraction per selected output; 0.10 means 10%; M2C applies once after net',
  openingBasis: 'require exact requested nominal/clear/finished/rough basis; never convert between bases',
});

export function validateQuantityRequest(doc: PhysicalDocument, input: unknown): RequestResult {
  const suppliedVersion = (input as { policy?: { version?: unknown } } | null)?.policy?.version;
  if (suppliedVersion !== QUANTITY_POLICY_VERSION) return { ok: false, errors: [{
    code: 'UNSUPPORTED_POLICY_VERSION', path: ['policy', 'version'], message: 'Explicit supported policy version is required',
  }] };
  if (doc.quantityPolicyVersion !== null && doc.quantityPolicyVersion !== QUANTITY_POLICY_VERSION) return { ok: false, errors: [{
    code: 'DOCUMENT_POLICY_VERSION_MISMATCH', path: ['quantityPolicyVersion'], message: 'Do not overwrite document policy history with another version',
  }] };
  const parsed = quantityRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map(issue => ({
    code: 'MALFORMED_POLICY_OR_SELECTION', path: issue.path, message: issue.message,
  })) };
  const request = parsed.data, errors: ContractError[] = [];
  const rooms = new Set(doc.rooms.map(room => room.id)), walls = wallIndex(doc);
  const openings = new Map(doc.openings.map(opening => [opening.id, opening]));
  const outputs = new Set<QuantityOutput>();
  const validateIds = (values: string[], existing: { has(id: string): boolean }, path: (string | number)[]) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (!existing.has(value) || seen.has(value)) errors.push({
        code: !existing.has(value) ? 'INVALID_SELECTION_ID' : 'DUPLICATE_SELECTION_ID', path: [...path, index], id: value,
        message: 'Selections must contain existing distinct IDs',
      });
      seen.add(value);
    });
  };
  const validateFaces = (values: { wallFaceId: string; openingId: string }[], path: (string | number)[], kind?: 'door' | 'window') => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      const opening = openings.get(value.openingId), key = JSON.stringify([value.wallFaceId, value.openingId]);
      if (!walls.has(value.wallFaceId) || !opening || !opening.attachments.some(a => a.wallFaceId === value.wallFaceId)
          || (kind && opening.kind !== kind) || seen.has(key)) {
        errors.push({ code: 'INVALID_SELECTED_FACE', path: [...path, index], id: value.openingId,
          message: 'Select a distinct existing opening attachment of the requested kind' });
      }
      seen.add(key);
    });
  };
  request.selections.forEach((selected, index) => {
    if (outputs.has(selected.output)) errors.push({ code: 'DUPLICATE_OUTPUT', path: ['selections', index, 'output'], message: 'Specify each output once' });
    outputs.add(selected.output);
    if ('roomIds' in selected) validateIds(selected.roomIds, rooms, ['selections', index, 'roomIds']);
    else if ('wallFaceIds' in selected) validateIds(selected.wallFaceIds, walls, ['selections', index, 'wallFaceIds']);
    else if ('openingIds' in selected) validateIds(selected.openingIds, openings, ['selections', index, 'openingIds']);
    else validateFaces(selected.faces, ['selections', index, 'faces'], selected.output === 'door-casing' ? 'door' : 'window');
  });
  validateFaces(request.policy.crownFullHeightGaps, ['policy', 'crownFullHeightGaps']);
  return errors.length ? { ok: false, errors } : { ok: true, request };
}
