import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { capturePhysicalSaveEnvelope, parsePhysicalSaveEnvelope, restorePhysicalSaveDraft,
  physicalSavePayloadHash, evaluatePhysicalSave, PhysicalSaveError } from '../shared/persistence/physicalSave';
import { basicPhysicalSaveDraft, richPhysicalSaveDraft, PHYSICAL_SAVE_TEST_AT as AT } from './fixtures/physicalSave';
import { createDraft, addRoom, editField, commitField, adoptPhysicalDraft, type PhysicalDraft } from '../client/src/features/physical-draft/state';
import { createLevelDraft, editLevelName } from '../client/src/features/physical-draft/levelCommands';
import { editOpeningField, deleteOpening } from '../client/src/features/physical-draft/openingCommands';
import { editStairField } from '../client/src/features/physical-draft/stairCommands';
import { editLayoutField, editLayoutText } from '../client/src/features/physical-draft/layoutCommands';
import { editWaste } from '../client/src/features/physical-draft/takeoffCommands';
import { captureMeasurementReview, confirmMeasurement, captureApplicabilityReview, confirmApplicability } from '../client/src/features/physical-draft/reviewCommands';
import { emptyHistory, recordHistoryCommit, restoreHistory } from '../client/src/features/physical-draft/history';
import { validateRegistry } from '../client/src/features/physical-draft/storage';
import { canonicalJson } from '../shared/quantities/canonicalJson';
import { evaluateQuantities, verifyQuantitySnapshot } from '../shared/quantities/snapshot';

const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const binding = { planId: 'server-plan', revisionId: 'server-revision', createdAt: AT };
const validDraft = (draft: PhysicalDraft) => assert.equal(validateRegistry({ version: 'mfp-editor-draft-v4',
  localEditRevision: 0, selectedDraftId: draft.id, drafts: [draft] }).status, 'recovered');

test('physical save opens full schema5 geometry, identity, committed request and all retained lineage without mutating source', async () => {
  const draft = richPhysicalSaveDraft(), before = copy(draft), envelope = capturePhysicalSaveEnvelope(draft);
  const opened = restorePhysicalSaveDraft(JSON.parse(canonicalJson(envelope)), 'fresh-local', 'm');
  assert.deepEqual(draft, before); assert.deepEqual(opened.document, draft.document);
  assert.deepEqual(opened.request, draft.request); assert.equal(opened.displayUnit, 'm');
  assert.deepEqual(capturePhysicalSaveEnvelope(opened), envelope); validDraft(opened);
  assert.equal(opened.document.schemaVersion, 5);
  if (opened.document.schemaVersion !== 5) return;
  assert.equal(opened.document.stairsContract.stairs[0].landings.upper?.id, 'upper-landing');
  assert.equal(opened.document.layoutContract.cabinetBlocks[0].zoneId, 'zone');
  assert.equal(opened.document.openings[0].appearance?.style, 'bifold');
  assert.equal(opened.id, 'fresh-local'); assert.equal(opened.localEditRevision, 0);
  assert.equal(opened.document.id, null); assert.equal(opened.document.revisionId, null);
  assert.equal(await physicalSavePayloadHash(envelope), await physicalSavePayloadHash(capturePhysicalSaveEnvelope(opened)));
});

test('server evaluation binds exact schema5 source, selected work and server revision; stair quantity remains252/25.2/277.2', async () => {
  const envelope = capturePhysicalSaveEnvelope(richPhysicalSaveDraft());
  const result = await evaluatePhysicalSave(envelope, binding), snapshot = result.snapshot;
  const floor = snapshot.evaluation.calculation.outputs.find(output => output.output === 'floor-area')!;
  assert.equal(snapshot.instance.kind, 'evaluation'); assert.equal(snapshot.snapshotSchemaVersion, 'quantity-snapshot-v5');
  assert.equal(snapshot.sourceDocument.id, binding.planId); assert.equal(snapshot.sourceDocument.revisionId, binding.revisionId);
  assert.equal(snapshot.evaluation.calculation.source.revisionState, 'identified');
  for (const [key, expected] of [['net', 252], ['allowance', 25.2], ['adjusted', 277.2]] as const)
    assert.ok(Math.abs(floor.total![key] / (304.8 ** 2) - expected) < 1e-9);
  assert.deepEqual(await verifyQuantitySnapshot(snapshot), { ok: true });
  assert.equal(result.payloadHash, await physicalSavePayloadHash(envelope));
});

