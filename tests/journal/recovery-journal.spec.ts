import { test, expect } from '@playwright/test';

test.beforeEach(async({page})=>{
  await page.goto('/');
  await page.evaluate(async()=>{
    const module=await import('/journal-test.js'),name='journal-test-'+crypto.randomUUID(),draft=module.basicPhysicalSaveDraft();
    const envelope=module.capturePhysicalSaveEnvelope(draft),payloadHash=await module.physicalSavePayloadHash(envelope);
    const scope={origin:location.origin,principalId:crypto.randomUUID(),workspaceId:crypto.randomUUID(),planId:crypto.randomUUID(),branchId:crypto.randomUUID()};
    const revisionId=crypto.randomUUID(),binding={planId:scope.planId,revisionId,revisionNumber:1,etag:`"mfp-physical-${revisionId}"`,payloadHash,savedLocalRevision:draft.localEditRevision};
    const journal=module.createRecoveryJournal({dbName:name});
    const initial=await journal.checkpoint(scope,draft,{binding,autosave:true});
    const readBytes=async()=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
      try{return await new Promise<string>((resolve,reject)=>{const tx=db.transaction('branches'),q=tx.objectStore('branches').get(JSON.stringify([scope.origin,scope.principalId,scope.workspaceId,scope.branchId]));let value:string;q.onsuccess=()=>{value=JSON.stringify(q.result);};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(tx.error);});}finally{db.close();}};
    const mutate=async(fn:(record:any)=>void)=>{const db=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});
      try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('branches','readwrite'),store=tx.objectStore('branches'),key=JSON.stringify([scope.origin,scope.principalId,scope.workspaceId,scope.branchId]),q=store.get(key);q.onsuccess=()=>{fn(q.result);store.put(q.result,key);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{db.close();}};
    (window as any).fixture={module,name,draft,envelope,payloadHash,scope,binding,journal,initial,readBytes,mutate,
      intent:{draftId:draft.id,localRevision:draft.localEditRevision,envelope,key:crypto.randomUUID(),binding,candidateHash:payloadHash,operation:'append',resource:scope.planId}};
  });
});

test('real IndexedDB checkpoints detach full rich source, raw text, units and persisted autosave preference',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture;let d=f.module.richPhysicalSaveDraft();d=f.module.editField(d,'lower-room','ceilingHeight','9 ft -');
    const scope={...f.scope,branchId:crypto.randomUUID()};await f.journal.checkpoint(scope,d,{binding:f.binding,autosave:true});const expected=JSON.stringify(d);d.document.name='Mutated caller';
    const recovered=await f.journal.read(scope);return{equal:JSON.stringify(recovered.draft)===expected,text:recovered.draft.fields['lower-room'].ceilingHeight.text,dirty:recovered.draft.fields['lower-room'].ceilingHeight.dirty,unit:recovered.draft.fields['lower-room'].ceilingHeight.unit,on:recovered.autosave};});
  expect(result).toEqual({equal:true,text:'9 ft -',dirty:true,unit:'ft',on:true});
});

test('request success followed by transaction abort never reports durable checkpoint or replaces prior bytes',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,before=await f.readBytes(),original=IDBObjectStore.prototype.put;let requestSucceeded=false;
    IDBObjectStore.prototype.put=function(...args:any[]){const q=original.apply(this,args as any);if(this.name==='branches')q.addEventListener('success',()=>{requestSucceeded=true;this.transaction.abort();},{once:true});return q;};
    let code='';try{await f.journal.checkpoint(f.scope,f.module.editField(f.draft,'room','width','10 ft -'));}catch(e){code=(e as any).code;}finally{IDBObjectStore.prototype.put=original;}
    return{requestSucceeded,code,preserved:before===await f.readBytes()};});
  expect(result).toEqual({requestSucceeded:true,code:'UNAVAILABLE',preserved:true});
});

test('acknowledgement atomically clears matching intent and advances binding without erasing newer raw checkpoint',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,prepared=await f.journal.prepareIntent(f.scope,f.intent,{expectedGeneration:f.initial.generation});
    const newer=f.module.editField(f.draft,'room','ceilingHeight','9 ft -');const checkpoint=await f.journal.checkpoint(f.scope,newer);
    const revisionId=crypto.randomUUID(),ack={...f.binding,revisionId,revisionNumber:2,etag:`"mfp-physical-${revisionId}"`};
    const record=await f.journal.acknowledge(f.scope,prepared.attemptGeneration,ack),read=await f.journal.read(f.scope);
    return{intent:read.intent,revision:read.binding.revisionNumber,text:read.draft.fields.room.ceilingHeight.text,dirty:read.draft.fields.room.ceilingHeight.dirty,newerGeneration:record.generation>checkpoint.generation,exact:JSON.stringify(newer)===JSON.stringify(read.draft)};});
  expect(result).toEqual({intent:null,revision:2,text:'9 ft -',dirty:true,newerGeneration:true,exact:true});
});

