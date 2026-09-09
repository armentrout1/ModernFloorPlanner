import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { markInputLayoutEscape, runInputLayoutTransition } from '@/utils/inputLayout';

const breakpoint = '(max-width: 1023px)';
const breakpointEvent = 'physical-inspector-breakpoint';
const focusable = 'input, textarea, select, button, a[href], [tabindex]:not([tabindex="-1"])';

/** View state only. Notify the inspector before React replaces its layout. */
export function useInspectorLayout(): boolean {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(breakpoint).matches);
  useEffect(() => {
    const media = window.matchMedia(breakpoint);
    const change = () => runInputLayoutTransition(() => {
      window.dispatchEvent(new CustomEvent(breakpointEvent, { detail: { narrow: media.matches } }));
      setNarrow(media.matches);
    });
    if (media.matches !== narrow) change();
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  return narrow;
}

interface FocusTarget {
  targetKey: string;
  id: string;
  label: string | null;
  name: string | null;
  tag: string;
  index: number;
  start: number | null;
  end: number | null;
  direction: 'forward' | 'backward' | 'none' | null;
}
function captureFocus(container: HTMLElement, targetKey: string): FocusTarget | null {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement) || !container.contains(active)) return null;
  const input = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
  return { targetKey, id: active.id, label: active.getAttribute('aria-label'), name: active.getAttribute('name'), tag: active.tagName,
    index: Array.from(container.querySelectorAll(focusable)).indexOf(active), start: input?.selectionStart ?? null,
    end: input?.selectionEnd ?? null, direction: input?.selectionDirection ?? null };
}
function counterpart(container: HTMLElement, captured: FocusTarget): HTMLElement | null {
  const controls = Array.from(container.querySelectorAll<HTMLElement>(focusable));
  const byId = captured.id ? controls.find(item => item.id === captured.id) : undefined;
  const byLabel = captured.label ? controls.find(item => item.tagName === captured.tag && item.getAttribute('aria-label') === captured.label) : undefined;
  const byName = captured.name ? controls.find(item => item.tagName === captured.tag && item.getAttribute('name') === captured.name) : undefined;
  const byIndex = captured.index >= 0 ? controls[captured.index] : undefined;
  const result = byId ?? byLabel ?? byName ?? (byIndex?.tagName === captured.tag ? byIndex : undefined);
  return result && !result.hasAttribute('disabled') ? result : null;
}

export interface ResponsiveInspectorProps {
  narrow: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Draft + selected room/opening identity, independent of measurement edits. */
  targetKey: string;
  title: string;
  label?: string;
  children: ReactNode;
  openerRef: RefObject<HTMLElement>;
  fallbackFocusRef?: RefObject<HTMLElement>;
}

