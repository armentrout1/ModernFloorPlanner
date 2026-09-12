import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { PhysicalPlanSummary } from '@shared/persistence/physicalPlan';
import { accountStore, assertRequestContext, captureRequestContext, contextFetch } from '../account/runtime';
import { getProjectActions, type ProjectActionResult, type ProjectOperation } from './projectLifecycleClient';
import { getPhysicalSaveManager } from './accountSaveState';

const keepField = (event: PointerEvent<HTMLButtonElement>) => { if (event.button === 0) event.preventDefault(); };
export function ProjectList({ context, canWrite, onOpen, onClose }: {
  context: string; canWrite: boolean; onOpen(planId: string, stillCurrent?: () => boolean): Promise<void>; onClose(): void;
}) {
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.getSnapshot);
  const actions = getProjectActions(context), action = useSyncExternalStore(actions.subscribe, actions.getSnapshot);
  const manager = getPhysicalSaveManager(context);
  const [status, setStatus] = useState<'active' | 'archived'>('active');
  const [plans, setPlans] = useState<PhysicalPlanSummary[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false), [opening, setOpening] = useState(false), [loaded, setLoaded] = useState(false), [notice, setNotice] = useState('');
  const [confirm, setConfirm] = useState<PhysicalPlanSummary | null>(null);
  const mounted = useRef(true), sequence = useRef(0), activeStatus = useRef(status);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++sequence.current; }; }, []);
  const current = (request: number, generation: number, filter: string) => mounted.current && request === sequence.current &&
    activeStatus.current === filter && accountStore.getSnapshot().generation === generation && accountStore.getSnapshot().editorContext === context;
  async function list(more = false) {
    const request = ++sequence.current, generation = account.generation, filter = activeStatus.current;
    setLoading(true); setNotice('');
    try {
      const captured = await captureRequestContext();
      const response = await contextFetch('GET', '/api/physical-plans?limit=20&status=' + filter +
        (more && cursor ? '&cursor=' + encodeURIComponent(cursor) : ''), undefined, captured);
      const value = await response.json(); assertRequestContext(captured);
      if (!response.ok) throw Error(value.message || 'Saved projects could not be listed.');
      if (current(request, generation, filter)) {
        setPlans(previous => Array.from(new Map((more ? [...previous, ...value.plans] : value.plans)
          .map((plan: PhysicalPlanSummary) => [plan.planId, plan])).values()) as PhysicalPlanSummary[]);
        setCursor(value.nextCursor ?? null); setLoaded(true);
      }
    } catch (error) { if (current(request, generation, filter)) setNotice(error instanceof Error ? error.message : 'Saved projects could not be listed.'); }
    finally { if (current(request, generation, filter)) setLoading(false); }
  }
  useEffect(() => { void list(); }, [status]);
  function filter(next: 'active' | 'archived') {
    if (next === activeStatus.current) return;
    ++sequence.current; activeStatus.current = next; setStatus(next); setPlans([]); setCursor(null); setLoaded(false); setLoading(false); setOpening(false); setConfirm(null);
  }
  function applyResult(result: ProjectActionResult, generation: number) {
    if (accountStore.getSnapshot().generation !== generation || accountStore.getSnapshot().editorContext !== context) return;
    const archived = result.plan.archivedAt !== null;
    if (result.operation !== 'duplicate' || archived || manager.isPlanArchived(result.plan.planId))
      manager.setPlanArchived(result.plan.planId, archived);
    if (mounted.current) { setConfirm(null); void list(); }
  }
  async function change(plan: PhysicalPlanSummary, operation: ProjectOperation) {
    const generation = account.generation;
    try {
      const result = await actions.start(plan, operation, async () => {
        if (operation === 'archive') await manager.pausePlanForLifecycle(plan.planId);
      });
      applyResult(result, generation);
    } catch { /* The context-scoped coordinator retains the exact request and notice. */ }
  }
  async function retry() {
    const generation = account.generation;
    try { applyResult(await actions.retry(), generation); } catch { /* Same retained action, no new key. */ }
  }
  async function open(planId: string) {
    const request = ++sequence.current, generation = account.generation, filter = activeStatus.current;
    setOpening(true);
    try { await onOpen(planId, () => current(request, generation, filter)); }
    finally { if (mounted.current) setOpening(false); }
  }
  const busy = action.busy || opening;
  return <div role="region" aria-label="Saved physical plans" className="space-y-3 border-t pt-3">
    <p className="text-sm">Open makes a separate local copy. Duplicate uses the listed saved revision, not newer local edits. Archive preserves saved revisions and local drafts.</p>
    <div role="tablist" aria-label="Saved project status" className="flex flex-wrap gap-2">
      <Button size="sm" role="tab" aria-selected={status === 'active'} variant={status === 'active' ? 'default' : 'outline'} onPointerDown={keepField} onClick={() => filter('active')}>Active</Button>
      <Button size="sm" role="tab" aria-selected={status === 'archived'} variant={status === 'archived' ? 'default' : 'outline'} onPointerDown={keepField} onClick={() => filter('archived')}>Archived</Button>
      <Button size="sm" variant="ghost" onPointerDown={keepField} disabled={loading || busy} onClick={() => void list()}>Refresh projects</Button>
    </div>
    {action.message ? <p role="status" className="text-sm text-amber-900">{action.message}</p> : null}
    {action.pending ? <div className="space-y-2 rounded border border-amber-200 p-2 text-sm">
      <p>Pending {action.pending.operation}: project {action.pending.planId.slice(0, 8)}. Its exact request is retained for this tab until resolved.</p>
      <Button size="sm" disabled={!canWrite || busy} onPointerDown={keepField} onClick={() => void retry()}>Retry same project action</Button>
    </div> : null}
    {notice ? <p role="alert" className="text-sm text-amber-900">{notice}</p> : null}
    {loading ? <p role="status" className="text-sm">Loading saved projects...</p> : null}
    {plans.map(plan => <div key={plan.planId} data-project-id={plan.planId} className="space-y-2 rounded border p-3 text-sm">
      <div className="min-w-0 break-words"><span>{plan.name || 'Untitled plan'}</span> <span className="text-slate-500">· revision {plan.revisionNumber} · {plan.planId.slice(0, 8)}</span>
        {plan.copiedFrom ? <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-xs">Copy</span> : null}
        {plan.archivedAt ? <span className="ml-2 text-xs text-slate-600">Archived</span> : null}</div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={loading || busy} onPointerDown={keepField} onClick={() => void open(plan.planId)}>Open separate copy</Button>
        {canWrite ? <>
          <Button size="sm" variant="outline" disabled={loading || busy || !!action.pending || action.blocked} onPointerDown={keepField} onClick={() => void change(plan, 'duplicate')}>Duplicate saved revision</Button>
          {plan.archivedAt ? <Button size="sm" variant="outline" disabled={loading || busy || !!action.pending || action.blocked} onPointerDown={keepField} onClick={() => void change(plan, 'restore')}>Restore project</Button>
            : <Button size="sm" variant="outline" disabled={loading || busy || !!action.pending || action.blocked} onPointerDown={keepField} onClick={() => setConfirm(plan)}>Archive project</Button>}
        </> : null}
      </div>
      {confirm?.planId === plan.planId ? <div role="group" aria-label="Confirm project archive" className="space-y-2 rounded bg-amber-50 p-2">
        <p>Archive this saved project? Existing local edits and recovery stay on this device. Autosave for this project will be turned off.</p>
        <div className="flex flex-wrap gap-2"><Button size="sm" onPointerDown={keepField} disabled={busy || !!action.pending || action.blocked} onClick={() => void change(confirm, 'archive')}>Confirm archive</Button>
          <Button size="sm" variant="ghost" onPointerDown={keepField} disabled={busy} onClick={() => setConfirm(null)}>Cancel archive</Button></div>
      </div> : null}
    </div>)}
    {loaded && !plans.length && !loading ? <p className="text-sm">{status === 'archived' ? 'No archived physical plans in this workspace.' : 'No physical plans have been saved in this workspace.'}</p> : null}
    {cursor ? <Button size="sm" disabled={loading || busy} variant="outline" onPointerDown={keepField} onClick={() => void list(true)}>More saved plans</Button> : null}
    <Button size="sm" variant="ghost" onPointerDown={keepField} onClick={() => { ++sequence.current; onClose(); }}>Close saved plans</Button>
  </div>;
}
