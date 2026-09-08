import assert from 'node:assert/strict';
import test from 'node:test';
import { createDraft, addRoom, editField, commitField, renameRoom, switchUnit, previewDocument,
  insertDraft, createRegistry, updateDraft, selectDraft, type PhysicalDraft } from '../client/src/features/physical-draft/state';
import { createOpeningProposal, addOpening, editOpeningField, commitOpeningField, applyOpeningPreset,
  getOpeningFields, moveOpening, setOpeningBasis, setOpeningAppearance, deleteOpening, undoOpeningDelete,
  openingFieldError, openingValidationMessages, validateOpeningPlacement, type OpeningField } from '../client/src/features/physical-draft/openingCommands';
import { serializeRegistry, parseRegistry, PHYSICAL_DRAFT_STORAGE_KEY } from '../client/src/features/physical-draft/storage';
import { createPhysicalDraftStore } from '../client/src/features/physical-draft/store';
import { calculateQuantities } from '../shared/quantities/engine';
import { toMm, toMm2 } from '../shared/domain/units';
import { type PhysicalOpening } from '../shared/domain/document';
import { type QuantityRequest } from '../shared/quantities/policy';
import { canonicalJson } from '../shared/quantities/canonicalJson';

const AT = '2026-09-08T20:00:00.000Z';
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const appearance = { style: 'single' as const, swingSide: 'right' as const, swingDirection: 'inward' as const, metadata: {} };
function room(draft = createDraft('draft'), id = 'room') {
  draft = addRoom(draft, id);
  for (const [field, text] of [['length', '12 ft'], ['width', '10 ft'], ['ceilingHeight', '8 ft']] as const) {
    draft = commitField(editField(draft, id, field, text), id, field, AT);
  }
  return draft;
}
function enter(draft: PhysicalDraft, id: string, field: OpeningField, text: string) {
  return commitOpeningField(editOpeningField(draft, id, field, text), id, field, AT);
}
function door(draft = room(), id = 'door', wall = 'room:top', offset = 2.5) {
  draft = addOpening(draft, id, 'door', wall, toMm(offset, 'ft'), AT, { appearance });
  draft = enter(draft, id, 'width', '3 ft'); draft = enter(draft, id, 'height', '7 ft');
  draft = enter(draft, id, 'sillHeight', '0');
  return setOpeningBasis(draft, id, 'finished', AT);
}
function fixture() {
  let draft = door();
  draft = addOpening(draft, 'window', 'window', 'room:top', toMm(8, 'ft'), AT);
  draft = enter(draft, 'window', 'width', '4 ft'); draft = enter(draft, 'window', 'height', '3 ft');
  draft = enter(draft, 'window', 'sillHeight', '3 ft');
  return setOpeningBasis(draft, 'window', 'finished', AT);
}
function request(draft: PhysicalDraft): QuantityRequest {
  const walls = draft.document.rooms.flatMap(value => value.wallFaces.map(wall => wall.id));
  return { policy: { version: 'rectangular-flat-v2', openingMeasureBasis: 'finished', crownFullHeightGaps: [] }, selections: [
    { output: 'floor-area', roomIds: ['room'], wasteFraction: 0 }, { output: 'ceiling-area', roomIds: ['room'], wasteFraction: 0 },
    ...(['gross-wall-area', 'net-wall-area', 'baseboard', 'base-shoe'] as const).map(output => ({ output, wallFaceIds: walls, wasteFraction: 0 })),
    { output: 'opening-inventory', openingIds: draft.document.openings.map(opening => opening.id) },
  ] };
}
function evaluation(draft: PhysicalDraft) {
  const result = calculateQuantities(previewDocument(draft), request(draft)); assert.ok(result.ok); return result.calculation;
}
function fullOpening(draft: PhysicalDraft, id = 'door') { const result = draft.document.openings.find(opening => opening.id === id); assert.ok(result); return result; }

