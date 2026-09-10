import { createPhysicalDraftStore } from '../client/src/features/physical-draft/store';
import { createDraft, insertDraft } from '../client/src/features/physical-draft/state';
import { PHYSICAL_DRAFT_STORAGE_KEY, LEGACY_PHYSICAL_DRAFT_STORAGE_KEY, parseRegistry } from '../client/src/features/physical-draft/storage';
import test from 'node:test';
import assert from 'node:assert/strict';
import { accountStore, refreshAccount, invalidateAccount, captureRequestContext, contextFetch, accountAction,
  resumeLocalContext, AccountContextChanged, WorkspaceContextRequired, type AccountSession } from '../client/src/features/account/runtime';
import { workspaceContext, checkpointContext, localValues, setLocalValue, contextStorage } from '../client/src/features/account/localContexts';

const windowEvents = new EventTarget();
Object.assign(globalThis, { window: windowEvents });
const bytes = new Map<string,string>();
const storage = { getItem: (key:string) => bytes.get(key) ?? null, setItem: (key:string,value:string) => { bytes.set(key,String(value)); }, removeItem: (key:string) => { bytes.delete(key); } };
Object.assign(globalThis,{sessionStorage:storage});
const signed = (id:string, workspace='workspace-1'):AccountSession => ({status:'authenticated',contextToken:'epoch-'+id+'-'+workspace,principal:{id,displayName:id},workspace:{id:workspace,name:workspace,role:'owner'},workspaces:[{id:workspace,name:workspace,role:'owner'}]});
const json=(value:unknown)=>new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
let server:AccountSession=signed('first');
let writes=0, reads=0;
const http:typeof fetch=async (url,options) => {
  if(String(url)==='/api/auth/session') return json(server);
  if(options?.method==='GET')reads++;else writes++;
  return json({ok:true});
};
test.beforeEach(async()=>{globalThis.fetch=http;writes=reads=0;server=signed('initial');await refreshAccount();resumeLocalContext('unassigned');});

test('server-saved records cannot be fetched into an unassigned local context',async()=>{
  await assert.rejects(contextFetch('GET','/api/floor-plans'),WorkspaceContextRequired);
  assert.equal(reads,0);assert.equal(writes,0);
  resumeLocalContext(workspaceContext(server.principal!.id,server.workspace!.id));
  assert.equal((await contextFetch('GET','/api/floor-plans')).status,200);assert.equal(reads,1);
});

test('a protected operation binds both workspace and the noncredential session epoch',async()=>{
  resumeLocalContext(workspaceContext(server.principal!.id,server.workspace!.id));
  let headers:Headers|undefined;
  globalThis.fetch=async(url,options)=>{if(String(url)==='/api/auth/session')return json(server);headers=new Headers(options?.headers);return json({ok:true});};
  await contextFetch('POST','/api/floor-plans',{name:'Synthetic'});
  assert.equal(headers!.get('X-MFP-Context'),server.contextToken);
  assert.equal(headers!.get('X-MFP-Workspace-Id'),server.workspace!.id);
  assert.equal(headers!.get('X-MFP-Request'),'1');
});

test('a multi-step save cannot use a fresh cookie to finish a previous account operation',async()=>{
  resumeLocalContext(workspaceContext(server.principal!.id,server.workspace!.id));
  const original=await captureRequestContext();await contextFetch('GET','/api/floor-plans/1',undefined,original);
  server=signed('second');await refreshAccount();resumeLocalContext(workspaceContext('second','workspace-1'));
  await assert.rejects(contextFetch('PATCH','/api/floor-plans/1',{name:'Must not apply'},original),AccountContextChanged);
  assert.equal(writes,0);
});

test('a response body resolving after an account change cannot become a private record',async()=>{
  resumeLocalContext(workspaceContext(server.principal!.id,server.workspace!.id));
  let release!:(value:unknown)=>void;const body=new Promise(r=>release=r);
  globalThis.fetch=async url=>{if(String(url)==='/api/auth/session')return json(server);const response=json({});response.json=()=>body;return response;};
  const response=await contextFetch('GET','/api/floor-plans');const parsed=response.json();
  server=signed('second');await refreshAccount();release([{name:'Previous private value'}]);
  await assert.rejects(parsed,AccountContextChanged);assert.equal(accountStore.getSnapshot().editorContext,null);
});

