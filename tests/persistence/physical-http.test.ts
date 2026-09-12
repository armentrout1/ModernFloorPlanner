import assert from 'node:assert/strict';
import { before, after, beforeEach, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { startFixtureProcess } from '../accounts/runtime.mjs';
import { configureIssuer } from '../accounts/control';
import { PhysicalHttpClient } from './http-client';
import { selectedSaveWork, richPhysicalSaveDraft } from '../fixtures/physicalSave';
import { createLevelDraft } from '../../client/src/features/physical-draft/levelCommands';
import { upgradeExistingDraftToStairs } from '../../client/src/features/physical-draft/stairCommands';
import { upgradeExistingDraftToLayout } from '../../client/src/features/physical-draft/layoutCommands';
import { addRoom, editField, commitField } from '../../client/src/features/physical-draft/state';
import { capturePhysicalSaveEnvelope, physicalSavePayloadHash, restorePhysicalSaveDraft } from '../../shared/persistence/physicalSave';
import { verifyQuantitySnapshot } from '../../shared/quantities/snapshot';
import type { PhysicalPlanRevision } from '../../shared/persistence/physicalPlan';

assert.equal(process.env.MFP_ACCOUNTS_APP_ORIGIN, 'https://127.0.0.2:54420');
assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/mfp_accounts_[a-f0-9]+_test$/);
const db = postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} });
let app: Awaited<ReturnType<typeof startFixtureProcess>>;
async function restart() { if (app) await app.stop(); app = await startFixtureProcess('tests/accounts/app-server.ts', { ...process.env }, 'MFP_TEST_APP_READY'); }
before(async () => restart());
after(async () => { if (app) await app.stop(); await db.end(); });
beforeEach(async () => configureIssuer({ subjectPrefix: 'physical-' + randomUUID() }));
const AT = '2026-09-10T12:00:00.000Z';
function draft(height = '8 ft') {
  let d = addRoom(createLevelDraft('local-source', 'main', 'Synthetic complete physical plan'), 'room', 'Test room');
  for (const [field,text] of [['length','12 ft'], ['width','10 ft'], ['ceilingHeight',height]] as const)
    d = commitField(editField(d,'room',field,text),'room',field,AT);
  return selectedSaveWork(upgradeExistingDraftToLayout(upgradeExistingDraftToStairs(d,'stair-copy',AT),'layout-copy',AT));
}
async function member(account = 'account-a') {
  const client = new PhysicalHttpClient(); const identity = await client.login(account);
  const workspace = await client.create(); await client.select(workspace.id);
  return { client, identity, workspace };
}
async function save(client: PhysicalHttpClient, body = capturePhysicalSaveEnvelope(draft()), key = randomUUID()) {
  const response = await client.request('/api/physical-plans','POST',body,{'Idempotency-Key':key});
  assert.equal(response.status,201,await response.clone().text());
  const saved = await response.json() as PhysicalPlanRevision;
  assert.equal(response.headers.get('etag'),saved.etag); assert.match(saved.etag,/^"mfp-physical-[a-f0-9-]+"$/);
  return saved;
}
const revisionPath = (s:PhysicalPlanRevision) => `/api/physical-plans/${s.planId}/revisions`;
async function counts() { return (await db`select (select count(*)::int from physical_plans) as plans,(select count(*)::int from physical_plan_revisions) as revisions,(select count(*)::int from physical_save_receipts) as receipts`)[0]; }
function amount(saved:PhysicalPlanRevision, output:string) { const result=saved.evaluation.snapshot.evaluation.calculation.outputs.find(x=>x.output===output); assert.ok(result?.total); return result.total.net/(304.8*304.8); }
const close = (actual:number, expected:number) => assert.ok(Math.abs(actual-expected)<1e-8,`${actual} != ${expected}`);

