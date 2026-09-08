import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type RefObject } from 'react';
import { shouldIgnoreEditorShortcut } from '@/utils/keyboard';

const buttonMask = (button: number) => button === 0 ? 1 : button === 1 ? 4 : button === 2 ? 2 : 1 << button;

type PanGesture = { x: number; y: number; button: number; source: 'middle' | 'space' | 'hand' | 'ctrl' };

/** Mouse panning owns its gesture before any room/opening editing handlers. */
export function useCanvasPan(viewportRef: RefObject<HTMLDivElement>, active: boolean,
  moveTool: boolean, canStart: boolean, captureCenter: () => void) {
  const gesture = useRef<PanGesture | null>(null);
  const ownedButton = useRef<number | null>(null);
  const pressedButtons = useRef(new Set<number>());
  const space = useRef(false);
  const hand = useRef(false);
  const suppressClick = useRef(false);
  const latest = useRef({ captureCenter });
  latest.current = { captureCenter };
  const [dragging, setDragging] = useState(false);
  const [ready, setReady] = useState(false);
  function updateReady() { setReady(space.current || hand.current); }
  function finish() {
    if (!gesture.current) return;
    gesture.current = null;
    // Keep ownership until mouseup, even when Space/Escape/blur cancels movement.
    // Otherwise that release could place an opening through the legacy editor.
    latest.current.captureCenter();
    setDragging(false);
  }

  useEffect(() => {
    if (!active) {
      finish();
      space.current = false;
      hand.current = false;
      suppressClick.current = false;
      ownedButton.current = null;
      pressedButtons.current.clear();
      updateReady();
      return;
    }
    const move = (event: MouseEvent) => {
      const pan = gesture.current, viewport = viewportRef.current;
      if (ownedButton.current === null || !viewport) return;
      event.preventDefault();
      event.stopPropagation();
      if (!pan) return;
      if (!(event.buttons & buttonMask(pan.button))) { finish(); return; }
      // Screen pixels, not model units. Update the anchor even at a scroll limit
      // so reversing direction responds immediately, with no accumulated overshoot.
      viewport.scrollLeft -= event.clientX - pan.x;
      viewport.scrollTop -= event.clientY - pan.y;
      pan.x = event.clientX;
      pan.y = event.clientY;
      latest.current.captureCenter();
    };
    const up = (event: MouseEvent) => {
      if (!pressedButtons.current.has(event.button)) return;
      event.preventDefault();
      event.stopPropagation();
      pressedButtons.current.delete(event.button);
      if (event.button === ownedButton.current) finish();
      if (pressedButtons.current.size === 0) ownedButton.current = null;
    };
    const downKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && gesture.current) {
        event.preventDefault();
        finish();
      } else if (event.key === ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        // Once accepted, prevent repeated Space from scrolling the page too.
        if (space.current) { event.preventDefault(); return; }
        if (shouldIgnoreEditorShortcut(event)) return;
        event.preventDefault();
        space.current = true;
        updateReady();
      }
    };
    const upKey = (event: KeyboardEvent) => {
      if (event.key !== ' ') return;
      space.current = false;
      if (gesture.current?.source === 'space') finish();
      updateReady();
    };
    const cancel = () => {
      finish();
      space.current = false;
      updateReady();
    };
    const visibility = () => { if (document.hidden) cancel(); };
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
    window.addEventListener('keydown', downKey);
    window.addEventListener('keyup', upKey);
    window.addEventListener('blur', cancel);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      cancel();
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      window.removeEventListener('keydown', downKey);
      window.removeEventListener('keyup', upKey);
      window.removeEventListener('blur', cancel);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [active, viewportRef]);

  function onMouseDownCapture(event: ReactMouseEvent) {
    const held = ownedButton.current;
    if (held !== null && (gesture.current || Array.from(pressedButtons.current).some(button => button !== event.button && (event.buttons & buttonMask(button))))) {
      // Consume the entire button chord, regardless of which button is released first.
      pressedButtons.current.add(event.button);
      if (event.button === 0) suppressClick.current = true;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    suppressClick.current = false;
    ownedButton.current = null;
    pressedButtons.current.clear();
    const target = event.target instanceof Element ? event.target : null;
    if (!active || !canStart || event.defaultPrevented || !target ||
      target.closest('input, textarea, select, button, a, [contenteditable]:not([contenteditable="false"])') ||
      document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], dialog[open]')) return;
    const source = event.button === 1 ? 'middle' : event.button === 0
      ? space.current ? 'space' : hand.current ? 'hand' : moveTool && event.ctrlKey ? 'ctrl' : null
      : null;
    if (!source) return;
    // Stop native autoscroll and room/opening/resize handlers for this press.
    event.preventDefault();
    event.stopPropagation();
    ownedButton.current = event.button;
    pressedButtons.current.add(event.button);
    gesture.current = { x: event.clientX, y: event.clientY, button: event.button, source };
    suppressClick.current = event.button === 0;
    setDragging(true);
  }
  function onClickCapture(event: ReactMouseEvent) {
    if (!suppressClick.current || event.detail === 0) return;
    suppressClick.current = false;
    event.preventDefault();
    event.stopPropagation();
  }
  function onAuxClickCapture(event: ReactMouseEvent) {
    if (event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
  }
  function toggleHand() {
    finish();
    hand.current = !hand.current;
    updateReady();
  }
  return { ownedButton, dragging, ready, toggleHand, onMouseDownCapture, onClickCapture, onAuxClickCapture };
}
