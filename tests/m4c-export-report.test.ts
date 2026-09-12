import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { renderQuantityCsv, renderQuantityHtml, type ReportOptions } from '../shared/exports/quantityReport';
import { createQuantitySnapshot, verifyQuantitySnapshot, type QuantitySnapshot } from '../shared/quantities/snapshot';
import { unknownMeasurement } from '../shared/domain/measurements';
import { createProposedRoomApplicability } from '../shared/domain/applicability';
import { upgradePhysicalDocumentToLayout } from '../shared/compatibility/layout';
import { canonicalJson } from '../shared/quantities/canonicalJson';
import { q001, room, measured, request, allSelections, AT, freezeDeep } from './fixtures/physical';

const local: ReportOptions = { source: 'local', unit: 'ft' };
async function capture(document = q001(), selected = request(allSelections(document))) {
  const result = await createQuantitySnapshot(document, selected, { id: 'export-capture', createdAt: AT, kind: 'evaluation' });
  assert.ok(result.ok, JSON.stringify(result));
  return result.snapshot;
}
/** Independent RFC-4180-style reader, including embedded quotes and CRLF. */
function parseCsv(input: string): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, '');
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; } else quoted = !quoted;
    } else if (char === ',' && !quoted) { row.push(field); field = ''; }
    else if ((char === '\r' || char === '\n') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += char;
  }
  assert.equal(quoted, false, 'unterminated quoted field');
  if (row.length || field) { row.push(field); rows.push(row); }
  const headers = rows.shift()!;
  return rows.map(cells => {
    assert.equal(cells.length, headers.length, 'all CSV sections use the same column count');
    return Object.fromEntries(headers.map((name, i) => [name, cells[i]]));
  });
}
function total(rows: ReturnType<typeof parseCsv>, output: string) {
  const result = rows.find(row => row.section === 'selected-total' && row.output === output);
  assert.ok(result, output); return result;
}
function fixture(file: string): QuantitySnapshot {
  return JSON.parse(readFileSync(new URL('./fixtures/' + file, import.meta.url), 'utf8'));
}

test('CSV independently parses exact selected quantities, deductions, waste and identity counts', async () => {
  const snapshot = await capture(), rows = parseCsv(renderQuantityCsv(snapshot, local));
  const floor = total(rows, 'floor-area');
  assert.deepEqual([floor.unit, floor.gross, floor.net, floor.waste_fraction, floor.allowance, floor.adjusted], ['ft2', '120', '120', '0.1', '12', '132']);
  assert.equal(total(rows, 'ceiling-area').net, '120');
  assert.equal(total(rows, 'gross-wall-area').net, '352');
  assert.deepEqual(['gross', 'raw_deductions', 'effective_deductions', 'net'].map(key => total(rows, 'net-wall-area')[key]), ['352', '33', '33', '319']);
  assert.equal(total(rows, 'baseboard').net, '41');
  assert.equal(total(rows, 'base-shoe').net, '41');
  const inventory = total(rows, 'opening-inventory');
  assert.deepEqual([inventory.unit, inventory.net, inventory.waste_fraction, inventory.allowance], ['count', '2', '', '0']);
  assert.equal(rows.filter(row => row.section === 'selected-total').length, 10);
  assert.equal(rows.some(row => row.section === 'available-subtotal'), false);
});

test('metric display rounds at the boundary and canonical columns retain every captured amount', async () => {
  const snapshot = await capture(), rows = parseCsv(renderQuantityCsv(snapshot, { source: 'local', unit: 'm' }));
  assert.equal(total(rows, 'floor-area').net, '11.1484');
  for (const output of snapshot.evaluation.calculation.outputs) {
    const row = total(rows, output.output); assert.ok(output.total);
    for (const [field, column] of [['gross', 'gross'], ['rawDeductions', 'raw_deductions'],
      ['effectiveDeductions', 'effective_deductions'], ['net', 'net'], ['allowance', 'allowance'], ['adjusted', 'adjusted']] as const) {
      assert.equal(Number(row['canonical_' + column]), output.total[field]);
      const divisor = output.unit === 'mm2' ? 1e6 : output.unit === 'mm' ? 1e3 : 1;
      assert.equal(Number(row[column]), Number((output.total[field] / divisor).toFixed(4)));
    }
    assert.equal(row.canonical_unit, output.unit);
  }
});

