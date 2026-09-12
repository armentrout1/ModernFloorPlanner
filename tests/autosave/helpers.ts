import { expect, type Page } from '@playwright/test';
import postgres from 'postgres';
import { account,panel,signIn,createWorkspace,roomFields,roomField,commit,savePanel,savePhysical,physical,selectedPhysical } from '../persistence/browser-helpers';
export * from '../persistence/browser-helpers';
export const autosave = (page:Page)=>savePanel(page).getByRole('switch',{name:'Autosave',exact:true});
export const recoveryStatus=(page:Page)=>page.getByTestId('physical-recovery-status');
export async function setup(page:Page,name:string,options:{extraLevel?:boolean}={}){
  await page.goto('/physical-draft'); await signIn(page);const workspace=await createWorkspace(page,name);
  await physical(page,name);await roomFields(page).getByLabel('Room name',{exact:true}).press('Enter');
  if(options.extraLevel){
    const initial=(await selectedPhysical(page)).levelView!.activeLevelId;
    await page.getByRole('button',{name:'Add level',exact:true}).click();
    await page.getByLabel('Level name',{exact:true}).fill('Upper floor');
    await page.getByRole('button',{name:'Rename level',exact:true}).click();
    await page.getByRole('combobox',{name:'Editing level',exact:true}).selectOption(initial);
  }
  const takeoff=page.getByTestId('takeoff-panel');
  for(const [output,label,target] of [['floor-area','Floor area','rooms'],['ceiling-area','Flat ceiling area','rooms'],['gross-wall-area','Gross wall area','walls']]){
    await takeoff.getByRole('checkbox',{name:'Measure '+label,exact:true}).check();
    await takeoff.getByRole('combobox',{name:'Configure work',exact:true}).selectOption(output);
    await takeoff.getByRole('button',{name:'All levels’ current targets',exact:true}).click();
  }
  const saved=await savePhysical(page);return{workspace,saved};
}
export async function api(page:Page,path:string,method='GET',body?:unknown,headers:Record<string,string>={}){
  return page.evaluate(async({path,method,body,headers})=>{
    const session=await fetch('/api/auth/session',{cache:'no-store'}).then(r=>r.json());
    const response=await fetch(path,{method,headers:{'Content-Type':'application/json','X-MFP-Request':'1',
      'X-MFP-Context':session.contextToken,'X-MFP-Workspace-Id':session.workspace.id,...headers},
      ...(body?{body:JSON.stringify(body)}:{})});
    return{status:response.status,value:await response.json()};
  },{path,method,body,headers});
}
export async function counts(planId:string){
  const db=postgres(process.env.DATABASE_URL!,{max:1,onnotice:()=>{}});
  try{
    const [r]=await db`select count(*)::int as n from physical_plan_revisions where plan_id=${planId}`;
    const [k]=await db`select count(*)::int as n from physical_save_receipts where plan_id=${planId}`;
    return{revisions:r.n,receipts:k.n};
  }finally{await db.end();}
}
export async function membership(workspaceId:string,principalId:string,values:{role?:string,status?:string}){
  const db=postgres(process.env.DATABASE_URL!,{max:1,onnotice:()=>{}});
  try{
    if(values.role)await db`update workspace_memberships set role=${values.role} where workspace_id=${workspaceId} and principal_id=${principalId}`;
    if(values.status)await db`update workspace_memberships set status=${values.status} where workspace_id=${workspaceId} and principal_id=${principalId}`;
  }finally{await db.end();}
}
export async function resumeLocal(page:Page){
  const active=await page.evaluate(()=>sessionStorage.getItem('modern-floor-planner:working-context:v1'));
  if(!active?.startsWith('workspace:')||await page.getByRole('region',{name:'Choose local working context'}).isVisible()){
    await account(page);await panel(page).getByRole('button',{name:'Resume workspace local work',exact:true}).click();
  }
}
export async function openFirst(page:Page){
  await savePanel(page).getByRole('button',{name:'Open saved plan',exact:true}).click();
  await savePanel(page).getByRole('button',{name:'Open separate copy',exact:true}).first().click();
  await expect(page.getByTestId('physical-save-status')).toHaveText(/^Saved revision /);
}
export async function discoverResume(page:Page,branchId?:string){
  await resumeLocal(page);
  await savePanel(page).getByRole('button',{name:'Find recovery on this device',exact:true}).click();
  const choice=branchId?savePanel(page).locator('[data-branch-id="'+branchId+'"]'):savePanel(page);
  await choice.getByRole('button',{name:'Resume recovery',exact:true}).first().click();
  await expect(savePanel(page)).toContainText('Resumed recovery as a separate local draft.');
  await expect(page.getByTestId('physical-draft-id')).toBeVisible();
}
export function deferred(){let resolve!:()=>void;const promise=new Promise<void>(yes=>resolve=yes);return{resolve,promise};}
export function quantity(response:any,output:string){const item=response.evaluation.snapshot.evaluation.calculation.outputs.find((value:any)=>value.output===output);expect(item?.total).toBeTruthy();return Object.fromEntries(Object.entries(item.total).map(([key,value])=>[key,typeof value==='number'&&key!=='wasteFraction'?value/(304.8**2):value])) as Record<string,number>;}

export async function setAutosave(page:Page,enabled=true){if((await autosave(page).getAttribute('aria-checked'))!==String(enabled))await autosave(page).click();await expect(autosave(page)).toHaveAttribute('aria-checked',String(enabled));}

export async function branchForSelected(page:Page){
 const draft=await selectedPhysical(page);
 const rows=await page.evaluate(()=>new Promise<any[]>((resolve,reject)=>{
   const request=indexedDB.open('modern-floor-planner:physical-recovery:v1',1);
   request.onerror=()=>reject(Error('Test journal unavailable'));
   request.onsuccess=()=>{const db=request.result,tx=db.transaction('branches','readonly');const read=tx.objectStore('branches').getAll();let rows:any[]=[];read.onsuccess=()=>{rows=read.result;};tx.oncomplete=()=>{db.close();resolve(rows);};tx.onabort=()=>{db.close();reject(Error('Test journal read aborted'));};};
 }));
 const match=rows.filter(row=>JSON.parse(row.draftText).drafts[0].id===draft.id);expect(match).toHaveLength(1);return match[0].scope.branchId as string;
}
