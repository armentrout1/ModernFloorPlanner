import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createPhysicalSaveManager, PhysicalSaveResponseError, AUTOSAVE_MAX_RETRIES, type SaveBinding } from '../client/src/features/physical-draft/accountSaveState';
import { AccountContextChanged } from '../client/src/features/account/runtime';
import type { JournalRecord, JournalScope, JournalIntent, RecoveryJournal } from '../client/src/features/physical-draft/recoveryJournal';
import { basicPhysicalSaveDraft, PHYSICAL_SAVE_TEST_AT } from './fixtures/physicalSave';
import { renameRoom, editField, commitField, type PhysicalDraft } from '../client/src/features/physical-draft/state';
import { capturePhysicalSaveEnvelope, physicalSavePayloadHash } from '../shared/persistence/physicalSave';
import type { PhysicalPlanRevision } from '../shared/persistence/physicalPlan';
const at = PHYSICAL_SAVE_TEST_AT;
const clone = <T>(value: T): T => structuredClone(value);
const context = { origin: 'https://autosave.example.test', principalId: randomUUID(), workspaceId: randomUUID() };
function deferred<T>() { let resolve!: (v:T)=>void,reject!: (v:unknown)=>void;const promise=new Promise<T>((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject}; }
const settle = () => new Promise<void>(resolve => setTimeout(resolve, 15));
class Clock {
  time=0; next=0; tasks=new Map<number,{at:number,run:()=>void}>();
  now=()=>this.time; random=()=>0.5;
  set=(run:()=>void,delay:number)=>{const id=++this.next;this.tasks.set(id,{at:this.time+delay,run});return id;};
  clear=(id:unknown)=>{this.tasks.delete(id as number);};
  async advance(ms:number){const end=this.time+ms;for(;;){const due=Array.from(this.tasks).filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!due)break;this.time=due[1].at;this.tasks.delete(due[0]);due[1].run();await settle();}this.time=end;await settle();}
}
function memoryJournal() {
  const rows=new Map<string,JournalRecord>();let failCheckpoint=false,failAck=false;const transitions:string[]=[];
  const key=(s:JournalScope)=>s.branchId;
  const get=(s:JournalScope)=>{const r=rows.get(key(s));if(!r)throw Error('missing checkpoint');return r;};
  const put=(r:JournalRecord)=>{rows.set(key(r.scope),clone(r));return clone(r);};
  const journal:RecoveryJournal={
    async read(s){return clone(rows.get(key(s))??null);},async list(){return Array.from(rows.values()).map(clone);},
    async checkpoint(s,draft,settings={}){if(failCheckpoint)throw Error('Quota denied');const old=rows.get(key(s));transitions.push('checkpoint');return put({version:1,scope:s,draft:clone(draft),generation:(old?.generation??0)+1,attemptGeneration:old?.attemptGeneration??0,autosave:settings.autosave??old?.autosave??false,binding:old?.binding??settings.binding??null,intent:old?.intent??null,state:old?.state??'checkpointed',updatedAt:0});},
    async prepareIntent(s,intent){transitions.push('prepare');const r=get(s);return put({...r,intent:clone(intent),attemptGeneration:r.attemptGeneration+1,generation:r.generation+1,state:'prepared'});},
    async markIntent(s,attempt,state){transitions.push(state);const r=get(s);assert.equal(r.attemptGeneration,attempt);return put({...r,state,generation:r.generation+1});},
    async acknowledge(s,attempt,binding){transitions.push('ack');if(failAck)throw Error('Acknowledgement transaction aborted');const r=get(s);assert.equal(r.attemptGeneration,attempt);assert.equal(r.intent!.candidateHash,binding.payloadHash);return put({...r,scope:{...s,planId:binding.planId},binding:r.binding&&r.binding.revisionNumber>binding.revisionNumber?r.binding:clone(binding),intent:null,state:'checkpointed',generation:r.generation+1});},
    async clearRejectedIntent(s){const r=get(s);return put({...r,intent:null,state:'checkpointed',generation:r.generation+1});},
    async setAutosave(s,autosave){const r=get(s);return put({...r,autosave,generation:r.generation+1});},
    async claimAttempt(){transitions.push('claim');return true;},async releaseAttempt(){},async close(){},
    async forkRecovery(s,to,id){const r=clone(get(s));return put({...r,scope:to,draft:{...r.draft,id},intent:r.intent?{...r.intent,draftId:id}:null,generation:1});},
  };
  return{journal,rows,transitions,setFailCheckpoint:(v:boolean)=>{failCheckpoint=v;},setFailAck:(v:boolean)=>{failAck=v;}};
}
async function harness(options:{linked?:boolean}={}) {
  const draft=basicPhysicalSaveDraft(),clock=new Clock(),storage=memoryJournal(),sent:JournalIntent[]=[],replies:ReturnType<typeof deferred<PhysicalPlanRevision>>[]=[],persisted=new Map<string,SaveBinding>();
  let valid=true,currentEtag='',authorizing:Promise<unknown>|null=null;
  const planId=randomUUID();
  const response=async (d:PhysicalDraft,n:number):Promise<PhysicalPlanRevision>=>{const revisionId=`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,envelope=capturePhysicalSaveEnvelope(d);return{planId,workspaceId:context.workspaceId,revisionId,revisionNumber:n,name:d.document.name,createdAt:at,createdBy:context.principalId,envelope,evaluation:{} as any,payloadHash:await physicalSavePayloadHash(envelope),etag:`"mfp-physical-${revisionId}"`};};
  const deps={clock,key:randomUUID,load:(id:string)=>persisted.get(id)??null,persist:(id:string,b:SaveBinding)=>{persisted.set(id,b);},journal:storage.journal,recoveryContext:()=>context,
    authorize:async()=>{if(authorizing)return authorizing;if(!valid)throw new AccountContextChanged();return{};},assert:()=>{if(!valid)throw new AccountContextChanged();},
    readCurrent:async()=>({etag:currentEtag,revisionNumber:1}),send:async(intent:JournalIntent)=>{storage.transitions.push('send');sent.push(clone(intent));const d=deferred<PhysicalPlanRevision>();replies.push(d);return d.promise;}};
  const manager=createPhysicalSaveManager(deps);
  if(options.linked!==false){const r=await response(draft,1);currentEtag=r.etag;manager.opened(draft.id,draft.localEditRevision,r);}
  manager.observe(draft);await settle();
  return{manager,draft,clock,storage,sent,replies,persisted,response,deps,setCurrent:(etag:string)=>{currentEtag=etag;},invalidate:()=>{valid=false;manager.suspend();},allow:()=>{valid=true;},deferAuth:(p:Promise<unknown>|null)=>{authorizing=p;}};
}
const changed=(d:PhysicalDraft,name='Changed')=>renameRoom(d,'room',name);
const height=(d:PhysicalDraft,text:string)=>commitField(editField(d,'room','ceilingHeight',text),'room','ceilingHeight',at);
async function enabled(){const f=await harness();await f.manager.setAutosave(f.draft,true);return f;}
async function respond(f:Awaited<ReturnType<typeof harness>>,index:number,d:PhysicalDraft,n:number){const r=await f.response(d,n);f.setCurrent(r.etag);f.replies[index].resolve(r);await settle();}

test('autosave starts off; opening or observing an anonymous draft never performs its first upload',async()=>{
  const f=await harness({linked:false});f.manager.observe(changed(f.draft));await f.clock.advance(10000);assert.equal(f.sent.length,0);assert.equal(f.manager.state(f.draft.id).autosave,false);await assert.rejects(f.manager.setAutosave(f.draft,true),/explicitly/);f.manager.dispose();
});
test('1500 ms committed debounce coalesces edits and identity detects names even with the same counter',async()=>{
  const f=await enabled();const a=changed(f.draft,'A');f.manager.observe(a);await f.clock.advance(250);await f.clock.advance(500);const b={...changed(a,'B'),localEditRevision:a.localEditRevision};f.manager.observe(b);await f.clock.advance(250);await f.clock.advance(1499);assert.equal(f.sent.length,0);await f.clock.advance(1);assert.equal(f.sent.length,1);assert.equal(f.sent[0].envelope.document.rooms[0].name,'B');assert.ok(f.storage.transitions.indexOf('prepare')<f.storage.transitions.indexOf('send'));await respond(f,0,b,2);assert.equal(f.manager.state(b.id).acknowledgedCurrent,true);f.manager.dispose();
});
test('view-only revision counters and repeated mount observations do not create revisions',async()=>{
  const f=await enabled();for(let i=1;i<8;i++){f.manager.observe({...f.draft,localEditRevision:f.draft.localEditRevision+i,displayUnit:i%2?'m':'ft'});await f.clock.advance(100);}await f.clock.advance(5000);assert.equal(f.sent.length,0);assert.equal(f.manager.state(f.draft.id).acknowledgedCurrent,true);f.manager.observe(null);assert.equal(f.clock.tasks.size,0);f.manager.dispose();
});
test('raw text checkpoints exactly, pauses candidates, and Apply resumes without confirmation or scope changes',async()=>{
  const f=await enabled(),raw=editField(f.draft,'room','ceilingHeight','9 ft -');f.manager.observe(raw);await f.clock.advance(3000);assert.equal(f.sent.length,0);const checkpoint=Array.from(f.storage.rows.values())[0];assert.equal(checkpoint.draft.fields.room.ceilingHeight.text,'9 ft -');assert.equal(checkpoint.draft.fields.room.ceilingHeight.dirty,true);assert.equal(f.manager.state(raw.id).phase,'paused');const applied=height(raw,'9 ft');f.manager.observe(applied);await f.clock.advance(1750);assert.equal(f.sent.length,1);assert.deepEqual(f.sent[0].envelope.request,f.draft.request);assert.deepEqual(f.sent[0].envelope.evidence.source,f.draft.source);await respond(f,0,applied,2);f.manager.dispose();
});
test('slow response acknowledges its candidate while newer raw work remains checkpointed and unsaved',async()=>{
  const f=await enabled(),candidate=changed(f.draft);f.manager.observe(candidate);await f.clock.advance(1750);const raw=editField(candidate,'room','length','12 ft -');f.manager.observe(raw);await f.clock.advance(250);await respond(f,0,candidate,2);const status=f.manager.state(raw.id);assert.equal(status.binding!.revisionNumber,2);assert.equal(status.acknowledgedCurrent,false);assert.equal(status.pending,true);const record=Array.from(f.storage.rows.values())[0];assert.equal(record.draft.fields.room.length.text,'12 ft -');assert.equal(record.intent,null);f.manager.dispose();
});
test('lost response retries immutable key/body/base before sending the newer committed candidate',async()=>{
  const f=await enabled(),first=changed(f.draft,'First');f.manager.observe(first);await f.clock.advance(1750);f.replies[0].reject(Error('response lost'));await settle();const newer=changed(first,'Newer');f.manager.observe(newer);await f.clock.advance(1000);assert.equal(f.sent.length,2);assert.deepEqual(f.sent[1],f.sent[0]);await respond(f,1,first,2);await f.clock.advance(1750);assert.equal(f.sent.length,3);assert.equal(f.sent[2].binding!.revisionNumber,2);assert.equal(f.sent[2].envelope.document.rooms[0].name,'Newer');await respond(f,2,newer,3);f.manager.dispose();
});
test('quota failure prevents autosave dispatch while explicit Save retains an accurate recovery warning',async()=>{
  const f=await enabled();f.storage.setFailCheckpoint(true);const d=changed(f.draft);f.manager.observe(d);await f.clock.advance(6000);assert.equal(f.sent.length,0);assert.equal(f.manager.state(d.id).recovery,'unavailable');const saving=f.manager.save(d);await settle();assert.equal(f.sent.length,1);assert.match(f.manager.state(d.id).recoveryMessage,/memory/);await respond(f,0,d,2);await saving;f.manager.dispose();
});
test('acknowledgement transaction failure keeps the exact request for receipt replay',async()=>{
  const f=await enabled(),d=changed(f.draft);f.manager.observe(d);await f.clock.advance(1750);f.storage.setFailAck(true);await respond(f,0,d,2);assert.equal(f.manager.state(d.id).binding!.revisionNumber,1);assert.equal(f.manager.state(d.id).retryable,true);assert.ok(Array.from(f.storage.rows.values())[0].intent);f.storage.setFailAck(false);await f.clock.advance(1000);assert.deepEqual(f.sent[1],f.sent[0]);await respond(f,1,d,2);assert.equal(f.manager.state(d.id).binding!.revisionNumber,2);f.manager.dispose();
});
test('context invalidation suspends in-flight work and stale responses cannot advance a local binding',async()=>{
  const f=await enabled(),d=changed(f.draft);f.manager.observe(d);await f.clock.advance(1750);f.invalidate();await respond(f,0,d,2);assert.equal(f.manager.state(d.id).binding!.revisionNumber,1);await f.clock.advance(100000);assert.equal(f.sent.length,1);assert.ok(Array.from(f.storage.rows.values())[0].intent);f.manager.dispose();
});
test('Autosave off cancels scheduling before a fresh authorization request resolves',async()=>{
  const f=await enabled();f.manager.observe(changed(f.draft));await f.clock.advance(250);const auth=deferred<unknown>();f.deferAuth(auth.promise);const off=f.manager.setAutosave(f.draft,false);assert.equal(f.manager.state(f.draft.id).autosave,false);await f.clock.advance(10000);assert.equal(f.sent.length,0);auth.resolve({});await off;f.manager.dispose();
});
test('recovery forks a fresh branch, preserves raw inputs, and replays only the original uncertain intent',async()=>{
  const f=await enabled(),d=changed(f.draft);f.manager.observe(d);await f.clock.advance(1750);f.replies[0].reject(Error('lost'));await settle();const raw=editField(d,'room','width','10 ft -');f.manager.observe(raw);await f.clock.advance(250);await f.manager.checkpoint(raw.id);f.manager.dispose();await settle();const original=clone(Array.from(f.storage.rows.values())[0]);const recovered=createPhysicalSaveManager(f.deps);const records=await recovered.discoverRecovery();assert.equal(f.sent.length,1);const draft=await recovered.resumeRecovery(records[0],'fresh-recovery');assert.equal(draft.fields.room.width.text,'10 ft -');assert.equal(f.storage.rows.size,2);assert.deepEqual(f.storage.rows.get(original.scope.branchId),original);recovered.observe(draft);await f.clock.advance(1000);assert.equal(f.sent.length,2);assert.equal(f.sent[1].key,f.sent[0].key);assert.deepEqual(f.sent[1].envelope,f.sent[0].envelope);assert.deepEqual(f.sent[1].binding,f.sent[0].binding);await respond(f,1,d,2);assert.equal(recovered.state(draft.id).pending,true);recovered.dispose();
});
test('unsent recovered stale base is a persistent conflict, including after raw Apply',async()=>{
  const f=await enabled(),raw=editField(changed(f.draft),'room','length','12 ft -');f.manager.observe(raw);await f.clock.advance(250);const record=Array.from(f.storage.rows.values())[0];f.manager.dispose();f.setCurrent('"different-server-revision"');const recovered=createPhysicalSaveManager(f.deps),draft=await recovered.resumeRecovery(record,'conflict-copy');recovered.observe(draft);await f.clock.advance(250);assert.equal(recovered.state(draft.id).phase,'conflict');const clean=commitField(editField(draft,'room','length','12 ft'),'room','length',at);recovered.observe(clean);await f.clock.advance(5000);assert.equal(recovered.state(draft.id).phase,'conflict');assert.equal(f.sent.length,0);recovered.dispose();
});
test('retry budget counts actual sends; observer churn cannot exhaust or duplicate retry timers',async()=>{
  const f=await enabled(),d=changed(f.draft);f.manager.observe(d);await f.clock.advance(1750);f.replies[0].reject(Error('offline'));await settle();for(let i=0;i<20;i++)f.manager.observe({...d,localEditRevision:d.localEditRevision+i});await f.clock.advance(1000);assert.equal(f.sent.length,2);for(let retry=1;retry<=AUTOSAVE_MAX_RETRIES;retry++){f.replies[retry].reject(Error('offline'));await settle();await f.clock.advance(40000);}assert.equal(f.sent.length,1+AUTOSAVE_MAX_RETRIES);assert.equal(f.manager.state(d.id).retryable,true);f.manager.dispose();
});
test('permanent invalid-payload errors never auto-retry or silently resume after view edits',async()=>{
  const f=await enabled(),d=changed(f.draft);f.manager.observe(d);await f.clock.advance(1750);f.replies[0].reject(new PhysicalSaveResponseError(422,'INVALID_SAVE','Invalid candidate'));await settle();f.manager.observe({...d,localEditRevision:d.localEditRevision+1});await f.clock.advance(100000);assert.equal(f.sent.length,1);assert.equal(f.manager.state(d.id).retryable,false);assert.equal(f.manager.state(d.id).phase,'failed');f.manager.dispose();
});

test('continuous raw typing checkpoints within the two-second maximum wait without sending',async()=>{
  const f=await enabled();const before=f.storage.transitions.filter(x=>x==='checkpoint').length;let d=f.draft;for(let n=0;n<21;n++){d=editField(d,'room','length',`12 ft - ${n}`);f.manager.observe(d);await f.clock.advance(100);}assert.ok(f.storage.transitions.filter(x=>x==='checkpoint').length>before);assert.ok(Array.from(f.storage.rows.values())[0].draft.fields.room.length.text.startsWith('12 ft -'));assert.equal(f.sent.length,0);f.manager.dispose();
});
test('Save as a new plan retains the old branch, durably prepares a create, and starts Autosave off',async()=>{
  const f=await enabled(),original=clone(Array.from(f.storage.rows.values())[0]),d=changed(f.draft);const p=f.manager.save(d,'new');await settle();assert.equal(f.sent.length,1);assert.equal(f.sent[0].binding,null);assert.equal(f.sent[0].operation,'create');assert.equal(f.manager.state(d.id).autosave,false);const rows=Array.from(f.storage.rows.values());assert.equal(rows.length,2);assert.deepEqual(f.storage.rows.get(original.scope.branchId),original);assert.equal(rows.find(r=>r.scope.branchId!==original.scope.branchId)!.intent!.key,f.sent[0].key);const r=await f.response(d,1);f.replies[0].resolve({...r,planId:randomUUID()});await p;assert.notEqual(f.manager.state(d.id).binding!.planId,original.binding!.planId);assert.equal(f.manager.state(d.id).recovery,'memory');f.manager.dispose();
});
test('permission loss preserves the uncertain intent and pauses automatic transmission',async()=>{
  const f=await enabled(),d=changed(f.draft);f.manager.observe(d);await f.clock.advance(1750);f.replies[0].reject(new PhysicalSaveResponseError(403,'WRITE_FORBIDDEN','Access removed'));await settle();await f.clock.advance(100000);assert.equal(f.sent.length,1);assert.equal(f.manager.state(d.id).retryable,true);assert.ok(Array.from(f.storage.rows.values())[0].intent);f.manager.dispose();
});
test('discovery authorizes each saved plan before returning any associated recovery content',async()=>{
  const f=await enabled();f.manager.dispose();let reads=0;const manager=createPhysicalSaveManager({...f.deps,readCurrent:async()=>{++reads;throw new PhysicalSaveResponseError(404,'NOT_FOUND','No access');}});await assert.rejects(manager.discoverRecovery(),/No access/);assert.equal(reads,1);assert.equal(f.sent.length,0);manager.dispose();
});
test('fresh-session identity stays suspended while same verified session refresh can reactivate',async()=>{
  const f=await harness();f.manager.dispose();let identity='same-session';const manager=createPhysicalSaveManager({...f.deps,accessIdentity:()=>identity});const r=await f.response(f.draft,1);manager.opened(f.draft.id,f.draft.localEditRevision,r);manager.observe(f.draft);await manager.setAutosave(f.draft,true);const d=changed(f.draft);manager.observe(d);manager.suspend();manager.observe(null);manager.observe(d);await f.clock.advance(1750);assert.equal(f.sent.length,1);await respond(f,0,d,2);const later=changed(d,'After sign-in');manager.observe(later);manager.suspend();manager.observe(null);identity='new-session';manager.observe(later);await f.clock.advance(10000);assert.equal(f.sent.length,1);manager.dispose();
});

test('recovery discovery excludes current in-use branches without altering older checkpoints',async()=>{
  const f=await enabled();const original=clone(Array.from(f.storage.rows.values())[0]);f.manager.dispose();await settle();const manager=createPhysicalSaveManager(f.deps);manager.observe(f.draft);await f.clock.advance(250);assert.equal(f.storage.rows.size,2);const available=await manager.discoverRecovery();assert.equal(available.length,1);assert.equal(available[0].scope.branchId,original.scope.branchId);assert.equal(available[0].autosave,true);assert.deepEqual(f.storage.rows.get(original.scope.branchId),original);const before=clone(Array.from(f.storage.rows.values()));await manager.discoverRecovery();assert.deepEqual(Array.from(f.storage.rows.values()),before);manager.dispose();
});
test('Apply with Autosave off clears stale unfinished-input pause while preserving unsaved status',async()=>{
  const f=await harness(),raw=editField(f.draft,'room','ceilingHeight','9 ft -');f.manager.observe(raw);await f.clock.advance(250);assert.equal(f.manager.state(raw.id).phase,'paused');const applied=height(raw,'9 ft');f.manager.observe(applied);await f.clock.advance(250);const status=f.manager.state(applied.id);assert.equal(status.phase,'saved');assert.equal(status.pending,false);assert.equal(status.acknowledgedCurrent,false);assert.equal(status.message,'');assert.equal(status.binding!.revisionNumber,1);await f.clock.advance(5000);assert.equal(f.sent.length,0);f.manager.dispose();
});

test('a delayed Autosave toggle never replaces newer canonical edits with its captured draft',async()=>{
  const f=await enabled(),nine=height(f.draft,'9 ft');f.manager.observe(nine);const auth=deferred<unknown>();f.deferAuth(auth.promise);const off=f.manager.setAutosave(nine,false);const ten=height(nine,'10 ft');f.manager.observe(ten);auth.resolve({});await off;await f.manager.checkpoint(ten.id);const record=Array.from(f.storage.rows.values())[0];assert.deepEqual(record.draft,ten);assert.equal(record.autosave,false);assert.equal(f.manager.state(ten.id).acknowledgedCurrent,false);assert.equal(f.manager.state(ten.id).pending,false);await f.clock.advance(5000);assert.equal(f.sent.length,0);f.manager.dispose();
});
test('a slower enable response cannot reverse a newer explicit Autosave off choice',async()=>{
  const f=await harness(),auth=deferred<unknown>();f.deferAuth(auth.promise);const on=f.manager.setAutosave(f.draft,true);f.deferAuth(null);await f.manager.setAutosave(f.draft,false);auth.resolve({});await on;assert.equal(f.manager.state(f.draft.id).autosave,false);assert.equal(Array.from(f.storage.rows.values())[0].autosave,false);f.manager.dispose();
});
