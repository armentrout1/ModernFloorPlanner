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
export const supportedPhysicalDocumentSchema = z.union([physicalDocumentSchema, physicalDocumentV3Schema]);
export type PhysicalDocument = PhysicalDocumentV2 | PhysicalDocumentV3;
export type PhysicalRoom = z.infer<typeof physicalRoomSchema>;
export type PhysicalOpening = z.infer<typeof physicalOpeningSchema>;
export type ReviewItem = z.infer<typeof reviewItemSchema>;
