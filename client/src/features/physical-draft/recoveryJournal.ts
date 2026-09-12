import { z } from 'zod';
import type { PhysicalDraft } from './state';
import { serializeRegistry, parseRegistry } from './storage';
import { parsePhysicalSaveEnvelope, physicalSavePayloadHash, type PhysicalSaveEnvelope } from '@shared/persistence/physicalSave';
import { canonicalJson, copyJson } from '@shared/quantities/canonicalJson';

export const RECOVERY_JOURNAL_NAME = 'modern-floor-planner:physical-recovery:v1';
export const RECOVERY_JOURNAL_VERSION = 1;
export const MAX_JOURNAL_RECORD_BYTES = 16 * 1024 * 1024;
export const ATTEMPT_LEASE_MS = 30_000;
export interface JournalContext { origin: string; principalId: string; workspaceId: string }
export interface JournalScope extends JournalContext { planId: string | null; branchId: string }
export interface JournalBinding { planId: string; revisionId: string; revisionNumber: number; etag: string; payloadHash: string; savedLocalRevision: number }
export interface JournalIntent { draftId: string; localRevision: number; envelope: PhysicalSaveEnvelope; key: string;
  binding: JournalBinding | null; candidateHash: string; operation: 'create' | 'append'; resource: string }
export type JournalPhase = 'checkpointed' | 'prepared' | 'dispatched' | 'uncertain' | 'paused';
export interface JournalRecord { version: 1; scope: JournalScope; draft: PhysicalDraft; generation: number; attemptGeneration: number;
  autosave: boolean; binding: JournalBinding | null; intent: JournalIntent | null; state: JournalPhase; updatedAt: number }
interface StoredRecord extends Omit<JournalRecord, 'draft'> { draftText: string }
interface SharedAttempt { version: 1; key: string; requestIdentity: string; owner: string | null; expiresAt: number }
export class RecoveryJournalError extends Error {
  constructor(public readonly code: 'UNAVAILABLE' | 'BLOCKED' | 'CORRUPT' | 'UNSUPPORTED' | 'TOO_LARGE' | 'STALE_GENERATION' | 'INTENT_EXISTS' | 'INTENT_MISMATCH' | 'ATTEMPT_BUSY', message: string) {
    super(message); this.name = 'RecoveryJournalError';
  }
}
function fail(code: RecoveryJournalError['code'], message: string): never { throw new RecoveryJournalError(code, message); }
const uuid = z.string().uuid(), generation = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER - 1);
const bindingSchema = z.object({ planId: uuid, revisionId: uuid, revisionNumber: z.number().int().positive(),
  etag: z.string(), payloadHash: z.string().regex(/^[0-9a-f]{64}$/), savedLocalRevision: generation }).strict().superRefine((v,ctx)=>{
  if(v.etag!==`"mfp-physical-${v.revisionId}"`)ctx.addIssue({code:z.ZodIssueCode.custom,message:'Invalid exact revision binding'});
});
const contextSchema = z.object({ origin: z.string().url(), principalId: uuid, workspaceId: uuid }).strict();
const scopeSchema = contextSchema.extend({ planId: uuid.nullable(), branchId: uuid });
const intentSchema = z.object({ draftId: z.string().min(1), localRevision: generation, envelope: z.unknown(), key: uuid,
  binding: bindingSchema.nullable(), candidateHash: z.string().regex(/^[0-9a-f]{64}$/), operation: z.enum(['create','append']), resource: z.string() }).strict();
const storedSchema = z.object({version:z.literal(1),scope:scopeSchema,draftText:z.string(),generation:generation,attemptGeneration:generation,
  autosave:z.boolean(),binding:bindingSchema.nullable(),intent:intentSchema.nullable(),state:z.enum(['checkpointed','prepared','dispatched','uncertain','paused']),updatedAt:z.number().finite().nonnegative()}).strict();
