import { LayoutControls } from '@/features/physical-draft/LayoutControls';
import { LayoutInspector } from '@/features/physical-draft/LayoutInspector';
import { upgradeExistingDraftToLayout } from '@/features/physical-draft/layoutCommands';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'wouter';
import { StairControls, type BuildingSelection } from '@/features/physical-draft/StairControls';
import { StairInspector, SurfaceOpeningInspector } from '@/features/physical-draft/StairInspector';
import { upgradeExistingDraftToStairs } from '@/features/physical-draft/stairCommands';
import { LevelControls } from '@/features/physical-draft/LevelControls';
import { activeLevelId, selectLevel, createLevelDraft, upgradeExistingDraftToLevels } from '@/features/physical-draft/levelCommands';
import { levelForRoom, sourceRoomIds, type LevelCamera } from '@/features/physical-draft/levelView';
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
  const { registry, cache, message, error, rawRecovery, history, store } = usePhysicalDraft();
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
  const levelId = draft ? activeLevelId(draft) : null;
  const visibleRooms = draft?.document.rooms.filter(room => !levelId || levelForRoom(draft.document, room.id) === levelId) ?? [];
  const visibleWalls = new Set(visibleRooms.flatMap(room => room.wallFaces.map(wall => wall.id)));
  const contextKey = draft ? draft.id + ':' + (levelId ?? 'legacy') : '';
  const selections = useRef(new Map<string, { roomId: string; openingId: string | null }>());
  const buildingSelections = useRef(new Map<string, BuildingSelection>());
  const [buildingSelection, setBuildingSelection] = useState<{ key: string; value: BuildingSelection } | null>(null);
  const rememberedBuilding = buildingSelection?.key === contextKey ? buildingSelection.value : buildingSelections.current.get(contextKey);
  const selectedBuilding = rememberedBuilding && draft && (draft.document.schemaVersion === 4 || draft.document.schemaVersion === 5) && (rememberedBuilding.kind === 'stair'
    ? draft.document.stairsContract.stairs.some(stair => stair.id === rememberedBuilding.id && Object.values(stair.endpoints).some(endpoint => endpoint.state === 'modeled' && endpoint.levelId === levelId))
    : rememberedBuilding.kind === 'surface-opening' ? draft.document.stairsContract.surfaceOpenings.some(opening => opening.id === rememberedBuilding.id && opening.attachments.some(a => visibleRooms.some(room => room.id === a.roomId)))
    : draft.document.schemaVersion === 5 && (rememberedBuilding.kind === 'zone' ? draft.document.layoutContract.zones : draft.document.layoutContract.cabinetBlocks).some(item => item.id === rememberedBuilding.id && visibleRooms.some(room => room.id === item.roomId))) ? rememberedBuilding : null;
  function clearBuildingSelection() { buildingSelections.current.delete(contextKey); setBuildingSelection(null); }
  const cameras = useRef(new Map<string, LevelCamera>());
  const [selected, setSelected] = useState<{ draftId: string; roomId: string } | null>(null);
  const [openingSelection, setOpeningSelection] = useState<{ draftId: string; openingId: string } | null>(null);
  const remembered = selections.current.get(contextKey);
  const openingId = openingSelection?.draftId === contextKey ? openingSelection.openingId : remembered?.openingId;
  const selectedOpening = draft?.document.openings.find(item => item.id === openingId && item.attachments.some(a => visibleWalls.has(a.wallFaceId))) ?? null;
  const candidateRoom = visibleRooms.find(room => room.id === (selected?.draftId === contextKey ? selected.roomId : remembered?.roomId));
  const selectedRoomId = selectedOpening && draft ?
    (candidateRoom?.wallFaces.some(wall => selectedOpening.attachments.some(a => a.wallFaceId === wall.id)) ? candidateRoom.id :
      visibleRooms.find(room => room.wallFaces.some(wall => selectedOpening.attachments.some(a => a.wallFaceId === wall.id)))?.id ?? null)
    : candidateRoom?.id ?? visibleRooms[0]?.id ?? null;
  function selectRoom(roomId: string) {
    if (!draft || !visibleRooms.some(room => room.id === roomId)) return;
    clearBuildingSelection();
    selections.current.set(contextKey, { roomId, openingId: null });
    setSelected({ draftId: contextKey, roomId }); setOpeningSelection(null);
  }
  function selectOpening(openingId: string | null) {
    if (!draft) return;
    const live = selectedDraft(store.getSnapshot().registry);
    if (!live || live.id !== draft.id || activeLevelId(live) !== levelId) return;
    const roomId = openingId ? live.document.rooms.find(room => (!levelId || levelForRoom(live.document, room.id) === levelId)
      && room.wallFaces.some(wall => live.document.openings.find(opening => opening.id === openingId)?.attachments.some(a => a.wallFaceId === wall.id)))?.id : selectedRoomId;
    if (openingId && !roomId) return;
    clearBuildingSelection();
    if (roomId) selections.current.set(contextKey, { roomId, openingId });
    setOpeningSelection(openingId ? { draftId: contextKey, openingId } : null);
  }
  function selectBuilding(value: BuildingSelection) {
    if (!draft) return;
    const live = selectedDraft(store.getSnapshot().registry);
    if (!live || live.id !== draft.id || (live.document.schemaVersion !== 4 && live.document.schemaVersion !== 5) || activeLevelId(live) !== levelId) return;
    if (live.document.buildingLevels.roomLevels[value.roomId] !== levelId) return;
    runInputLayoutTransition(() => {
      buildingSelections.current.set(contextKey, value); setBuildingSelection({ key: contextKey, value });
      selections.current.set(contextKey, { roomId: value.roomId, openingId: null });
      setSelected({ draftId: contextKey, roomId: value.roomId }); setOpeningSelection(null);
    });
  }
  function navigateEndpoint(nextLevel: string, roomId: string, stairId: string) {
    if (!draft) return;
    if (nextLevel !== levelId) changeLevel(nextLevel);
    const key = draft.id + ':' + nextLevel;
    const value: BuildingSelection = { kind: 'stair', id: stairId, roomId };
    buildingSelections.current.set(key, value); setBuildingSelection({ key, value });
    selections.current.set(key, { roomId, openingId: null }); setSelected({ draftId: key, roomId }); setOpeningSelection(null);
    changeView('drawing');
  }
  const preview = useMemo(() => draft ? previewDocument(draft) : null, [draft]);
  const takeoffScope = useMemo(() => draft ? scopeForRequest(draft.document, draft.request) : undefined, [draft]);
  const focus = sourceFocus?.draftId === draft?.id ? sourceFocus ?? undefined : undefined;
  function changeLevel(id: string) {
    if (!draft) return;
    runInputLayoutTransition(() => {
      setInspectorOpen(false); setSourceFocus(null);
      store.updateDraft(draft.id, draft.localEditRevision, current => selectLevel(current, id));
    });
  }
  function revealSourceLevel(scope: DrawingSourceScope): string {
    if (!draft) return contextKey;
    const roomId = sourceRoomIds(draft.document, scope)[0];
    const sourceLevel = roomId ? levelForRoom(draft.document, roomId) : null;
    if (sourceLevel && sourceLevel !== levelId) changeLevel(sourceLevel);
    return draft.id + ':' + (sourceLevel ?? 'legacy');
  }
  function locateSource(scope: DrawingSourceScope) {
    if (!draft) return;
    revealSourceLevel(scope);
    changeView('drawing');
    setSourceFocus({ draftId: draft.id, key: crypto.randomUUID(), scope });
    requestAnimationFrame(() => document.querySelector('[data-testid="physical-canvas"]')?.scrollIntoView({ block: 'center' }));
  }
  function editSource(scope: DrawingSourceScope) {
    if (!draft) return;
    const roomId = sourceRoomIds(draft.document, scope)[0];
    const key = revealSourceLevel(scope);
    if (roomId) {
      const openingId = scope.openingIds.length === 1 ? scope.openingIds[0] : scope.openingFaces.length === 1 ? scope.openingFaces[0].openingId : null;
      selections.current.set(key, { roomId, openingId });
      setSelected({ draftId: key, roomId }); setOpeningSelection(openingId ? { draftId: key, openingId } : null);
    }
    const surface = scope.surfaceOpenings?.[0];
    if (surface) { const value: BuildingSelection = { kind: 'surface-opening', id: surface.openingId, roomId: surface.roomId, surface: surface.surface };
      buildingSelections.current.set(key, value); setBuildingSelection({ key, value }); }
    else { buildingSelections.current.delete(key); setBuildingSelection(null); }
    changeView('drawing');
    setSourceFocus({ draftId: draft.id, key: crypto.randomUUID(), scope });
    if (narrow) changeInspector(true);
  }
  useEffect(() => {
    const reveal = history.reveal;
    if (!draft || !reveal || reveal.revision !== draft.localEditRevision) return;
    const key = draft.id + ':' + reveal.levelId;
    if (reveal.roomId) {
      selections.current.set(key, { roomId: reveal.roomId, openingId: reveal.openingId ?? null });
      setSelected({ draftId: key, roomId: reveal.roomId });
      setOpeningSelection(reveal.openingId ? { draftId: key, openingId: reveal.openingId } : null);
    }
    if (reveal.roomId && (reveal.stairId || reveal.surfaceOpeningId || reveal.zoneId || reveal.cabinetId)) {
      const value: BuildingSelection = reveal.zoneId ? {kind:'zone',id:reveal.zoneId,roomId:reveal.roomId} : reveal.cabinetId ? {kind:'cabinet',id:reveal.cabinetId,roomId:reveal.roomId} : reveal.stairId ? { kind: 'stair', id: reveal.stairId, roomId: reveal.roomId, role: reveal.endpointRole }
        : { kind: 'surface-opening', id: reveal.surfaceOpeningId!, roomId: reveal.roomId, surface: reveal.surface };
      buildingSelections.current.set(key, value); setBuildingSelection({ key, value });
    } else { buildingSelections.current.delete(key); setBuildingSelection(null); }
    runInputLayoutTransition(() => setInspectorOpen(false));
  }, [history.reveal, draft?.id, draft?.localEditRevision]);
  const blocked = ['uninitialized', 'corrupt', 'unsupported'].includes(cache);
  function update(change: (current: Draft) => Draft, expectedRevision?: number): boolean {
    if (!draft) return false;
    const latest = selectedDraft(store.getSnapshot().registry);
    if (!latest || latest.id !== draft.id || activeLevelId(latest) !== levelId) return false;
    return store.updateDraft(draft.id, expectedRevision ?? latest.localEditRevision, change);
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
  function createBuilding() {
    runInputLayoutTransition(() => {
      setInspectorOpen(false);
      store.dispatch(current => insertDraft(current, createLevelDraft(crypto.randomUUID(), crypto.randomUUID(), 'Building draft ' + (current.drafts.length + 1))));
    });
  }
  function upgrade() {
    if (!draft) return;
    runInputLayoutTransition(() => {
      setInspectorOpen(false);
      store.dispatch(current => {
        const live = selectedDraft(current);
        if (!live || live.id !== draft.id || live.localEditRevision !== draft.localEditRevision) throw new Error('The draft changed. Try the upgrade again.');
        return insertDraft(current, upgradeExistingDraftToLevels(live, crypto.randomUUID(), crypto.randomUUID(), new Date().toISOString()));
      });
    });
  }
  function upgradeStairs() {
    if (!draft) return;
    runInputLayoutTransition(() => { setInspectorOpen(false); store.dispatch(current => {
      const live = selectedDraft(current);
      if (!live || live.id !== draft.id || live.localEditRevision !== draft.localEditRevision) throw new Error('The draft changed. Try again.');
      return insertDraft(current, upgradeExistingDraftToStairs(live, crypto.randomUUID(), new Date().toISOString()));
    }); });
  }
  function upgradeLayout() {
    if (!draft) return;
    runInputLayoutTransition(() => { setInspectorOpen(false); store.dispatch(current => {
      const live = selectedDraft(current);
      if (!live || live.id !== draft.id || live.localEditRevision !== draft.localEditRevision) throw new Error('The draft changed. Try again.');
      const copy = upgradeExistingDraftToLayout(live, crypto.randomUUID(), new Date().toISOString());
      const nextKey = copy.id + ':' + (activeLevelId(copy) ?? 'legacy');
      for (const [key,value] of Array.from(selections.current)) if (key.startsWith(draft.id+':')) selections.current.set(copy.id+key.slice(draft.id.length),value);
      for (const [key,value] of Array.from(buildingSelections.current)) if (key.startsWith(draft.id+':')) buildingSelections.current.set(copy.id+key.slice(draft.id.length),value);
      for (const [key,value] of Array.from(cameras.current)) if (key.startsWith(draft.id+':')) cameras.current.set(copy.id+key.slice(draft.id.length),value);
      if (selectedRoomId) selections.current.set(nextKey, {roomId:selectedRoomId,openingId:selectedOpening?.id ?? null});
      if (selectedBuilding) buildingSelections.current.set(nextKey, selectedBuilding);
      const camera = cameras.current.get(contextKey); if (camera) cameras.current.set(nextKey,camera);
      return insertDraft(current, copy);
    }); });
  }
  function add() {
    if (!draft) return;
    const id = crypto.randomUUID();
    clearBuildingSelection();
    if (store.updateDraft(draft.id, draft.localEditRevision, current => addRoom(current, id))) {
      selections.current.set(contextKey, { roomId: id, openingId: null }); setSelected({ draftId: contextKey, roomId: id }); setOpeningSelection(null);
    }
  }
  function downloadRecovery() {
    if (!rawRecovery) return;
    const url = URL.createObjectURL(new Blob([rawRecovery], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'physical-draft-recovery-original.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const selectedRoom = draft?.document.rooms.find(room => room.id === selectedRoomId);
  const selectedBuildingName = selectedBuilding && draft && (draft.document.schemaVersion === 4 || draft.document.schemaVersion === 5) ? (selectedBuilding.kind === 'stair'
    ? draft.document.stairsContract.stairs.find(item => item.id === selectedBuilding.id)?.name
    : selectedBuilding.kind === 'surface-opening' ? draft.document.stairsContract.surfaceOpenings.find(item => item.id === selectedBuilding.id)?.name
    : draft.document.schemaVersion === 5 ? (selectedBuilding.kind === 'zone' ? draft.document.layoutContract.zones : draft.document.layoutContract.cabinetBlocks).find(item => item.id === selectedBuilding.id)?.name : null) : null;
  const selectedName = selectedBuildingName || (selectedOpening ? (selectedOpening.kind === 'door' ? 'Door' : selectedOpening.kind === 'window' ? 'Window' : 'Opening') + ' ' +
    (draft!.document.openings.filter(item => item.kind === selectedOpening.kind && item.attachments.some(a => selectedRoom?.wallFaces.some(w => w.id === a.wallFaceId))).findIndex(item => item.id === selectedOpening.id) + 1)
    : selectedRoom?.name || 'Unnamed room');
  const targetKey = draft ? draft.id + ':' + (selectedBuilding?.id ?? selectedOpening?.id ?? selectedRoomId ?? '') : '';
  const canInspect = Boolean(selectedRoomId && (view === 'drawing' || selectedOpening || selectedBuilding));
  useEffect(() => {
    if (inspectorOpen && (!canInspect || (openingSelection && openingSelection.draftId === contextKey && !selectedOpening))) changeInspector(false);
  }, [canInspect, targetKey, draft?.id]);
  function deletedOpening() { runInputLayoutTransition(() => { setInspectorOpen(false); selectOpening(null); }); }
  function inspector() {
    if (!draft || !selectedRoomId || !canInspect) return null;
    return <ResponsiveInspector narrow={narrow} open={inspectorOpen} onOpenChange={changeInspector}
      targetKey={targetKey} title={'Edit ' + (selectedBuilding?.kind ?? selectedOpening?.kind ?? 'room') + ': ' + selectedName}
      label={view === 'drawing' ? 'Drawing inspector' : selectedBuilding?.kind === 'zone' || selectedBuilding?.kind === 'cabinet' ? 'Room layout inspector' : 'Opening inspector'} openerRef={inspectorOpener} fallbackFocusRef={inspectorFallback}>
      <fieldset disabled={blocked} className="min-w-0"><legend className="sr-only">Inspector measurements</legend>
        {selectedBuilding && (selectedBuilding.kind === 'zone' || selectedBuilding.kind === 'cabinet') ? <LayoutInspector key={contextKey + selectedBuilding.id} draft={draft} kind={selectedBuilding.kind} id={selectedBuilding.id} update={update} onDeleted={() => { changeInspector(false); clearBuildingSelection(); }} /> : selectedBuilding?.kind === 'stair' ? <StairInspector key={contextKey + selectedBuilding.id} draft={draft} stairId={selectedBuilding.id} update={update} onNavigate={navigateEndpoint} onDeleted={() => { changeInspector(false); clearBuildingSelection(); }} /> :
          selectedBuilding?.kind === 'surface-opening' ? <SurfaceOpeningInspector key={contextKey + selectedBuilding.id} draft={draft} openingId={selectedBuilding.id} update={update} onDeleted={() => { changeInspector(false); clearBuildingSelection(); }} /> :
          selectedOpening ? <OpeningMeasurements key={selectedOpening.id} draft={draft} openingId={selectedOpening.id} update={update} commandError={error} onDeleted={deletedOpening} /> :
          <><h2 className="mb-4 font-semibold">Room inspector</h2><RoomMeasurements draft={draft} roomId={selectedRoomId} update={update} /></>}
      </fieldset>
    </ResponsiveInspector>;
  }
  return <main data-testid="physical-view" data-active-level-id={levelId ?? undefined} className="min-h-screen min-w-0 bg-slate-50 text-slate-900 [overflow-wrap:anywhere]"
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
        <div className="flex flex-wrap gap-2"><Button onClick={create} variant="outline" disabled={blocked}>New physical draft</Button>
          <Button onClick={createBuilding} data-physical-layout-control disabled={blocked}>New building draft</Button></div>
      </div>
      {draft && preview ? <>
        <LevelControls draft={draft} update={update} onSelect={changeLevel} onUpgrade={upgrade} blocked={blocked} />
        <StairControls draft={draft} roomId={selectedRoomId} selected={selectedBuilding} update={update} onUpgrade={upgradeStairs} onSelect={selectBuilding} blocked={blocked} />
        <LayoutControls draft={draft} roomId={selectedRoomId} selected={selectedBuilding} update={update} onUpgrade={upgradeLayout} onSelect={selectBuilding} blocked={blocked} />
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
          {visibleRooms.map(room => <Button size="sm" className="h-auto max-w-full whitespace-normal break-words text-left" key={room.id} variant={selectedRoomId === room.id ? 'secondary' : 'outline'}
            aria-pressed={selectedRoomId === room.id} onClick={() => selectRoom(room.id)}><span className="min-w-0 [overflow-wrap:anywhere]">{room.name || 'Unnamed room'}</span></Button>)}
        </div>
        {narrow && canInspect ? <Button ref={inspectorOpener} type="button" variant="outline" data-physical-layout-control
          className="h-auto min-h-10 max-w-full whitespace-normal text-left" aria-haspopup="dialog" aria-expanded={inspectorOpen}
          onClick={() => changeInspector(true)}><span className="min-w-0 [overflow-wrap:anywhere]">Edit selected {selectedBuilding ? selectedBuilding.kind === 'surface-opening' ? 'surface opening' : selectedBuilding.kind : selectedOpening ? 'opening' : 'room'}: {selectedName}</span></Button> : null}
        {(['rooms', 'drawing'] as const).map(panel => <section key={panel} role="tabpanel" id={'physical-' + panel + '-panel'}
          ref={view === panel ? inspectorFallback : undefined} aria-labelledby={'physical-' + panel + '-tab'} hidden={view !== panel} tabIndex={view === panel ? 0 : -1}
          className="min-w-0 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900">
          {view === panel ? <>
          {selectedRoomId ? <div className={view === 'drawing' ? 'grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,350px)]' : 'grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]'}>
            <div className="min-w-0 space-y-4">
              {view === 'drawing' ? <PhysicalDrawing key={contextKey + view} levelId={levelId} camera={cameras.current.get(contextKey)} onCamera={camera => cameras.current.set(contextKey, camera)} document={preview} draft={draft} selectedBuilding={selectedBuilding} onSelectBuilding={selectBuilding} selectedId={selectedRoomId} onSelect={selectRoom} selectedOpeningId={selectedOpening?.id ?? null} onSelectOpening={selectOpening} update={update} takeoffScope={showTakeoffScope ? takeoffScope : undefined} sourceFocus={focus} /> :
                <fieldset disabled={blocked} className="min-w-0 rounded-lg border bg-white p-4 sm:p-5"><legend className="sr-only">Quick room measurements</legend><RoomMeasurements draft={draft} roomId={selectedRoomId} update={update} /></fieldset>}
              <PhysicalQuantities document={preview} roomId={selectedRoomId} unit={draft.displayUnit} />
              <OpeningList draft={draft} roomId={selectedRoomId} selectedId={selectedOpening?.id ?? null} onSelect={selectOpening} update={update} />
            </div>
            {view === 'drawing' ? inspector() : <div className="min-w-0 space-y-4"><PhysicalDrawing key={contextKey + view} levelId={levelId} camera={cameras.current.get(contextKey)} onCamera={camera => cameras.current.set(contextKey, camera)} document={preview} draft={draft} selectedBuilding={selectedBuilding} onSelectBuilding={selectBuilding} selectedId={selectedRoomId} onSelect={selectRoom} selectedOpeningId={selectedOpening?.id ?? null} onSelectOpening={selectOpening} update={update} takeoffScope={showTakeoffScope ? takeoffScope : undefined} sourceFocus={focus} />
              {selectedOpening || selectedBuilding ? inspector() : <p className="text-sm leading-6 text-slate-600">The drawing uses these same measurements. Select a room or opening to edit it.</p>}</div>}
          </div> : <p className="rounded-lg border border-dashed p-8 text-center text-slate-600">Add a room, then enter its measured dimensions. Ceiling height begins unknown.</p>}
          </> : null}
        </section>)}
        <TakeoffPanel key={draft.id} draft={draft} update={update} onFocus={locateSource} onEdit={editSource} showScope={showTakeoffScope} onShowScope={setShowTakeoffScope}
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