/** One interactive inspector. The canonical provider owns fields across remounts. */
export function ResponsiveInspector(props: ResponsiveInspectorProps) {
  const { narrow, open, onOpenChange, targetKey, title, label = 'Drawing inspector', children, openerRef, fallbackFocusRef } = props;
  const container = useRef<HTMLElement | null>(null), close = useRef<HTMLButtonElement>(null);
  const latest = useRef(props), pendingFocus = useRef<FocusTarget | null>(null);
  latest.current = props;
  const previousTarget = useRef(targetKey), focusFrame = useRef<number | null>(null);
  const headingId = useId();

  function focusExistingField(): boolean {
    const captured = pendingFocus.current, root = container.current;
    if (!captured || !root || captured.targetKey !== latest.current.targetKey) return false;
    const element = counterpart(root, captured);
    if (!element) return false;
    runInputLayoutTransition(() => {
      element.focus({ preventScroll: true });
      if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && captured.start !== null && captured.end !== null) {
        try { element.setSelectionRange(captured.start, captured.end, captured.direction ?? undefined); } catch { /* Some native input types have no text selection. */ }
      }
      element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });
    pendingFocus.current = null;
    return document.activeElement === element;
  }
  function focusFallback() {
    const candidates = [latest.current.openerRef.current, latest.current.fallbackFocusRef?.current, !latest.current.narrow ? container.current : null];
    const next = candidates.find(item => item?.isConnected && !item.hasAttribute('disabled') && item.getClientRects().length);
    runInputLayoutTransition(() => { next?.focus({ preventScroll: true }); });
  }
  function scheduleFocus(action: () => void) {
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = requestAnimationFrame(() => { focusFrame.current = null; action(); });
  }
  function changeOpen(value: boolean) {
    if (!value) pendingFocus.current = null;
    runInputLayoutTransition(() => onOpenChange(value));
  }

  useEffect(() => {
    const changing = (event: Event) => {
      const nextNarrow = (event as CustomEvent<{ narrow: boolean }>).detail.narrow;
      const root = container.current, current = latest.current;
      if (root) pendingFocus.current = captureFocus(root, current.targetKey);
      // Continuing an already focused docked form is not a new drawing gesture.
      // Otherwise the narrow inspector remains closed until its explicit opener.
      if (nextNarrow && pendingFocus.current && !current.open) current.onOpenChange(true);
      if (!nextNarrow && current.open) current.onOpenChange(false);
    };
    window.addEventListener(breakpointEvent, changing);
    return () => {
      window.removeEventListener(breakpointEvent, changing);
      if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    };
  }, []);

  useLayoutEffect(() => {
    if (previousTarget.current !== targetKey) {
      pendingFocus.current = null;
      previousTarget.current = targetKey;
      if (narrow && open) scheduleFocus(() => runInputLayoutTransition(() => close.current?.focus({ preventScroll: true })));
    }
    if (!narrow && pendingFocus.current) scheduleFocus(() => { if (!focusExistingField()) focusFallback(); });
  }, [narrow, open, targetKey]);

  const contents = <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain p-4 [overflow-wrap:anywhere] sm:p-5"
    data-testid="physical-inspector-scroll"
    onFocusCapture={event => {
      // Native Tab focus normally scrolls the nearest container. Explicitly keep
      // controls visible after transferred focus without scrolling the canvas.
      const element = event.target;
      if (element instanceof HTMLElement && event.currentTarget.contains(element)) element.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }}>{children}</div>;

  if (!narrow) return <aside ref={element => { container.current = element; }} aria-label={label} tabIndex={-1}
    data-testid="physical-inspector" className="flex max-h-[calc(100dvh-2rem)] min-w-0 max-w-full flex-col rounded-lg border bg-white [overflow-wrap:anywhere]">
    <h2 id={headingId} className="max-h-[30dvh] shrink-0 overflow-y-auto border-b px-5 py-3 text-base font-semibold">{title}</h2>
    {contents}
  </aside>;

  return <Dialog.Root open={open && Boolean(targetKey)} onOpenChange={changeOpen} modal>
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45" />
      <Dialog.Content ref={element => { container.current = element; }} data-testid="physical-inspector"
        className="fixed inset-y-0 right-0 z-50 flex h-[100dvh] max-h-[100dvh] w-full max-w-md flex-col border-l bg-white shadow-xl outline-none"
        aria-describedby={undefined}
        onOpenAutoFocus={event => {
          event.preventDefault();
          if (!focusExistingField()) runInputLayoutTransition(() => close.current?.focus({ preventScroll: true }));
        }}
        onCloseAutoFocus={event => {
          event.preventDefault();
          if (!latest.current.narrow) {
            // FocusScope's unmount callback is deferred. It must not steal focus
            // if the layout effect already restored the docked counterpart.
            if (container.current?.contains(document.activeElement)) return;
            if (pendingFocus.current) scheduleFocus(() => { if (!focusExistingField()) focusFallback(); });
            else focusFallback();
          } else focusFallback();
        }}
        onPointerDownOutside={() => { runInputLayoutTransition(() => {}); }}
        onEscapeKeyDown={event => {
          if (event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) {
            event.preventDefault(); return;
          }
          const target = event.target instanceof HTMLElement ? event.target : null;
          if (target?.matches('input[data-physical-pending="true"], textarea[data-physical-pending="true"]')) {
            // Radix listens in document capture; the field's existing Revert
            // handler will own this marked event during the normal input phase.
            event.preventDefault(); markInputLayoutEscape(event); return;
          }
          event.preventDefault(); event.stopPropagation(); changeOpen(false);
        }}>
        <div className="flex shrink-0 items-start justify-between gap-3 border-b p-4 [overflow-wrap:anywhere]">
          <Dialog.Title className="max-h-[30dvh] min-w-0 overflow-y-auto text-base font-semibold leading-6">{title}</Dialog.Title>
          <Button ref={close} type="button" variant="outline" className="h-9 shrink-0 gap-1 px-2" aria-label="Close inspector"
            data-physical-layout-control
            onPointerDown={event => {
              if (event.button !== 0 || event.defaultPrevented) return;
              event.preventDefault(); runInputLayoutTransition(() => {});
            }}
            onClick={() => changeOpen(false)}><X className="h-4 w-4" aria-hidden="true" /><span>Close</span></Button>
        </div>
        {contents}
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
