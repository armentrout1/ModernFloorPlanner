import { z } from 'zod';

export const BUILDING_LEVELS_VERSION = 'building-levels-v1' as const;
const id = z.string().refine(value => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value), 'Invalid level or room ID');
/** This slice records no measured elevation or datum. Zero is not a default. */
export const unknownFinishedFloorElevationSchema = z.object({
  state: z.literal('unknown'), valueMm: z.null(), reference: z.null(), reason: z.string().min(1),
}).strict();
export const buildingLevelSchema = z.object({
  id, name: z.string().refine(value => value.trim().length > 0, 'Level name is required'),
  displayOrder: z.number().int().nonnegative().safe(),
  ownership: z.enum(['assigned', 'unassigned']),
  finishedFloorElevation: unknownFinishedFloorElevationSchema,
}).strict();
// Zod's generic record parser removes an own __proto__ key. Validate the
// authoritative map without rewriting valid room identities.
const roomLevelMapSchema = z.custom<Record<string, string>>().superRefine((input, ctx) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(input))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, fatal: true, message: 'Expected an own room ID to level ID map' });
    return;
  }
  for (const [roomId, levelId] of Object.entries(input)) {
    if (!id.safeParse(roomId).success || !id.safeParse(levelId).success)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [roomId], message: 'Invalid room or level ID' });
  }
});
export const buildingLevelsSchema = z.object({
  version: z.literal(BUILDING_LEVELS_VERSION), levels: z.array(buildingLevelSchema).min(1),
  roomLevels: roomLevelMapSchema,
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>(), orders = new Set<number>();
  value.levels.forEach((level, index) => {
    if (ids.has(level.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['levels', index, 'id'], message: 'Level IDs must be distinct' });
    if (orders.has(level.displayOrder)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['levels', index, 'displayOrder'], message: 'Level display orders must be distinct' });
    ids.add(level.id); orders.add(level.displayOrder);
  });
  Object.entries(value.roomLevels).forEach(([roomId, levelId]) => {
    if (!ids.has(levelId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['roomLevels', roomId], message: 'Room ownership must reference an existing level' });
  });
});
export type BuildingLevel = z.infer<typeof buildingLevelSchema>;
export type BuildingLevels = z.infer<typeof buildingLevelsSchema>;
export function createBuildingLevel(id: string, name: string, displayOrder: number, ownership: BuildingLevel['ownership'] = 'assigned'): BuildingLevel {
  return buildingLevelSchema.parse({ id, name, displayOrder, ownership,
    finishedFloorElevation: { state: 'unknown', valueMm: null, reference: null,
      reason: 'Finished-floor elevation and its reference have not been measured.' } });
}
export function createBuildingLevels(roomIds: readonly string[], levelId: string, name = 'Main floor',
  ownership: BuildingLevel['ownership'] = 'assigned'): BuildingLevels {
  if (new Set(roomIds).size !== roomIds.length) throw new Error('Room IDs must be distinct');
  const value: BuildingLevels = { version: BUILDING_LEVELS_VERSION,
    levels: [createBuildingLevel(levelId, name, 0, ownership)],
    roomLevels: Object.fromEntries(roomIds.map(roomId => [roomId, levelId])) };
  buildingLevelsSchema.parse(value);
  return value;
}
/** Calculation identity excludes display names/order; full snapshot source retains them. */
export function levelOwnershipBasis(levels: BuildingLevels) {
  return { version: levels.version,
    levels: levels.levels.map(level => ({ id: level.id, ownership: level.ownership,
      finishedFloorElevation: { state: level.finishedFloorElevation.state, valueMm: null, reference: null } }))
      .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    roomLevels: { ...levels.roomLevels } };
}
export const levelOwnershipBasisSchema = z.object({
  version: z.literal(BUILDING_LEVELS_VERSION),
  levels: z.array(z.object({ id, ownership: z.enum(['assigned', 'unassigned']),
    finishedFloorElevation: z.object({ state: z.literal('unknown'), valueMm: z.null(), reference: z.null() }).strict(),
  }).strict()).min(1), roomLevels: roomLevelMapSchema,
}).strict().superRefine((value, ctx) => {
  const ids = value.levels.map(level => level.id);
  if (new Set(ids).size !== ids.length || ids.some((id, index) => index > 0 && ids[index - 1] >= id))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['levels'], message: 'Calculation level identities must be distinct and sorted' });
  Object.entries(value.roomLevels).forEach(([roomId, levelId]) => {
    if (!ids.includes(levelId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['roomLevels', roomId],
      message: 'Calculation room ownership requires an existing level' });
  });
});
