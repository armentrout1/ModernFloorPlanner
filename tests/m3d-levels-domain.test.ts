import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { physicalDocumentSchema, physicalDocumentV3Schema, supportedPhysicalDocumentSchema,
  type PhysicalDocumentV2, type PhysicalDocumentV3 } from '../shared/domain/document';
import { buildingLevelsSchema, createBuildingLevel, createBuildingLevels } from '../shared/domain/levels';
import { APPLICABILITY_FIELDS, createProposedRoomApplicability, createUnknownRoomApplicability } from '../shared/domain/applicability';
import { upgradePhysicalDocumentToLevels } from '../shared/compatibility/levels';
import { adaptMeasurementDocument } from '../shared/compatibility/legacyDocument';
import { upgradePhysicalDraft } from '../shared/compatibility/physicalDraft';
import { applyMeasurementAction } from '../shared/domain/measurementActions';
import { toMm } from '../shared/domain/units';
import { calculateQuantities } from '../shared/quantities/engine';
import { QUANTITY_POLICY_VERSION_V2, QUANTITY_POLICY_VERSION_V3, type QuantityRequest } from '../shared/quantities/policy';
import { calculationSchema } from '../shared/quantities/result';
import { createQuantitySnapshot, evaluateQuantities, verifyQuantitySnapshot, quantitySnapshotSchema } from '../shared/quantities/snapshot';
import { canonicalJson } from '../shared/quantities/canonicalJson';
import { projectPhysicalRooms } from '../client/src/features/physical-draft/projection';
import { findPhysicalWall } from '../client/src/features/physical-draft/openingGeometry';
import { q001, room, measured, AT, freezeDeep } from './fixtures/physical';

function profile() {
  const value = createProposedRoomApplicability();
  for (const field of APPLICABILITY_FIELDS) value[field].confirmation = { status: 'confirmed', confirmedAt: AT };
  return value;
}
function source(): PhysicalDocumentV2 {
  const document = q001();
  assert.equal(document.schemaVersion, 2);
  document.quantityPolicyVersion = QUANTITY_POLICY_VERSION_V2;
  document.calculationContract = { version: 'room-applicability-v1', rooms: { 'room-1': profile() } };
  document.editorContract = { version: 'sketch-editor-v1', groups: [] };
  return document as PhysicalDocumentV2;
}
function levels(): PhysicalDocumentV3 {
  const document = upgradePhysicalDocumentToLevels(source(), 'basement');
  document.buildingLevels.levels[0] = createBuildingLevel('basement', 'Basement', 0);
  document.buildingLevels.levels.push(createBuildingLevel('main', 'Main floor', 1), createBuildingLevel('upper', 'Upper floor', 2));
  const main = room('room-2'); main.length = measured('15 ft'); main.ceilingHeight = measured('9 ft');
  document.rooms.push(main);
  document.calculationContract.rooms[main.id] = profile();
  document.buildingLevels.roomLevels[main.id] = 'main';
  return document;
}
function work(document: PhysicalDocumentV3, roomIds = document.rooms.map(room => room.id)): QuantityRequest {
  return { policy: { version: QUANTITY_POLICY_VERSION_V3, openingMeasureBasis: 'finished', crownFullHeightGaps: [] },
    selections: [
      { output: 'floor-area', roomIds, wasteFraction: 0 },
      { output: 'ceiling-area', roomIds, wasteFraction: 0 },
      { output: 'gross-wall-area', wallFaceIds: document.rooms.filter(room => roomIds.includes(room.id)).flatMap(room => room.wallFaces.map(wall => wall.id)), wasteFraction: 0 },
    ] };
}
function calc(document: PhysicalDocumentV3, request = work(document)) {
  const result = calculateQuantities(document, request);
  assert.ok(result.ok, JSON.stringify(result));
  return result.calculation;
}
async function evaluation(document: PhysicalDocumentV3, request = work(document)) {
  const result = await evaluateQuantities(document, request);
  assert.ok(result.ok, JSON.stringify(result));
  return result.evaluation;
}
const meta = { id: 'm3d-capture', createdAt: AT, kind: 'confirmed' as const };
const squareFeet = (value: number) => value / (304.8 * 304.8);
function assertAreas(document: PhysicalDocumentV3, request: QuantityRequest, floor: number, walls: number) {
  const result = calc(document, request);
  for (const [output, expected] of [['floor-area', floor], ['ceiling-area', floor], ['gross-wall-area', walls]] as const) {
    const aggregate = result.outputs.find(item => item.output === output)!;
    assert.equal(aggregate.status, 'complete');
    assert.ok(Math.abs(squareFeet(aggregate.total!.net) - expected) < 1e-10, output);
  }
}

