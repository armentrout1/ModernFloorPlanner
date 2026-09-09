import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { physicalDocumentV3Schema, physicalDocumentV4Schema, type PhysicalDocumentV4 } from '../shared/domain/document';
import { createStairAssembly, createSurfaceOpening, type StairPlacement } from '../shared/domain/stairs';
import { validateStairGeometry, stairEndpointBounds, placementBounds } from '../shared/domain/stairGeometry';
import { upgradePhysicalDocumentToStairs } from '../shared/compatibility/stairs';
import { upgradePhysicalDocumentToLevels } from '../shared/compatibility/levels';
import { adaptMeasurementDocument } from '../shared/compatibility/legacyDocument';
import { calculateQuantities } from '../shared/quantities/engine';
import { evaluateQuantities, createQuantitySnapshot, verifyQuantitySnapshot, quantitySnapshotSchema } from '../shared/quantities/snapshot';
import { calculationSchema } from '../shared/quantities/result';
import { canonicalJson } from '../shared/quantities/canonicalJson';
import { QUANTITY_POLICY_VERSION_V4, type QuantityRequest } from '../shared/quantities/policy';
import { createProposedRoomApplicability, APPLICABILITY_FIELDS } from '../shared/domain/applicability';
import { unknownMeasurement } from '../shared/domain/measurements';
import { toMm } from '../shared/domain/units';
import { createBuildingLevel } from '../shared/domain/levels';
import { q001, room, measured, freezeDeep, AT } from './fixtures/physical';

function profile() {
  const value = createProposedRoomApplicability();
  for (const field of APPLICABILITY_FIELDS) value[field].confirmation = { status: 'confirmed', confirmedAt: AT };
  return value;
}
function placement(x = '1 ft', y = '1 ft', rotation: StairPlacement['rotation'] = 0): StairPlacement {
  return { anchor: 'room-local-top-left', x: measured(x, true, 'elevation'), y: measured(y, true, 'elevation'), rotation };
}
function building(): PhysicalDocumentV4 {
  const base = q001(); base.openings = [];
  base.quantityPolicyVersion = 'rectangular-flat-v2';
  base.calculationContract = { version: 'room-applicability-v1', rooms: { 'room-1': profile() } };
  base.editorContract = { version: 'sketch-editor-v1', groups: [] };
  const levels = upgradePhysicalDocumentToLevels(base, 'basement');
  levels.buildingLevels.levels[0] = createBuildingLevel('basement', 'Basement', 0);
  levels.buildingLevels.levels.push(createBuildingLevel('main', 'Main floor', 1));
  const upper = room('room-2'); upper.length = measured('15 ft'); upper.ceilingHeight = measured('9 ft');
  levels.rooms.push(upper); levels.calculationContract.rooms['room-2'] = profile();
  levels.buildingLevels.roomLevels['room-2'] = 'main';
  return upgradePhysicalDocumentToStairs(levels);
}
function addStair(document: PhysicalDocumentV4, reviewed = true) {
  const stair = createStairAssembly('stair', 'Synthetic straight stair');
  stair.width = measured('3 ft'); stair.run = measured('8 ft');
  stair.endpoints.lower = { state: 'modeled', levelId: 'basement', roomId: 'room-1', placement: placement() };
  stair.endpoints.upper = { state: 'modeled', levelId: 'main', roomId: 'room-2', placement: placement() };
  stair.landings.lower = { id: 'landing', width: measured('3 ft'), depth: measured('3 ft'), placement: placement('1 ft', '5 ft') };
  if (reviewed) for (const role of ['lower', 'upper'] as const) for (const surface of ['floor', 'ceiling'] as const)
    stair.surfaceImpacts[role][surface] = { state: 'no-deduction' };
  document.stairsContract.stairs.push(stair);
  return stair;
}
function addHole(document: PhysicalDocumentV4, id = 'void') {
  const opening = createSurfaceOpening(id, 'room-2', 'floor');
  opening.width = measured('3 ft'); opening.length = measured('6 ft');
  opening.attachments[0].placement = placement();
  document.stairsContract.surfaceOpenings.push(opening);
  return opening;
}
function request(document: PhysicalDocumentV4, roomIds = document.rooms.map(room => room.id), waste = 0): QuantityRequest {
  return { policy: { version: QUANTITY_POLICY_VERSION_V4, openingMeasureBasis: 'finished', crownFullHeightGaps: [] },
    selections: [
      { output: 'floor-area', roomIds, wasteFraction: waste },
      { output: 'ceiling-area', roomIds, wasteFraction: 0 },
      { output: 'gross-wall-area', wallFaceIds: document.rooms.filter(room => roomIds.includes(room.id)).flatMap(room => room.wallFaces.map(wall => wall.id)), wasteFraction: 0 },
    ] };
}
function calculation(document: PhysicalDocumentV4, selected = request(document)) {
  const result = calculateQuantities(document, selected); assert.ok(result.ok, JSON.stringify(result)); return result.calculation;
}
const sqft = (value: number) => value / (304.8 * 304.8);
const near = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-9, actual + ' expected ' + expected);
function area(document: PhysicalDocumentV4, output: string, selected = request(document)) {
  return calculation(document, selected).outputs.find(item => item.output === output)!;
}
async function evaluated(document: PhysicalDocumentV4, selected = request(document)) {
  const result = await evaluateQuantities(document, selected); assert.ok(result.ok, JSON.stringify(result)); return result.evaluation;
}
const metadata = { id: 'stair-capture', createdAt: AT, kind: 'confirmed' as const };

