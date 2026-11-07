import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import postgres from 'postgres';
import { createProviderFixture } from '../tests/database/provider-fixture.ts';
import { createDatabaseBackup, runPgTool } from './database-backup-lib.mjs';

const supplied = process.env.MFP_TEST_DATABASE_URL;
const directory = process.env.MFP_TEST_DATA_DIRECTORY;
assert.ok(supplied && directory, 'Verified disposable PostgreSQL configuration is required');
const rootUrl = new URL(supplied);
assert.ok(['postgres:', 'postgresql:'].includes(rootUrl.protocol));
assert.ok(['127.0.0.1', '[::1]', '::1'].includes(rootUrl.hostname));
assert.equal(decodeURIComponent(rootUrl.username), 'mfp_test');
assert.match(rootUrl.pathname.slice(1), /^mfp_[a-z0-9_]+_test$/);
assert.equal(rootUrl.search, '');

const normalized = value => resolve(value).replaceAll('\\', '/').toLowerCase();
const control = postgres(supplied, { max: 1, prepare: false, connect_timeout: 5, onnotice: () => {} });
const fixture = await createProviderFixture();
const scratch = await mkdtemp(join(tmpdir(), 'mfp-backup-rehearsal-'));
const restoreName = `mfp_backup_restore_${randomBytes(6).toString('hex')}_test`;
const restoreUrl = new URL(supplied);
restoreUrl.pathname = `/${restoreName}`;
let restoreClient;
let restoreRuntime;
let createdRestore = false;

async function fingerprint(client) {
  const [structure] = await client`
    select
      (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r') as tables,
      (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='i') as indexes,
      (select count(*)::int from pg_constraint c join pg_namespace n on n.oid=c.connamespace where n.nspname='public') as constraints,
      (select count(*)::int from pg_policies where schemaname='public') as policies,
      (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity and c.relforcerowsecurity) as forced_rls,
      (select count(*)::int from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal) as triggers`;
  const tables = await client`select tablename from pg_tables where schemaname='public' order by tablename`;
  const counts = {};
  for (const { tablename } of tables) {
    const [{ count }] = await client.unsafe(`select count(*)::int as count from public."${tablename}"`);
    counts[tablename] = count;
  }
  const tableSecurity = await client`select c.relname as table_name, pg_get_userbyid(c.relowner) as owner,
    c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
    has_table_privilege(${fixture.runtimeRole},c.oid,'SELECT') as runtime_select,
    has_table_privilege(${fixture.runtimeRole},c.oid,'INSERT') as runtime_insert,
    has_table_privilege(${fixture.runtimeRole},c.oid,'UPDATE') as runtime_update,
    has_table_privilege(${fixture.runtimeRole},c.oid,'DELETE') as runtime_delete
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' order by c.relname`;
  const indexes = await client`select indexname, indexdef from pg_indexes where schemaname='public' order by indexname`;
  const constraints = await client`select c.conname, r.relname as table_name, pg_get_constraintdef(c.oid, true) as definition
    from pg_constraint c join pg_namespace n on n.oid=c.connamespace left join pg_class r on r.oid=c.conrelid
    where n.nspname='public' order by r.relname,c.conname`;
  const policies = await client`select tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies where schemaname='public' order by tablename,policyname`;
  const triggers = await client`select c.relname as table_name,t.tgname,pg_get_triggerdef(t.oid,true) as definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname`;
  return { structure, counts, tableSecurity, indexes, constraints, policies, triggers };
}

