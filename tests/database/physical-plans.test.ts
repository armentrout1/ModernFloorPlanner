import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { readFileSync } from 'node:fs';
import { randomUUID, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq } from 'drizzle-orm';
import * as schema from '../../shared/schema';
import { PhysicalPlanStorage, PhysicalPlanStorageError } from '../../server/physicalPlanStorage';
import { DatabaseStorage } from '../../server/storage';
import { AccountStorage, AccountStorageError, LOGIN_TRANSACTION_MS, type BrowserContext } from '../../server/accountStorage';
import { AuthorizationError, type VerifiedIdentity } from '../../server/authorizationTypes';
import type { Database } from '../../server/db';
import { createDraft, addRoom, editField, commitField } from '../../client/src/features/physical-draft/state';
import { capturePhysicalSaveEnvelope, physicalSavePayloadHash, restorePhysicalSaveDraft } from '../../shared/persistence/physicalSave';
import { verifyQuantitySnapshot } from '../../shared/quantities/snapshot';
import { createLevelDraft } from '../../client/src/features/physical-draft/levelCommands';
import { upgradeExistingDraftToStairs } from '../../client/src/features/physical-draft/stairCommands';
import { upgradeExistingDraftToLayout } from '../../client/src/features/physical-draft/layoutCommands';
import { selectedSaveWork, richPhysicalSaveDraft } from '../fixtures/physicalSave';
import { canonicalJson } from '../../shared/quantities/canonicalJson';

