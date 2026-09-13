import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/postgres-js';
import connectPgSimple from 'connect-pg-simple';
import session from 'express-session';
import * as schema from '../../shared/schema';
import { AccountStorage, type BrowserContext } from '../../server/accountStorage';
import { DatabaseStorage } from '../../server/storage';
import { PhysicalPlanStorage } from '../../server/physicalPlanStorage';
import { capturePhysicalSaveEnvelope } from '../../shared/persistence/physicalSave';
import { basicPhysicalSaveDraft } from '../fixtures/physicalSave';
import { applyBootstrap, applyHardening, applyMigrations } from '../../database/setup.mjs';
import { createProviderFixture } from './provider-fixture';

let fixture: Awaited<ReturnType<typeof createProviderFixture>>;
let accounts: AccountStorage, legacy: DatabaseStorage, plans: PhysicalPlanStorage;
const tables=['users','floor_plans','application_principals','external_identities','workspaces','workspace_memberships','mfp_sessions',
  'auth_browser_contexts','oidc_login_transactions','workspace_creation_receipts','physical_plans','physical_plan_revisions','physical_save_receipts','physical_lifecycle_receipts'];
const sqlState = (code: string) => (error: any) => error?.code===code || error?.cause?.code===code;
before(async () => {
  fixture=await createProviderFixture();
  const database=drizzle(fixture.runtime,{schema});
  accounts=new AccountStorage(()=>database); legacy=new DatabaseStorage(()=>database); plans=new PhysicalPlanStorage(()=>database);
});
after(async () => { if(fixture) await fixture.cleanup(); });

async function member() {
  const browserId=randomUUID(), firstHash='a'.repeat(64), now=Date.now();
  const anonymous=await accounts.createAnonymousContext(browserId,firstHash,now);
  const binding=(row:BrowserContext)=>({browserId:row.browserId,sessionIdHash:row.sessionIdHash,contextToken:row.contextToken});
  const transaction=await accounts.beginLogin(binding(anonymous),{stateHash:randomUUID().replaceAll('-','').repeat(2),
    nonce:'n'.repeat(40),codeVerifier:'v'.repeat(43),returnPath:'/physical-draft',expiresAt:now+60_000},now);
  const consumed=await accounts.consumeLogin(browserId,firstHash,transaction.stateHash,now);
  const identity={issuer:'https://synthetic-provider.invalid',subject:randomUUID()};
  const signedIn=await accounts.finishLogin(consumed,identity,'b'.repeat(64),now);
  const workspace=await accounts.createWorkspace({...identity,sessionBinding:binding(signedIn)},{name:'Restricted SQL workspace',idempotencyKey:randomUUID()},now);
  const selected=await accounts.selectWorkspace(binding(signedIn),workspace.id,now);
  return {identity:{...identity,sessionBinding:binding(selected)},workspace,context:selected};
}

test('bootstrap creates the exact base then unchanged migrations yield fourteen forced-RLS tables with no seeded identities',async()=>{
  const rows=await fixture.admin`select relname,relrowsecurity,relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r' order by relname`;
  assert.deepEqual(rows.map(row=>row.relname),[...tables].sort());
  assert.ok(rows.every(row=>row.relrowsecurity&&row.relforcerowsecurity));
  assert.equal((await fixture.admin`select count(*)::int as count from application_principals`)[0].count,0);
  assert.equal((await fixture.admin`select count(*)::int as count from users`)[0].count,0);
  const [current]=await fixture.runtime`select current_user as name`;
  assert.equal(current.name,fixture.loginRole);
});

test('bootstrap refuses existing tables transactionally and preserves their contents',async()=>{
  await fixture.admin`insert into users(username,password) values('inert legacy','preserved field')`;
  await assert.rejects(applyBootstrap(fixture.admin,fixture),/Bootstrap requires an empty/);
  assert.equal((await fixture.admin`select password from users where username='inert legacy'`)[0].password,'preserved field');
  await assert.rejects(fixture.runtime`select * from users`,sqlState('42501'));
});

test('real restricted login completes account provisioning and FOR SHARE locks without permitting identity rewrites',async()=>{
  const {identity,workspace}=await member();
  assert.equal((await legacy.getWorkspace(identity,workspace.id)).id,workspace.id);
  await assert.rejects(fixture.runtime`update application_principals set status='revoked'`,sqlState('42501'));
  await assert.rejects(fixture.runtime`update external_identities set status='revoked'`,sqlState('42501'));
  await assert.rejects(fixture.runtime`update external_identities set subject='replacement'`,sqlState('42501'));
  assert.equal((await fixture.runtime`select status from external_identities where issuer=${identity.issuer} and subject=${identity.subject}`)[0].status,'active');
});

