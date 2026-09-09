import { layoutContractSchema } from './layout';
import { stairsContractSchema, ENDPOINT_ROLES } from './stairs';
import { z } from 'zod';
import { dimensionSchema, elevationSchema } from './measurements';
import { elevationMmSchema, mmSchema } from './units';
import { calculationContractSchema } from './applicability';
import { buildingLevelsSchema } from './levels';

export const wallSideSchema = z.enum(['top', 'right', 'bottom', 'left']);
export type WallSide = z.infer<typeof wallSideSchema>;
export const CLOCKWISE_WALLS = ['top', 'right', 'bottom', 'left'] as const;
const idSchema = z.string().refine(value => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value),
  'ID must be nonblank without control characters');
const metadataSchema = z.record(z.unknown());
const wallFaceSchema = z.object({ id: idSchema, side: wallSideSchema }).strict();

export const physicalRoomSchema = z.object({
  id: idSchema, name: z.string().optional(),
  // +x right, +y down. Length is horizontal, width is vertical in plan.
  length: dimensionSchema, width: dimensionSchema, ceilingHeight: dimensionSchema,
  wallFaces: z.tuple([wallFaceSchema, wallFaceSchema, wallFaceSchema, wallFaceSchema]),
  // Optional layout only; no camera zoom/pan or physical room adjacency implied.
  presentation: z.object({ xMm: mmSchema, yMm: mmSchema, color: z.string().optional() }).strict().optional(),
  metadata: metadataSchema,
}).passthrough();

export const physicalOpeningSchema = z.object({
  id: idSchema, kind: z.enum(['door', 'window', 'floor-level-opening']),
  width: dimensionSchema, height: dimensionSchema, sillHeight: elevationSchema,
  measureBasis: z.enum(['unknown', 'nominal', 'clear', 'finished', 'rough']),
  attachments: z.array(z.object({
    wallFaceId: idSchema,
    // Distance to CENTER from clockwise start; no guessed edge when width is unresolved.
    anchor: z.literal('center'), offsetMm: elevationMmSchema,
  }).strict()).min(1).max(2),
  appearance: z.object({
    style: z.enum(['single', 'double', 'sliding', 'bifold']),
    swingDirection: z.enum(['inward', 'outward']), swingSide: z.enum(['left', 'right']),
    metadata: metadataSchema,
  }).strict().optional(),
  metadata: metadataSchema,
}).passthrough();

export const reviewItemSchema = z.object({
  code: z.enum(['conflicting-widths', 'legacy-rendering-fallback', 'unverified-legacy-field']),
  roomId: idSchema, openingId: idSchema.optional(), field: z.string(), message: z.string(),
}).strict();
const countsSchema = z.object({ rooms: z.number().int().nonnegative(), openings: z.number().int().nonnegative() }).strict();

