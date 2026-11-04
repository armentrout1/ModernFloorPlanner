import { AreaSummaryGrid } from '@/features/area-summary/AreaSummaryGrid';
import type { AreaSummaryGroup } from '@shared/quantities/summary';
import type { InputUnit } from './state';

export function QuantitySummary({ group, unit, project = false }: { group: AreaSummaryGroup | null; unit: InputUnit; project?: boolean }) {
  return (
    <section data-testid={project ? 'project-quantities' : 'room-quantities'}
      aria-label={project ? 'Project quantities' : 'Room quantities'}>
      {project ? <h2 className="text-lg font-semibold text-slate-900">Project quantities</h2> : <h3 className="sr-only">Room quantities</h3>}
      <AreaSummaryGrid group={group} unit={unit} large={project} />
    </section>
  );
}