const detached = <T,>(value: T): T => copyJson(value) as unknown as T;
function assertPrivateFree(value: unknown): void {
  const forbidden=new Set(['cookie','cookies','authorization','access_token','refresh_token','id_token','accessToken','refreshToken','idToken','contextToken','sessionIdHash','sessionSecret','clientSecret']);
  function visit(item:unknown,depth:number){if(depth>100)fail('CORRUPT','Recovery data is too deeply nested. Original data was preserved.');
    if(item&&typeof item==='object')for(const key of Object.keys(item)){if(forbidden.has(key))fail('CORRUPT','Authentication credentials cannot be stored in recovery.');visit((item as Record<string,unknown>)[key],depth+1);}}
  visit(value,0);
}
function checkedScope(input:JournalScope,origin:string):JournalScope{
  const parsed=scopeSchema.safeParse(input);if(!parsed.success)fail('CORRUPT','Invalid recovery scope.');
  const s=parsed.data;if(s.origin!==origin||new URL(s.origin).origin!==s.origin)fail('CORRUPT','Recovery belongs to another application environment.');
  return {...s,principalId:s.principalId.toLowerCase(),workspaceId:s.workspaceId.toLowerCase(),branchId:s.branchId.toLowerCase(),planId:s.planId?.toLowerCase()??null};
}
const recordKey=(s:JournalScope)=>JSON.stringify([s.origin,s.principalId,s.workspaceId,s.branchId]);
const contextKey=(s:JournalContext)=>JSON.stringify([s.origin,s.principalId,s.workspaceId]);
const samePlan=(a:JournalScope,b:JournalScope)=>a.planId===b.planId;
function draftText(draft:PhysicalDraft):string{
  assertPrivateFree(draft);
  const text=serializeRegistry({version:'mfp-editor-draft-v4',localEditRevision:0,selectedDraftId:draft.id,drafts:[draft]});
  if(new TextEncoder().encode(text).byteLength>MAX_JOURNAL_RECORD_BYTES)fail('TOO_LARGE','This checkpoint exceeds the 16 MiB recovery limit. Memory and prior checkpoints are preserved.');
  return text;
}
function unpack(value:unknown,origin:string):JournalRecord{
  if(value&&typeof value==='object'&&'version'in value&&value.version!==1)fail('UNSUPPORTED','This recovery journal version is unsupported. Original data was preserved.');
  const parsed=storedSchema.safeParse(value);if(!parsed.success)fail('CORRUPT','The recovery checkpoint is corrupt. Original data was preserved.');
  const s=parsed.data,scope=checkedScope(s.scope,origin),recovered=parseRegistry(s.draftText);
  if(recovered.status!=='recovered'||recovered.registry.drafts.length!==1)fail('CORRUPT','The complete physical recovery checkpoint could not be validated.');
  const draft=recovered.registry.drafts[0];assertPrivateFree(draft);
  if(s.binding?.planId!==scope.planId&&!(s.binding===null&&scope.planId===null))fail('CORRUPT','The recovery binding belongs to another plan.');
  let intent:JournalIntent|null=null;
  if(s.intent){const item=s.intent;const envelope=parsePhysicalSaveEnvelope(item.envelope);
    if(item.draftId!==draft.id||(item.operation==='append'?(item.binding===null||item.resource!==item.binding.planId):item.binding!==null||item.resource!=='collection'))fail('CORRUPT','Recovery request identity is inconsistent.');
    if(item.binding&&item.binding.planId!==scope.planId)fail('CORRUPT','The pending request belongs to another plan.');
    intent={...item,envelope};}
  if((s.state==='checkpointed')!==!intent)fail('CORRUPT','Recovery request state is inconsistent.');
  const {draftText:_original,...rest}=s;return {...rest,scope,draft,intent};
}
function pack(record:JournalRecord,text?:string):StoredRecord{
  const {draft,...other}=record,stored={...detached(other),draftText:text??draftText(draft)};
  if(new TextEncoder().encode(JSON.stringify(stored)).byteLength>MAX_JOURNAL_RECORD_BYTES)fail('TOO_LARGE','This checkpoint and pending request exceed the 16 MiB recovery limit. Prior data was preserved.');
  return stored;
}
function requestIdentity(intent:JournalIntent):string{return canonicalJson([intent.operation,intent.resource,intent.binding?.etag??null,intent.candidateHash]);}
function attemptKey(scope:JournalScope,intent:JournalIntent):string{return JSON.stringify([scope.origin,scope.principalId,scope.workspaceId,intent.operation,intent.resource,intent.key.toLowerCase()]);}
const next=(value:number)=>{if(!generation.safeParse(value+1).success)fail('STALE_GENERATION','Recovery generation cannot advance safely.');return value+1;};
/** Caller must verify the current principal/workspace and permission before reading
 * or exposing records. Stored labels cannot establish authentication. IndexedDB
 * is plaintext local recovery, not a backup or encrypted device isolation. */