export const physicalDocumentSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.union([idSchema, z.number().int().positive().safe()]).nullable(),
  name: z.string().optional(),
  // Legacy JSON cannot prove a revision or a quantity policy version.
  revisionId: idSchema.nullable(), quantityPolicyVersion: idSchema.nullable(),
  rooms: z.array(physicalRoomSchema), openings: z.array(physicalOpeningSchema),
  review: z.array(reviewItemSchema), metadata: metadataSchema,
  calculationContract: calculationContractSchema.optional(),
  editorContract: z.object({ version: z.literal('sketch-editor-v1'),
    groups: z.array(z.object({ id: idSchema, roomIds: z.array(idSchema).min(1) }).strict()),
  }).strict().optional(),
  compatibility: z.object({
    adapterVersion: z.enum(['legacy-pixels-v1', 'legacy-pixels-v2']), original: metadataSchema,
    before: countsSchema, after: countsSchema,
  }).strict().optional(),
}).passthrough().superRefine((document, ctx) => {
  const roomIds = new Set(document.rooms.map(room => room.id));
  if (document.calculationContract) {
    const profiles = Object.keys(document.calculationContract.rooms);
    if (profiles.length !== roomIds.size || profiles.some(id => !roomIds.has(id))
        || Array.from(roomIds).some(id => !Object.hasOwn(document.calculationContract!.rooms, id))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['calculationContract', 'rooms'],
        message: 'Exactly one applicability profile is required for each existing room' });
    }
  }
  if (document.editorContract) {
    const groups = new Set<string>(), members = new Set<string>();
    document.editorContract.groups.forEach((group, index) => {
      if (groups.has(group.id)) ctx.addIssue({ code: z.ZodIssueCode.custom,
        path: ['editorContract', 'groups', index, 'id'], message: 'Group IDs must be distinct' });
      groups.add(group.id);
      group.roomIds.forEach((roomId, member) => {
        if (!roomIds.has(roomId) || members.has(roomId)) ctx.addIssue({ code: z.ZodIssueCode.custom,
          path: ['editorContract', 'groups', index, 'roomIds', member], message: 'Each grouped room must exist and have one membership' });
        members.add(roomId);
      });
    });
  }
  const ids = new Set<string>();
  const walls = new Set<string>();
  const unique = (id: string, path: (string | number)[]) => {
    if (ids.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Duplicate domain ID' });
    ids.add(id);
  };
  document.rooms.forEach((room, r) => {
    unique(room.id, ['rooms', r, 'id']);
    room.wallFaces.forEach((wall, w) => {
      unique(wall.id, ['rooms', r, 'wallFaces', w, 'id']);
      walls.add(wall.id);
      if (wall.side !== CLOCKWISE_WALLS[w]) ctx.addIssue({
        code: z.ZodIssueCode.custom, path: ['rooms', r, 'wallFaces', w, 'side'], message: 'Wall faces must be clockwise',
      });
    });
  });
  document.openings.forEach((opening, o) => {
    unique(opening.id, ['openings', o, 'id']);
    const attached = new Set<string>();
    opening.attachments.forEach((attachment, a) => {
      if (!walls.has(attachment.wallFaceId) || attached.has(attachment.wallFaceId)) ctx.addIssue({
        code: z.ZodIssueCode.custom, path: ['openings', o, 'attachments', a, 'wallFaceId'],
        message: 'Attachment must reference an existing distinct wall face',
      });
      attached.add(attachment.wallFaceId);
    });
  });
});

export type PhysicalDocumentV2 = z.infer<typeof physicalDocumentSchema>;

