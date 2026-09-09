import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { Button } from '@/components/ui/button';
import { PhysicalDraftProvider, usePhysicalDraft } from '@/features/physical-draft/provider';
import { RoomMeasurements } from '@/features/physical-draft/RoomMeasurements';
import { PhysicalDrawing } from '@/features/physical-draft/PhysicalDrawing';
import { ResponsiveInspector, useInspectorLayout } from '@/features/physical-draft/ResponsiveInspector';
import { runInputLayoutTransition, isInputLayoutControl, hasActivePhysicalGesture } from '@/utils/inputLayout';
import { HistoryControls } from '@/features/physical-draft/HistoryControls';
import { PhysicalViewTabs, type PhysicalView } from '@/features/physical-draft/PhysicalViewTabs';
import { OpeningList, OpeningMeasurements } from '@/features/physical-draft/OpeningMeasurements';
import { TakeoffPanel } from '@/features/physical-draft/TakeoffPanel';
import { ReviewPanel } from '@/features/physical-draft/ReviewPanel';
import { scopeForRequest, type DrawingSourceScope } from '@/features/physical-draft/takeoffReadModel';
import { deleteOpening, undoOpeningDelete } from '@/features/physical-draft/openingCommands';
import { shouldIgnoreEditorShortcut } from '@/utils/keyboard';
import { PhysicalQuantities } from '@/features/physical-draft/PhysicalQuantities';
import { createDraft, insertDraft, selectDraft, selectedDraft, addRoom, switchUnit, previewDocument,
  type PhysicalDraft as Draft } from '@/features/physical-draft/state';

