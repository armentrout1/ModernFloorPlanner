import assert from 'node:assert/strict';
import { beforeEach, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import pg from 'pg';
const { Pool } = pg;
import { readDatabaseConfiguration, toPostgresOptions, toSessionPoolOptions } from '../../server/databaseConfiguration';
import { PhysicalHttpClient } from '../persistence/http-client';
import { configureIssuer } from '../accounts/control';
import { basicPhysicalSaveDraft } from '../fixtures/physicalSave';
import { capturePhysicalSaveEnvelope } from '../../shared/persistence/physicalSave';

assert.equal(process.env.MFP_ACCOUNTS_APP_ORIGIN, 'https://127.0.0.2:54450');
const url = process.env.DATABASE_URL!;
assert.equal(new URL(url).hostname, 'localhost'); assert.equal(new URL(url).port, '55490'); assert.equal(new URL(url).pathname, '/mfp_transport_test');
const config = (value = url, env = process.env) => readDatabaseConfiguration(value, env);
const sql = postgres({ ...toPostgresOptions(config(process.env.MFP_TRANSPORT_ADMIN_URL!)), onnotice: () => {} });
after(async () => sql.end());
beforeEach(async () => configureIssuer({ subjectPrefix: 'tls-' + randomUUID() }));
async function restartApp() {
  assert.ok(process.send, 'The owning fixture runner must perform restarts');
  await new Promise<void>((done, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { process.off('message', receive); reject(new Error('Isolated app restart timed out')); }, 30_000);
    const receive = (message: any) => { if (message?.type !== 'MFP_TRANSPORT_RESTARTED' || message.id !== id) return;
      clearTimeout(timer); process.off('message', receive); message.ok ? done() : reject(new Error('Isolated app restart failed')); };
    process.on('message', receive); process.send!({ type: 'MFP_TRANSPORT_RESTART', id });
  });
}
async function member(account = 'account-a') {
  const client = new PhysicalHttpClient(); const identity = await client.login(account);
  const workspace = await client.create('Synthetic TLS transport'); await client.select(workspace.id); return { client, identity, workspace };
}

test('both production driver adapters connect with verified CA/hostname through direct TLS and actual transaction pooler', async () => {
  for (const value of [process.env.MFP_TRANSPORT_DIRECT_URL!, url]) {
    const settings = config(value); const application = postgres(toPostgresOptions(settings)); const sessions = new Pool(toSessionPoolOptions(settings));
    try {
      const [row] = await application`select current_user as username,ssl from pg_stat_ssl where pid=pg_backend_pid()`;
      assert.equal(row.username, 'mfp_runtime'); assert.equal(row.ssl, true);
      const connection = await sessions.connect();
      try {
        assert.equal((connection as any).connection.stream.encrypted, true, 'Session pool must use a real TLS socket');
        const { rows } = await connection.query('select current_user as username,ssl from pg_stat_ssl where pid=pg_backend_pid()');
        assert.equal(rows[0].username, 'mfp_runtime'); assert.equal(rows[0].ssl, true);
      } finally { connection.release(); }
    } finally { await application.end(); await sessions.end(); }
  }
});

test('wrong CA and wrong hostname fail both drivers without plaintext fallback, including sslmode=require', async () => {
  for (const value of [process.env.MFP_TRANSPORT_DIRECT_URL!, url]) for (const mode of ['verify-full', 'require']) {
    const strict = new URL(value); strict.searchParams.set('sslmode', mode);
    const wrongHost = new URL(strict); wrongHost.hostname = '127.0.0.1';
    for (const settings of [config(strict.href, { ...process.env, MFP_DATABASE_CA_CERT: process.env.MFP_TRANSPORT_WRONG_CA }), config(wrongHost.href)]) {
      const application = postgres(toPostgresOptions(settings)); const sessions = new Pool(toSessionPoolOptions(settings));
      try { await assert.rejects(() => application`select 1`); await assert.rejects(() => sessions.query('select 1')); }
      finally { await application.end({ timeout: 1 }); await sessions.end(); }
    }
  }
});

test('TLS-only PostgreSQL and pooler refuse explicit plaintext from either driver', async () => {
  for (const value of [process.env.MFP_TRANSPORT_DIRECT_URL!, url]) {
    const plain = new URL(value); plain.searchParams.set('sslmode', 'disable');
    const settings = config(plain.href, { ...process.env, MFP_DATABASE_CA_CERT: undefined });
    const application = postgres(toPostgresOptions(settings)); const sessions = new Pool(toSessionPoolOptions(settings));
    try { await assert.rejects(() => application`select 1`); await assert.rejects(() => sessions.query('select 1')); }
    finally { await application.end({ timeout: 1 }); await sessions.end(); }
  }
});