test('new opening presets are explicit unconfirmed proposals with no invented height/sill/basis', () => {
  const draft = addOpening(room(), 'new', 'door', 'room:top', toMm(5, 'ft'), AT, { widthMm: toMm(32, 'in'), appearance });
  const opening = fullOpening(draft, 'new');
  assert.equal(opening.width.state, 'known');
  if (opening.width.state === 'known') {
    assert.equal(opening.width.valueMm, toMm(32, 'in')); assert.equal(opening.width.provenance.source, 'inferred');
    assert.equal(opening.width.provenance.confirmation.status, 'unconfirmed');
  }
  assert.equal(opening.height.state, 'unknown'); assert.equal(opening.sillHeight.state, 'unknown'); assert.equal(opening.measureBasis, 'unknown');
  assert.equal(openingValidationMessages(draft, 'new').status, 'undetermined');
  const plain = createOpeningProposal('plain', 'window', 'room:top', toMm(1, 'ft'));
  assert.equal(plain.width.state, 'unknown'); assert.equal(plain.appearance, undefined);
});

test('actual physical fixture yields 120/120/352/319 square feet, 41 feet trim and two distinct openings', () => {
  const draft = fixture(), result = evaluation(draft);
  for (const [name, number] of [['floor-area', 120], ['ceiling-area', 120], ['gross-wall-area', 352], ['net-wall-area', 319]] as const) {
    const output = result.outputs.find(value => value.output === name); assert.ok(output?.total);
    assert.ok(Math.abs(output.total.net - toMm2(number, 'ft')) < 1e-6);
  }
  for (const name of ['baseboard', 'base-shoe']) {
    const output = result.outputs.find(value => value.output === name); assert.ok(output?.total);
    assert.ok(Math.abs(output.total.net - toMm(41, 'ft')) < 1e-6);
  }
  assert.deepEqual(draft.document.openings.map(opening => opening.kind), ['door', 'window']);
  assert.equal(result.outputs.find(value => value.output === 'opening-inventory')!.total!.net, 2);
});

test('all four wall center offsets stay physical and clockwise with exact fractional and metric input', () => {
  let draft = room();
  for (const [index, wall] of ['top', 'right', 'bottom', 'left'].entries()) {
    const id = 'opening-' + index;
    draft = addOpening(draft, id, 'window', 'room:' + wall, toMm(2, 'ft'), AT);
    draft = enter(draft, id, 'width', '32 in');
    draft = enter(draft, id, 'offset', '2 ft 6 1/2 in');
    assert.equal(fullOpening(draft, id).attachments[0].offsetMm, toMm(30.5, 'in'));
    assert.equal(getOpeningFields(draft, id).offset.text, '2 ft 6 1/2 in');
  }
  draft = enter(draft, 'opening-0', 'width', '0.8128 m');
  const width = fullOpening(draft, 'opening-0').width; assert.equal(width.state, 'known');
  if (width.state === 'known') assert.equal(width.valueMm, toMm(32, 'in'));
});

test('Enter plus blur commits once and common presets use one atomic independent dimension action', () => {
  const draft = door(), raw = editOpeningField(draft, 'door', 'width', '32 in');
  const committed = commitOpeningField(raw, 'door', 'width', AT);
  assert.equal(committed.localEditRevision, raw.localEditRevision + 1);
  assert.equal(committed.events.length, raw.events.length + 1);
  assert.equal(commitOpeningField(committed, 'door', 'width', AT), committed);
  const otherRaw = editOpeningField(committed, 'door', 'height', '6 ft 2');
  const preset = applyOpeningPreset(otherRaw, 'door', 'width', '30 in', AT);
  assert.equal(preset.localEditRevision, otherRaw.localEditRevision + 1);
  assert.deepEqual(getOpeningFields(preset, 'door').height, getOpeningFields(otherRaw, 'door').height);
  assert.equal(fullOpening(preset).width.state, 'known');
  if (fullOpening(preset).width.state === 'known') assert.equal(fullOpening(preset).width.provenance.source, 'inferred');
});

