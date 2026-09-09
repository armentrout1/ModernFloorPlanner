import assert from 'node:assert/strict';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { createServer } from 'node:http';
import { mountAuthorizedRoutes } from '../server/authorizedRoutes';
import { FixtureAuthorizationStorage, createTestIdentityResolver, TEST_WORKSPACE_A, TEST_ORIGIN } from './support/authFixtures';
import type { FloorPlan, InsertFloorPlan } from '../shared/schema';
import { createLegacyFloorPlanSchema } from '../shared/legacyValidation';
import { httpErrorHandler } from '../server/httpErrors';

const legacyPlan = () => ({
  name: 'Legacy sketch',
  createdAt: '2025-06-01T12:00:00.000Z',
  updatedAt: '2025-06-01T12:00:00.000Z',
  rooms: [{
    id: 'room_1748779200000_1', x: -20, y: 40.5, width: 200, height: 240,
    name: 'Living room', color: '#aabbcc', legacyNote: 'Retained metadata',
    objects: [
      ...(['top', 'right', 'bottom', 'left'] as const).map((wallSide, index) => ({
        id: `door-${index}`, type: 'door', wallSide, position: 50, size: 40,
        doorProperties: {
          width: [32, 36, 48, 30][index], height: 80,
          style: ['single', 'double', 'sliding', 'bifold'][index],
          swingDirection: index % 2 ? 'outward' : 'inward', swingSide: index % 2 ? 'right' : 'left',
        },
      })),
      { id: 'window-1', type: 'window', wallSide: 'top', position: 80, size: 30 },
    ],
  }, {
    // Older sketches may have no objects array or a door without doorProperties.
    id: 'room-older', x: 300, y: -25, width: 120.5, height: 180,
    objects: [{ id: 'door-older', type: 'door', wallSide: 'left', position: 50, size: 60 }],
  }, { id: 'room-empty', x: 0, y: 400, width: 100, height: 120 }],
});

class FixtureStorage extends FixtureAuthorizationStorage {
  constructor() { super([{ id: 1, ...legacyPlan() }]); }
}

// Explicit authenticated workspace selection and same-origin mutation evidence
// for this legacy payload suite; the server still authorizes every operation.
const fetch = (input: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  headers.set('x-mfp-workspace-id', TEST_WORKSPACE_A);
  if (!['GET','HEAD','OPTIONS'].includes((init.method ?? 'GET').toUpperCase())) {
    headers.set('Origin', TEST_ORIGIN); headers.set('X-MFP-Request', '1');
  }
  return globalThis.fetch(input, { ...init, headers });
};