test('12x10x8 and later9ft evaluation leave floor120/ceiling120 while walls change352to396; original capture immutable', async () => {
  const draft = basicPhysicalSaveDraft(), first = capturePhysicalSaveEnvelope(draft);
  const result = await evaluatePhysicalSave(first, binding), before = copy(result);
  const updated = commitField(editField(draft, 'room', 'ceilingHeight', '9 ft'), 'room', 'ceilingHeight', AT);
  const next = await evaluatePhysicalSave(capturePhysicalSaveEnvelope(updated), { ...binding, revisionId: 'server-revision2' });
  const net = (value: typeof result, output: string) => value.snapshot.evaluation.calculation.outputs.find(item => item.output === output)!.total!.net / (304.8 ** 2);
  for (const value of [result, next]) { assert.ok(Math.abs(net(value, 'floor-area') - 120) < 1e-9); assert.ok(Math.abs(net(value, 'ceiling-area') - 120) < 1e-9); }
  assert.ok(Math.abs(net(result, 'gross-wall-area') - 352) < 1e-9); assert.ok(Math.abs(net(next, 'gross-wall-area') - 396) < 1e-9);
  assert.deepEqual(result, before); assert.notEqual(result.payloadHash, next.payloadHash);
});

test('unknown cleared ceiling height remains saved unknown; independent floor/ceiling stay available and walls blocked', async () => {
  const draft = basicPhysicalSaveDraft();
  const cleared = commitField(editField(draft, 'room', 'ceilingHeight', ''), 'room', 'ceilingHeight', AT);
  const snapshot = (await evaluatePhysicalSave(capturePhysicalSaveEnvelope(cleared), binding)).snapshot;
  const outputs = snapshot.evaluation.calculation.outputs;
  assert.equal(snapshot.sourceDocument.rooms[0].ceilingHeight.state, 'unknown');
  assert.equal(outputs.find(item => item.output === 'gross-wall-area')?.total, null);
  assert.ok(outputs.find(item => item.output === 'floor-area')?.total); assert.ok(outputs.find(item => item.output === 'ceiling-area')?.total);
  assert.equal(snapshot.instance.kind, 'evaluation');
});

test('empty and incomplete supported drafts can save without fabricated confirmation', async () => {
  for (const draft of [createDraft('empty'), addRoom(createDraft('unknown'), 'unmeasured'), createLevelDraft('empty-building', 'ground')]) {
    const envelope = capturePhysicalSaveEnvelope(draft), result = await evaluatePhysicalSave(envelope, binding);
    validDraft(restorePhysicalSaveDraft(envelope, 'new-copy'));
    assert.notEqual(result.snapshot.evaluation.calculation.status, 'complete'); assert.equal(result.snapshot.instance.kind, 'evaluation');
  }
});

test('full persisted content hash detects names and metadata omitted by geometry fingerprints; JSON object key order is irrelevant', async () => {
  const first = capturePhysicalSaveEnvelope(basicPhysicalSaveDraft()), second = copy(first);
  second.document.name = 'Different project name'; second.document.rooms[0].name = 'Different room name';
  second.document.metadata = { note: 'retained' };
  const a = await evaluateQuantities(first.document, first.request), b = await evaluateQuantities(second.document, second.request);
  assert.ok(a.ok && b.ok); if (!a.ok || !b.ok) return;
  assert.equal(a.evaluation.fingerprints.geometry, b.evaluation.fingerprints.geometry);
  assert.notEqual(await physicalSavePayloadHash(first), await physicalSavePayloadHash(second));
  const reordered = { evidence: second.evidence, request: second.request, document: second.document, version: second.version };
  assert.equal(await physicalSavePayloadHash(second), await physicalSavePayloadHash(reordered));
});

