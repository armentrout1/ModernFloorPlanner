import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import express from 'express';
import { mountAuthorizedRoutes, privateApiResponses } from '../server/authorizedRoutes';
import { registerRoutes } from '../server/routes';
import { httpErrorHandler } from '../server/httpErrors';
import type { AuthorizationStorage } from '../server/authorizationTypes';
import type { FloorPlan } from '../shared/schema';
import {
  createFixtureStorage, TEST_IDENTITIES, TEST_PRINCIPALS,
  TEST_ORIGIN, TEST_WORKSPACE_A, TEST_WORKSPACE_B,
  type FixtureAuthorizationStorage,
} from './support/authFixtures';

const input = (name = 'Authorized legacy fixture') => ({
  name, createdAt: '2025-06-01T12:00:00.000Z', updatedAt: '2025-06-01T12:00:00.000Z',
  rooms: [{ id: 'legacy-room', name: 'Retained room', x: -20.25, y: 40.5, width: 240, height: 200,
    customMetadata: { note: 'exact legacy metadata', owner: 'not an access grant' },
    objects: [{ id: 'legacy-door', type: 'door', wallSide: 'left', position: 35.75, size: 40,
      doorProperties: { width: 32, height: 80, style: 'single', swingDirection: 'outward', swingSide: 'right' } }],
  }],
});
const authenticated = (who: keyof typeof TEST_IDENTITIES = 'ownerA', authentication: 'session'|'bearer' = 'session') => ({
  status: 'authenticated' as const, identity: TEST_IDENTITIES[who], expiresAt: Date.now() + 60_000, authentication,
});
const seeded = () => {
  const storage = createFixtureStorage([
    { id: 1, ...input('Private workspace A plan') },
    { id: 2, ...input('Private workspace B plan') },
    { id: 3, ...input('Unowned historical plan') },
  ] as FloorPlan[]);
  storage.ownership.set(2, TEST_WORKSPACE_B); storage.ownership.set(3, null);
  return storage;
};
type Api = {
  base: string; storage: FixtureAuthorizationStorage; outcome: { value: any };
  factoryCalls: () => number;
};
type Options = {
  outcome?: any; resolver?: () => Promise<any>; allowedOrigin?: string|null;
  storageFactory?: (storage: FixtureAuthorizationStorage) => AuthorizationStorage|Promise<AuthorizationStorage>;
  normal?: boolean; passForgedDependencies?: boolean;
};
async function withApi(run: (api: Api) => Promise<void>, options: Options = {}) {
  const app = express(); app.use('/api', privateApiResponses); app.use(express.json());
  const storage = seeded(), outcome = { value: options.outcome ?? authenticated() };
  let factoryCalls = 0, server: Server;
  const dependencies = {
    identityResolver: options.resolver ?? (async () => outcome.value),
    storage: async () => { factoryCalls++; return options.storageFactory ? options.storageFactory(storage) : storage; },
    allowedOrigin: options.allowedOrigin === undefined ? TEST_ORIGIN : options.allowedOrigin,
  };
  if (options.normal) {
    // JavaScript callers cannot smuggle the old DI argument into normal composition.
    server = options.passForgedDependencies
      ? await (registerRoutes as any)(app, dependencies)
      : await registerRoutes(app);
  } else {
    mountAuthorizedRoutes(app, dependencies);
    server = createServer(app);
  }
  app.use(httpErrorHandler);
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
  try { await run({ base, storage, outcome, factoryCalls: () => factoryCalls }); }
  finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}