test('a height change is a distinct capture: walls change, floor and ceiling remain unchanged', async () => {
  const original = await capture(), document = q001(); document.rooms[0].ceilingHeight = measured('9 ft');
  const changed = await capture(document);
  const oldRows = parseCsv(renderQuantityCsv(original, local)), newRows = parseCsv(renderQuantityCsv(changed, local));
  assert.equal(total(oldRows, 'gross-wall-area').net, '352');
  assert.equal(total(newRows, 'gross-wall-area').net, '396');
  for (const output of ['floor-area', 'ceiling-area']) assert.equal(total(newRows, output).net, total(oldRows, output).net);
  assert.notEqual(original.captureFingerprint, changed.captureFingerprint);
});

test('clearing ceiling height retains floor quantities and explicit unavailable walls', async () => {
  const document = q001(); document.rooms[0].ceilingHeight = unknownMeasurement('Ceiling height has not been measured');
  const snapshot = await capture(document), rows = parseCsv(renderQuantityCsv(snapshot, local));
  assert.equal(total(rows, 'floor-area').net, '120');
  assert.equal(total(rows, 'gross-wall-area').net, '');
  assert.equal(total(rows, 'gross-wall-area').status, 'blocked');
  assert.ok(rows.some(row => row.section === 'room-dimension' && row.output === 'ceilingHeight'
    && row.status === 'unknown' && row.canonical_net === '' && row.details.includes('has not been measured')));
  assert.match(renderQuantityHtml(snapshot, local), /No zero or complete total is substituted/);
});

test('a usable room subtotal never becomes the selected total when another room lacks dimensions', async () => {
  const document = q001(); document.rooms.push(room('unmeasured-room'));
  document.rooms[1].width = unknownMeasurement('Missing width');
  const snapshot = await capture(document, request([{ output: 'floor-area', roomIds: ['room-1', 'unmeasured-room'], wasteFraction: .1 }]));
  const rows = parseCsv(renderQuantityCsv(snapshot, local)), selected = total(rows, 'floor-area');
  assert.deepEqual([selected.status, selected.completeness, selected.net], ['blocked', 'partial', '']);
  const subtotal = rows.find(row => row.section === 'available-subtotal')!;
  assert.equal(subtotal.net, '120'); assert.equal(subtotal.completeness, 'partial');
  assert.match(subtotal.details, /not a complete selected total/); assert.match(subtotal.details, /unmeasured-room/);
  const html = renderQuantityHtml(snapshot, local);
  assert.match(html, /Available subtotal — incomplete selection/); assert.match(html, /excludes missing targets/);
});

test('unconfirmed dimensions remain provisional even with complete scope coverage', async () => {
  const document = q001(); document.rooms[0].length = measured('12 ft', false);
  const snapshot = await capture(document, request([{ output: 'floor-area', roomIds: ['room-1'], wasteFraction: 0 }]));
  const selected = total(parseCsv(renderQuantityCsv(snapshot, local)), 'floor-area');
  assert.equal(selected.status, 'provisional'); assert.equal(selected.completeness, 'complete');
  assert.equal(selected.net, '120');
  const html = renderQuantityHtml(snapshot, local); assert.match(html, /unconfirmed/); assert.match(html, /Selected total: provisional/);
});

test('unsupported vaulted ceiling reports its reason and never substitutes verified flat-ceiling quantities', async () => {
  const document = q001(); document.quantityPolicyVersion = 'rectangular-flat-v2';
  const profile = createProposedRoomApplicability();
  profile.ceiling = { value: 'unsupported', source: 'manual', confirmation: { status: 'unconfirmed' }, detail: 'Vaulted ceiling requires a different surface model' };
  document.calculationContract = { version: 'room-applicability-v1', rooms: { 'room-1': profile } };
  const selected = request([{ output: 'floor-area', roomIds: ['room-1'], wasteFraction: 0 }, { output: 'ceiling-area', roomIds: ['room-1'], wasteFraction: 0 }]);
  selected.policy.version = 'rectangular-flat-v2';
  const snapshot = await capture(document, selected), rows = parseCsv(renderQuantityCsv(snapshot, local));
  assert.equal(total(rows, 'floor-area').net, '120');
  assert.equal(total(rows, 'ceiling-area').net, ''); assert.equal(total(rows, 'ceiling-area').status, 'blocked');
  assert.ok(rows.some(row => row.section === 'room-model' && row.status === 'unsupported' && row.details.includes('Vaulted')));
  assert.match(renderQuantityHtml(snapshot, local), /Vaulted ceiling requires a different surface model/);
});