test('normal OIDC/session route creates complete physical revision and authoritative evaluation, distinct from local IDs', async () => {
  const {client,identity,workspace}=await member(); const body=capturePhysicalSaveEnvelope(draft()); const saved=await save(client,body);
  assert.equal(saved.workspaceId,workspace.id); assert.equal(saved.createdBy,identity.principal!.id);
  assert.notEqual(saved.planId,'layout-copy'); assert.notEqual(saved.revisionId,body.document.revisionId);
  assert.deepEqual(saved.envelope,body); assert.equal(saved.payloadHash,await physicalSavePayloadHash(body));
  assert.deepEqual(await verifyQuantitySnapshot(saved.evaluation.snapshot),{ok:true});
  assert.equal(saved.evaluation.snapshot.sourceDocument.id,saved.planId); assert.equal(saved.evaluation.snapshot.sourceDocument.revisionId,saved.revisionId);
  assert.equal(saved.evaluation.snapshot.instance.createdAt,saved.createdAt); assert.equal(saved.evaluation.snapshot.instance.kind,'evaluation');
  close(amount(saved,'floor-area'),120); close(amount(saved,'ceiling-area'),120); close(amount(saved,'gross-wall-area'),352);
  const rows=await db`select envelope from physical_plan_revisions where id=${saved.revisionId}`; assert.deepEqual(rows[0].envelope,body);
  const list=await client.request('/api/physical-plans'); assert.equal(list.status,200); assert.equal((await list.json()).plans[0].planId,saved.planId);
});

test('second real session and actual application process restart recover the same SQL revision with no local cache',async()=>{
  const {client,workspace}=await member(); const saved=await save(client);
  const fresh=new PhysicalHttpClient(); await fresh.login(); await fresh.select(workspace.id);
  const before=await fresh.request(`/api/physical-plans/${saved.planId}`); assert.deepEqual(await before.json(),saved);
  const previousPid=app.child.pid; await restart(); assert.notEqual(app.child.pid,previousPid);
  const current=await fresh.request(`/api/physical-plans/${saved.planId}`); assert.equal(current.status,200); assert.deepEqual(await current.json(),saved);
  const old=await fresh.request(`${revisionPath(saved)}/${saved.revisionId}`); assert.deepEqual(await old.json(),saved);
});

test('height revision recomputes walls only and old revision stays byte-equivalent canonical content',async()=>{
  const {client}=await member(); const saved=await save(client); const next=capturePhysicalSaveEnvelope(draft('9 ft'));
  const response=await client.request(revisionPath(saved),'POST',next,{'Idempotency-Key':randomUUID(),'If-Match':saved.etag});
  assert.equal(response.status,201); const updated=await response.json() as PhysicalPlanRevision;
  assert.equal(updated.revisionNumber,2); close(amount(updated,'floor-area'),120);close(amount(updated,'ceiling-area'),120);close(amount(updated,'gross-wall-area'),396);
  const old=await client.request(`${revisionPath(saved)}/${saved.revisionId}`);assert.deepEqual(await old.json(),saved);
  const current=await client.request(`/api/physical-plans/${saved.planId}`);assert.deepEqual(await current.json(),updated);
});

test('two real sessions on the same base commit exactly one revision and return412 to the stale writer',async()=>{
  const {client,workspace}=await member();const saved=await save(client);const second=new PhysicalHttpClient();await second.login();await second.select(workspace.id);
  const before=await counts();const a=capturePhysicalSaveEnvelope(draft('9 ft')), b=capturePhysicalSaveEnvelope(draft('10 ft'));
  const responses=await Promise.all([client.request(revisionPath(saved),'POST',a,{'Idempotency-Key':randomUUID(),'If-Match':saved.etag}),second.request(revisionPath(saved),'POST',b,{'Idempotency-Key':randomUUID(),'If-Match':saved.etag})]);
  assert.deepEqual(responses.map(r=>r.status).sort(),[201,412]);const after=await counts();assert.equal(after.revisions,before.revisions+1);assert.equal(after.receipts,before.receipts+1);
  const losing=responses.find(r=>r.status===412)!;assert.equal((await losing.json()).code,'REVISION_CONFLICT');
});

