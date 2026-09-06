import { z } from "zod";

// This is the existing sketch wire format, not the physical measurement model.
// Room dimensions/opening size remain pixels; doorProperties dimensions are inches.
// Keep optional legacy fields and nested metadata intact when validating a save.
const finiteNumber = z.number().finite();
const positiveDimension = finiteNumber.positive();
const legacyId = z.string().refine(
  (value) => value.trim().length > 0 && !/[\u0000-\u001f\u007f]/.test(value),
  "ID must be a nonempty string without control characters",
);

export const legacyOpeningSchema = z.object({
  id: legacyId,
  type: z.enum(["door", "window"]),
  wallSide: z.enum(["top", "right", "bottom", "left"]),
  position: finiteNumber.min(0).max(100),
  size: positiveDimension,
  doorProperties: z.object({
    style: z.enum(["single", "double", "sliding", "bifold"]),
    swingDirection: z.enum(["inward", "outward"]),
    swingSide: z.enum(["left", "right"]),
    width: positiveDimension,
    height: positiveDimension,
  }).passthrough().optional(),
}).passthrough();

export const legacyRoomSchema = z.object({
  id: legacyId,
  x: finiteNumber,
  y: finiteNumber,
  width: positiveDimension,
  height: positiveDimension,
  name: z.string().optional(),
  color: z.string().optional(),
  objects: z.array(legacyOpeningSchema).optional(),
}).passthrough();

export const legacyRoomsSchema = z.array(legacyRoomSchema).superRefine((rooms, ctx) => {
  const ids = new Set<string>();
  const checkId = (id: string, path: (string | number)[]) => {
    if (ids.has(id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path, message: "IDs must be unique within a sketch" });
    }
    ids.add(id);
  };
  rooms.forEach((room, roomIndex) => {
    checkId(room.id, [roomIndex, "id"]);
    room.objects?.forEach((opening, openingIndex) => {
      checkId(opening.id, [roomIndex, "objects", openingIndex, "id"]);
    });
  });
});

const timestamp = z.string().refine(
  (value) => value.trim().length > 0 && Number.isFinite(Date.parse(value)),
  "Timestamp must be a valid date string",
);

export const createLegacyFloorPlanSchema = z.object({
  name: z.string().refine((value) => value.trim().length > 0, "Sketch name is required"),
  rooms: legacyRoomsSchema,
  createdAt: timestamp,
  updatedAt: timestamp,
}).strict();

export const updateLegacyFloorPlanSchema = createLegacyFloorPlanSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  "Provide at least one field to update",
);

// PostgreSQL serial identifiers are signed 32-bit integers. Do not accept parseInt's
// partial matches (for example, /1junk) for reads, updates or destructive requests.
export const floorPlanIdSchema = z.string().regex(/^\d+$/).transform(Number)
  .pipe(z.number().int().positive().max(2_147_483_647));
