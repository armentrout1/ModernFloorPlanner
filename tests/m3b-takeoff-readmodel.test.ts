import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildTakeoffReadModel, scopeForRequest, quantityText, emptySourceScope, type DrawingSourceScope } from '../client/src/features/physical-draft/takeoffReadModel';
import { drawingSourceMarks, drawingSourceBounds } from '../client/src/features/physical-draft/drawingSources';
import { projectPhysicalRooms } from '../client/src/features/physical-draft/projection';
import { adoptPhysicalDraft, editField, switchUnit, type PhysicalDraft } from '../client/src/features/physical-draft/state';
import { editOpeningField } from '../client/src/features/physical-draft/openingCommands';
import { editWaste, commitWaste } from '../client/src/features/physical-draft/takeoffCommands';
import { createProposedRoomApplicability, APPLICABILITY_FIELDS } from '../shared/domain/applicability';
import { unknownMeasurement } from '../shared/domain/measurements';
import { QUANTITY_POLICY_VERSION_V2 } from '../shared/quantities/policy';
import type { QuantityOutput } from '../shared/domain/geometryValidation';
import { canonicalJson } from '../shared/quantities/canonicalJson';
import { q001, room, allSelections, AT, freezeDeep } from './fixtures/physical';

function fixture(confirmedModels = true): PhysicalDraft {
  const document = q001(); document.rooms[0].name = 'Alpha';
  document.quantityPolicyVersion = QUANTITY_POLICY_VERSION_V2;
  const profile = createProposedRoomApplicability();
  if (confirmedModels) for (const field of APPLICABILITY_FIELDS) profile[field].confirmation = { status: 'confirmed', confirmedAt: AT };
  document.calculationContract = { version: 'room-applicability-v1', rooms: { 'room-1': profile } };
  const draft = adoptPhysicalDraft(document, 'takeoff-draft');
  draft.request = { policy: { version: QUANTITY_POLICY_VERSION_V2, openingMeasureBasis: 'finished', crownFullHeightGaps: [] },
    selections: allSelections(document).map(selection => 'wasteFraction' in selection ? { ...selection, wasteFraction: 0 } : selection) };
  return draft;
}
function output(draft: PhysicalDraft, output: QuantityOutput) {
  const result = buildTakeoffReadModel(draft);
  assert.ok(result.ok, JSON.stringify(result.errors));
  return result.outputs.find(item => item.output === output)!;
}

test('Slice 3 read model exposes exact shared-engine fixture totals and individual door/window deductions', () => {
  const draft = fixture(), before = canonicalJson(draft), result = buildTakeoffReadModel(freezeDeep(draft));
  assert.ok(result.ok, JSON.stringify(result.errors));
  const totals = new Map(result.outputs.map(item => [item.output, item.total]));
  for (const [id, net] of [['floor-area', '120.00 sq ft'], ['ceiling-area', '120.00 sq ft'], ['gross-wall-area', '352.00 sq ft'],
    ['net-wall-area', '319.00 sq ft'], ['baseboard', '41.00 ft'], ['base-shoe', '41.00 ft'], ['crown', '44.00 ft'],
    ['door-casing', '17.00 ft'], ['window-casing', '14.00 ft']] as const) assert.equal(totals.get(id)!.net, net);
  const net = result.outputs.find(item => item.output === 'net-wall-area')!;
  assert.equal(net.total!.rawDeductions, '33.00 sq ft'); assert.equal(net.total!.effectiveDeductions, '33.00 sq ft');
  const top = net.rows.find(row => row.label === 'Alpha · top wall')!;
  assert.equal(top.amounts!.gross, '96.00 sq ft'); assert.equal(top.amounts!.net, '63.00 sq ft');
  assert.deepEqual(top.contributions.map(item => [item.openingId, item.raw, item.effectiveBeforeUnion]),
    [['door', '21.00 sq ft', '21.00 sq ft'], ['window', '12.00 sq ft', '12.00 sq ft']]);
  const inventory = result.outputs.find(item => item.output === 'opening-inventory')!;
  assert.deepEqual(inventory.inventory, { door: 1, window: 1, 'floor-level-opening': 0 });
  assert.equal(inventory.total!.net, '2 count'); assert.equal(inventory.total!.adjusted, null); assert.equal(inventory.wastePending, false);
  assert.equal(canonicalJson(draft), before);
});

