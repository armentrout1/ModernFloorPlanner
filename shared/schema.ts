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

import { pgTable, text, serial, integer, boolean, jsonb, uuid, timestamp, primaryKey, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Provider-neutral authorization records. Existing password scaffolding stays inert.
export const applicationPrincipals = pgTable("application_principals", {
  id: uuid("id").defaultRandom().primaryKey(),
  status: text("status").$type<'active' | 'revoked'>().notNull().default('active'),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [check("application_principals_status", sql`${table.status} in ('active', 'revoked')`)]);
export const externalIdentities = pgTable("external_identities", {
  issuer: text("issuer").notNull(), subject: text("subject").notNull(),
  principalId: uuid("principal_id").notNull().references(() => applicationPrincipals.id, { onDelete: 'restrict' }),
  status: text("status").$type<'active' | 'revoked'>().notNull().default('active'),
}, table => [primaryKey({ columns: [table.issuer, table.subject] }), index("external_identities_principal_idx").on(table.principalId),
  check("external_identities_status", sql`${table.status} in ('active', 'revoked')`),
  check("external_identities_nonempty", sql`length(trim(${table.issuer})) > 0 and length(trim(${table.subject})) > 0`)]);
export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(), name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [check("workspaces_name", sql`length(trim(${table.name})) > 0`)]);
export const workspaceMemberships = pgTable("workspace_memberships", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
  principalId: uuid("principal_id").notNull().references(() => applicationPrincipals.id, { onDelete: 'restrict' }),
  role: text("role").$type<'owner' | 'editor' | 'viewer'>().notNull(),
  status: text("status").$type<'active' | 'revoked'>().notNull().default('active'),
}, table => [primaryKey({ columns: [table.workspaceId, table.principalId] }), index("workspace_memberships_principal_idx").on(table.principalId),
  check("workspace_memberships_role", sql`${table.role} in ('owner', 'editor', 'viewer')`),
  check("workspace_memberships_status", sql`${table.status} in ('active', 'revoked')`)]);

export const floorPlans = pgTable("floor_plans", {
  id: serial("id").primaryKey(),
  // Null means unresolved legacy ownership, inaccessible to ordinary accounts.
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: 'restrict' }),
  name: text("name").notNull(),
  rooms: jsonb("rooms").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("floor_plans_workspace_updated_idx").on(table.workspaceId, table.updatedAt)]);

export const insertFloorPlanSchema = createInsertSchema(floorPlans).pick({
  name: true,
  rooms: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertFloorPlan = z.infer<typeof insertFloorPlanSchema>;
export type StoredFloorPlan = typeof floorPlans.$inferSelect;
// Preserve the legacy payload; workspace authority is never drawing content.
export type FloorPlan = Omit<StoredFloorPlan, "workspaceId">;

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