// Explicit synthetic database only. Verify its live identity BEFORE any DDL.
const supplied = process.env.MFP_TEST_DATABASE_URL, directory = process.env.MFP_TEST_DATA_DIRECTORY;
assert.ok(supplied && directory, 'Set MFP_TEST_DATABASE_URL and MFP_TEST_DATA_DIRECTORY for the disposable physical persistence suite.');
const url = new URL(supplied);
assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
assert.ok(['127.0.0.1', '[::1]', '::1'].includes(url.hostname));
assert.match(url.pathname.slice(1), /^mfp_[a-z0-9_]+_test$/); assert.equal(decodeURIComponent(url.username), 'mfp_test'); assert.equal(url.search, '');
const normalize = (value: string) => resolve(value).replaceAll('\\', '/').toLowerCase();
const testSchema = 'mfp_physical_' + randomUUID().replaceAll('-', '');
const applicationName = 'mfp_physical_repository_' + randomUUID().slice(0, 8);
const admin = postgres(supplied, { max: 1, connect_timeout: 5, onnotice: () => {} });
let client: ReturnType<typeof postgres>, db: Database, repository: PhysicalPlanStorage, legacy: DatabaseStorage, accounts: AccountStorage, created = false;
const AT = '2026-09-10T12:00:00.000Z';
const error = (code: string) => (e: unknown) => e instanceof PhysicalPlanStorageError && e.code === code;
const denied = (status: 403 | 404) => (e: unknown) => e instanceof AuthorizationError && e.status === status;
function payload(name = 'SQL physical drawing', height = '8 ft') {
  let draft = addRoom(createLevelDraft(randomUUID(), 'level-main', name), 'room-1', 'Living room');
  for (const [field, text] of [['length', '12 ft'], ['width', '10 ft'], ['ceilingHeight', height]] as const)
    draft = commitField(editField(draft, 'room-1', field, text), 'room-1', field, AT);
  draft = upgradeExistingDraftToLayout(upgradeExistingDraftToStairs(draft, 'stair-source', AT), 'layout-source', AT);
  return capturePhysicalSaveEnvelope(selectedSaveWork(draft));
}
const amount = (saved: Awaited<ReturnType<PhysicalPlanStorage['create']>>, output: string) => {
  const found = saved.evaluation.snapshot.evaluation.calculation.outputs.find(item => item.output === output)!;
  const total = found.total ?? found.subtotal; return total?.net === undefined ? null : total.net / (304.8 * 304.8);
};
const near = (value: number | null, expected: number) => assert.ok(value !== null && Math.abs(value - expected) < 1e-8, `${value} expected ${expected}`);
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
    for (const name of ['0001_workspace_authorization.sql', '0002_oidc_sessions_accounts.sql', '0003_physical_plans.sql'])
      await setup.unsafe(readFileSync(new URL('../../migrations/' + name, import.meta.url), 'utf8'));
  } finally { await setup.end(); }
  db = drizzle(client, { schema }); repository = new PhysicalPlanStorage(() => db); legacy = new DatabaseStorage(() => db); accounts = new AccountStorage(() => db);
});
after(async () => { if (client) await client.end(); if (created) await admin.unsafe(`drop schema "${testSchema}" cascade`); await admin.end(); });
async function seed() {
  const actors: Record<string, { principalId: string; identity: VerifiedIdentity }> = {};
  for (const name of ['owner', 'editor', 'viewer', 'other']) {
    const [principal] = await db.insert(schema.applicationPrincipals).values({}).returning();
    const identity = { issuer: 'https://synthetic.example/issuer', subject: randomUUID() + ':' + name };
    await db.insert(schema.externalIdentities).values({ ...identity, principalId: principal.id }); actors[name] = { principalId: principal.id, identity };
  }
  const [a, b] = await db.insert(schema.workspaces).values([{ name: 'Physical A' }, { name: 'Physical B' }]).returning();
  await db.insert(schema.workspaceMemberships).values([
    { workspaceId: a.id, principalId: actors.owner.principalId, role: 'owner' },
    { workspaceId: a.id, principalId: actors.editor.principalId, role: 'editor' },
    { workspaceId: a.id, principalId: actors.viewer.principalId, role: 'viewer' },
    { workspaceId: b.id, principalId: actors.other.principalId, role: 'owner' },
  ]);
  return { ...actors, a, b };
}
async function counts(workspace: string) {
  const [plans] = await client`select count(*)::int as n from physical_plans where workspace_id=${workspace}`;
  const [revisions] = await client`select count(*)::int as n from physical_plan_revisions where workspace_id=${workspace}`;
  const [receipts] = await client`select count(*)::int as n from physical_save_receipts where workspace_id=${workspace}`;
  return [plans.n, revisions.n, receipts.n];
}
async function waitForLock(count = 1) {
  const until = Date.now() + 5000;
  while (Date.now() < until) {
    const [{ waiting }] = await admin`select count(*)::int as waiting from pg_stat_activity where application_name=${applicationName} and wait_event_type='Lock'`;
    if (waiting >= count) return; await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('Expected actual PostgreSQL lock contention was not observed.');
}
const hash = () => createHash('sha256').update(randomUUID()).digest('hex');
const binding = (c: BrowserContext) => ({ browserId: c.browserId, contextToken: c.contextToken, sessionIdHash: c.sessionIdHash });
const identity = (c: BrowserContext): VerifiedIdentity => ({ issuer: c.issuer!, subject: c.subject!, sessionBinding: binding(c) });
async function signedWorkspace() {
  const now = Date.now(), anonymous = await accounts.createAnonymousContext(randomUUID(), hash(), now);
  const attempt = await accounts.beginLogin(binding(anonymous), { stateHash: hash(), nonce: hash(), codeVerifier: hash(), returnPath: '/physical-draft', expiresAt: now + LOGIN_TRANSACTION_MS }, now);
  await accounts.consumeLogin(anonymous.browserId, anonymous.sessionIdHash, attempt.stateHash, now);
  const authenticated = await accounts.finishLogin(attempt, { issuer: 'https://synthetic.example', subject: randomUUID() }, hash(), now);
  const workspace = await accounts.createWorkspace(identity(authenticated), { name: 'Explicit SQL context', idempotencyKey: randomUUID() }, now);
  return { workspace, context: await accounts.selectWorkspace(binding(authenticated), workspace.id, now) };
}

test('additive physical migration leaves legacy ownership and old account tables unchanged', async () => {
  const [old] = await client`select * from floor_plans where id=1`;
  assert.deepEqual(old, { id: 1, name: 'Unowned', rooms: [{ metadata: { keep: true } }], created_at: 'old', updated_at: 'old', workspace_id: null });
  assert.equal((await client`select password from users`)[0].password, 'preserved');
  assert.equal((await client`select count(*)::int as n from physical_plans`)[0].n, 0);
});

test('create persists complete schema5 envelope and server-authored evaluated identity atomically', async () => {
  const f = await seed(), input = payload(), before = canonicalJson(input);
  const saved = await repository.create(f.editor.identity, f.a.id, input, randomUUID());
  assert.equal(saved.envelope.document.schemaVersion, 5); assert.equal(saved.envelope.document.id, null);
  assert.equal(saved.envelope.document.revisionId, null); assert.equal(saved.createdBy, f.editor.principalId); assert.equal(saved.workspaceId, f.a.id);
  assert.equal(saved.revisionNumber, 1); assert.equal(saved.payloadHash, await physicalSavePayloadHash(input));
  assert.equal(saved.evaluation.snapshot.instance.kind, 'evaluation'); assert.equal(saved.evaluation.planId, saved.planId);
  assert.equal(saved.evaluation.revisionId, saved.revisionId); assert.equal(saved.evaluation.snapshot.sourceDocument.id, saved.planId);
  assert.equal(saved.evaluation.snapshot.sourceDocument.revisionId, saved.revisionId);
  assert.equal(saved.evaluation.snapshot.instance.createdAt, saved.createdAt); assert.ok(Date.parse(saved.createdAt));
  assert.deepEqual(await counts(f.a.id), [1,1,1]); assert.equal(canonicalJson(input), before);
  assert.deepEqual(await repository.read(f.viewer.identity, f.a.id, saved.planId), saved);
  assert.ok((await verifyQuantitySnapshot(saved.evaluation.snapshot)).ok);
});

test('12x10x8 quantities and later 9ft revision preserve original geometry, totals and snapshot', async () => {
  const f = await seed(), first = await repository.create(f.owner.identity, f.a.id, payload(), randomUUID());
  near(amount(first, 'floor-area'), 120); near(amount(first, 'ceiling-area'), 120); near(amount(first, 'gross-wall-area'), 352);
  const draft = restorePhysicalSaveDraft(first.envelope, 'fresh-local');
  const changed = capturePhysicalSaveEnvelope(commitField(editField(draft, 'room-1', 'ceilingHeight', '9 ft'), 'room-1', 'ceilingHeight', AT));
  const second = await repository.append(f.editor.identity, f.a.id, first.planId, changed, { idempotencyKey: randomUUID(), ifMatch: first.etag });
  near(amount(second, 'floor-area'), 120); near(amount(second, 'ceiling-area'), 120); near(amount(second, 'gross-wall-area'), 396);
  assert.notEqual(first.etag, second.etag); assert.equal(second.revisionNumber, 2);
  assert.deepEqual(await repository.readRevision(f.viewer.identity, f.a.id, first.planId, first.revisionId), first);
  assert.deepEqual(await repository.read(f.viewer.identity, f.a.id, first.planId), second);
});

test('a fresh repository connection retrieves committed plans and revisions without local cache', async () => {
  const f = await seed(), saved = await repository.create(f.owner.identity, f.a.id, payload(), randomUUID());
  const fresh = postgres(supplied!, { max: 1, connection: { search_path: testSchema }, onnotice: () => {} });
  try { const reopened = new PhysicalPlanStorage(() => drizzle(fresh, { schema })); assert.deepEqual(await reopened.read(f.owner.identity, f.a.id, saved.planId), saved); }
  finally { await fresh.end(); }
});

test('two different writes against one base serialize: one succeeds and one conflicts with no partial row', async () => {
  const f = await seed(), first = await repository.create(f.owner.identity, f.a.id, payload(), randomUUID());
  const results = await Promise.allSettled(['Candidate A', 'Candidate B'].map(name => repository.append(f.editor.identity, f.a.id, first.planId, payload(name), { idempotencyKey: randomUUID(), ifMatch: first.etag })));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const rejected = results.find(r => r.status === 'rejected') as PromiseRejectedResult; assert.ok(error('REVISION_CONFLICT')(rejected.reason));
  assert.deepEqual(await counts(f.a.id), [1,2,2]);
  assert.deepEqual(await repository.readRevision(f.owner.identity, f.a.id, first.planId, first.revisionId), first);
});

test('concurrent identical create keys and lost-response retries return exactly one committed result', async () => {
  const f = await seed(), key = randomUUID(), input = payload();
  const results = await Promise.all(Array.from({ length: 6 }, () => repository.create(f.owner.identity, f.a.id, input, key)));
  assert.equal(new Set(results.map(r => r.revisionId)).size, 1); assert.deepEqual(await counts(f.a.id), [1,1,1]);
  assert.deepEqual(await repository.create(f.owner.identity, f.a.id, input, key), results[0]);
});

test('UUID case variants serialize against the same scoped key and append resource identity', async () => {
  const f = await seed(), key = randomUUID(), input = payload();
  const [a,b] = await Promise.all([repository.create(f.owner.identity, f.a.id, input, key), repository.create(f.owner.identity, f.a.id.toUpperCase(), input, key.toUpperCase())]);
  assert.deepEqual(a,b); assert.deepEqual(await counts(f.a.id), [1,1,1]);
  const next = await repository.append(f.owner.identity, f.a.id, a.planId.toUpperCase(), payload('Case-safe append'), { idempotencyKey: randomUUID().toUpperCase(), ifMatch: a.etag });
  assert.equal(next.revisionNumber, 2);
});

test('concurrent identical append keys replay the original outcome even after newer revisions exist', async () => {
  const f = await seed(), first = await repository.create(f.owner.identity, f.a.id, payload(), randomUUID()), key = randomUUID(), input = payload('Second');
  const results = await Promise.all(Array.from({ length: 5 }, () => repository.append(f.editor.identity, f.a.id, first.planId, input, { idempotencyKey: key, ifMatch: first.etag })));
  assert.equal(new Set(results.map(r => r.revisionId)).size, 1);
  const second = results[0]; await repository.append(f.owner.identity, f.a.id, first.planId, payload('Third'), { idempotencyKey: randomUUID(), ifMatch: second.etag });
  assert.deepEqual(await repository.append(f.editor.identity, f.a.id, first.planId, input, { idempotencyKey: key, ifMatch: first.etag }), second);
  assert.deepEqual(await counts(f.a.id), [1,3,3]);
});

test('full-content idempotency includes names and expected base, not just calculation geometry', async () => {
  const f = await seed(), key = randomUUID(), input = payload(), first = await repository.create(f.owner.identity, f.a.id, input, key);
  const changed = structuredClone(input); changed.document.name = 'Name-only change';
  await assert.rejects(repository.create(f.owner.identity, f.a.id, changed, key), error('IDEMPOTENCY_CONFLICT'));
  const appendKey = randomUUID(), second = await repository.append(f.owner.identity, f.a.id, first.planId, changed, { idempotencyKey: appendKey, ifMatch: first.etag });
  await assert.rejects(repository.append(f.owner.identity, f.a.id, first.planId, changed, { idempotencyKey: appendKey, ifMatch: second.etag }), error('IDEMPOTENCY_CONFLICT'));
  assert.deepEqual(await counts(f.a.id), [1,2,2]);
});

test('same key is independently scoped to principal and workspace', async () => {
  const f = await seed(), key = randomUUID(), input = payload();
  const saved = await Promise.all([repository.create(f.owner.identity, f.a.id, input, key), repository.create(f.editor.identity, f.a.id, input, key), repository.create(f.other.identity, f.b.id, input, key)]);
  assert.equal(new Set(saved.map(r => r.planId)).size, 3); assert.deepEqual(await counts(f.a.id), [2,2,2]); assert.deepEqual(await counts(f.b.id), [1,1,1]);
});

test('foreign IDs never expose list, current, immutable revision or mutation content', async () => {
  const f = await seed(), foreign = await repository.create(f.other.identity, f.b.id, payload('Secret B'), randomUUID());
  assert.deepEqual((await repository.list(f.owner.identity, f.a.id)).plans, []);
  for (const workspace of [f.a.id, f.b.id]) {
    await assert.rejects(repository.read(f.owner.identity, workspace, foreign.planId), denied(404));
    await assert.rejects(repository.readRevision(f.owner.identity, workspace, foreign.planId, foreign.revisionId), denied(404));
    await assert.rejects(repository.append(f.owner.identity, workspace, foreign.planId, payload(), { idempotencyKey: randomUUID(), ifMatch: foreign.etag }), denied(404));
  }
  await assert.rejects(repository.list(f.owner.identity, f.b.id), denied(404));
  assert.deepEqual(await repository.read(f.other.identity, f.b.id, foreign.planId), foreign);
});

test('viewer cannot create or append and revoked successful actor cannot replay a receipt', async () => {
  const f = await seed(), key = randomUUID(), input = payload(), first = await repository.create(f.editor.identity, f.a.id, input, key);
  await assert.rejects(repository.create(f.viewer.identity, f.a.id, input, randomUUID()), denied(403));
  await assert.rejects(repository.append(f.viewer.identity, f.a.id, first.planId, input, { idempotencyKey: randomUUID(), ifMatch: first.etag }), denied(403));
  assert.deepEqual(await repository.read(f.viewer.identity, f.a.id, first.planId), first);
  await legacy.updateMembership(f.owner.identity, f.a.id, f.editor.principalId, { status: 'revoked' });
  await assert.rejects(repository.create(f.editor.identity, f.a.id, input, key), denied(404)); assert.deepEqual(await counts(f.a.id), [1,1,1]);
});

test('missing If-Match, wildcard, weak/multiple ETags and stale versions never create revisions', async () => {
  const f = await seed(), first = await repository.create(f.owner.identity, f.a.id, payload(), randomUUID());
  await assert.rejects(repository.append(f.owner.identity, f.a.id, first.planId, payload(), { idempotencyKey: randomUUID(), ifMatch: undefined }), error('PRECONDITION_REQUIRED'));
  for (const ifMatch of ['*', 'W/' + first.etag, first.etag + ', ' + first.etag, ''])
    await assert.rejects(repository.append(f.owner.identity, f.a.id, first.planId, payload(), { idempotencyKey: randomUUID(), ifMatch }), error('INVALID_REQUEST'));
  await assert.rejects(repository.append(f.owner.identity, f.a.id, first.planId, payload(), { idempotencyKey: randomUUID(), ifMatch: `"mfp-physical-${randomUUID()}"` }), error('REVISION_CONFLICT'));
  assert.deepEqual(await counts(f.a.id), [1,1,1]);
});

test('supported unknowns save as incomplete and unsupported/malformed references fail without mutation', async () => {
  const f = await seed(), unknown = capturePhysicalSaveEnvelope(addRoom(createDraft('unknown'), 'room'));
  const saved = await repository.create(f.owner.identity, f.a.id, unknown, randomUUID());
  assert.equal(saved.envelope.document.rooms[0].ceilingHeight.state, 'unknown'); assert.equal(saved.evaluation.snapshot.instance.kind, 'evaluation');
  assert.notEqual(saved.evaluation.snapshot.evaluation.calculation.status, 'complete');
  for (const mutate of [(p:any)=>p.version='future', (p:any)=>p.document.schemaVersion=99,
    (p:any)=>p.document.id=randomUUID(), (p:any)=>p.workspaceId=f.b.id, (p:any)=>p.evaluation={confirmed:true},
    (p:any)=>p.document.buildingLevels.roomLevels['room-1']='ghost', (p:any)=>p.document.name='x'.repeat(4*1024*1024)]) {
    const input = payload(); mutate(input);
    await assert.rejects(repository.create(f.owner.identity, f.a.id, input, randomUUID()), error('INVALID_DOCUMENT'));
  }
  assert.deepEqual(await counts(f.a.id), [1,1,1]);
});

test('bounded keyset pagination lists only workspace summaries once and rejects unbounded requests', async () => {
  const f = await seed(); for (let i=0;i<5;i++) await repository.create(f.owner.identity, f.a.id, payload('Plan '+i), randomUUID());
  let cursor: string | undefined, ids: string[] = [];
  do { const page = await repository.list(f.viewer.identity, f.a.id, { limit: 2, cursor }); ids.push(...page.plans.map(p=>p.planId)); cursor=page.nextCursor??undefined; for(const plan of page.plans)assert.equal(Object.hasOwn(plan,'envelope'),false); } while(cursor);
  assert.equal(ids.length,5); assert.equal(new Set(ids).size,5);
  for(const limit of [0,51,1.5]) await assert.rejects(repository.list(f.owner.identity,f.a.id,{limit}),error('INVALID_REQUEST'));
});

test('SQL foreign keys reject dangling pointers and cross-workspace plan/revision relationships', async () => {
  const f = await seed(), a = await repository.create(f.owner.identity,f.a.id,payload(),randomUUID()), b = await repository.create(f.other.identity,f.b.id,payload(),randomUUID());
  const violation = (e:any)=>e.code==='23503';
  await assert.rejects(client.begin(async tx => { await tx`update physical_plans set current_revision_id=${b.revisionId} where id=${a.planId}`; }),violation);
  await assert.rejects(client.begin(async tx => { await tx`update physical_plans set current_revision_id=${randomUUID()} where id=${a.planId}`; }),violation);
  await assert.rejects(client`insert into physical_plan_revisions(id,workspace_id,plan_id,revision_number,name,envelope,evaluation,payload_hash,created_by)
    values(${randomUUID()},${f.b.id},${a.planId},9,'bad','{}','{}',${'a'.repeat(64)},${f.other.principalId})`,violation);
  assert.deepEqual(await repository.read(f.owner.identity,f.a.id,a.planId),a);
});

test('saved revision contents and accepted receipts are append-only at the SQL boundary', async () => {
  const f=await seed(),saved=await repository.create(f.owner.identity,f.a.id,payload(),randomUUID());
  const immutable=(e:any)=>e.code==='55000';
  await assert.rejects(client`update physical_plan_revisions set name='rewritten' where id=${saved.revisionId}`,immutable);
  await assert.rejects(client`delete from physical_plan_revisions where id=${saved.revisionId}`,immutable);
  await assert.rejects(client`update physical_save_receipts set request_hash=${'b'.repeat(64)} where plan_id=${saved.planId}`,immutable);
  await assert.rejects(client`delete from physical_save_receipts where plan_id=${saved.planId}`,immutable);
  assert.deepEqual(await repository.read(f.owner.identity,f.a.id,saved.planId),saved);
});

test('failure after revision insertion rolls back plan, revision, receipt and current pointer together', async () => {
  const f=await seed();
  await client.unsafe(`create function reject_physical_receipt() returns trigger language plpgsql as $$ begin raise exception 'Synthetic receipt failure'; end $$;
    create trigger reject_physical_receipt before insert on physical_save_receipts for each row when (new.workspace_id='${f.a.id}'::uuid) execute function reject_physical_receipt();`);
  try { await assert.rejects(repository.create(f.owner.identity,f.a.id,payload(),randomUUID()),/Synthetic receipt failure/); assert.deepEqual(await counts(f.a.id),[0,0,0]); }
  finally { await client.unsafe('drop trigger reject_physical_receipt on physical_save_receipts; drop function reject_physical_receipt();'); }
  const first=await repository.create(f.owner.identity,f.a.id,payload(),randomUUID());
  await client.unsafe(`create function reject_physical_receipt() returns trigger language plpgsql as $$ begin raise exception 'Synthetic receipt failure'; end $$;
    create trigger reject_physical_receipt before insert on physical_save_receipts for each row when (new.workspace_id='${f.a.id}'::uuid) execute function reject_physical_receipt();`);
  try { await assert.rejects(repository.append(f.owner.identity,f.a.id,first.planId,payload('later'),{idempotencyKey:randomUUID(),ifMatch:first.etag}),/Synthetic receipt failure/); assert.deepEqual(await counts(f.a.id),[1,1,1]); assert.deepEqual(await repository.read(f.owner.identity,f.a.id,first.planId),first); }
  finally { await client.unsafe('drop trigger reject_physical_receipt on physical_save_receipts; drop function reject_physical_receipt();'); }
});

test('membership change ahead of a waiting save is checked inside its eventual SQL transaction', async () => {
  const f=await seed(); let release!:()=>void, ready!:()=>void;
  const held=new Promise<void>(r=>release=r),locked=new Promise<void>(r=>ready=r);
  const blocker=client.begin(async tx=>{await tx`select id from workspaces where id=${f.a.id} for update`;await tx`update workspace_memberships set role='viewer' where workspace_id=${f.a.id} and principal_id=${f.editor.principalId}`;ready();await held;});
  await locked; const save=repository.create(f.editor.identity,f.a.id,payload(),randomUUID()).then(value=>({value}),error=>({error}));
  try{await waitForLock();}finally{release();} await blocker;const result=await save;
  assert.ok('error'in result&&denied(403)(result.error)); assert.deepEqual(await counts(f.a.id),[0,0,0]);
});

test('logout and workspace switching invalidate the original session before receipt replay', async () => {
  const f=await signedWorkspace(),key=randomUUID(),input=payload(); await repository.create(identity(f.context),f.workspace.id,input,key);
  await accounts.selectWorkspace(binding(f.context),null,Date.now());
  await assert.rejects(repository.create(identity(f.context),f.workspace.id,input,key),(e:unknown)=>e instanceof AccountStorageError&&e.code==='STALE_CONTEXT');
  const latest=(await accounts.getContext(f.context.browserId,f.context.sessionIdHash,Date.now()))!;
  const selected=await accounts.selectWorkspace(binding(latest),f.workspace.id,Date.now());await accounts.logout(binding(selected),Date.now());
  await assert.rejects(repository.read(identity(selected),f.workspace.id,(await client`select id from physical_plans where workspace_id=${f.workspace.id}`)[0].id),(e:unknown)=>e instanceof AccountStorageError);
  assert.deepEqual(await counts(f.workspace.id),[1,1,1]);
});

test('in-flight save holds session authorization until commit, then workspace switch invalidates subsequent use', async () => {
  const f=await signedWorkspace(),advisory=Math.floor(Math.random()*1_000_000_000),lock=postgres(supplied!,{max:1,connection:{search_path:testSchema}});
  await client.unsafe(`create function hold_physical_write() returns trigger language plpgsql as $$ begin perform pg_advisory_xact_lock(${advisory}); return new; end $$;
    create trigger hold_physical_write before insert on physical_plan_revisions for each row when (new.workspace_id='${f.workspace.id}'::uuid) execute function hold_physical_write();`);
  await lock`select pg_advisory_lock(${advisory})`;const save=repository.create(identity(f.context),f.workspace.id,payload(),randomUUID());
  let change:Promise<unknown>|undefined;
  try {await waitForLock();change=accounts.selectWorkspace(binding(f.context),null,Date.now());await waitForLock(2);}
  finally{await lock`select pg_advisory_unlock(${advisory})`;await lock.end();}
  const saved=await save;await change;assert.equal(saved.revisionNumber,1);
  await assert.rejects(repository.read(identity(f.context),f.workspace.id,saved.planId),(e:unknown)=>e instanceof AccountStorageError&&e.code==='STALE_CONTEXT');
  await client.unsafe('drop trigger hold_physical_write on physical_plan_revisions; drop function hold_physical_write();');
});


test('rich levels/stairs/landings/holes/uses/zones/cabinets/opening evidence roundtrips with unchanged252 takeoff', async () => {
  const f=await seed(),input=capturePhysicalSaveEnvelope(richPhysicalSaveDraft()),saved=await repository.create(f.owner.identity,f.a.id,input,randomUUID());
  const reopened=await repository.readRevision(f.viewer.identity,f.a.id,saved.planId,saved.revisionId);
  assert.equal(canonicalJson(reopened.envelope),canonicalJson(input)); assert.equal(reopened.payloadHash,await physicalSavePayloadHash(input));
  assert.deepEqual(reopened.evaluation,saved.evaluation);assert.ok((await verifyQuantitySnapshot(reopened.evaluation.snapshot)).ok);
  const floor=reopened.evaluation.snapshot.evaluation.calculation.outputs.find(o=>o.output==='floor-area')!;
  const total=floor.total??floor.subtotal;assert.ok(total);near(total.net/(304.8*304.8),252);near(total.allowance/(304.8*304.8),25.2);near(total.adjusted/(304.8*304.8),277.2);
  const restored=restorePhysicalSaveDraft(reopened.envelope,'independent-loaded-draft');assert.equal(canonicalJson(capturePhysicalSaveEnvelope(restored)),canonicalJson(input));
});