test('lost create response and concurrent identical keys replay one accepted plan, while changed names conflict',async()=>{
  const {client}=await member();const body=capturePhysicalSaveEnvelope(draft()), key=randomUUID(),before=await counts();
  const responses=await Promise.all([client.request('/api/physical-plans','POST',body,{'Idempotency-Key':key}),client.request('/api/physical-plans','POST',body,{'Idempotency-Key':key})]);
  assert.deepEqual(responses.map(r=>r.status),[201,201]);const first=await responses[0].json();assert.deepEqual(await responses[1].json(),first);
  // Deliberately discard the accepted result at the application boundary, then retry.
  assert.deepEqual(await save(client,body,key),first); const after=await counts();assert.equal(after.plans,before.plans+1);assert.equal(after.revisions,before.revisions+1);
  body.document.name='Changed saved name';const mismatch=await client.request('/api/physical-plans','POST',body,{'Idempotency-Key':key});assert.equal(mismatch.status,409);assert.equal((await mismatch.json()).code,'IDEMPOTENCY_CONFLICT');assert.deepEqual(await counts(),after);
});

test('accepted append retries recover original outcome even after current has advanced, never duplicate revisions',async()=>{
  const {client}=await member();const first=await save(client),body=capturePhysicalSaveEnvelope(draft('9 ft')),key=randomUUID();
  const headers={'Idempotency-Key':key,'If-Match':first.etag};const response=await client.request(revisionPath(first),'POST',body,headers);assert.equal(response.status,201);const accepted=await response.json();
  const third=await client.request(revisionPath(first),'POST',capturePhysicalSaveEnvelope(draft('10 ft')),{'Idempotency-Key':randomUUID(),'If-Match':accepted.etag});assert.equal(third.status,201);const before=await counts();
  const retry=await client.request(revisionPath(first),'POST',body,headers);assert.equal(retry.status,201);assert.deepEqual(await retry.json(),accepted);assert.deepEqual(await counts(),before);
});

for(const condition of [undefined,'*','W/"anything"','"not-a-revision"'])test(`missing or invalid If-Match ${condition??'missing'} never inserts a revision`,async()=>{
  const {client}=await member();const saved=await save(client),before=await counts();const headers:Record<string,string>={'Idempotency-Key':randomUUID()};if(condition!==undefined)headers['If-Match']=condition;
  const response=await client.request(revisionPath(saved),'POST',capturePhysicalSaveEnvelope(draft('9 ft')),headers);assert.equal(response.status,condition===undefined?428:400);assert.deepEqual(await counts(),before);
});

test('two workspaces cannot list, read, revise or replay each other’s private records',async()=>{
  const a=await member(),b=await member('account-b'),saved=await save(a.client),before=await counts();
  const listing=await b.client.request('/api/physical-plans');assert.deepEqual((await listing.json()).plans,[]);
  for(const path of [`/api/physical-plans/${saved.planId}`,`${revisionPath(saved)}/${saved.revisionId}`])assert.equal((await b.client.request(path)).status,404);
  const update=await b.client.request(revisionPath(saved),'POST',capturePhysicalSaveEnvelope(draft()),{'Idempotency-Key':randomUUID(),'If-Match':saved.etag});assert.equal(update.status,404);
  const forged=await b.client.request(`/api/physical-plans/${saved.planId}`,'GET',undefined,{'X-MFP-Workspace-Id':a.workspace.id});assert.equal(forged.status,409);assert.deepEqual(await counts(),before);
});

test('viewer can read but cannot save; revoked access cannot replay an old successful receipt',async()=>{
  const a=await member(),b=await member('account-b'); const key=randomUUID(),body=capturePhysicalSaveEnvelope(draft()),saved=await save(a.client,body,key);
  await db`insert into workspace_memberships(workspace_id,principal_id,role,status) values(${a.workspace.id},${b.identity.principal!.id},'viewer','active')`;await b.client.select(a.workspace.id);
  assert.equal((await b.client.request(`/api/physical-plans/${saved.planId}`)).status,200);const before=await counts();
  assert.equal((await b.client.request('/api/physical-plans','POST',body,{'Idempotency-Key':randomUUID()})).status,403);
  await db`update workspace_memberships set status='revoked' where workspace_id=${a.workspace.id} and principal_id=${a.identity.principal!.id}`;
  assert.ok([401,404,409].includes((await a.client.request('/api/physical-plans','POST',body,{'Idempotency-Key':key})).status));assert.deepEqual(await counts(),before);
});

