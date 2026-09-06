import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adaptMeasurementDocument } from '../shared/compatibility/legacyDocument';
import { physicalDocumentSchema, type PhysicalDocument } from '../shared/domain/document';
import { parseMeasurement } from '../shared/domain/parseMeasurement';
import { fromMm, toMm } from '../shared/domain/units';
import { calculateObjectPosition } from '../client/src/utils/canvas';
import { calculateMaterials } from '../client/src/utils/materialCalculator';

const sides = ['top', 'right', 'bottom', 'left'] as const;
const fixture = () => ({
  id: 9, name: 'Preserved sketch',
  createdAt: '2025-06-01T12:00:00.000Z', updatedAt: '2025-06-01T12:00:00.000Z',
  custom: { note: 'Original plan metadata' },
  rooms: [{
    id: 'room-original', name: 'Kitchen', width: 240, height: 200, x: -20, y: 25.5, color: '#123abc',
    notes: { values: [1, null, 'kept'] },
    objects: [
      ...sides.map((wallSide, index) => ({
        id: 'opening-' + index, type: 'door' as const, wallSide, position: 25, size: 32 / 12 * 20,
        note: { originalOrder: index },
        doorProperties: {
          width: 32, height: 80,
          style: (['single', 'double', 'sliding', 'bifold'] as const)[index],
          swingDirection: index % 2 ? 'outward' as const : 'inward' as const,
          swingSide: index % 2 ? 'right' as const : 'left' as const,
          manufacturerNote: 'Preserve me',
        },
      })),
      { id: 'window-original', type: 'window' as const, wallSide: 'top' as const, position: 70, size: 30 },
    ],
  }, { id: 'empty-room', width: 120, height: 140, x: 0, y: 0 }],
});

function converted(input: unknown) {
  const result = adaptMeasurementDocument(input);
  assert.ok('document' in result, JSON.stringify(result));
  return result.document;
}
const close = (actual: number, expected: number) => assert.ok(Math.abs(actual - expected) < 1e-8, actual + ' != ' + expected);
function freezeDeep(value: unknown) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
}

test('legacy 240 by 200 pixels converts to 12 by 10 feet independently of ceiling height', () => {
  const document = converted(fixture()), room = document.rooms[0];
  assert.equal(room.length.state, 'known');
  assert.equal(room.width.state, 'known');
  close(room.length.valueMm!, 3657.6);
  close(room.width.valueMm!, 3048);
  assert.equal(room.ceilingHeight.state, 'unknown');
  assert.equal(room.ceilingHeight.valueMm, null);
  assert.equal(room.presentation!.xMm, -304.8);
  close(room.presentation!.yMm, 388.62);
  assert.deepEqual(document.compatibility!.before, { rooms: 2, openings: 5 });
  assert.deepEqual(document.compatibility!.after, document.compatibility!.before);
});

test('entered 32-inch door uses inches and imported provenance stays unconfirmed', () => {
  const opening = converted(fixture()).openings[0];
  assert.equal(opening.width.state, 'known');
  close(opening.width.valueMm!, 812.8);
  close(opening.height.valueMm!, 2032);
  if (opening.width.state !== 'known') throw new Error('Expected width');
  assert.equal(opening.width.provenance.unit, 'in');
  assert.equal(opening.width.provenance.input, null);
  assert.deepEqual(opening.width.provenance.components[0].precision, { kind: 'unavailable' });
  assert.equal(opening.width.provenance.confirmation.status, 'unconfirmed');
  assert.equal(opening.measureBasis, 'unknown');
});

test('missing opening heights and all unrecorded sills remain unknown', () => {
  const document = converted(fixture());
  const window = document.openings[4];
  assert.equal(window.width.state, 'known');
  close(window.width.valueMm!, 457.2);
  assert.equal(window.height.state, 'unknown');
  assert.equal(window.height.valueMm, null);
  for (const opening of document.openings) assert.equal(opening.sillHeight.valueMm, null);
});

