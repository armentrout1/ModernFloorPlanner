import { LayoutDrawingOverlay } from './LayoutDrawingOverlay';
import { StairDrawingOverlay } from './StairDrawingOverlay';
import type { BuildingSelection } from './StairControls';
import { useCallback, useEffect, useMemo, useRef, useState, useLayoutEffect, type PointerEvent as Pointer } from 'react';
import type { PhysicalDocument, PhysicalOpening } from '@shared/domain/document';
import { Button } from '@/components/ui/button';
import RoomBox from '@/components/RoomBox';
import RoomObject from '@/components/RoomObject';
import { useCanvasView } from '@/hooks/useCanvasView';
import { getPlanPreviewBounds } from '@/utils/planPreview';
import { getDoorGeometry } from '@/utils/doorGeometry';
import type { Room } from '@/utils/types';
import { projectPhysicalRooms } from './projection';
import type { PhysicalDraft } from './state';
import type { LevelCamera } from './levelView';
import type { DrawingSourceScope, DrawingSourceFocus } from './takeoffReadModel';
import { drawingSourceMarks, drawingSourceBounds, type SourceMark } from './drawingSources';
import { addOpening, moveOpening, createOpeningProposal, validateOpeningPlacement, setOpeningAppearance } from './openingCommands';
import { pointerToWorld, findPhysicalWall, openingWallCenter, moveOpeningPreview, gestureMatchesDraft,
  type WallTarget, type OpeningGestureStamp } from './openingGeometry';