test('M3D schema3 has exactly one own membership, explicit unknown elevation and distinct versioned identities', () => {
  const valid = levels(), original = canonicalJson(valid);
  assert.equal(physicalDocumentV3Schema.safeParse(freezeDeep(valid)).success, true);
  const malformed: Array<[string, (value: any) => void]> = [
    ['missing membership', value => delete value.buildingLevels.roomLevels['room-1']],
    ['extra membership', value => value.buildingLevels.roomLevels.ghost = 'main'],
    ['unknown level', value => value.buildingLevels.roomLevels['room-1'] = 'ghost'],
    ['duplicated level', value => value.buildingLevels.levels[1].id = 'basement'],
    ['duplicated order', value => value.buildingLevels.levels[1].displayOrder = 0],
    ['nonexisting version', value => value.buildingLevels.version = 'building-levels-v2'],
    ['future document', value => value.schemaVersion = 4],
    ['duplicated room ownership', value => value.rooms[0].levelId = 'basement'],
    ['duplicated opening ownership', value => value.openings[0].levelId = 'basement'],
    ['guessed elevation', value => value.buildingLevels.levels[0].finishedFloorElevation.valueMm = 0],
    ['guessed reference', value => value.buildingLevels.levels[0].finishedFloorElevation.reference = 'Main floor'],
    ['known elevation extension', value => value.buildingLevels.levels[0].finishedFloorElevation.state = 'known'],
    ['unknown physical extension', value => value.stairs = []],
    ['level reuses room', value => value.buildingLevels.levels.push(createBuildingLevel('room-1', 'Bad', 3))],
    ['level reuses wall', value => value.buildingLevels.levels.push(createBuildingLevel('room-1:top', 'Bad', 3))],
    ['level reuses opening', value => value.buildingLevels.levels.push(createBuildingLevel('door', 'Bad', 3))],
    ['level reuses group', value => { value.editorContract.groups = [{ id: 'main', roomIds: ['room-1'] }]; }],
  ];
  for (const [name, mutate] of malformed) {
    const value = structuredClone(valid); mutate(value);
    assert.equal(physicalDocumentV3Schema.safeParse(value).success, false, name);
    assert.equal(supportedPhysicalDocumentSchema.safeParse(value).success, false, name);
  }
  assert.equal(canonicalJson(valid), original);
  assert.equal(physicalDocumentSchema.safeParse(valid).success, false);
  assert.equal(adaptMeasurementDocument(valid).status, 'unsupported-version');
  assert.throws(() => upgradePhysicalDraft(valid), /schema-version-2/);
});

test('M3D groups and shared openings must stay on one level without inventing plan-collision rules', () => {
  const document = levels();
  assert.deepEqual(document.rooms[0].presentation, document.rooms[1].presentation);
  assert.equal(physicalDocumentV3Schema.safeParse(document).success, true);
  document.editorContract.groups = [{ id: 'group', roomIds: ['room-1', 'room-2'] }];
  assert.equal(physicalDocumentV3Schema.safeParse(document).success, false);
  document.buildingLevels.roomLevels['room-2'] = 'basement';
  assert.equal(physicalDocumentV3Schema.safeParse(document).success, true);
  document.editorContract.groups = [];
  document.openings[0].attachments.push({ wallFaceId: 'room-2:top', anchor: 'center', offsetMm: toMm(2.5, 'ft') });
  assert.equal(physicalDocumentV3Schema.safeParse(document).success, true);
  document.buildingLevels.roomLevels['room-2'] = 'main';
  assert.equal(physicalDocumentV3Schema.safeParse(document).success, false);
});