test('conflicting widths yield review candidates without selecting or mutating a width', () => {
  const source = fixture();
  source.rooms[0].objects![0].size = 40;
  const before = structuredClone(source);
  freezeDeep(source);
  const result = adaptMeasurementDocument(source);
  assert.equal(result.status, 'needs-review');
  assert.ok('document' in result);
  const width = result.document.openings[0].width;
  assert.equal(width.state, 'needs-review');
  assert.equal(width.valueMm, null);
  if (width.state !== 'needs-review') throw new Error('Expected review');
  close(width.candidates[0].valueMm, 812.8);
  close(width.candidates[1].valueMm, 609.6);
  for (const candidate of width.candidates) assert.equal(candidate.provenance.confirmation.status, 'needs-review');
  assert.equal(result.document.review[0].code, 'conflicting-widths');
  close(result.document.openings[0].attachments[0].offsetMm, 914.4);
  assert.deepEqual(source, before);
  assert.deepEqual(result.document.compatibility!.original, before);
});

for (const [index, side] of sides.entries()) {
  test('clockwise physical center preserves legacy ' + side + ' wall position and width', () => {
    const source = fixture(), oldRoom = source.rooms[0];
    const document = converted(source), room = document.rooms[0], opening = document.openings[index];
    const length = room.length.valueMm!, width = room.width.valueMm!, offset = opening.attachments[0].offsetMm;
    const relative = side === 'top' ? { x: offset, y: 0 }
      : side === 'right' ? { x: length, y: offset }
      : side === 'bottom' ? { x: length - offset, y: width } : { x: 0, y: width - offset };
    const oldCenter = calculateObjectPosition(oldRoom, side, 25);
    close(relative.x + room.presentation!.xMm, oldCenter.x / 20 * 304.8);
    close(relative.y + room.presentation!.yMm, oldCenter.y / 20 * 304.8);
    close(offset - opening.width.valueMm! / 2, [508, 355.6, 2336.8, 1879.6][index]);
    assert.equal(opening.attachments[0].anchor, 'center');
    assert.equal(opening.attachments[0].wallFaceId, room.wallFaces[index].id);
  });
}

test('legacy corner positions are preserved without clamping or rejecting old sketches', () => {
  const source = fixture();
  source.rooms[0].objects![0].position = 0;
  source.rooms[0].objects![2].position = 100;
  const document = converted(source);
  for (const index of [0, 2]) {
    const opening = document.openings[index];
    assert.equal(opening.attachments[0].offsetMm, 0);
    assert.ok(opening.attachments[0].offsetMm - opening.width.valueMm! / 2 < 0);
  }
});

test('IDs, ordering, names, metadata, all styles and both swings survive', () => {
  const source = fixture(), document = converted(source);
  assert.equal(document.id, source.id);
  assert.equal(document.name, source.name);
  assert.deepEqual(document.rooms.map(room => room.id), source.rooms.map(room => room.id));
  assert.deepEqual(document.openings.map(opening => opening.id), source.rooms[0].objects!.map(object => object.id));
  assert.deepEqual(document.rooms[0].metadata.notes, source.rooms[0].notes);
  assert.equal(document.rooms[0].presentation!.color, source.rooms[0].color);
  for (let index = 0; index < 4; index++) {
    const appearance = document.openings[index].appearance!, properties = source.rooms[0].objects![index].doorProperties!;
    assert.equal(appearance.style, properties.style);
    assert.equal(appearance.swingDirection, properties.swingDirection);
    assert.equal(appearance.swingSide, properties.swingSide);
    assert.equal(appearance.metadata.manufacturerNote, properties.manufacturerNote);
  }
  assert.deepEqual(document.compatibility!.original, source);
  assert.equal(Object.hasOwn((document.compatibility!.original.rooms as object[])[1], 'objects'), false);
});

test('original and output metadata are detached from input and from each other', () => {
  const source = fixture(), before = structuredClone(source);
  freezeDeep(source);
  const document = converted(source);
  (document.rooms[0].metadata.notes as { values: unknown[] }).values.push('changed');
  (document.metadata.custom as { note: string }).note = 'changed';
  assert.deepEqual(document.compatibility!.original, before);
  (document.compatibility!.original.custom as { note: string }).note = 'changed original copy';
  assert.deepEqual(source, before);
});