test('window height and sill edits remain independent including explicitly entered zero sill', () => {
  const draft = fixture(), before = clone(fullOpening(draft, 'window'));
  const next = enter(draft, 'window', 'height', '2 ft 8 in');
  assert.deepEqual(fullOpening(next, 'window').width, before.width);
  assert.deepEqual(fullOpening(next, 'window').sillHeight, before.sillHeight);
  const zero = enter(next, 'window', 'sillHeight', '0');
  assert.equal(fullOpening(zero, 'window').sillHeight.state, 'known');
  assert.deepEqual(fullOpening(zero, 'window').height, fullOpening(next, 'window').height);
});

test('invalid syntax and demonstrated corner/overlap/above-ceiling edits preserve canonical values and visible raw drafts', () => {
  const draft = fixture(), before = canonicalJson(draft.document);
  for (const [field, text, expected] of [['width', '12 ft 6', /incomplete|syntax/], ['offset', '0 ft', /center/],
    ['height', '10 ft', /ceiling/], ['offset', '8 ft', /Overlap/]] as const) {
    const raw = editOpeningField(draft, 'door', field, text);
    assert.throws(() => commitOpeningField(raw, 'door', field, AT), expected);
    assert.equal(canonicalJson(raw.document), before); assert.equal(getOpeningFields(raw, 'door')[field].text, text);
    assert.equal(getOpeningFields(raw, 'door')[field].dirty, true);
  }
  assert.ok(openingFieldError({ text: '-1', unit: 'ft', dirty: true }, 'sillHeight'));
  assert.ok(openingFieldError({ text: '', unit: 'ft', dirty: true }, 'offset'));
});

test('unknown dimensions permit explicitly incomplete placement but never claim verified fit', () => {
  const draft = room();
  const proposed = createOpeningProposal('unknown', 'window', 'room:top', toMm(0.1, 'ft'));
  const preview = validateOpeningPlacement(draft, proposed);
  assert.equal(preview.status, 'undetermined'); assert.ok(preview.messages.some(message => message.includes('Not verified')));
  const added = addOpening(draft, 'unknown', 'window', 'room:top', toMm(0.1, 'ft'), AT);
  assert.equal(fullOpening(added, 'unknown').width.state, 'unknown');
  assert.throws(() => applyOpeningPreset(added, 'unknown', 'width', '32 in', AT), /center/);
  assert.equal(added.document.openings.length, 1); assert.equal(draft.document.openings.length, 0);
});

test('along-wall/cross-wall/cross-room move preserves identity, dimensions, appearance, unrelated raw fields and room overview positions', () => {
  let draft = door(room(room(), 'other'));
  draft = editOpeningField(draft, 'door', 'height', '7 ft 2');
  const before = clone(fullOpening(draft)), rooms = clone(draft.document.rooms), measurementEvents = clone(draft.events);
  for (const [wall, offset] of [['room:top', 4], ['room:bottom', 6], ['other:left', 3]] as const) {
    const previousRevision = draft.localEditRevision, count = draft.openingEvents!.length;
    draft = moveOpening(draft, 'door', wall, toMm(offset, 'ft'), AT);
    assert.equal(draft.localEditRevision, previousRevision + 1); assert.equal(draft.openingEvents!.length, count + 1);
    assert.equal(fullOpening(draft).attachments[0].wallFaceId, wall);
    assert.equal(fullOpening(draft).attachments[0].offsetMm, toMm(offset, 'ft'));
  }
  const after = clone(fullOpening(draft)); after.attachments = before.attachments;
  assert.deepEqual(after, before); assert.deepEqual(draft.events, measurementEvents); assert.deepEqual(draft.document.rooms, rooms);
  assert.equal(getOpeningFields(draft, 'door').height.text, '7 ft 2');
});