test('M3D stairs schema4 rejects reused identities, stale endpoints, same-level connections and duplicate exact surface attachments', () => {
  const valid = building(), stair = addStair(valid), hole = addHole(valid); hole.associatedStairId = stair.id;
  stair.surfaceImpacts.upper.floor = { state: 'deduct', openingIds: [hole.id] };
  const before = canonicalJson(valid); assert.equal(physicalDocumentV4Schema.safeParse(freezeDeep(valid)).success, true);
  const invalid: Array<[string, (value: any) => void]> = [
    ['same levels', d => { d.stairsContract.stairs[0].endpoints.upper = structuredClone(d.stairsContract.stairs[0].endpoints.lower); }],
    ['wrong room ownership', d => d.stairsContract.stairs[0].endpoints.upper.levelId = 'basement'],
    ['missing host room', d => d.stairsContract.stairs[0].endpoints.upper.roomId = 'ghost'],
    ['reused stair ID', d => d.stairsContract.stairs[0].id = 'room-1'],
    ['reused landing ID', d => d.stairsContract.stairs[0].landings.lower.id = 'stair'],
    ['reused hole ID', d => d.stairsContract.surfaceOpenings[0].id = 'landing'],
    ['missing associated stair', d => d.stairsContract.surfaceOpenings[0].associatedStairId = 'ghost'],
    ['duplicate attachment', d => d.stairsContract.surfaceOpenings[0].attachments.push(structuredClone(d.stairsContract.surfaceOpenings[0].attachments[0]))],
    ['deduction wrong surface', d => d.stairsContract.stairs[0].surfaceImpacts.upper.ceiling = { state: 'deduct', openingIds: ['void'] }],
    ['missing deduction ID', d => d.stairsContract.stairs[0].surfaceImpacts.upper.floor.openingIds = ['ghost']],
    ['unresolved landing host', d => d.stairsContract.stairs[0].endpoints.lower = { state: 'unresolved', reason: 'Not modeled' }],
    ['unsupported rotation', d => d.stairsContract.stairs[0].endpoints.lower.placement.rotation = 45],
    ['future contract', d => d.stairsContract.version = 'straight-stairs-v2'],
    ['future schema', d => d.schemaVersion = 5],
  ];
  for (const [label, mutate] of invalid) {
    const value = structuredClone(valid); mutate(value);
    assert.equal(physicalDocumentV4Schema.safeParse(value).success, false, label);
  }
  assert.equal(canonicalJson(valid), before);
  assert.equal(physicalDocumentV3Schema.safeParse(valid).success, false);
  assert.equal(adaptMeasurementDocument(valid).status, 'unsupported-version');
});