test('abort after acknowledgement writes retains exact uncertain intent and previous binding for receipt replay',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,p=await f.journal.prepareIntent(f.scope,f.intent);await f.journal.markIntent(f.scope,p.attemptGeneration,'uncertain');const before=await f.readBytes(),original=IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put=function(...args:any[]){const q=original.apply(this,args as any);if(this.name==='branches')q.addEventListener('success',()=>this.transaction.abort(),{once:true});return q;};
    const revisionId=crypto.randomUUID();let code='';try{await f.journal.acknowledge(f.scope,p.attemptGeneration,{...f.binding,revisionId,revisionNumber:2,etag:`"mfp-physical-${revisionId}"`});}catch(e){code=(e as any).code;}finally{IDBObjectStore.prototype.put=original;}
    const read=await f.journal.read(f.scope);return{code,preserved:before===await f.readBytes(),key:read.intent.key===f.intent.key,revision:read.binding.revisionNumber,state:read.state};});
  expect(result).toEqual({code:'UNAVAILABLE',preserved:true,key:true,revision:1,state:'uncertain'});
});

test('prepared and dispatched crash windows survive new journal instances with exact body, key and base',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,p=await f.journal.prepareIntent(f.scope,f.intent);
    const a=f.module.createRecoveryJournal({dbName:f.name}),before=await a.read(f.scope);await f.journal.markIntent(f.scope,p.attemptGeneration,'dispatched');
    const b=f.module.createRecoveryJournal({dbName:f.name}),after=await b.read(f.scope);await a.close();await b.close();
    return{prepared:before.state,dispatched:after.state,exact:JSON.stringify(before.intent)===JSON.stringify(after.intent),same:JSON.stringify(after.intent)===JSON.stringify(f.intent)};});
  expect(result).toEqual({prepared:'prepared',dispatched:'dispatched',exact:true,same:true});
});

test('monotonic generations and stale-writer guards prevent delayed checkpoints replacing newer edits',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,newer=f.module.editField(f.draft,'room','width','11 ft -');const saved=await f.journal.checkpoint(f.scope,newer,{expectedGeneration:f.initial.generation}),before=await f.readBytes();
    const codes=[];for(const options of [{expectedGeneration:f.initial.generation},{}])try{await f.journal.checkpoint(f.scope,f.draft,options);}catch(e){codes.push((e as any).code);}
    return{codes,generation:saved.generation,previous:f.initial.generation,preserved:before===await f.readBytes()};});
  expect(result.codes).toEqual(['STALE_GENERATION','STALE_GENERATION']);expect(result.generation).toBeGreaterThan(result.previous);expect(result.preserved).toBe(true);
});

test('two branches retain independent drafts and one copied intent is atomically leased until expiry',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,other={...f.scope,branchId:crypto.randomUUID()};await f.journal.checkpoint(other,f.module.editField(f.draft,'room','width','11 ft -'),{binding:f.binding});
    const [a,b]=await Promise.all([f.journal.prepareIntent(f.scope,f.intent),f.journal.prepareIntent(other,f.intent)]);
    const owners=[crypto.randomUUID(),crypto.randomUUID()],claims=await Promise.all([f.journal.claimAttempt(f.scope,a.attemptGeneration,owners[0],1000),f.journal.claimAttempt(other,b.attemptGeneration,owners[1],1000)]);
    const later=await f.journal.claimAttempt(other,b.attemptGeneration,owners[1],32000),first=await f.journal.read(f.scope),second=await f.journal.read(other);
    return{claims:claims.sort(),later,first:first.draft.fields.room.width.text,second:second.draft.fields.room.width.text,exact:JSON.stringify(first.intent)===JSON.stringify(second.intent)};});
  expect(result.claims).toEqual([false,true]);expect(result.later).toBe(true);expect(result.first).not.toBe(result.second);expect(result.exact).toBe(true);
});