test('captured source text and measurement precision survive exact; no legacy metadata reinterpretation', () => {
  const physical = copy(basicPhysicalSaveDraft().document);
  physical.id = 42; physical.revisionId = 'historical-revision';
  physical.metadata = { originalJsonText: '{\r\n  "kept": 1.00, "name": "café"\r\n}\n' };
  const draft = adoptPhysicalDraft(physical, 'adopted');
  const envelope = capturePhysicalSaveEnvelope(draft), opened = restorePhysicalSaveDraft(envelope, 'reopened');
  assert.deepEqual(opened.source.original, physical);
  assert.equal((opened.source.original as any).metadata.originalJsonText, physical.metadata.originalJsonText);
  assert.deepEqual(opened.document.rooms[0].length, physical.rooms[0].length);
});

test('explicit review and restoration action evidence survives Save/Open without becoming a fresh confirmation', () => {
  let draft = basicPhysicalSaveDraft();
  draft = confirmMeasurement(draft, captureMeasurementReview(draft, { entity: 'room', id: 'room', field: 'length' }), AT);
  draft = confirmApplicability(draft, captureApplicabilityReview(draft, 'room', 'ceiling'), AT);
  const edited = commitField(editField(draft, 'room', 'width', '11 ft'), 'room', 'width', AT);
  const recorded = recordHistoryCommit(draft, edited, emptyHistory());
  const restored = restoreHistory(recorded.draft, recorded.history, 'undo', AT).draft;
  const envelope = capturePhysicalSaveEnvelope(restored), opened = restorePhysicalSaveDraft(envelope, 'opened-evidence');
  assert.deepEqual(opened.events, restored.events); assert.deepEqual(opened.reviewState, restored.reviewState);
  assert.deepEqual(opened.historyEvidence, restored.historyEvidence); validDraft(opened);
  assert.ok(opened.historyEvidence!.events.some(event => event.action === 'undo'));
  assert.equal('undo' in envelope.evidence, false); assert.equal('openingDeleteUndo' in envelope.evidence, false);
});

test('projection omits current editor registry, raw fields, display/view and history stacks, preserving source originals', () => {
  const draft = richPhysicalSaveDraft();
  const envelope = capturePhysicalSaveEnvelope(draft);
  assert.deepEqual(Object.keys(envelope).sort(), ['document', 'evidence', 'request', 'version']);
  for (const key of ['id', 'localEditRevision', 'fields', 'openingFields', 'stairFields', 'layoutFields', 'layoutTexts', 'levelView', 'takeoffState', 'openingDeleteUndo', 'undo', 'redo'])
    assert.equal(Object.hasOwn(envelope.evidence, key), false, key);
  assert.deepEqual(envelope.evidence.layoutUpgradeLineage?.originalDraft, draft.layoutUpgradeLineage?.originalDraft);
});

test('all current pending field families fail capture explicitly and leave originals unchanged', () => {
  const rich = richPhysicalSaveDraft();
  const candidates = [
    editField(rich, 'lower-room', 'length', '12 ft -'), editLevelName(rich, 'upper-level', 'Pending name'),
    editOpeningField(rich, 'door', 'width', '3 ft -'),
    editStairField(rich, { kind: 'stair', id: 'stair', field: 'width' }, '3 ft -'),
    editStairField(rich, { kind: 'landing', id: 'stair', role: 'upper', field: 'width' }, '3 ft -'),
    editStairField(rich, { kind: 'surface-opening', id: 'hole', field: 'width' }, '3 ft -'),
    editLayoutField(rich, { kind: 'zone', id: 'zone', field: 'width' }, '6 ft -'),
    editLayoutField(rich, { kind: 'cabinet', id: 'cabinet', field: 'depth' }, '2 ft -'),
    editLayoutText(rich, { kind: 'zone', id: 'zone', field: 'name' }, 'Pending zone'), editWaste(rich, 'floor-area', '10.'),
  ];
  for (const draft of candidates) {
    const before = copy(draft);
    assert.throws(() => capturePhysicalSaveEnvelope(draft), (error: unknown) => error instanceof PhysicalSaveError && error.code === 'PENDING_SAVE_FIELDS');
    assert.deepEqual(draft, before);
  }
});