/** Version 2 above is frozen. New ownership cannot pass through old consumers. */
export const physicalDocumentV3Schema = physicalDocumentSchema.innerType().extend({
  schemaVersion: z.literal(3), quantityPolicyVersion: z.literal('rectangular-flat-v3'),
  rooms: z.array(physicalRoomSchema.strict()), openings: z.array(physicalOpeningSchema.strict()),
  calculationContract: calculationContractSchema,
  editorContract: physicalDocumentSchema.innerType().shape.editorContract.unwrap(),
  buildingLevels: buildingLevelsSchema,
}).strict().superRefine((document, ctx) => {
  // Reuse unchanged structural room/opening checks without dropping any source data.
  const previous = physicalDocumentSchema.safeParse({ ...document, schemaVersion: 2 });
  if (!previous.success) previous.error.issues.forEach(issue => ctx.addIssue(issue));
  const roomIds = new Set(document.rooms.map(room => room.id));
  const membership = document.buildingLevels.roomLevels;
  if (Object.keys(membership).length !== roomIds.size || Object.keys(membership).some(id => !roomIds.has(id))
      || Array.from(roomIds).some(id => !Object.hasOwn(membership, id))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['buildingLevels', 'roomLevels'],
      message: 'Exactly one authoritative level membership is required for every existing room' });
  }
  const domainIds = new Set([...document.rooms.flatMap(room => [room.id, ...room.wallFaces.map(wall => wall.id)]),
    ...document.openings.map(opening => opening.id), ...document.editorContract.groups.map(group => group.id)]);
  document.buildingLevels.levels.forEach((level, index) => {
    if (domainIds.has(level.id)) ctx.addIssue({ code: z.ZodIssueCode.custom,
      path: ['buildingLevels', 'levels', index, 'id'], message: 'Level IDs must not reuse room, wall, opening or group IDs' });
  });
  document.editorContract.groups.forEach((group, index) => {
    if (new Set(group.roomIds.map(id => membership[id])).size > 1) ctx.addIssue({ code: z.ZodIssueCode.custom,
      path: ['editorContract', 'groups', index, 'roomIds'], message: 'A room group must remain on one level' });
  });
  const wallRooms = new Map(document.rooms.flatMap(room => room.wallFaces.map(wall => [wall.id, room.id] as const)));
  document.openings.forEach((opening, index) => {
    const levels = new Set(opening.attachments.map(face => membership[wallRooms.get(face.wallFaceId)!]));
    if (levels.size > 1) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['openings', index, 'attachments'],
      message: 'All attachments of one opening must remain on the same level' });
  });
});
export type PhysicalDocumentV3 = z.infer<typeof physicalDocumentV3Schema>;
/** Historical schema3 remains frozen; stair features require explicit schema4. */
export const physicalDocumentV4Schema = physicalDocumentV3Schema.innerType().extend({
  schemaVersion: z.literal(4), quantityPolicyVersion: z.literal('rectangular-flat-v4'),
  stairsContract: stairsContractSchema,
}).strict().superRefine((document, ctx) => {
  const { stairsContract, ...previousFields } = document;
  const previous = physicalDocumentV3Schema.safeParse({ ...previousFields, schemaVersion: 3, quantityPolicyVersion: 'rectangular-flat-v3' });
  if (!previous.success) previous.error.issues.forEach(issue => ctx.addIssue(issue));
  const ids = new Set([...document.rooms.flatMap(room => [room.id, ...room.wallFaces.map(wall => wall.id)]),
    ...document.openings.map(opening => opening.id), ...document.buildingLevels.levels.map(level => level.id),
    ...document.editorContract.groups.map(group => group.id)]);
  const unique = (id: string, path: (string | number)[]) => {
    if (ids.has(id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: 'Stair, landing and surface-opening identities must not be reused' });
    ids.add(id);
  };
  const rooms = new Set(document.rooms.map(room => room.id));
  const stairs = new Map(stairsContract.stairs.map(stair => [stair.id, stair]));
  const openings = new Map(stairsContract.surfaceOpenings.map(opening => [opening.id, opening]));
  stairsContract.stairs.forEach((stair, index) => {
    const base = ['stairsContract', 'stairs', index] as (string | number)[];
    unique(stair.id, [...base, 'id']);
    const { lower, upper } = stair.endpoints;
    if (lower.state === 'modeled' && upper.state === 'modeled' && lower.levelId === upper.levelId)
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...base, 'endpoints'], message: 'Modeled lower and upper destinations must be different levels' });
    for (const role of ENDPOINT_ROLES) {
      const endpoint = stair.endpoints[role], landing = stair.landings[role];
      if (endpoint.state === 'modeled' && (!rooms.has(endpoint.roomId)
          || !Object.hasOwn(document.buildingLevels.roomLevels, endpoint.roomId)
          || document.buildingLevels.roomLevels[endpoint.roomId] !== endpoint.levelId))
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...base, 'endpoints', role], message: 'Endpoint room must belong to its explicit existing level' });
      if (landing) {
        unique(landing.id, [...base, 'landings', role, 'id']);
        if (endpoint.state !== 'modeled') ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...base, 'landings', role], message: 'An endpoint landing requires a modeled host room' });
      }
      for (const surface of ['floor', 'ceiling'] as const) {
        const impact = stair.surfaceImpacts[role][surface];
        if (impact.state === 'deduct' && (endpoint.state !== 'modeled' || impact.openingIds.some(id =>
            !openings.get(id)?.attachments.some(attachment => attachment.roomId === endpoint.roomId && attachment.surface === surface))))
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...base, 'surfaceImpacts', role, surface], message: 'Deduction must reference explicit openings attached to this endpoint room and finish surface' });
      }
    }
  });
  stairsContract.surfaceOpenings.forEach((opening, index) => {
    const base = ['stairsContract', 'surfaceOpenings', index] as (string | number)[];
    unique(opening.id, [...base, 'id']);
    if (opening.associatedStairId !== null && !stairs.has(opening.associatedStairId))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...base, 'associatedStairId'], message: 'Associated stair must exist or be explicitly unlinked' });
    const attached = new Set<string>();
    opening.attachments.forEach((attachment, ai) => {
      const key = JSON.stringify([attachment.roomId, attachment.surface]);
      if (!rooms.has(attachment.roomId) || attached.has(key)) ctx.addIssue({ code: z.ZodIssueCode.custom,
        path: [...base, 'attachments', ai], message: 'Surface attachment must reference a distinct existing room and finish surface' });
      attached.add(key);
    });
  });
});
export type PhysicalDocumentV4 = z.infer<typeof physicalDocumentV4Schema>;
/** Layout-only content changes capture identity, not the frozen finish policy4 arithmetic. */
export const physicalDocumentV5Schema = physicalDocumentV4Schema.innerType().extend({
  schemaVersion: z.literal(5), layoutContract: layoutContractSchema,
}).strict().superRefine((document, ctx) => {
  const { layoutContract, ...previousFields } = document;
  const previous = physicalDocumentV4Schema.safeParse({ ...previousFields, schemaVersion: 4 });
  if (!previous.success) previous.error.issues.forEach(issue => ctx.addIssue(issue));
  const rooms = new Set(document.rooms.map(room => room.id)), uses = layoutContract.roomUses;
  if (Object.keys(uses).length !== rooms.size || Object.keys(uses).some(id => !rooms.has(id)) || Array.from(rooms).some(id => !Object.hasOwn(uses, id)))
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['layoutContract', 'roomUses'], message: 'Exactly one explicit use declaration is required for every current room' });
  const ids = new Set([...document.rooms.flatMap(room => [room.id, ...room.wallFaces.map(wall => wall.id)]),
    ...document.openings.map(opening => opening.id), ...document.editorContract.groups.map(group => group.id),
    ...document.buildingLevels.levels.map(level => level.id), ...document.stairsContract.stairs.flatMap(stair =>
      [stair.id, ...Object.values(stair.landings).filter(landing => landing !== null).map(landing => landing!.id)]),
    ...document.stairsContract.surfaceOpenings.map(opening => opening.id)]);
  for (const key of ['zones', 'cabinetBlocks'] as const) layoutContract[key].forEach((entity, index) => {
    const path = ['layoutContract', key, index] as (string | number)[];
    if (ids.has(entity.id)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'id'], message: 'Layout identities must not reuse any existing physical identity' });
    ids.add(entity.id);
    if (!rooms.has(entity.roomId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [...path, 'roomId'], message: 'Layout parent room must exist; level follows that room' });
  });
  layoutContract.cabinetBlocks.forEach((cabinet, index) => {
    if (cabinet.zoneId !== null && !layoutContract.zones.some(zone => zone.id === cabinet.zoneId && zone.roomId === cabinet.roomId))
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['layoutContract', 'cabinetBlocks', index, 'zoneId'], message: 'An associated zone must exist in the cabinet parent room or be explicitly unlinked' });
  });
});
export type PhysicalDocumentV5 = z.infer<typeof physicalDocumentV5Schema>;
export type PhysicalDocumentWithStairs = PhysicalDocumentV4 | PhysicalDocumentV5;
export const supportedPhysicalDocumentSchema = z.union([physicalDocumentSchema, physicalDocumentV3Schema, physicalDocumentV4Schema, physicalDocumentV5Schema]);
export type PhysicalDocument = PhysicalDocumentV2 | PhysicalDocumentV3 | PhysicalDocumentV4 | PhysicalDocumentV5;
export type PhysicalRoom = z.infer<typeof physicalRoomSchema>;
export type PhysicalOpening = z.infer<typeof physicalOpeningSchema>;
export type ReviewItem = z.infer<typeof reviewItemSchema>;