for (const name of ['m3b-v1-snapshot.json', 'm3d-v2-snapshot.json', 'm3d-v3-snapshot.json', 'm3d-v4-snapshot.json']) {
  test('historical immutable capture keeps its exact versions and totals: ' + name, async () => {
    const snapshot = freezeDeep(fixture(name)), before = canonicalJson(snapshot);
    assert.ok((await verifyQuantitySnapshot(snapshot)).ok);
    const rows = parseCsv(renderQuantityCsv(snapshot, local));
    for (const output of snapshot.evaluation.calculation.outputs) {
      assert.equal(total(rows, output.output).status, output.status);
      assert.equal(total(rows, output.output).canonical_net, output.total ? String(output.total.net) : '');
    }
    const html = renderQuantityHtml(snapshot, local);
    assert.ok(html.includes(snapshot.snapshotSchemaVersion));
    assert.ok(html.includes(snapshot.evaluation.calculation.engineVersion));
    assert.ok(html.includes(snapshot.captureFingerprint));
    assert.equal(canonicalJson(snapshot), before);
  });
}

test('current layout-version capture retains source groups, height, style and layout data unchanged', async () => {
  const old = fixture('m3d-v4-snapshot.json');
  const document = upgradePhysicalDocumentToLayout(old.sourceDocument);
  const snapshot = await capture(document, old.evaluation.calculation.request), before = canonicalJson(snapshot);
  assert.equal(snapshot.snapshotSchemaVersion, 'quantity-snapshot-v5');
  assert.ok(renderQuantityCsv(snapshot, local).includes('quantity-snapshot-v5'));
  assert.ok(renderQuantityHtml(snapshot, local).includes('Layout-only zones and cabinet blocks do not add room finish area'));
  assert.equal(canonicalJson(snapshot), before);
});

test('spreadsheet formula names, including hidden leading whitespace/newlines, are inert cells', async () => {
  for (const name of ['=2+2', '+SUM(1,2)', '-2+3', '@SUM(A1)', ' \t\r\n=HYPERLINK("https://example.invalid")', '\uFEFF=1+1', '＝1+1', '＋2', '－2', '＠SUM(A1)', '\t＝2+2']) {
    const document = q001(); document.name = name; document.rooms[0].name = name;
    const rows = parseCsv(renderQuantityCsv(await capture(document), local));
    assert.equal(rows.find(row => row.section === 'metadata' && row.name === 'Project')!.details, "'" + name);
    assert.ok(rows.filter(row => row.section === 'room-dimension').every(row => row.name === "'" + name));
    assert.ok(rows.every(row => Object.values(row).every(cell => !/^[\s\u0000-\u001f\u007f]*[=+\-@＝＋－＠]/.test(cell))));
  }
});

test('CSV quoted commas, quotes, Unicode and multiline names survive independent parsing', async () => {
  const document = q001(); document.name = 'Kitchen, "North"\r\n浴室 – étage 🏠';
  const csv = renderQuantityCsv(await capture(document), local), rows = parseCsv(csv);
  assert.equal(csv[0], '\uFEFF');
  assert.equal(rows.find(row => row.section === 'metadata' && row.name === 'Project')!.details, document.name);
});

