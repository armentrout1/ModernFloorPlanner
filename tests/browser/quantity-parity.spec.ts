import assert from 'node:assert/strict';
import { test, expect, type Page } from '@playwright/test';
import { evaluateQuantities, createQuantitySnapshot, type Evaluation, type EvaluationOutcome } from '../../shared/quantities/snapshot';
import type { Calculation } from '../../shared/quantities/result';
import type { DeepReadonly } from '../../shared/quantities/immutability';
import { unknownMeasurement } from '../../shared/domain/measurements';
import { toMm } from '../../shared/domain/units';
import { q001, request, allSelections, measured, AT } from '../fixtures/physical';

// Canonical quantity comparisons allow 1e-7 absolute canonical units or 1e-12
// relative error; fingerprints and nonnumeric contract values must match exactly.
function close(actual: number, expected: number, label: string) {
  assert.ok(Math.abs(actual - expected) <= Math.max(1e-7, Math.abs(expected) * 1e-12), label + ': ' + actual + ' != ' + expected);
}
const area = (squareFeet: number) => squareFeet * 304.8 * 304.8;
const length = (feet: number) => feet * 304.8;
function output(calculation: DeepReadonly<Calculation>, name: string) {
  const result = calculation.outputs.find(item => item.output === name); assert.ok(result, name); return result;
}
function compareStructured(actual: unknown, expected: unknown, path = 'calculation') {
  if (typeof expected === 'number' && typeof actual === 'number') { close(actual, expected, path); return; }
  if (expected && typeof expected === 'object') {
    assert.ok(actual && typeof actual === 'object', path);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    for (const key of Object.keys(expected)) compareStructured((actual as any)[key], (expected as any)[key], path + '.' + key);
  } else assert.equal(actual, expected, path);
}
function parity(node: DeepReadonly<Evaluation>, browser: DeepReadonly<Evaluation>) {
  compareStructured(browser.calculation, node.calculation);
  assert.deepEqual(browser.fingerprints, node.fingerprints);
}
async function run(page: Page, doc = q001(), requested = request(allSelections(doc))) {
  const node = await evaluateQuantities(doc, requested); assert.ok(node.ok, JSON.stringify(node));
  const browser = await page.evaluate(async ({ document, selection }) =>
    (window as any).mfpParity.evaluate(document, selection), { document: doc, selection: requested }) as EvaluationOutcome;
  assert.ok(browser.ok, JSON.stringify(browser));
  return { node: node.evaluation, browser: browser.evaluation };
}
function q001Answers(evaluation: DeepReadonly<Evaluation>, status: 'complete' | 'provisional') {
  const calculation = evaluation.calculation;
  assert.equal(calculation.status, status);
  const answers: [string, number][] = [
    ['floor-area', area(120)], ['ceiling-area', area(120)], ['gross-wall-area', area(352)],
    ['net-wall-area', area(319)], ['baseboard', length(41)], ['base-shoe', length(41)],
    ['crown', length(44)], ['door-casing', length(17)], ['window-casing', length(14)],
    ['opening-inventory', 2],
  ];
  for (const [name, answer] of answers) {
    const aggregate = output(calculation, name);
    assert.equal(aggregate.status, name === 'opening-inventory' ? 'complete' : status);
    assert.equal(aggregate.completeness, 'complete'); assert.ok(aggregate.total);
    close(aggregate.total.net, answer, name);
  }
  close(output(calculation, 'floor-area').total!.adjusted, area(132), 'flooring with waste');
  close(output(calculation, 'baseboard').total!.gross, length(44), 'perimeter basis');
  close(output(calculation, 'net-wall-area').total!.rawDeductions, area(33), 'raw opening areas');
  const top = calculation.records.find(item => item.output === 'net-wall-area' && item.readiness.wallFaceIds[0] === 'room-1:top')!;
  close(top.trace.contributions.find(item => item.openingId === 'door')!.raw, area(21), 'door area');
  close(top.trace.contributions.find(item => item.openingId === 'window')!.raw, area(12), 'window area');
  assert.deepEqual(output(calculation, 'opening-inventory').inventory, { door: 1, window: 1, 'floor-level-opening': 0 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:4174/');
  await expect(page.getByText('Shared quantity engine ready')).toBeVisible();
});
test('actual browser and Node independently satisfy all confirmed Q-001 answers and hashes', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const { node, browser } = await run(page);
  q001Answers(node, 'complete'); q001Answers(browser, 'complete');
  parity(node, browser); expect(errors).toEqual([]);
});
test('actual browser and Node retain Q-001 values as provisional for unconfirmed measurements', async ({ page }) => {
  const doc = q001();
  for (const room of doc.rooms) for (const field of ['length', 'width', 'ceilingHeight'] as const) {
    if (room[field].state === 'known') room[field].provenance.confirmation = { status: 'unconfirmed' };
  }
  for (const opening of doc.openings) for (const field of ['width', 'height', 'sillHeight'] as const) {
    if (opening[field].state === 'known') opening[field].provenance.confirmation = { status: 'unconfirmed' };
  }
  const { node, browser } = await run(page, doc);
  q001Answers(node, 'provisional'); q001Answers(browser, 'provisional'); parity(node, browser);
});
test('selected top wall independently gives 96 gross, 63 net and 9 baseboard in both runtimes', async ({ page }) => {
  const selected = request([
    { output: 'gross-wall-area', wallFaceIds: ['room-1:top'], wasteFraction: 0 },
    { output: 'net-wall-area', wallFaceIds: ['room-1:top'], wasteFraction: 0 },
    { output: 'baseboard', wallFaceIds: ['room-1:top'], wasteFraction: 0 },
  ]);
  const { node, browser } = await run(page, q001(), selected);
  for (const value of [node, browser]) {
    close(output(value.calculation, 'gross-wall-area').total!.net, area(96), 'selected gross');
    close(output(value.calculation, 'net-wall-area').total!.net, area(63), 'selected net');
    close(output(value.calculation, 'baseboard').total!.net, length(9), 'selected baseboard');
  }
  parity(node, browser);
  const netOnly = await run(page, q001(), request([selected.selections[1]]));
  for (const value of [netOnly.node, netOnly.browser]) {
    assert.equal(value.calculation.outputs.length, 1);
    close(output(value.calculation, 'net-wall-area').total!.net, area(63), 'net without separately requested gross');
  }
  parity(netOnly.node, netOnly.browser);
});
test('missing window height leaves 256 sqft partial walls, never a complete selected total', async ({ page }) => {
  const doc = q001(); doc.openings[1].height = unknownMeasurement('window height not measured');
  const { node, browser } = await run(page, doc);
  for (const value of [node, browser]) {
    close(output(value.calculation, 'floor-area').total!.net, area(120), 'available floor');
    close(output(value.calculation, 'gross-wall-area').total!.net, area(352), 'available gross walls');
    const net = output(value.calculation, 'net-wall-area');
    assert.equal(net.status, 'blocked'); assert.equal(net.completeness, 'partial');
    assert.equal(net.total, null); assert.ok(net.subtotal);
    close(net.subtotal.net, area(256), 'three-wall subtotal');
    assert.deepEqual(net.excludedTargetIds, ['wall:"room-1:top"']);
    assert.equal(net.includedTargetIds.length, 3);
  }
  parity(node, browser);
});
test('tolerance clipping and viewport independence agree in both runtimes without changing source', async ({ page }) => {
  const doc = q001(); doc.openings = [doc.openings[0]];
  doc.rooms[0].length = measured('1000 mm'); doc.openings[0].width = measured('200 mm');
  doc.openings[0].attachments[0].offsetMm = toMm(99.99, 'mm');
  const selected = request([{ output: 'baseboard', wallFaceIds: ['room-1:top'], wasteFraction: 0 }]);
  const first = await run(page, doc, selected);
  for (const value of [first.node, first.browser]) {
    close(output(value.calculation, 'baseboard').total!.net, 800.01, 'bounded floor run');
    assert.ok(value.calculation.records[0].trace.adjustments.some(item => item.code === 'BOUNDARY_INTERSECTION'));
  }
  parity(first.node, first.browser);
  doc.viewport = { zoom: 3, pan: { x: -1000, y: 1000 } };
  doc.rooms[0].presentation = { xMm: toMm(-999, 'mm'), yMm: toMm(1000, 'mm') };
  const changed = await run(page, doc, selected);
  assert.deepEqual(changed.node, first.node); assert.deepEqual(changed.browser, first.browser);
  doc.openings[0].attachments[0].offsetMm = toMm(99.989, 'mm');
  const invalid = await run(page, doc, selected);
  for (const value of [invalid.node, invalid.browser]) {
    assert.equal(output(value.calculation, 'baseboard').total, null);
    assert.equal(value.calculation.records[0].readiness.geometry.status, 'invalid');
  }
  parity(invalid.node, invalid.browser);
});
test('real browser captures frozen confirmed snapshots and rejects empty confirmed selection', async ({ page }) => {
  const doc = q001(), selected = request(allSelections(doc)), instance = { id: 'parity-capture', createdAt: AT, kind: 'confirmed' };
  const node = await createQuantitySnapshot(doc, selected, instance); assert.ok(node.ok);
  const browser = await page.evaluate(async ({ document, selection, metadata }) => {
    const result = await (window as any).mfpParity.snapshot(document, selection, metadata);
    if (!result.ok) return result;
    return { ...result, frozen: Object.isFrozen(result.snapshot) && Object.isFrozen(result.snapshot.sourceDocument.rooms[0])
      && Object.isFrozen(result.snapshot.evaluation.calculation.outputs),
      callerUnfrozen: !Object.isFrozen(document) };
  }, { document: doc, selection: selected, metadata: instance });
  assert.ok(browser.ok, JSON.stringify(browser)); assert.equal(browser.frozen, true); assert.equal(browser.callerUnfrozen, true);
  q001Answers(node.snapshot.evaluation, 'complete'); q001Answers(browser.snapshot.evaluation, 'complete');
  parity(node.snapshot.evaluation, browser.snapshot.evaluation);
  assert.equal(browser.snapshot.captureFingerprint, node.snapshot.captureFingerprint);
  const empty = await page.evaluate(async ({ document, metadata }) =>
    (window as any).mfpParity.snapshot(document, { policy: { version: 'rectangular-flat-v1', openingMeasureBasis: 'finished', crownFullHeightGaps: [] }, selections: [] }, metadata),
  { document: doc, metadata: instance });
  assert.equal(empty.ok, false); assert.equal(empty.errors[0].code, 'CONFIRMED_SNAPSHOT_UNAVAILABLE');
});