test('own __proto__ JSON keys survive every legacy metadata level without prototype pollution', () => {
  const source = JSON.parse('{"__proto__":{"plan":"kept"},"rooms":[{"id":"r","x":0,"y":0,"width":240,"height":200,"__proto__":{"room":"kept"},"objects":[{"id":"d","type":"door","wallSide":"top","position":25,"size":60,"__proto__":{"opening":"kept"},"doorProperties":{"style":"single","swingDirection":"inward","swingSide":"left","width":36,"height":80,"__proto__":{"properties":"kept"}}}]}]}');
  const document = converted(source);
  assert.deepEqual(document.compatibility!.original, source);
  assert.deepEqual(document.metadata['__proto__'], { plan: 'kept' });
  assert.deepEqual(document.rooms[0].metadata['__proto__'], { room: 'kept' });
  assert.deepEqual(document.openings[0].metadata['__proto__'], { opening: 'kept' });
  assert.deepEqual(document.openings[0].appearance!.metadata['__proto__'], { properties: 'kept' });
  assert.equal(({} as Record<string, unknown>).plan, undefined);
  assert.deepEqual(converted(document), document);
});

test('older doors without properties retain size basis and flag renderer fallbacks', () => {
  const source = { rooms: [{ id: 'r', x: 0, y: 0, width: 240, height: 200,
    objects: [{ id: 'd', type: 'door', wallSide: 'left', position: 25, size: 60 }] }] };
  const result = adaptMeasurementDocument(source);
  assert.equal(result.status, 'needs-review');
  assert.ok('document' in result);
  const opening = result.document.openings[0];
  close(opening.width.valueMm!, 914.4);
  assert.equal(opening.height.state, 'unknown');
  assert.equal(opening.appearance, undefined);
  assert.equal(result.document.review[0].code, 'legacy-rendering-fallback');
  assert.deepEqual(result.document.compatibility!.original, source);
});

test('v2 reruns retain edited physical values, zero sill, IDs and review state without rescaling', () => {
  const document = converted(fixture());
  const parsed = parseMeasurement('0 mm', { kind: 'elevation' });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) throw new Error('Expected elevation');
  document.openings[4].sillHeight = parsed.measurement;
  const ceiling = parseMeasurement('8 ft');
  assert.ok(ceiling.ok);
  document.rooms[0].ceilingHeight = ceiling.measurement;
  document.rooms[0].presentation!.xMm = toMm(-1.125, 'mm');
  document.metadata.newField = { mm: 1234.5 };
  freezeDeep(document);
  const result = adaptMeasurementDocument(document);
  assert.equal(result.status, 'already-v2');
  assert.ok('document' in result);
  assert.deepEqual(result.document, document);
  assert.notEqual(result.document, document);
  assert.deepEqual(converted(result.document), document);
});

test('version dispatch supports unversioned/1 and explicitly rejects unknown versions', () => {
  assert.deepEqual(converted({ ...fixture(), schemaVersion: 1 }).rooms, converted(fixture()).rooms);
  for (const schemaVersion of [0, 3, -1, '1', '2', null, undefined, {}]) {
    const result = adaptMeasurementDocument({ ...fixture(), schemaVersion });
    assert.equal(result.status, 'unsupported-version', String(schemaVersion));
  }
  assert.equal(adaptMeasurementDocument({ schemaVersion: 2, rooms: [] }).status, 'invalid');
});

test('non-JSON, malformed legacy input and overflow return explicit invalid results', () => {
  const cycle: Record<string, unknown> = { rooms: [] }; cycle.self = cycle;
  for (const source of [null, [], {}, { rooms: 'bad' }, cycle, { rooms: [], bad: NaN }, { rooms: [], bad: () => 1 },
    { rooms: [], bad: new Date() }, { rooms: [], bad: undefined }, { rooms: [], bad: 1n },
    { rooms: [{ id: 'r', x: 0, y: 0, width: 1e308, height: 200 }] },
    { rooms: [{ id: 'r', x: 0, y: 0, width: 0, height: 200 }] }]) {
    assert.equal(adaptMeasurementDocument(source).status, 'invalid');
  }
  const v2 = converted(fixture());
  v2.metadata.invalid = NaN;
  assert.equal(adaptMeasurementDocument(v2).status, 'invalid');
});