test('M3D upgrade detaches current physical values and preserves originals, IDs, profiles, groups and opening evidence', () => {
  const current = source();
  current.rooms[0].length = measured('14 ft');
  current.rooms[0].metadata = { historical: { untouched: true } };
  current.openings[0].appearance = { style: 'bifold', swingDirection: 'outward', swingSide: 'right', metadata: { original: true } };
  current.editorContract!.groups = [{ id: 'group', roomIds: ['room-1'] }];
  current.compatibility = { adapterVersion: 'legacy-pixels-v2', original: { rooms: [{ id: 'stale', width: 12 }] },
    before: { rooms: 1, openings: 2 }, after: { rooms: 1, openings: 2 } };
  current.revisionId = 'current-revision';
  const before = canonicalJson(current), upgraded = upgradePhysicalDocumentToLevels(freezeDeep(current), 'unassigned');
  assert.deepEqual(upgraded.rooms, current.rooms); assert.deepEqual(upgraded.openings, current.openings);
  assert.deepEqual(upgraded.calculationContract, current.calculationContract);
  assert.deepEqual(upgraded.editorContract, current.editorContract);
  assert.deepEqual(upgraded.compatibility, current.compatibility);
  assert.equal(upgraded.id, current.id); assert.equal(upgraded.revisionId, current.revisionId);
  assert.deepEqual(upgraded.buildingLevels.roomLevels, { 'room-1': 'unassigned' });
  assert.equal(upgraded.buildingLevels.levels[0].ownership, 'unassigned');
  assert.equal(upgraded.buildingLevels.levels[0].name, 'Unassigned / existing');
  assert.equal(upgraded.buildingLevels.levels[0].finishedFloorElevation.valueMm, null);
  upgraded.rooms[0].name = 'Edited copy';
  (upgraded.compatibility!.original.rooms as any[])[0].id = 'edited-copy';
  assert.equal(canonicalJson(current), before);
  assert.throws(() => upgradePhysicalDocumentToLevels(upgraded, 'another'), /version-2/);
  const extension = structuredClone(current) as any; extension.roof = { slope: 3 };
  assert.throws(() => upgradePhysicalDocumentToLevels(extension, 'unassigned'), /cannot safely edit/);
});

test('M3D unknown ownership upgrade never invents supported models when historical declarations are absent', () => {
  const document = q001();
  const upgraded = upgradePhysicalDocumentToLevels(document, 'existing');
  assert.equal(upgraded.calculationContract.rooms['room-1'].ceiling.value, 'unknown');
  const result = calc(upgraded);
  assert.equal(result.outputs.find(item => item.output === 'floor-area')!.status, 'complete');
  assert.equal(result.outputs.find(item => item.output === 'ceiling-area')!.status, 'blocked');
});

test('M3D own prototype-like room and level IDs survive constructor, validator, calculation and captured snapshot', async () => {
  const document = source();
  document.rooms = [room('__proto__'), room('constructor')]; document.openings = [];
  document.calculationContract!.rooms = Object.fromEntries(document.rooms.map(room => [room.id, profile()]));
  const upgraded = upgradePhysicalDocumentToLevels(document, 'toString');
  assert.equal(Object.hasOwn(upgraded.buildingLevels.roomLevels, '__proto__'), true);
  assert.equal(upgraded.buildingLevels.roomLevels.__proto__, 'toString');
  assert.deepEqual(Object.keys(physicalDocumentV3Schema.parse(upgraded).buildingLevels.roomLevels).sort(), ['__proto__', 'constructor']);
  const direct = createBuildingLevels(['constructor'], '__proto__');
  assert.equal(buildingLevelsSchema.parse(direct).roomLevels.constructor, '__proto__');
  const result = calc(upgraded);
  assert.equal(Object.hasOwn(result.source.levelOwnership!.roomLevels, '__proto__'), true);
  const captured = await createQuantitySnapshot(upgraded, work(upgraded), meta);
  assert.ok(captured.ok, JSON.stringify(captured));
  assert.equal(Object.hasOwn(captured.snapshot.sourceDocument.buildingLevels!.roomLevels, '__proto__'), true);
  assert.deepEqual(await verifyQuantitySnapshot(captured.snapshot), { ok: true });
});

test('M3D full-document explicit project and level requests produce independent 270/802 and 120/352 quantities', () => {
  const document = levels(), before = canonicalJson(document);
  assertAreas(document, work(document), 270, 802);
  assertAreas(document, work(document, ['room-1']), 120, 352);
  assertAreas(document, work(document, ['room-2']), 150, 450);
  const result = calc(document);
  assert.equal(result.schemaVersion, 'quantity-result-v3');
  assert.equal(result.engineVersion, 'rectangular-engine-v3');
  assert.equal(result.policyVersion, QUANTITY_POLICY_VERSION_V3);
  assert.deepEqual(result.source.levelOwnership!.roomLevels, document.buildingLevels.roomLevels);
  assert.equal(canonicalJson(document), before);
});

test('M3D saved explicit target IDs remain fixed when rooms are added or reassigned between levels', () => {
  const document = levels(), selected = work(document, ['room-1']), selectedBefore = canonicalJson(selected);
  const newRoom = room('later');
  document.rooms.push(newRoom); document.calculationContract.rooms.later = profile();
  document.buildingLevels.roomLevels.later = 'basement';
  assertAreas(document, selected, 120, 352);
  document.buildingLevels.roomLevels['room-1'] = 'upper';
  assertAreas(document, selected, 120, 352);
  assert.equal(canonicalJson(selected), selectedBefore);
  assertAreas(document, work(document), 390, 1154);
});

