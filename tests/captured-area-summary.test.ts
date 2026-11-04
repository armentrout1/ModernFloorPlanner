import assert from 'node:assert/strict';
import test from 'node:test';
import { upgradePhysicalDocumentToLevels } from '../shared/compatibility/levels';
import { createBuildingLevel } from '../shared/domain/levels';
import { unknownMeasurement } from '../shared/domain/measurements';
import { toMm2 } from '../shared/domain/units';
import { buildCapturedAreaSummary, type CapturedAreaScope } from '../shared/exports/capturedAreaSummary';
import { canonicalJson } from '../shared/quantities/canonicalJson';
import { createAreaSummaryRequest, type AreaSummaryOutput } from '../shared/quantities/summary';
import { createQuantitySnapshot } from '../shared/quantities/snapshot';
import { q001, room, request, AT } from './fixtures/physical';

async function capture(document = q001(), selected = createAreaSummaryRequest(document)) {
  const result = await createQuantitySnapshot(document, selected,
    { id: 'captured-area-report', createdAt: AT, kind: 'evaluation' });
  assert.ok(result.ok, JSON.stringify(result));
  return result.snapshot;
}

function value(summary: ReturnType<typeof buildCapturedAreaSummary>, scope: CapturedAreaScope,
  scopeId: string, output: AreaSummaryOutput) {
  const row = summary.rows.find(item => item.scope === scope && item.scopeId === scopeId && item.output === output);
  assert.ok(row, `${scope}/${scopeId}/${output}`);
  return row;
}

function supported() {
  const confirmation = { status: 'confirmed' as const, confirmedAt: AT };
  return {
    ceiling: { value: 'flat' as const, source: 'manual' as const, confirmation },
    walls: { value: 'vertical-uniform' as const, source: 'manual' as const, confirmation },
    crownPath: { value: 'rectangular-horizontal' as const, source: 'manual' as const, confirmation },
  };
}

function building() {
  const document = upgradePhysicalDocumentToLevels(q001(), 'basement');
  document.buildingLevels.levels[0] = createBuildingLevel('basement', 'Basement', 0);
  document.buildingLevels.roomLevels['room-1'] = 'basement';
  const main = room('main-room'); main.name = 'Main floor room';
  document.rooms.push(main);
  document.calculationContract.rooms['room-1'] = supported();
  document.calculationContract.rooms['main-room'] = supported();
  document.buildingLevels.levels.push(createBuildingLevel('main', 'Main floor', 1));
  document.buildingLevels.roomLevels['main-room'] = 'main';
  return document;
}

test('captured project, level and room groups use only immutable selected records', async () => {
  const document = building();
  const snapshot = await capture(document);
  const before = canonicalJson(snapshot);
  const summary = buildCapturedAreaSummary(snapshot.sourceDocument, snapshot.evaluation.calculation);
  assert.deepEqual(summary.selectedRoomIds, ['room-1', 'main-room']);
  assert.deepEqual(summary.selectedOutputs, ['floor-area', 'ceiling-area', 'gross-wall-area']);
  assert.equal(value(summary, 'project', 'captured-area-project', 'floor-area').totalMm2, toMm2(240, 'ft'));
  assert.equal(value(summary, 'level', 'basement', 'floor-area').totalMm2, toMm2(120, 'ft'));
  assert.equal(value(summary, 'level', 'main', 'floor-area').totalMm2, toMm2(120, 'ft'));
  assert.equal(value(summary, 'room', 'room-1', 'gross-wall-area').totalMm2! > 0, true);
  assert.equal(canonicalJson(snapshot), before);
});

test('captured selection never expands to another modeled room or unselected output', async () => {
  const document = q001(); document.rooms.push(room('unselected-room'));
  const snapshot = await capture(document, request([
    { output: 'floor-area', roomIds: ['room-1'], wasteFraction: 0 },
  ]));
  const summary = buildCapturedAreaSummary(snapshot.sourceDocument, snapshot.evaluation.calculation);
  assert.deepEqual(summary.selectedRoomIds, ['room-1']);
  assert.deepEqual(summary.selectedOutputs, ['floor-area']);
  assert.equal(value(summary, 'project', 'captured-area-project', 'floor-area').totalMm2, toMm2(120, 'ft'));
  assert.equal(summary.rows.some(row => row.scopeId === 'unselected-room'), false);
  assert.equal(summary.rows.some(row => row.output === 'ceiling-area'), false);
});

test('missing selected targets yield an honest partial subtotal and unavailable level', async () => {
  const document = building();
  document.rooms[1].width = unknownMeasurement('Width not measured');
  const snapshot = await capture(document);
  const summary = buildCapturedAreaSummary(snapshot.sourceDocument, snapshot.evaluation.calculation);
  const project = value(summary, 'project', 'captured-area-project', 'floor-area');
  assert.equal(project.status, 'partial');
  assert.equal(project.totalMm2, null);
  assert.equal(project.subtotalMm2, toMm2(120, 'ft'));
  assert.deepEqual(project.includedTargetIds, ['room:"room-1"']);
  assert.deepEqual(project.excludedTargetIds, ['room:"main-room"']);
  const main = value(summary, 'level', 'main', 'floor-area');
  assert.equal(main.status, 'unavailable');
  assert.equal(main.totalMm2, null);
  assert.equal(main.subtotalMm2, null);
});

test('historical captures use a neutral level and altered source bytes are never recalculated', async () => {
  const original = await capture();
  const snapshot = structuredClone(original);
  snapshot.sourceDocument.rooms[0].length = { ...snapshot.sourceDocument.rooms[0].length,
    valueMm: 99 * 304.8 } as typeof snapshot.sourceDocument.rooms[0]['length'];
  const before = canonicalJson(snapshot);
  const summary = buildCapturedAreaSummary(snapshot.sourceDocument, snapshot.evaluation.calculation);
  assert.equal(value(summary, 'level', 'historical-unassigned', 'floor-area').scopeLabel, 'Historical / unassigned');
  assert.equal(value(summary, 'project', 'captured-area-project', 'floor-area').totalMm2, toMm2(120, 'ft'));
  assert.equal(canonicalJson(snapshot), before);
});
