import { isInputLayoutTransition, isInputLayoutControl, isInputLayoutEscape } from '@/utils/inputLayout';
import { useRef, type RefObject, type KeyboardEvent, type FocusEvent } from 'react';
import { Button } from '@/components/ui/button';

/** Explicitly opt-in cancellation of a field's unapplied text. Domain guards live in onRevert. */
export interface InputRevertOptions {
  name: string;
  identity: string;
  revision: number;
  pending: boolean;
  onRevert: () => boolean;
  onLeave: () => void;
}
export function useInputRevert(input: RefObject<HTMLInputElement>, options?: InputRevertOptions) {
  const button = useRef<HTMLButtonElement>(null);
  const activation = useRef<InputRevertOptions | null>(null);
  function current(candidate: InputRevertOptions) {
    return options?.pending && candidate.identity === options.identity && candidate.revision === options.revision
      && input.current?.isConnected && button.current?.isConnected;
  }
  function apply(candidate = options) {
    if (!candidate || !current(candidate)) return;
    // Pointer cancellation may target this field while a different input is
    // being edited. Moving focus then would blur/commit that unrelated edit.
    const restoreFocus = document.activeElement === input.current || document.activeElement === button.current;
    if (candidate.onRevert() && restoreFocus) input.current?.focus();
  }
  function onInputKeyDown(event: KeyboardEvent<HTMLInputElement>, composing = false): boolean {
    if (event.key !== 'Escape' || !options?.pending || (event.defaultPrevented && !isInputLayoutEscape(event.nativeEvent)) || event.repeat || composing
      || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey
      || event.currentTarget !== document.activeElement) return false;
    event.preventDefault(); event.stopPropagation(); apply(); return true;
  }
  function isRevertFocus(target: EventTarget | null) { return Boolean(options?.pending && target === button.current); }
  function isHistoryFocus(target: EventTarget | null) {
    return Boolean(options && target instanceof Element && target.closest('[data-physical-history-control]'));
  }
  function isDeferredFocus(target: EventTarget | null) { return isRevertFocus(target) || isHistoryFocus(target) || Boolean(options && (isInputLayoutTransition(input.current) || isInputLayoutControl(target))); }
  function skipBlur(event: FocusEvent<HTMLInputElement>) { return isDeferredFocus(event.relatedTarget); }
  const control = options?.pending ? <Button ref={button} type="button" size="sm" variant="ghost"
    className="absolute right-0 top-0 h-7 w-14 px-1 text-xs" aria-label={options.name}
    onPointerDown={event => {
      if (event.button !== 0 || event.defaultPrevented) return;
      activation.current = options;
      // Keep input focus until click: valid pending text must never commit first.
      event.preventDefault();
    }}
    onPointerCancel={() => { activation.current = null; }}
    onKeyDown={event => {
      if (!['Enter', ' '].includes(event.key)) return;
      if (event.defaultPrevented || event.repeat || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) {
        event.preventDefault(); return;
      }
      activation.current = options;
    }}
    onBlur={event => {
      activation.current = null;
      // Tab onto Revert offers cancellation; Tab onward retains normal commit.
      if (event.relatedTarget !== input.current && !isDeferredFocus(event.relatedTarget) && input.current?.isConnected) options.onLeave();
    }}
    onClick={event => {
      if (event.defaultPrevented) return;
      const candidate = activation.current ?? options;
      activation.current = null;
      apply(candidate);
    }}>Revert</Button> : null;
  return { control, skipBlur, isRevertFocus, isDeferredFocus, onInputKeyDown };
}
