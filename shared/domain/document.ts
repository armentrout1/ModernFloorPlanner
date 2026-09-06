import { z } from 'zod';
import { dimensionSchema, elevationSchema } from './measurements';
import { elevationMmSchema, mmSchema } from './units';

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
  compatibility: z.object({
    adapterVersion: z.literal('legacy-pixels-v1'), original: metadataSchema,
    before: countsSchema, after: countsSchema,
  }).strict().optional(),
}).passthrough().superRefine((document, ctx) => {
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

export type PhysicalDocument = z.infer<typeof physicalDocumentSchema>;
export type PhysicalRoom = z.infer<typeof physicalRoomSchema>;
export type PhysicalOpening = z.infer<typeof physicalOpeningSchema>;
export type ReviewItem = z.infer<typeof reviewItemSchema>;
