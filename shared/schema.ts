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

import { pgTable, text, serial, integer, boolean, json, jsonb, varchar, uuid, timestamp, primaryKey, index, check, unique, foreignKey, type AnyPgColumn } from "drizzle-orm/pg-core";
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

// Durable OIDC/browser state; no identity, token or workspace authority in the cookie.
export const browserContexts = pgTable("auth_browser_contexts", {
  browserId: uuid("browser_id").primaryKey(),
  sessionIdHash: text("session_id_hash").notNull(),
  contextToken: uuid("context_token").notNull(),
  status: text("status").$type<'anonymous' | 'authenticated' | 'revoked'>().notNull(),
  issuer: text("issuer"), subject: text("subject"),
  principalId: uuid("principal_id").references(() => applicationPrincipals.id, { onDelete: 'restrict' }),
  selectedWorkspaceId: uuid("selected_workspace_id").references(() => workspaces.id, { onDelete: 'restrict' }),
  authenticatedAt: timestamp("authenticated_at", { withTimezone: true, mode: 'date' }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'date' }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true, mode: 'date' }).notNull(),
  idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true, mode: 'date' }).notNull(),
}, table => [index("auth_browser_contexts_expiry_idx").on(table.absoluteExpiresAt),
  check("auth_browser_contexts_status", sql`${table.status} in ('anonymous','authenticated','revoked')`),
  check("auth_browser_contexts_hash", sql`${table.sessionIdHash} ~ '^[0-9a-f]{64}$'`),
  check("auth_browser_contexts_identity", sql`(${table.status} = 'authenticated' and ${table.issuer} is not null and ${table.subject} is not null and ${table.principalId} is not null and ${table.authenticatedAt} is not null) or (${table.status} <> 'authenticated' and ${table.issuer} is null and ${table.subject} is null and ${table.principalId} is null and ${table.authenticatedAt} is null and ${table.selectedWorkspaceId} is null)`)]);
