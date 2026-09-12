import type { Dimension, Elevation } from '../domain/measurements';
import { formatQuantity } from '../quantities/display';
import type { DeepReadonly } from '../quantities/immutability';
import type { Amounts, QuantityAggregate, QuantityRecord } from '../quantities/result';
import type { QuantitySnapshot } from '../quantities/snapshot';

export interface ReportOptions {
  unit: 'ft' | 'm';
  source: 'local' | 'saved';
  planId?: string;
  revisionId?: string;
}

type Snapshot = DeepReadonly<QuantitySnapshot>;
type RecordRow = DeepReadonly<QuantityRecord>;
type Unit = QuantityRecord['unit'];
type Cell = string | number;
type CsvRow = Partial<Record<(typeof COLUMNS)[number], Cell>>;
const COLUMNS = ['section', 'entity_id', 'name', 'output', 'status', 'completeness', 'unit', 'gross',
  'raw_deductions', 'effective_deductions', 'net', 'waste_fraction', 'allowance', 'adjusted',
  'canonical_unit', 'canonical_gross', 'canonical_raw_deductions', 'canonical_effective_deductions',
  'canonical_net', 'canonical_allowance', 'canonical_adjusted', 'details'] as const;
const OUTPUT_NAMES: Record<QuantityRecord['output'], string> = {
  'floor-area': 'Floor area', 'ceiling-area': 'Ceiling area', 'gross-wall-area': 'Gross wall area',
  'net-wall-area': 'Net wall area', baseboard: 'Baseboard', 'base-shoe': 'Base shoe', crown: 'Crown',
  'door-casing': 'Door casing', 'window-casing': 'Window casing', 'opening-inventory': 'Opening inventory',
};
const LIMITS = 'Measured finish quantities only, not a complete construction materials list. Material recipes, coverage, accessories, purchasing and trade models are not included. Layout-only zones and cabinet blocks do not add room finish area. Quantity report only; no scaled drawing.';
const PRECISION = 'Display quantities and dimensions are rounded to four decimal places. CSV canonical columns retain the captured unrounded mm, mm2 or count values. Rounding is presentation only; displayed rows may not sum exactly.';

function checkOptions(options: ReportOptions) {
  if (!['ft', 'm'].includes(options.unit) || !['local', 'saved'].includes(options.source)) {
    throw new Error('Explicit report units and local or authorized saved provenance are required.');
  }
}
function unitLabel(unit: Unit, options: ReportOptions) {
  return unit === 'count' ? 'count' : options.unit + (unit === 'mm2' ? '2' : '');
}
function number(value: number, unit: Unit, options: ReportOptions) {
  const formatted = formatQuantity({ value, unit }, { unit: unit === 'count' ? 'count' : options.unit,
    fractionDigits: unit === 'count' ? 0 : 4 });
  if (!formatted.ok) throw new Error('The captured quantity cannot be displayed.');
  return formatted.formatted.replace(/(\.\d*?[1-9])0+$|\.0+$/, '$1');
}
function html(value: Cell) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;',
    '"': '&quot;', "'": '&#39;' })[character]!);
}
/** Quoting alone does not neutralize spreadsheet formulas. Preserve the original
 * text behind an apostrophe if leading whitespace/control characters hide a trigger. */