test('exact Origin, request marker and context are enforced before physical mutations',async()=>{
  const {client}=await member(),body=capturePhysicalSaveEnvelope(draft()),before=await counts();
  for(const extra of [{Origin:'https://foreign.invalid'},{'X-MFP-Request':'0'},{'X-MFP-Context':randomUUID()}]){
    const response=await client.request('/api/physical-plans','POST',body,{'Idempotency-Key':randomUUID(),...extra});assert.ok([403,409].includes(response.status));
  }assert.deepEqual(await counts(),before);
});

test('supported unknown measurements save without fabricated complete quantities',async()=>{
  const {client}=await member();const body=capturePhysicalSaveEnvelope(draft(''));const saved=await save(client,body);
  close(amount(saved,'floor-area'),120);close(amount(saved,'ceiling-area'),120);
  const walls=saved.evaluation.snapshot.evaluation.calculation.outputs.find(x=>x.output==='gross-wall-area')!;assert.equal(walls.total,null);
  assert.notEqual(saved.evaluation.snapshot.evaluation.calculation.status,'complete');assert.equal(saved.envelope.document.rooms[0].ceilingHeight.state,'unknown');
  const local=restorePhysicalSaveDraft(saved.envelope,'fresh-local');assert.equal(local.document.rooms[0].ceilingHeight.state,'unknown');
});

test('malformed, forged output, unsupported, invalid references and unbounded bodies fail without SQL mutations',async()=>{
  const {client}=await member(),good=capturePhysicalSaveEnvelope(draft()),before=await counts();
  const invalid=[{...good,version:'future'}, {...good,workspaceId:randomUUID()}, {...good,totals:{floor:999}}, {...good,evidence:{...good.evidence,events:[{}]}}, {...good,document:{...good.document,schemaVersion:999}}, {...good,request:{...good.request,selections:[{output:'floor-area',roomIds:['missing'],wasteFraction:0}]}}, {...good,document:{...good.document,name:'x'.repeat(4*1024*1024)}}];
  for(const body of invalid){const response=await client.request('/api/physical-plans','POST',body,{'Idempotency-Key':randomUUID()});assert.ok([413,422].includes(response.status),String(response.status));}
  assert.deepEqual(await counts(),before);
});

test('bounded pagination returns accessible summaries only and rejects unsupported controls',async()=>{
  const {client}=await member();const one=await save(client),two=await save(client);const first=await client.request('/api/physical-plans?limit=1');const a=await first.json();assert.equal(a.plans.length,1);assert.ok(a.nextCursor);assert.equal(a.plans[0].envelope,undefined);
  const second=await client.request('/api/physical-plans?limit=1&cursor='+a.nextCursor);const b=await second.json();assert.equal(b.plans.length,1);assert.equal(b.nextCursor,null);assert.deepEqual([a.plans[0].planId,b.plans[0].planId].sort(),[one.planId,two.planId].sort());
  for(const query of ['limit=0','limit=51','cursor=bad','all=true'])assert.equal((await client.request('/api/physical-plans?'+query)).status,400);
});

test('legacy authorized API remains separate and does not accept physical envelope or claim unowned records',async()=>{
  const {client}=await member();const before=await counts();const response=await client.request('/api/floor-plans','POST',capturePhysicalSaveEnvelope(draft()));assert.equal(response.status,400);
  const original=await client.request('/api/floor-plans/1');assert.equal(original.status,404);
  const saved=await client.request('/api/floor-plans','POST',{name:'Retained legacy',rooms:[],createdAt:'2026-09-10T00:00:00.000Z',updatedAt:'2026-09-10T00:00:00.000Z'});assert.equal(saved.status,201);assert.deepEqual(await counts(),before);
});

