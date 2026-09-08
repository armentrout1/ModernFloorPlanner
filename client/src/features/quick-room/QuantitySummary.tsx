import { calculateQuantities } from '@shared/quantities/engine';
import { formatQuantity } from '@shared/quantities/display';
import type { InputUnit } from './state';

type Result = ReturnType<typeof calculateQuantities>;
const outputs = [
  { id: 'floor-area', label: 'Floor area' },
  { id: 'ceiling-area', label: 'Flat ceiling area' },
  { id: 'gross-wall-area', label: 'Gross wall area', note: 'Before door and window deductions' },
] as const;
function display(value: number, unit: InputUnit) {
  const result = formatQuantity({ value, unit: 'mm2' }, { unit, fractionDigits: 2 });
  return result.ok ? result.formatted + (unit === 'ft' ? ' sq ft' : ' m²') : 'Unavailable';
}
export function QuantitySummary({ result, unit, project = false }: { result: Result; unit: InputUnit; project?: boolean }) {
  return (
    <section data-testid={project ? 'project-quantities' : 'room-quantities'}
      aria-label={project ? 'Project quantities' : 'Room quantities'}>
      {project ? <h2 className="text-lg font-semibold text-slate-900">Project quantities</h2> : <h3 className="sr-only">Room quantities</h3>}
      <dl className={project ? 'mt-4 space-y-4' : 'grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3'}>
        {outputs.map(output => {
          const aggregate = result.ok ? result.calculation.outputs.find(item => item.output === output.id) : undefined;
          const total = aggregate?.total;
          return (
            <div key={output.id} data-testid={'quantity-' + output.id} className="min-w-0">
              <dt className="text-sm font-medium text-slate-600">{output.label}</dt>
              <dd className={(project ? 'text-2xl' : 'text-lg') + ' mt-1 break-words font-semibold tabular-nums text-slate-950'}>
                {total ? display(total.net, unit) : 'Unavailable'}
              </dd>
              {total ? <p className="mt-1 text-xs text-amber-800">{aggregate.status === 'provisional' ? 'Provisional' : 'Complete'}</p>
                : <p className="mt-1 text-xs leading-5 text-slate-600">
                  {result.ok ? (output.id === 'gross-wall-area' ? 'Finish length, width and ceiling height.' : 'Finish length and width.')
                    : 'Check the entered dimensions before calculating.'}
                </p>}
              {!total && aggregate?.subtotal ? (
                <p className="mt-1 text-xs leading-5 text-amber-800">
                  Partial subtotal: {display(aggregate.subtotal.net, unit)}.
                  {' '}{aggregate.subtotalStatus === 'provisional' ? 'Provisional; ' : ''}Incomplete selected quantity.
                </p>
              ) : null}
              {'note' in output ? <p className="mt-1 text-xs leading-5 text-slate-500">{output.note}</p> : null}
              {aggregate?.errors.some(item => item.code.startsWith('ARITHMETIC_')) ?
                <p className="mt-1 text-xs text-red-700">The measurements exceed the supported calculation range.</p> : null}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