function DraftWorkspace() {
  const { registry, cache, message, error, rawRecovery, store } = usePhysicalDraft();
  const draft = selectedDraft(registry);
  const [showTakeoffScope, setShowTakeoffScope] = useState(true);
  const [sourceFocus, setSourceFocus] = useState<{ draftId: string; key: string; scope: DrawingSourceScope } | null>(null);
  const [view, setView] = useState<PhysicalView>('rooms');
  const narrow = useInspectorLayout();
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const inspectorOpener = useRef<HTMLButtonElement>(null);
  const inspectorFallback = useRef<HTMLElement>(null);
  function changeInspector(open: boolean) {
    if (open && hasActivePhysicalGesture()) return;
    runInputLayoutTransition(() => setInspectorOpen(open));
  }
  function changeView(next: PhysicalView) {
    runInputLayoutTransition(() => { setInspectorOpen(false); setView(next); });
  }
  const [selected, setSelected] = useState<{ draftId: string; roomId: string } | null>(null);
  const [openingSelection, setOpeningSelection] = useState<{ draftId: string; openingId: string } | null>(null);
  const selectedOpening = draft?.document.openings.find(item => openingSelection?.draftId === draft.id && item.id === openingSelection.openingId) ?? null;
  const candidateRoom = draft?.document.rooms.find(room => selected?.draftId === draft.id && room.id === selected.roomId);
  const selectedRoomId = selectedOpening && draft ?
    (candidateRoom?.wallFaces.some(wall => selectedOpening.attachments.some(a => a.wallFaceId === wall.id)) ? candidateRoom.id :
      draft.document.rooms.find(room => room.wallFaces.some(wall => selectedOpening.attachments.some(a => a.wallFaceId === wall.id)))?.id ?? null)
    : candidateRoom?.id ?? draft?.document.rooms[0]?.id ?? null;
  function selectRoom(roomId: string) {
    if (!draft) return;
    setSelected({ draftId: draft.id, roomId }); setOpeningSelection(null);
  }
  function selectOpening(openingId: string | null) {
    if (draft) setOpeningSelection(openingId ? { draftId: draft.id, openingId } : null);
  }
  const preview = useMemo(() => draft ? previewDocument(draft) : null, [draft]);
  const takeoffScope = useMemo(() => draft ? scopeForRequest(draft.document, draft.request) : undefined, [draft]);
  const focus = sourceFocus?.draftId === draft?.id ? sourceFocus ?? undefined : undefined;
  function locateSource(scope: DrawingSourceScope) {
    if (!draft) return;
    changeView('drawing');
    setSourceFocus({ draftId: draft.id, key: crypto.randomUUID(), scope });
    requestAnimationFrame(() => document.querySelector('[data-testid="physical-canvas"]')?.scrollIntoView({ block: 'center' }));
  }
  function editSource(scope: DrawingSourceScope) {
    if (scope.openingIds.length === 1) selectOpening(scope.openingIds[0]);
    else if (scope.roomIds.length === 1) selectRoom(scope.roomIds[0]);
    locateSource(scope);
    if (narrow) changeInspector(true);
  }
  const blocked = ['uninitialized', 'corrupt', 'unsupported'].includes(cache);
  function update(change: (current: Draft) => Draft, expectedRevision?: number): boolean {
    if (!draft) return false;
    const latest = selectedDraft(store.getSnapshot().registry);
    return store.updateDraft(draft.id, expectedRevision ?? latest?.localEditRevision ?? draft.localEditRevision, change);
  }
  useEffect(() => {
    if (!draft || !selectedOpening) return;
    const remove = (event: KeyboardEvent) => {
      if (!['Delete', 'Backspace'].includes(event.key) || shouldIgnoreEditorShortcut(event) || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      if (store.updateDraft(draft.id, draft.localEditRevision, current => deleteOpening(current, selectedOpening.id, new Date().toISOString()))) setOpeningSelection(null);
    };
    document.addEventListener('keydown', remove);
    return () => document.removeEventListener('keydown', remove);
  }, [draft, selectedOpening, store]);
  function create() {
    changeInspector(false);
    store.dispatch(current => insertDraft(current, createDraft(crypto.randomUUID(), 'Physical draft ' + (current.drafts.length + 1))));
  }
  function add() {
    if (!draft) return;
    const id = crypto.randomUUID();
    if (store.updateDraft(draft.id, draft.localEditRevision, current => addRoom(current, id))) selectRoom(id);
  }
  function downloadRecovery() {
    if (!rawRecovery) return;
    const url = URL.createObjectURL(new Blob([rawRecovery], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'physical-draft-recovery-original.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const selectedRoom = draft?.document.rooms.find(room => room.id === selectedRoomId);
  const selectedName = selectedOpening ? (selectedOpening.kind === 'door' ? 'Door' : selectedOpening.kind === 'window' ? 'Window' : 'Opening') + ' ' +
    (draft!.document.openings.filter(item => item.kind === selectedOpening.kind && item.attachments.some(a => selectedRoom?.wallFaces.some(w => w.id === a.wallFaceId))).findIndex(item => item.id === selectedOpening.id) + 1)
    : selectedRoom?.name || 'Unnamed room';
  const targetKey = draft ? draft.id + ':' + (selectedOpening?.id ?? selectedRoomId ?? '') : '';
  const canInspect = Boolean(selectedRoomId && (view === 'drawing' || selectedOpening));
  useEffect(() => {
    if (inspectorOpen && (!canInspect || (openingSelection && openingSelection.draftId === draft?.id && !selectedOpening))) changeInspector(false);
  }, [canInspect, targetKey, draft?.id]);
  function deletedOpening() { runInputLayoutTransition(() => { setInspectorOpen(false); selectOpening(null); }); }
  function inspector() {
    if (!draft || !selectedRoomId || !canInspect) return null;
    return <ResponsiveInspector narrow={narrow} open={inspectorOpen} onOpenChange={changeInspector}
      targetKey={targetKey} title={'Edit ' + (selectedOpening?.kind ?? 'room') + ': ' + selectedName}
      label={view === 'drawing' ? 'Drawing inspector' : 'Opening inspector'} openerRef={inspectorOpener} fallbackFocusRef={inspectorFallback}>
      <fieldset disabled={blocked} className="min-w-0"><legend className="sr-only">Inspector measurements</legend>
        {selectedOpening ? <OpeningMeasurements key={selectedOpening.id} draft={draft} openingId={selectedOpening.id} update={update} commandError={error} onDeleted={deletedOpening} /> :
          <><h2 className="mb-4 font-semibold">Room inspector</h2><RoomMeasurements draft={draft} roomId={selectedRoomId} update={update} /></>}
      </fieldset>
    </ResponsiveInspector>;
  }
  return <main data-testid="physical-view" className="min-h-screen min-w-0 bg-slate-50 text-slate-900 [overflow-wrap:anywhere]"
    onPointerDownCapture={event => { if (event.button === 0 && isInputLayoutControl(event.target)) runInputLayoutTransition(() => {}); }}>
    <header className="border-b bg-white px-5 py-4">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
        <div><p className="font-semibold text-primary">Modern Floor Planner</p><h1 className="mt-1 text-xl font-semibold">Unified physical draft</h1></div>
        <nav aria-label="Other workflows" className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href="/">Standalone sketch</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/quick-room">Standalone Quick Rooms</Link></Button>
        </nav>
      </div>
    </header>
    <div className="mx-auto min-w-0 max-w-7xl space-y-4 p-3 sm:p-6">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-950">
        One selected physical document powers both views below. Original standalone drafts remain separate.
        <p className="text-xs">Temporary recovery in this browser tab only. No account saving, cross-device recovery or database persistence.</p>
      </div>
      {message || error ? <div role={error || blocked ? 'alert' : 'status'} className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
        {error || message}{rawRecovery ? <Button className="ml-3" size="sm" variant="outline" onClick={downloadRecovery}>Download original recovery data</Button> : null}
      </div> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {registry.drafts.length ? <label className="grid min-w-0 w-full max-w-md gap-1 text-sm font-medium">Selected physical draft
          <select className="h-10 min-w-0 max-w-full rounded-md border bg-white px-3" value={registry.selectedDraftId ?? ''} disabled={blocked}
            onChange={event => { changeInspector(false); store.dispatch(current => selectDraft(current, event.target.value)); }}>
            {registry.drafts.map(item => <option key={item.id} value={item.id}>{item.document.name || 'Physical draft'} · {item.id.slice(0, 8)}</option>)}
          </select></label> : <p className="max-w-2xl text-sm text-slate-600">Start empty, or open a preserved standalone workflow and choose “Open a physical copy” to explicitly adopt its current draft.</p>}
        <Button onClick={create} disabled={blocked}>New physical draft</Button>
      </div>
      {draft && preview ? <>
        <HistoryControls blocked={blocked} />
        <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
          <div><h2 className="text-lg font-semibold">{draft.document.name || 'Physical draft'}</h2>
            <p className="text-xs text-slate-500">Draft <span data-testid="physical-draft-id">{draft.id}</span> · local edit {draft.localEditRevision} · source: {draft.source.kind}</p></div>
          <div className="flex gap-1" role="group" aria-label="Display units">
            <Button size="sm" disabled={blocked} variant={draft.displayUnit === 'ft' ? 'default' : 'outline'} aria-pressed={draft.displayUnit === 'ft'} onClick={() => update(current => switchUnit(current, 'ft'))}>Feet / inches</Button>
            <Button size="sm" disabled={blocked} variant={draft.displayUnit === 'm' ? 'default' : 'outline'} aria-pressed={draft.displayUnit === 'm'} onClick={() => update(current => switchUnit(current, 'm'))}>Meters</Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PhysicalViewTabs view={view} onChange={changeView} />
          <div className="flex flex-wrap gap-2">{draft.openingDeleteUndo ? <Button variant="outline" disabled={blocked} onClick={() => update(current => undoOpeningDelete(current, new Date().toISOString()))}>Undo opening delete</Button> : null}<Button variant="outline" disabled={blocked} onClick={add}>Add room</Button></div>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Rooms in selected draft">
          {draft.document.rooms.map(room => <Button size="sm" className="h-auto max-w-full whitespace-normal break-words text-left" key={room.id} variant={selectedRoomId === room.id ? 'secondary' : 'outline'}
            aria-pressed={selectedRoomId === room.id} onClick={() => selectRoom(room.id)}><span className="min-w-0 [overflow-wrap:anywhere]">{room.name || 'Unnamed room'}</span></Button>)}
        </div>
        {narrow && canInspect ? <Button ref={inspectorOpener} type="button" variant="outline" data-physical-layout-control
          className="h-auto min-h-10 max-w-full whitespace-normal text-left" aria-haspopup="dialog" aria-expanded={inspectorOpen}
          onClick={() => changeInspector(true)}><span className="min-w-0 [overflow-wrap:anywhere]">Edit selected {selectedOpening ? 'opening' : 'room'}: {selectedName}</span></Button> : null}
        {(['rooms', 'drawing'] as const).map(panel => <section key={panel} role="tabpanel" id={'physical-' + panel + '-panel'}
          ref={view === panel ? inspectorFallback : undefined} aria-labelledby={'physical-' + panel + '-tab'} hidden={view !== panel} tabIndex={view === panel ? 0 : -1}
          className="min-w-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
          {view === panel ? <>
          {selectedRoomId ? <div className={view === 'drawing' ? 'grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,350px)]' : 'grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'}>
            <div className="min-w-0 space-y-4">
              {view === 'drawing' ? <PhysicalDrawing key={draft.id + view} document={preview} draft={draft} selectedId={selectedRoomId} onSelect={selectRoom} selectedOpeningId={selectedOpening?.id ?? null} onSelectOpening={selectOpening} update={update} takeoffScope={showTakeoffScope ? takeoffScope : undefined} sourceFocus={focus} /> :
                <fieldset disabled={blocked} className="min-w-0 rounded-lg border bg-white p-4 sm:p-5"><legend className="sr-only">Quick room measurements</legend><RoomMeasurements draft={draft} roomId={selectedRoomId} update={update} /></fieldset>}
              <PhysicalQuantities document={preview} roomId={selectedRoomId} unit={draft.displayUnit} />
              <OpeningList draft={draft} roomId={selectedRoomId} selectedId={selectedOpening?.id ?? null} onSelect={selectOpening} update={update} />
            </div>
            {view === 'drawing' ? inspector() : <div className="min-w-0 space-y-4"><PhysicalDrawing key={draft.id + view} document={preview} draft={draft} selectedId={selectedRoomId} onSelect={selectRoom} selectedOpeningId={selectedOpening?.id ?? null} onSelectOpening={selectOpening} update={update} takeoffScope={showTakeoffScope ? takeoffScope : undefined} sourceFocus={focus} />
              {selectedOpening ? inspector() : <p className="text-sm leading-6 text-slate-600">The drawing uses these same measurements. Select a room or opening to edit it.</p>}</div>}
          </div> : <p className="rounded-lg border border-dashed p-8 text-center text-slate-600">Add a room, then enter its measured dimensions. Ceiling height begins unknown.</p>}
          </> : null}
        </section>)}
        <TakeoffPanel key={draft.id} draft={draft} update={update} onFocus={locateSource} showScope={showTakeoffScope} onShowScope={setShowTakeoffScope}
          review={<ReviewPanel draft={draft} update={update} onFocus={editSource} commandError={error} />} />
        {draft.source.review.length ? <section className="rounded-lg border bg-white p-4 text-sm" aria-label="Source review">
          <h2 className="font-semibold">Copied source review</h2><ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600">{draft.source.review.map((note, index) => <li key={index}>{note}</li>)}</ul>
        </section> : null}
      </> : null}
    </div>
  </main>;
}

export default function PhysicalDraftPage() {
  return <PhysicalDraftProvider><DraftWorkspace /></PhysicalDraftProvider>;
}