test('v2 structural schemas reject invalid IDs, wall order and attachment references', () => {
  const mutations: ((document: PhysicalDocument) => void)[] = [
    doc => { doc.rooms[0].id = ' '; },
    doc => { doc.openings[0].id = '\u0000'; },
    doc => { doc.rooms[1].id = doc.rooms[0].id; },
    doc => { doc.rooms[0].wallFaces[1].id = doc.rooms[0].wallFaces[0].id; },
    doc => { doc.rooms[0].wallFaces[0].side = 'bottom'; },
    doc => { doc.openings[0].attachments[0].wallFaceId = 'missing'; },
    doc => { doc.openings[0].attachments.push({ ...doc.openings[0].attachments[0] }); },
    doc => { doc.rooms[0].length = { ...doc.rooms[0].length, valueMm: toMm(0, 'mm') } as typeof doc.rooms[0]['length']; },
  ];
  for (const mutate of mutations) {
    const document = converted(fixture()); mutate(document);
    assert.equal(physicalDocumentSchema.safeParse(document).success, false);
    assert.equal(adaptMeasurementDocument(document).status, 'invalid');
  }
});

test('wall IDs are deterministic, distinct and do not collide with preserved IDs', () => {
  const source = fixture();
  source.rooms[0].id = 'mfp-wall:["room-original","top"]';
  const first = converted(source);
  const second = converted({ ...source, rooms: [...source.rooms].reverse() });
  assert.deepEqual(first.rooms[0].wallFaces, second.rooms[1].wallFaces);
  const ids = first.rooms.flatMap(room => [room.id, ...room.wallFaces.map(wall => wall.id)]).concat(first.openings.map(opening => opening.id));
  assert.equal(new Set(ids).size, ids.length);
});

test('viewport zoom/pan metadata does not affect physical conversion', () => {
  const base = fixture();
  const a = converted({ ...base, viewport: { zoom: .2, pan: { x: -1000, y: 12 } } });
  const b = converted({ ...base, viewport: { zoom: 10, pan: { x: 9999, y: -234 } } });
  assert.deepEqual(a.rooms, b.rooms);
  assert.deepEqual(a.openings, b.openings);
});

test('conversion quantity comparison reuses the verified M1 calculator', () => {
  const source = fixture(), document = converted(source);
  const before = calculateMaterials(source.rooms);
  // Test projection only: express converted measurements in the existing calculator's
  // legacy units. No second quantity implementation or production reverse adapter.
  const projected = source.rooms.map((room, index) => {
    const physical = document.rooms[index];
    return { ...room, width: fromMm(physical.length.valueMm!, 'ft') * 20,
      height: fromMm(physical.width.valueMm!, 'ft') * 20,
      ...(room.objects ? { objects: room.objects.map(object => {
        const opening = document.openings.find(item => item.id === object.id)!;
        return { ...object, size: fromMm(opening.width.valueMm!, 'ft') * 20,
          ...(object.doorProperties ? { doorProperties: { ...object.doorProperties,
            width: fromMm(opening.width.valueMm!, 'in'), height: fromMm(opening.height.valueMm!, 'in'),
          } } : {}) };
      }) } : {}) };
  });
  const after = calculateMaterials(projected);
  for (const key of ['totalArea', 'totalWallLengthFeet', 'baseboardFeet', 'baseShoeboardFeet', 'doorCount', 'windowCount'] as const) close(before[key], after[key]);
  assert.deepEqual(after.doorSizes, before.doorSizes);
  assert.deepEqual(document.compatibility!.original, source);
});


test('JSON depth limits cannot produce a v2 document that fails on reprocessing', () => {
  for (const depth of [95, 99]) {
    let nested: unknown = {};
    for (let index = 0; index < depth; index++) nested = { child: nested };
    const result = adaptMeasurementDocument({ rooms: [], custom: nested });
    if ('document' in result) {
      assert.equal(adaptMeasurementDocument(result.document).status, 'already-v2');
    } else {
      assert.equal(result.status, 'invalid');
    }
  }
});