const noop = () => {};
type Kind = PhysicalOpening['kind'];
type Preview = { target: WallTarget; opening: PhysicalOpening; validation: ReturnType<typeof validateOpeningPlacement> };
type Gesture = OpeningGestureStamp & { openingId: string | null; kind: Kind | null; id: string; startX: number; startY: number; moved: boolean };
const proposalOptions = (kind: Kind) => ({ widthMm: (kind === 'door' ? 32 : 36) * 25.4, ...(kind === 'door' ? { appearance: {
  style: 'single' as const, swingDirection: 'inward' as const, swingSide: 'right' as const, metadata: { source: 'proposed' },
} } : {}) });
const kindLabel = (kind: Kind) => kind === 'floor-level-opening' ? 'opening' : kind;
export function PhysicalDrawing({ document, selectedId, onSelect, draft, selectedOpeningId = null, onSelectOpening = noop, update, takeoffScope, sourceFocus, levelId, camera, onCamera, selectedBuilding = null, onSelectBuilding = noop }: {
  selectedBuilding?: BuildingSelection | null; onSelectBuilding?: (selection: BuildingSelection) => void;
  levelId?: string | null; camera?: LevelCamera; onCamera?: (camera: LevelCamera) => void;
  document: PhysicalDocument; selectedId: string | null; onSelect: (id: string) => void;
  draft?: PhysicalDraft; selectedOpeningId?: string | null; onSelectOpening?: (id: string | null) => void;
  takeoffScope?: DrawingSourceScope; sourceFocus?: DrawingSourceFocus;
  update?: (change: (draft: PhysicalDraft) => PhysicalDraft, expectedRevision?: number) => boolean;
}) {
  const projection = useMemo(() => projectPhysicalRooms(document, levelId), [document, levelId]);
  const wrapper = useRef<HTMLDivElement>(null);
  const scopeMarks = useMemo(() => takeoffScope ? drawingSourceMarks(document, projection.rooms, takeoffScope) : [], [document, projection.rooms, takeoffScope]);
  const focusMarks = useMemo(() => sourceFocus ? drawingSourceMarks(document, projection.rooms, sourceFocus.scope) : [], [document, projection.rooms, sourceFocus]);
  const appliedSourceFocus = useRef<string | null>(null);
  const [scale, setScale] = useState(camera?.scale ?? 1), [tool, setTool] = useState<Kind | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null), [message, setMessage] = useState('');
  const gesture = useRef<Gesture | null>(null), spaceHeld = useRef(false);
  const lastOpeningClick = useRef<{ id: string; at: number; x: number; y: number; count: number } | null>(null);
  const view = useCanvasView(wrapper, projection.rooms, scale, camera?.center);
  const cameraCallback = useRef(onCamera); cameraCallback.current = onCamera;
  useLayoutEffect(() => {
    const element = wrapper.current;
    if (!element || !view.viewport.width || !view.viewport.height) return;
    const remember = () => cameraCallback.current?.({ scale, center: {
      x: (element.scrollLeft + element.clientWidth / 2 - view.origin.x) / scale,
      y: (element.scrollTop + element.clientHeight / 2 - view.origin.y) / scale,
    } });
    remember(); element.addEventListener('scroll', remember, { passive: true });
    return () => { element.removeEventListener('scroll', remember); };
  }, [scale, view.origin.x, view.origin.y, view.viewport.width, view.viewport.height]);
  const editable = Boolean(draft && update);
  const release = useCallback(() => {
    const previous = gesture.current; gesture.current = null;
    if (wrapper.current) delete wrapper.current.dataset.physicalGesture;
    if (previous && wrapper.current?.hasPointerCapture(previous.pointerId)) wrapper.current.releasePointerCapture(previous.pointerId);
  }, []);
  const cancel = useCallback((reason = '', disarm = true) => {
    release(); lastOpeningClick.current = null; setPreview(null); if (disarm) setTool(null); if (reason) setMessage(reason);
  }, [release]);
  useEffect(() => {
    const blur = () => { spaceHeld.current = false; cancel('Unfinished opening gesture canceled.'); };
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing || event.defaultPrevented) return;
      const editing = event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]');
      if (event.code === 'Space' && !editing) {
        spaceHeld.current = true; lastOpeningClick.current = null;
        if (gesture.current) cancel('Opening gesture canceled for panning.');
      }
      if (event.key === 'Control' || event.key === 'Meta' || event.key === 'Alt') {
        lastOpeningClick.current = null;
        if (gesture.current) cancel('Opening gesture canceled after a modifier change.');
      }
      if (event.key === 'Escape' && !editing && !window.document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]')) cancel();
    };
    const keyup = (event: KeyboardEvent) => { if (event.code === 'Space') spaceHeld.current = false; };
    const hidden = () => { if (window.document.hidden) blur(); };
    window.addEventListener('blur', blur); window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup);
    window.document.addEventListener('visibilitychange', hidden);
    return () => {
      release(); window.removeEventListener('blur', blur); window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup);
      window.document.removeEventListener('visibilitychange', hidden);
    };
  }, [cancel, release]);
  useEffect(() => { cancel(); }, [draft?.id, levelId, cancel]);
  useEffect(() => {
    const viewport = wrapper.current; if (!viewport) return;
    let width = viewport.clientWidth, height = viewport.clientHeight;
    const changed = () => { spaceHeld.current = false; cancel(); };
    const resize = new ResizeObserver(() => {
      if (width !== viewport.clientWidth || height !== viewport.clientHeight) {
        width = viewport.clientWidth; height = viewport.clientHeight; changed();
      }
    });
    resize.observe(viewport); window.addEventListener('physical-layout-change', changed);
    return () => { resize.disconnect(); window.removeEventListener('physical-layout-change', changed); };
  }, [cancel]);
  useEffect(() => {
    if (gesture.current && draft && !gestureMatchesDraft(gesture.current, draft)) cancel('The draft changed. The unfinished opening gesture was canceled.');
  }, [draft?.id, draft?.localEditRevision, cancel]);
  useEffect(() => {
    const key = sourceFocus ? JSON.stringify([draft?.id, sourceFocus.key]) : null;
    if (!key || key === appliedSourceFocus.current) return;
    appliedSourceFocus.current = key;
    cancel();
    const bounds = drawingSourceBounds(focusMarks), viewport = wrapper.current;
    if (!bounds || !viewport) { setMessage('This source has no supported drawing position yet. Complete its plan dimensions in the inspector.'); return; }
    view.captureCenter();
    setScale(Math.min(3, Math.max(.02, Math.min((viewport.clientWidth - 100) / Math.max(bounds.width, 40),
      (viewport.clientHeight - 100) / Math.max(bounds.height, 40)))));
    view.centerOn({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
    // A new key is an explicit locate action. Editing, panel reflow and source
    // mark changes retain the current camera instead of repeatedly re-fitting.
  }, [sourceFocus?.key, draft?.id]);
  function sourceOverlay(marks: SourceMark[], focused: boolean) {
    const color = focused ? '#a855f7' : '#0f766e', thickness = (focused ? 5 : 3) / scale;
    return marks.map(mark => <div key={JSON.stringify([mark.kind, mark.id, mark.wallFaceId])}
      data-testid={'physical-' + (focused ? 'source' : 'scope') + '-' + mark.kind + '-' + mark.id}
      data-wall-face-id={mark.wallFaceId} data-source-kind={mark.kind} aria-hidden="true"
      style={{ position: 'absolute', pointerEvents: 'none', zIndex: 6000,
        left: mark.x - (mark.width === 0 ? thickness / 2 : 0), top: mark.y - (mark.height === 0 ? thickness / 2 : 0),
        width: Math.max(mark.width, thickness), height: Math.max(mark.height, thickness),
        border: ['room','surface-opening','stair'].includes(mark.kind) ? thickness + 'px solid ' + color : undefined,
        background: ['room','surface-opening','stair'].includes(mark.kind) ? (focused ? '#a855f712' : '#0f766e12') : color,
        boxSizing: 'border-box', opacity: focused ? .8 : .6 }} />);
  }
  function fit() {
    cancel(); const bounds = getPlanPreviewBounds(projection.rooms);
    if (!bounds || !wrapper.current) return;
    view.captureCenter();
    setScale(Math.min(3, Math.max(.02, Math.min((wrapper.current.clientWidth - 100) / Math.max(bounds.width, 1),
      (wrapper.current.clientHeight - 100) / Math.max(bounds.height, 1)))));
    view.centerOn({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  }
  function zoom(factor: number) { cancel(); view.captureCenter(); setScale(value => Math.max(.02, Math.min(5, value * factor))); }
  function targetAt(clientX: number, clientY: number): WallTarget | null {
    const viewport = wrapper.current; if (!viewport) return null;
    const bounds = viewport.getBoundingClientRect();
    if (clientX < bounds.left + viewport.clientLeft || clientX > bounds.left + viewport.clientLeft + viewport.clientWidth
        || clientY < bounds.top + viewport.clientTop || clientY > bounds.top + viewport.clientTop + viewport.clientHeight) return null;
    const point = pointerToWorld({ x: clientX, y: clientY }, {
      bounds: { left: bounds.left, top: bounds.top, clientLeft: viewport.clientLeft, clientTop: viewport.clientTop },
      scroll: { x: viewport.scrollLeft, y: viewport.scrollTop }, origin: view.origin, scale,
    });
    return point ? findPhysicalWall(point, document, projection.rooms, Math.max(8, 16 / scale)) : null;
  }
  function makePreview(target: WallTarget | null, active: Pick<Gesture, 'openingId' | 'kind' | 'id'>): Preview | null {
    if (!target || !draft) return null;
    const existing = active.openingId ? draft.document.openings.find(item => item.id === active.openingId) : null;
    if (!existing && !active.kind) return null;
    try {
      const opening = existing ? moveOpeningPreview(existing, target)
        : createOpeningProposal(active.id, active.kind!, target.wallFaceId, target.offsetMm, proposalOptions(active.kind!));
      return { target, opening, validation: validateOpeningPlacement(draft, opening) };
    } catch (error) { setMessage(error instanceof Error ? error.message : 'This opening cannot be moved safely.'); return null; }
  }
  function start(event: Pointer<HTMLDivElement>) {
    if (event.target instanceof Element && event.target.closest('[data-building-object]')) return;
    if (gesture.current && gesture.current.pointerId !== event.pointerId) { cancel('Multitouch canceled the opening gesture.'); return; }
    if (!editable || !draft || event.button !== 0 || spaceHeld.current || event.altKey || event.ctrlKey || event.metaKey) {
      lastOpeningClick.current = null; return;
    }
    const hit = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-physical-opening-id]') : null;
    const roomTarget = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-physical-room-id]') : null;
    if (!tool && !hit) { lastOpeningClick.current = null; if (roomTarget?.dataset.physicalRoomId) onSelect(roomTarget.dataset.physicalRoomId); return; }
    event.preventDefault(); event.stopPropagation(); setMessage('');
    const openingId = tool ? null : hit!.dataset.physicalOpeningId!;
    const opening = openingId ? document.openings.find(item => item.id === openingId) : null;
    if (openingId) { onSelectOpening(openingId); wrapper.current?.focus({ preventScroll: true }); }
    if (opening && opening.attachments.length !== 1) {
      setMessage('This shared opening has two wall faces. Drawing movement is disabled until both attachments can be updated together.'); return;
    }
    const next: Gesture = { draftId: draft.id, revision: draft.localEditRevision, pointerId: event.pointerId,
      openingId, kind: tool, id: openingId ?? crypto.randomUUID(), startX: event.clientX, startY: event.clientY, moved: false };
    gesture.current = next; if (wrapper.current) wrapper.current.dataset.physicalGesture = "active"; wrapper.current?.setPointerCapture(event.pointerId);
    if (tool) setPreview(makePreview(targetAt(event.clientX, event.clientY), next));
  }
  function move(event: Pointer<HTMLDivElement>) {
    const active = gesture.current;
    if (active) {
      if (event.pointerId !== active.pointerId) return;
      event.preventDefault(); event.stopPropagation();
      if (spaceHeld.current || event.altKey || event.ctrlKey || event.metaKey || event.buttons !== 1) {
        cancel('Opening gesture canceled after a mouse-button or modifier change.'); return;
      }
      if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) >= 3) active.moved = true;
      if (active.moved || active.kind) setPreview(makePreview(targetAt(event.clientX, event.clientY), active));
    } else if (tool && !spaceHeld.current && !event.altKey && !event.ctrlKey && !event.metaKey && event.buttons === 0) {
      setPreview(makePreview(targetAt(event.clientX, event.clientY), { openingId: null, kind: tool, id: 'physical-opening-preview' }));
    }
  }
  function finish(event: Pointer<HTMLDivElement>) {
    const active = gesture.current; if (!active || active.pointerId !== event.pointerId) return;
    event.preventDefault(); event.stopPropagation(); release(); setPreview(null);
    if (event.button !== 0 || event.buttons !== 0 || spaceHeld.current || event.altKey || event.ctrlKey || event.metaKey) {
      lastOpeningClick.current = null; setMessage('Opening gesture canceled after a mouse-button or modifier change.'); return;
    }
    if (!draft || !update || !gestureMatchesDraft(active, draft)) { setMessage('The draft changed. This stale opening gesture was not applied.'); return; }
    if (!active.kind && !active.moved) {
      const previous = lastOpeningClick.current;
      const count = previous?.id === active.id && event.timeStamp - previous.at <= 600
        && Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 6 ? previous.count + 1 : 1;
      lastOpeningClick.current = { id: active.id, at: event.timeStamp, x: event.clientX, y: event.clientY, count }; return;
    }
    lastOpeningClick.current = null;
    const candidate = makePreview(targetAt(event.clientX, event.clientY), active);
    if (!candidate) { setMessage('Drop on a supported room wall. The opening was not changed.'); return; }
    if (candidate.validation.status === 'invalid') { setMessage(candidate.validation.messages.join(' ')); return; }
    try {
      const applied = update(current => active.openingId
        ? moveOpening(current, active.openingId, candidate.target.wallFaceId, candidate.target.offsetMm, new Date().toISOString())
        : addOpening(current, active.id, active.kind!, candidate.target.wallFaceId, candidate.target.offsetMm, new Date().toISOString(), proposalOptions(active.kind!)), active.revision);
      if (!applied) { setMessage('The opening gesture was not applied. Check the current draft and try again.'); return; }
      setTool(null); onSelect(candidate.target.roomId); onSelectOpening(active.id); wrapper.current?.focus({ preventScroll: true });
      setMessage(candidate.validation.status === 'undetermined' ? 'Opening saved with missing information; fit remains unverified. ' + candidate.validation.messages.join(' ') : 'Opening updated.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'The opening was not changed.'); }
  }
  function flip(opening: PhysicalOpening) {
    if (!draft || !update || !opening.appearance || opening.appearance.style === 'sliding') return;
    cancel();
    update(current => setOpeningAppearance(current, opening.id, { ...opening.appearance!,
      swingSide: opening.appearance!.swingSide === 'left' ? 'right' : 'left' }, new Date().toISOString()), draft.localEditRevision);
  }
  const previewProjection = useMemo(() => preview ? projectPhysicalRooms({ ...document,
    openings: [...document.openings.filter(item => item.id !== preview.opening.id), preview.opening] }, levelId) : null, [document, preview, levelId]);
  function openingHits(room: Room) {
    const physical = document.rooms.find(item => item.id === room.id)!;
    return document.openings.flatMap(opening => opening.attachments.filter(attachment => physical.wallFaces.some(face => face.id === attachment.wallFaceId)).map(attachment => {
      const side = physical.wallFaces.find(face => face.id === attachment.wallFaceId)!.side;
      const rendered = room.objects?.find(item => item.id === opening.id);
      const object = rendered ?? projection.floorLevelOpenings[room.id]?.find(item => item.id === opening.id);
      const spanMm = side === 'top' || side === 'bottom' ? physical.length.valueMm! : physical.width.valueMm!;
      const fraction = attachment.offsetMm / spanMm;
      const position = object?.position ?? (side === 'bottom' || side === 'left' ? 1 - fraction : fraction) * 100;
      const center = openingWallCenter(room, side, position);
      const door = rendered?.type === 'door' ? getDoorGeometry(room, rendered) : null;
      const extent = door?.size ?? object?.size ?? 12 / scale;
      const horizontal = side === 'top' || side === 'bottom';
      const width = horizontal ? Math.max(6 / scale, extent) : Math.max(8, 20 / scale);
      const height = horizontal ? Math.max(8, 20 / scale) : Math.max(6 / scale, extent);
      return <div key={opening.id + attachment.wallFaceId}>
        <button type="button" data-testid={'physical-opening-' + opening.id} data-physical-opening-id={opening.id}
          data-wall-face-id={attachment.wallFaceId} data-opening-type={opening.kind} data-offset-mm={attachment.offsetMm}
          aria-label={'Select ' + kindLabel(opening.kind)} aria-pressed={selectedOpeningId === opening.id}
          title={object ? 'Drag the wall opening to move. Double-click a hinged door to flip hand.' : 'Unresolved symbol: this marker does not represent a measured opening width.'}
          onClick={event => { event.preventDefault(); event.stopPropagation(); }}
          onKeyDown={event => { if ((event.key === 'Enter' || event.key === ' ') && !event.nativeEvent.isComposing) {
            event.preventDefault(); event.stopPropagation(); onSelectOpening(opening.id); wrapper.current?.focus({ preventScroll: true });
          } }}
          style={{ position: 'absolute', left: center.x - width / 2, top: center.y - height / 2, width, height,
            zIndex: 3000, padding: 0, border: selectedOpeningId === opening.id ? '1px solid #2563eb' : 'none',
            background: object ? 'transparent' : '#fbbf24', cursor: opening.attachments.length === 1 ? 'grab' : 'pointer', touchAction: 'none' }} />
        {door && opening.appearance?.style !== 'sliding' && <svg aria-hidden="true" style={{ position: 'absolute',
          left: door.origin.x, top: door.origin.y, width: door.swingSize, height: door.swingSize, overflow: 'visible', pointerEvents: 'none', zIndex: 3001 }}>
          <g transform={door.transform}><path d={door.sectorPath} fill="transparent" stroke="transparent" strokeWidth={Math.max(3, 8 / scale)}
            data-testid={'physical-opening-swing-' + opening.id} data-physical-opening-id={opening.id} style={{ pointerEvents: 'all', cursor: 'pointer' }}
 /></g>
        </svg>}
      </div>;
    }));
  }
  return <section aria-label="Physical drawing" className="min-w-0 rounded-lg border bg-white">
    <div className="flex flex-wrap items-center gap-2 border-b p-3">
      {editable && (['door', 'window', 'floor-level-opening'] as const).map(kind => <Button key={kind} size="sm"
        variant={tool === kind ? 'default' : 'outline'} aria-pressed={tool === kind}
        onClick={() => { cancel(); setTool(kind); setMessage('Proposed ' + (kind === 'door' ? '32' : '36') + ' in width. Height, sill and measurement basis remain unknown. Click a wall; Escape cancels.'); }}>
        Add {kind === 'door' ? 'Door' : kind === 'window' ? 'Window' : 'Opening'}</Button>)}
      <Button size="sm" variant="outline" onClick={fit}>Fit drawing</Button>
      <Button size="sm" variant="outline" aria-label="Zoom out" onClick={() => zoom(1 / 1.25)}>-</Button>
      <span className="min-w-12 text-center text-sm tabular-nums">{Math.round(scale * 100)}%</span>
      <Button size="sm" variant="outline" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</Button>
      <span className="text-xs text-slate-500">Scroll to pan; center distance follows the wall clockwise</span>
    </div>
    <div ref={wrapper} tabIndex={-1} data-testid="physical-canvas" onPointerDownCapture={start} onPointerMoveCapture={move} onPointerUpCapture={finish}
      onMouseDownCapture={event => {
        if (gesture.current && event.button !== 0) {
          event.preventDefault(); event.stopPropagation(); cancel('Opening gesture canceled after a mouse-button change.');
        }
      }}
      onDoubleClickCapture={event => {
        // Pointer capture can retarget the compatibility double-click to this
        // viewport. Require a preceding owned primary opening click at this point.
        const click = lastOpeningClick.current;
        if (!click || click.count < 2 || gesture.current || spaceHeld.current || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey
            || event.timeStamp - click.at > 600 || Math.hypot(event.clientX - click.x, event.clientY - click.y) > 6) return;
        const opening = document.openings.find(item => item.id === click.id);
        if (!opening) return;
        event.preventDefault(); event.stopPropagation(); lastOpeningClick.current = null; flip(opening);
      }}
      onPointerCancel={() => cancel('Opening gesture canceled.')} onLostPointerCapture={event => {
        if (gesture.current?.pointerId === event.pointerId) cancel('Opening gesture canceled after pointer capture was lost.');
      }} onPointerLeave={() => { if (!gesture.current) setPreview(null); }}
      onWheelCapture={() => {
        lastOpeningClick.current = null;
        if (gesture.current) cancel('Opening gesture canceled for panning or zooming.'); else setPreview(null);
      }}
      style={{ overflowAnchor: 'none', contain: 'inline-size', touchAction: tool ? 'none' : 'auto' }}
      className="relative h-[clamp(220px,50dvh,460px)] min-w-0 overflow-auto overscroll-contain bg-slate-50">
      <div style={{ position: 'relative', width: view.width, height: view.height,
        backgroundImage: 'linear-gradient(#dce3ed 1px, transparent 1px), linear-gradient(90deg, #dce3ed 1px, transparent 1px)',
        backgroundSize: `${Math.max(8, 20 * scale)}px ${Math.max(8, 20 * scale)}px`, backgroundPosition: `${view.origin.x}px ${view.origin.y}px` }}>
        <div data-testid="physical-canvas-plane" style={{ position: 'absolute', left: view.origin.x, top: view.origin.y, width: view.planeWidth, height: view.planeHeight,
          transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          {projection.rooms.map(room => {
            const physical = document.rooms.find(item => item.id === room.id)!;
            const activeWall = preview?.target.roomId === room.id ? preview.target.side
              : document.openings.find(opening => opening.id === selectedOpeningId)?.attachments.map(attachment => physical.wallFaces.find(face => face.id === attachment.wallFaceId)).find(Boolean)?.side;
            const startPoint = activeWall === 'right' ? { x: room.width, y: 0 } : activeWall === 'bottom' ? { x: room.width, y: room.height }
              : activeWall === 'left' ? { x: 0, y: room.height } : { x: 0, y: 0 };
            return <div key={room.id} data-testid={'physical-room-' + room.id} data-physical-room-id={room.id} data-level-id={levelId ?? undefined}
              data-mm-length={physical.length.valueMm ?? ''} data-mm-width={physical.width.valueMm ?? ''} data-group-id={room.groupId}
              role="button" tabIndex={0} aria-label={'Select ' + (room.name || 'Room')} aria-pressed={room.id === selectedId}
              onClick={event => { if (!editable) onSelect(room.id); event.stopPropagation(); }} onKeyDown={event => {
                if ((event.key === 'Enter' || event.key === ' ') && !event.nativeEvent.isComposing) { event.preventDefault(); event.stopPropagation(); onSelect(room.id); }
              }} style={{ position: 'absolute', left: room.x, top: room.y, width: room.width, height: room.height, cursor: tool ? 'crosshair' : 'pointer' }}>
              <div aria-hidden="true" style={{ pointerEvents: 'none' }} className="[&_[data-testid^=room-name-]>div]:max-w-full [&_[data-testid^=room-name-]>div]:truncate">
                <RoomBox room={{ ...room, x: 0, y: 0 }} scale={scale} isSelected={room.id === selectedId} selectedObjectId={selectedOpeningId}
                  floorLevelOpenings={projection.floorLevelOpenings[room.id]} onSelect={noop} onResizeStart={noop} onMoveStart={noop} onUpdateRoom={noop} allowResize={false} stackAnnotations />
              </div>
              {editable && openingHits(room)}
              {activeWall && <span aria-hidden="true" data-testid="physical-wall-start" style={{ position: 'absolute', left: startPoint.x, top: startPoint.y,
                zIndex: 4000, fontSize: 11 / scale, background: 'white', color: '#1d4ed8', pointerEvents: 'none' }}>{activeWall} start (clockwise)</span>}
            </div>;
          })}
          {draft && update && (document.schemaVersion === 4 || document.schemaVersion === 5) ? <StairDrawingOverlay document={document} draft={draft} rooms={projection.rooms} levelId={levelId} scale={scale} origin={view.origin} viewport={wrapper} selected={selectedBuilding} onSelect={onSelectBuilding} update={update} /> : null}
          {draft && update && document.schemaVersion === 5 ? <LayoutDrawingOverlay document={document} draft={draft} rooms={projection.rooms} levelId={levelId} scale={scale} origin={view.origin} viewport={wrapper} selected={selectedBuilding} onSelect={onSelectBuilding} update={update} /> : null}
          {sourceOverlay(scopeMarks, false)}
          {sourceOverlay(focusMarks, true)}
          {preview && previewProjection && (() => {
            const room = previewProjection.rooms.find(item => item.id === preview.target.roomId);
            if (!room) return null;
            const object = room.objects?.find(item => item.id === preview.opening.id);
            const floor = previewProjection.floorLevelOpenings[room.id]?.find(item => item.id === preview.opening.id);
            return <div data-testid="physical-opening-preview" data-validation={preview.validation.status}
              style={{ position: 'absolute', left: room.x, top: room.y, opacity: .6, pointerEvents: 'none', zIndex: 5000,
                filter: preview.validation.status === 'invalid' ? 'sepia(1) saturate(5)' : undefined }}>
              {object && <RoomObject room={{ ...room, x: 0, y: 0 }} object={object} scale={scale} preview isSelected onSelect={noop} />}
              {floor && <RoomObject room={{ ...room, x: 0, y: 0 }} object={{ ...floor, type: 'window' }} floorLevelOpening scale={scale} preview isSelected onSelect={noop} />}
            </div>;
          })()}
        </div>
      </div>
    </div>
    <div className="space-y-1 border-t p-3 text-xs leading-5 text-slate-600">
      {editable ? <p>Drag a single-face opening along a wall or onto another room wall. Room movement, resizing and group editing remain read-only.</p>
        : <p>Read-only plan projection. Use the inspector for room measurements.</p>}
      {editable && <div data-testid="physical-gesture-feedback" className="h-24 space-y-1 overflow-y-auto overscroll-contain">
        {message && <p role="status" data-testid="physical-gesture-message" className="text-amber-800">{message}</p>}
        {preview && <p role="status">{preview.validation.status === 'invalid' ? 'Invalid drop: ' : preview.validation.status === 'undetermined' ? 'Incomplete, fit unverified: ' : 'Ready to place: '}
          {preview.validation.messages.join(' ') || 'Center measured from the clockwise wall start.'}</p>}
      </div>}
      {takeoffScope && <p>Teal marks show takeoff scope; purple marks locate the selected quantity source. Editing selection is separate.</p>}
      {projection.rooms.some(room => !document.rooms.find(value => value.id === room.id)?.presentation) ? <p>Rooms without saved positions are arranged for viewing only.</p> : null}
      {projection.notices.map(notice => <p key={notice} className="text-amber-800">{notice}</p>)}
    </div>
  </section>;
}