test('M3D stair upgrade preserves current schema3 values, originals, ownership, profiles and old captures without mutation', async () => {
  const prior = JSON.parse(readFileSync(new URL('./fixtures/m3d-v3-snapshot.json', import.meta.url), 'utf8'));
  const current = prior.sourceDocument; current.rooms[0].name = 'Current room name';
  const before = canonicalJson(current), next = upgradePhysicalDocumentToStairs(freezeDeep(current));
  assert.equal(next.schemaVersion, 4); assert.equal(next.quantityPolicyVersion, QUANTITY_POLICY_VERSION_V4);
  assert.deepEqual(next.rooms, current.rooms); assert.deepEqual(next.openings, current.openings);
  assert.deepEqual(next.buildingLevels, current.buildingLevels);
  assert.deepEqual(next.calculationContract, current.calculationContract);
  assert.deepEqual(next.stairsContract, { version: 'straight-stairs-v1', stairs: [], surfaceOpenings: [] });
  next.rooms[0].name = 'Different copy'; assert.equal(canonicalJson(current), before);
  assert.throws(() => upgradePhysicalDocumentToStairs(next), /schema3/);
});

test('M3D unresolved destinations and missing stair rise remain explicit without inventing elevations or blocking independent reviewed finishes', () => {
  const document = building(), stair = addStair(document);
  stair.endpoints.upper = { state: 'unresolved', reason: 'The upper destination is not modeled yet' };
  stair.surfaceImpacts.upper.floor = { state: 'unresolved', reason: 'Destination not modeled' };
  assert.equal(physicalDocumentV4Schema.safeParse(document).success, true);
  const report = validateStairGeometry(document);
  assert.ok(report.checks.some(check => check.code === 'STAIR_DESTINATION_UNMODELED'));
  assert.ok(report.checks.some(check => check.code === 'STAIR_RISE_UNKNOWN'));
  assert.equal(calculation(document).status, 'complete');
  for (const level of document.buildingLevels.levels) assert.equal(level.finishedFloorElevation.valueMm, null);
  document.rooms[0].ceilingHeight = measured('10 ft');
  assert.equal(stair.totalRise.state, 'unknown');
});

test('M3D run excludes independent landings and 90-degree endpoint rotation retains room-local anchors', () => {
  const document = building(), stair = addStair(document);
  const expected = [8, 3];
  for (const rotation of [0, 90, 180, 270] as const) {
    assert.equal(stair.endpoints.lower.state, 'modeled');
    if (stair.endpoints.lower.state !== 'modeled') throw Error('Fixture');
    stair.endpoints.lower.placement.rotation = rotation;
    const bounds = stairEndpointBounds(stair, 'lower')!;
    near(bounds.x / 304.8, 1); near(bounds.y / 304.8, 1);
    near(bounds.width / 304.8, rotation === 90 || rotation === 270 ? expected[1] : expected[0]);
    near(bounds.height / 304.8, rotation === 90 || rotation === 270 ? expected[0] : expected[1]);
    const landing = placementBounds(stair.landings.lower!.width, stair.landings.lower!.depth, stair.landings.lower!.placement)!;
    near(landing.width / 304.8, 3);
  }
  near(area(document, 'floor-area').total!.net / (304.8 * 304.8), 270);
});

