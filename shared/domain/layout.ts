import { z } from 'zod';
import { dimensionSchema, unknownMeasurement } from './measurements';
import { placementSchema, unknownStairPlacement } from './stairs';
export const LAYOUT_CONTRACT_VERSION = 'room-layout-v1' as const;
export const ROOM_USE_VALUES = Object.freeze(['unspecified', 'kitchen', 'bathroom', 'living-recreation', 'bedroom', 'utility-laundry', 'storage', 'custom'] as const);
const id = z.string().refine(value => !!value.trim() && !/[\u0000-\u001f\u007f]/.test(value), 'Invalid identity');
/** Functional intent, not classification, geometry, inventory or measurement approval. */
export const roomUseSchema = z.object({
  value: z.enum(ROOM_USE_VALUES), customLabel: z.string().nullable(), source: z.enum(['manual', 'imported', 'unspecified']),
}).strict().superRefine((use, context) => {
  if (use.value === 'custom' ? typeof use.customLabel !== 'string' : use.customLabel !== null)
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['customLabel'], message: 'Custom use requires explicit text (which may be unfinished); other uses have no custom label' });
  if (use.source === 'unspecified' && use.value !== 'unspecified')
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['source'], message: 'A functional use requires explicit manual or imported source intent' });
});
export type RoomUseDeclaration = z.infer<typeof roomUseSchema>;
export type RoomUse = RoomUseDeclaration;
export const layoutPlacementSchema = placementSchema;
export type LayoutPlacement = z.infer<typeof layoutPlacementSchema>;
export const functionalZoneSchema = z.object({
  id, name: z.string(), roomId: id, use: roomUseSchema, width: dimensionSchema, length: dimensionSchema,
  placement: layoutPlacementSchema, quantityEffect: z.literal('layout-only'),
}).strict();
export const cabinetBlockSchema = z.object({
  id, name: z.string(), roomId: id, zoneId: id.nullable(), length: dimensionSchema, depth: dimensionSchema, height: dimensionSchema,
  placement: layoutPlacementSchema, quantityEffect: z.literal('layout-only'),
}).strict();
export type FunctionalZone = z.infer<typeof functionalZoneSchema>;
export type CabinetBlock = z.infer<typeof cabinetBlockSchema>;
// Validate without normalizing away legitimate own keys such as __proto__.
const roomUsesSchema = z.custom<Record<string, RoomUseDeclaration>>().superRefine((input, context) => {
  if (!input || typeof input !== 'object' || Array.isArray(input) || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    context.addIssue({ code: z.ZodIssueCode.custom, fatal: true, message: 'Expected an authoritative room-use map' }); return;
  }
  for (const [key, value] of Object.entries(input)) {
    if (!id.safeParse(key).success) context.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'Invalid room identity' });
    const parsed = roomUseSchema.safeParse(value);
    if (!parsed.success) parsed.error.issues.forEach(issue => context.addIssue({ ...issue, path: [key, ...issue.path] }));
  }
});
export const layoutContractSchema = z.object({ version: z.literal(LAYOUT_CONTRACT_VERSION),
  roomUses: roomUsesSchema, zones: z.array(functionalZoneSchema), cabinetBlocks: z.array(cabinetBlockSchema),
}).strict();
export type LayoutContract = z.infer<typeof layoutContractSchema>;
export function createUnspecifiedRoomUse(): RoomUseDeclaration { return { value: 'unspecified', customLabel: null, source: 'unspecified' }; }
export function createFunctionalZone(id: string, roomId: string, name = 'Functional zone'): FunctionalZone {
  return functionalZoneSchema.parse({ id, roomId, name, use: createUnspecifiedRoomUse(),
    width: unknownMeasurement('Zone width has not been entered'), length: unknownMeasurement('Zone length has not been entered'),
    placement: unknownStairPlacement(), quantityEffect: 'layout-only' });
}
export function createCabinetBlock(id: string, roomId: string, name = 'Cabinet block'): CabinetBlock {
  return cabinetBlockSchema.parse({ id, roomId, name, zoneId: null,
    length: unknownMeasurement('Cabinet run or island length has not been entered'), depth: unknownMeasurement('Cabinet depth has not been entered'),
    height: unknownMeasurement('Cabinet height has not been entered'), placement: unknownStairPlacement(), quantityEffect: 'layout-only' });
}