test('malformed envelopes, server identity spoofing, invalid references and unsupported versions reject without mutation', () => {
  const valid = capturePhysicalSaveEnvelope(richPhysicalSaveDraft());
  const mutations = [
    (value: any) => value.version = 'unknown-save-v2', (value: any) => value.document.schemaVersion = 6,
    (value: any) => value.document.id = 'claimed-server-plan', (value: any) => value.document.revisionId = 'claimed-revision',
    (value: any) => value.document.layoutContract.cabinetBlocks[0].zoneId = 'foreign-zone',
    (value: any) => value.request.selections[0].roomIds = ['foreign-room'],
    (value: any) => value.workspaceId = 'untrusted-workspace', (value: any) => value.evidence.extraUnknown = true,
    (value: any) => value.evidence.source.original = { not: 'original' },
  ];
  for (const mutate of mutations) { const invalid = copy(valid); mutate(invalid); const before = copy(invalid);
    assert.throws(() => parsePhysicalSaveEnvelope(invalid), PhysicalSaveError); assert.deepEqual(invalid, before); }
});

test('invented confirmation or modified restoration evidence cannot pass merely by submitting a status flag', () => {
  const envelope = capturePhysicalSaveEnvelope(basicPhysicalSaveDraft());
  const room = envelope.document.rooms[0];
  if (room.length.state !== 'known') throw new Error('fixture');
  room.length.provenance.confirmation = { status: 'confirmed', confirmedAt: AT };
  assert.throws(() => parsePhysicalSaveEnvelope(envelope), PhysicalSaveError);
});

test('credential fields, unbounded payloads, accessors, cycles and non-finite values explicitly reject', () => {
  const valid = capturePhysicalSaveEnvelope(basicPhysicalSaveDraft());
  const credential = copy(valid); credential.document.metadata = { nested: { contextToken: 'not-a-real-secret' } };
  assert.throws(() => parsePhysicalSaveEnvelope(credential), (error: unknown) => error instanceof PhysicalSaveError && error.code === 'PRIVATE_CONTEXT_IN_SAVE');
  const oversized = copy(valid); oversized.document.metadata = { text: 'x'.repeat(1_048_577) };
  assert.throws(() => parsePhysicalSaveEnvelope(oversized), (error: unknown) => error instanceof PhysicalSaveError && error.code === 'SAVE_TOO_LARGE');
  const cyclic: any = copy(valid); cyclic.document.metadata.self = cyclic;
  assert.throws(() => parsePhysicalSaveEnvelope(cyclic), PhysicalSaveError);
  const accessor = copy(valid); Object.defineProperty(accessor.document.metadata, 'getter', { enumerable: true, get() { throw new Error('must not execute'); } });
  assert.throws(() => parsePhysicalSaveEnvelope(accessor), PhysicalSaveError);
  const infinite = copy(valid); infinite.document.metadata = { bad: Infinity };
  assert.throws(() => parsePhysicalSaveEnvelope(infinite), PhysicalSaveError);
});

test('legacy schema2/3 save remains explicit unchanged and does not auto-adopt newer document contracts', () => {
  const level = createLevelDraft('level-local', 'ground');
  level.levelView!.pendingNames = { ground: 'Ground floor' };
  if (level.document.schemaVersion !== 2) level.levelView!.pendingNames.ground = level.document.buildingLevels.levels[0].name;
  for (const draft of [basicPhysicalSaveDraft(), level]) {
    const envelope = capturePhysicalSaveEnvelope(draft), opened = restorePhysicalSaveDraft(envelope, 'local-reopened');
    assert.equal(opened.document.schemaVersion, draft.document.schemaVersion); assert.deepEqual(opened.document, draft.document);
  }
});