test('Slice 3 partial wall results identify excluded top wall without replacing unavailable selected total', () => {
  const draft = fixture(false); draft.document.openings[1].height = unknownMeasurement('Not entered');
  const net = output(draft, 'net-wall-area');
  assert.equal(net.status, 'blocked'); assert.equal(net.total, null); assert.equal(net.completeness, 'partial');
  assert.equal(net.subtotal!.net, '256.00 sq ft'); assert.equal(net.subtotalStatus, 'provisional');
  assert.deepEqual(net.excludedTargets.map(item => item.label), ['Alpha · top wall']);
  assert.deepEqual(net.includedTargets.map(item => item.label).sort(), ['Alpha · bottom wall', 'Alpha · left wall', 'Alpha · right wall']);
  const missing = net.rows.flatMap(row => row.findings).find(finding => finding.message === "Enter Window 1 in Alpha's height.");
  assert.ok(missing); assert.deepEqual(missing.source.openingIds, ['window']);
  assert.equal(output(draft, 'floor-area').total!.net, '120.00 sq ft');
  assert.equal(output(draft, 'gross-wall-area').total!.net, '352.00 sq ft');
});

test('Slice 3 pending width height sill and offset mask dependent totals and retain useful field-specific messages', () => {
  for (const [field, label] of [['width', 'width'], ['height', 'height'], ['sillHeight', 'sill height'], ['offset', 'center position']] as const) {
    const draft = editOpeningField(fixture(), 'window', field, '3 ft -');
    const net = output(draft, 'net-wall-area');
    assert.equal(net.total, null, field); assert.equal(net.subtotal!.net, '256.00 sq ft', field);
    assert.ok(net.rows.flatMap(row => row.findings).some(finding => finding.message === "Finish editing Window 1 in Alpha's " + label + '.'), field);
    assert.equal(output(draft, 'floor-area').total!.net, '120.00 sq ft');
    assert.equal(output(draft, 'gross-wall-area').total!.net, '352.00 sq ft');
  }
  const draft = editField(fixture(), 'room-1', 'length', '12 ft -');
  assert.equal(output(draft, 'floor-area').total, null);
  assert.ok(output(draft, 'floor-area').rows.flatMap(row => row.findings).some(finding => finding.message === "Finish editing Alpha's length."));
});

test('Slice 3 waste comes from engine once; dirty invalid or uncommitted waste never exposes older adjusted quantities', () => {
  let draft = commitWaste(editWaste(fixture(), 'floor-area', '10'), 'floor-area');
  const floor = output(draft, 'floor-area');
  assert.deepEqual([floor.total!.net, floor.total!.allowance, floor.total!.adjusted], ['120.00 sq ft', '12.00 sq ft', '132.00 sq ft']);
  for (const text of ['-', '20', '']) {
    const pending = editWaste(draft, 'floor-area', text), current = output(pending, 'floor-area');
    assert.equal(current.wastePending, true); assert.ok(current.wasteError);
    assert.equal(current.total!.net, '120.00 sq ft'); assert.equal(current.total!.allowance, null); assert.equal(current.total!.adjusted, null);
    assert.equal(current.rows[0].amounts!.adjusted, null);
    assert.equal(output(pending, 'ceiling-area').total!.adjusted, '120.00 sq ft');
    assert.equal(pending.request.selections.find(item => item.output === 'floor-area')!.wasteFraction, .1);
  }
});

test('Slice 3 empty work and explicit empty targets remain empty and never display a complete zero project', () => {
  const draft = fixture(); draft.request.selections = [];
  assert.deepEqual(buildTakeoffReadModel(draft).outputs, []);
  draft.request.selections = [{ output: 'floor-area', roomIds: [], wasteFraction: 0 }];
  const floor = output(draft, 'floor-area');
  assert.equal(floor.targetCount, 0); assert.equal(floor.status, 'empty'); assert.equal(floor.total, null); assert.equal(floor.subtotal, null);
  assert.deepEqual(floor.rows, []);
  assert.equal(quantityText(0, 'mm', 'ft'), '0.00 ft'); assert.equal(quantityText(0, 'count', 'ft'), '0 count');
  assert.equal(output(fixture(), 'crown').total!.effectiveDeductions, '0.00 ft');
});

test('Slice 3 measurement, model, geometry and basis findings remain independent', () => {
  const draft = fixture(false); draft.document.rooms[0].length.provenance.confirmation = { status: 'unconfirmed' };
  let floor = output(draft, 'floor-area');
  assert.equal(floor.status, 'provisional'); assert.equal(floor.rows[0].readiness.numericBasis.status, 'sufficient');
  assert.equal(floor.rows[0].readiness.geometry.status, 'valid'); assert.equal(floor.rows[0].readiness.confirmation.status, 'provisional');
  draft.document.calculationContract!.rooms['room-1'].ceiling = { value: 'unsupported', source: 'manual', confirmation: { status: 'unconfirmed' }, detail: 'Vaulted ceiling' };
  assert.equal(output(draft, 'ceiling-area').status, 'blocked'); assert.equal(output(draft, 'floor-area').total!.net, '120.00 sq ft');
  draft.document.openings[1].measureBasis = 'rough';
  assert.equal(output(draft, 'net-wall-area').total, null);
  assert.ok(output(draft, 'net-wall-area').rows.flatMap(row => row.findings).some(finding => finding.code === 'OPENING_BASIS_MISMATCH' && finding.message.includes('recorded rough, requested finished')));
  draft.document.openings[1].measureBasis = 'finished';
  draft.document.openings[0].attachments[0].offsetMm = 0 as typeof draft.document.openings[0]['attachments'][number]['offsetMm'];
  const top = output(draft, 'net-wall-area').rows.find(row => row.label === 'Alpha · top wall')!;
  assert.equal(top.readiness.geometry.status, 'invalid'); assert.ok(top.findings.some(finding => finding.message.includes('extends beyond the selected wall')));
});

