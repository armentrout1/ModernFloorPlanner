import { z } from 'zod';
import { legacyRoomsSchema } from '../legacyValidation';
import { CLOCKWISE_WALLS, physicalDocumentSchema, type PhysicalDocument, type PhysicalOpening,
  type ReviewItem } from '../domain/document';
import { unknownMeasurement, type Dimension, type MeasurementProvenance } from '../domain/measurements';
import { mmSchema, sameLength, toMm, type Mm } from '../domain/units';

// Versioned legacy wire convention, deliberately independent of rendering/grid constants.
// Verified against canvas.ts creation/conversions, RoomObject/RoomBox rendering and Properties.
const LEGACY_MODEL_PIXELS_PER_FOOT = 20;
export const legacyPixelsToMm = (pixels: number): Mm => toMm(pixels / LEGACY_MODEL_PIXELS_PER_FOOT, 'ft');
const legacyDocumentSchema = z.object({
  schemaVersion: z.literal(1).optional(),
  id: z.union([z.string().min(1), z.number().int().positive().safe()]).optional(),
  name: z.string().optional(), rooms: legacyRoomsSchema,
}).passthrough();

export type AdaptResult = {
  status: 'converted' | 'needs-review' | 'already-v2'; document: PhysicalDocument;
} | { status: 'unsupported-version'; version: unknown }
  | { status: 'invalid'; errors: { path: (string | number)[]; message: string }[] };

// JSON data only. Avoid JSON.stringify's silent dropping/coercion of undefined, NaN,
// Dates and functions, and reject cycles rather than overflowing the Zod recursion.
function cloneJson(value: unknown, ancestors = new Set<object>(), depth = 0): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'object' || depth > 100 || ancestors.has(value)) throw new Error('Expected finite acyclic JSON (maximum depth 100)');
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error('Expected plain JSON data');
  if (Object.getOwnPropertySymbols(value).length) throw new Error('Symbol keys are not JSON');
  ancestors.add(value);
  const result = Array.isArray(value)
    ? Array.from(value, item => cloneJson(item, ancestors, depth + 1))
    : Object.fromEntries(Object.entries(value).map(([key, item]) => [key, cloneJson(item, ancestors, depth + 1)]));
  ancestors.delete(value);
  return result;
}

const rest = (data: Record<string, unknown>, keys: string[]) =>
  Object.fromEntries(Object.entries(data).filter(([key]) => !keys.includes(key)));

function imported(value: number, unit: 'in' | 'model-px'): Extract<Dimension, { state: 'known' }> {
  return {
    state: 'known', valueMm: unit === 'in' ? toMm(value, 'in') : legacyPixelsToMm(value),
    provenance: {
      source: 'imported', input: null, unit,
      components: [{ text: String(value), unit, precision: { kind: 'unavailable' } }],
      confirmation: { status: 'unconfirmed' },
    },
  };
}

export function adaptMeasurementDocument(input: unknown): AdaptResult {
  try { return adaptDocument(input); }
  catch {
    return { status: 'invalid', errors: [{ path: [], message: 'Document contains an invalid or overflowing physical value' }] };
  }
}

