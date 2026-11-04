import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { AreaSummaryGrid } from '@/features/area-summary/AreaSummaryGrid';
import type { PhysicalDocument } from '@shared/domain/document';
import { calculateAreaSummary } from '@shared/quantities/summary';
import type { InputUnit } from './state';

export type AreaScope = 'room' | 'level' | 'project';
export function PhysicalQuantities({ document, roomId, levelId, unit, scope, onScopeChange }: {
  document: PhysicalDocument; roomId: string | null; levelId: string | null; unit: InputUnit;
  scope: AreaScope; onScopeChange: (scope: AreaScope) => void;
}) {
  const result = useMemo(() => calculateAreaSummary(document), [document]);
  const summary = result.ok ? result.summary : null;
  const room = summary?.rooms.find(value => value.id === roomId) ?? null;
  const level = document.schemaVersion !== 2 ? summary?.levels.find(value => value.id === levelId) ?? null : null;
  const project = summary?.project ?? null;
  const effectiveScope: AreaScope = scope === 'level' && !level ? 'project' : scope === 'room' && !room ? 'project' : scope;
  const selected = effectiveScope === 'room' ? room : effectiveScope === 'level' ? level : project;
  const choices: Array<{ id: AreaScope; label: string; enabled: boolean }> = [
    { id: 'room', label: 'Selected room', enabled: Boolean(room) },
    { id: 'level', label: 'Current level', enabled: Boolean(level) },
    { id: 'project', label: 'Whole project', enabled: Boolean(project) },
  ];
  return <section aria-label="Physical quantities" className="min-w-0 rounded-lg border bg-white p-4 [overflow-wrap:anywhere]">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Area totals</h2>
      <p className="mt-1 text-xs text-slate-600">{selected?.label ?? 'No measured rooms'} · based on all modeled rooms in this scope</p></div>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Area total scope">
        {choices.filter(choice => choice.enabled).map(choice => <Button key={choice.id} type="button" size="sm"
          variant={effectiveScope === choice.id ? 'default' : 'outline'} aria-pressed={effectiveScope === choice.id}
          onClick={() => onScopeChange(choice.id)}>{choice.label}</Button>)}
      </div>
    </div>
    <div className="mt-3"><AreaSummaryGrid group={selected} unit={unit} testIdPrefix="physical" unavailableLabel="Incomplete" /></div>
    <p className="mt-3 border-t pt-3 text-xs leading-5 text-slate-500">Zero waste. Gross walls are before openings. Detailed takeoff below uses its own explicit selected targets and waste.</p>
  </section>;
}