test('restricted legacy CRUD uses its one sequence and keeps null-owned historical sketches inaccessible',async()=>{
  await fixture.admin`insert into floor_plans(name,rooms,created_at,updated_at) values('Unowned legacy','[]','old','old')`;
  const {identity,workspace}=await member();
  const created=await legacy.createFloorPlan(identity,workspace.id,{name:'Legacy saved',rooms:[],createdAt:'2026-09-12',updatedAt:'2026-09-12'});
  assert.ok(created.id>0); assert.equal((await legacy.getFloorPlans(identity,workspace.id)).length,1);
  assert.equal((await legacy.updateFloorPlan(identity,workspace.id,created.id,{name:'Updated'})).name,'Updated');
  assert.equal(await legacy.deleteFloorPlan(identity,workspace.id,created.id),true);
  assert.equal((await fixture.admin`select workspace_id from floor_plans where name='Unowned legacy'`)[0].workspace_id,null);
  await assert.rejects(fixture.runtime`select nextval('users_id_seq')`,sqlState('42501'));
  await assert.rejects(fixture.runtime`select setval('floor_plans_id_seq',100)`,sqlState('42501'));
});

test('physical save, append, duplicate, archive and restore preserve immutable envelopes under runtime grants',async()=>{
  const {identity,workspace}=await member(); const envelope=capturePhysicalSaveEnvelope(basicPhysicalSaveDraft());
  const saved=await plans.create(identity,workspace.id,envelope,randomUUID());
  assert.deepEqual(saved.envelope,envelope);
  const next=await plans.append(identity,workspace.id,saved.planId,envelope,{idempotencyKey:randomUUID(),ifMatch:saved.etag});
  assert.equal(next.revisionNumber,2);
  const list=await plans.list(identity,workspace.id,{}); assert.equal(list.plans.length,1);
  const source=list.plans[0];
  const copied=await plans.lifecycle(identity,workspace.id,saved.planId,'duplicate',{revisionId:next.revisionId},{idempotencyKey:randomUUID(),ifMatch:source.lifecycleEtag});
  assert.notEqual(copied.plan.planId,saved.planId);
  assert.deepEqual(copied.revision.envelope,envelope);
  const archived=await plans.lifecycle(identity,workspace.id,saved.planId,'archive',{revisionId:next.revisionId},{idempotencyKey:randomUUID(),ifMatch:source.lifecycleEtag});
  assert.ok(archived.plan.archivedAt);
  const restored=await plans.lifecycle(identity,workspace.id,saved.planId,'restore',{revisionId:next.revisionId},{idempotencyKey:randomUUID(),ifMatch:archived.plan.lifecycleEtag});
  assert.equal(restored.plan.archivedAt,null);
  for(const name of ['physical_plan_revisions','physical_save_receipts','physical_lifecycle_receipts']) {
    await assert.rejects(fixture.runtime.unsafe(`DELETE FROM "${name}"`),sqlState('42501'));
    await assert.rejects(fixture.runtime.unsafe(`UPDATE "${name}" SET created_at=now()`),sqlState('42501'));
    await assert.rejects(fixture.admin.unsafe(`UPDATE "${name}" SET created_at=now()`),sqlState('55000'));
  }
});

test('connect-pg-simple performs real get/upsert/touch/destroy using the restricted runtime login',async()=>{
  const Store=connectPgSimple(session);
  const store=new Store({conObject:{connectionString:fixture.runtimeUrl,max:1},tableName:'mfp_sessions',createTableIfMissing:false,pruneSessionInterval:false,errorLog:()=>{}});
  const sid=randomUUID();
  const call=(method:string,...args:any[])=>new Promise<any>((resolve,reject)=>(store as any)[method](...args,(error:any,value:any)=>error?reject(error):resolve(value)));
  try {
    const value={cookie:{expires:new Date(Date.now()+60_000),maxAge:60_000},browserId:'synthetic'};
    await call('set',sid,value); assert.equal((await call('get',sid)).browserId,'synthetic');
    await call('set',sid,{...value,browserId:'changed'}); assert.equal((await call('get',sid)).browserId,'changed');
    await call('touch',sid,value); await call('destroy',sid); assert.equal(await call('get',sid),undefined);
  } finally { await store.close(); }
});

test('PUBLIC and Data API roles cannot read any application table, sequences or helper functions',async()=>{
  for(const role of ['anon','authenticated','service_role']) {
    await fixture.admin.unsafe(`SET ROLE "${role}"`);
    try {
      for(const name of tables) await assert.rejects(fixture.admin.unsafe(`SELECT * FROM "${name}"`),sqlState('42501'));
      for(const sequence of ['users_id_seq','floor_plans_id_seq']) await assert.rejects(fixture.admin.unsafe(`SELECT nextval('${sequence}')`),sqlState('42501'));
      await assert.rejects(fixture.admin`select physical_saved_history_is_immutable()`,sqlState('42501'));
    } finally { await fixture.admin.unsafe('RESET ROLE'); }
  }
});