test('M3D level ownership affects version3 hashes while names, order and camera remain presentation', async () => {
  const document = levels(), requested = work(document), baseline = await evaluation(document, requested);
  const originalRooms = structuredClone(document.rooms), originalOpenings = structuredClone(document.openings);
  document.buildingLevels.roomLevels['room-1'] = 'main';
  const moved = await evaluation(document, requested);
  assert.notEqual(moved.fingerprints.geometry, baseline.fingerprints.geometry);
  assert.notEqual(moved.fingerprints.content, baseline.fingerprints.content);
  assert.deepEqual(moved.calculation.outputs, baseline.calculation.outputs);
  assert.deepEqual(document.rooms, originalRooms); assert.deepEqual(document.openings, originalOpenings);
  document.buildingLevels.roomLevels['room-1'] = 'basement';
  document.buildingLevels.levels[0].ownership = 'unassigned';
  const unknownOwner = await evaluation(document, requested);
  assert.notEqual(unknownOwner.fingerprints.geometry, baseline.fingerprints.geometry);
  document.buildingLevels.levels[0].ownership = 'assigned';
  const oldSnapshot = await createQuantitySnapshot(document, requested, meta); assert.ok(oldSnapshot.ok);
  document.buildingLevels.levels[0].name = 'Renamed basement';
  document.buildingLevels.levels.forEach((level, index) => { level.displayOrder = 5 - index; });
  document.buildingLevels.levels.reverse();
  document.rooms[0].presentation = { xMm: toMm(8000, 'mm'), yMm: toMm(-8000, 'mm') };
  document.metadata = { camera: { scale: 2 }, activeLevel: 'main' };
  const presentation = await evaluation(document, requested);
  assert.deepEqual(presentation.fingerprints, baseline.fingerprints);
  const newSnapshot = await createQuantitySnapshot(document, requested, meta); assert.ok(newSnapshot.ok);
  assert.notEqual(newSnapshot.snapshot.captureFingerprint, oldSnapshot.snapshot.captureFingerprint);
  assert.deepEqual(await verifyQuantitySnapshot(oldSnapshot.snapshot), { ok: true });
  document.buildingLevels.levels[0].finishedFloorElevation.reason = 'No surveyed elevation or datum available.';
  const evidence = await evaluation(document, requested);
  assert.equal(evidence.fingerprints.geometry, presentation.fingerprints.geometry);
  assert.notEqual(evidence.fingerprints.content, presentation.fingerprints.content);
});

test('M3D level-aware snapshots enforce version dispatch, ownership integrity and synchronous detached capture', async () => {
  const document = levels(), requested = work(document);
  const promise = createQuantitySnapshot(document, requested, meta);
  document.buildingLevels.roomLevels['room-1'] = 'main'; document.buildingLevels.levels[0].name = 'Later name';
  const result = await promise; assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.snapshot.snapshotSchemaVersion, 'quantity-snapshot-v3');
  assert.equal(result.snapshot.sourceDocument.schemaVersion, 3);
  if (result.snapshot.sourceDocument.schemaVersion !== 3) throw new Error('Expected schema3');
  assert.equal(result.snapshot.sourceDocument.buildingLevels.roomLevels['room-1'], 'basement');
  assert.equal(Object.isFrozen(result.snapshot.sourceDocument.buildingLevels.roomLevels), true);
  assert.deepEqual(await verifyQuantitySnapshot(result.snapshot), { ok: true });
  const tampered = structuredClone(result.snapshot);
  tampered.sourceDocument.buildingLevels.roomLevels['room-1'] = 'main';
  assert.equal((await verifyQuantitySnapshot(tampered)).ok, false);
  const badCalculation = structuredClone(result.snapshot.evaluation.calculation) as any;
  badCalculation.engineVersion = 'rectangular-engine-v2';
  assert.equal(calculationSchema.safeParse(badCalculation).success, false);
  const noOwnership = structuredClone(result.snapshot.evaluation.calculation) as any; delete noOwnership.source.levelOwnership;
  assert.equal(calculationSchema.safeParse(noOwnership).success, false);
  const wrongSnapshot = structuredClone(result.snapshot) as any; wrongSnapshot.snapshotSchemaVersion = 'quantity-snapshot-v2';
  assert.equal(quantitySnapshotSchema.safeParse(wrongSnapshot).success, false);
  const oldRequest = structuredClone(requested); oldRequest.policy.version = QUANTITY_POLICY_VERSION_V2;
  assert.equal(calculateQuantities(document, oldRequest).ok, false);
  assert.equal(calculateQuantities(source(), requested).ok, false);
});