test('invalid move rejects atomically and unchanged placement is a no-op', () => {
  const draft = fixture(), before = clone(draft);
  assert.throws(() => moveOpening(draft, 'door', 'room:top', toMm(8, 'ft'), AT), /Overlap/);
  assert.throws(() => moveOpening(draft, 'door', 'missing', toMm(2, 'ft'), AT), /attachments/);
  assert.throws(() => moveOpening(draft, 'door', 'room:left', -1, AT), /nonnegative/);
  assert.deepEqual(draft, before);
  assert.equal(moveOpening(draft, 'door', 'room:top', toMm(2.5, 'ft'), AT), draft);
});

test('stale drag revision and switched draft cannot commit duplicate/newer geometry', () => {
  const initial = door(), capturedRevision = initial.localEditRevision;
  let registry = insertDraft(createRegistry(), initial);
  registry = updateDraft(registry, 'draft', capturedRevision, draft => moveOpening(draft, 'door', 'room:bottom', toMm(4, 'ft'), AT));
  const newer = clone(registry);
  assert.throws(() => updateDraft(registry, 'draft', capturedRevision, draft => moveOpening(draft, 'door', 'room:left', toMm(4, 'ft'), AT)), /selected draft changed/);
  assert.deepEqual(registry, newer);
  registry = insertDraft(registry, createDraft('other'));
  assert.throws(() => updateDraft(registry, 'draft', capturedRevision + 1, draft => deleteOpening(draft, 'door', AT)), /selected draft changed/);
  registry = selectDraft(registry, 'draft'); assert.equal(registry.drafts[0].document.openings.length, 1);
});

test('appearance/basis changes cannot change dimensions and never fabricate appearance on floor openings', () => {
  const draft = door(), before = clone(fullOpening(draft));
  for (const style of ['single', 'double', 'sliding', 'bifold'] as const) {
    const next = setOpeningAppearance(draft, 'door', { ...appearance, style, swingSide: 'left', swingDirection: 'outward' }, AT);
    const after = clone(fullOpening(next)); after.appearance = before.appearance; assert.deepEqual(after, before);
    assert.deepEqual(next.events, draft.events);
  }
  const changed = setOpeningBasis(draft, 'door', 'rough', AT);
  assert.deepEqual(fullOpening(changed).width, before.width); assert.deepEqual(fullOpening(changed).appearance, before.appearance);
  const opening = addOpening(room(), 'gap', 'floor-level-opening', 'room:top', toMm(6, 'ft'), AT);
  assert.equal(fullOpening(opening, 'gap').appearance, undefined);
  assert.throws(() => setOpeningAppearance(opening, 'gap', appearance, AT), /Only doors/);
  assert.throws(() => enter(opening, 'gap', 'sillHeight', '1 in'), /zero sill/);
});

test('shared opening dimensional edits validate both faces while movement/offset remain specifically protected', () => {
  let draft = door(room(room(), 'other'));
  fullOpening(draft).attachments.push({ wallFaceId: 'other:bottom', anchor: 'center', offsetMm: toMm(2, 'ft') });
  const before = clone(draft), raw = editOpeningField(draft, 'door', 'width', '5 ft');
  assert.throws(() => commitOpeningField(raw, 'door', 'width', AT), /center/);
  assert.throws(() => moveOpening(draft, 'door', 'room:top', toMm(4, 'ft'), AT), /two shared attachments/);
  assert.throws(() => editOpeningField(draft, 'door', 'offset', '4 ft'), /two shared attachments/);
  const valid = enter(draft, 'door', 'width', '32 in');
  assert.equal(fullOpening(valid).attachments.length, 2); assert.deepEqual(fullOpening(valid).attachments, fullOpening(before).attachments);
  assert.deepEqual(draft, before);
});