test('a dispatched intent is immutable and copied idempotency keys cannot identify another payload',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,p=await f.journal.prepareIntent(f.scope,f.intent);await f.journal.markIntent(f.scope,p.attemptGeneration,'dispatched');
    const candidate=structuredClone(f.intent);candidate.envelope.document.name='Changed name';candidate.candidateHash=await f.module.physicalSavePayloadHash(candidate.envelope);
    let local='',shared='';try{await f.journal.prepareIntent(f.scope,candidate);}catch(e){local=(e as any).code;}
    const other={...f.scope,branchId:crypto.randomUUID()};await f.journal.checkpoint(other,f.draft,{binding:f.binding});try{await f.journal.prepareIntent(other,candidate);}catch(e){shared=(e as any).code;}
    return{local,shared,original:JSON.stringify((await f.journal.read(f.scope)).intent)===JSON.stringify(f.intent),empty:(await f.journal.read(other)).intent===null};});
  expect(result).toEqual({local:'INTENT_EXISTS',shared:'INTENT_MISMATCH',original:true,empty:true});
});

test('storage denial and injected quota failure preserve memory and previous recovery bytes',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,before=await f.readBytes(),memory=JSON.stringify(f.draft);let denied='',quota='';
    const blocked=f.module.createRecoveryJournal({dbName:'denied',indexedDB:{open(){throw new DOMException('Denied','SecurityError');}}});try{await blocked.checkpoint(f.scope,f.draft,{binding:f.binding});}catch(e){denied=(e as any).code;}
    const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw new DOMException('Quota exhausted','QuotaExceededError');};
    try{await f.journal.checkpoint(f.scope,f.module.editField(f.draft,'room','width','12 ft -'));}catch(e){quota=(e as any).code;}finally{IDBObjectStore.prototype.put=original;}
    return{denied,quotaName:quota||'DOMException',prior:before===await f.readBytes(),memory:memory===JSON.stringify(f.draft)};});
  expect(result.denied).toBe('UNAVAILABLE');expect(result.prior).toBe(true);expect(result.memory).toBe(true);
});

test('corrupt and unsupported stored bytes are never repaired or replaced silently',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,results=[];
    for(const change of [(r:any)=>r.version=99,(r:any)=>{r.version=1;r.draftText='{bad';}]){await f.mutate(change);const before=await f.readBytes();let read='',write='';try{await f.journal.read(f.scope);}catch(e){read=(e as any).code;}try{await f.journal.checkpoint(f.scope,f.draft,{binding:f.binding});}catch(e){write=(e as any).code;}results.push({read,write,prior:before===await f.readBytes()});}return results;});
  expect(result).toEqual([{read:'UNSUPPORTED',write:'UNSUPPORTED',prior:true},{read:'CORRUPT',write:'CORRUPT',prior:true}]);
});

test('request fingerprint corruption pauses discovery without deleting the uncertain intent',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture;await f.journal.prepareIntent(f.scope,f.intent);await f.mutate((r:any)=>r.intent.candidateHash='a'.repeat(64));const before=await f.readBytes();let code='';try{await f.journal.read(f.scope);}catch(e){code=(e as any).code;}return{code,prior:before===await f.readBytes()};});
  expect(result).toEqual({code:'CORRUPT',prior:true});
});

test('account and plan scope boundaries exclude other branches; no stored label grants access',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,a=await f.journal.list({origin:f.scope.origin,principalId:f.scope.principalId,workspaceId:f.scope.workspaceId}),b=await f.journal.list({origin:f.scope.origin,principalId:crypto.randomUUID(),workspaceId:f.scope.workspaceId});let wrongPlan='',wrongOrigin='';
    try{await f.journal.read({...f.scope,planId:crypto.randomUUID()});}catch(e){wrongPlan=(e as any).code;}try{await f.journal.read({...f.scope,origin:'https://other.example'});}catch(e){wrongOrigin=(e as any).code;}
    return{a:a.length,b:b.length,wrongPlan,wrongOrigin};});expect(result).toEqual({a:1,b:0,wrongPlan:'STALE_GENERATION',wrongOrigin:'CORRUPT'});
});

test('turning autosave off preserves a dispatched intent, and newer binding is not rewound by older accepted receipt',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,p=await f.journal.prepareIntent(f.scope,f.intent);await f.journal.markIntent(f.scope,p.attemptGeneration,'dispatched');await f.journal.setAutosave(f.scope,false);
    const laterId=crypto.randomUUID();await f.mutate((r:any)=>{r.binding={...r.binding,revisionNumber:3,revisionId:laterId,etag:`"mfp-physical-${laterId}"`};});
    const receiptId=crypto.randomUUID(),record=await f.journal.acknowledge(f.scope,p.attemptGeneration,{...f.binding,revisionNumber:2,revisionId:receiptId,etag:`"mfp-physical-${receiptId}"`});
    return{on:record.autosave,revision:record.binding.revisionNumber,intent:record.intent,state:record.state};});expect(result).toEqual({on:false,revision:3,intent:null,state:'checkpointed'});
});

