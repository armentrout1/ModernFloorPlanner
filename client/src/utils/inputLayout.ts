/** View-only transitions must not turn focus transfer into a physical edit. */
const transitions = new Set<{ from: Element | null }>();
const ownedEscapes = new WeakSet<Event>();
export const isInputLayoutTransition = (input: HTMLElement | null) => Array.from(transitions).some(({ from }) =>
  from === input || Boolean(from?.matches('button[aria-label^="Revert "]') && from.parentElement?.contains(input)));
export const markInputLayoutEscape = (event: Event) => { ownedEscapes.add(event); };
export const isInputLayoutEscape = (event: Event) => ownedEscapes.has(event);
export function runInputLayoutTransition(action: () => void): void {
  if (typeof window === 'undefined') { action(); return; }
  const token = { from: document.activeElement }; transitions.add(token);
  window.dispatchEvent(new Event('physical-layout-change'));
  try { action(); } finally {
    // React's commit, portal unmount and focus restoration can finish after the event.
    requestAnimationFrame(() => requestAnimationFrame(() => transitions.delete(token)));
  }
}
export const isInputLayoutControl = (target: EventTarget | null) =>
  target instanceof Element && Boolean(target.closest('[data-physical-layout-control]'));
export const hasActivePhysicalGesture = () => Boolean(document.querySelector('[data-physical-gesture="active"]'));