test('M3D unresolved impacts block only affected selected net surfaces and preserve complete gross basis', () => {
  const document = building(), stair = addStair(document, false);
  const pending = calculation(document);
  assert.equal(pending.outputs.find(row => row.output === 'floor-area')!.total, null);
  near(sqft(pending.outputs.find(row => row.output === 'floor-area')!.grossBasis!), 270);
  assert.equal(pending.outputs.find(row => row.output === 'floor-area')!.grossBasisStatus, 'complete');
  near(sqft(pending.outputs.find(row => row.output === 'gross-wall-area')!.total!.net), 802);
  for (const role of ['lower', 'upper'] as const) for (const surface of ['floor', 'ceiling'] as const)
    stair.surfaceImpacts[role][surface] = { state: 'no-deduction' };
  stair.surfaceImpacts.upper.floor = { state: 'unresolved', reason: 'Upper-floor finish not reviewed' };
  const result = calculation(document);
  assert.equal(result.outputs.find(row => row.output === 'floor-area')!.completeness, 'partial');
  near(sqft(result.outputs.find(row => row.output === 'floor-area')!.subtotal!.net), 120);
  near(sqft(result.outputs.find(row => row.output === 'ceiling-area')!.total!.net), 270);
  assert.equal(calculation(document, request(document, ['room-1'])).status, 'complete');
});

test('M3D explicit upper floor and lower ceiling 18 square-foot openings deduct once and apply floor waste after net', () => {
  const document = building(), stair = addStair(document);
  near(sqft(area(document, 'floor-area').total!.net), 270); near(sqft(area(document, 'ceiling-area').total!.net), 270);
  const hole = addHole(document); hole.associatedStairId = stair.id;
  stair.surfaceImpacts.upper.floor = { state: 'deduct', openingIds: [hole.id] };
  near(sqft(area(document, 'floor-area', request(document, ['room-2'])).total!.net), 132);
  near(sqft(area(document, 'floor-area', request(document, ['room-1'])).total!.net), 120);
  near(sqft(area(document, 'floor-area').total!.net), 252);
  near(sqft(area(document, 'ceiling-area').total!.net), 270);
  near(sqft(area(document, 'gross-wall-area').total!.net), 802);
  hole.attachments.push({ roomId: 'room-1', surface: 'ceiling', placement: placement() });
  stair.surfaceImpacts.lower.ceiling = { state: 'deduct', openingIds: [hole.id] };
  near(sqft(area(document, 'ceiling-area', request(document, ['room-1'])).total!.net), 102);
  near(sqft(area(document, 'ceiling-area', request(document, ['room-2'])).total!.net), 150);
  near(sqft(area(document, 'ceiling-area').total!.net), 252);
  const floor = area(document, 'floor-area', request(document, undefined, .1));
  near(sqft(floor.total!.gross), 270); near(sqft(floor.total!.effectiveDeductions), 18);
  near(sqft(floor.total!.allowance), 25.2); near(sqft(floor.total!.adjusted), 277.2);
  const record = calculation(document).records.find(record => record.output === 'floor-area' && record.readiness.roomIds[0] === 'room-2')!;
  assert.deepEqual(record.trace.surfaceContributions!.map(row => [row.openingId, row.roomId, row.surface]), [['void', 'room-2', 'floor']]);
  assert.equal(record.trace.contributions.length, 0);
});

test('M3D overlapping independent rectangular holes use exact coverage union and no-deduction impact never hides explicit attached holes', () => {
  const document = building(); addStair(document); addHole(document);
  const second = addHole(document, 'void-2'); second.attachments[0].placement = placement('2 ft', '1 ft');
  const row = calculation(document).records.find(row => row.output === 'floor-area' && row.readiness.roomIds[0] === 'room-2')!;
  near(sqft(row.amounts!.rawDeductions), 36); near(sqft(row.amounts!.effectiveDeductions), 24);
  near(sqft(row.trace.overlapAdjustment), 12);
  assert.ok(row.trace.adjustments.some(adjustment => adjustment.code === 'COVERAGE_UNION' && adjustment.unit === 'mm2'));
  near(sqft(area(document, 'floor-area').total!.net), 246);
  second.attachments[0].placement = placement('4.000001 ft', '1 ft');
  near(sqft(area(document, 'floor-area').total!.effectiveDeductions), 36);
});