test('runtime has no owner escalation, DDL, trigger, truncate or inert-user privileges',async()=>{
  await assert.rejects(fixture.runtime.unsafe(`SET ROLE "${fixture.ownerRole}"`),sqlState('42501'));
  await assert.rejects(fixture.runtime`create table public.unwanted(id int)`,sqlState('42501'));
  await assert.rejects(fixture.runtime`create temporary table unwanted_temp(id int)`,sqlState('42501'));
  await assert.rejects(fixture.runtime`create schema unwanted_schema`,sqlState('42501'));
  await assert.rejects(fixture.runtime`alter table physical_plans disable row level security`,sqlState('42501'));
  await assert.rejects(fixture.runtime`truncate physical_plan_revisions`,sqlState('42501'));
  await assert.rejects(fixture.runtime`drop table users`,sqlState('42501'));
  await assert.rejects(fixture.runtime`select physical_saved_history_is_immutable()`,sqlState('42501'));
});

test('new owner-created objects do not regain default API privileges or PUBLIC function execution',async()=>{
  await fixture.admin.unsafe(`SET ROLE "${fixture.ownerRole}"`);
  try { await fixture.admin.unsafe('CREATE TABLE public.future_private(id serial); CREATE FUNCTION public.future_private_function() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$'); }
  finally { await fixture.admin.unsafe('RESET ROLE'); }
  for(const role of ['anon','authenticated','service_role',fixture.runtimeRole,fixture.loginRole]) {
    const [row]=await fixture.admin`select has_table_privilege(${role},'public.future_private','SELECT') as readable,
      has_sequence_privilege(${role},'public.future_private_id_seq','USAGE') as sequence,
      has_function_privilege(${role},'public.future_private_function()','EXECUTE') as executable`;
    assert.deepEqual(row,{readable:false,sequence:false,executable:false});
  }
});

test('hardening refuses unexpected existing column grants, policies and unsafe membership before changing grants',async()=>{
  const isolated=await createProviderFixture({harden:false});
  try {
    await isolated.admin.unsafe('GRANT SELECT(password) ON users TO anon');
    await assert.rejects(applyHardening(isolated.admin,isolated),/Unexpected column privileges/);
    await isolated.admin.unsafe('REVOKE SELECT(password) ON users FROM anon');
    await isolated.admin.unsafe('CREATE POLICY unexpected_public ON users FOR SELECT TO PUBLIC USING (true)');
    await assert.rejects(applyHardening(isolated.admin,isolated),/Unexpected pre-existing application RLS policies/);
    await isolated.admin.unsafe('DROP POLICY unexpected_public ON users');
    await isolated.admin.unsafe(`GRANT "${isolated.ownerRole}" TO "${isolated.loginRole}"`);
    await assert.rejects(applyHardening(isolated.admin,isolated),/Unsafe runtime role membership|only the runtime membership/);
    await isolated.admin.unsafe(`REVOKE "${isolated.ownerRole}" FROM "${isolated.loginRole}"`);
    await applyHardening(isolated.admin,isolated);
    assert.equal((await isolated.runtime`select count(*)::int as count from workspaces`)[0].count,0);
  } finally { await isolated.cleanup(); }
});


test('migration setup reserves one administrative connection while unrelated pooled queries retain their role and search path', async () => {
  const isolated = await createProviderFixture({ migrations: false, adminMax: 4 });
  try {
    const [baseline] = await isolated.admin`select current_user as username, current_setting('search_path') as search_path`;
    const migration = applyMigrations(isolated.admin, isolated);
    const observers = Array.from({ length: 24 }, async () => {
      const [row] = await isolated.admin`select current_user as username, current_setting('search_path') as search_path, pg_sleep(0.002)`;
      assert.equal(row.username, baseline.username);
      assert.equal(row.search_path, baseline.search_path);
    });
    await Promise.all([migration, ...observers]);
    const [owned] = await isolated.admin`select count(*)::int as count from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r' and pg_get_userbyid(c.relowner)=${isolated.ownerRole}`;
    assert.equal(owned.count, 14);
    for (let index = 0; index < 8; index++) {
      const [row] = await isolated.admin`select current_user as username, current_setting('search_path') as search_path`;
      assert.deepEqual(row, baseline);
    }
  } finally { await isolated.cleanup(); }
});

test('a later migration failure preserves earlier committed steps and resets the reserved administrative session', async () => {
  const isolated = await createProviderFixture({ migrations: false, adminMax: 3 });
  try {
    const [baseline] = await isolated.admin`select current_user as username, current_setting('search_path') as search_path`;
    await isolated.admin.unsafe("CREATE TABLE public.mfp_sessions(marker text); INSERT INTO public.mfp_sessions VALUES ('preserved')");
    await assert.rejects(applyMigrations(isolated.admin, isolated), sqlState('42P07'));
    const [state] = await isolated.admin`select to_regclass('public.workspaces')::text as committed,
      to_regclass('public.auth_browser_contexts')::text as rolled_back`;
    assert.equal(state.committed, 'workspaces');
    assert.equal(state.rolled_back, null);
    assert.equal((await isolated.admin`select marker from public.mfp_sessions`)[0].marker, 'preserved');
    for (let index = 0; index < 8; index++) {
      const [row] = await isolated.admin`select current_user as username, current_setting('search_path') as search_path`;
      assert.deepEqual(row, baseline);
    }
  } finally { await isolated.cleanup(); }
});