export const loginTransactions = pgTable("oidc_login_transactions", {
  stateHash: text("state_hash").primaryKey(),
  browserId: uuid("browser_id").notNull().references(() => browserContexts.browserId, { onDelete: 'restrict' }),
  contextToken: uuid("context_token").notNull(), sessionIdHash: text("session_id_hash").notNull(),
  nonce: text("nonce"), codeVerifier: text("code_verifier"), returnPath: text("return_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'date' }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: 'date' }),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: 'date' }),
}, table => [index("oidc_login_transactions_browser_created_idx").on(table.browserId, table.createdAt),
  index("oidc_login_transactions_expiry_idx").on(table.expiresAt),
  check("oidc_login_transactions_hashes", sql`${table.stateHash} ~ '^[0-9a-f]{64}$' and ${table.sessionIdHash} ~ '^[0-9a-f]{64}$'`)]);
export const workspaceCreationReceipts = pgTable("workspace_creation_receipts", {
  principalId: uuid("principal_id").notNull().references(() => applicationPrincipals.id, { onDelete: 'restrict' }),
  idempotencyKey: uuid("idempotency_key").notNull(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
  name: text("name").notNull(), createdAt: timestamp("created_at", { withTimezone: true, mode: 'date' }).notNull(),
}, table => [primaryKey({ columns: [table.principalId, table.idempotencyKey] }),
  index("workspace_creation_receipts_rate_idx").on(table.principalId, table.createdAt)]);
// The standard connect-pg-simple schema. The established library owns SID/JSON.
export const serverSessions = pgTable("mfp_sessions", {
  sid: varchar("sid").primaryKey(), sess: json("sess").notNull(),
  expire: timestamp("expire", { precision: 6, mode: 'date' }).notNull(),
}, table => [index("mfp_sessions_expire_idx").on(table.expire)]);

// Full physical documents are separate from the preserved legacy room-only table.
// The migration makes the current-revision FK deferred to create plan+revision
// atomically; immutable SQL triggers prohibit updates/deletes of history/receipts.
function physicalRevisionIdentityColumns(): [AnyPgColumn, AnyPgColumn, AnyPgColumn] {
  return [physicalPlanRevisions.workspaceId, physicalPlanRevisions.planId, physicalPlanRevisions.id];
}
export const physicalPlans = pgTable('physical_plans', {
  id: uuid('id').primaryKey(),
  workspaceId: uuid('workspace_id').notNull().references(() => workspaces.id, { onDelete: 'restrict' }),
  currentRevisionId: uuid('current_revision_id').notNull(),
  archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'string' }),
  archivedBy: uuid('archived_by').references(() => applicationPrincipals.id, { onDelete: 'restrict' }),
  lifecycleVersion: integer('lifecycle_version').notNull().default(0),
  copiedFromPlanId: uuid('copied_from_plan_id'), copiedFromRevisionId: uuid('copied_from_revision_id'),
  createdBy: uuid('created_by').notNull().references(() => applicationPrincipals.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [unique('physical_plans_workspace_id_key').on(table.workspaceId, table.id),
  index('physical_plans_workspace_id_idx').on(table.workspaceId, table.id),
  index('physical_plans_active_workspace_idx').on(table.workspaceId, table.id).where(sql`${table.archivedAt} is null`),
  index('physical_plans_archived_workspace_idx').on(table.workspaceId, table.id).where(sql`${table.archivedAt} is not null`),
  check('physical_plans_lifecycle_version', sql`${table.lifecycleVersion} >= 0`),
  check('physical_plans_archive_actor', sql`(${table.archivedAt} is null) = (${table.archivedBy} is null)`),
  check('physical_plans_copy_pair', sql`(${table.copiedFromPlanId} is null) = (${table.copiedFromRevisionId} is null) and (${table.copiedFromPlanId} is null or ${table.copiedFromPlanId} <> ${table.id})`),
  foreignKey({ name: 'physical_plans_copy_revision_fk', columns: [table.workspaceId, table.copiedFromPlanId, table.copiedFromRevisionId], foreignColumns: physicalRevisionIdentityColumns() }),
  foreignKey({ name: 'physical_plans_current_revision_fk', columns: [table.workspaceId, table.id, table.currentRevisionId], foreignColumns: physicalRevisionIdentityColumns() })]);
export const physicalPlanRevisions = pgTable('physical_plan_revisions', {
  id: uuid('id').primaryKey(), workspaceId: uuid('workspace_id').notNull(), planId: uuid('plan_id').notNull(),
  revisionNumber: integer('revision_number').notNull(), name: text('name').notNull(),
  envelope: jsonb('envelope').notNull(), evaluation: jsonb('evaluation').notNull(),
  payloadHash: text('payload_hash').notNull(),
  createdBy: uuid('created_by').notNull().references(() => applicationPrincipals.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [unique('physical_revisions_identity_key').on(table.workspaceId, table.planId, table.id),
  unique('physical_revisions_number_key').on(table.workspaceId, table.planId, table.revisionNumber),
  foreignKey({ name: 'physical_revisions_plan_fk', columns: [table.workspaceId, table.planId], foreignColumns: [physicalPlans.workspaceId, physicalPlans.id] }),
  check('physical_revisions_positive_number', sql`${table.revisionNumber} > 0`),
  check('physical_revisions_hash', sql`${table.payloadHash} ~ '^[0-9a-f]{64}$'`)]);
export const physicalSaveReceipts = pgTable('physical_save_receipts', {
  principalId: uuid('principal_id').notNull().references(() => applicationPrincipals.id, { onDelete: 'restrict' }),
  workspaceId: uuid('workspace_id').notNull(), operation: text('operation').$type<'create' | 'append'>().notNull(),
  resource: text('resource').notNull(), idempotencyKey: uuid('idempotency_key').notNull(), requestHash: text('request_hash').notNull(),
  planId: uuid('plan_id').notNull(), revisionId: uuid('revision_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.principalId, table.workspaceId, table.operation, table.resource, table.idempotencyKey] }),
  foreignKey({ name: 'physical_receipts_revision_fk', columns: [table.workspaceId, table.planId, table.revisionId], foreignColumns: physicalRevisionIdentityColumns() }),
  check('physical_receipts_operation', sql`${table.operation} in ('create', 'append')`),
  check('physical_receipts_resource', sql`(${table.operation} = 'create' and ${table.resource} = 'collection') or (${table.operation} = 'append' and ${table.resource} = ${table.planId}::text)`),
  check('physical_receipts_hash', sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`)]);

// Lifecycle receipts are separate from preserved create/append request identities.
export const physicalLifecycleReceipts = pgTable('physical_lifecycle_receipts', {
  principalId: uuid('principal_id').notNull().references(() => applicationPrincipals.id, { onDelete: 'restrict' }),
  workspaceId: uuid('workspace_id').notNull(), operation: text('operation').$type<'duplicate' | 'archive' | 'restore'>().notNull(),
  resourcePlanId: uuid('resource_plan_id').notNull(), idempotencyKey: uuid('idempotency_key').notNull(),
  requestHash: text('request_hash').notNull(), resultPlanId: uuid('result_plan_id').notNull(), resultRevisionId: uuid('result_revision_id').notNull(),
  appliedArchivedAt: timestamp('applied_archived_at', { withTimezone: true, mode: 'string' }),
  appliedLifecycleVersion: integer('applied_lifecycle_version').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, table => [primaryKey({ columns: [table.principalId, table.workspaceId, table.operation, table.resourcePlanId, table.idempotencyKey] }),
  foreignKey({ name: 'physical_lifecycle_source_fk', columns: [table.workspaceId, table.resourcePlanId], foreignColumns: [physicalPlans.workspaceId, physicalPlans.id] }),
  foreignKey({ name: 'physical_lifecycle_result_fk', columns: [table.workspaceId, table.resultPlanId, table.resultRevisionId], foreignColumns: physicalRevisionIdentityColumns() }),
  check('physical_lifecycle_operation', sql`${table.operation} in ('duplicate','archive','restore')`),
  check('physical_lifecycle_hash', sql`${table.requestHash} ~ '^[0-9a-f]{64}$'`),
  check('physical_lifecycle_version', sql`${table.appliedLifecycleVersion} >= 0`),
  check('physical_lifecycle_result', sql`(${table.operation} = 'duplicate' and ${table.resultPlanId} <> ${table.resourcePlanId} and ${table.appliedLifecycleVersion} = 0) or (${table.operation} in ('archive','restore') and ${table.resultPlanId} = ${table.resourcePlanId})`),
  check('physical_lifecycle_archive', sql`(${table.operation} = 'archive') = (${table.appliedArchivedAt} is not null)`),
]);

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