test('M3D invalid or unresolved surface measurements keep affected gross and leave other surfaces/walls usable without clamping', () => {
  const document = building(); addStair(document); const hole = addHole(document);
  for (const mutate of [
    () => { hole.width = unknownMeasurement('Width pending'); },
    () => { hole.width = measured('3 ft'); hole.attachments[0].placement = placement('0 mm', '1 ft'); },
    () => { hole.attachments[0].placement = placement('13 ft', '1 ft'); },
    () => { hole.attachments[0].placement = placement(); hole.geometry = 'unsupported'; hole.detail = 'Irregular edge cut'; },
  ]) {
    mutate(); const before = canonicalJson(document), result = calculation(document);
    const floor = result.outputs.find(row => row.output === 'floor-area')!;
    assert.equal(floor.total, null); near(sqft(floor.grossBasis!), 270); near(sqft(floor.subtotal!.net), 120);
    near(sqft(result.outputs.find(row => row.output === 'ceiling-area')!.total!.net), 270);
    near(sqft(result.outputs.find(row => row.output === 'gross-wall-area')!.total!.net), 802);
    assert.equal(canonicalJson(document), before);
  }
});

test('M3D invalid stair/landing fit remains visible but does not fabricate or block an independent known surface area', () => {
  const document = building(), stair = addStair(document); addHole(document);
  stair.run = measured('20 ft'); stair.landings.lower!.depth = measured('20 ft');
  const report = validateStairGeometry(document);
  assert.ok(report.checks.some(check => check.code === 'STAIR_ENDPOINT_FIT' && check.status === 'invalid'));
  assert.ok(report.checks.some(check => check.code === 'LANDING_FIT' && check.status === 'invalid'));
  near(sqft(area(document, 'floor-area').total!.net), 252);
  assert.equal(stair.totalRise.state, 'unknown');
});

test('M3D unconfirmed opening measurements retain provisional net and prevent confirmed snapshot while gross remains independently confirmed', async () => {
  const document = building(); addStair(document); const hole = addHole(document);
  hole.width = measured('3 ft', false);
  const floor = area(document, 'floor-area');
  assert.equal(floor.status, 'provisional'); assert.equal(floor.grossBasisStatus, 'complete');
  near(sqft(floor.total!.net), 252);
  assert.equal((await createQuantitySnapshot(document, request(document), metadata)).ok, false);
  if (hole.width.state !== 'known') throw Error('Fixture');
  hole.width.provenance.confirmation = { status: 'needs-review' };
  assert.equal(area(document, 'floor-area').total, null);
});

test('M3D narrow numerical gaps are not bridged and extreme lost extents fail without a usable net', () => {
  const document = building(); const hole = addHole(document);
  hole.width = measured('0.001 mm'); hole.length = measured('0.001 mm');
  hole.attachments[0].placement = placement('0.001 mm', '0.001 mm');
  const value = area(document, 'floor-area');
  assert.equal(value.status, 'complete'); assert.ok(value.total!.effectiveDeductions > 0);
  document.rooms[1].length = measured('1000000000000000 mm');
  document.rooms[1].width = measured('1 mm');
  hole.width = measured('0.3 mm'); hole.length = measured('0.1 mm');
  hole.attachments[0].placement = placement('900000000000000 mm', '0.1 mm');
  assert.equal(area(document, 'floor-area').total, null);
  assert.ok(validateStairGeometry(document).checks.some(check => check.status === 'invalid'));
});