test('first explicit create acknowledgement atomically changes plan scope without altering local draft identity',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,scope={...f.scope,branchId:crypto.randomUUID(),planId:null};await f.journal.checkpoint(scope,f.draft,{binding:null});
    const intent={...f.intent,binding:null,operation:'create',resource:'collection'},p=await f.journal.prepareIntent(scope,intent),record=await f.journal.acknowledge(scope,p.attemptGeneration,f.binding);
    return{plan:record.scope.planId===f.binding.planId,id:record.draft.id===f.draft.id,read:(await f.journal.read(record.scope)).binding.revisionNumber,autosave:record.autosave};});expect(result).toEqual({plan:true,id:true,read:1,autosave:false});
});

test('version change closes this journal and preserves records while another connection blocks the upgrade',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,before=await f.readBytes(),held=await new Promise<IDBDatabase>((resolve,reject)=>{const q=indexedDB.open(f.name);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});held.onversionchange=()=>{};
    let upgrade:IDBOpenDBRequest;const blocked=await new Promise<boolean>((resolve,reject)=>{upgrade=indexedDB.open(f.name,2);upgrade.onblocked=()=>resolve(true);upgrade.onerror=()=>reject(upgrade.error);});
    let code='';try{await f.journal.checkpoint(f.scope,f.draft);}catch(e){code=(e as any).code;}held.close();
    const upgraded=await new Promise<IDBDatabase>((resolve,reject)=>{upgrade.onsuccess=()=>resolve(upgrade.result);upgrade.onerror=()=>reject(upgrade.error);});upgraded.close();
    const after=await f.readBytes(),reopen=f.module.createRecoveryJournal({dbName:f.name});let unsupported='';try{await reopen.read(f.scope);}catch(e){unsupported=(e as any).code;}
    return{blocked,code,unsupported,prior:before===after};});expect(result).toEqual({blocked:true,code:'UNAVAILABLE',unsupported:'UNSUPPORTED',prior:true});
});


test('explicit recovery forks a separate local branch preserving original bytes and exact uncertain network request',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,p=await f.journal.prepareIntent(f.scope,f.intent);await f.journal.markIntent(f.scope,p.attemptGeneration,'uncertain');await f.journal.checkpoint(f.scope,f.module.editField(f.draft,'room','ceilingHeight','9 ft -'));
    const before=await f.readBytes(),scope={...f.scope,branchId:crypto.randomUUID()},newId=crypto.randomUUID(),fork=await f.journal.forkRecovery(f.scope,scope,newId);
    const original=await f.journal.read(f.scope),copied=await f.journal.read(scope),strip=(intent:any)=>{const{draftId,...rest}=intent;return rest;};
    return{prior:before===await f.readBytes(),branches:(await f.journal.list({origin:f.scope.origin,principalId:f.scope.principalId,workspaceId:f.scope.workspaceId})).length,
      ids:original.draft.id!==copied.draft.id&&copied.draft.id===newId,intentId:copied.intent.draftId===newId,text:copied.draft.fields.room.ceilingHeight.text,state:copied.state,
      exact:JSON.stringify(strip(original.intent))===JSON.stringify(strip(copied.intent)),generation:fork.generation};});
  expect(result).toEqual({prior:true,branches:2,ids:true,intentId:true,text:'9 ft -',state:'uncertain',exact:true,generation:1});
});

test('pausing preserves definitely-unsent provenance and never erases the exact candidate',async({page})=>{
  const result=await page.evaluate(async()=>{const f=(window as any).fixture,p=await f.journal.prepareIntent(f.scope,f.intent);
    const prepared=await f.journal.markIntent(f.scope,p.attemptGeneration,'paused');
    await f.journal.markIntent(f.scope,p.attemptGeneration,'dispatched');const dispatched=await f.journal.markIntent(f.scope,p.attemptGeneration,'paused');
    return{prepared:prepared.state,dispatched:dispatched.state,exact:JSON.stringify(prepared.intent)===JSON.stringify(dispatched.intent)&&JSON.stringify(dispatched.intent)===JSON.stringify(f.intent)};});
  expect(result).toEqual({prepared:'prepared',dispatched:'paused',exact:true});
});