function adaptDocument(input: unknown): AdaptResult {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return { status: 'invalid', errors: [{ path: [], message: 'Expected a document object' }] };
  }
  if (Object.hasOwn(input, 'schemaVersion') && ![1, 2].includes((input as { schemaVersion: number }).schemaVersion)) {
    return { status: 'unsupported-version', version: (input as { schemaVersion: unknown }).schemaVersion };
  }
  let original: Record<string, unknown>;
  try { original = cloneJson(input) as Record<string, unknown>; }
  catch (error) { return { status: 'invalid', errors: [{ path: [], message: (error as Error).message }] }; }

  if (original.schemaVersion === 2) {
    const parsed = physicalDocumentSchema.safeParse(original);
    // Return the validated detached original so optional fields/metadata retain exact form.
    return parsed.success ? { status: 'already-v2', document: original as PhysicalDocument }
      : { status: 'invalid', errors: parsed.error.issues.map(({ path, message }) => ({ path, message })) };
  }
  const parsed = legacyDocumentSchema.safeParse(original);
  if (!parsed.success) return { status: 'invalid', errors: parsed.error.issues.map(({ path, message }) => ({ path, message })) };
  // Validate without adopting Zod's parsed copies: they strip own __proto__ JSON keys.
  // Keep the immutable source snapshot detached from editable metadata.
  const legacy = cloneJson(original) as z.infer<typeof legacyDocumentSchema>;
  const review: ReviewItem[] = [];
  const openings: PhysicalOpening[] = [];
  // Injective encoding, with a namespace that cannot collide with any original ID.
  const oldIds = legacy.rooms.flatMap(room => [room.id, ...(room.objects ?? []).map(object => object.id)]);
  let wallPrefix = 'mfp-wall:';
  while (oldIds.some(id => id.startsWith(wallPrefix))) wallPrefix = `_${wallPrefix}`;
  const wallId = (roomId: string, side: string) => wallPrefix + JSON.stringify([roomId, side]);

  const rooms = legacy.rooms.map(room => {
    for (const object of room.objects ?? []) {
      const savedWidth = imported(object.size, 'model-px');
      let width: Dimension = savedWidth;
      if (object.type === 'door' && object.doorProperties) {
        const enteredWidth = imported(object.doorProperties.width, 'in');
        width = enteredWidth;
        if (!sameLength(enteredWidth.valueMm, savedWidth.valueMm)) {
          const needsReview = (provenance: MeasurementProvenance): MeasurementProvenance => ({
            ...provenance, confirmation: { status: 'needs-review' },
          });
          width = { state: 'needs-review', valueMm: null, reason: 'Entered inches and saved pixel width disagree', candidates: [
            { label: 'doorProperties.width (inches)', valueMm: enteredWidth.valueMm, provenance: needsReview(enteredWidth.provenance) },
            { label: 'size (model pixels)', valueMm: savedWidth.valueMm, provenance: needsReview(savedWidth.provenance) },
          ] };
          review.push({ code: 'conflicting-widths', roomId: room.id, openingId: object.id, field: 'width', message: width.reason });
        }
      } else if (object.type === 'door') {
        // Saved size remains unconfirmed measurement evidence, not a claim that all
        // renderer fallbacks agree: line/gap use 40px, swing/preview use 36in.
        review.push({ code: 'legacy-rendering-fallback', roomId: room.id, openingId: object.id, field: 'width',
          message: 'No doorProperties: saved size is the M1 quantity basis; historical line/gap uses 40 model pixels and swing/preview uses 36 inches. Confirm before adapting presentation.' });
      }
      const wallLength = legacyPixelsToMm(['top', 'bottom'].includes(object.wallSide) ? room.width : room.height);
      const fraction = object.position / 100;
      const clockwiseFraction = ['bottom', 'left'].includes(object.wallSide) ? 1 - fraction : fraction;
      openings.push({
        id: object.id, kind: object.type, width,
        height: object.type === 'door' && object.doorProperties
          ? imported(object.doorProperties.height, 'in') : unknownMeasurement('Legacy document has no recorded opening height'),
        sillHeight: unknownMeasurement('Legacy document has no recorded sill/elevation'),
        measureBasis: 'unknown',
        attachments: [{ wallFaceId: wallId(room.id, object.wallSide), anchor: 'center', offsetMm: mmSchema.parse(wallLength * clockwiseFraction) }],
        ...(object.type === 'door' && object.doorProperties ? { appearance: {
          style: object.doorProperties.style, swingDirection: object.doorProperties.swingDirection,
          swingSide: object.doorProperties.swingSide,
          metadata: rest(object.doorProperties, ['style', 'swingDirection', 'swingSide', 'width', 'height']),
        } } : {}),
        metadata: rest(object, ['id', 'type', 'wallSide', 'position', 'size', ...(object.type === 'door' ? ['doorProperties'] : [])]),
      });
    }
    return {
      id: room.id, ...(room.name !== undefined ? { name: room.name } : {}),
      length: imported(room.width, 'model-px'), width: imported(room.height, 'model-px'),
      ceilingHeight: unknownMeasurement('Legacy room.height is a plan dimension; ceiling height was not recorded'),
      wallFaces: CLOCKWISE_WALLS.map(side => ({ id: wallId(room.id, side), side })),
      presentation: { xMm: legacyPixelsToMm(room.x), yMm: legacyPixelsToMm(room.y), ...(room.color !== undefined ? { color: room.color } : {}) },
      metadata: rest(room, ['id', 'name', 'width', 'height', 'x', 'y', 'color', 'objects']),
    };
  });
  const counts = { rooms: rooms.length, openings: openings.length };
  const document = {
    schemaVersion: 2, id: legacy.id ?? null, ...(legacy.name !== undefined ? { name: legacy.name } : {}),
    revisionId: null, quantityPolicyVersion: null, rooms, openings, review,
    metadata: rest(legacy, ['schemaVersion', 'id', 'name', 'rooms']),
    compatibility: { adapterVersion: 'legacy-pixels-v1', original,
      before: { rooms: legacy.rooms.length, openings: legacy.rooms.reduce((sum, room) => sum + (room.objects?.length ?? 0), 0) },
      after: { ...counts } },
  };
  // The preserved source adds nesting. Apply the same JSON depth boundary to
  // output so every successful conversion can be reprocessed as v2.
  const preservedDocument = cloneJson(document);
  const converted = physicalDocumentSchema.safeParse(preservedDocument);
  if (!converted.success) return { status: 'invalid', errors: converted.error.issues.map(({ path, message }) => ({ path, message })) };
  return { status: review.length ? 'needs-review' : 'converted', document: preservedDocument as PhysicalDocument };
}
