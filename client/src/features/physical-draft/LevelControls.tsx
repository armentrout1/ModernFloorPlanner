import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { PhysicalDraft } from './state';
import { activeLevelId, addLevel, renameLevel, editLevelName, reorderLevels, assignRoomLevel, roomLevelId } from './levelCommands';

type Change = (change: (draft: PhysicalDraft) => PhysicalDraft, expectedRevision?: number) => boolean;
export function LevelControls({ draft, update, onSelect, onUpgrade, blocked }: {
  draft: PhysicalDraft; update: Change; onSelect: (id: string) => void; onUpgrade: () => void; blocked: boolean;
}) {
  if (draft.document.schemaVersion === 2) return <section aria-label="Building levels" className="rounded-lg border bg-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="max-w-2xl text-sm text-slate-600">Use building levels in a separate working copy of this current draft. Its original and current edits remain preserved.</p>
      <Button disabled={blocked} variant="outline" data-physical-layout-control onClick={onUpgrade}>Upgrade to building levels</Button></div>
  </section>;
  const levels = [...draft.document.buildingLevels.levels].sort((a, b) => a.displayOrder - b.displayOrder);
  const current = levels.find(level => level.id === activeLevelId(draft))!;
  const index = levels.indexOf(current);
  function move(offset: number) {
    const ids = levels.map(level => level.id); [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    update(value => reorderLevels(value, ids), draft.localEditRevision);
  }
  return <section aria-label="Building levels" className="space-y-3 rounded-lg border bg-white p-3" data-physical-layout-control>
    <div className="flex flex-wrap items-end gap-3">
      <label className="grid min-w-0 flex-1 gap-1 text-sm font-medium">Editing level
        <select aria-label="Editing level" disabled={blocked} className="h-10 min-w-0 rounded-md border bg-white px-2" value={current.id} onChange={event => onSelect(event.target.value)}>
          {levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
        </select>
      </label>
      <Button disabled={blocked} variant="outline" onClick={() => update(value => addLevel(value, crypto.randomUUID(), 'Level ' + (levels.length + 1)), draft.localEditRevision)}>Add level</Button>
      <Button disabled={blocked || index === 0} size="sm" variant="outline" onClick={() => move(-1)}>Move level up</Button>
      <Button disabled={blocked || index === levels.length - 1} size="sm" variant="outline" onClick={() => move(1)}>Move level down</Button>
    </div>
    <LevelName value={current.name} text={draft.levelView?.pendingNames?.[current.id] ?? current.name} disabled={blocked}
      onChange={text => update(value => editLevelName(value, current.id, text), draft.localEditRevision)}
      onSave={name => update(value => renameLevel(value, current.id, name), draft.localEditRevision)} />
    <p className="text-sm font-medium" data-testid="editing-level">Editing: {current.name}</p>
    <p className="text-xs leading-5 text-slate-500">{current.ownership === 'unassigned' ? 'Historical floor ownership is unassigned. Assign rooms when known. ' : ''}Finished-floor elevation is unknown. Names and display order do not establish elevation or stair rise.</p>
  </section>;
}
function LevelName({ value, text, disabled, onChange, onSave }: { value: string; text: string; disabled: boolean; onChange: (text: string) => void; onSave: (name: string) => boolean }) {
  return <div className="flex flex-wrap items-end gap-2"><label className="grid min-w-0 flex-1 gap-1 text-sm">Level name
    <Input aria-label="Level name" disabled={disabled} value={text} onChange={event => onChange(event.target.value)} /></label>
    <Button size="sm" variant="outline" disabled={disabled || !text.trim() || text === value} onClick={() => onSave(text)}>Rename level</Button></div>;
}
export function RoomLevelAssignment({ draft, roomId, update }: { draft: PhysicalDraft; roomId: string; update: Change }) {
  const current = roomLevelId(draft, roomId);
  const [target, setTarget] = useState<{ from: string; to: string } | null>(null);
  if (draft.document.schemaVersion === 2 || !current) return null;
  const levels = [...draft.document.buildingLevels.levels].sort((a, b) => a.displayOrder - b.displayOrder);
  const chosen = target?.from === current && levels.some(level => level.id === target.to) ? target.to : current;
  return <div className="space-y-2 border-b pb-3" data-physical-layout-control>
    <label className="grid gap-1 text-sm font-medium">Room level
      <select className="h-10 min-w-0 rounded-md border bg-white px-2" value={chosen} onChange={event => setTarget({ from: current, to: event.target.value })}>
        {levels.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}
      </select>
    </label>
    <Button size="sm" variant="outline" disabled={chosen === current} onClick={() => update(value => assignRoomLevel(value, roomId, chosen, current), draft.localEditRevision)}>Assign room</Button>
    <p className="text-xs leading-5 text-slate-500">Moves ownership only. Dimensions, plan position, openings and selected takeoff IDs stay intact.</p>
  </div>;
}
