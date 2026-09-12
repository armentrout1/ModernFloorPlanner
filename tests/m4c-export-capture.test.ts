import assert from 'node:assert/strict';
import { test } from 'node:test';
import { captureLocalReport } from '../client/src/features/physical-draft/exportReport';
import { basicPhysicalSaveDraft, richPhysicalSaveDraft } from './fixtures/physicalSave';
import { editField, commitField } from '../client/src/features/physical-draft/state';
import { editWaste } from '../client/src/features/physical-draft/takeoffCommands';
import { verifyQuantitySnapshot } from '../shared/quantities/snapshot';
const at = '2026-09-12T12:00:00.000Z';
test('local export captures rich schema five without rewriting draft, evidence or selected work', async () => {
  const draft = richPhysicalSaveDraft(), before = JSON.stringify(draft);
  const snapshot = await captureLocalReport(draft, 'local-export', at);
  assert.equal(JSON.stringify(draft), before); assert.equal(snapshot.sourceDocument.schemaVersion, 5);
  assert.deepEqual(snapshot.sourceDocument, draft.document);
  assert.deepEqual(snapshot.evaluation.calculation.request, draft.request);
  assert.deepEqual(await verifyQuantitySnapshot(snapshot), { ok: true });
  assert.equal(snapshot.instance.kind, 'evaluation');
});
for (const family of ['dimension', 'waste'] as const) test('local export refuses pending ' + family + ' without changing raw text', async () => {
  const draft = family === 'dimension' ? editField(basicPhysicalSaveDraft(), 'room', 'ceilingHeight', '9e') : editWaste(basicPhysicalSaveDraft(), 'floor-area', '1e');
  const before = JSON.stringify(draft);
  await assert.rejects(captureLocalReport(draft, 'local-export', at), /Apply or Revert/);
  assert.equal(JSON.stringify(draft), before);
});
test('captured report remains bound to its original geometry when later edits commit', async () => {
  const draft = basicPhysicalSaveDraft(), first = await captureLocalReport(draft, 'first', at);
  const next = commitField(editField(draft, 'room', 'ceilingHeight', '9 ft'), 'room', 'ceilingHeight', at);
  const second = await captureLocalReport(next, 'second', at);
  const net = (snapshot: typeof first) => snapshot.evaluation.calculation.outputs.find(x => x.output === 'gross-wall-area')!.total!.net / (304.8 ** 2);
  assert.ok(Math.abs(net(first) - 352) < 1e-8); assert.ok(Math.abs(net(second) - 396) < 1e-8);
  assert.notEqual(first.captureFingerprint, second.captureFingerprint);
});
