import { useEffect, useRef, useState, type RefObject } from 'react';
import type { Position } from '@/utils/types';

type Pinch = { ids: number[]; distance: number; scale: number; world: Position };
const distance = (a: Touch, b: Touch) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
const midpoint = (a: Touch, b: Touch) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });
const clampScale = (scale: number) => Math.max(0.02, Math.min(8, scale));

export function useCanvasZoom(stageRef: RefObject<HTMLDivElement>, canvasRef: RefObject<HTMLDivElement>,
  viewportRef: RefObject<HTMLDivElement>, active: boolean, scale: number,
  applyZoom: (scale: number, center: Position) => void, cancelEditing: () => void) {
  const touchOwned = useRef(false);
  const [pinching, setPinching] = useState(false);
  const latest = useRef({ scale, applyZoom, cancelEditing });
  latest.current = { scale, applyZoom, cancelEditing };
  const requestedScale = useRef(scale);
  useEffect(() => { requestedScale.current = scale; }, [scale]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!active || !stage) return;
    let pinch: Pinch | null = null;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    const blocked = () => Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], dialog[open]'));
    const worldAt = (point: Position) => {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.offsetWidth) return null;
      const rect = canvas.getBoundingClientRect(), renderedScale = rect.width / canvas.offsetWidth;
      if (!Number.isFinite(renderedScale) || renderedScale <= 0) return null;
      return { x: (point.x - rect.left) / renderedScale, y: (point.y - rect.top) / renderedScale };
    };
    const zoom = (next: number, point: Position, world: Position) => {
      const viewport = viewportRef.current;
      if (!viewport || !Number.isFinite(next)) return;
      const value = clampScale(next), rect = viewport.getBoundingClientRect();
      requestedScale.current = value;
      latest.current.applyZoom(value, {
        x: world.x + (viewport.clientWidth / 2 - (point.x - rect.left - viewport.clientLeft)) / value,
        y: world.y + (viewport.clientHeight / 2 - (point.y - rect.top - viewport.clientTop)) / value,
      });
    };
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey || event.defaultPrevented || blocked()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
      event.preventDefault();
      event.stopPropagation();
      if (touchOwned.current || event.buttons) return;
      const point = { x: event.clientX, y: event.clientY }, world = worldAt(point);
      if (!world) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportRef.current!.clientHeight : 1;
      const delta = Math.max(-500, Math.min(500, event.deltaY * unit));
      if (!delta) return;
      latest.current.cancelEditing();
      zoom(requestedScale.current * Math.exp(-delta * 0.002), point, world);
    };
    const start = (event: TouchEvent) => {
      if (releaseTimer !== undefined) clearTimeout(releaseTimer);
      if (event.touches.length === 1 && !pinch) touchOwned.current = false;
      if (event.touches.length < 2 || blocked()) return;
      event.preventDefault();
      event.stopPropagation();
      touchOwned.current = true;
      latest.current.cancelEditing();
      setPinching(true);
      if (event.touches.length !== 2) { pinch = null; return; }
      const a = event.touches[0], b = event.touches[1], gap = distance(a, b), world = worldAt(midpoint(a, b));
      pinch = gap > 1 && world ? { ids: [a.identifier, b.identifier], distance: gap, scale: latest.current.scale, world } : null;
    };
    const move = (event: TouchEvent) => {
      if (!touchOwned.current) return;
      event.preventDefault();
      event.stopPropagation();
      if (!pinch || event.touches.length !== 2) return;
      const touches = Array.from(event.touches);
      const a = touches.find(t => t.identifier === pinch!.ids[0]), b = touches.find(t => t.identifier === pinch!.ids[1]);
      if (!a || !b) { pinch = null; return; }
      const gap = distance(a, b);
      if (gap <= 1) return;
      zoom(pinch.scale * gap / pinch.distance, midpoint(a, b), pinch.world);
    };
    const end = (event: TouchEvent) => {
      if (!touchOwned.current) return;
      event.preventDefault();
      // Let child touchend/cancel handlers clear their pressed feedback. The
      // canvas commit handler is guarded until this event finishes propagating.
      if (event.touches.length < 2 || event.type === 'touchcancel') pinch = null;
      if (event.touches.length === 0) {
        setPinching(false);
        releaseTimer = setTimeout(() => { touchOwned.current = false; }, 0);
      }
    };
    const cancel = () => { pinch = null; setPinching(false); };
    const click = (event: MouseEvent) => {
      if (touchOwned.current) { event.preventDefault(); event.stopPropagation(); }
    };
    stage.addEventListener('wheel', wheel, { passive: false, capture: true });
    stage.addEventListener('touchstart', start, { passive: false, capture: true });
    stage.addEventListener('touchmove', move, { passive: false, capture: true });
    stage.addEventListener('touchend', end, { passive: false, capture: true });
    stage.addEventListener('touchcancel', end, { passive: false, capture: true });
    stage.addEventListener('click', click, true);
    window.addEventListener('blur', cancel);
    return () => {
      if (releaseTimer !== undefined) clearTimeout(releaseTimer);
      touchOwned.current = false;
      setPinching(false);
      stage.removeEventListener('wheel', wheel, true);
      stage.removeEventListener('touchstart', start, true);
      stage.removeEventListener('touchmove', move, true);
      stage.removeEventListener('touchend', end, true);
      stage.removeEventListener('touchcancel', end, true);
      stage.removeEventListener('click', click, true);
      window.removeEventListener('blur', cancel);
    };
  }, [active, canvasRef, stageRef, viewportRef]);
  return { touchOwned, pinching };
}