test('M3D unchanged version1 and version2 historical snapshot bytes and hashes remain verifiable', async () => {
  for (const filename of ['m3b-v1-snapshot.json', 'm3d-v2-snapshot.json']) {
    const historical = JSON.parse(readFileSync(new URL('./fixtures/' + filename, import.meta.url), 'utf8'));
    assert.deepEqual(await verifyQuantitySnapshot(historical), { ok: true }, filename);
    const regenerated = await createQuantitySnapshot(historical.sourceDocument, historical.evaluation.calculation.request,
      historical.instance, historical.measurementEvents);
    assert.ok(regenerated.ok, filename);
    assert.equal(canonicalJson(regenerated.snapshot), canonicalJson(historical), filename);
    assert.equal(Object.hasOwn(regenerated.snapshot.evaluation.calculation.source, 'levelOwnership'), false);
  }
});

test('M3D independent ceiling/wall applicability and confirmation gates reuse existing engine semantics', async () => {
  const document = levels();
  document.calculationContract.rooms['room-1'].ceiling = createUnknownRoomApplicability('Unmeasured slope').ceiling;
  const result = calc(document);
  assert.equal(result.outputs.find(item => item.output === 'floor-area')!.status, 'complete');
  assert.equal(result.outputs.find(item => item.output === 'gross-wall-area')!.status, 'complete');
  assert.equal(result.outputs.find(item => item.output === 'ceiling-area')!.status, 'blocked');
  assert.equal((await createQuantitySnapshot(document, work(document), meta)).ok, false);
  document.calculationContract.rooms['room-1'] = profile();
  document.rooms[0].length = measured('12 ft', false);
  assert.equal(calc(document).status, 'provisional');
  assert.equal((await createQuantitySnapshot(document, work(document), meta)).ok, false);
});

test('M3D physical measurement actions retain level ownership and original evidence without mutation', () => {
  const document = levels(), original = canonicalJson(document);
  const result = applyMeasurementAction(freezeDeep(document), { entity: 'room', id: 'room-1', field: 'length' },
    { type: 'correct', at: AT, replacement: measured('13 ft') });
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.document.schemaVersion, 3);
  assert.deepEqual(result.document.buildingLevels, document.buildingLevels);
  assert.equal(result.document.rooms[0].length.state === 'known' && result.document.rooms[0].length.provenance.confirmation.status, 'unconfirmed');
  assert.equal(canonicalJson(document), original);
  assert.deepEqual(result.event.before, document.rooms[0].length);
  const corrupt = structuredClone(document); corrupt.buildingLevels.roomLevels['room-1'] = 'ghost';
  assert.equal(applyMeasurementAction(corrupt, { entity: 'room', id: 'room-1', field: 'length' }, { type: 'confirm', at: AT }).ok, false);
});

test('M3D active-level projection and wall hit inputs exclude coincident hidden rooms and empty-level fit geometry', () => {
  const document = levels();
  document.rooms[1].length = measured('12 ft');
  const third = room('room-3'); document.rooms.push(third);
  document.calculationContract.rooms['room-3'] = profile(); document.buildingLevels.roomLevels['room-3'] = 'upper';
  document.buildingLevels.levels.push(createBuildingLevel('empty', 'Empty', 3));
  const before = canonicalJson(document);
  for (const [levelId, roomId] of [['basement', 'room-1'], ['main', 'room-2'], ['upper', 'room-3']] as const) {
    const projection = projectPhysicalRooms(document, levelId);
    assert.deepEqual(projection.rooms.map(room => room.id), [roomId]);
    const visible = projection.rooms[0];
    const target = findPhysicalWall({ x: visible.x + visible.width / 2, y: visible.y }, document, projection.rooms, 2);
    assert.equal(target?.roomId, roomId);
    assert.equal(target?.wallFaceId, roomId + ':top');
    if (levelId !== 'basement') assert.equal(projection.rooms[0].objects?.length, 0);
  }
  assert.deepEqual(projectPhysicalRooms(document, 'empty').rooms, []);
  assert.equal(findPhysicalWall({ x: 0, y: 0 }, document, projectPhysicalRooms(document, 'empty').rooms, 2), null);
  assert.equal(document.rooms[0].id, 'room-1');
  assert.equal(canonicalJson(document), before);
});