function csvCell(value: Cell) {
  const text = String(value);
  const guarded = typeof value === 'string' && /^[\s\u0000-\u001f\u007f]*[=+\-@＝＋－＠]/.test(text) ? "'" + text : text;
  return '"' + guarded.replace(/"/g, '""') + '"';
}
function entities(snapshot: Snapshot) {
  const names = new Map<string, string>();
  for (const room of snapshot.sourceDocument.rooms) {
    const name = room.name || 'Unnamed room';
    names.set(room.id, name);
    for (const wall of room.wallFaces) names.set(wall.id, name + ' / ' + wall.side + ' wall');
  }
  for (const opening of snapshot.sourceDocument.openings) names.set(opening.id, opening.kind + ' / ' + opening.id);
  const document = snapshot.sourceDocument;
  if (document.schemaVersion === 3 || document.schemaVersion === 4 || document.schemaVersion === 5) {
    for (const level of document.buildingLevels.levels) names.set(level.id, level.name);
  }
  return names;
}
function targetName(record: RecordRow, names: Map<string, string>) {
  return names.get(record.targetId) ?? ([...record.readiness.roomIds, ...record.readiness.wallFaceIds,
    ...record.readiness.openingIds].map(id => names.get(id) ?? id).join(' / ') || record.targetId);
}
function metadata(snapshot: Snapshot, options: ReportOptions): [string, Cell][] {
  const calculation = snapshot.evaluation.calculation;
  return [
    ['Report', 'Modern Floor Planner quantity report'], ['Project', snapshot.sourceDocument.name || 'Untitled project'],
    ['Source', options.source === 'local' ? 'Local capture; not an account-saved revision' : 'Authorized saved revision'],
    ['Account plan ID', options.source === 'saved' ? options.planId ?? 'Not supplied' : 'Not applicable'],
    ['Account revision ID', options.source === 'saved' ? options.revisionId ?? 'Not supplied' : 'Not applicable'],
    ['Snapshot ID', snapshot.instance.id], ['Captured at', snapshot.instance.createdAt], ['Capture kind', snapshot.instance.kind],
    ['Snapshot schema', snapshot.snapshotSchemaVersion], ['Capture fingerprint', snapshot.captureFingerprint],
    ['Content fingerprint', snapshot.evaluation.fingerprints.content], ['Geometry fingerprint', snapshot.evaluation.fingerprints.geometry],
    ['Fingerprint algorithm', snapshot.evaluation.fingerprints.algorithm + ' / ' + snapshot.evaluation.fingerprints.serialization],
    ['Source document ID', calculation.source.documentId ?? 'Not identified'],
    ['Source revision ID', calculation.source.revisionId ?? 'Unsaved'], ['Source revision state', calculation.source.revisionState],
    ['Engine version', calculation.engineVersion], ['Policy version', calculation.policyVersion],
    ['Result schema', calculation.schemaVersion], ['Selected calculation status', calculation.status],
    ['Display length units', options.unit], ['Opening measurement basis', calculation.request.policy.openingMeasureBasis],
    ['Crown full-height gaps', JSON.stringify(calculation.request.policy.crownFullHeightGaps)],
    ['Precision', PRECISION], ['Boundaries', LIMITS],
    ['Uncertainty', 'Complete describes only the captured selected outputs. Provisional values require review. Missing or unsupported inputs remain unavailable; available subtotals are not complete selected totals.'],
    ['Privacy', 'Authorization applies when retrieving a saved report. A downloaded copy cannot be retroactively revoked.'],
  ];
}
function signedMeasurement(value: number, options: ReportOptions) {
  return (value < 0 ? '-' : '') + number(Math.abs(value), 'mm', options);
}
function measurement(value: DeepReadonly<Dimension | Elevation>, options: ReportOptions) {
  if (value.state !== 'known') return value.state + ': ' + value.reason + (value.state === 'needs-review'
    ? '; candidates: ' + value.candidates.map(candidate => candidate.label + ' = ' + signedMeasurement(Number(candidate.valueMm), options)
      + ' ' + options.unit + ' (' + candidate.provenance.confirmation.status + ')').join('; ') : '');
  // Sill/elevation can be zero; room dimensions are strictly positive.
  return signedMeasurement(Number(value.valueMm), options) + ' ' + options.unit + '; ' + value.provenance.confirmation.status
    + '; input ' + (value.provenance.input ?? 'not retained') + '; source ' + value.provenance.source;
}
function dimensionRows(snapshot: Snapshot, options: ReportOptions): CsvRow[] {
  const document = snapshot.sourceDocument, rows: CsvRow[] = [];
  for (const room of document.rooms) {
    const level = (document.schemaVersion === 3 || document.schemaVersion === 4 || document.schemaVersion === 5)
      ? document.buildingLevels.roomLevels[room.id] : null;
    for (const field of ['length', 'width', 'ceilingHeight'] as const) rows.push({ section: 'room-dimension', entity_id: room.id,
      name: room.name || 'Unnamed room', output: field, status: room[field].state, unit: options.unit,
      canonical_unit: 'mm', canonical_net: room[field].valueMm === null ? '' : Number(room[field].valueMm),
      details: measurement(room[field], options) + '; level ID: ' + (level ?? 'Not captured in this version') });
    const profile = document.calculationContract?.rooms[room.id];
    if (profile) for (const field of ['ceiling', 'walls', 'crownPath'] as const) rows.push({ section: 'room-model',
      entity_id: room.id, name: room.name || 'Unnamed room', output: field, status: profile[field].value,
      details: profile[field].value + '; ' + profile[field].confirmation.status + '; ' + (profile[field].detail ?? 'Explicit captured model') });
  }
  for (const opening of document.openings) for (const field of ['width', 'height', 'sillHeight'] as const) rows.push({
    section: 'opening-dimension', entity_id: opening.id, name: opening.kind, output: field, status: opening[field].state,
    unit: options.unit, canonical_unit: 'mm', canonical_net: opening[field].valueMm === null ? '' : Number(opening[field].valueMm),
    details: measurement(opening[field], options) + '; measurement basis: ' + opening.measureBasis
      + '; wall faces: ' + opening.attachments.map(face => face.wallFaceId).join(', '),
  });
  return rows;
}
function amountRow(amounts: DeepReadonly<Amounts> | null, unit: Unit, options: ReportOptions): CsvRow {
  const result: CsvRow = { unit: unitLabel(unit, options), canonical_unit: unit };
  if (!amounts) return result;
  for (const [field, column] of [['gross', 'gross'], ['rawDeductions', 'raw_deductions'],
    ['effectiveDeductions', 'effective_deductions'], ['net', 'net'], ['allowance', 'allowance'], ['adjusted', 'adjusted']] as const) {
    result[column] = number(amounts[field], unit, options);
    result[('canonical_' + column) as keyof CsvRow] = amounts[field];
  }
  result.waste_fraction = amounts.wasteFraction ?? '';
  return result;
}
function findings(record: RecordRow): string[] {
  const readiness = record.readiness;
  return Array.from(new Set([
    ...record.errors.map(error => error.code + ': ' + error.message + '; source ' + (error.id ?? '') + '; path ' + error.path.join('.')),
    ...[...readiness.numericBasis.findings, ...readiness.geometry.findings, ...readiness.confirmation.findings,
      ...(readiness.applicability?.findings ?? [])].map(finding => finding.code + ': ' + finding.message
        + '; rooms ' + finding.roomIds.join(', ') + '; walls ' + finding.wallFaceIds.join(', ')
        + '; openings ' + finding.openingIds.join(', ') + '; paths ' + JSON.stringify(finding.paths)),
    ...(readiness.surface?.findings ?? []).map(finding => finding.code + ': ' + finding.message
      + '; source ' + (finding.id ?? '') + '; path ' + finding.path.join('.')),
  ]));
}
function scopeRows(snapshot: Snapshot): CsvRow[] {
  const rows: CsvRow[] = snapshot.evaluation.calculation.request.selections.map(selection => ({ section: 'selected-scope',
    output: selection.output, waste_fraction: 'wasteFraction' in selection ? selection.wasteFraction : '',
    details: JSON.stringify(selection) }));
  return rows;
}
function aggregateRows(snapshot: Snapshot, options: ReportOptions): CsvRow[] {
  return snapshot.evaluation.calculation.outputs.flatMap(aggregate => {
    const details = 'Included target IDs: ' + JSON.stringify(aggregate.includedTargetIds)
      + '; excluded target IDs: ' + JSON.stringify(aggregate.excludedTargetIds)
      + '; inventory: ' + JSON.stringify(aggregate.inventory)
      + '; errors: ' + aggregate.errors.map(error => error.code + ': ' + error.message).join('; ');
    const rows: CsvRow[] = [{ section: 'selected-total', output: aggregate.output, status: aggregate.status,
      completeness: aggregate.completeness, ...amountRow(aggregate.total, aggregate.unit, options), details }];
    if (!aggregate.total) rows.push({ section: 'available-subtotal', output: aggregate.output, status: aggregate.subtotalStatus,
      completeness: aggregate.completeness, ...amountRow(aggregate.subtotal, aggregate.unit, options),
      details: 'Incomplete selection; this is not a complete selected total. ' + details });
    if (aggregate.grossBasis !== undefined) rows.push({ section: 'gross-basis', output: aggregate.output,
      status: aggregate.grossBasisStatus, unit: unitLabel(aggregate.unit, options), canonical_unit: aggregate.unit,
      gross: aggregate.grossBasis === null ? '' : number(aggregate.grossBasis, aggregate.unit, options),
      canonical_gross: aggregate.grossBasis ?? '', details: 'Captured gross basis alone does not establish available net quantities.' });
    return rows;
  });
}
function detailRows(snapshot: Snapshot, options: ReportOptions): CsvRow[] {
  const names = entities(snapshot);
  return snapshot.evaluation.calculation.records.flatMap(record => {
    const rows: CsvRow[] = [{ section: 'target', entity_id: record.targetId, name: targetName(record, names),
      output: record.output, status: record.status, ...amountRow(record.amounts, record.unit, options),
      details: record.trace.formula + '; rooms ' + JSON.stringify(record.readiness.roomIds)
        + '; walls ' + JSON.stringify(record.readiness.wallFaceIds) + '; openings ' + JSON.stringify(record.readiness.openingIds)
        + '; inventory ' + JSON.stringify(record.inventory) }];
    for (const detail of findings(record)) rows.push({ section: 'finding', entity_id: record.targetId,
      output: record.output, status: record.status, details: detail });
    rows.push({ section: 'deduction-trace', entity_id: record.targetId, output: record.output,
      canonical_unit: record.unit, details: JSON.stringify(record.trace) });
    for (const evidence of record.readiness.surface?.evidence ?? []) rows.push({ section: 'surface-measurement',
      entity_id: evidence.openingId, output: evidence.field, status: evidence.measurement.state,
      canonical_unit: 'mm', canonical_net: evidence.measurement.valueMm === null ? '' : Number(evidence.measurement.valueMm), details: measurement(evidence.measurement, options) });
    return rows;
  });
}

/** Presentation only: the caller must capture or verify snapshot integrity and,
 * for saved reports, authorize retrieval before calling. Never evaluates geometry. */
export function renderQuantityCsv(snapshot: Snapshot, options: ReportOptions): string {
  checkOptions(options);
  const rows: CsvRow[] = [...metadata(snapshot, options).map(([name, details]) => ({ section: 'metadata', name, details })),
    ...scopeRows(snapshot), ...aggregateRows(snapshot, options), ...dimensionRows(snapshot, options), ...detailRows(snapshot, options)];
  return '\uFEFF' + COLUMNS.map(csvCell).join(',') + '\r\n'
    + rows.map(row => COLUMNS.map(column => csvCell(row[column] ?? '')).join(',')).join('\r\n') + '\r\n';
}

function amountTable(amounts: DeepReadonly<Amounts> | null, unit: Unit, options: ReportOptions) {
  if (!amounts) return '<p class="unavailable">Unavailable — required inputs or supported models are missing. No zero or complete total is substituted.</p>';
  const values: [string, string][] = [['Gross', number(amounts.gross, unit, options)],
    ['Raw deductions', number(amounts.rawDeductions, unit, options)], ['Effective deductions', number(amounts.effectiveDeductions, unit, options)],
    ['Net', number(amounts.net, unit, options)], ['Waste', amounts.wasteFraction === null ? 'Not applicable' : String(Number((amounts.wasteFraction * 100).toFixed(4))) + '%'],
    ['Allowance', number(amounts.allowance, unit, options)], ['Adjusted', number(amounts.adjusted, unit, options)]];
  return '<table class="amounts"><caption>Quantities (' + html(unitLabel(unit, options)) + ')</caption><thead><tr>'
    + values.map(([name]) => '<th scope="col">' + html(name) + '</th>').join('') + '</tr></thead><tbody><tr>'
    + values.map(([, value]) => '<td>' + html(value) + '</td>').join('') + '</tr></tbody></table>';
}
function aggregateHtml(aggregate: DeepReadonly<QuantityAggregate>, options: ReportOptions) {
  return '<article><h3>' + html(OUTPUT_NAMES[aggregate.output]) + '</h3><p><strong>Selected total: '
    + html(aggregate.status) + '</strong> · Coverage: ' + html(aggregate.completeness) + '</p>'
    + amountTable(aggregate.total, aggregate.unit, options)
    + (!aggregate.total ? '<h4>Available subtotal — incomplete selection</h4><p>Included values: '
      + html(aggregate.subtotalStatus) + '. This subtotal excludes missing targets and is not the selected total.</p>'
      + amountTable(aggregate.subtotal, aggregate.unit, options) : '')
    + (aggregate.grossBasis !== undefined ? '<p>Captured gross basis: '
      + (aggregate.grossBasis === null ? 'unavailable' : html(number(aggregate.grossBasis, aggregate.unit, options)) + ' ' + html(unitLabel(aggregate.unit, options)))
      + ' (' + html(aggregate.grossBasisStatus ?? '') + '). Gross basis does not establish available net quantities.</p>' : '')
    + '<p class="ids">Included target IDs: ' + html(aggregate.includedTargetIds.join(', ') || 'None')
    + '<br>Excluded target IDs: ' + html(aggregate.excludedTargetIds.join(', ') || 'None') + '</p>'
    + (aggregate.inventory ? '<p>Identity counts: doors ' + aggregate.inventory.door + ', windows ' + aggregate.inventory.window
      + ', floor-level openings ' + aggregate.inventory['floor-level-opening'] + '. Not a purchasing quantity.</p>' : '')
    + aggregate.errors.map(error => '<p class="finding">' + html(error.code + ': ' + error.message) + '</p>').join('') + '</article>';
}

/** Self-contained UTF-8 HTML, with no scripts, external fonts or network content.
 * The browser Print dialog supplies paper printing and Save as PDF. */
export function renderQuantityHtml(snapshot: Snapshot, options: ReportOptions): string {
  checkOptions(options);
  const calculation = snapshot.evaluation.calculation, names = entities(snapshot);
  const dimensions = dimensionRows(snapshot, options);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width, initial-scale=1">'
    + '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'">'
    + '<title>' + html(snapshot.sourceDocument.name || 'Untitled project') + ' — quantity report</title>'
    + '<style>@page{size:auto;margin:16mm}*{box-sizing:border-box}body{margin:0 auto;padding:28px;max-width:1100px;color:#172535;background:#fff;font:14px/1.5 system-ui,"Segoe UI",sans-serif}h1{font-size:28px;line-height:1.2;margin:8px 0}h2{font-size:20px;border-bottom:2px solid #243b53;padding-bottom:8px;margin-top:30px}h3{font-size:17px;margin:0 0 6px}h4{margin:14px 0 4px}p,li,td,dd{overflow-wrap:anywhere;white-space:pre-wrap;orphans:3;widows:3}dt{font-weight:600}dd{margin:0 0 8px}article{padding:16px 0;border-bottom:1px solid #bac6d2}table{border-collapse:collapse;width:100%;table-layout:fixed;font-size:12px;margin:10px 0}caption{text-align:left;font-weight:600;padding-bottom:6px}th,td{border:1px solid #bbc5cf;padding:7px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f0f4f7}thead{display:table-header-group}tr{break-inside:avoid}.notice{border-left:4px solid #375f82;padding:12px;background:#f1f6fa}.unavailable,.finding{color:#683c00}.ids,.muted{font-size:12px;color:#435468}.metadata{display:grid;grid-template-columns:minmax(140px,1fr) 3fr;gap:0 14px}.metadata dd{min-width:0}h1,h2,h3,h4,caption{break-after:avoid;overflow-wrap:anywhere;white-space:pre-wrap}.amounts{break-inside:avoid}.screen-only{font-size:13px}@media print{body{max-width:none;padding:0;font-size:10pt}h1{font-size:21pt}h2{font-size:15pt}h3{font-size:12pt}table{font-size:8pt}.screen-only{display:none}.notice{background:transparent}a{color:inherit}}@media(max-width:600px){body{padding:14px}.metadata{display:block}table{font-size:10px}th,td{padding:4px}}</style></head><body>'
    + '<header><p class="muted">Modern Floor Planner · captured quantity report</p><h1>' + html(snapshot.sourceDocument.name || 'Untitled project')
    + '</h1><p><strong>Selected calculation status: ' + html(calculation.status) + '</strong></p>'
    + '<p class="screen-only">Use your browser’s Print command to print this report or choose Save as PDF. Paper size and browser settings affect pagination.</p></header>'
    + '<div class="notice"><p>' + html(LIMITS) + '</p><p>Unsupported ceiling shapes are unavailable, never verified as flat ceilings. Historical snapshots retain their captured policy and assumptions; no upgrade or new measurement confirmation occurs during export.</p>'
    + '<p>' + html(PRECISION) + '</p></div>'
    + '<h2>Selected quantities</h2>' + (calculation.outputs.length ? calculation.outputs.map(value => aggregateHtml(value, options)).join('')
      : '<p>No outputs selected. This empty report is not a completed takeoff.</p>')
    + '<h2>Captured scope</h2><p>Only these captured IDs contribute. Other rooms and objects in the source do not automatically enter this scope.</p><ul>'
    + scopeRows(snapshot).map(row => '<li><strong>' + html(String(row.output)) + '</strong>: ' + html(String(row.details)) + '</li>').join('') + '</ul>'
    + '<h2>Source dimensions and models</h2><p>Source reference includes unselected rooms and openings. Unknown and unconfirmed measurements are retained. Ceiling height is distinct from plan width/length, floor-to-floor rise and rough framing height.</p>'
    + '<table><thead><tr><th scope="col">Name / ID</th><th scope="col">Field</th><th scope="col">Captured value and evidence</th></tr></thead><tbody>'
    + dimensions.map(row => '<tr><td>' + html(String(row.name)) + '<br>' + html(String(row.entity_id)) + '</td><td>'
      + html(String(row.output)) + '</td><td>' + html(String(row.details)) + '</td></tr>').join('') + '</tbody></table>'
    + '<h2>Target details and uncertainty</h2>' + calculation.records.map(record => '<article><h3>' + html(targetName(record, names))
      + ' · ' + html(OUTPUT_NAMES[record.output]) + '</h3><p class="ids">Target ID: ' + html(record.targetId) + '</p><p>Status: '
      + html(record.status) + '; numeric basis: ' + html(record.readiness.numericBasis.status) + '; geometry: ' + html(record.readiness.geometry.status)
      + '; confirmation: ' + html(record.readiness.confirmation.status) + '; model: ' + html(record.readiness.applicability?.status ?? 'Historical policy') + '</p>'
      + amountTable(record.amounts, record.unit, options) + '<p>Captured formula: ' + html(record.trace.formula) + '</p>'
      + findings(record).map(finding => '<p class="finding">' + html(finding) + '</p>').join('')
      + '<p class="ids">Raw deduction sources: ' + html(JSON.stringify([...record.trace.contributions, ...(record.trace.surfaceContributions ?? [])]))
      + '<br>Boundary / overlap / roundoff adjustments (' + html(record.unit) + '): '
      + html([record.trace.boundaryAdjustment, record.trace.overlapAdjustment, record.trace.roundoffAdjustment].join(' / ')) + '</p></article>').join('')
    + '<h2>Snapshot and provenance</h2><dl class="metadata">' + metadata(snapshot, options).map(([name, value]) => '<dt>' + html(name)
      + '</dt><dd>' + html(value) + '</dd>').join('') + '</dl></body></html>';
}
