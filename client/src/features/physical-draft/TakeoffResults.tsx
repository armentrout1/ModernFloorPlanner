import type { DrawingSourceScope, TakeoffAmounts, TakeoffOutput } from './takeoffReadModel';
import { Button } from '@/components/ui/button';

const amountFields = [
  ['gross', 'Gross basis'], ['rawDeductions', 'Raw deductions'], ['effectiveDeductions', 'Effective deductions'],
  ['net', 'Net measured quantity'], ['allowance', 'Waste allowance'], ['adjusted', 'Waste-adjusted quantity'],
] as const;
const amountId = (field: string) => field.replace(/[A-Z]/g, letter => '-' + letter.toLowerCase());
function Amounts({ amounts, testId, showWaste = true }: { amounts: TakeoffAmounts; testId?: string; showWaste?: boolean }) {
  return <dl data-testid={testId} className="grid grid-cols-2 gap-x-5 gap-y-3 sm:grid-cols-3">
    {amountFields.filter(([field]) => showWaste || !['allowance', 'adjusted'].includes(field)).map(([field, label]) => <div key={field}>
      <dt className="text-xs text-slate-600">{label}</dt>
      <dd data-amount={amountId(field)} className={'mt-1 tabular-nums ' + (field === 'net' ? 'text-lg font-semibold' : 'text-sm font-medium')}>
        {amounts[field] ?? 'Unavailable — finish waste input'}</dd>
    </div>)}
  </dl>;
}
export function TakeoffResults({ outputs, onFocus }: { outputs: TakeoffOutput[]; onFocus: (source: DrawingSourceScope) => void }) {
  if (!outputs.length) return <p className="rounded-md border border-dashed p-4 text-sm text-slate-600">No work selected. Choose the work to measure; this is not a zero-quantity project.</p>;
  return <div className="space-y-4">{outputs.map(output => <section key={output.output} data-testid={'takeoff-output-' + output.output} className="min-w-0 rounded-lg border bg-white p-4">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
      <div><h3 className="font-semibold">{output.label}</h3><p className="text-xs text-slate-600">{output.targetCount} selected target{output.targetCount === 1 ? '' : 's'} · {output.status === 'complete' ? 'Confirmed input basis' : output.status === 'empty' ? 'Nothing selected' : output.status === 'provisional' ? 'Provisional' : 'Incomplete / blocked'}</p></div>
      <Button size="sm" variant="outline" disabled={!output.targetCount} onClick={() => onFocus(output.scope)}>Locate scope</Button>
    </div>
    {!output.targetCount ? <p data-testid="takeoff-total" className="text-sm text-slate-600">No targets selected. Choose explicit targets for this work.</p> : <>
      {output.total ? <Amounts amounts={output.total} testId="takeoff-total" showWaste={output.output !== 'opening-inventory'} /> : <p data-testid="takeoff-total" className="text-sm font-medium text-amber-900">Full selected total unavailable — required contributions are missing or blocked.</p>}
      {output.wastePending ? <p role="status" className="mt-3 text-sm text-amber-900">{output.wasteError || 'Finish the waste percentage to calculate adjusted quantities.'} Net measured quantities remain separate.</p> : null}
      {!output.total && output.subtotal ? <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3">
        <h4 className="mb-3 text-sm font-semibold">Partial subtotal · {output.subtotalStatus === 'provisional' ? 'Provisional' : 'Confirmed input basis'} — not the full selected total</h4>
        <Amounts amounts={output.subtotal} testId="takeoff-subtotal" showWaste={output.output !== 'opening-inventory'} />
        <p className="mt-3 text-xs leading-5">Included: {output.includedTargets.map(target => target.label).join('; ') || 'None'}.</p>
        <p className="text-xs leading-5">Excluded: {output.excludedTargets.map(target => target.label).join('; ') || 'None'}.</p>
      </div> : null}
      {output.inventory ? <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm" data-testid="takeoff-inventory">
        <div><dt className="inline">Doors: </dt><dd className="inline font-semibold">{output.inventory.door}</dd></div>
        <div><dt className="inline">Windows: </dt><dd className="inline font-semibold">{output.inventory.window}</dd></div>
        <div><dt className="inline">Floor-level openings: </dt><dd className="inline font-semibold">{output.inventory['floor-level-opening']}</dd></div>
      </dl> : null}
      <details className="mt-4 border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium text-blue-700">Show breakdown</summary>
        <div className="mt-3 space-y-4">{output.rows.map(row => <article key={row.targetId} data-testid={'takeoff-record-' + output.output + '-' + row.targetId} data-target-id={row.targetId} className="min-w-0 rounded-md border p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">{row.label}</h4>
            <Button size="sm" variant="outline" onClick={() => onFocus(row.source)}>Locate source</Button></div>
          <p className="mb-3 text-xs leading-5 text-slate-600">Numbers: {row.readiness.numericBasis.status} · Geometry: {row.readiness.geometry.status} · Input review: {row.readiness.confirmation.status} · Room model: {row.readiness.applicability?.status ?? 'not required'}</p>
          {row.amounts ? <Amounts amounts={row.amounts} showWaste={output.output !== 'opening-inventory'} /> : <p className="text-sm font-medium text-amber-900">Quantity unavailable for this target.</p>}
          {row.contributions.length ? <div className="mt-3 space-y-2 border-t pt-3"><h5 className="text-xs font-semibold">Opening deductions</h5>{row.contributions.map((item, index) => <div key={item.openingId + item.wallFaceId + index} className="flex flex-wrap items-start justify-between gap-2 text-xs" data-testid="takeoff-deduction" data-opening-id={item.openingId}>
            <button type="button" className="text-left text-blue-700 underline underline-offset-2" onClick={() => onFocus(item.source)}>{item.label}</button>
            <span>Raw: <span data-amount="raw">{item.raw}</span> · Effective before union: <span data-amount="effective-before-union">{item.effectiveBeforeUnion}</span></span>
          </div>)}</div> : null}
          {row.adjustments.length ? <ul className="mt-2 space-y-1 text-xs text-slate-600">{row.adjustments.map((item, index) => <li key={item.code + index}>{item.message} ({item.amount})</li>)}</ul> : null}
          {row.findings.length ? <ul className="mt-3 space-y-1 border-t pt-3 text-xs leading-5 text-amber-900">{row.findings.map((finding, index) => <li key={finding.code + index}>
            <span>{finding.message}</span>{finding.detail && finding.detail !== finding.message ? <span> {finding.detail}</span> : null}
          </li>)}</ul> : null}
        </article>)}</div>
      </details>
    </>}
  </section>)}</div>;
}