test('historical snapshot versions and their original serialized source text survive without recalculation or upgrade', () => {
  const draft = basicPhysicalSaveDraft();
  const originals = ['m3b-v1-snapshot.json', 'm3d-v2-snapshot.json', 'm3d-v3-snapshot.json', 'm3d-v4-snapshot.json']
    .map(name => ({ name, originalText: readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8') }));
  draft.document.metadata = { retainedSnapshots: originals.map(original => ({ ...original, captured: JSON.parse(original.originalText) })) };
  const opened = restorePhysicalSaveDraft(capturePhysicalSaveEnvelope(draft), 'historical-open');
  assert.deepEqual(opened.document.metadata, draft.document.metadata);
  assert.deepEqual((opened.document.metadata.retainedSnapshots as typeof originals).map(item => item.originalText), originals.map(item => item.originalText));
});

test('async evaluation owns the submitted payload and server binding before awaiting fingerprints', async () => {
  const input = capturePhysicalSaveEnvelope(basicPhysicalSaveDraft()), before = copy(input), capturedBinding = { ...binding };
  const evaluating = evaluatePhysicalSave(input, capturedBinding);
  input.document.name = 'A later local edit'; input.request.selections = [];
  capturedBinding.planId = 'later-plan'; capturedBinding.revisionId = 'later-revision';
  const result = await evaluating;
  assert.equal(result.planId, binding.planId); assert.equal(result.revisionId, binding.revisionId);
  assert.equal(result.snapshot.sourceDocument.name, before.document.name);
  assert.deepEqual(result.snapshot.evaluation.calculation.request, before.request);
  assert.equal(result.payloadHash, await physicalSavePayloadHash(before));
});
test('JSONB-incompatible NUL or lone-surrogate content rejects explicitly while valid Unicode remains exact', () => {
  for (const text of ['\u0000', '\uD800', '\uDC00', 'a\uDC00', '\uD800a']) {
    const envelope = capturePhysicalSaveEnvelope(basicPhysicalSaveDraft());
    envelope.document.metadata = { text };
    assert.throws(() => parsePhysicalSaveEnvelope(envelope), (error: unknown) => error instanceof PhysicalSaveError && error.code === 'INVALID_SAVE_JSON');
    envelope.document.metadata = Object.fromEntries([[text, 'property name']]);
    assert.throws(() => parsePhysicalSaveEnvelope(envelope), PhysicalSaveError);
  }
  const envelope = capturePhysicalSaveEnvelope(basicPhysicalSaveDraft());
  envelope.document.metadata = { text: 'café 房間 \uD83C\uDFE0' };
  assert.deepEqual(parsePhysicalSaveEnvelope(envelope), envelope);
});
test('pending opening-delete command slot is omitted while deleted geometry and performed action evidence remain exact', () => {
  const original = richPhysicalSaveDraft(), deleted = deleteOpening(original, 'door', AT);
  assert.ok(deleted.openingDeleteUndo);
  const envelope = capturePhysicalSaveEnvelope(deleted), opened = restorePhysicalSaveDraft(envelope, 'delete-open');
  assert.equal(Object.hasOwn(envelope.evidence, 'openingDeleteUndo'), false);
  assert.equal(opened.openingDeleteUndo, undefined);
  const deletion = opened.openingEvents!.findLast(event => event.action === 'delete' && event.id === 'door');
  assert.deepEqual(deletion!.before, original.document.openings.find(opening => opening.id === 'door'));
  assert.equal(deletion!.after, null); assert.deepEqual(opened.openingEvents, deleted.openingEvents);
  assert.deepEqual(opened.document, deleted.document); assert.deepEqual(opened.request, deleted.request);
});