test('rich schema5 with stairs,landings,holes,zones,cabinets,appearance and evidence round trips through SQL without changing quantities',async()=>{
 const {client}=await member(),body=capturePhysicalSaveEnvelope(richPhysicalSaveDraft()),saved=await save(client,body);
 const result=await client.request(`/api/physical-plans/${saved.planId}`),loaded=await result.json() as PhysicalPlanRevision;
 assert.deepEqual(loaded.envelope,body);assert.equal(loaded.payloadHash,await physicalSavePayloadHash(body));
 assert.deepEqual(await verifyQuantitySnapshot(loaded.evaluation.snapshot),{ok:true});
 const restored=restorePhysicalSaveDraft(loaded.envelope,'fresh-sql-copy');assert.deepEqual(capturePhysicalSaveEnvelope(restored),body);
 close(amount(loaded,'floor-area'),252);const floor=loaded.evaluation.snapshot.evaluation.calculation.outputs.find(x=>x.output==='floor-area')!.total!;
 close(floor.allowance/(304.8*304.8),25.2);close(floor.adjusted/(304.8*304.8),277.2);
 assert.equal(restored.document.schemaVersion,5);if(restored.document.schemaVersion===5){assert.equal(restored.document.stairsContract.stairs[0].id,'stair');assert.equal(restored.document.layoutContract.zones[0].id,'zone');assert.equal(restored.document.layoutContract.cabinetBlocks[0].id,'cabinet');}
});

const exportPath = (saved: PhysicalPlanRevision, format = 'csv', unit = 'ft') =>
  `${revisionPath(saved)}/${saved.revisionId}/export?format=${format}&unit=${unit}`;
/** Parse quoted RFC4180 fields independently of the production serializer. */
function csvRecords(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], value = '', quoted = false;
  const input = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"') {
      if (quoted && input[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(value); value = ''; }
    else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && input[i + 1] === '\n') i++;
      row.push(value); rows.push(row); row = []; value = '';
    } else value += char;
  }
  assert.equal(quoted, false, 'CSV has a closed quoted field');
  if (row.length || value) { row.push(value); rows.push(row); }
  const headers = rows.shift(); assert.ok(headers, 'CSV has a header');
  return rows.filter(fields => fields.some(Boolean)).map(fields => {
    assert.equal(fields.length, headers.length, 'Every CSV row has the declared columns');
    return Object.fromEntries(headers.map((header, index) => [header, fields[index]]));
  });
}
function exportedTotal(text: string, output: string) {
  const row = csvRecords(text).find(record => record.section === 'selected-total' && record.output === output);
  assert.ok(row, `Missing selected total for ${output}`); return row;
}

