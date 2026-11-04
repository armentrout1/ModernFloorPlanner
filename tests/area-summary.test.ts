import assert from 'node:assert/strict';
import test from 'node:test';
import { createBuildingLevel } from '../shared/domain/levels';
import { unknownMeasurement } from '../shared/domain/measurements';
import { toMm2 } from '../shared/domain/units';
import { upgradePhysicalDocumentToLayout } from '../shared/compatibility/layout';
import { upgradePhysicalDocumentToLevels } from '../shared/compatibility/levels';
import { upgradePhysicalDocumentToStairs } from '../shared/compatibility/stairs';
import { calculateAreaSummary, type AreaSummaryGroup, type AreaSummaryOutput } from '../shared/quantities/summary';
import { q001, room, AT } from './fixtures/physical';

function value(group: AreaSummaryGroup, output: AreaSummaryOutput) {
  const found = group.values.find(item => item.output === output);
  assert.ok(found);
  return found;
}

function supported() {
  const confirmed = { status: 'confirmed' as const, confirmedAt: AT };
  return {
    ceiling: { value: 'flat' as const, source: 'manual' as const, confirmation: confirmed },
    walls: { value: 'vertical-uniform' as const, source: 'manual' as const, confirmation: confirmed },
    crownPath: { value: 'rectangular-horizontal' as const, source: 'manual' as const, confirmation: confirmed },
  };
}

function multiLevel() {
  const document = upgradePhysicalDocumentToLevels(q001(), 'basement');
  document.buildingLevels.levels[0] = createBuildingLevel('basement', 'Basement', 0);
  document.buildingLevels.roomLevels['room-1'] = 'basement';
  const main = room('main-room'); main.name = 'Main room';
  document.rooms.push(main);
  document.calculationContract.rooms['room-1'] = supported();
  document.calculationContract.rooms['main-room'] = supported();
  document.buildingLevels.levels.push(createBuildingLevel('main', 'Main floor', 1));
  document.buildingLevels.roomLevels['main-room'] = 'main';
  return document;
}

test('schema-2 calculator uses one canonical engine result and a neutral historical level', () => {
  const result = calculateAreaSummary(q001());
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.summary.rooms.length, 1);
  assert.equal(result.summary.levels[0].label, 'Historical / unassigned');
  assert.equal(value(result.summary.project, 'floor-area').totalMm2, toMm2(120, 'ft'));
  assert.equal(value(result.summary.project, 'ceiling-area').totalMm2, toMm2(120, 'ft'));
  assert.ok(Math.abs(value(result.summary.project, 'gross-wall-area').totalMm2! - toMm2(352, 'ft')) < 1e-6);
  assert.equal(value(result.summary.project, 'floor-area').status, 'complete');
});

test('room, level and project rollups retain document and display order', () => {
  const document = multiLevel(), before = structuredClone(document);
  const result = calculateAreaSummary(document);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(document, before);
  assert.deepEqual(result.summary.levels.map(level => level.label), ['Basement', 'Main floor']);
  assert.deepEqual(result.summary.rooms.map(room => room.id), ['room-1', 'main-room']);
  for (const level of result.summary.levels) assert.equal(value(level, 'floor-area').totalMm2, toMm2(120, 'ft'));
  const project = value(result.summary.project, 'floor-area');
  assert.equal(project.status, 'complete');
  assert.equal(project.totalMm2, toMm2(240, 'ft'));
  assert.equal(project.completeRoomCount, 2);
  assert.equal(project.incompleteRoomCount, 0);
});

test('schema 3 through 5 retain the same supported area-summary semantics', () => {
  const schema3 = multiLevel();
  const schema4 = upgradePhysicalDocumentToStairs(schema3);
  const schema5 = upgradePhysicalDocumentToLayout(schema4);
  for (const document of [schema3, schema4, schema5]) {
    const result = calculateAreaSummary(document);
    assert.equal(result.ok, true);
    if (!result.ok) continue;
    assert.deepEqual(result.summary.levels.map(level => level.label), ['Basement', 'Main floor']);
    assert.equal(value(result.summary.project, 'floor-area').totalMm2, toMm2(240, 'ft'));
    assert.equal(value(result.summary.project, 'ceiling-area').totalMm2, toMm2(240, 'ft'));
    assert.equal(value(result.summary.project, 'gross-wall-area').status, 'complete');
  }
});

test('an incomplete room yields an explicit subtotal and never a false project total', () => {
  const document = multiLevel();
  document.rooms[1].width = unknownMeasurement('Width has not been measured.');
  const result = calculateAreaSummary(document);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  const project = value(result.summary.project, 'floor-area');
  assert.equal(project.status, 'partial');
  assert.equal(project.totalMm2, null);
  assert.equal(project.subtotalMm2, toMm2(120, 'ft'));
  assert.equal(project.completeRoomCount, 1);
  assert.equal(project.incompleteRoomCount, 1);
  const main = value(result.summary.levels[1], 'floor-area');
  assert.equal(main.status, 'unavailable');
  assert.equal(main.totalMm2, null);
  assert.equal(main.subtotalMm2, null);
});
