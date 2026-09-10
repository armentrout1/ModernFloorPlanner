import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and } from 'drizzle-orm';
import * as schema from '../../shared/schema';
import { AccountStorage, AccountStorageError, SESSION_IDLE_MS, SESSION_ABSOLUTE_MS, ANONYMOUS_SESSION_MS, LOGIN_TRANSACTION_MS,
  type BrowserContext, type SessionBinding, type LoginTransaction } from '../../server/accountStorage';
import { DatabaseStorage } from '../../server/storage';
import { AuthorizationError, type VerifiedIdentity } from '../../server/authorizationTypes';
import type { Database } from '../../server/db';

// Separate mandatory suite: explicit synthetic binding only, verified BEFORE DDL.
const supplied = process.env.MFP_TEST_DATABASE_URL, directory = process.env.MFP_TEST_DATA_DIRECTORY;
assert.ok(supplied && directory, 'Set explicit MFP_TEST_DATABASE_URL and MFP_TEST_DATA_DIRECTORY; no default or live binding is permitted.');
const url = new URL(supplied);
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.ok(['127.0.0.1', '[::1]', '::1'].includes(url.hostname));
assert.match(url.pathname.slice(1), /^mfp_[a-z0-9_]+_test$/); assert.equal(decodeURIComponent(url.username), 'mfp_test'); assert.equal(url.search, '');
const normalize = (value: string) => resolve(value).replaceAll('\\', '/').toLowerCase();
const testSchema = 'mfp_accounts_' + randomUUID().replaceAll('-', '');
const applicationName = 'mfp_account_repository_' + randomUUID().slice(0, 8);
const admin = postgres(supplied, { max: 1, connect_timeout: 5, onnotice: () => {} });
let client: ReturnType<typeof postgres>, db: Database, accounts: AccountStorage, plans: DatabaseStorage, created = false;
const hash = (value = randomUUID()) => createHash('sha256').update(value).digest('hex');
const binding = (c: BrowserContext): SessionBinding => ({ browserId: c.browserId, contextToken: c.contextToken, sessionIdHash: c.sessionIdHash });
const identity = (c: BrowserContext): VerifiedIdentity => ({ issuer: c.issuer!, subject: c.subject!, sessionBinding: binding(c) });
const errorCode = (code: string) => (e: unknown) => e instanceof AccountStorageError && e.code === code;
const fields = (now = Date.now(), returnPath = '/physical-draft') => ({ stateHash: hash(), nonce: hash(), codeVerifier: hash(), returnPath, expiresAt: now + LOGIN_TRANSACTION_MS });
const plan = { name: 'Synthetic account sketch', rooms: [], createdAt: '2026-09-09T12:00:00Z', updatedAt: '2026-09-09T12:00:00Z' };
before(async () => {
  const [actual] = await admin`select current_database() as database, current_user as username, current_setting('data_directory') as directory, host(inet_server_addr()) as address`;
  assert.equal(actual.database, url.pathname.slice(1)); assert.equal(actual.username, 'mfp_test');
  assert.ok(['127.0.0.1', '::1'].includes(actual.address)); assert.equal(normalize(actual.directory), normalize(directory));
  await admin.unsafe(`create schema "${testSchema}"`); created = true;
  client = postgres(supplied, { max: 8, connect_timeout: 5, onnotice: () => {}, connection: { search_path: testSchema, application_name: applicationName } });
  const setup = postgres(supplied, { max: 1, onnotice: () => {}, connection: { search_path: testSchema } });
  try {
    await setup.unsafe(`create table floor_plans(id serial primary key,name text not null,rooms jsonb not null,created_at text not null,updated_at text not null);
      create table users(id serial primary key,username text not null unique,password text not null);
      insert into users(username,password) values('inert-old-user','preserved');
      insert into floor_plans(name,rooms,created_at,updated_at) values('Unowned','[{"metadata":{"keep":true}}]','old','old');`);
    await setup.unsafe(readFileSync(new URL('../../migrations/0001_workspace_authorization.sql', import.meta.url), 'utf8'));
    await setup.unsafe(readFileSync(new URL('../../migrations/0002_oidc_sessions_accounts.sql', import.meta.url), 'utf8'));
  } finally { await setup.end(); }
  db = drizzle(client, { schema }); accounts = new AccountStorage(() => db); plans = new DatabaseStorage(() => db);
});
after(async () => { if (client) await client.end(); if (created) await admin.unsafe(`drop schema "${testSchema}" cascade`); await admin.end(); });
async function anonymous(now = Date.now()) { return accounts.createAnonymousContext(randomUUID(), hash(), now); }
async function start(c: BrowserContext, now = Date.now()) { return accounts.beginLogin(binding(c), fields(now), now); }
async function signIn(subject = randomUUID(), now = Date.now(), issuer = 'https://synthetic-issuer.example') {
  const c = await anonymous(now), attempt = await start(c, now);
  await accounts.consumeLogin(c.browserId, c.sessionIdHash, attempt.stateHash, now);
  return accounts.finishLogin(attempt, { issuer, subject }, hash(), now);
}
async function withWorkspace() {
  const context = await signIn(); const workspace = await accounts.createWorkspace(identity(context), { name: 'Explicit workspace', idempotencyKey: randomUUID() }, Date.now());
  return { workspace, context: await accounts.selectWorkspace(binding(context), workspace.id, Date.now()) };
}
async function waitForLock(count = 1) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const [{ waiting }] = await admin`select count(*)::int as waiting from pg_stat_activity where application_name=${applicationName} and wait_event_type='Lock'`;
    if (waiting >= count) return; await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Expected real PostgreSQL lock contention was not observed.');
}