test('delete targets one opening, undo restores attachment order/raw/evidence while retaining unrelated edits', () => {
  let draft = fixture(); draft = editOpeningField(draft, 'door', 'width', '2 ft 8');
  const opening = clone(fullOpening(draft)), fields = clone(getOpeningFields(draft, 'door')), events = clone(draft.events);
  const deleted = deleteOpening(draft, 'door', AT);
  assert.equal(deleted.document.rooms.length, 1); assert.deepEqual(deleted.document.openings.map(item => item.id), ['window']);
  assert.deepEqual(deleted.events, events);
  const unrelated = renameRoom(deleted, 'room', 'Preserved newer name');
  const restored = undoOpeningDelete(unrelated, AT);
  assert.deepEqual(restored.document.openings.map(item => item.id), ['door', 'window']);
  assert.deepEqual(fullOpening(restored), opening); assert.deepEqual(getOpeningFields(restored, 'door'), fields);
  assert.deepEqual(restored.events, events); assert.equal(restored.document.rooms[0].name, 'Preserved newer name');
  assert.equal(restored.openingDeleteUndo, undefined); assert.equal(undoOpeningDelete(restored, AT), restored);
});

test('deletion undo rejects missing parents or reused identity and retains recovery for retry', () => {
  const deleted = deleteOpening(door(), 'door', AT), missing = clone(deleted);
  missing.document.rooms = [];
  assert.throws(() => undoOpeningDelete(missing, AT), /parent wall no longer exists/);
  assert.ok(missing.openingDeleteUndo);
  const replaced = addOpening(deleted, 'door', 'window', 'room:top', toMm(5, 'ft'), AT);
  assert.throws(() => undoOpeningDelete(replaced, AT), /already present/);
});

test('delete/undo preserves shared identity and attachment order and scoped requests remain valid', () => {
  let draft = door(room(room(), 'other'));
  fullOpening(draft).attachments.push({ wallFaceId: 'other:bottom', anchor: 'center', offsetMm: toMm(2, 'ft') });
  draft.request = request(draft);
  const before = clone(draft), deleted = deleteOpening(draft, 'door', AT);
  assert.equal(deleted.document.openings.length, 0);
  const read = parseRegistry(serializeRegistry(insertDraft(createRegistry(), deleted))); assert.equal(read.status, 'recovered');
  const restored = undoOpeningDelete(deleted, AT);
  assert.deepEqual(fullOpening(restored).attachments, fullOpening(before).attachments);
  assert.deepEqual(restored.request, before.request); assert.equal(restored.document.openings.length, 1);
});

test('pending dimension/offset masks dependent outputs without altering canonical values or independent room totals', () => {
  const draft = fixture(), before = clone(draft.document);
  for (const [field, text] of [['width', '32 in'], ['height', '6 ft 2'], ['sillHeight', ''], ['offset', '8 ft']] as const) {
    const pending = editOpeningField(draft, 'door', field, text), result = evaluation(pending);
    assert.equal(result.outputs.find(value => value.output === 'net-wall-area')!.total, null);
    assert.ok(result.outputs.find(value => value.output === 'floor-area')!.total);
    assert.ok(result.outputs.find(value => value.output === 'gross-wall-area')!.total);
    assert.deepEqual(pending.document, before);
  }
});

test('unit switching retains unfinished opening context then releases it on commit/clear without rounding geometry', () => {
  let draft = door(); const original = clone(draft.document), evidence = clone(draft.events);
  draft = switchUnit(draft, 'm'); assert.deepEqual(draft.document, original); assert.deepEqual(draft.events, evidence);
  draft = editOpeningField(switchUnit(draft, 'ft'), 'door', 'width', '2 ft 8 in');
  draft = switchUnit(draft, 'm'); assert.equal(getOpeningFields(draft, 'door').width.unit, 'ft');
  draft = commitOpeningField(draft, 'door', 'width', AT);
  assert.equal(getOpeningFields(draft, 'door').width.unit, 'm'); assert.equal(getOpeningFields(draft, 'door').width.text, '0.8128 m');
  draft = switchUnit(editOpeningField(switchUnit(draft, 'ft'), 'door', 'height', ''), 'm');
  draft = commitOpeningField(draft, 'door', 'height', AT); assert.equal(getOpeningFields(draft, 'door').height.unit, 'm');
  draft = enter(draft, 'door', 'height', '2');
  assert.equal(fullOpening(draft).height.state, 'known');
  if (fullOpening(draft).height.state === 'known') assert.equal(fullOpening(draft).height.valueMm, 2000);
});