try {
  const [actual] = await control`select current_database() as database, current_user as username,
    current_setting('data_directory') as directory, host(inet_server_addr()) as address`;
  assert.equal(actual.database, rootUrl.pathname.slice(1));
  assert.equal(actual.username, 'mfp_test');
  assert.ok(['127.0.0.1', '::1'].includes(actual.address));
  assert.equal(normalized(actual.directory), normalized(directory));

  const principalId = randomUUID(), workspaceId = randomUUID(), planId = randomUUID(), revisionId = randomUUID();
  await fixture.admin.begin(async tx => {
    await tx`insert into application_principals(id) values(${principalId})`;
    await tx`insert into external_identities(issuer,subject,principal_id) values('https://backup-rehearsal.invalid/auth/v1','backup-owner',${principalId})`;
    await tx`insert into workspaces(id,name) values(${workspaceId},'Backup rehearsal workspace')`;
    await tx`insert into workspace_memberships(workspace_id,principal_id,role) values(${workspaceId},${principalId},'owner')`;
    await tx`insert into physical_plans(id,workspace_id,current_revision_id,created_by) values(${planId},${workspaceId},${revisionId},${principalId})`;
    await tx`insert into physical_plan_revisions(id,workspace_id,plan_id,revision_number,name,envelope,evaluation,payload_hash,created_by)
      values(${revisionId},${workspaceId},${planId},1,'Backup sentinel',${tx.json({ document: { name: 'Backup sentinel' }, rooms: [] })},${tx.json({ verified: true })},${'a'.repeat(64)},${principalId})`;
    await tx`insert into physical_save_receipts(principal_id,workspace_id,operation,resource,idempotency_key,request_hash,plan_id,revision_id)
      values(${principalId},${workspaceId},'create','collection',${randomUUID()},${'b'.repeat(64)},${planId},${revisionId})`;
  });
  const sourceFingerprint = await fingerprint(fixture.admin);
  assert.equal(sourceFingerprint.structure.tables, 14);
  assert.equal(sourceFingerprint.structure.forced_rls, 14);

  const backup = await createDatabaseBackup({
    databaseUrl: fixture.adminUrl,
    outputDirectory: scratch,
    repositoryRoot: process.cwd(),
  });
  assert.ok(backup.bytes > 0);
  assert.equal((await control`select 1 from pg_database where datname=${restoreName}`).length, 0);
  await control.unsafe(`create database "${restoreName}" template template0`);
  createdRestore = true;
  await runPgTool('pg_restore', ['--exit-on-error', '--single-transaction', backup.backupPath], { databaseUrl: restoreUrl.toString() });

  restoreClient = postgres(restoreUrl.toString(), { max: 1, prepare: false, connect_timeout: 5, onnotice: () => {} });
  const restoredFingerprint = await fingerprint(restoreClient);
  assert.deepEqual(restoredFingerprint, sourceFingerprint);
  const [sentinel] = await restoreClient`select p.id, p.current_revision_id, r.name, r.envelope, r.evaluation
    from physical_plans p join physical_plan_revisions r on r.id=p.current_revision_id where p.id=${planId}`;
  assert.equal(sentinel.id, planId);
  assert.equal(sentinel.current_revision_id, revisionId);
  assert.equal(sentinel.name, 'Backup sentinel');
  assert.deepEqual(sentinel.envelope, { rooms: [], document: { name: 'Backup sentinel' } });
  assert.deepEqual(sentinel.evaluation, { verified: true });
  await assert.rejects(
    restoreClient`update physical_plan_revisions set name='tampered' where id=${revisionId}`,
    error => error?.code === '55000',
  );
  const runtimeUrl = new URL(fixture.runtimeUrl);
  runtimeUrl.pathname = `/${restoreName}`;
  restoreRuntime = postgres(runtimeUrl.toString(), { max: 1, prepare: false, connect_timeout: 5, onnotice: () => {} });
  assert.equal((await restoreRuntime`select current_user as username`)[0].username, fixture.loginRole);
  assert.equal((await restoreRuntime`select name from physical_plan_revisions where id=${revisionId}`)[0].name, 'Backup sentinel');
  await assert.rejects(restoreRuntime`select * from users`, error => error?.code === '42501');
  await assert.rejects(restoreRuntime`create table backup_escape(id int)`, error => error?.code === '42501');
  console.log(`Backup/restore rehearsal passed: ${sourceFingerprint.structure.tables} tables, ${sourceFingerprint.structure.forced_rls} forced-RLS tables, representative saved plan verified.`);
} finally {
  if (restoreRuntime) await restoreRuntime.end();
  if (restoreClient) await restoreClient.end();
  if (createdRestore) {
    const [current] = await control`select datdba::regrole::text as owner from pg_database where datname=${restoreName}`;
    assert.equal(current?.owner, 'mfp_test');
    await control.unsafe(`drop database "${restoreName}"`);
  }
  await fixture.cleanup();
  await control.end();
  await rm(scratch, { recursive: true, force: true });
}