test('HTML escapes names and evidence in every context, with no scripts or network elements', async () => {
  const document = q001(); document.name = '</title><script>alert("x")</script>';
  document.rooms[0].name = '<img src="https://example.invalid" onerror="alert(1)">';
  document.rooms[0].ceilingHeight = unknownMeasurement('<svg/onload=alert(2)> & "missing"');
  const html = renderQuantityHtml(await capture(document), local);
  assert.match(html, /&lt;script&gt;/); assert.match(html, /&lt;img src=&quot;/); assert.match(html, /&lt;svg\/onload/);
  assert.doesNotMatch(html, /<script|<img|<svg|<iframe|<link|<form|<object|<embed|<a[\s>]/i);
  assert.doesNotMatch(html, /url\(|@import|http-equiv="refresh"/i);
  assert.match(html, /default-src 'none'/); assert.match(html, /<meta charset="utf-8">/);
});

test('saved provenance distinguishes verified server identities from captured source revision', async () => {
  const document = q001(); document.revisionId = 'legacy-source-revision';
  const snapshot = await capture(document);
  const rows = parseCsv(renderQuantityCsv(snapshot, { unit: 'ft', source: 'saved', planId: 'server-plan', revisionId: 'server-revision' }));
  const meta = (name: string) => rows.find(row => row.section === 'metadata' && row.name === name)!.details;
  assert.equal(meta('Account plan ID'), 'server-plan'); assert.equal(meta('Account revision ID'), 'server-revision');
  assert.equal(meta('Source revision ID'), 'legacy-source-revision'); assert.equal(meta('Snapshot ID'), 'export-capture');
  assert.equal(meta('Captured at'), AT); assert.equal(meta('Capture fingerprint'), snapshot.captureFingerprint);
  const localHtml = renderQuantityHtml(snapshot, local);
  assert.match(localHtml, /Local capture; not an account-saved revision/); assert.doesNotMatch(localHtml, /Authorized saved revision/);
});

test('many long Unicode room names stay complete with print pagination and repeated table headers', async () => {
  const document = q001(); document.openings = []; document.name = 'LongUnbrokenProjectName'.repeat(30);
  document.rooms = Array.from({ length: 40 }, (_, i) => ({ ...room('long-room-' + i), name: `浴室 ${i} — ` + 'LongUnbrokenRoomName'.repeat(30) }));
  const snapshot = await capture(document, request([{ output: 'floor-area', roomIds: document.rooms.map(room => room.id), wasteFraction: 0 }]));
  const html = renderQuantityHtml(snapshot, local), rows = parseCsv(renderQuantityCsv(snapshot, local));
  assert.equal(total(rows, 'floor-area').net, '4800');
  for (const room of document.rooms) { assert.ok(html.includes(room.name!)); assert.ok(html.includes(room.id)); }
  assert.ok(html.includes(document.name));
  assert.match(html, /h1,h2,h3,h4,caption\{[^}]*overflow-wrap:anywhere/);
  assert.match(html, /display:table-header-group/); assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /@page/); assert.match(html, /@media print/); assert.doesNotMatch(html, /height:\s*\d+px|overflow:\s*hidden/);
  assert.equal((html.match(/<html\b/g) ?? []).length, 1); assert.ok(html.endsWith('</body></html>'));
});

test('empty captured scope is not labeled a complete takeoff', async () => {
  const snapshot = await capture(q001(), request([]));
  const rows = parseCsv(renderQuantityCsv(snapshot, local));
  assert.equal(rows.filter(row => row.section === 'selected-total').length, 0);
  assert.match(renderQuantityHtml(snapshot, local), /No outputs selected/);
  assert.match(renderQuantityHtml(snapshot, local), /not a completed takeoff/);
});

test('renderer never recalculates a captured evaluation or mutates supplied bytes', async () => {
  const original = await capture(), snapshot = structuredClone(original) as QuantitySnapshot;
  // Deliberately unverified input probes this presentation boundary. Real callers
  // must reject this mismatch; the renderer must not silently repair or upgrade it.
  snapshot.sourceDocument.rooms[0].length = measured('99 ft');
  freezeDeep(snapshot); const before = canonicalJson(snapshot);
  assert.equal(total(parseCsv(renderQuantityCsv(snapshot, local)), 'floor-area').net, '120');
  const first = renderQuantityHtml(snapshot, local); assert.equal(renderQuantityHtml(snapshot, local), first);
  assert.equal(canonicalJson(snapshot), before);
  assert.equal((await verifyQuantitySnapshot(snapshot)).ok, false);
});

test('invalid display or provenance options fail explicitly', async () => {
  const snapshot = await capture();
  for (const options of [{ unit: 'px', source: 'local' }, { unit: 'ft', source: 'inferred' }]) {
    assert.throws(() => renderQuantityCsv(snapshot, options as ReportOptions));
    assert.throws(() => renderQuantityHtml(snapshot, options as ReportOptions));
  }
});