export function createRecoveryJournal(options:{indexedDB?:IDBFactory;origin?:string;dbName?:string}={}){
  const origin=options.origin??(typeof location==='undefined'?'':location.origin),name=options.dbName??RECOVERY_JOURNAL_NAME;
  let connection:Promise<IDBDatabase>|null=null,closed=false;
  function open():Promise<IDBDatabase>{
    if(closed)return Promise.reject(new RecoveryJournalError('UNAVAILABLE','Local recovery is unavailable after a storage version change.'));
    if(connection)return connection;
    connection=new Promise((resolve,reject)=>{
      let factory:IDBFactory|undefined;
      try{factory=options.indexedDB??globalThis.indexedDB;}catch{reject(new RecoveryJournalError('UNAVAILABLE','Local recovery is unavailable. Memory and prior bytes are preserved.'));return;}
      if(!factory){reject(new RecoveryJournalError('UNAVAILABLE','IndexedDB recovery is unavailable.'));return;}
      let request:IDBOpenDBRequest;
      try{request=factory.open(name,RECOVERY_JOURNAL_VERSION);}catch{reject(new RecoveryJournalError('UNAVAILABLE','Local recovery could not be opened.'));return;}
      let failed=false;
      request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('branches'))db.createObjectStore('branches');if(!db.objectStoreNames.contains('attempts'))db.createObjectStore('attempts');};
      request.onblocked=()=>{failed=true;reject(new RecoveryJournalError('BLOCKED','Local recovery is blocked by another storage version. Close that separate session before retrying.'));};
      request.onerror=()=>reject(new RecoveryJournalError(request.error?.name==='VersionError'?'UNSUPPORTED':'UNAVAILABLE','Local recovery could not be opened. Prior bytes are preserved.'));
      request.onsuccess=()=>{const db=request.result;if(failed){db.close();return;}if(!db.objectStoreNames.contains('branches')||!db.objectStoreNames.contains('attempts')){db.close();reject(new RecoveryJournalError('CORRUPT','Recovery stores are missing. Original data was preserved.'));return;}
        db.onversionchange=()=>{closed=true;db.close();};resolve(db);};
    });
    connection.catch(()=>{connection=null;});return connection;
  }
  async function transaction<T>(stores:string[],mode:IDBTransactionMode,run:(tx:IDBTransaction,done:(value:T)=>void)=>void):Promise<T>{
    const db=await open();return new Promise<T>((resolve,reject)=>{let tx:IDBTransaction,result:T,settled=false,custom:unknown;
      try{tx=db.transaction(stores,mode,{durability:mode==='readwrite'?'strict':'default'});}catch{reject(new RecoveryJournalError('UNAVAILABLE','Local recovery transaction could not start.'));return;}
      const abort=(error:unknown)=>{custom=error;try{tx.abort();}catch{reject(error);}};
      tx.oncomplete=()=>{settled=true;resolve(result);};tx.onabort=()=>{if(!settled)reject(custom??new RecoveryJournalError('UNAVAILABLE','Local recovery transaction failed. Previous checkpoint remains unchanged.'));};
      tx.onerror=()=>{};
      try{run(tx,value=>{result=value;});}catch(error){abort(error);}
      // Every request callback must use guarded; exceptions otherwise escape the
      // promise even though IndexedDB aborts the transaction.
      (tx as IDBTransaction&{journalAbort?:(e:unknown)=>void}).journalAbort=abort;
    });
  }
  function guarded(tx:IDBTransaction,fn:()=>void){try{fn();}catch(error){(tx as IDBTransaction&{journalAbort:(e:unknown)=>void}).journalAbort(error);}}
  function update<T>(scope:JournalScope,run:(record:JournalRecord|null,store:IDBObjectStore,tx:IDBTransaction,done:(value:T)=>void)=>void,stores=['branches']):Promise<T>{
    const s=checkedScope(scope,origin);return transaction(stores,'readwrite',(tx,done)=>{const store=tx.objectStore('branches'),get=store.get(recordKey(s));get.onsuccess=()=>guarded(tx,()=>{
      const record=get.result===undefined?null:unpack(get.result,origin);if(record&&!samePlan(record.scope,s))fail('STALE_GENERATION','This recovery branch now belongs to a different saved plan.');run(record,store,tx,done);});});
  }
  async function validateIntentHash(record:JournalRecord|null):Promise<JournalRecord|null>{if(record?.intent&&await physicalSavePayloadHash(record.intent.envelope)!==record.intent.candidateHash)fail('CORRUPT','The retained request payload identity is corrupt. Original bytes were preserved.');return record;}
  async function read(scope:JournalScope):Promise<JournalRecord|null>{const s=checkedScope(scope,origin);return validateIntentHash(await transaction(['branches'],'readonly',(tx,done)=>{const get=tx.objectStore('branches').get(recordKey(s));get.onsuccess=()=>guarded(tx,()=>{const record=get.result===undefined?null:unpack(get.result,origin);if(record&&!samePlan(record.scope,s))fail('STALE_GENERATION','This recovery branch belongs to another plan.');done(record);});}));}
  async function list(context:JournalContext):Promise<JournalRecord[]>{
    const parsed=contextSchema.safeParse(context);if(!parsed.success||context.origin!==origin)fail('CORRUPT','Invalid recovery context.');
    const match=contextKey({...context,principalId:context.principalId.toLowerCase(),workspaceId:context.workspaceId.toLowerCase()});
    const records=await transaction<JournalRecord[]>(['branches'],'readonly',(tx,done)=>{const rows:JournalRecord[]=[],cursor=tx.objectStore('branches').openCursor();cursor.onsuccess=()=>guarded(tx,()=>{const current=cursor.result;if(!current){done(rows);return;}
      const key=String(current.key);let components:unknown;try{components=JSON.parse(key);}catch{fail('CORRUPT','A recovery branch key is corrupt.');}
      if(Array.isArray(components)&&JSON.stringify(components.slice(0,3))===match)rows.push(unpack(current.value,origin));current.continue();});});
    for(const record of records)await validateIntentHash(record);return records;
  }
  async function checkpoint(scope:JournalScope,draft:PhysicalDraft,settings:{binding?:JournalBinding|null;autosave?:boolean;expectedGeneration?:number}={}):Promise<JournalRecord>{
    const text=draftText(draft),s=checkedScope(scope,origin);
    return update(s,(previous,store,_tx,done)=>{
      if(settings.expectedGeneration!==undefined&&(previous?.generation??0)!==settings.expectedGeneration)fail('STALE_GENERATION','A newer checkpoint already exists. Neither branch was overwritten.');
      if(previous&&draft.id!==previous.draft.id)fail('CORRUPT','A recovery branch cannot silently replace another local draft.');
      if(previous&&draft.localEditRevision<previous.draft.localEditRevision)fail('STALE_GENERATION','An older local checkpoint cannot replace newer work.');
      const binding=previous?.binding??settings.binding??null;
      if(binding&&!bindingSchema.safeParse(binding).success)fail('CORRUPT','Invalid acknowledged server binding.');
      if((binding?.planId??null)!==s.planId)fail('CORRUPT','Checkpoint plan scope and binding disagree.');
      if(settings.autosave===true&&!binding)fail('CORRUPT','Autosave requires an explicitly saved plan binding.');
      const record:JournalRecord={version:1,scope:s,draft:detached(draft),generation:next(previous?.generation??0),attemptGeneration:previous?.attemptGeneration??0,
        autosave:settings.autosave??previous?.autosave??false,binding:binding?detached(binding):null,intent:previous?.intent??null,state:previous?.state??'checkpointed',updatedAt:Date.now()};
      store.put(pack(record,text),recordKey(s));done(record);
    });
  }
  async function prepareIntent(scope:JournalScope,input:JournalIntent,settings:{expectedGeneration?:number}={}):Promise<JournalRecord>{
    const parsed=intentSchema.safeParse(input);if(!parsed.success)fail('CORRUPT','Invalid pending recovery request.');
    const intent:JournalIntent={...detached(input),envelope:parsePhysicalSaveEnvelope(input.envelope)};
    if(await physicalSavePayloadHash(intent.envelope)!==intent.candidateHash)fail('CORRUPT','The pending request identity does not match its exact document.');
    return update(scope,(record,store,tx,done)=>{
      if(!record)fail('CORRUPT','Checkpoint the physical draft before preparing a request.');
      if(settings.expectedGeneration!==undefined&&record.generation!==settings.expectedGeneration)fail('STALE_GENERATION','A newer checkpoint exists before dispatch.');
      if(record.intent){if(canonicalJson(record.intent)!==canonicalJson(intent))fail('INTENT_EXISTS','Resolve the dispatched or uncertain request before creating another.');done(record);return;}
      if(intent.draftId!==record.draft.id||intent.localRevision>record.draft.localEditRevision)fail('CORRUPT','The pending request is not a checkpointed candidate.');
      if(intent.operation==='append'?(intent.binding===null||intent.resource!==intent.binding.planId||intent.binding.planId!==record.scope.planId):intent.binding!==null||intent.resource!=='collection')fail('CORRUPT','The pending operation and resource do not match their binding.');
      const key=attemptKey(record.scope,intent),attempts=tx.objectStore('attempts'),get=attempts.get(key);
      get.onsuccess=()=>guarded(tx,()=>{const previous=get.result as SharedAttempt|undefined,identity=requestIdentity(intent);
        if(previous&&(previous.version!==1||previous.requestIdentity!==identity))fail('INTENT_MISMATCH','That save key already identifies another immutable request.');
        if(!previous)attempts.put({version:1,key,requestIdentity:identity,owner:null,expiresAt:0} satisfies SharedAttempt,key);
        const nextRecord={...record,intent,attemptGeneration:next(record.attemptGeneration),generation:next(record.generation),state:'prepared' as const,updatedAt:Date.now()};
        store.put(pack(nextRecord),recordKey(record.scope));done(nextRecord);});
    },['branches','attempts']);
  }
  async function markIntent(scope:JournalScope,attemptGeneration:number,state:'dispatched'|'uncertain'|'paused'):Promise<JournalRecord>{return update(scope,(record,store,_tx,done)=>{
    if(!record?.intent||record.attemptGeneration!==attemptGeneration)fail('STALE_GENERATION','The pending recovery attempt changed.');
    // Pausing access cannot turn a definitely-unsent request into an uncertain
    // dispatch. Recovery must still compare its captured base before sending.
    const phase=record.state==='prepared'&&state==='paused'?'prepared':state;
    const nextRecord:JournalRecord={...record,state:phase,generation:next(record.generation),updatedAt:Date.now()};store.put(pack(nextRecord),recordKey(record.scope));done(nextRecord);});}
  async function acknowledge(scope:JournalScope,attemptGeneration:number,binding:JournalBinding):Promise<JournalRecord>{
    if(!bindingSchema.safeParse(binding).success)fail('CORRUPT','The acknowledgement is not a valid server revision.');
    return update(scope,(record,store,tx,done)=>{if(!record?.intent||record.attemptGeneration!==attemptGeneration)fail('STALE_GENERATION','The acknowledgement belongs to another pending attempt.');
      if(binding.payloadHash!==record.intent.candidateHash||binding.savedLocalRevision!==record.intent.localRevision||(record.intent.binding&&binding.planId!==record.intent.binding.planId))fail('INTENT_MISMATCH','The acknowledgement does not match the submitted candidate.');
      const acceptedBinding=record.binding?.planId===binding.planId&&record.binding.revisionNumber>binding.revisionNumber?record.binding:binding;
      const nextRecord={...record,scope:{...record.scope,planId:acceptedBinding.planId},binding:detached(acceptedBinding),intent:null,state:'checkpointed' as const,generation:next(record.generation),updatedAt:Date.now()};
      store.put(pack(nextRecord),recordKey(record.scope));
      const attempts=tx.objectStore('attempts'),key=attemptKey(record.scope,record.intent),get=attempts.get(key);get.onsuccess=()=>guarded(tx,()=>{const value=get.result as SharedAttempt|undefined;if(value)attempts.put({...value,owner:null,expiresAt:0},key);});done(nextRecord);
    },['branches','attempts']);
  }
  async function clearRejectedIntent(scope:JournalScope,attemptGeneration:number):Promise<JournalRecord>{return update(scope,(record,store,_tx,done)=>{if(!record?.intent||record.attemptGeneration!==attemptGeneration)fail('STALE_GENERATION','The pending recovery attempt changed.');
    const nextRecord={...record,intent:null,state:'checkpointed' as const,generation:next(record.generation),updatedAt:Date.now()};store.put(pack(nextRecord),recordKey(record.scope));done(nextRecord);});}
  async function setAutosave(scope:JournalScope,value:boolean):Promise<JournalRecord>{if(typeof value!=='boolean')fail('CORRUPT','Autosave preference must be explicit.');return update(scope,(record,store,_tx,done)=>{if(!record||value&&!record.binding)fail('CORRUPT','Checkpoint this saved draft before enabling autosave.');
    const nextRecord={...record,autosave:value,generation:next(record.generation),updatedAt:Date.now()};store.put(pack(nextRecord),recordKey(record.scope));done(nextRecord);});}
  async function claimAttempt(scope:JournalScope,attemptGeneration:number,owner:string,now=Date.now(),leaseMs=ATTEMPT_LEASE_MS):Promise<boolean>{
    if(!uuid.safeParse(owner).success||!Number.isFinite(now)||!Number.isInteger(leaseMs)||leaseMs<1000||leaseMs>120000)fail('CORRUPT','Invalid request coordination lease.');
    return update(scope,(record,_store,tx,done)=>{if(!record?.intent||record.attemptGeneration!==attemptGeneration)fail('STALE_GENERATION','The pending recovery attempt changed.');
      const store=tx.objectStore('attempts'),key=attemptKey(record.scope,record.intent),get=store.get(key);get.onsuccess=()=>guarded(tx,()=>{const attempt=get.result as SharedAttempt|undefined;
        if(!attempt||attempt.version!==1||attempt.requestIdentity!==requestIdentity(record.intent!))fail('CORRUPT','The shared request coordination record is invalid.');
        if(attempt.owner&&attempt.owner!==owner&&attempt.expiresAt>now){done(false);return;}
        store.put({...attempt,owner,expiresAt:now+leaseMs},key);done(true);});
    },['branches','attempts']);
  }
  async function releaseAttempt(scope:JournalScope,attemptGeneration:number,owner:string):Promise<void>{return update(scope,(record,_store,tx,done)=>{if(!record?.intent||record.attemptGeneration!==attemptGeneration){done();return;}
    const store=tx.objectStore('attempts'),key=attemptKey(record.scope,record.intent),get=store.get(key);get.onsuccess=()=>guarded(tx,()=>{const attempt=get.result as SharedAttempt|undefined;if(attempt?.owner===owner)store.put({...attempt,owner:null,expiresAt:0},key);done();});
  },['branches','attempts']);}
  async function forkRecovery(sourceScope:JournalScope,newScope:JournalScope,newLocalDraftId:string):Promise<JournalRecord>{
    const from=checkedScope(sourceScope,origin),to=checkedScope(newScope,origin);
    if(contextKey(from)!==contextKey(to)||from.planId!==to.planId||from.branchId===to.branchId)fail('CORRUPT','Recovery must create a separate branch in the same verified workspace and plan.');
    if(typeof newLocalDraftId!=='string'||!newLocalDraftId.trim()||newLocalDraftId.length>256||/[\u0000-\u001f\u007f]/.test(newLocalDraftId))fail('CORRUPT','Recovery requires a fresh valid local draft identity.');
    const original=await read(from);if(!original)fail('CORRUPT','The selected recovery branch is no longer available.');
    if(newLocalDraftId===original.draft.id)fail('CORRUPT','Recovery must preserve the original local draft identity separately.');
    const draft={...detached(original.draft),id:newLocalDraftId},intent=original.intent?{...detached(original.intent),draftId:newLocalDraftId}:null;
    const fork:JournalRecord={...original,scope:to,draft,intent,generation:1,updatedAt:Date.now()},stored=pack(fork);
    return transaction(['branches'],'readwrite',(tx,done)=>{const store=tx.objectStore('branches'),source=store.get(recordKey(from));
      source.onsuccess=()=>guarded(tx,()=>{if(source.result===undefined)fail('STALE_GENERATION','The original recovery branch changed.');
        const current=unpack(source.result,origin);if(canonicalJson(current)!==canonicalJson(original))fail('STALE_GENERATION','A newer recovery checkpoint exists. Resume it explicitly rather than replacing it.');
        const destination=store.get(recordKey(to));destination.onsuccess=()=>guarded(tx,()=>{if(destination.result!==undefined)fail('STALE_GENERATION','The new recovery branch already exists.');store.put(stored,recordKey(to));done(detached(fork));});});
    });
  }
  async function close(){closed=true;if(connection)(await connection).close();}
  return {read,list,checkpoint,prepareIntent,markIntent,acknowledge,clearRejectedIntent,setAutosave,claimAttempt,releaseAttempt,forkRecovery,close};
}
export type RecoveryJournal=ReturnType<typeof createRecoveryJournal>;