test('saved exports retain exact captured quantities and bytes after a newer server revision exists', async () => {
  const { client } = await member(); const saved = await save(client);
  const csvResponse = await client.request(exportPath(saved)); assert.equal(csvResponse.status, 200);
  const csv = await csvResponse.text();
  for (const [output, expected] of [['floor-area', 120], ['ceiling-area', 120], ['gross-wall-area', 352]] as const)
    close(Number(exportedTotal(csv, output).net), expected);
  assert.match(csv, new RegExp(saved.revisionId)); assert.match(csv, new RegExp(saved.createdAt));
  assert.match(csvResponse.headers.get('content-type')!, /^text\/csv; charset=utf-8$/i);
  assert.equal(csvResponse.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(csvResponse.headers.get('content-disposition'), `attachment; filename="modern-floor-planner-${saved.revisionId}.csv"`);
  assert.match(csvResponse.headers.get('cache-control')!, /private/);
  const htmlResponse = await client.request(exportPath(saved, 'html')); assert.equal(htmlResponse.status, 200);
  const html = await htmlResponse.text(); assert.match(html, new RegExp(saved.revisionId));
  assert.match(htmlResponse.headers.get('content-type')!, /^text\/html; charset=utf-8$/i);
  assert.match(htmlResponse.headers.get('content-security-policy')!, /^sandbox;/);
  assert.match(htmlResponse.headers.get('content-security-policy')!, /default-src 'none'/);
  assert.equal(htmlResponse.headers.get('referrer-policy'), 'no-referrer');
  const appended = await client.request(revisionPath(saved), 'POST', capturePhysicalSaveEnvelope(draft('9 ft')),
    { 'Idempotency-Key': randomUUID(), 'If-Match': saved.etag });
  assert.equal(appended.status, 201); const next = await appended.json() as PhysicalPlanRevision;
  const beforeExports = await counts();
  assert.equal(await (await client.request(exportPath(saved))).text(), csv);
  assert.equal(await (await client.request(exportPath(saved, 'html'))).text(), html);
  const nextCsv = await (await client.request(exportPath(next))).text();
  close(Number(exportedTotal(nextCsv, 'gross-wall-area').net), 396);
  close(Number(exportedTotal(nextCsv, 'floor-area').net), 120);
  const metric = await (await client.request(exportPath(saved, 'csv', 'm'))).text();
  close(Number(exportedTotal(metric, 'floor-area').net), 11.1484);
  close(Number(exportedTotal(metric, 'floor-area').canonical_net), 11148364.8);
  assert.deepEqual(await counts(), beforeExports, 'Export does not create plans, revisions or save receipts');
});

test('viewer downloads are read-only and a later membership revocation denies another download', async () => {
  const owner = await member(), viewer = await member('account-b'), saved = await save(owner.client);
  await db`insert into workspace_memberships(workspace_id,principal_id,role,status) values(${owner.workspace.id},${viewer.identity.principal!.id},'viewer','active')`;
  await viewer.client.select(owner.workspace.id); const before = await counts();
  for (const format of ['csv', 'html']) assert.equal((await viewer.client.request(exportPath(saved, format))).status, 200);
  assert.equal((await viewer.client.request(revisionPath(saved), 'POST', capturePhysicalSaveEnvelope(draft('9 ft')),
    { 'Idempotency-Key': randomUUID(), 'If-Match': saved.etag })).status, 403);
  await db`update workspace_memberships set status='revoked' where workspace_id=${owner.workspace.id} and principal_id=${viewer.identity.principal!.id}`;
  for (const format of ['csv', 'html']) {
    const denied = await viewer.client.request(exportPath(saved, format));
    assert.ok([401, 404, 409].includes(denied.status));
    assert.doesNotMatch(await denied.text(), /Synthetic complete physical plan|Test room/);
  }
  assert.deepEqual(await counts(), before);
});

test('foreign and mismatched plan/revision identifiers never reveal an export even when IDs are known', async () => {
  const a = await member(), b = await member('account-b'), savedA = await save(a.client), savedB = await save(b.client);
  const before = await counts();
  for (const format of ['csv', 'html']) {
    const denied = await b.client.request(exportPath(savedA, format)); assert.equal(denied.status, 404);
    assert.doesNotMatch(await denied.text(), /Synthetic complete physical plan|Test room/);
    const mixed = { ...savedA, revisionId: savedB.revisionId };
    assert.equal((await a.client.request(exportPath(mixed, format))).status, 404);
    assert.equal((await a.client.request(exportPath({ ...savedA, revisionId: randomUUID() }, format))).status, 404);
    assert.equal((await b.client.request(exportPath(savedA, format), 'GET', undefined,
      { 'X-MFP-Workspace-Id': a.workspace.id })).status, 409);
  }
  assert.deepEqual(await counts(), before);
});

test('export rechecks current session/context and never accepts a naked link or a logged-out cookie', async () => {
  const { client, workspace } = await member(), saved = await save(client);
  const cookie = client.cookie, originalContext = client.context!;
  const anonymous = new PhysicalHttpClient();
  assert.equal((await anonymous.request(exportPath(saved), 'GET', undefined,
    { 'X-MFP-Workspace-Id': workspace.id, 'X-MFP-Context': originalContext })).status, 401);
  assert.equal((await client.request(exportPath(saved), 'GET', undefined, { 'X-MFP-Context': '' })).status, 409);
  await client.select(null);
  assert.equal((await client.request(exportPath(saved), 'GET', undefined,
    { 'X-MFP-Context': originalContext, 'X-MFP-Workspace-Id': workspace.id })).status, 409);
  await client.select(workspace.id);
  assert.equal((await client.request(exportPath(saved))).status, 200);
  const currentContext = client.context!;
  assert.equal((await client.request('/api/auth/logout', 'POST')).status, 200);
  const stale = new PhysicalHttpClient(); stale.cookie = cookie; stale.context = currentContext; stale.workspace = workspace.id;
  for (const format of ['csv', 'html']) assert.equal((await stale.request(exportPath(saved, format))).status, 401);
});

for (const column of ['idle_expires_at', 'absolute_expires_at']) test(`export denies server-expired ${column} even with retained session headers`, async () => {
  const { client, identity } = await member(), saved = await save(client), before = await counts();
  await db`update auth_browser_contexts set ${db(column)}=now()-interval '1 second' where principal_id=${identity.principal!.id}`;
  assert.equal((await client.request(exportPath(saved))).status, 401);
  assert.deepEqual(await counts(), before);
});

test('export rejects missing, repeated and unsupported format/unit controls instead of falling through to HTML', async () => {
  const { client } = await member(), saved = await save(client), base = `${revisionPath(saved)}/${saved.revisionId}/export`;
  const before = await counts();
  for (const query of ['', '?format=csv', '?unit=ft', '?format=pdf&unit=ft', '?format=csv&unit=in',
    '?format=csv&unit=ft&all=true', '?format=csv&format=html&unit=ft', '?format=csv&unit=ft&unit=m', '?format[0]=csv&unit=ft']) {
    const response = await client.request(base + query); assert.equal(response.status, 400, query);
    assert.match(response.headers.get('content-type')!, /application\/json/); assert.equal((await response.json()).code, 'INVALID_REQUEST');
  }
  for (const path of [`/api/physical-plans/invalid/revisions/${saved.revisionId}/export?format=csv&unit=ft`,
    `${revisionPath(saved)}/invalid/export?format=csv&unit=ft`]) assert.equal((await client.request(path)).status, 400);
  assert.deepEqual(await counts(), before);
});

test('saved export neutralizes formula labels and escapes executable markup without changing the source', async () => {
  const { client } = await member(), body = capturePhysicalSaveEnvelope(draft());
  body.document.name = '=2+2'; body.document.rooms[0].name = '<script>alert("room")</script>, quoted "name"';
  const saved = await save(client, body), before = await counts();
  const csvResponse = await client.request(exportPath(saved)); assert.equal(csvResponse.status, 200); const csv = await csvResponse.text();
  assert.ok(csvRecords(csv).some(row => Object.values(row).includes("'=2+2")), 'Formula label receives a literal-text prefix');
  assert.ok(csvRecords(csv).some(row => Object.values(row).includes(body.document.rooms[0].name!)), 'CSV quotes preserve harmless room text');
  assert.doesNotMatch(csvResponse.headers.get('content-disposition')!, /=2\+2|script|room/);
  const htmlResponse = await client.request(exportPath(saved, 'html')); assert.equal(htmlResponse.status, 200); const html = await htmlResponse.text();
  assert.doesNotMatch(html, /<script\b/i); assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<(?:iframe|object|embed)\b/i);
  assert.match(html, /no scaled drawing|schematic/i);
  assert.deepEqual((await (await client.request(`${revisionPath(saved)}/${saved.revisionId}`)).json()).envelope, body);
  assert.deepEqual(await counts(), before);
});

test('saved unknown ceiling height exports explicit incompleteness without replacing wall totals with zero', async () => {
  const { client } = await member(), saved = await save(client, capturePhysicalSaveEnvelope(draft('')));
  const response = await client.request(exportPath(saved)); assert.equal(response.status, 200); const csv = await response.text();
  close(Number(exportedTotal(csv, 'floor-area').net), 120); close(Number(exportedTotal(csv, 'ceiling-area').net), 120);
  const walls = exportedTotal(csv, 'gross-wall-area'); assert.equal(walls.net, '');
  assert.notEqual(walls.status, 'complete'); assert.match(csv, /ceilingHeight|ceiling height/i);
});