test('additive session migration leaves all legacy rows unclaimed and old user scaffolding inert', async () => {
  const [old] = await client`select * from floor_plans where id=1`;
  assert.deepEqual(old, { id: 1, name: 'Unowned', rooms: [{ metadata: { keep: true } }], created_at: 'old', updated_at: 'old', workspace_id: null });
  assert.equal((await client`select password from users`)[0].password, 'preserved');
  assert.equal((await client`select count(*)::int as n from application_principals`)[0].n, 0);
  assert.equal((await client`select count(*)::int as n from workspaces`)[0].n, 0);
  await client`insert into mfp_sessions(sid,sess,expire) values('synthetic-opaque-sid',${JSON.stringify({ cookie: {}, browserId: randomUUID() })}::json,now()+interval '1 minute')`;
  assert.equal((await client`select sess from mfp_sessions where sid='synthetic-opaque-sid'`)[0].sess.cookie !== undefined, true);
});
test('anonymous state is repeat-safe without overwriting an existing or revoked browser context', async () => {
  const c = await anonymous(); assert.deepEqual(await accounts.createAnonymousContext(c.browserId, c.sessionIdHash, Date.now()), c);
  assert.equal(c.principalId, null); assert.equal(c.absoluteExpiresAt - c.lastSeenAt, ANONYMOUS_SESSION_MS);
  await assert.rejects(accounts.createAnonymousContext(c.browserId, hash(), Date.now()), errorCode('STALE_CONTEXT'));
  await accounts.logout(binding(c), Date.now());
  await assert.rejects(accounts.createAnonymousContext(c.browserId, c.sessionIdHash, Date.now()), errorCode('SESSION_REVOKED'));
  assert.equal(await accounts.getContext(c.browserId, c.sessionIdHash, Date.now(), { touch: true }), null);
});
test('durable login state is one-use and exact-browser bound across repository instances', async () => {
  const c = await anonymous(), attempt = await start(c), other = await anonymous();
  const second = new AccountStorage(() => db);
  await assert.rejects(second.consumeLogin(other.browserId, other.sessionIdHash, attempt.stateHash, Date.now()), errorCode('STALE_CONTEXT'));
  const results = await Promise.allSettled([accounts.consumeLogin(c.browserId, c.sessionIdHash, attempt.stateHash, Date.now()), second.consumeLogin(c.browserId, c.sessionIdHash, attempt.stateHash, Date.now())]);
  assert.equal(results.filter(v => v.status === 'fulfilled').length, 1); assert.equal(results.filter(v => v.status === 'rejected').length, 1);
  const signed = await second.finishLogin(attempt, { issuer: 'https://synthetic.example', subject: randomUUID() }, hash(), Date.now());
  assert.equal(signed.status, 'authenticated'); assert.equal(signed.selectedWorkspaceId, null);
  assert.notEqual(signed.sessionIdHash, c.sessionIdHash); assert.notEqual(signed.contextToken, attempt.binding.contextToken);
  assert.equal(await accounts.getContext(c.browserId, c.sessionIdHash, Date.now()), null);
  const [stored] = await db.select().from(schema.loginTransactions).where(eq(schema.loginTransactions.stateHash, attempt.stateHash));
  assert.equal(stored.nonce, null); assert.equal(stored.codeVerifier, null); assert.ok(stored.completedAt);
  await assert.rejects(second.finishLogin(attempt, { issuer: 'https://synthetic.example', subject: randomUUID() }, hash(), Date.now()), errorCode('STALE_CONTEXT'));
});
test('a newer login invalidates older attempts and stale cancellation cannot cancel the newer one', async () => {
  const c = await anonymous(), old = await start(c);
  const current = (await accounts.getContext(c.browserId, c.sessionIdHash, Date.now()))!;
  const latest = await start(current); await accounts.cancelLogin(old, Date.now());
  await assert.rejects(accounts.consumeLogin(c.browserId, c.sessionIdHash, old.stateHash, Date.now()), errorCode('STALE_CONTEXT'));
  const consumed = await accounts.consumeLogin(c.browserId, c.sessionIdHash, latest.stateHash, Date.now());
  assert.equal(consumed.nonce, latest.nonce); assert.equal(consumed.binding.contextToken, latest.binding.contextToken);
});
test('logout or a newer initiation during token exchange prevents the delayed callback from authenticating', async () => {
  for (const change of ['logout', 'new-login']) {
    const c = await anonymous(), attempt = await start(c);
    await accounts.consumeLogin(c.browserId, c.sessionIdHash, attempt.stateHash, Date.now());
    const current = (await accounts.getContext(c.browserId, c.sessionIdHash, Date.now()))!;
    if (change === 'logout') await accounts.logout(binding(current), Date.now()); else await start(current);
    await assert.rejects(accounts.finishLogin(attempt, { issuer: 'https://late.example', subject: randomUUID() }, hash(), Date.now()), errorCode('STALE_CONTEXT'));
  }
});
test('login cancellation retains the previous identity and selected workspace without restoring stale tokens', async () => {
  const f = await withWorkspace(), attempt = await start(f.context);
  await accounts.consumeLogin(f.context.browserId, f.context.sessionIdHash, attempt.stateHash, Date.now());
  await accounts.cancelLogin(attempt, Date.now());
  const after = (await accounts.getContext(f.context.browserId, f.context.sessionIdHash, Date.now()))!;
  assert.equal(after.principalId, f.context.principalId); assert.equal(after.selectedWorkspaceId, f.workspace.id);
  assert.notEqual(after.contextToken, f.context.contextToken); assert.notEqual(after.contextToken, attempt.binding.contextToken);
  await assert.rejects(accounts.finishLogin(attempt, { issuer: 'https://other.example', subject: randomUUID() }, hash(), Date.now()), errorCode('STALE_CONTEXT'));
});
test('expired/unsafe login attempts fail closed and initiating repeatedly is bounded', async () => {
  let c = await anonymous(); const now = Date.now();
  for (const returnPath of ['//outside.example', 'https://outside.example', '/physical-draft?secret=1']) {
    await assert.rejects(accounts.beginLogin(binding(c), fields(now, returnPath), now), errorCode('INVALID_REQUEST'));
  }
  await assert.rejects(accounts.beginLogin(binding(c), { ...fields(now), expiresAt: now + LOGIN_TRANSACTION_MS + 1 }, now), errorCode('INVALID_REQUEST'));
  const attempt = await start(c, now);
  await assert.rejects(accounts.consumeLogin(c.browserId, c.sessionIdHash, attempt.stateHash, now + LOGIN_TRANSACTION_MS), errorCode('STALE_CONTEXT'));
  for (let i = 1; i < 10; i++) { c = (await accounts.getContext(c.browserId, c.sessionIdHash, now))!; await start(c, now); }
  c = (await accounts.getContext(c.browserId, c.sessionIdHash, now))!;
  await assert.rejects(start(c, now), errorCode('RATE_LIMIT'));
});
test('issuer plus subject provisioning is concurrent/repeat-safe without email merge or membership creation', async () => {
  const subject = randomUUID(), exact = { issuer: 'https://one.example', subject };
  const principals = await Promise.all(Array.from({ length: 6 }, () => accounts.provisionVerifiedPrincipal(exact)));
  assert.equal(new Set(principals.map(p => p.id)).size, 1);
  const other = await accounts.provisionVerifiedPrincipal({ issuer: 'https://two.example', subject }); assert.notEqual(other.id, principals[0].id);
  assert.deepEqual(await accounts.listWorkspaces(exact), []);
  assert.equal((await db.select().from(schema.workspaceMemberships).where(eq(schema.workspaceMemberships.principalId, principals[0].id))).length, 0);
  await assert.rejects(accounts.provisionVerifiedPrincipal({ ...exact, email: 'same@example.test' } as any), errorCode('INVALID_REQUEST'));
});
test('revoked identities and principals never re-provision or resolve an existing session', async () => {
  for (const target of ['identity', 'principal']) {
    const c = await signIn();
    if (target === 'identity') await db.update(schema.externalIdentities).set({ status: 'revoked' }).where(eq(schema.externalIdentities.principalId, c.principalId!));
    else await db.update(schema.applicationPrincipals).set({ status: 'revoked' }).where(eq(schema.applicationPrincipals.id, c.principalId!));
    await assert.rejects(accounts.provisionVerifiedPrincipal({ issuer: c.issuer!, subject: c.subject! }), errorCode('IDENTITY_REVOKED'));
    assert.equal(await accounts.getContext(c.browserId, c.sessionIdHash, Date.now(), { touch: true }), null);
    await assert.rejects(accounts.listWorkspaces(identity(c)), errorCode('IDENTITY_REVOKED'));
  }
});
test('session touches are bounded; idle and absolute expiry cannot be extended or revived', async () => {
  const now = Date.now(), c = await signIn(randomUUID(), now);
  assert.deepEqual(await accounts.getContext(c.browserId, c.sessionIdHash, now + 20_000, { touch: true }), c);
  const touched = (await accounts.getContext(c.browserId, c.sessionIdHash, now + 60_000, { touch: true }))!;
  assert.equal(touched.idleExpiresAt, now + 60_000 + SESSION_IDLE_MS); assert.equal(touched.absoluteExpiresAt, now + SESSION_ABSOLUTE_MS);
  assert.equal(await accounts.getContext(c.browserId, c.sessionIdHash, touched.idleExpiresAt, { touch: true }), null);
  const c2 = await signIn(randomUUID(), now);
  await db.update(schema.browserContexts).set({ idleExpiresAt: new Date(now + SESSION_ABSOLUTE_MS) }).where(eq(schema.browserContexts.browserId, c2.browserId));
  assert.equal(await accounts.getContext(c2.browserId, c2.sessionIdHash, now + SESSION_ABSOLUTE_MS, { touch: true }), null);
});
test('workspace creation is atomic/idempotent and never implicitly selects or claims legacy records', async () => {
  const c = await signIn(), input = { name: '  Explicit only  ', idempotencyKey: randomUUID() };
  const values = await Promise.all(Array.from({ length: 5 }, () => accounts.createWorkspace(identity(c), input, Date.now())));
  assert.equal(new Set(values.map(v => v.id)).size, 1); assert.equal(values[0].name, 'Explicit only');
  assert.equal((await accounts.getContext(c.browserId, c.sessionIdHash, Date.now()))!.selectedWorkspaceId, null);
  assert.deepEqual(await accounts.listWorkspaces(identity(c)), [{ id: values[0].id, name: 'Explicit only', role: 'owner' }]);
  await assert.rejects(accounts.createWorkspace(identity(c), { ...input, name: 'Different' }, Date.now()), errorCode('IDEMPOTENCY_CONFLICT'));
  assert.equal((await client`select workspace_id from floor_plans where id=1`)[0].workspace_id, null);
});
test('workspace creation rate bound counts fresh receipts and never restores revoked memberships on retry', async () => {
  const c = await signIn(), first = { name: 'First', idempotencyKey: randomUUID() }, now = Date.now();
  const workspace = await accounts.createWorkspace(identity(c), first, now);
  for (let i = 1; i < 5; i++) await accounts.createWorkspace(identity(c), { name: 'Extra ' + i, idempotencyKey: randomUUID() }, now);
  assert.equal((await accounts.createWorkspace(identity(c), first, now)).id, workspace.id);
  await assert.rejects(accounts.createWorkspace(identity(c), { name: 'Too many', idempotencyKey: randomUUID() }, now), errorCode('RATE_LIMIT'));
  await db.update(schema.workspaceMemberships).set({ status: 'revoked' }).where(and(eq(schema.workspaceMemberships.workspaceId, workspace.id), eq(schema.workspaceMemberships.principalId, c.principalId!)));
  await assert.rejects(accounts.createWorkspace(identity(c), first, now), errorCode('NOT_FOUND'));
  assert.equal((await accounts.listWorkspaces(identity(c))).length, 4);
});
test('selection is explicit, role-aware, current and atomically rotates the workspace context', async () => {
  const c = await signIn(), w = await accounts.createWorkspace(identity(c), { name: 'Allowed', idempotencyKey: randomUUID() }, Date.now());
  const outsider = await signIn(); await assert.rejects(accounts.selectWorkspace(binding(outsider), w.id, Date.now()), errorCode('NOT_FOUND'));
  const selected = await accounts.selectWorkspace(binding(c), w.id, Date.now()); assert.notEqual(selected.contextToken, c.contextToken);
  await assert.rejects(accounts.selectWorkspace(binding(c), null, Date.now()), errorCode('STALE_CONTEXT'));
  await assert.rejects(accounts.createWorkspace(identity(selected), { name: 'While selected', idempotencyKey: randomUUID() }, Date.now()), errorCode('STALE_CONTEXT'));
  const saved = await plans.createFloorPlan(identity(selected), w.id, plan);
  await assert.rejects(plans.getFloorPlan(identity(c), w.id, saved.id), errorCode('STALE_CONTEXT'));
  await assert.rejects(plans.getFloorPlan(identity(selected), randomUUID(), saved.id), errorCode('STALE_CONTEXT'));
  const cleared = await accounts.selectWorkspace(binding(selected), null, Date.now());
  assert.equal(cleared.selectedWorkspaceId, null); await assert.rejects(plans.updateFloorPlan(identity(selected), w.id, saved.id, { name: 'Stale' }), errorCode('STALE_CONTEXT'));
});
test('the same cookie after another person signs in cannot reuse an old context or identity', async () => {
  const a = await withWorkspace(), attempt = await start(a.context); await accounts.consumeLogin(a.context.browserId, a.context.sessionIdHash, attempt.stateHash, Date.now());
  const b = await accounts.finishLogin(attempt, { issuer: a.context.issuer!, subject: randomUUID() }, hash(), Date.now());
  assert.notEqual(b.principalId, a.context.principalId); assert.equal(b.selectedWorkspaceId, null);
  await assert.rejects(plans.createFloorPlan(identity(a.context), a.workspace.id, plan), errorCode('STALE_CONTEXT'));
  await assert.rejects(accounts.logout(binding(a.context), Date.now()), errorCode('STALE_CONTEXT'));
  assert.equal((await accounts.getContext(b.browserId, b.sessionIdHash, Date.now()))!.principalId, b.principalId);
});
test('a revoked membership is excluded from listing and cannot be used by a formerly selected session', async () => {
  const f = await withWorkspace(); await db.update(schema.workspaceMemberships).set({ status: 'revoked' }).where(eq(schema.workspaceMemberships.workspaceId, f.workspace.id));
  assert.deepEqual(await accounts.listWorkspaces(identity(f.context)), []);
  await assert.rejects(plans.createFloorPlan(identity(f.context), f.workspace.id, plan), (e: unknown) => e instanceof AuthorizationError && e.status === 404);
  const cleared = await accounts.selectWorkspace(binding(f.context), null, Date.now()); assert.equal(cleared.selectedWorkspaceId, null); assert.notEqual(cleared.contextToken, f.context.contextToken);
});
test('a request queued behind logout rechecks the browser context inside its SQL transaction', async () => {
  const f = await withWorkspace(); let release!: () => void, locked!: () => void;
  const held = new Promise<void>(r => { release = r; }), ready = new Promise<void>(r => { locked = r; });
  const blocker = client.begin(async tx => {
    await tx`select browser_id from auth_browser_contexts where browser_id=${f.context.browserId} for update`;
    await tx`update auth_browser_contexts set context_token=${randomUUID()},status='revoked',issuer=null,subject=null,principal_id=null,selected_workspace_id=null,authenticated_at=null where browser_id=${f.context.browserId}`;
    locked(); await held;
  });
  await ready;
  const write = plans.createFloorPlan(identity(f.context), f.workspace.id, plan).then(value => ({ value }), error => ({ error }));
  try { await waitForLock(); } finally { release(); }
  await blocker; const result = await write; assert.ok('error' in result && errorCode('STALE_CONTEXT')(result.error));
  assert.equal((await db.select().from(schema.floorPlans).where(eq(schema.floorPlans.workspaceId, f.workspace.id))).length, 0);
});
test('a mutation already holding session authority commits before logout, which then blocks future mutations', async () => {
  const f = await withWorkspace(), advisory = Math.floor(Math.random() * 1_000_000_000);
  const lock = postgres(supplied, { max: 1, connection: { search_path: testSchema } });
  await client.unsafe(`create function account_hold_write() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(${advisory}); return new; end $$;
    create trigger account_hold_write before insert on floor_plans for each row execute function account_hold_write();`);
  await lock`select pg_advisory_lock(${advisory})`;
  const write = plans.createFloorPlan(identity(f.context), f.workspace.id, plan); let logout: Promise<void> | undefined;
  try { await waitForLock(); logout = accounts.logout(binding(f.context), Date.now()); await waitForLock(2); }
  finally { await lock`select pg_advisory_unlock(${advisory})`; await lock.end(); }
  await write; await logout;
  await assert.rejects(plans.createFloorPlan(identity(f.context), f.workspace.id, plan), errorCode('STALE_CONTEXT'));
  assert.equal((await db.select().from(schema.floorPlans).where(eq(schema.floorPlans.workspaceId, f.workspace.id))).length, 1);
  await client.unsafe('drop trigger account_hold_write on floor_plans; drop function account_hold_write();');
});
test('session context and lifecycle schema reject malformed bindings; storage failures do not authorize', async () => {
  const f = await withWorkspace();
  for (const sessionBinding of [{ ...binding(f.context), role: 'owner' }, { ...binding(f.context), sessionIdHash: 'raw-cookie' }, { ...binding(f.context), browserId: 'bad' }]) {
    await assert.rejects(plans.createFloorPlan({ ...identity(f.context), sessionBinding } as any, f.workspace.id, plan), (e: unknown) => e instanceof AuthorizationError && e.status === 404);
  }
  const failing = new AccountStorage(() => { throw new Error('synthetic unavailable'); });
  await assert.rejects(failing.getContext(f.context.browserId, f.context.sessionIdHash, Date.now()), /synthetic unavailable/);
  await assert.rejects(db.update(schema.browserContexts).set({ status: 'anonymous' }).where(eq(schema.browserContexts.browserId, f.context.browserId)), (e: any) => e.code === '23514');
});


