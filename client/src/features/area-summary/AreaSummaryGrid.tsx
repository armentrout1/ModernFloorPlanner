import { formatQuantity } from '@shared/quantities/display';
import type { AreaSummaryGroup, AreaSummaryOutput, AreaSummaryValue } from '@shared/quantities/summary';

export type AreaDisplayUnit = 'ft' | 'm';
const outputs: ReadonlyArray<{ id: AreaSummaryOutput; label: string; physicalTest: string; note?: string }> = [
  { id: 'floor-area', label: 'Floor area', physicalTest: 'floor' },
  { id: 'ceiling-area', label: 'Flat ceiling area', physicalTest: 'ceiling' },
  { id: 'gross-wall-area', label: 'Gross wall area', physicalTest: 'walls', note: 'Before door and window deductions' },
];

function display(value: number, unit: AreaDisplayUnit) {
  const result = formatQuantity({ value, unit: 'mm2' }, { unit, fractionDigits: 2 });
  return result.ok ? result.formatted + (unit === 'ft' ? ' sq ft' : ' m²') : 'Unavailable';
}

function guidance(value: AreaSummaryValue) {
  if (value.reason === 'unsupported-model') return 'This room model needs a later supported calculation.';
  if (value.reason === 'unknown-model') return 'Review the room model before using this quantity.';
  if (value.reason === 'calculation-error') return 'The measurements exceed the supported calculation range.';
  return value.output === 'gross-wall-area' ? 'Finish length, width and ceiling height.' : 'Finish length and width.';
}

function statusText(value: AreaSummaryValue) {
  if (value.status === 'complete') return 'Complete';
  if (value.status === 'provisional') return 'Provisional · review entered measurements';
  if (value.status === 'partial') return value.incompleteRoomCount + ' '
    + (value.incompleteRoomCount === 1 ? 'room needs' : 'rooms need') + ' measurements';
  return guidance(value);
}

export function AreaSummaryGrid({ group, unit, large = false, testIdPrefix = 'quantity', unavailableLabel = 'Unavailable' }: {
  group: AreaSummaryGroup | null;
  unit: AreaDisplayUnit;
  large?: boolean;
  testIdPrefix?: 'quantity' | 'physical';
  unavailableLabel?: string;
}) {
  return <dl className={large ? 'mt-4 space-y-4' : 'grid min-w-0 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-3'}>
    {outputs.map(output => {
      const value = group?.values.find(item => item.output === output.id);
      const partial = value?.status === 'partial' && value.subtotalMm2 !== null;
      const partialLabel = value?.provisionalRoomCount ? 'Provisional partial subtotal' : 'Partial subtotal';
      const amount = partial ? null : value?.totalMm2 ?? null;
      const unavailable = value?.reason === 'unsupported-model' ? 'Unsupported' : unavailableLabel;
      const testId = testIdPrefix === 'physical' ? 'physical-' + output.physicalTest : 'quantity-' + output.id;
      return <div key={output.id} data-testid={testId} className="min-w-0">
        <dt className="text-sm font-medium text-slate-600">{output.label}</dt>
        <dd className={(large ? 'text-2xl' : 'text-lg') + ' mt-1 break-words font-semibold tabular-nums text-slate-950'}>
          {amount === null ? unavailable : display(amount, unit)}
        </dd>
        {partial ? <p className="mt-1 text-sm font-medium tabular-nums text-slate-800">{partialLabel}: {display(value.subtotalMm2!, unit)}</p> : null}
        <p className={'mt-1 text-xs leading-5 ' + (value?.status === 'complete' ? 'text-slate-600' : 'text-amber-800')}>
          {value ? statusText(value) : 'Check the entered dimensions before calculating.'}
        </p>
        {group && group.roomIds.length > 1 && value && value.status !== 'unavailable' ? <p className="mt-1 text-xs leading-5 text-slate-500">
          {value.completeRoomCount + value.provisionalRoomCount} of {group.roomIds.length} rooms calculated
        </p> : null}
        {output.note ? <p className="mt-1 text-xs leading-5 text-slate-500">{output.note}</p> : null}
      </div>;
    })}
  </dl>;
}