async function request(api: Api, path: string, method = 'GET', body?: unknown, changes: Record<string,string|null> = {}) {
  const headers: Record<string,string> = { 'x-mfp-workspace-id': TEST_WORKSPACE_A };
  if (!['GET','HEAD','OPTIONS'].includes(method)) {
    headers.Origin = TEST_ORIGIN; headers['X-MFP-Request'] = '1';
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  for (const [key, value] of Object.entries(changes)) {
    for (const old of Object.keys(headers)) if (old.toLowerCase() === key.toLowerCase()) delete headers[old];
    if (value !== null) headers[key] = value;
  }
  return fetch(api.base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
const privateResponse = (response: Response) => assert.match(response.headers.get('cache-control') ?? '', /(?:^|,)\s*no-store(?:,|$)/i);
async function denied(response: Response, status: number, code: string) {
  assert.equal(response.status, status); privateResponse(response);
  const text = await response.text();
  assert.doesNotMatch(text, /Private workspace|Unowned historical|private (?:fixture )?database detail|secret-provider|password|stack|postgres:\/\//i);
  const body = JSON.parse(text); assert.equal(body.code, code);
  assert.equal(typeof body.message, 'string'); return body;
}
const mutations = [
  ['/floor-plans', 'POST', input()], ['/floor-plans/1', 'PATCH', { name: 'Changed' }], ['/floor-plans/1', 'DELETE', undefined],
] as const;

test('normal production composition denies every legacy route and cannot activate injected fixture identities', async () => {
  const keys = ['NODE_ENV','DATABASE_URL','MFP_TEST_IDENTITY','MFP_AUTH_TEST_MODE','TEST_AUTH_USER'] as const;
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.NODE_ENV = 'test'; process.env.DATABASE_URL = 'deliberately-not-a-database-url';
  process.env.MFP_TEST_IDENTITY = 'ownerA'; process.env.MFP_AUTH_TEST_MODE = 'true'; process.env.TEST_AUTH_USER = 'ownerA';
  try {
    await withApi(async api => {
      const forged = { 'x-user-id': TEST_PRINCIPALS.ownerA, 'x-role': 'owner', 'x-mfp-test-identity': 'ownerA',
        Authorization: 'Bearer fixture-ownerA', Cookie: 'connect.sid=fixture-ownerA; mfp-test-session=ownerA' };
      for (const [path, method, body] of [['/floor-plans','GET',undefined],['/floor-plans/1','GET',undefined],...mutations] as const)
        await denied(await request(api, path, method, body, forged), 503, 'SIGN_IN_UNAVAILABLE');
      for (const path of [`/workspaces/${TEST_WORKSPACE_A}`,`/workspaces/${TEST_WORKSPACE_A}/memberships`])
        await denied(await request(api, path, 'GET', undefined, forged), 503, 'SIGN_IN_UNAVAILABLE');
      const head = await request(api, '/floor-plans/1', 'HEAD', undefined, forged);
      assert.equal(head.status, 503); privateResponse(head); assert.equal(await head.text(), '');
      assert.equal(api.factoryCalls(), 0); assert.equal(api.storage.reads, 0); assert.equal(api.storage.writes, 0);
    }, { normal: true, passForgedDependencies: true });
  } finally {
    for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
  }
});

test('absent, expired, revoked and invalid identities deny before accessing storage', async () => {
  await withApi(async api => {
    for (const status of ['absent','expired','revoked','invalid']) {
      api.outcome.value = { status };
      await denied(await request(api, '/floor-plans'), 401, 'AUTHENTICATION_REQUIRED');
      await denied(await request(api, '/floor-plans/1', 'PATCH', { name: 'Never saved' }), 401, 'AUTHENTICATION_REQUIRED');
    }
    api.outcome.value = { status: 'unavailable' };
    await denied(await request(api, '/floor-plans'), 503, 'SIGN_IN_UNAVAILABLE');
    assert.equal(api.factoryCalls(), 0); assert.equal(api.storage.reads, 0); assert.equal(api.storage.writes, 0);
  });
});

test('malformed or expired authenticated results do not become principals', async () => {
  await withApi(async api => {
    const valid = authenticated();
    for (const candidate of [null, undefined, {}, { status: 'owner' },
      { ...valid, expiresAt: Date.now() - 1 }, { ...valid, expiresAt: NaN }, { ...valid, expiresAt: Infinity },
      { ...valid, identity: { issuer: '', subject: 'ownerA' } }, { ...valid, identity: { issuer: valid.identity.issuer, subject: '' } },
      { ...valid, identity: { issuer: valid.identity.issuer } }, { ...valid, authentication: 'pretend' }]) {
      api.outcome.value = candidate;
      await denied(await request(api, '/floor-plans'), 401, 'AUTHENTICATION_REQUIRED');
    }
    assert.equal(api.factoryCalls(), 0);
  });
});

test('provider exceptions fail closed and never expose provider credentials', async () => {
  await withApi(async api => {
    await denied(await request(api, '/floor-plans'), 503, 'SIGN_IN_UNAVAILABLE');
    assert.equal(api.factoryCalls(), 0);
  }, { resolver: async () => { throw new Error('secret-provider password=not-for-response'); } });
});

test('verified owner and editor round trips retain authorized legacy payload and server-owned workspace', async () => {
  await withApi(async api => {
    const list = await request(api, '/floor-plans'); assert.equal(list.status, 200); privateResponse(list);
    assert.deepEqual((await list.json() as FloorPlan[]).map(plan => plan.id), [1]);
    api.outcome.value = authenticated('editorA');
    const payload = input(), created = await request(api, '/floor-plans', 'POST', payload);
    assert.equal(created.status, 201); privateResponse(created);
    const saved = await created.json() as FloorPlan;
    assert.deepEqual(saved, { id: 4, ...payload }); assert.equal(api.storage.ownership.get(4), TEST_WORKSPACE_A);
    assert.deepEqual(await (await request(api, '/floor-plans/4')).json(), saved);
    const changed = await request(api, '/floor-plans/4', 'PATCH', { name: 'Editor rename' });
    assert.equal(changed.status, 200); assert.deepEqual((await changed.json() as FloorPlan).rooms, payload.rooms);
    const deleted = await request(api, '/floor-plans/4', 'DELETE'); assert.equal(deleted.status, 204); privateResponse(deleted);
    await denied(await request(api, '/floor-plans/4'), 404, 'RESOURCE_NOT_FOUND');
  });
});

test('workspace A cannot select, list, read, patch or delete B by known workspace and record IDs', async () => {
  await withApi(async api => {
    const before = structuredClone(api.storage.plans), other = { 'x-mfp-workspace-id': TEST_WORKSPACE_B };
    await denied(await request(api, '/floor-plans', 'GET', undefined, other), 404, 'RESOURCE_NOT_FOUND');
    for (const method of ['GET','PATCH','DELETE']) {
      const body = method === 'PATCH' ? { name: 'Cross-workspace overwrite' } : undefined;
      await denied(await request(api, '/floor-plans/2', method, body), 404, 'RESOURCE_NOT_FOUND');
      await denied(await request(api, '/floor-plans/2', method, body, other), 404, 'RESOURCE_NOT_FOUND');
    }
    await denied(await request(api, '/floor-plans', 'POST', input(), other), 404, 'RESOURCE_NOT_FOUND');
    assert.deepEqual(api.storage.plans, before); assert.equal(api.storage.writes, 0);
    api.outcome.value = authenticated('ownerB');
    assert.deepEqual((await (await request(api, '/floor-plans', 'GET', undefined, other)).json() as FloorPlan[]).map(plan => plan.id), [2]);
  });
});

test('viewer reads succeed while forged role, owner and user headers cannot authorize direct writes', async () => {
  await withApi(async api => {
    api.outcome.value = authenticated('viewerA');
    const forged = { 'x-role': 'owner', 'x-user-id': TEST_PRINCIPALS.ownerA, 'x-owner': 'true', 'x-mfp-test-identity': 'ownerA' };
    assert.equal((await request(api, '/floor-plans/1', 'GET', undefined, forged)).status, 200);
    for (const [path, method, body] of mutations) await denied(await request(api, path, method, body, forged), 403, 'ACCESS_DENIED');
    assert.equal(api.storage.writes, 0);
  });
});

test('workspace owner administration is scoped and editor cannot elevate membership or rename workspace', async () => {
  await withApi(async api => {
    const workspace = `/workspaces/${TEST_WORKSPACE_A}`, members = workspace + '/memberships';
    api.outcome.value = authenticated('editorA');
    assert.equal((await request(api, workspace)).status, 200);
    await denied(await request(api, members), 403, 'ACCESS_DENIED');
    await denied(await request(api, workspace, 'PATCH', { name: 'Unauthorized workspace edit' }), 403, 'ACCESS_DENIED');
    await denied(await request(api, members + '/' + TEST_PRINCIPALS.editorA, 'PATCH', { role: 'owner' }), 403, 'ACCESS_DENIED');
    api.outcome.value = authenticated('ownerA');
    assert.equal((await request(api, members)).status, 200);
    assert.equal((await request(api, workspace, 'PATCH', { name: 'Deliberate owner rename' })).status, 200);
    await denied(await request(api, `/workspaces/${TEST_WORKSPACE_B}/memberships`), 404, 'RESOURCE_NOT_FOUND');
    await denied(await request(api, `/workspaces/${TEST_WORKSPACE_B}/memberships/${TEST_PRINCIPALS.ownerB}`, 'PATCH', { role: 'viewer' }), 404, 'RESOURCE_NOT_FOUND');
    for (const body of [{}, { role: 'administrator' }, { status: 'enabled' }, { role: 'owner', principalId: TEST_PRINCIPALS.outsider }])
      await denied(await request(api, members + '/' + TEST_PRINCIPALS.editorA, 'PATCH', body), 400, 'INVALID_REQUEST');
  });
});

test('revoked membership and demoted role take effect on the next operation using the same verified session', async () => {
  await withApi(async api => {
    const memberPath = `/workspaces/${TEST_WORKSPACE_A}/memberships/${TEST_PRINCIPALS.editorA}`;
    assert.equal((await request(api, memberPath, 'PATCH', { role: 'viewer' })).status, 200);
    api.outcome.value = authenticated('editorA');
    assert.equal((await request(api, '/floor-plans/1')).status, 200);
    await denied(await request(api, '/floor-plans/1', 'PATCH', { name: 'Old cached editor role' }), 403, 'ACCESS_DENIED');
    api.outcome.value = authenticated('ownerA');
    assert.equal((await request(api, memberPath, 'PATCH', { status: 'revoked' })).status, 200);
    api.outcome.value = authenticated('editorA');
    await denied(await request(api, '/floor-plans/1'), 404, 'RESOURCE_NOT_FOUND');
    await denied(await request(api, '/floor-plans/1', 'DELETE'), 404, 'RESOURCE_NOT_FOUND');
  });
});

test('membership changes before repository access cannot rely on identity-time permission', async () => {
  await withApi(async api => {
    const before = structuredClone(api.storage.plans);
    await denied(await request(api, '/floor-plans/1', 'PATCH', { name: 'Revoked between boundaries' }), 404, 'RESOURCE_NOT_FOUND');
    assert.deepEqual(api.storage.plans, before); assert.equal(api.storage.writes, 0);
  }, { storageFactory: storage => {
    storage.memberships.get(TEST_WORKSPACE_A)!.get(TEST_PRINCIPALS.ownerA)!.status = 'revoked';
    return storage;
  } });
});

test('verified outsider and same subject from another issuer cannot access workspace records', async () => {
  await withApi(async api => {
    api.outcome.value = authenticated('outsider');
    await denied(await request(api, '/floor-plans'), 404, 'RESOURCE_NOT_FOUND');
    api.outcome.value = { ...authenticated(), identity: { ...TEST_IDENTITIES.ownerA, issuer: 'https://different-issuer.invalid' } };
    await denied(await request(api, '/floor-plans/1'), 404, 'RESOURCE_NOT_FOUND');
    await denied(await request(api, '/floor-plans', 'POST', input()), 404, 'RESOURCE_NOT_FOUND');
    assert.equal(api.storage.writes, 0);
  });
});

test('explicit workspace selection is required and malformed IDs never select the first workspace', async () => {
  await withApi(async api => {
    for (const id of [null, '', 'undefined', TEST_WORKSPACE_A + ',' + TEST_WORKSPACE_B])
      await denied(await request(api, '/floor-plans', 'GET', undefined, { 'x-mfp-workspace-id': id }), 400, 'INVALID_REQUEST');
    for (const id of ['1junk','0','-1','1.5','2147483648'])
      await denied(await request(api, '/floor-plans/' + id), 400, 'INVALID_REQUEST');
    assert.equal(api.storage.reads, 0); assert.equal(api.storage.writes, 0);
  });
});

test('mass-assignment fields cannot create ownership, move plans or elevate authorization', async () => {
  await withApi(async api => {
    const before = structuredClone(api.storage.plans);
    for (const fields of [{ workspaceId: TEST_WORKSPACE_B }, { ownerId: TEST_PRINCIPALS.ownerB }, { role: 'owner' },
      { userId: TEST_PRINCIPALS.ownerA }, { principalId: TEST_PRINCIPALS.ownerB }, { id: 2 }]) {
      await denied(await request(api, '/floor-plans', 'POST', { ...input(), ...fields }), 400, 'INVALID_REQUEST');
      await denied(await request(api, '/floor-plans/1', 'PATCH', { name: 'Never reassigned', ...fields }), 400, 'INVALID_REQUEST');
    }
    assert.deepEqual(api.storage.plans, before); assert.equal(api.storage.ownership.get(1), TEST_WORKSPACE_A); assert.equal(api.storage.writes, 0);
  });
});

test('unowned legacy records remain intact and inaccessible with non-disclosing missing-record responses', async () => {
  await withApi(async api => {
    const before = structuredClone(api.storage.plans.find(plan => plan.id === 3));
    for (const method of ['GET','PATCH','DELETE']) {
      const body = method === 'PATCH' ? { name: 'Cannot claim original' } : undefined;
      const unowned = await denied(await request(api, '/floor-plans/3', method, body), 404, 'RESOURCE_NOT_FOUND');
      const missing = await denied(await request(api, '/floor-plans/999', method, body), 404, 'RESOURCE_NOT_FOUND');
      const foreign = await denied(await request(api, '/floor-plans/2', method, body), 404, 'RESOURCE_NOT_FOUND');
      assert.deepEqual(unowned, missing); assert.deepEqual(unowned, foreign);
    }
    assert.deepEqual(api.storage.plans.find(plan => plan.id === 3), before); assert.equal(api.storage.ownership.get(3), null);
    assert.equal(api.storage.writes, 0);
  });
});

test('storage read, write and lazy-construction failures are generic, fail closed and do not poison later requests', async () => {
  await withApi(async api => {
    const before = structuredClone(api.storage.plans); api.storage.failReads = true;
    await denied(await request(api, '/floor-plans'), 503, 'STORAGE_UNAVAILABLE');
    api.storage.failReads = false; api.storage.failWrites = true;
    for (const [path, method, body] of mutations) await denied(await request(api, path, method, body), 503, 'STORAGE_UNAVAILABLE');
    assert.deepEqual(api.storage.plans, before); api.storage.failWrites = false;
    assert.equal((await request(api, '/floor-plans/1')).status, 200);
  });
  await withApi(async api => {
    await denied(await request(api, '/floor-plans'), 503, 'STORAGE_UNAVAILABLE'); assert.equal(api.storage.reads, 0);
  }, { storageFactory: () => { throw new Error('private database detail postgres://private'); } });
});

test('all cookie and bearer mutations require exact trusted origin and explicit request header', async () => {
  await withApi(async api => {
    const before = structuredClone(api.storage.plans);
    const invalidHeaders: Record<string,string|null>[] = [
      { Origin: null }, { Origin: 'null' }, { Origin: 'https://evil.invalid' },
      { Origin: TEST_ORIGIN + '.evil.invalid' }, { Origin: TEST_ORIGIN + ':444' }, { Origin: TEST_ORIGIN + '/path' },
      { 'X-MFP-Request': null }, { 'X-MFP-Request': 'true' },
      { Origin: 'https://evil.invalid', Host: 'mfp-test.invalid', 'X-Forwarded-Host': 'mfp-test.invalid', 'X-Forwarded-Proto': 'https' },
    ];
    for (const authentication of ['session','bearer'] as const) {
      api.outcome.value = authenticated('ownerA', authentication);
      for (const [path, method, body] of [...mutations,
        [`/workspaces/${TEST_WORKSPACE_A}`, 'PATCH', { name: 'CSRF workspace edit' }],
        [`/workspaces/${TEST_WORKSPACE_A}/memberships/${TEST_PRINCIPALS.editorA}`, 'PATCH', { role: 'owner' }],
      ] as const) for (const headers of invalidHeaders)
        await denied(await request(api, path, method, body, headers), 403, 'REQUEST_ORIGIN_DENIED');
    }
    assert.deepEqual(api.storage.plans, before); assert.equal(api.storage.writes, 0);
    assert.equal((await request(api, '/floor-plans/1', 'PATCH', { name: 'Explicit same-origin write' })).status, 200);
  });
});

test('missing trusted origin configuration denies writes without silently trusting request Host', async () => {
  await withApi(async api => {
    assert.equal((await request(api, '/floor-plans/1')).status, 200);
    await denied(await request(api, '/floor-plans/1', 'PATCH', { name: 'Unconfigured origin' }, { Host: 'mfp-test.invalid' }), 403, 'REQUEST_ORIGIN_DENIED');
    assert.equal(api.storage.writes, 0);
  }, { allowedOrigin: null });
});

test('private responses cannot serve a previous principal or revoked member through conditional cache reuse', async () => {
  await withApi(async api => {
    const response = await request(api, '/floor-plans/1'); assert.equal(response.status, 200); privateResponse(response);
    const etag = response.headers.get('etag'); await response.json();
    api.outcome.value = authenticated('ownerB');
    await denied(await request(api, '/floor-plans/1', 'GET', undefined, etag ? { 'If-None-Match': etag } : {}), 404, 'RESOURCE_NOT_FOUND');
    api.outcome.value = authenticated();
    api.storage.memberships.get(TEST_WORKSPACE_A)!.get(TEST_PRINCIPALS.ownerA)!.status = 'revoked';
    await denied(await request(api, '/floor-plans/1', 'GET', undefined, etag ? { 'If-None-Match': etag } : {}), 404, 'RESOURCE_NOT_FOUND');
    api.outcome.value = { status: 'expired' };
    await denied(await request(api, '/floor-plans/1', 'GET', undefined, etag ? { 'If-None-Match': etag } : {}), 401, 'AUTHENTICATION_REQUIRED');
  });
});


test('normal composition keeps parser errors private without echoing input or invoking storage', async () => {
  await withApi(async api => {
    for (const [body, status, message] of [
      ['{"name":"secret-provider private request",', 400, 'Invalid JSON body'],
      [JSON.stringify({ name: 'x'.repeat(110_000) }), 413, 'Request body too large'],
    ] as const) {
      const response = await fetch(api.base + '/floor-plans', { method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: TEST_ORIGIN, 'X-MFP-Request': '1',
          'x-mfp-workspace-id': TEST_WORKSPACE_A }, body });
      assert.equal(response.status, status); privateResponse(response);
      assert.deepEqual(await response.json(), { message });
      await denied(await request(api, '/floor-plans'), 503, 'SIGN_IN_UNAVAILABLE');
    }
    assert.equal(api.factoryCalls(), 0); assert.equal(api.storage.reads, 0); assert.equal(api.storage.writes, 0);
  }, { normal: true });
});