test('stale callbacks cannot invoke destructive SID rotation for a newer pending login', async () => {
  const c = await anonymous(), old = await start(c); await accounts.consumeLogin(c.browserId, c.sessionIdHash, old.stateHash, Date.now());
  const pending = (await accounts.getContext(c.browserId, c.sessionIdHash, Date.now()))!, next = await start(pending);
  let rotations = 0;
  await assert.rejects(accounts.finishLogin(old, { issuer: 'https://stale-rotation.example', subject: randomUUID() }, async () => { rotations++; return hash(); }, Date.now()), errorCode('STALE_CONTEXT'));
  assert.equal(rotations, 0);
  await accounts.consumeLogin(c.browserId, c.sessionIdHash, next.stateHash, Date.now());
  const completed = await accounts.finishLogin(next, { issuer: 'https://current-rotation.example', subject: randomUUID() }, async () => { rotations++; return hash(); }, Date.now());
  assert.equal(rotations, 1); assert.equal(completed.status, 'authenticated');
});
test('SID rotation failure rolls back identity provisioning and context finalization', async () => {
  const c = await anonymous(), attempt = await start(c); await accounts.consumeLogin(c.browserId, c.sessionIdHash, attempt.stateHash, Date.now());
  const before = (await accounts.getContext(c.browserId, c.sessionIdHash, Date.now()))!;
  const verified = { issuer: 'https://failed-rotation.example', subject: randomUUID() };
  await assert.rejects(accounts.finishLogin(attempt, verified, async () => { throw new Error('synthetic session store failure'); }, Date.now()), /synthetic session store failure/);
  assert.deepEqual(await accounts.getContext(c.browserId, c.sessionIdHash, Date.now()), before);
  assert.equal((await db.select().from(schema.externalIdentities).where(and(eq(schema.externalIdentities.issuer, verified.issuer), eq(schema.externalIdentities.subject, verified.subject)))).length, 0);
  const [stored] = await db.select().from(schema.loginTransactions).where(eq(schema.loginTransactions.stateHash, attempt.stateHash));
  assert.ok(stored.consumedAt); assert.equal(stored.completedAt, null);
  await assert.rejects(accounts.finishLogin(attempt, verified, async () => c.sessionIdHash, Date.now()), errorCode('INVALID_REQUEST'));
  assert.deepEqual(await accounts.getContext(c.browserId, c.sessionIdHash, Date.now()), before);
});