test('recovery preserves raw opening fields, typed actions, undo and independent originals exactly', () => {
  let draft = fixture(); const original = clone(draft.source);
  draft = editOpeningField(draft, 'door', 'width', '2 ft 8'); draft = deleteOpening(draft, 'window', AT);
  const registry = insertDraft(createRegistry(), draft), recovered = parseRegistry(serializeRegistry(registry));
  assert.equal(recovered.status, 'recovered');
  if (recovered.status === 'recovered') assert.deepEqual(recovered.registry, registry);
  assert.deepEqual(draft.source, original);
  const old = insertDraft(createRegistry(), room());
  assert.equal(old.drafts[0].openingFields, undefined);
  const oldRead = parseRegistry(serializeRegistry(old)); assert.equal(oldRead.status, 'recovered');
  if (oldRead.status === 'recovered') assert.deepEqual(oldRead.registry, old);
});

test('recovery rejects forged clean opening values and malformed identity/action evidence', () => {
  const registry = insertDraft(createRegistry(), fixture());
  const wrongText = clone(registry); wrongText.drafts[0].openingFields!.door.offset.text = '99 ft';
  assert.equal(parseRegistry(JSON.stringify(wrongText)).status, 'corrupt');
  const missing = clone(registry); delete (missing.drafts[0].openingFields!.door as Partial<Record<OpeningField, unknown>>).height;
  assert.equal(parseRegistry(JSON.stringify(missing)).status, 'corrupt');
  const wrongEvent = clone(registry); wrongEvent.drafts[0].openingEvents![0].id = 'other';
  assert.equal(parseRegistry(JSON.stringify(wrongEvent)).status, 'corrupt');
});

test('room dimension edits leave openings intact and immediately expose newly invalid fit', () => {
  const draft = fixture(), openings = clone(draft.document.openings);
  const changed = commitField(editField(draft, 'room', 'ceilingHeight', '6 ft'), 'room', 'ceilingHeight', AT);
  assert.deepEqual(changed.document.openings, openings);
  assert.equal(openingValidationMessages(changed, 'door').status, 'invalid');
  assert.ok(openingValidationMessages(changed, 'door').messages.some(message => message.includes('ceiling')));
});

test('registry store preserves rejected opening raw edits and never writes a stale gesture', () => {
  const values = new Map<string, string>();
  const store = createPhysicalDraftStore(() => ({ getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); }, removeItem: key => { values.delete(key); } }));
  store.dispatch(registry => insertDraft(registry, fixture()));
  const captured = store.getSnapshot().registry.drafts[0];
  assert.ok(store.updateDraft('draft', captured.localEditRevision, draft => editOpeningField(draft, 'door', 'height', '10 ft')));
  const raw = store.getSnapshot().registry.drafts[0], saved = values.get(PHYSICAL_DRAFT_STORAGE_KEY);
  assert.equal(store.updateDraft('draft', raw.localEditRevision, draft => commitOpeningField(draft, 'door', 'height', AT)), false);
  assert.equal(values.get(PHYSICAL_DRAFT_STORAGE_KEY), saved); assert.match(store.getSnapshot().error, /ceiling/);
  assert.equal(store.updateDraft('draft', captured.localEditRevision, draft => moveOpening(draft, 'door', 'room:left', toMm(3, 'ft'), AT)), false);
  assert.equal(getOpeningFields(store.getSnapshot().registry.drafts[0], 'door').height.text, '10 ft');
});


