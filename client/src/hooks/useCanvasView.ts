import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Position, Room } from '@/utils/types';

/** View-only scroll space. The canvas element still represents model origin (0, 0),
 * so pointer coordinates continue to use its bounding rectangle and current scale.
 */
export function useCanvasView(wrapperRef: RefObject<HTMLDivElement>, rooms: Room[], scale: number) {
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [request, setRequest] = useState(0);
  const pendingCenter = useRef<Position | null>(null);
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const measure = () => {
      const width = wrapper.clientWidth, height = wrapper.clientHeight;
      // Hidden sketch navigation must retain the last usable viewport.
      if (width <= 0 || height <= 0) return;
      setViewport(previous => previous.width === width && previous.height === height ? previous : { width, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(wrapper);
    measure();
    return () => observer.disconnect();
  }, [wrapperRef]);

  const layout = useMemo(() => {
    let minX = 0, minY = 0, maxX = 2000, maxY = 2000;
    for (const room of rooms) {
      minX = Math.min(minX, room.x); minY = Math.min(minY, room.y);
      maxX = Math.max(maxX, room.x + room.width); maxY = Math.max(maxY, room.y + room.height);
    }
    // Half a viewport beyond every edge makes even origin/edge rooms centerable
    // with nonnegative browser scroll positions. These are not room coordinates.
    // Whole-pixel gutters retain pointer alignment at the default drawing scale.
    return {
      origin: { x: Math.ceil(viewport.width / 2) - minX * scale, y: Math.ceil(viewport.height / 2) - minY * scale },
      width: (maxX - minX) * scale + viewport.width,
      height: (maxY - minY) * scale + viewport.height,
      planeWidth: maxX, planeHeight: maxY, viewport, scale,
    };
  }, [rooms, scale, viewport]);
  const previousLayout = useRef<typeof layout | null>(null);
  const worldCenter = useRef<Position | null>(null);
  const viewEstablished = useRef(false);
  const appliedScroll = useRef<Position | null>(null);
  // Remember actual user scroll/pan before a later scale/extent change can clamp
  // the DOM scroll offsets. Reading the old position after layout is too late.
  function captureCenter() {
    const wrapper = wrapperRef.current, previous = previousLayout.current;
    if (!wrapper || !previous) return;
    viewEstablished.current = true;
    worldCenter.current = {
      x: (wrapper.scrollLeft + previous.viewport.width / 2 - previous.origin.x) / previous.scale,
      y: (wrapper.scrollTop + previous.viewport.height / 2 - previous.origin.y) / previous.scale,
    };
  }
  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const rememberUserScroll = () => {
      const applied = appliedScroll.current;
      appliedScroll.current = null;
      if (applied && wrapper.scrollLeft === applied.x && wrapper.scrollTop === applied.y) return;
      captureCenter();
    };
    wrapper.addEventListener('scroll', rememberUserScroll, { passive: true });
    return () => wrapper.removeEventListener('scroll', rememberUserScroll);
  }, [wrapperRef]);

  useLayoutEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper || !viewport.width || !viewport.height) return;
    // Panels can report a tiny transitional size while they mount. Before any
    // view action, retain model origin rather than centering that temporary size.
    const center = pendingCenter.current ?? (viewEstablished.current ? worldCenter.current : null) ?? {
      x: viewport.width / 2 / scale, y: viewport.height / 2 / scale,
    };
    wrapper.scrollLeft = layout.origin.x + center.x * scale - viewport.width / 2;
    wrapper.scrollTop = layout.origin.y + center.y * scale - viewport.height / 2;
    worldCenter.current = center;
    appliedScroll.current = { x: wrapper.scrollLeft, y: wrapper.scrollTop };
    previousLayout.current = layout;
    pendingCenter.current = null;
  }, [layout, request, scale, viewport, wrapperRef]);

  function centerOn(point: Position) {
    viewEstablished.current = true;
    pendingCenter.current = point;
    setRequest(previous => previous + 1);
  }
  return { ...layout, centerOn, captureCenter };
}
