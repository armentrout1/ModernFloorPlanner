import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { capturePhysicalSaveEnvelope, restorePhysicalSaveDraft } from '@shared/persistence/physicalSave';
import type { PhysicalPlanRevision } from '@shared/persistence/physicalPlan';
import { accountStore, captureRequestContext, contextFetch, assertRequestContext, resumeLocalContext } from '../account/runtime';
import { checkpointContext, workspaceContext } from '../account/localContexts';
import { useLocalEditorContext } from '../account/useLocalState';
import { getPhysicalDraftStore } from '../account/physicalStores';
import { usePhysicalDraft } from './provider';
import { selectedDraft, insertDraft } from './state';
import { pendingSaveFields, type PendingSaveField } from './pendingSaveFields';
import type { JournalRecord } from './recoveryJournal';
import { getPhysicalSaveManager } from './accountSaveState';

interface PlanSummary { planId: string; name: string; revisionNumber: number }
const keepField = (event: PointerEvent<HTMLButtonElement>) => { if (event.button === 0) event.preventDefault(); };
export function AccountSavePanel() {
  const { registry, store, cache } = usePhysicalDraft(), draft = selectedDraft(registry);
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.getSnapshot);
  const context = useLocalEditorContext(), manager = getPhysicalSaveManager(context);
  useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const [notice, setNotice] = useState(''), [showPending, setShowPending] = useState(false);
  const [plans, setPlans] = useState<PlanSummary[] | null>(null), [cursor, setCursor] = useState<string | null>(null), [loading, setLoading] = useState(false);
  const [recovery, setRecovery] = useState<{ generation: number; context: string; records: JournalRecord[] } | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { setPlans(null); setCursor(null); setNotice(''); setRecovery(null); }, [account.generation, context]);
  const { principal, workspace } = account.session;
  const verified = account.session.status === 'authenticated' && principal && workspace;
  const workspaceKey = verified ? workspaceContext(principal.id, workspace.id) : null;
  const bound = Boolean(verified && context === workspaceKey && account.editorContext === workspaceKey && !account.checking);
  const canWrite = bound && ['owner', 'editor'].includes(workspace!.role);
  useEffect(() => {
    if (!bound) { manager.observe(null); return; }
    const observe = () => manager.observe(selectedDraft(store.getSnapshot().registry));
    observe(); const unsubscribe = store.subscribe(observe);
    return () => { unsubscribe(); manager.observe(null); };
  }, [manager, store, bound]);
  const state = draft ? manager.state(draft.id) : null, pending = draft ? pendingSaveFields(draft) : [];
  const changed = Boolean(draft && state?.binding && !state.acknowledgedCurrent);
  const blocked = ['uninitialized', 'corrupt', 'unsupported'].includes(cache);
  const status = !state || !bound ? 'Local-only' : state.phase === 'saving' ? 'Saving…'
    : state.phase === 'conflict' ? 'Conflict — local work preserved'
    : state.phase === 'failed' ? 'Save failed — local work preserved'
    : state.phase === 'waiting' ? 'Waiting to autosave committed changes'
    : state.phase === 'paused' ? state.autosave ? 'Autosave paused' : 'Save paused'
    : state.binding ? changed ? 'Unsaved changes' : `Saved revision ${state.binding.revisionNumber}` : 'Local-only';
  const recoveryStatus = state?.recovery === 'checkpointed' ? 'Local checkpoint saved on this device.'
    : state?.recovery === 'checkpointing' ? 'Saving local checkpoint…'
    : state?.recovery === 'unavailable' ? 'Local recovery unavailable. Work remains in memory.'
    : 'Current edits are in memory; no durable local checkpoint yet.';
  const recoveryRows = bound && recovery?.generation === account.generation && recovery.context === context ? recovery.records : null;
  const currentUi = (generation: number) => mounted.current && accountStore.getSnapshot().generation === generation && accountStore.getSnapshot().editorContext === context;
  async function toggleAutosave() {
    if (!draft) return; const generation = account.generation; setNotice('');
    try { await manager.setAutosave(draft, !state?.autosave); }
    catch (error) { if (currentUi(generation)) setNotice(error instanceof Error ? error.message : 'Autosave could not be changed.'); }
  }
  async function findRecovery() {
    const generation = account.generation; setLoading(true); setNotice(''); setRecovery(null);
    try { const records = await manager.discoverRecovery(); if (currentUi(generation)) setRecovery({ generation, context, records }); }
    catch (error) { if (currentUi(generation)) setNotice(error instanceof Error ? error.message : 'Local recovery could not be read.'); }
    finally { if (currentUi(generation)) setLoading(false); }
  }
  async function resumeRecovery(record: JournalRecord) {
    const generation = account.generation; setLoading(true); setNotice('');
    try {
      if (!checkpointContext(context)) throw Error('The current draft could not be checkpointed. Keep this page open; it has not been replaced.');
      const restored = await manager.resumeRecovery(record, crypto.randomUUID());
      if (!currentUi(generation)) return;
      if (!store.dispatch(current => insertDraft(current, restored))) throw Error('Recovery could not be inserted. The current draft and original checkpoint are preserved.');
      setRecovery(null); setShowPending(true); setNotice('Resumed recovery as a separate local draft. The previous draft and original checkpoint remain preserved.');
    } catch (error) { if (currentUi(generation)) setNotice(error instanceof Error ? error.message : 'Recovery could not be resumed.'); }
    finally { if (currentUi(generation)) setLoading(false); }
  }
  async function save(mode: 'current' | 'new' | 'retry' = 'current') {
    setNotice('');
    if (!draft) return;
    const unappliedAction = document.querySelector<HTMLElement>('[data-testid="physical-view"] [data-physical-unapplied-action]');
    if (mode !== 'retry' && unappliedAction) { setShowPending(true); setNotice(unappliedAction.dataset.physicalUnappliedAction!); return; }
    if (mode !== 'retry' && pending.length) { setShowPending(true); setNotice('Apply or Revert each unfinished field below before saving.'); return; }
    try { await manager.save(draft, mode); } catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : 'The save could not start.'); }
  }
  function resolveField(field: PendingSaveField, action: 'apply' | 'revert') {
    if (!draft) return;
    setNotice('');
    store.updateDraft(draft.id, draft.localEditRevision, current => {
      const live = pendingSaveFields(current).find(item => item.key === field.key);
      if (!live) return current;
      const next = action === 'apply' ? live.apply(current, new Date().toISOString()) : live.revert(current);
      if (action === 'apply' && pendingSaveFields(next).some(item => item.key === live.key)) throw Error(`Correct ${live.label}, or Revert its unfinished value.`);
      return next;
    });
  }
  async function enterWorkspace(copy: boolean) {
    if (!workspaceKey) return;
    setNotice('');
    if (copy && pending.length) { setShowPending(true); setNotice('Apply or Revert unfinished fields before making a workspace copy.'); return; }
    try {
      const envelope = copy && draft ? capturePhysicalSaveEnvelope(draft) : null;
      const captured = await captureRequestContext(); assertRequestContext(captured);
      if (!checkpointContext(context)) throw Error('Temporary recovery could not be verified. Keep this page open; the source draft is preserved in memory.');
      const copyDraft = envelope ? restorePhysicalSaveDraft(envelope, crypto.randomUUID(), draft!.displayUnit) : null;
      const target = getPhysicalDraftStore(workspaceKey); target.hydrate();
      if (copyDraft && ['corrupt', 'unsupported', 'conflict'].includes(target.getSnapshot().cache))
        throw Error('The destination has preserved recovery data that needs attention. Your source remains here; open that workspace separately before copying.');
      resumeLocalContext(workspaceKey);
      if (copyDraft && !target.dispatch(current => insertDraft(current, copyDraft)))
        throw Error(target.getSnapshot().error || 'The workspace copy could not be added. The original draft is preserved.');
    } catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : 'The workspace could not be opened.'); }
  }
  async function list(more = false) {
    setLoading(true); setNotice('');
    try {
      const captured = await captureRequestContext();
      const response = await contextFetch('GET', '/api/physical-plans?limit=20' + (more && cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), undefined, captured);
      const value = await response.json();
      if (!response.ok) throw Error(value.message ?? 'Plans could not be listed.');
      assertRequestContext(captured);
      if (mounted.current) { setPlans(previous => more ? [...(previous ?? []), ...value.plans] : value.plans); setCursor(value.nextCursor ?? null); }
    } catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : 'Plans could not be listed.'); }
    finally { if (mounted.current) setLoading(false); }
  }
  async function open(planId: string) {
    setLoading(true); setNotice('');
    try {
      const captured = await captureRequestContext();
      const response = await contextFetch('GET', '/api/physical-plans/' + encodeURIComponent(planId), undefined, captured);
      const value = await response.json();
      if (!response.ok) throw Error(value.message ?? 'This plan could not be opened.');
      const revision = value as PhysicalPlanRevision;
      if (revision.etag !== response.headers.get('ETag')) throw Error('This response did not identify an exact saved revision.');
      const copy = restorePhysicalSaveDraft(revision.envelope, crypto.randomUUID());
      assertRequestContext(captured);
      if (!checkpointContext(context)) throw Error('Preserve the current draft before opening another plan: temporary recovery is unavailable.');
      if (!store.dispatch(current => insertDraft(current, copy))) throw Error('The opened document could not be added. Existing drafts are unchanged.');
      manager.opened(copy.id, copy.localEditRevision, revision);
      if (mounted.current) { setPlans(null); setNotice('Opened a separate local copy. Your other drafts remain available in Selected physical draft.'); }
    } catch (error) { if (mounted.current) setNotice(error instanceof Error ? error.message : 'This plan could not be opened.'); }
    finally { if (mounted.current) setLoading(false); }
  }
  return <section aria-label="Account Save and Open" className="space-y-3 rounded-lg border bg-white p-4" data-physical-layout-control>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 className="font-semibold">Account Save / Open</h2><p role="status" data-testid="physical-save-status" className="text-sm">{status}</p></div>
      {bound ? <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" role="switch" aria-checked={Boolean(state?.autosave)} aria-label="Autosave"
          onPointerDown={keepField} disabled={!canWrite || !draft || !state?.binding || blocked} onClick={() => void toggleAutosave()}>Autosave {state?.autosave ? 'on' : 'off'}</Button>
        <Button variant="outline" onPointerDown={keepField} disabled={loading || blocked} onClick={() => void list()}>Open saved plan</Button>
        {state?.retryable ? <Button onPointerDown={keepField} disabled={!canWrite || !draft || state.phase === 'saving' || blocked} onClick={() => void save('retry')}>Retry same save request</Button>
          : <Button onPointerDown={keepField} disabled={!canWrite || !draft || state?.phase === 'saving' || state?.phase === 'conflict' || (state?.phase === 'saved' && !changed) || blocked} onClick={() => void save()}>Save to {workspace!.name}</Button>}
      </div> : null}
    </div>
    {bound ? <p className="text-xs text-slate-600">Destination: {workspace!.name}. First Save is explicit; Autosave stays off until enabled for this plan. {workspace!.role === 'viewer' ? 'Viewer access: saved plans can be opened, but not changed.' : ''}</p>
      : verified ? <div className="space-y-2 text-sm"><p>Your unassigned drafts remain separate from {workspace!.name}. Choose an explicit workspace copy before uploading.</p>
        <Button variant="outline" onPointerDown={keepField} disabled={blocked || account.checking} onClick={() => void enterWorkspace(Boolean(draft))}>{draft ? 'Copy this draft to ' : 'Use selected workspace: '}{workspace!.name}</Button>
        {draft ? <p className="text-xs text-slate-600">The original stays here. This makes a local workspace copy; use Save afterward to upload it.</p> : null}</div>
        : <p className="text-sm text-slate-600">Account saving is unavailable here until sign-in and a workspace are configured and selected. Local drafts remain in this browser tab.</p>}
    {bound ? <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
      <p role="status" data-testid="physical-recovery-status">{recoveryStatus}</p>
      <Button size="sm" variant="ghost" disabled={loading || !canWrite || blocked} onPointerDown={keepField} onClick={() => void findRecovery()}>Find recovery on this device</Button>
      {state?.recoveryMessage ? <p className="w-full text-amber-800">{state.recoveryMessage}</p> : null}
    </div> : null}
    {state?.binding && bound ? <p className="text-xs text-slate-500" data-testid="physical-saved-revision">Plan {state.binding.planId} · revision {state.binding.revisionNumber} · {state.binding.revisionId}{changed ? ' · newer local edits are unsaved' : ''}</p> : null}
    {state?.message && bound ? <p role={state.phase === 'failed' || state.phase === 'conflict' ? 'alert' : 'status'} className="text-sm text-amber-800">{state.message}</p> : null}
    {notice ? <p role="alert" className="text-sm text-amber-800">{notice}</p> : null}
    {state?.phase === 'conflict' && state.binding && bound ? <div className="flex flex-wrap gap-2">
      <Button variant="outline" onPointerDown={keepField} disabled={loading} onClick={() => void open(state.binding!.planId)}>Open latest as separate copy</Button>
      <Button onPointerDown={keepField} disabled={!canWrite} onClick={() => void save('new')}>Save candidate as new plan</Button>
    </div> : null}
    {(showPending || state?.pending || pending.length > 0) && pending.length ? <div aria-label="Unfinished fields blocking Save" className="space-y-2 border-t pt-3"><p className="text-sm font-medium">Unfinished fields — Apply or Revert individually</p>
      {pending.map(field => <div key={field.key} className="flex flex-wrap items-center gap-2 text-sm"><span className="min-w-0 flex-1">{field.label}: <span className="font-mono">{field.text || '(empty)'}</span></span>
        <Button size="sm" variant="outline" aria-label={'Apply pending ' + field.label} onPointerDown={keepField} onClick={() => resolveField(field, 'apply')}>Apply</Button>
        <Button size="sm" variant="ghost" aria-label={'Revert pending ' + field.label} onPointerDown={keepField} onClick={() => resolveField(field, 'revert')}>Revert</Button></div>)}
    </div> : null}
    {recoveryRows ? <div aria-label="Local recovery checkpoints" className="space-y-2 border-t pt-3">
      <p className="text-xs text-slate-600">Recovery opens a separate draft. Device storage is not a backup and may be cleared by the browser.</p>
      {recoveryRows.length ? recoveryRows.map(record => <div key={record.scope.branchId} data-branch-id={record.scope.branchId} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm">
        <div className="min-w-0"><p>{record.draft.document.name || 'Physical draft'} · {record.binding ? `saved revision ${record.binding.revisionNumber}` : 'first save pending'} · {new Date(record.updatedAt).toLocaleString()}</p>
          <p className="text-xs text-slate-600">Copy {record.scope.branchId.slice(0, 8)} · {record.state === 'uncertain' || record.state === 'dispatched' ? 'Save response unconfirmed' : record.state === 'prepared' ? 'Save waiting to send' : record.state === 'paused' ? 'Save paused' : 'Local checkpoint'} · Autosave {record.autosave ? 'on' : 'off'}</p></div>
        <Button size="sm" variant="outline" disabled={loading || !canWrite} onPointerDown={keepField} onClick={() => void resumeRecovery(record)}>Resume recovery</Button>
      </div>) : <p className="text-sm">No recovery checkpoints are available for this verified workspace.</p>}
      <Button size="sm" variant="ghost" onPointerDown={keepField} onClick={() => setRecovery(null)}>Close recovery</Button>
    </div> : null}
    {plans && bound ? <div aria-label="Saved physical plans" className="space-y-2 border-t pt-3"><p className="text-sm">Open creates a separate local copy and preserves the current draft.</p>
      {plans.length ? plans.map(plan => <div key={plan.planId} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2 text-sm"><span>{plan.name || 'Untitled plan'} · revision {plan.revisionNumber}</span>
        <Button size="sm" variant="outline" disabled={loading} onPointerDown={keepField} onClick={() => void open(plan.planId)}>Open separate copy</Button></div>) : <p className="text-sm">No physical plans have been saved in this workspace.</p>}
      {cursor ? <Button size="sm" disabled={loading} variant="outline" onPointerDown={keepField} onClick={() => void list(true)}>More saved plans</Button> : null}
      <Button size="sm" variant="ghost" onPointerDown={keepField} onClick={() => setPlans(null)}>Close saved plans</Button></div> : null}
  </section>;
}
