import { useMemo } from 'react';
import type { PhysicalDocument } from '@shared/domain/document';
import { calculateQuantities } from '@shared/quantities/engine';
import { formatQuantity } from '@shared/quantities/display';
import { requestForRooms, type InputUnit } from './state';

const outputs = [
  { id: 'floor-area', test: 'floor', label: 'Floor area' },
  { id: 'ceiling-area', test: 'ceiling', label: 'Flat ceiling area' },
  { id: 'gross-wall-area', test: 'walls', label: 'Gross wall area' },
] as const;
export function PhysicalQuantities({ document, roomId, unit }: { document: PhysicalDocument; roomId: string | null; unit: InputUnit }) {
  const result = useMemo(() => calculateQuantities(document, requestForRooms({ ...document,
    rooms: roomId ? document.rooms.filter(room => room.id === roomId) : document.rooms })), [document, roomId]);
  function display(value: number) {
    const formatted = formatQuantity({ value, unit: 'mm2' }, { unit, fractionDigits: 2 });
    return formatted.ok ? formatted.formatted + (unit === 'ft' ? ' sq ft' : ' m²') : 'Unavailable';
  }
  return <section aria-label="Physical quantities" className="min-w-0 rounded-lg border bg-white p-4 [overflow-wrap:anywhere]">
    <h2 className="font-semibold">{roomId ? 'Selected room quantities' : 'Draft quantities'}</h2>
    <dl className="mt-3 grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-4">
      {outputs.map(output => {
        const aggregate = result.ok ? result.calculation.outputs.find(item => item.output === output.id) : undefined;
        const profiles = result.ok ? result.calculation.records.filter(record => record.output === output.id).map(record => record.readiness.applicability) : [];
        const unsupported = profiles.some(profile => profile?.status === 'unsupported');
        const unknownModel = profiles.some(profile => profile?.status === 'unknown');
        return <div key={output.id} className="min-w-0" data-testid={'physical-' + output.test}>
          <dt className="text-sm text-slate-600">{output.label}</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{aggregate?.total ? display(aggregate.total.net) : unsupported ? 'Unsupported' : 'Incomplete'}</dd>
          <p className="mt-1 text-xs leading-5 text-amber-800">{aggregate?.total ? aggregate.status === 'provisional' ? 'Provisional · unconfirmed inputs/model' : 'Complete' :
            unsupported ? 'This room model needs a later supported calculation.' : unknownModel ? 'Review the room model in the inspector.' : 'Finish the required measurements; unapplied edits are excluded.'}</p>
          {!aggregate?.total && aggregate?.subtotal ? <p className="text-xs text-slate-600">Partial subtotal: {display(aggregate.subtotal.net)}; not a complete total.</p> : null}
        </div>;
      })}
    </dl>
    <p className="mt-3 border-t pt-3 text-xs leading-5 text-slate-500">Gross walls are before openings. These are measured finish quantities, not a complete construction materials or purchasing list.</p>
  </section>;
}
