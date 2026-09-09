import { z } from 'zod';
import { dimensionSchema, coordinateMeasurementSchema, unknownMeasurement } from './measurements';
export const STAIRS_CONTRACT_VERSION = 'straight-stairs-v1' as const;
export const ENDPOINT_ROLES = ['lower', 'upper'] as const;
export type EndpointRole = typeof ENDPOINT_ROLES[number];
const id = z.string().refine(value => !!value.trim() && !/[\u0000-\u001f\u007f]/.test(value), 'Invalid identity');
const detail = z.string().refine(value => !!value.trim(), 'A reason is required');
/** Room-local top-left of the rotated axis-aligned bounding rectangle.
 * Rotation zero runs to the right, then clockwise in screen/room coordinates.
 * This does not assert alignment with any other room or measured vertical datum.
 */
export const placementSchema = z.object({
  anchor: z.literal('room-local-top-left'), x: coordinateMeasurementSchema, y: coordinateMeasurementSchema,
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
}).strict();
export const stairEndpointSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unresolved'), reason: detail }).strict(),
  z.object({ state: z.literal('modeled'), levelId: id, roomId: id, placement: placementSchema }).strict(),
]);
export const landingSchema = z.object({
  id, width: dimensionSchema, depth: dimensionSchema, placement: placementSchema,
}).strict();
export const impactSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('unresolved'), reason: detail }).strict(),
  z.object({ state: z.literal('no-deduction') }).strict(),
  z.object({ state: z.literal('deduct'), openingIds: z.array(id).min(1).refine(ids => new Set(ids).size === ids.length, 'Opening IDs must be distinct') }).strict(),
]);
const impacts = z.object({ floor: impactSchema, ceiling: impactSchema }).strict();
export const stairAssemblySchema = z.object({
  id, name: z.string(), width: dimensionSchema, run: dimensionSchema, totalRise: dimensionSchema,
  endpoints: z.object({ lower: stairEndpointSchema, upper: stairEndpointSchema }).strict(),
  landings: z.object({ lower: landingSchema.nullable(), upper: landingSchema.nullable() }).strict(),
  surfaceImpacts: z.object({ lower: impacts, upper: impacts }).strict(),
  alignment: z.object({ state: z.enum(['unreviewed', 'room-local-reviewed']), detail }).strict(),
}).strict();
export const surfaceOpeningSchema = z.object({
  id, name: z.string(), width: dimensionSchema, length: dimensionSchema,
  geometry: z.enum(['internal-rectangle', 'unsupported']), detail,
  associatedStairId: id.nullable(),
  attachments: z.array(z.object({ roomId: id, surface: z.enum(['floor', 'ceiling']), placement: placementSchema }).strict()).min(1),
}).strict();
export const stairsContractSchema = z.object({
  version: z.literal(STAIRS_CONTRACT_VERSION),
  stairs: z.array(stairAssemblySchema), surfaceOpenings: z.array(surfaceOpeningSchema),
}).strict();
export type StairPlacement = z.infer<typeof placementSchema>;
export type StairEndpoint = z.infer<typeof stairEndpointSchema>;
export type Landing = z.infer<typeof landingSchema>;
export type SurfaceImpact = z.infer<typeof impactSchema>;
export type StairAssembly = z.infer<typeof stairAssemblySchema>;
export type SurfaceOpening = z.infer<typeof surfaceOpeningSchema>;
export type StairsContract = z.infer<typeof stairsContractSchema>;
export function unknownStairPlacement(): StairPlacement {
  return { anchor: 'room-local-top-left', x: unknownMeasurement('Room-local X has not been entered'),
    y: unknownMeasurement('Room-local Y has not been entered'), rotation: 0 };
}
export function createStairAssembly(id: string, name = 'Straight stair'): StairAssembly {
  const unknown = () => ({ state: 'unresolved' as const, reason: 'Finish-surface impact has not been reviewed.' });
  return stairAssemblySchema.parse({ id, name,
    width: unknownMeasurement('Stair width has not been entered'), run: unknownMeasurement('Horizontal run excludes landings and has not been entered'),
    totalRise: unknownMeasurement('Stair rise has not been measured; level elevations remain unknown'),
    endpoints: { lower: { state: 'unresolved', reason: 'Lower destination is not modeled' }, upper: { state: 'unresolved', reason: 'Upper destination is not modeled' } },
    landings: { lower: null, upper: null },
    surfaceImpacts: { lower: { floor: unknown(), ceiling: unknown() }, upper: { floor: unknown(), ceiling: unknown() } },
    alignment: { state: 'unreviewed', detail: 'Independent room-local placements do not establish surveyed building alignment.' } });
}
export function createSurfaceOpening(id: string, roomId: string, surface: 'floor' | 'ceiling', name = 'Surface opening'): SurfaceOpening {
  return surfaceOpeningSchema.parse({ id, name, width: unknownMeasurement('Surface-opening width has not been entered'),
    length: unknownMeasurement('Surface-opening length has not been entered'), geometry: 'internal-rectangle',
    detail: 'Explicit interior finish opening; dimensions are independent of the stair footprint.',
    associatedStairId: null, attachments: [{ roomId, surface, placement: unknownStairPlacement() }] });
}
