import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { mountAuthorizedRoutes } from '../../server/authorizedRoutes';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../shared/schema';
import { DatabaseStorage } from '../../server/storage';
import { createDatabase, getDatabase, DatabaseConfigurationError, type Database } from '../../server/db';
import { AuthorizationError, type VerifiedIdentity } from '../../server/authorizationTypes';

// This suite is deliberately separate from npm test. Missing explicit synthetic
// configuration fails; no live/default DATABASE_URL is ever inspected here.
const supplied = process.env.MFP_TEST_DATABASE_URL;
const directory = process.env.MFP_TEST_DATA_DIRECTORY;
assert.ok(supplied && directory, 'Set MFP_TEST_DATABASE_URL and MFP_TEST_DATA_DIRECTORY for the disposable PostgreSQL authorization suite.');
const url = new URL(supplied);
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.ok(['127.0.0.1', '[::1]', '::1'].includes(url.hostname), 'Only explicit loopback PostgreSQL is permitted.');
assert.match(url.pathname.slice(1), /^mfp_[a-z0-9_]+_test$/);
assert.equal(decodeURIComponent(url.username), 'mfp_test');
assert.equal(url.search, '', 'Test connection overrides are not permitted.');
const normalizePath = (value: string) => resolve(value).replaceAll('\\', '/').toLowerCase();
const schemaName = `mfp_authz_${randomUUID().replaceAll('-', '')}`;
const applicationName = `mfp_authz_repository_${randomUUID().slice(0, 8)}`;
const admin = postgres(supplied, { max: 1, connect_timeout: 5, onnotice: () => {} });
let client: ReturnType<typeof postgres>;
let db: Database;
let repository: DatabaseStorage;
let schemaCreated = false;
let legacyBefore: unknown;
const timestamp = '2026-09-09T12:00:00.000Z';
const payload = (name = 'Synthetic legacy sketch') => ({ name, createdAt: timestamp, updatedAt: timestamp,
  rooms: [{ id: 'room', x: -20, y: 10, width: 200, height: 120, name: 'Room', metadata: { source: 'synthetic' },
    objects: [{ id: 'door', type: 'door', wallSide: 'top', position: 40, size: 40,
      doorProperties: { style: 'single', swingSide: 'right', swingDirection: 'inward', width: 32, height: 80 } }] }] });
const denied = (status: 403 | 404) => (error: unknown) => error instanceof AuthorizationError && error.status === status
  && error.message === (status === 404 ? 'Resource not found' : 'Access denied');

before(async () => {
  const [actual] = await admin`select current_database() as database, current_user as username, current_setting('data_directory') as directory, host(inet_server_addr()) as address`;
  assert.equal(actual.database, url.pathname.slice(1)); assert.equal(actual.username, 'mfp_test');
  assert.ok(['127.0.0.1', '::1'].includes(actual.address)); assert.equal(normalizePath(actual.directory), normalizePath(directory));
  // Only after actual server identity matches do we create this unique synthetic schema.
  await admin.unsafe(`create schema "${schemaName}"`); schemaCreated = true;
  client = postgres(supplied, { max: 6, connect_timeout: 5, onnotice: () => {}, connection: { search_path: schemaName, application_name: applicationName } });
  const setup = postgres(supplied, { max: 1, onnotice: () => {}, connection: { search_path: schemaName } });
  try {
    await setup.unsafe(`create table floor_plans (id serial primary key, name text not null, rooms jsonb not null, created_at text not null, updated_at text not null);
      create table users (id serial primary key, username text not null unique, password text not null);
      insert into users(username,password) values ('synthetic-unactivated','synthetic-preserved-column');
      insert into floor_plans(name,rooms,created_at,updated_at) values ('Unowned legacy','[{"id":"old","metadata":{"keep":true}}]','old-created','old-updated');`);
    legacyBefore = (await setup`select id,name,rooms,created_at,updated_at from floor_plans where id=1`)[0];
    await setup.unsafe(readFileSync(new URL('../../migrations/0001_workspace_authorization.sql', import.meta.url), 'utf8'));
  } finally { await setup.end(); }
  db = drizzle(client, { schema }); repository = new DatabaseStorage(() => db);
});
after(async () => {
  if (client) await client.end();
  if (schemaCreated) await admin.unsafe(`drop schema "${schemaName}" cascade`);
  await admin.end();
});
async function seed() {
  const prefix = randomUUID();
  const actors: Record<string, { principalId: string; identity: VerifiedIdentity }> = {};
  for (const name of ['owner', 'editor', 'viewer', 'other', 'outsider']) {
    const [principal] = await db.insert(schema.applicationPrincipals).values({}).returning();
    const identity = { issuer: 'https://synthetic.example/issuer', subject: `${prefix}:${name}` };
    await db.insert(schema.externalIdentities).values({ ...identity, principalId: principal.id }); actors[name] = { principalId: principal.id, identity };
  }
  const [a, b] = await db.insert(schema.workspaces).values([{ name: `A-${prefix}` }, { name: `B-${prefix}` }]).returning();
  await db.insert(schema.workspaceMemberships).values([
    { workspaceId: a.id, principalId: actors.owner.principalId, role: 'owner' },
    { workspaceId: a.id, principalId: actors.editor.principalId, role: 'editor' },
    { workspaceId: a.id, principalId: actors.viewer.principalId, role: 'viewer' },
    { workspaceId: b.id, principalId: actors.other.principalId, role: 'owner' },
  ]);
  const planA = await repository.createFloorPlan(actors.owner.identity, a.id, payload('A private'));
  const planB = await repository.createFloorPlan(actors.other.identity, b.id, payload('B private'));
  return { ...actors, a, b, planA, planB };
}
async function waitForLock(count = 1) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const [{ waiting }] = await admin`select count(*)::int as waiting from pg_stat_activity where application_name=${applicationName} and wait_event_type='Lock'`;
    if (waiting >= count) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Expected actual PostgreSQL lock wait was not observed.');
}