async function withApi(
  run: (base: string, storage: FixtureStorage) => Promise<void>,
  configure?: (app: express.Express) => void,
) {
  const storage = new FixtureStorage();
  const app = express();
  app.use(express.json());
  configure?.(app);
  mountAuthorizedRoutes(app, { identityResolver: createTestIdentityResolver(), storage: () => storage, allowedOrigin: TEST_ORIGIN });
  const server = createServer(app);
  app.use(httpErrorHandler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/floor-plans`;
  try {
    await run(base, storage);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const send = (url: string, method: string, body: unknown) => fetch(url, {
  method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

test('legacy POST, GET, partial rename, geometry update and delete round-trip without normalization', async () => {
  await withApi(async (base) => {
    const input = legacyPlan();
    const create = await send(base, 'POST', input);
    assert.equal(create.status, 201);
    const saved = await create.json() as FloorPlan;
    assert.deepEqual(saved, { id: 2, ...input });
    assert.deepEqual(await (await fetch(`${base}/2`)).json(), saved);

    const renamed = await send(`${base}/2`, 'PATCH', { name: 'Renamed', updatedAt: '2026-09-06T12:00:00Z' });
    assert.equal(renamed.status, 200);
    assert.deepEqual((await renamed.json() as FloorPlan).rooms, input.rooms);

    const moved = structuredClone(input.rooms);
    const opening = moved[0].objects!.shift()!;
    moved[1].objects!.push({ ...opening, wallSide: 'bottom', position: 65 });
    moved[0].width = 260;
    const updated = await send(`${base}/2`, 'PATCH', { rooms: moved });
    assert.equal(updated.status, 200);
    assert.deepEqual((await updated.json() as FloorPlan).rooms, moved);
    assert.deepEqual((await (await fetch(`${base}/2`)).json() as FloorPlan).rooms, moved);

    assert.equal((await fetch(`${base}/2`, { method: 'DELETE' })).status, 204);
    assert.equal((await fetch(`${base}/2`)).status, 404);
  });
});

test('empty sketches and legacy date strings remain supported', async () => {
  await withApi(async (base) => {
    const input = { ...legacyPlan(), rooms: [], createdAt: 'Sun Jun 01 2025 12:00:00 GMT+0000 (UTC)' };
    const response = await send(base, 'POST', input);
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { id: 2, ...input });
  });
});

test('invalid nested creates and updates never reach storage or mutate saved sketches', async () => {
  await withApi(async (base, storage) => {
    const before = structuredClone(storage.plans);
    const changes: [string, (input: any) => void][] = [
      ['blank name', (input) => { input.name = '  '; }],
      ['non-array rooms', (input) => { input.rooms = {}; }],
      ['null room', (input) => { input.rooms = [null]; }],
      ['missing room id', (input) => { delete input.rooms[0].id; }],
      ['blank room id', (input) => { input.rooms[0].id = ' '; }],
      ['non-string id', (input) => { input.rooms[0].id = 1; }],
      ['control character id', (input) => { input.rooms[0].id = 'room\n1'; }],
      ['duplicate room id', (input) => { input.rooms[1].id = input.rooms[0].id; }],
      ['duplicate opening id between rooms', (input) => { input.rooms[1].objects[0].id = input.rooms[0].objects[0].id; }],
      ['room and opening id collision', (input) => { input.rooms[0].objects[0].id = input.rooms[0].id; }],
      ['negative width', (input) => { input.rooms[0].width = -1; }],
      ['zero height', (input) => { input.rooms[0].height = 0; }],
      ['string width', (input) => { input.rooms[0].width = '200'; }],
      ['missing coordinate', (input) => { delete input.rooms[0].x; }],
      ['null coordinate', (input) => { input.rooms[0].x = null; }],
      ['non-array objects', (input) => { input.rooms[0].objects = {}; }],
      ['unknown opening type', (input) => { input.rooms[0].objects[0].type = 'arch'; }],
      ['invalid wall', (input) => { input.rooms[0].objects[0].wallSide = 'ceiling'; }],
      ['negative position', (input) => { input.rooms[0].objects[0].position = -1; }],
      ['position above 100', (input) => { input.rooms[0].objects[0].position = 101; }],
      ['zero opening size', (input) => { input.rooms[0].objects[0].size = 0; }],
      ['zero door width', (input) => { input.rooms[0].objects[0].doorProperties.width = 0; }],
      ['negative door height', (input) => { input.rooms[0].objects[0].doorProperties.height = -80; }],
      ['invalid door style', (input) => { input.rooms[0].objects[0].doorProperties.style = 'unknown'; }],
      ['missing door property', (input) => { delete input.rooms[0].objects[0].doorProperties.swingSide; }],
      ['invalid timestamp', (input) => { input.updatedAt = 'not a date'; }],
      ['server-owned id', (input) => { input.id = 5; }],
      ['unknown top-level field', (input) => { input.ownerId = 'other-owner'; }],
    ];
    for (const [label, change] of changes) {
      const input = legacyPlan();
      change(input);
      for (const [url, method] of [[base, 'POST'], [`${base}/1`, 'PATCH']]) {
        const response = await send(url, method, input);
        assert.equal(response.status, 400, `${method}: ${label}`);
        assert.deepEqual(storage.plans, before, `${method} mutated data: ${label}`);
      }
    }
    assert.equal((await send(`${base}/1`, 'PATCH', {})).status, 400);
    assert.equal((await send(base, 'POST', {})).status, 400);
    assert.equal(storage.writes, 0);
  });
});

test('NaN and infinity are rejected by the adapter and overflowing JSON numbers by HTTP routes', async () => {
  for (const value of [NaN, Infinity, -Infinity]) {
    for (const field of ['x', 'y', 'width', 'height'] as const) {
      const input = legacyPlan();
      input.rooms[0][field] = value;
      assert.equal(createLegacyFloorPlanSchema.safeParse(input).success, false, field);
    }
    for (const field of ['position', 'size'] as const) {
      const input = legacyPlan();
      input.rooms[0].objects![0][field] = value;
      assert.equal(createLegacyFloorPlanSchema.safeParse(input).success, false, field);
    }
    for (const field of ['width', 'height'] as const) {
      const input = legacyPlan();
      input.rooms[0].objects![0].doorProperties![field] = value;
      assert.equal(createLegacyFloorPlanSchema.safeParse(input).success, false, `door ${field}`);
    }
  }
  await withApi(async (base, storage) => {
    const before = structuredClone(storage.plans);
    const overflowingJson = JSON.stringify(legacyPlan()).replace('"width":200', '"width":1e400');
    for (const [url, method] of [[base, 'POST'], [`${base}/1`, 'PATCH']]) {
      const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: overflowingJson });
      assert.equal(response.status, 400);
    }
    assert.deepEqual(storage.plans, before);
    assert.equal(storage.writes, 0);
  });
});

test('malformed route IDs cannot read, update or delete a different plan', async () => {
  await withApi(async (base, storage) => {
    const before = structuredClone(storage.plans);
    for (const id of ['1junk', '1.5', '0', '-1', '1e0', '2147483648', '9007199254740992', 'NaN']) {
      for (const method of ['GET', 'PATCH', 'DELETE']) {
        const response = method === 'PATCH'
          ? await send(`${base}/${id}`, method, { name: 'Changed' })
          : await fetch(`${base}/${id}`, { method });
        assert.equal(response.status, 400, `${method} ${id}`);
      }
    }
    assert.equal(storage.reads, 0);
    assert.equal(storage.writes, 0);
    assert.deepEqual(storage.plans, before);
    assert.equal((await fetch(`${base}/999`)).status, 404);
    assert.equal((await send(`${base}/999`, 'PATCH', { name: 'Valid but missing' })).status, 404);
    assert.equal((await fetch(`${base}/999`, { method: 'DELETE' })).status, 404);
  });
});

test('storage failures report retryable server failure without exposing internals or losing existing data', async () => {
  await withApi(async (base, storage) => {
    const before = structuredClone(storage.plans);
    storage.failWrites = true;
    for (const [url, method] of [[base, 'POST'], [`${base}/1`, 'PATCH'], [`${base}/1`, 'DELETE']]) {
      const response = method === 'DELETE'
        ? await fetch(url, { method })
        : await send(url, method, legacyPlan());
      // Storage unavailability is now the explicit fail-closed503 contract.
      assert.equal(response.status, 503);
      assert.doesNotMatch(await response.text(), /private database detail/);
    }
    assert.deepEqual(storage.plans, before);
    assert.equal((await fetch(`${base}/1`)).status, 200);
  });
});


test('malformed JSON and oversized bodies do not write, expose input or stop the service', async () => {
  await withApi(async (base, storage) => {
    const before = structuredClone(storage.plans);
    for (const [url, method] of [[base, 'POST'], [`${base}/1`, 'PATCH']]) {
      const malformed = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body: '{"name":"private sketch input",',
      });
      assert.equal(malformed.status, 400);
      assert.deepEqual(await malformed.json(), { message: 'Invalid JSON body' });
      const subsequent = await fetch(`${base}/1`);
      assert.equal(subsequent.status, 200);
      assert.deepEqual(await subsequent.json(), before[0]);

      const tooLarge = await send(url, method, { ...legacyPlan(), name: 'x'.repeat(110_000) });
      assert.equal(tooLarge.status, 413);
      assert.deepEqual(await tooLarge.json(), { message: 'Request body too large' });
      assert.equal((await fetch(`${base}/1`)).status, 200);
    }
    assert.deepEqual(storage.plans, before);
    assert.equal(storage.writes, 0);
    // A subsequent valid write also works; parser failures do not poison requests.
    assert.equal((await send(`${base}/1`, 'PATCH', { name: 'Saved after invalid input' })).status, 200);
    assert.equal(storage.writes, 1);
  });
});

test('unexpected middleware errors return a generic response and the service continues', async () => {
  await withApi(async (base, storage) => {
    const before = structuredClone(storage.plans);
    const response = await fetch(`${base}/test-error`);
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { message: 'Internal Server Error' });
    assert.equal((await fetch(`${base}/1`)).status, 200);
    assert.deepEqual(storage.plans, before);
  }, (app) => {
    app.get('/api/floor-plans/test-error', () => {
      throw new Error('private service configuration or sketch content');
    });
  });
});