test('Slice 3 shared physical inventory counts once while selected casing faces remain independent in full-document engine input', () => {
  const draft = fixture(), second = room('room-2'); second.name = 'Beta';
  draft.document.rooms.push(second); draft.fields['room-2'] = structuredClone(draft.fields['room-1']);
  draft.document.calculationContract!.rooms['room-2'] = structuredClone(draft.document.calculationContract!.rooms['room-1']);
  draft.document.openings[0].attachments.push({ ...draft.document.openings[0].attachments[0], wallFaceId: 'room-2:top' });
  draft.request.selections = [{ output: 'opening-inventory', openingIds: ['door'] },
    { output: 'door-casing', faces: [{ openingId: 'door', wallFaceId: 'room-2:top' }], wasteFraction: 0 }];
  const result = buildTakeoffReadModel(draft); assert.ok(result.ok, JSON.stringify(result.errors));
  assert.equal(result.outputs[0].total!.net, '1 count'); assert.equal(result.outputs[1].total!.net, '17.00 ft');
  assert.deepEqual(result.outputs[1].rows[0].source.openingFaces, [{ openingId: 'door', wallFaceId: 'room-2:top' }]);
  assert.equal(draft.document.rooms.length, 2); assert.equal(draft.document.openings[0].attachments.length, 2);
});

test('Slice 3 metric formatting and detached source scopes do not modify request quantities or caller measurements', () => {
  const draft = fixture(), before = canonicalJson(draft);
  const metric = buildTakeoffReadModel(switchUnit(draft, 'm'));
  assert.equal(metric.outputs.find(item => item.output === 'floor-area')!.total!.net, '11.15 m²');
  const source = scopeForRequest(draft.document, draft.request); source.roomIds.push('extra'); source.openingFaces[0].openingId = 'changed';
  assert.equal(canonicalJson(draft), before);
});

test('Slice 3 drawing source highlights preserve exact selected room, wall and shared-opening face identities', () => {
  const draft = fixture(), document = draft.document; delete document.rooms[0].presentation;
  const second = room('room-2'); delete second.presentation; document.rooms.push(second);
  document.calculationContract!.rooms['room-2'] = structuredClone(document.calculationContract!.rooms['room-1']);
  document.openings[0].attachments.push({ ...document.openings[0].attachments[0], wallFaceId: 'room-2:right' });
  const rooms = projectPhysicalRooms(document).rooms, before = canonicalJson(document);
  const source: DrawingSourceScope = { ...emptySourceScope(), openingFaces: [{ openingId: 'door', wallFaceId: 'room-2:right' }] };
  const marks = drawingSourceMarks(document, rooms, source);
  assert.equal(marks.length, 1); assert.equal(marks[0].roomId, 'room-2'); assert.equal(marks[0].wallFaceId, 'room-2:right');
  const bound = drawingSourceBounds(marks)!; assert.equal(bound.width, 0); assert.ok(bound.height > 0);
  const inventory = drawingSourceMarks(document, rooms, { ...emptySourceScope(), openingIds: ['door'] });
  assert.equal(inventory.length, 2);
  const wall = drawingSourceMarks(document, rooms, { ...emptySourceScope(), wallFaceIds: ['room-1:top'] });
  assert.deepEqual(wall.map(mark => mark.kind), ['wall']); assert.equal(wall[0].width, 240); assert.equal(wall[0].height, 0);
  assert.equal(drawingSourceBounds([]), null); assert.equal(canonicalJson(document), before);
});

test('Slice 3 unknown physical opening widths highlight a point instead of inventing a measured span', () => {
  const draft = fixture(); draft.document.openings[0].width = unknownMeasurement('Unknown actual width');
  const rooms = projectPhysicalRooms(draft.document).rooms;
  const marks = drawingSourceMarks(draft.document, rooms, { ...emptySourceScope(), openingIds: ['door'] });
  assert.equal(marks.length, 1); assert.equal(marks[0].width, 0); assert.equal(marks[0].height, 0);
  assert.ok(drawingSourceBounds(marks));
});
