import { useEffect, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react';
import { Link } from 'wouter';
import { Plus, Copy, Trash2, ArrowLeft, Ruler, Layers, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { QuantitySummary } from '@/features/quick-room/QuantitySummary';
import { useQuickRoomDraft } from '@/features/quick-room/useQuickRoomDraft';
import { addRoom, renameRoom, editField, commitField, switchUnit, duplicateRoom, removeRoom, previewDocument,
  requestForRooms, fieldError, ROOM_FIELDS, type QuickRoomDraft, type RoomField, type InputUnit } from '@/features/quick-room/state';
import { calculateQuantities } from '@shared/quantities/engine';
import type { PhysicalRoom } from '@shared/domain/document';

const fieldLabels: Record<RoomField, string> = { length: 'Length', width: 'Width', ceilingHeight: 'Ceiling height' };
const types = ['Custom', 'Bedroom', 'Kitchen', 'Bathroom', 'Living Room', 'Closet'];
const selectClass = 'h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2';
function ActionButton({ onClick, ...props }: ComponentProps<typeof Button>) {
  return <Button type="button" {...props} onKeyDown={event => {
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
  }} onClick={event => { if (event.detail < 2) onClick?.(event); }} />;
}
function DimensionInput({ roomId, field, draft, onEdit, onCommit }: {
  roomId: string; field: RoomField; draft: QuickRoomDraft;
  onEdit: (text: string) => void; onCommit: () => void;
}) {
  const input = draft.fields[roomId][field], composing = useRef(false);
  const id = 'quick-' + roomId + '-' + field;
  const error = input.dirty ? fieldError(input) : null;
  const unitName = input.unit === 'ft' ? 'feet' : 'meters';
  const commitOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return;
    if (composing.current || event.nativeEvent.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    if (event.repeat) return;
    onCommit();
  };
  return (
    <div className="min-w-0">
      <Label htmlFor={id} className="block text-sm font-medium text-slate-700">{fieldLabels[field]}</Label>
      <Input id={id} type="text" value={input.text} autoComplete="off" spellCheck={false}
        aria-invalid={error ? true : undefined} aria-describedby={id + '-help'}
        className={'mt-2 bg-white ' + (error ? 'border-red-400 focus-visible:ring-red-500' : '')}
        placeholder={input.unit === 'ft' ? 'e.g. 12 ft 6 in' : 'e.g. 3.81 m'}
        onChange={event => onEdit(event.target.value)}
        onBlur={() => { if (!composing.current) onCommit(); }}
        onKeyDown={commitOnEnter}
        onCompositionStart={() => { composing.current = true; }}
        onCompositionEnd={event => {
          composing.current = false;
          if (document.activeElement !== event.currentTarget) onCommit();
        }} />
      <p id={id + '-help'} className={'mt-1.5 text-xs leading-5 ' + (error ? 'text-red-700' : 'text-slate-500')}>
        {error ?? (input.dirty ? 'Editing — press Enter or leave the field to apply.' :
          field === 'ceilingHeight' ? 'Needed for gross wall area.' : 'Measured inside the finished walls.')}
        {' '}Bare numbers use {unitName}.
        {input.unit !== draft.displayUnit ? ' This edit keeps its original unit context.' : ''}
      </p>
    </div>
  );
}

export default function QuickRooms({ active = true }: { active?: boolean }) {
  const { draft, cache, message, error, update, discard, blocked } = useQuickRoomDraft();
  const [roomType, setRoomType] = useState('Custom');
  const [focusId, setFocusId] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (active) heading.current?.focus(); }, [active]);
  useEffect(() => {
    if (focusId && active) {
      document.getElementById('quick-name-' + focusId)?.focus();
      setFocusId(null);
    }
  }, [focusId, active]);
  const preview = useMemo(() => previewDocument(draft), [draft]);
  const quantities = useMemo(() => calculateQuantities(preview, requestForRooms(preview)), [preview]);
  const roomQuantities = useMemo(() => new Map(preview.rooms.map(room => {
    const selected = { ...preview, rooms: [room] };
    return [room.id, calculateQuantities(selected, requestForRooms(selected))] as const;
  })), [preview]);
  function add() {
    const id = crypto.randomUUID();
    update(current => addRoom(current, id, roomType === 'Custom' ? undefined : roomType));
    setFocusId(id);
  }
  function duplicate(room: PhysicalRoom) {
    const id = crypto.randomUUID();
    update(current => duplicateRoom(current, room.id, id));
    setFocusId(id);
  }
  function remove(room: PhysicalRoom) {
    if (window.confirm('Remove "' + (room.name || 'Untitled room') + '" from Quick Rooms?')) {
      update(current => removeRoom(current, room.id));
    }
  }
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 sm:px-6 lg:px-8">
          <span className="font-semibold tracking-tight text-primary">Modern Floor Planner</span>
          <Button variant="outline" size="sm" asChild><Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Sketch editor</Link></Button>
        </div>
      </header>
      <main aria-labelledby="quick-rooms-title" className="mx-auto max-w-7xl px-4 py-7 sm:px-6 sm:py-10 lg:px-8">
        <div className="mb-6 max-w-3xl">
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-primary">Measure a room. Get quantities.</p>
          <h1 id="quick-rooms-title" ref={heading} tabIndex={-1} className="text-3xl font-semibold tracking-tight outline-none sm:text-4xl">Quick Rooms</h1>
          <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Start with the room in front of you. Enter its dimensions to calculate floor, flat ceiling and gross wall areas.</p>
        </div>
        <div className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-600">
          <p className="font-medium text-slate-800">Temporary draft in this browser tab — not saved to an account.</p>
          <p>Quick Rooms and the sketch editor are separate documents. Your sketch stays available when you switch back.</p>
          <p className="text-xs">Same-tab refresh recovery depends on browser storage. Closing the tab or a browser crash may lose this draft.</p>
        </div>
        {cache !== 'ready' ? <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          <p className="font-semibold">Refresh recovery is unavailable.</p>
          <p>{message} {blocked ? 'The existing cache has been preserved. Explicitly discard this Quick Rooms draft to start a new one.' : 'You can keep editing here, but the latest changes may be lost on refresh.'}</p>
        </div> : null}
        {error ? <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p> : null}
        <div className="mb-7 flex flex-wrap items-end gap-4">
          <div className="w-full sm:w-48"><Label htmlFor="quick-unit">Units for new input and results</Label>
            <select id="quick-unit" className={selectClass + ' mt-2'} value={draft.displayUnit} disabled={blocked}
              onChange={event => update(current => switchUnit(current, event.target.value as InputUnit))}>
              <option value="ft">Feet / square feet</option><option value="m">Meters / square meters</option>
            </select>
          </div>
          <div className="w-full sm:w-44"><Label htmlFor="quick-type">Room type</Label>
            <select id="quick-type" className={selectClass + ' mt-2'} value={roomType} disabled={blocked} onChange={event => setRoomType(event.target.value)}>
              {types.map(type => <option key={type}>{type}</option>)}
            </select>
          </div>
          <ActionButton onClick={add} disabled={blocked} className="h-10 w-full sm:w-auto"><Plus className="mr-2 h-4 w-4" />Add room</ActionButton>
          <p className="max-w-sm text-xs leading-5 text-slate-500">Room types set names only. Enter your own measurements; no sizes or ceiling heights are assumed.</p>
        </div>
        {draft.document.rooms.length ? (
          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <div className="min-w-0 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">Your rooms <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs">{draft.document.rooms.length}</span></h2>
                <span className="text-xs text-slate-500">Enter or blur to apply</span>
              </div>
              {draft.document.rooms.map((room, index) => (
                <article key={room.id} data-testid="quick-room-card" data-room-id={room.id} aria-label={'Room ' + (index + 1)}
                  className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="mb-5 flex flex-wrap items-end gap-3">
                    <div className="min-w-0 flex-1 basis-52"><Label htmlFor={'quick-name-' + room.id}>Room name</Label>
                      <Input id={'quick-name-' + room.id} value={room.name ?? ''} maxLength={160} className="mt-2 font-medium"
                        onChange={event => update(current => renameRoom(current, room.id, event.target.value))} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <ActionButton variant="outline" size="sm" onClick={() => duplicate(room)}><Copy className="mr-1.5 h-3.5 w-3.5" />Duplicate room</ActionButton>
                      <ActionButton variant="ghost" size="sm" onClick={() => remove(room)} className="text-slate-600 hover:text-red-700"><Trash2 className="mr-1.5 h-3.5 w-3.5" />Remove room</ActionButton>
                    </div>
                  </div>
                  <div className="mb-5 grid gap-4 sm:grid-cols-3">
                    {ROOM_FIELDS.map(field => <DimensionInput key={field} roomId={room.id} field={field} draft={draft}
                      onEdit={text => update(current => editField(current, room.id, field, text))}
                      onCommit={() => update(current => commitField(current, room.id, field, new Date().toISOString()))} />)}
                  </div>
                  <p className="mb-4 text-xs leading-5 text-slate-500">Examples: 12 ft 6 in · 32 1/2 in · 3.81 m. Units may be written in any field.</p>
                  <QuantitySummary result={roomQuantities.get(room.id)!} unit={draft.displayUnit} />
                </article>
              ))}
            </div>
            <aside className="min-w-0 rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
              <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary"><Layers className="h-5 w-5" /></div>
              <QuantitySummary result={quantities} unit={draft.displayUnit} project />
              <div className="mt-5 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-600">
                <p className="font-medium text-amber-800">Based on entered dimensions — not field-verified.</p>
                <p className="mt-2">Rectangular rooms and flat ceilings. Areas use zero waste; wall quantities are before door and window deductions.</p>
                <p className="mt-2">Results display two decimal places. Changing units does not change your measurements.</p>
              </div>
            </aside>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white px-5 py-12 text-center">
            <Ruler className="mx-auto mb-4 h-8 w-8 text-primary" />
            <h2 className="text-xl font-semibold">Start with one room</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Choose a room type and select Add room. You can get useful quantities without drawing a house.</p>
          </div>
        )}
        <footer className="mt-7 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 pt-5">
          <p className="flex max-w-xl items-start gap-2 text-xs leading-5 text-slate-500"><Info className="mt-0.5 h-4 w-4 shrink-0" />This tab draft contains room measurements only. Openings, exports and account saving will come in later work.</p>
          <ActionButton variant="outline" size="sm" onClick={discard}>Discard Quick Rooms draft</ActionButton>
        </footer>
      </main>
    </div>
  );
}
