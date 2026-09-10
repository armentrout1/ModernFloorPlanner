import test from 'node:test';
import assert from 'node:assert/strict';
import { accountStore, refreshAccount, contextFetch, resumeLocalContext, AccountContextChanged, WorkspaceContextRequired, type AccountSession } from '../client/src/features/account/runtime';
import { workspaceContext } from '../client/src/features/account/localContexts';
Object.assign(globalThis,{window:new EventTarget(),sessionStorage:{getItem:()=>null,setItem:()=>{},removeItem:()=>{}}});
const session:AccountSession={status:'authenticated',contextToken:'current-epoch',principal:{id:'synthetic',displayName:'Synthetic'},workspace:{id:'workspace',name:'Workspace',role:'owner'},workspaces:[{id:'workspace',name:'Workspace',role:'owner'}]};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
test.beforeEach(async()=>{globalThis.fetch=async()=>json(session);await refreshAccount();resumeLocalContext(workspaceContext('synthetic','workspace'));});
test('physical routes require verified workspace local context before any request',async()=>{
  resumeLocalContext('unassigned');let writes=0;globalThis.fetch=async url=>String(url)==='/api/auth/session'?json(session):(writes++,json({}));
  await assert.rejects(contextFetch('POST','/api/physical-plans',{}),WorkspaceContextRequired);assert.equal(writes,0);
});
test('physical revision requests carry exact If-Match/idempotency while authority headers remain runtime-owned',async()=>{
  let headers:Headers|undefined;globalThis.fetch=async(url,options)=>{if(String(url)==='/api/auth/session')return json(session);headers=new Headers(options?.headers);return json({});};
  await contextFetch('POST','/api/physical-plans/p/revisions',{},undefined,{'If-Match':'"mfp-physical-rev"','Idempotency-Key':'synthetic-key','X-MFP-Context':'wrong','X-MFP-Workspace-Id':'foreign'});
  assert.equal(headers!.get('If-Match'),'"mfp-physical-rev"');assert.equal(headers!.get('Idempotency-Key'),'synthetic-key');assert.equal(headers!.get('X-MFP-Context'),'current-epoch');assert.equal(headers!.get('X-MFP-Workspace-Id'),'workspace');
});
test('idempotency conflicts remain actionable without discarding the verified editor context',async()=>{
  globalThis.fetch=async url=>String(url)==='/api/auth/session'?json(session):json({code:'IDEMPOTENCY_CONFLICT'},409);
  const generation=accountStore.getSnapshot().generation,response=await contextFetch('POST','/api/physical-plans',{});assert.equal(response.status,409);assert.equal((await response.json()).code,'IDEMPOTENCY_CONFLICT');assert.equal(accountStore.getSnapshot().generation,generation);assert.equal(accountStore.getSnapshot().editorContext,workspaceContext('synthetic','workspace'));
});
test('physical context conflicts invalidate old account generation before any private response can apply',async()=>{
  globalThis.fetch=async url=>String(url)==='/api/auth/session'?json(session):json({code:'ACCOUNT_CONTEXT_CHANGED'},409);
  const generation=accountStore.getSnapshot().generation;await assert.rejects(contextFetch('POST','/api/physical-plans',{}),AccountContextChanged);assert.ok(accountStore.getSnapshot().generation>generation);
});