test('M3D fingerprints bind stair connections, geometry, impacts and evidence while labels/order/camera are presentation', async () => {
  const document = building(), stair = addStair(document), hole = addHole(document);
  const baseline = await evaluated(document);
  const preserved = structuredClone(document);
  stair.run = measured('7 ft');
  const run = await evaluated(document);
  assert.notEqual(run.fingerprints.geometry, baseline.fingerprints.geometry);
  assert.notEqual(run.fingerprints.content, baseline.fingerprints.content);
  assert.deepEqual(run.calculation.outputs, baseline.calculation.outputs);
  document.stairsContract = structuredClone(preserved.stairsContract);
  document.stairsContract.stairs[0].name = 'Renamed stair';
  document.stairsContract.surfaceOpenings[0].name = 'Renamed surface hole';
  document.buildingLevels.levels.reverse();
  document.buildingLevels.levels.forEach((level, index) => { level.displayOrder = index; level.name += ' renamed'; });
  document.rooms[0].presentation = { xMm: toMm(5000, 'mm'), yMm: toMm(-2000, 'mm') };
  document.metadata = { activeLevel: 'main', scale: 2 };
  assert.deepEqual((await evaluated(document)).fingerprints, baseline.fingerprints);
  const source = await createQuantitySnapshot(preserved, request(preserved), metadata); assert.ok(source.ok);
  const named = await createQuantitySnapshot(document, request(document), metadata); assert.ok(named.ok);
  assert.notEqual(source.snapshot.captureFingerprint, named.snapshot.captureFingerprint);
  const measurement = document.stairsContract.stairs[0].run;
  assert.equal(measurement.state, 'known');
  if (measurement.state === 'known') measurement.provenance.confirmation = { status: 'unconfirmed' };
  const evidence = await evaluated(document);
  assert.equal(evidence.fingerprints.geometry, baseline.fingerprints.geometry);
  assert.notEqual(evidence.fingerprints.content, baseline.fingerprints.content);
});

test('M3D stair snapshots capture synchronously, detach, verify integrity and reject incompatible old policies/results', async () => {
  const document = building(); addStair(document); const hole = addHole(document);
  const selected = request(document), pending = createQuantitySnapshot(document, selected, metadata);
  hole.width = measured('4 ft');
  const capture = await pending; assert.ok(capture.ok, JSON.stringify(capture));
  assert.equal(capture.snapshot.snapshotSchemaVersion, 'quantity-snapshot-v4');
  assert.equal(capture.snapshot.evaluation.calculation.schemaVersion, 'quantity-result-v4');
  assert.equal(capture.snapshot.evaluation.calculation.engineVersion, 'rectangular-engine-v4');
  assert.deepEqual(await verifyQuantitySnapshot(capture.snapshot), { ok: true });
  const snapshot = capture.snapshot;
  if (snapshot.sourceDocument.schemaVersion !== 4) throw Error('Fixture');
  assert.equal(Object.isFrozen(snapshot.sourceDocument.stairsContract.surfaceOpenings), true);
  near(snapshot.sourceDocument.stairsContract.surfaceOpenings[0].width.valueMm! / 304.8, 3);
  const tampered = structuredClone(snapshot); tampered.sourceDocument.stairsContract.surfaceOpenings[0].width = measured('4 ft');
  assert.equal((await verifyQuantitySnapshot(tampered)).ok, false);
  const old = structuredClone(selected); old.policy.version = 'rectangular-flat-v3';
  assert.equal(calculateQuantities(document, old).ok, false);
  const badResult = structuredClone(snapshot.evaluation.calculation); badResult.engineVersion = 'rectangular-engine-v3';
  assert.equal(calculationSchema.safeParse(badResult).success, false);
  const badSnapshot = structuredClone(snapshot); badSnapshot.snapshotSchemaVersion = 'quantity-snapshot-v3';
  assert.equal(quantitySnapshotSchema.safeParse(badSnapshot).success, false);
});

test('M3D frozen historical v1/v2/v3 snapshot bytes and calculation hashes remain identical', async () => {
  for (const filename of ['m3b-v1-snapshot.json', 'm3d-v2-snapshot.json', 'm3d-v3-snapshot.json']) {
    const historical = JSON.parse(readFileSync(new URL('./fixtures/' + filename, import.meta.url), 'utf8'));
    assert.deepEqual(await verifyQuantitySnapshot(historical), { ok: true }, filename);
    const rebuilt = await createQuantitySnapshot(historical.sourceDocument, historical.evaluation.calculation.request,
      historical.instance, historical.measurementEvents);
    assert.ok(rebuilt.ok, filename); assert.equal(canonicalJson(rebuilt.snapshot), canonicalJson(historical), filename);
    assert.equal(Object.hasOwn(rebuilt.snapshot.evaluation.calculation.source, 'stairContent'), false);
    for (const row of rebuilt.snapshot.evaluation.calculation.records) assert.equal(Object.hasOwn(row, 'grossBasis'), false);
  }
});
