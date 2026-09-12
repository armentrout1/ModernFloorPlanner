import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent } from 'react';
import { Button } from '@/components/ui/button';
import { renderQuantityCsv, renderQuantityHtml } from '@shared/exports/quantityReport';
import { accountStore, assertRequestContext, captureRequestContext } from '../account/runtime';
import { useLocalEditorContext } from '../account/useLocalState';
import { UNASSIGNED_CONTEXT, workspaceContext } from '../account/localContexts';
import { getPhysicalSaveManager, type SaveBinding } from './accountSaveState';
import { captureLocalReport, fetchSavedReport } from './exportReport';
import { pendingSaveFields } from './pendingSaveFields';
import { selectedDraft, type PhysicalDraft } from './state';
import { usePhysicalDraft } from './provider';

interface CapturedReport {
  html: string; csv: string | null; source: 'local' | 'saved'; unit: 'ft' | 'm';
  generation: number; context: string; draftId: string; localRevision: number; binding: SaveBinding | null;
}
const keepInput = (event: PointerEvent<HTMLButtonElement>) => { if (event.button === 0) event.preventDefault(); };
export function ExportPanel({ draft }: { draft: PhysicalDraft }) {
  const { store, cache } = usePhysicalDraft();
  const context = useLocalEditorContext();
  const account = useSyncExternalStore(accountStore.subscribe, accountStore.getSnapshot);
  const manager = getPhysicalSaveManager(context);
  useSyncExternalStore(manager.subscribe, manager.getSnapshot);
  const binding = manager.state(draft.id).binding;
  const [source, setSource] = useState<'local' | 'saved'>('local');
  const [report, setReport] = useState<CapturedReport | null>(null);
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [frameReady, setFrameReady] = useState(false);
  const frame = useRef<HTMLIFrameElement>(null), mounted = useRef(true), operation = useRef(0);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; ++operation.current; }; }, []);
  useEffect(() => { ++operation.current; setReport(null); setBusy(false); setFrameReady(false); setNotice(''); }, [context, account.generation, draft.id]);
  const visible = report && report.context === context && report.generation === account.generation && report.draftId === draft.id && !account.checking ? report : null;
  const valid = (id: number, generation: number) => mounted.current && operation.current === id && accountStore.getSnapshot().generation === generation;
  async function authorizeLocal() {
    if (context === UNASSIGNED_CONTEXT) return;
    const captured = await captureRequestContext();
    const current = accountStore.getSnapshot();
    if (current.session.status !== 'authenticated' || !captured.principal || !captured.workspace ||
        workspaceContext(captured.principal, captured.workspace) !== context || current.editorContext !== context)
      throw Error('Verify and resume this workspace before exporting its local report.');
    assertRequestContext(captured);
  }
  async function prepare() {
    const id = ++operation.current, generation = account.generation, revision = draft.localEditRevision;
    setNotice(''); setBusy(true); setReport(null); setFrameReady(false);
    try {
      let html: string, csv: string | null = null;
      if (source === 'saved') {
        if (!binding) throw Error('Save or open an authorized plan first.');
        html = (await fetchSavedReport(binding.planId, binding.revisionId, 'html', draft.displayUnit)).text;
      } else {
        const unapplied = document.querySelector<HTMLElement>('[data-testid="physical-view"] [data-physical-unapplied-action]');
        if (unapplied || pendingSaveFields(draft).length) throw Error('Apply or Revert unfinished fields before preparing a report. Your text is unchanged.');
        const snapshot = await captureLocalReport(draft, crypto.randomUUID(), new Date().toISOString());
        await authorizeLocal();
        html = renderQuantityHtml(snapshot, { unit: draft.displayUnit, source: 'local' });
        csv = renderQuantityCsv(snapshot, { unit: draft.displayUnit, source: 'local' });
      }
      const live = selectedDraft(store.getSnapshot().registry);
      if (!valid(id, generation) || !live || live.id !== draft.id || live.localEditRevision !== revision)
        throw Error('The draft or account changed while preparing the report. Prepare it again.');
      setReport({ html, csv, source, unit: draft.displayUnit, generation, context, draftId: draft.id, localRevision: revision, binding: source === 'saved' ? { ...binding! } : null });
    } catch (error) { if (valid(id, generation)) setNotice(error instanceof Error ? error.message : 'Report unavailable. Your draft is unchanged.'); }
    finally { if (valid(id, generation)) setBusy(false); }
  }
  async function deliver(format: 'csv' | 'print') {
    if (!visible) return;
    const captured = visible, id = ++operation.current;
    setBusy(true); setNotice('');
    try {
      let body = captured.csv;
      if (captured.source === 'saved' && captured.binding) {
        const fetched = await fetchSavedReport(captured.binding.planId, captured.binding.revisionId, format === 'csv' ? 'csv' : 'html', captured.unit);
        assertRequestContext(fetched.context);
        if (format === 'print' && fetched.text !== captured.html) throw Error('The saved report changed. Prepare it again before printing.');
        body = fetched.text;
      } else await authorizeLocal();
      if (!valid(id, captured.generation)) return;
      if (format === 'print') {
        if (!frameReady || !frame.current?.contentWindow) throw Error('Wait for the report preview to finish loading.');
        frame.current.contentWindow.focus(); frame.current.contentWindow.print();
      } else {
        const url = URL.createObjectURL(new Blob(['\uFEFF', body!.replace(/^\uFEFF+/, '')], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = 'modern-floor-planner-quantities.csv'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 30_000);
        setNotice('CSV downloaded from this captured report.');
      }
    } catch (error) { if (valid(id, captured.generation)) setNotice(error instanceof Error ? error.message : 'Report delivery failed.'); }
    finally { if (valid(id, captured.generation)) setBusy(false); }
  }
  return <section aria-label="Quantity reports" className="space-y-3 rounded-md border bg-slate-50 p-3">
    <h3 className="font-semibold">Quantity reports</h3>
    <p className="text-sm text-slate-600">Capture selected work, measurements and uncertainty. This is a quantity report; it does not include a plan drawing or purchasing list.</p>
    <div className="flex flex-wrap items-end gap-2">
      <label className="grid gap-1 text-sm">Report source<select className="h-9 rounded border bg-white px-2" value={source}
        onChange={event => { ++operation.current; setBusy(false); setSource(event.target.value as 'local' | 'saved'); setReport(null); }}>
        <option value="local">Current local draft</option><option value="saved" disabled={!binding}>Last acknowledged saved revision{binding ? ' ' + binding.revisionNumber : ''}</option>
      </select></label>
      <Button type="button" size="sm" variant="outline" onPointerDown={keepInput} onClick={prepare} disabled={busy || account.checking || ['uninitialized','corrupt','unsupported'].includes(cache)}>Prepare report</Button>
    </div>
    {notice ? <p role="status" className="text-sm text-amber-900">{notice}</p> : null}
    {visible ? <>
      <p className="text-sm">Captured {visible.source === 'local' ? `local edit ${visible.localRevision} (not an account save)` : `saved revision ${visible.binding!.revisionNumber}`}. Later edits do not change this report.{draft.localEditRevision !== visible.localRevision ? ' Your draft has newer edits.' : ''}</p>
      <div className="flex flex-wrap gap-2"><Button type="button" size="sm" onPointerDown={keepInput} disabled={busy} onClick={() => void deliver('csv')}>Download quantity CSV</Button>
        <Button type="button" size="sm" variant="outline" onPointerDown={keepInput} disabled={busy || !frameReady} onClick={() => void deliver('print')}>Print / Save PDF</Button></div>
      <p className="text-xs text-slate-600">Choose Save as PDF in your browser’s print dialog. Downloaded files cannot be recalled after access changes.</p>
      <iframe ref={frame} title="Captured quantity report" sandbox="allow-same-origin allow-modals" srcDoc={visible.html}
        onLoad={() => setFrameReady(true)} className="h-[32rem] w-full rounded border bg-white" />
    </> : null}
  </section>;
}
