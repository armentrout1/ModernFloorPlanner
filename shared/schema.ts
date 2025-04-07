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

export const roomSchema = z.object({
  id: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
  name: z.string().optional(),
  color: z.string().optional(),
});

export type Room = z.infer<typeof roomSchema>;
