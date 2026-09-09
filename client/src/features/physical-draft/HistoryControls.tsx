import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { usePhysicalDraft } from './provider';
import { selectedDraft } from './state';

type Direction = 'undo' | 'redo';
type Stamp = { id: string; revision: number };
function inputOwnsHistory(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.repeat || event.isComposing) return true;
  const target = event.target instanceof Element ? event.target : null;
  if (target?.closest('input, textarea, select, [role="textbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]')) return true;
  return Boolean(document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"], [role="listbox"][data-state="open"], dialog[open]'));
}

/** One visible coordinator for both views; browser text undo retains ownership. */
export function HistoryControls({ blocked }: { blocked: boolean }) {
  const { registry, history, store } = usePhysicalDraft();
  const draft = selectedDraft(registry);
  const activation = useRef<Stamp | null>(null);
  const pointers = useRef(new Set<number>()), composing = useRef(false);
  const [notice, setNotice] = useState('');
  const stamp = (): Stamp | null => draft ? { id: draft.id, revision: draft.localEditRevision } : null;
  function apply(direction: Direction, captured: Stamp | null) {
    if (blocked || !captured) return;
    if (composing.current || pointers.current.size) {
      setNotice('Finish or cancel the current input or drawing gesture before using Undo or Redo.');
      return;
    }
    setNotice('');
    store[direction](captured.id, captured.revision, new Date().toISOString());
  }
  useEffect(() => {
    const down = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-testid="physical-canvas"]')) pointers.current.add(event.pointerId);
    };
    const up = (event: PointerEvent) => { pointers.current.delete(event.pointerId); };
    const move = (event: PointerEvent) => { if (event.buttons === 0) pointers.current.delete(event.pointerId); };
    const startComposition = () => { composing.current = true; };
    const endComposition = () => { composing.current = false; };
    const blur = () => { pointers.current.clear(); composing.current = false; activation.current = null; };
    document.addEventListener('pointerdown', down, true);
    document.addEventListener('pointerup', up, true);
    document.addEventListener('pointercancel', up, true);
    document.addEventListener('pointermove', move, true);
    document.addEventListener('compositionstart', startComposition, true);
    document.addEventListener('compositionend', endComposition, true);
    window.addEventListener('blur', blur);
    return () => {
      document.removeEventListener('pointerdown', down, true);
      document.removeEventListener('pointerup', up, true);
      document.removeEventListener('pointercancel', up, true);
      document.removeEventListener('pointermove', move, true);
      document.removeEventListener('compositionstart', startComposition, true);
      document.removeEventListener('compositionend', endComposition, true);
      window.removeEventListener('blur', blur);
    };
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (blocked || !draft || event.altKey || event.keyCode === 229 || composing.current || inputOwnsHistory(event)) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest('[data-testid="physical-view"]')) return;
      const key = event.key.toLowerCase();
      const undo = (event.ctrlKey || event.metaKey) && key === 'z' && !event.shiftKey;
      const redo = ((event.ctrlKey || event.metaKey) && key === 'z' && event.shiftKey)
        || (event.ctrlKey && !event.metaKey && !event.shiftKey && key === 'y');
      if (!undo && !redo) return;
      event.preventDefault();
      apply(redo ? 'redo' : 'undo', { id: draft.id, revision: draft.localEditRevision });
    };
    document.addEventListener('keydown', keydown);
    return () => document.removeEventListener('keydown', keydown);
  }, [draft, blocked, store]);
  return <div role="group" aria-label="Committed edit history" className="rounded-lg border bg-white p-3">
    <div className="flex flex-wrap items-center gap-2">
      {(['undo', 'redo'] as const).map(direction => {
        const label = history[direction === 'undo' ? 'undoLabel' : 'redoLabel'];
        const reason = history[direction === 'undo' ? 'undoReason' : 'redoReason'];
        const name = (direction === 'undo' ? 'Undo' : 'Redo') + (label ? ' ' + label : '');
        return <Button key={direction} type="button" size="sm" variant="outline" data-physical-history-control
          className="h-auto min-h-9 max-w-full whitespace-normal text-left" disabled={blocked || !label}
          aria-label={name} aria-describedby="physical-history-help" title={reason || name}
          onPointerDown={event => {
            if (event.button !== 0 || event.defaultPrevented) return;
            activation.current = stamp();
            // Undo must not blur and commit another pending field first, including touch.
            event.preventDefault();
          }}
          onPointerCancel={() => { activation.current = null; }}
          onKeyDown={event => {
            if (!['Enter', ' '].includes(event.key)) return;
            event.stopPropagation();
            if (event.defaultPrevented || event.repeat || event.nativeEvent.isComposing || event.keyCode === 229
              || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) { event.preventDefault(); return; }
            activation.current = stamp();
          }}
          onBlur={() => { activation.current = null; }}
          onClick={event => {
            if (event.defaultPrevented) return;
            const captured = activation.current ?? stamp(); activation.current = null;
            apply(direction, captured);
          }}>{name}</Button>;
      })}
      <span className="text-xs text-slate-500">Ctrl / Cmd + Z | Shift + Z to redo | Ctrl + Y on Windows</span>
    </div>
    <p id="physical-history-help" className="mt-2 text-xs leading-5 text-slate-600">Last {history.limit} committed actions per draft, in this session. Reload recovers the current draft with empty Undo/Redo history. Revert cancels pending text.</p>
    {notice || history.undoReason || history.redoReason || history.boundary ? <p role="status" className="mt-1 text-xs leading-5 text-amber-900">
      {notice || history.undoReason || history.redoReason || history.boundary}</p> : null}
  </div>;
}
