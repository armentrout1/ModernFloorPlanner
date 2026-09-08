/**
 * CRITICAL: DOORS & WINDOWS FUNCTIONALITY
 * 
 * This file contains core doors/windows logic. Before making ANY changes:
 * 1. Read DOORS_AND_WINDOWS.md thoroughly
 * 2. Test all door/window placement scenarios after changes
 * 3. Verify drag-and-drop behavior still works
 * 4. Check property panel updates correctly
 * 
 * Last verified: June 1, 2025
 */

import { pgTable, text, serial, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const floorPlans = pgTable("floor_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  rooms: jsonb("rooms").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const insertFloorPlanSchema = createInsertSchema(floorPlans).pick({
  name: true,
  rooms: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFloorPlan = z.infer<typeof insertFloorPlanSchema>;
export type FloorPlan = typeof floorPlans.$inferSelect;

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const insertUserSchema = createInsertSchema(users).pick({
  username: true,
  password: true,
});

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const wallSideSchema = z.enum(['top', 'right', 'bottom', 'left']);
export type WallSide = z.infer<typeof wallSideSchema>;

export const objectTypeSchema = z.enum(['door', 'window']);
export type ObjectType = z.infer<typeof objectTypeSchema>;

export const doorStyleSchema = z.enum(['single', 'double', 'sliding', 'bifold']);
export type DoorStyle = z.infer<typeof doorStyleSchema>;

export const swingDirectionSchema = z.enum(['inward', 'outward']);
export type SwingDirection = z.infer<typeof swingDirectionSchema>;

export const swingSideSchema = z.enum(['left', 'right']);
export type SwingSide = z.infer<typeof swingSideSchema>;

export const doorPropertiesSchema = z.object({
  style: doorStyleSchema,
  swingDirection: swingDirectionSchema,
  swingSide: swingSideSchema,
  width: z.number().positive(),
  height: z.number().positive(),
});
export type DoorProperties = z.infer<typeof doorPropertiesSchema>;

export const roomObjectSchema = z.object({
  id: z.string(),
  type: objectTypeSchema,
  wallSide: wallSideSchema,
  position: z.number(), // Percentage along the wall (0-100)
  size: z.number(), // Size in pixels
  doorProperties: doorPropertiesSchema.optional(),
  windowProperties: z.object({ height: z.number().finite().positive() }).optional(),
});
export type RoomObject = z.infer<typeof roomObjectSchema>;

export const roomSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  name: z.string().optional(),
  color: z.string().optional(),
  groupId: z.string().min(1).max(128).optional(),
  objects: z.array(roomObjectSchema).optional(),
});

export type Room = z.infer<typeof roomSchema>;
