import { useMemo, useRef, useState } from 'react';
import type { PhysicalDocument } from '@shared/domain/document';
import { Button } from '@/components/ui/button';
import RoomBox from '@/components/RoomBox';
import { useCanvasView } from '@/hooks/useCanvasView';
import { getPlanPreviewBounds } from '@/utils/planPreview';
import { projectPhysicalRooms } from './projection';

const noop = () => {};
export function PhysicalDrawing({ document, selectedId, onSelect }: {
  document: PhysicalDocument; selectedId: string | null; onSelect: (id: string) => void;
}) {
  const projection = useMemo(() => projectPhysicalRooms(document), [document]);
  const wrapper = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const view = useCanvasView(wrapper, projection.rooms, scale);
  function fit() {
    const bounds = getPlanPreviewBounds(projection.rooms);
    if (!bounds || !wrapper.current) return;
    view.captureCenter();
    setScale(Math.min(3, Math.max(.02, Math.min((wrapper.current.clientWidth - 100) / Math.max(bounds.width, 1),
      (wrapper.current.clientHeight - 100) / Math.max(bounds.height, 1)))));
    view.centerOn({ x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 });
  }
  function zoom(factor: number) { view.captureCenter(); setScale(value => Math.max(.02, Math.min(5, value * factor))); }
  return <section aria-label="Physical drawing" className="min-w-0 rounded-lg border bg-white">
    <div className="flex flex-wrap items-center gap-2 border-b p-3">
      <Button size="sm" variant="outline" onClick={fit}>Fit drawing</Button>
      <Button size="sm" variant="outline" aria-label="Zoom out" onClick={() => zoom(1 / 1.25)}>−</Button>
      <span className="min-w-12 text-center text-sm tabular-nums">{Math.round(scale * 100)}%</span>
      <Button size="sm" variant="outline" aria-label="Zoom in" onClick={() => zoom(1.25)}>+</Button>
      <span className="text-xs text-slate-500">Scroll to pan · select a room to edit its measurements</span>
    </div>
    {/* The large scroll stage must not contribute an intrinsic width to the surrounding grid. */}
    <div ref={wrapper} data-testid="physical-canvas" style={{ overflowAnchor: 'none', contain: 'inline-size' }} className="relative h-[460px] overflow-auto overscroll-contain bg-slate-50">
      <div style={{ position: 'relative', width: view.width, height: view.height,
        backgroundImage: 'linear-gradient(#dce3ed 1px, transparent 1px), linear-gradient(90deg, #dce3ed 1px, transparent 1px)',
        backgroundSize: `${Math.max(8, 20 * scale)}px ${Math.max(8, 20 * scale)}px`,
        backgroundPosition: `${view.origin.x}px ${view.origin.y}px` }}>
        <div style={{ position: 'absolute', left: view.origin.x, top: view.origin.y, width: view.planeWidth, height: view.planeHeight, transform: `scale(${scale})`, transformOrigin: '0 0' }}>
          {projection.rooms.map(room => {
            const physical = document.rooms.find(item => item.id === room.id)!;
            return <div key={room.id} data-testid={'physical-room-' + room.id}
              data-mm-length={physical.length.valueMm ?? ''} data-mm-width={physical.width.valueMm ?? ''} data-group-id={room.groupId}
              role="button" tabIndex={0} aria-label={'Select ' + (room.name || 'Room')} aria-pressed={room.id === selectedId}
              onClick={() => onSelect(room.id)} onKeyDown={event => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(room.id); }
              }}
              style={{ position: 'absolute', left: room.x, top: room.y, width: room.width, height: room.height, cursor: 'pointer' }}>
              <div aria-hidden="true" style={{ pointerEvents: 'none' }}>
                <RoomBox room={{ ...room, x: 0, y: 0 }} scale={scale} isSelected={room.id === selectedId}
                  onSelect={noop} onResizeStart={noop} onMoveStart={noop} onUpdateRoom={noop} allowResize={false} />
              </div>
            </div>;
          })}
        </div>
      </div>
    </div>
    <div className="space-y-1 border-t p-3 text-xs leading-5 text-slate-600">
      <p>Read-only plan projection. Room and opening dragging, placement, deletion and group editing are unavailable here. Use the inspector for room measurements.</p>
      {document.rooms.some(room => !room.presentation) ? <p>Rooms without saved positions are arranged for viewing only.</p> : null}
      {projection.notices.map(notice => <p key={notice} className="text-amber-800">{notice}</p>)}
    </div>
  </section>;
}
