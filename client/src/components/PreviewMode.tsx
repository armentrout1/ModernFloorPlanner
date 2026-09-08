import { useLayoutEffect, useMemo, useState } from 'react';
import type { Room } from '@/utils/types';
import { formatDimensions } from '@/utils/canvas';
import { getPlanPreviewBounds } from '@/utils/planPreview';
import { DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import RoomObject from './RoomObject';

interface PreviewModeProps {
  rooms: Room[];
  showRoomNames?: boolean;
  onClose: () => void;
}

export default function PreviewMode({ rooms, showRoomNames = true, onClose }: PreviewModeProps) {
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [names, setNames] = useState(showRoomNames);
  const [dimensions, setDimensions] = useState(true);
  const bounds = useMemo(() => getPlanPreviewBounds(rooms), [rooms]);
  useLayoutEffect(() => {
    const element = viewportElement;
    if (!element) return;
    const measure = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [viewportElement]);
  const scale = bounds ? Math.min(2,
    Math.max(1, viewport.width - 48) / Math.max(1, bounds.width),
    Math.max(1, viewport.height - 48) / Math.max(1, bounds.height)) : 1;

  return <DialogContent style={{ animation: 'none', transition: 'none' }} className="flex h-[calc(100dvh-2rem)] max-h-[960px] w-[calc(100vw-2rem)] max-w-6xl flex-col gap-3 overflow-hidden p-4 sm:p-6"
    onKeyDown={event => {
      if (event.key.toLowerCase() === 'p' && !event.ctrlKey && !event.metaKey && !event.altKey
          && !event.repeat && !event.nativeEvent.isComposing) {
        event.preventDefault(); event.stopPropagation(); onClose();
      }
    }}>
    <div className="shrink-0 pr-6">
      <DialogTitle>Floor Plan Preview</DialogTitle>
      <DialogDescription className="mt-1">Your current drawing, fitted to view. Preview does not change your sketch.</DialogDescription>
    </div>
    <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={names}
        onChange={event => setNames(event.target.checked)} />Room names</label>
      <label className="inline-flex items-center gap-2"><input type="checkbox" checked={dimensions}
        onChange={event => setDimensions(event.target.checked)} />Dimensions</label>
    </div>
    <div ref={setViewportElement} data-testid="plan-preview-viewport"
      className="relative min-h-0 min-w-0 flex-1 overflow-hidden rounded border border-slate-200 bg-white">
      {!bounds ? <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-500">Draw a room to preview your plan.</div>
        : <div data-testid="plan-preview-drawing" data-scale={scale} className="absolute"
          style={{ left: (viewport.width - bounds.width * scale) / 2,
            top: (viewport.height - bounds.height * scale) / 2,
            width: bounds.width, height: bounds.height, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          {rooms.map(room => <div key={room.id} data-testid={'preview-room-' + room.id}
            className="absolute" style={{ left: room.x - bounds.x, top: room.y - bounds.y,
              width: room.width, height: room.height, backgroundColor: room.color || '#93c5fd',
              boxShadow: 'inset 0 0 0 2px #334155' }}>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 overflow-hidden p-2 text-center text-slate-900"
              style={{ fontSize: Math.min(14 / scale, room.width / 6, room.height / 5), lineHeight: 1.3 }}>
              {names && <span className="max-w-full break-words font-medium">{room.name || 'Room'}</span>}
              {dimensions && <span>{formatDimensions(room.width, room.height)}</span>}
            </div>
          </div>)}
          {/* Openings use the editor's renderer, above all room fills, without editing hit targets. */}
          {rooms.map(room => <div key={room.id + '-openings'} className="pointer-events-none absolute"
            style={{ left: room.x - bounds.x, top: room.y - bounds.y }}>
            {room.objects?.map(object => <RoomObject key={object.id} room={room} object={object}
              scale={scale} isSelected={false} preview onSelect={() => {}} />)}
          </div>)}
        </div>}
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
      <p>{rooms.length} {rooms.length === 1 ? 'room' : 'rooms'} - Schematic view</p>
      <DialogClose asChild><Button variant="outline" size="sm">Close preview</Button></DialogClose>
    </div>
  </DialogContent>;
}