test('pending center text blocks dragging and stays intact while other pending fields make prospective fit unverified', () => {
  const draft = editOpeningField(door(), 'door', 'offset', '3 ft 2');
  assert.throws(() => moveOpening(draft, 'door', 'room:bottom', toMm(4, 'ft'), AT), /Finish the pending center-position edit/);
  assert.equal(getOpeningFields(draft, 'door').offset.text, '3 ft 2');
  assert.equal(validateOpeningPlacement(draft, fullOpening(draft)).status, 'undetermined');
  const pendingWidth = editOpeningField(door(), 'door', 'width', '32 in');
  const proposed = clone(fullOpening(pendingWidth)); proposed.attachments[0].offsetMm = toMm(4, 'ft');
  assert.equal(validateOpeningPlacement(pendingWidth, proposed).status, 'undetermined');
  const moved = moveOpening(pendingWidth, 'door', 'room:bottom', toMm(4, 'ft'), AT);
  assert.equal(getOpeningFields(moved, 'door').width.text, '32 in');
  assert.equal(getOpeningFields(moved, 'door').width.dirty, true);
});

test('unknown or unsupported wall models and unknown appearance never report verified opening placement', () => {
  for (const value of ['unknown', 'unsupported'] as const) {
    const draft = door();
    draft.document.calculationContract!.rooms.room.walls = { value, source: 'manual', confirmation: { status: 'unconfirmed' }, detail: 'Nonuniform finished wall' };
    const status = openingValidationMessages(draft, 'door');
    assert.equal(status.status, 'undetermined'); assert.ok(status.messages.some(message => message.includes('Vertical fit is not verified')));
  }
  const draft = door(); delete fullOpening(draft).appearance;
  assert.equal(openingValidationMessages(draft, 'door').status, 'undetermined');
  assert.ok(openingValidationMessages(draft, 'door').messages.some(message => message.includes('appearance is unrecorded')));
});

test('position input evidence retains original fractional syntax/unit after a display-unit change', () => {
  let draft = enter(door(), 'door', 'offset', '3 ft 6 1/2 in');
  const event = draft.openingEvents!.at(-1)!;
  assert.deepEqual(event.input, { field: 'offset', text: '3 ft 6 1/2 in', unit: 'ft' });
  draft = switchUnit(draft, 'm');
  assert.deepEqual(draft.openingEvents!.at(-1)!.input, event.input);
  assert.equal(fullOpening(draft).attachments[0].offsetMm, toMm(42.5, 'in'));
  assert.equal(parseRegistry(serializeRegistry(insertDraft(createRegistry(), draft))).status, 'recovered');
});

test('recovery rejects a disguised geometry mutation in appearance history and forged deletion raw text', () => {
  const draft = setOpeningAppearance(door(), 'door', { ...appearance, swingSide: 'left' }, AT);
  const registry = insertDraft(createRegistry(), draft), forged = clone(registry);
  const event = forged.drafts[0].openingEvents!.at(-1)!;
  event.after!.attachments[0].offsetMm = toMm(5, 'ft');
  assert.equal(parseRegistry(JSON.stringify(forged)).status, 'corrupt');
  const deleted = insertDraft(createRegistry(), deleteOpening(door(), 'door', AT));
  deleted.drafts[0].openingDeleteUndo!.fields.width.text = '99 ft';
  assert.equal(parseRegistry(JSON.stringify(deleted)).status, 'corrupt');
});

test('special opening IDs derive missing legacy fields safely and survive commands and recovery', () => {
  let draft = addOpening(room(), '__proto__', 'window', 'room:top', toMm(4, 'ft'), AT);
  draft = addOpening(draft, 'constructor', 'window', 'room:bottom', toMm(4, 'ft'), AT);
  delete draft.openingFields!.constructor;
  assert.equal(getOpeningFields(draft, 'constructor').width.text, '');
  draft = enter(draft, 'constructor', 'width', '32 in');
  draft = switchUnit(draft, 'm');
  assert.equal(getOpeningFields(draft, 'constructor').width.text, '0.8128 m');
  const registry = insertDraft(createRegistry(), draft), recovered = parseRegistry(serializeRegistry(registry));
  assert.equal(recovered.status, 'recovered');
  if (recovered.status === 'recovered') assert.deepEqual(recovered.registry, registry);
});