test('real PgBouncer transaction mode with named statements disabled accepts unnamed queries from both adapters', async () => {
  const admin = new Pool(toSessionPoolOptions(config(process.env.MFP_TRANSPORT_POOL_ADMIN_URL!)));
  const application = postgres(toPostgresOptions(config())); const sessions = new Pool(toSessionPoolOptions(config()));
  try {
    const { rows } = await admin.query('SHOW CONFIG'); const settings = new Map(rows.map(row => [row.key, row.value]));
    assert.equal(settings.get('pool_mode'), 'transaction'); assert.equal(settings.get('max_prepared_statements'), '0');
    assert.equal(settings.get('server_tls_sslmode'), 'verify-full'); assert.equal(settings.get('client_tls_sslmode'), 'require');
    await application.begin(async transaction => {
      for (let i = 0; i < 5; i++) assert.equal((await transaction`select ${i}::int as value`)[0].value, i);
      assert.equal((await transaction`select count(*)::int as count from pg_prepared_statements`)[0].count, 0);
    });
    const connection = await sessions.connect();
    try {
      await connection.query('BEGIN');
      for (let i = 0; i < 5; i++) assert.equal((await connection.query('select $1::int as value', [i])).rows[0].value, i);
      assert.equal((await connection.query('select count(*)::int as count from pg_prepared_statements')).rows[0].count, 0);
      await connection.query('COMMIT');
    } finally { connection.release(); }
  } finally { await admin.end(); await application.end(); await sessions.end(); }
});

test('transaction-scoped advisory locks are exclusive and released at commit across pooled driver clients', async () => {
  const application = postgres(toPostgresOptions(config())); const sessions = new Pool(toSessionPoolOptions(config()));
  const lock = 714251;
  try {
    await application.begin(async transaction => {
      assert.equal((await transaction`select pg_try_advisory_xact_lock(${lock}) as acquired`)[0].acquired, true);
      const connection = await sessions.connect();
      try { await connection.query('BEGIN'); assert.equal((await connection.query('select pg_try_advisory_xact_lock($1) as acquired', [lock])).rows[0].acquired, false); await connection.query('COMMIT'); }
      finally { connection.release(); }
    });
    const connection = await sessions.connect();
    try { await connection.query('BEGIN'); assert.equal((await connection.query('select pg_try_advisory_xact_lock($1) as acquired', [lock])).rows[0].acquired, true); await connection.query('COMMIT'); }
    finally { connection.release(); }
  } finally { await application.end(); await sessions.end(); }
});

test('normal OIDC/session/workspace and immutable save lifecycle work under restricted runtime role through pooler', async () => {
  const owner = await member(); const envelope = capturePhysicalSaveEnvelope(basicPhysicalSaveDraft()); const key = randomUUID();
  const created = await owner.client.request('/api/physical-plans', 'POST', envelope, { 'Idempotency-Key': key }); assert.equal(created.status, 201);
  const saved = await created.json(); assert.deepEqual(saved.envelope, envelope);
  const replay = await owner.client.request('/api/physical-plans', 'POST', envelope, { 'Idempotency-Key': key }); assert.equal(replay.status, 201); assert.deepEqual(await replay.json(), saved);
  let summary = (await (await owner.client.request('/api/physical-plans')).json()).plans[0];
  const changed = await owner.client.request(`/api/physical-plans/${saved.planId}/archive`, 'POST', { revisionId: saved.revisionId }, { 'Idempotency-Key': randomUUID(), 'If-Match': summary.lifecycleEtag });
  assert.equal(changed.status, 200); summary = (await changed.json()).plan; assert.ok(summary.archivedAt);
  const restored = await owner.client.request(`/api/physical-plans/${saved.planId}/restore`, 'POST', { revisionId: saved.revisionId }, { 'Idempotency-Key': randomUUID(), 'If-Match': summary.lifecycleEtag });
  assert.equal(restored.status, 200); assert.equal((await restored.json()).plan.archivedAt, null);
  const stranger = await member('account-b'); assert.equal((await stranger.client.request(`/api/physical-plans/${saved.planId}`)).status, 404);
  const before = await owner.client.status(); await restartApp();
  const after = await owner.client.status(); assert.equal(after.status, 'authenticated'); assert.equal(after.principal!.id, before.principal!.id);
  assert.deepEqual(await (await owner.client.request(`/api/physical-plans/${saved.planId}`)).json(), saved);
  const [role] = await sql`select rolsuper,rolbypassrls,rolcreaterole,rolcreatedb from pg_roles where rolname='mfp_runtime'`;
  assert.deepEqual(role, { rolsuper: false, rolbypassrls: false, rolcreaterole: false, rolcreatedb: false });
  const [count] = await sql`select count(*)::int as count from physical_plan_revisions where plan_id=${saved.planId}`; assert.equal(count.count, 1);
});