test('invalidation supersedes an in-flight session read without leaving the account permanently checking',async()=>{
  let release!:(value:Response)=>void;const delayed=new Promise<Response>(r=>release=r);let call=0;
  globalThis.fetch=async()=>++call===1?delayed:json(signed('latest'));
  const previous=refreshAccount();invalidateAccount();const current=refreshAccount();
  await current;release(json(signed('stale')));await assert.rejects(previous,AccountContextChanged);
  assert.equal(accountStore.getSnapshot().session.principal!.id,'latest');assert.equal(accountStore.getSnapshot().checking,false);
});

test('an account button initiated as A never performs the action after preflight discovers B',async()=>{
  server=signed('B');
  await assert.rejects(accountAction('/api/auth/logout',{}),AccountContextChanged);
  assert.equal(writes,0);assert.equal(accountStore.getSnapshot().session.principal!.id,'B');
});

test('same-identity revalidation resumes only the context suspended in this page',async()=>{
  const scope=workspaceContext(server.principal!.id,server.workspace!.id);resumeLocalContext(scope);
  invalidateAccount();assert.equal(accountStore.getSnapshot().editorContext,null);await refreshAccount();
  assert.equal(accountStore.getSnapshot().editorContext,scope);
  invalidateAccount();server=signed('initial','workspace-2');await refreshAccount();assert.equal(accountStore.getSnapshot().editorContext,null);
});

test('failed local checkpoint retains memory and original bytes without clearing another draft',()=>{
  const context='workspace:checkpoint:one';setLocalValue(context,'raw',{text:'12 ft -',unit:'ft',dirty:true});
  bytes.set('unrelated','keep');const original=storage.setItem;storage.setItem=()=>{throw Error('quota');};
  try {assert.equal(checkpointContext(context),false);assert.deepEqual(localValues(context).raw,{text:'12 ft -',unit:'ft',dirty:true});assert.equal(bytes.get('unrelated'),'keep');}
  finally {storage.setItem=original;}
  assert.equal(checkpointContext(context),true);assert.equal(bytes.get('unrelated'),'keep');
});

test('context storage cannot silently read the unassigned draft or a different principal workspace',()=>{
  bytes.set('draft-key','anonymous bytes');contextStorage('workspace:A:one').setItem('draft-key','A bytes');
  assert.equal(contextStorage('unassigned').getItem('draft-key'),'anonymous bytes');
  assert.equal(contextStorage('workspace:B:one').getItem('draft-key'),null);
  assert.equal(contextStorage('workspace:A:two').getItem('draft-key'),null);
  assert.equal(contextStorage('workspace:A:one').getItem('draft-key'),'A bytes');
});

test('a protected action waiting for revalidation cannot acquire a newly resumed context',async()=>{
  resumeLocalContext(workspaceContext(server.principal!.id,server.workspace!.id));
  let release!:(value:Response)=>void;const delayed=new Promise<Response>(r=>release=r);
  globalThis.fetch=async()=>delayed;
  const captured=captureRequestContext();resumeLocalContext('unassigned');release(json(server));
  await assert.rejects(captured,AccountContextChanged);assert.equal(writes,0);
});

test('a checkpoint after an initially denied storage read cannot mask an unread older recovery key',()=>{
  const kept = new Map([[LEGACY_PHYSICAL_DRAFT_STORAGE_KEY,'Preserved older recovery bytes']]);let readable=false;
  const store=createPhysicalDraftStore(()=>({getItem:key=>{if(!readable)throw Error('blocked');return kept.get(key)??null;},setItem:(key,value)=>{kept.set(key,value);},removeItem:key=>{kept.delete(key);}}));
  store.hydrate();readable=true;
  assert.equal(store.checkpoint(),false);assert.equal(kept.has(PHYSICAL_DRAFT_STORAGE_KEY),false);
  assert.equal(kept.get(LEGACY_PHYSICAL_DRAFT_STORAGE_KEY),'Preserved older recovery bytes');
});

test('a quota-only failure after validated hydration can checkpoint the exact retained draft when storage recovers',()=>{
  const kept = new Map<string,string>();let writable=false;
  const store=createPhysicalDraftStore(()=>({getItem:key=>kept.get(key)??null,setItem:(key,value)=>{if(!writable)throw Error('quota');kept.set(key,value);},removeItem:key=>{kept.delete(key);}}));
  store.hydrate();store.dispatch(registry=>insertDraft(registry,createDraft('retained-draft')));
  const before=store.getSnapshot().registry;assert.equal(store.checkpoint(),false);writable=true;
  assert.equal(store.checkpoint(),true);const recovered=parseRegistry(kept.get(PHYSICAL_DRAFT_STORAGE_KEY)!);
  assert.equal(recovered.status,'recovered');if(recovered.status==='recovered')assert.deepEqual(recovered.registry,before);
});