test('additive migration preserves old users and every legacy payload field without assigning ownership', async () => {
  const [after] = await client`select * from floor_plans where id=1`;
  const { workspace_id, ...old } = after; assert.equal(workspace_id, null); assert.deepEqual(old, legacyBefore);
  assert.equal((await client`select password from users where username='synthetic-unactivated'`)[0].password, 'synthetic-preserved-column');
  assert.equal((await client`select count(*)::int as count from application_principals`)[0].count, 0);
  assert.equal((await client`select count(*)::int as count from workspaces`)[0].count, 0);
});
test('actual PostgreSQL CRUD enforces roles and assigns validated workspace outside the legacy DTO', async () => {
  const f = await seed(); const created = await repository.createFloorPlan(f.editor.identity, f.a.id, payload('Editor created'));
  assert.equal(Object.hasOwn(created, 'workspaceId'), false); assert.deepEqual(created.rooms, payload().rooms);
  const [stored] = await db.select().from(schema.floorPlans).where(eq(schema.floorPlans.id, created.id)); assert.equal(stored.workspaceId, f.a.id);
  assert.deepEqual(await repository.getFloorPlan(f.viewer.identity, f.a.id, created.id), created);
  assert.equal((await repository.updateFloorPlan(f.editor.identity, f.a.id, created.id, { name: 'Edited', updatedAt: timestamp })).name, 'Edited');
  assert.equal(await repository.deleteFloorPlan(f.owner.identity, f.a.id, created.id), true);
  await assert.rejects(repository.getFloorPlan(f.owner.identity, f.a.id, created.id), denied(404));
});
test('known other-workspace IDs and workspace selections never disclose or mutate B records', async () => {
  const f = await seed();
  assert.deepEqual((await repository.getFloorPlans(f.owner.identity, f.a.id)).map(p => p.id), [f.planA.id]);
  for (const workspace of [f.a.id, f.b.id]) {
    await assert.rejects(repository.getFloorPlan(f.owner.identity, workspace, f.planB.id), denied(404));
    await assert.rejects(repository.updateFloorPlan(f.owner.identity, workspace, f.planB.id, { name: 'Stolen' }), denied(404));
    await assert.rejects(repository.deleteFloorPlan(f.owner.identity, workspace, f.planB.id), denied(404));
  }
  await assert.rejects(repository.getFloorPlans(f.owner.identity, f.b.id), denied(404));
  await assert.rejects(repository.getWorkspace(f.owner.identity, f.b.id), denied(404));
  await assert.rejects(repository.createFloorPlan(f.owner.identity, f.b.id, payload()), denied(404));
  assert.deepEqual(await repository.getFloorPlan(f.other.identity, f.b.id, f.planB.id), f.planB);
});
test('viewer reads succeed but all writes and editor membership administration fail', async () => {
  const f = await seed(); assert.equal((await repository.getFloorPlans(f.viewer.identity, f.a.id)).length, 1);
  await assert.rejects(repository.createFloorPlan(f.viewer.identity, f.a.id, payload()), denied(403));
  await assert.rejects(repository.updateFloorPlan(f.viewer.identity, f.a.id, f.planA.id, { name: 'Forbidden' }), denied(403));
  await assert.rejects(repository.deleteFloorPlan(f.viewer.identity, f.a.id, f.planA.id), denied(403));
  for (const actor of [f.viewer, f.editor]) {
    await assert.rejects(repository.getMemberships(actor.identity, f.a.id), denied(403));
    await assert.rejects(repository.updateMembership(actor.identity, f.a.id, actor.principalId, { role: 'owner' }), denied(403));
    await assert.rejects(repository.updateWorkspaceName(actor.identity, f.a.id, 'Forbidden'), denied(403));
  }
});
test('issuer and subject jointly identify a current principal; malformed, forged and nonmember identities deny', async () => {
  const f = await seed(); const [twin] = await db.insert(schema.applicationPrincipals).values({}).returning();
  await db.insert(schema.externalIdentities).values({ issuer: 'https://another.example', subject: f.owner.identity.subject, principalId: twin.id });
  const identities = [null, {}, { email: 'owner@example.com' }, { ...f.viewer.identity, role: 'owner' },
    { issuer: 'https://another.example', subject: f.owner.identity.subject }, f.outsider.identity,
    { issuer: f.owner.identity.issuer, subject: "' OR 1=1 --" }];
  for (const identity of identities) await assert.rejects(repository.getFloorPlans(identity as VerifiedIdentity, f.a.id), denied(404));
});
test('membership revocation/demotion and principal/identity revocation take effect on the next operation', async () => {
  const f = await seed(); await repository.getFloorPlans(f.editor.identity, f.a.id);
  await repository.updateMembership(f.owner.identity, f.a.id, f.editor.principalId, { role: 'viewer' });
  await assert.rejects(repository.updateFloorPlan(f.editor.identity, f.a.id, f.planA.id, { name: 'Cached editor role' }), denied(403));
  await repository.updateMembership(f.owner.identity, f.a.id, f.editor.principalId, { status: 'revoked' });
  await assert.rejects(repository.getFloorPlans(f.editor.identity, f.a.id), denied(404));
  await db.update(schema.externalIdentities).set({ status: 'revoked' }).where(eq(schema.externalIdentities.principalId, f.viewer.principalId));
  await assert.rejects(repository.getFloorPlans(f.viewer.identity, f.a.id), denied(404));
  await db.update(schema.applicationPrincipals).set({ status: 'revoked' }).where(eq(schema.applicationPrincipals.id, f.owner.principalId));
  await assert.rejects(repository.getFloorPlans(f.owner.identity, f.a.id), denied(404));
});
test('mass-assigned authority is rejected while nested drawing metadata remains inert and compatible', async () => {
  const f = await seed(); const original = await repository.getFloorPlan(f.owner.identity, f.a.id, f.planA.id);
  for (const property of ['workspaceId', 'workspace_id', 'owner', 'role', 'principalId', 'userId', 'id']) {
    await assert.rejects(repository.updateFloorPlan(f.owner.identity, f.a.id, f.planA.id, { name: 'Rejected', [property]: f.b.id } as any), denied(403));
    await assert.rejects(repository.createFloorPlan(f.owner.identity, f.a.id, { ...payload(), [property]: f.b.id } as any), denied(403));
  }
  assert.deepEqual(await repository.getFloorPlan(f.owner.identity, f.a.id, f.planA.id), original);
  const content = payload(); Object.assign(content.rooms[0].metadata, { workspaceId: f.b.id, owner: true });
  const saved = await repository.createFloorPlan(f.editor.identity, f.a.id, content);
  assert.deepEqual(saved.rooms, content.rooms); await assert.rejects(repository.getFloorPlan(f.other.identity, f.b.id, saved.id), denied(404));
  assert.equal((await db.select().from(schema.floorPlans).where(eq(schema.floorPlans.id, saved.id)))[0].workspaceId, f.a.id);
});
test('unowned legacy records stay inaccessible despite known IDs and remain unmodified', async () => {
  const f = await seed();
  for (const workspace of [f.a.id, f.b.id]) for (const actor of [f.owner, f.other]) {
    await assert.rejects(repository.getFloorPlan(actor.identity, workspace, 1), denied(404));
    await assert.rejects(repository.updateFloorPlan(actor.identity, workspace, 1, { name: 'Claimed' }), denied(404));
    await assert.rejects(repository.deleteFloorPlan(actor.identity, workspace, 1), denied(404));
  }
  assert.deepEqual((await client`select id,name,rooms,created_at,updated_at from floor_plans where id=1`)[0], legacyBefore);
});
test('only current owners administer existing memberships and cannot remove the last active owner', async () => {
  const f = await seed(); assert.equal((await repository.getMemberships(f.owner.identity, f.a.id)).length, 3);
  await assert.rejects(repository.updateMembership(f.owner.identity, f.a.id, f.owner.principalId, { status: 'revoked' }), denied(403));
  await assert.rejects(repository.updateMembership(f.owner.identity, f.a.id, f.owner.principalId, { role: 'editor' }), denied(403));
  await assert.rejects(repository.updateMembership(f.owner.identity, f.a.id, f.outsider.principalId, { role: 'owner' }), denied(404));
  await assert.rejects(repository.updateMembership(f.owner.identity, f.a.id, f.editor.principalId, { role: 'admin' } as any), denied(403));
  await assert.rejects(repository.updateMembership(f.owner.identity, f.a.id, f.editor.principalId, { workspaceId: f.b.id } as any), denied(403));
  await repository.updateMembership(f.owner.identity, f.a.id, f.editor.principalId, { role: 'owner' });
  await repository.updateMembership(f.owner.identity, f.a.id, f.owner.principalId, { role: 'viewer' });
  await assert.rejects(repository.getMemberships(f.owner.identity, f.a.id), denied(403));
  assert.equal((await repository.updateWorkspaceName(f.editor.identity, f.a.id, 'New name')).name, 'New name');
});
test('database constraints reject dangling ownership, duplicate identity and invalid roles', async () => {
  // Drizzle wraps driver errors; keep asserting the underlying PostgreSQL constraint code.
  const f = await seed();
  await assert.rejects(db.insert(schema.externalIdentities).values({ ...f.owner.identity, principalId: f.viewer.principalId }), (e:any) => e.cause?.code === '23505');
  await assert.rejects(db.insert(schema.workspaceMemberships).values({ workspaceId: f.a.id, principalId: f.outsider.principalId, role: 'admin' as any }), (e:any) => e.cause?.code === '23514');
  await assert.rejects(db.insert(schema.floorPlans).values({ ...payload(), workspaceId: randomUUID() }), (e:any) => e.cause?.code === '23503');
});
test('an in-flight mutation waits for workspace membership changes and rechecks the committed role', async () => {
  const f = await seed(); await repository.getFloorPlans(f.editor.identity, f.a.id);
  let unlock!: () => void, locked!: () => void;
  const held = new Promise<void>(resolve => { unlock = resolve; }), ready = new Promise<void>(resolve => { locked = resolve; });
  const blocker = client.begin(async tx => {
    await tx`select id from workspaces where id=${f.a.id} for update`;
    await tx`update workspace_memberships set role='viewer' where workspace_id=${f.a.id} and principal_id=${f.editor.principalId}`;
    locked(); await held;
  });
  await ready;
  const mutation = repository.updateFloorPlan(f.editor.identity, f.a.id, f.planA.id, { name: 'Stale authority' }).then(value => ({ value }), error => ({ error }));
  try { await waitForLock(); } finally { unlock(); }
  await blocker; const result = await mutation; assert.ok('error' in result && denied(403)(result.error));
  assert.equal((await repository.getFloorPlan(f.owner.identity, f.a.id, f.planA.id)).name, 'A private');
});
test('a protected write holds its authorization lock until commit and revocation waits, then denies subsequent writes', async () => {
  const f = await seed(), advisory = Math.floor(Math.random() * 1_000_000_000);
  const lock = postgres(supplied, { max: 1, connection: { search_path: schemaName } });
  await client.unsafe(`create function hold_authorized_write() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(${advisory}); return new; end $$;
    create trigger hold_authorized_write before update on floor_plans for each row when (old.id = ${f.planA.id}) execute function hold_authorized_write();`);
  await lock`select pg_advisory_lock(${advisory})`;
  const write = repository.updateFloorPlan(f.editor.identity, f.a.id, f.planA.id, { name: 'Authorized before revocation' });
  let revoke: Promise<unknown> | undefined;
  try { await waitForLock(); revoke = repository.updateMembership(f.owner.identity, f.a.id, f.editor.principalId, { status: 'revoked' }); await waitForLock(2); }
  finally { await lock`select pg_advisory_unlock(${advisory})`; await lock.end(); }
  await write; await revoke;
  await assert.rejects(repository.updateFloorPlan(f.editor.identity, f.a.id, f.planA.id, { name: 'After revocation' }), denied(404));
  assert.equal((await repository.getFloorPlan(f.owner.identity, f.a.id, f.planA.id)).name, 'Authorized before revocation');
  await client.unsafe('drop trigger hold_authorized_write on floor_plans; drop function hold_authorized_write();');
});
test('simultaneous owner demotions serialize and leave one active owner', async () => {
  const f = await seed(); await repository.updateMembership(f.owner.identity, f.a.id, f.editor.principalId, { role: 'owner' });
  const results = await Promise.allSettled([
    repository.updateMembership(f.owner.identity, f.a.id, f.owner.principalId, { role: 'viewer' }),
    repository.updateMembership(f.editor.identity, f.a.id, f.editor.principalId, { role: 'viewer' }),
  ]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.filter(r => r.status === 'rejected').length, 1);
  const owners = await db.select().from(schema.workspaceMemberships).where(and(eq(schema.workspaceMemberships.workspaceId, f.a.id), eq(schema.workspaceMemberships.role, 'owner'), eq(schema.workspaceMemberships.status, 'active')));
  assert.equal(owners.length, 1);
});
test('missing or malformed database binding and repository failures never fall back to unscoped data', async () => {
  for (const input of ['', 'postgres://localhost/', 'https://example.com/db', undefined]) assert.throws(() => createDatabase(input as string), DatabaseConfigurationError);
  const previous = process.env.DATABASE_URL; delete process.env.DATABASE_URL;
  try { assert.throws(() => getDatabase(), DatabaseConfigurationError); } finally { if (previous === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previous; }
  const failing = new DatabaseStorage(() => { throw new Error('Synthetic database failure'); }); const f = await seed();
  await assert.rejects(failing.getFloorPlans(f.owner.identity, f.a.id), /Synthetic database failure/);
  assert.equal((await repository.getFloorPlan(f.owner.identity, f.a.id, f.planA.id)).name, 'A private');
});

test('actual HTTP middleware and routes enforce scoped PostgreSQL persistence with private responses', async () => {
  const f = await seed(); const app = express(); app.use(express.json());
  // Fixed server-established synthetic identity; no request header can select it.
  mountAuthorizedRoutes(app, { identityResolver: async () => ({ status: 'authenticated', identity: f.editor.identity,
    expiresAt: Date.now() + 60_000, authentication: 'session' }), storage: () => repository, allowedOrigin: 'http://127.0.0.1:4188' });
  const server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { 'content-type': 'application/json', 'x-mfp-workspace-id': f.a.id, Origin: 'http://127.0.0.1:4188', 'X-MFP-Request': '1' };
  try {
    const createdResponse = await fetch(origin + '/api/floor-plans', { method: 'POST', headers, body: JSON.stringify(payload('HTTP persisted')) });
    assert.equal(createdResponse.status, 201); assert.match(createdResponse.headers.get('cache-control')!, /no-store/);
    const created = await createdResponse.json() as { id: number }; assert.equal((await repository.getFloorPlan(f.owner.identity, f.a.id, created.id)).name, 'HTTP persisted');
    const inaccessible = await fetch(origin + '/api/floor-plans/' + f.planB.id, { headers }); assert.equal(inaccessible.status, 404);
    const deniedBody = await inaccessible.text(); assert.equal(deniedBody.includes('B private'), false); assert.equal(deniedBody.includes('rooms'), false);
    const otherWorkspace = await fetch(origin + '/api/floor-plans', { headers: { ...headers, 'x-mfp-workspace-id': f.b.id, 'x-user-role': 'owner' } }); assert.equal(otherWorkspace.status, 404);
    await repository.updateMembership(f.owner.identity, f.a.id, f.editor.principalId, { status: 'revoked' });
    const revoked = await fetch(origin + '/api/floor-plans/' + created.id, { method: 'PATCH', headers, body: JSON.stringify({ name: 'After revocation' }) }); assert.equal(revoked.status, 404);
    assert.equal((await repository.getFloorPlan(f.owner.identity, f.a.id, created.id)).name, 'HTTP persisted');
  } finally { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
