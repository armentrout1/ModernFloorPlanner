import { useRef, useState, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';

export type PhysicalView = 'rooms' | 'drawing';
const views = ['rooms', 'drawing'] as const;

/** Manual activation: moving keyboard focus never changes the selected view. */
export function PhysicalViewTabs({ view, onChange }: { view: PhysicalView; onChange: (view: PhysicalView) => void }) {
  const buttons = useRef<Partial<Record<PhysicalView, HTMLButtonElement | null>>>({});
  const [focused, setFocused] = useState<PhysicalView | null>(null);
  function navigate(event: KeyboardEvent<HTMLButtonElement>, current: PhysicalView) {
    if (event.target !== event.currentTarget) return;
    // Native Space still clicks the button on release, without arming canvas pan.
    // Its keyup remains available to the drawing's existing held-Space cleanup.
    if (event.key === ' ') event.stopPropagation();
    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || event.repeat) {
      if (event.key === ' ' || event.key === 'Enter') event.preventDefault();
      return;
    }
    if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const index = views.indexOf(current);
    const next = event.key === 'Home' ? views[0] : event.key === 'End' ? views[views.length - 1]
      : event.key === 'ArrowRight' ? views[(index + 1) % views.length]
      : event.key === 'ArrowLeft' ? views[(index + views.length - 1) % views.length] : null;
    if (!next) return; // Up/Down, Tab and native button activation retain their defaults.
    event.preventDefault(); event.stopPropagation(); buttons.current[next]?.focus();
  }
  return <div className="flex gap-1" role="tablist" aria-label="Physical draft views" aria-orientation="horizontal"
    onBlur={event => {
      // Once focus leaves, keyboard re-entry always starts at the selected tab.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(null);
    }}>
    {views.map(value => <Button key={value} ref={element => { buttons.current[value] = element; }} type="button"
      role="tab" id={'physical-' + value + '-tab'} aria-controls={'physical-' + value + '-panel'}
      aria-selected={view === value} tabIndex={(focused ?? view) === value ? 0 : -1}
      variant={view === value ? 'default' : 'outline'}
      className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 focus-visible:ring-0"
      onFocus={() => setFocused(value)} onKeyDown={event => navigate(event, value)}
      onClick={() => { if (view !== value) onChange(value); }}>
      {value === 'rooms' ? 'Quick Rooms' : 'Drawing'}
    </Button>)}
  </div>;
}
