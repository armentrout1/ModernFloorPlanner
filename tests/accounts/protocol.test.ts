import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { startFixtureProcess } from './runtime.mjs';
import { configureIssuer, issuerEvents, type IssuerFailure } from './control';

const origin = process.env.MFP_ACCOUNTS_APP_ORIGIN!;
const issuer = process.env.MFP_ACCOUNTS_ISSUER_ORIGIN!;
assert.equal(origin, 'https://127.0.0.2:54420');
assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/mfp_accounts_[a-f0-9]+_test$/);
const db = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
let app: Awaited<ReturnType<typeof startFixtureProcess>>;
async function restart(overrides: NodeJS.ProcessEnv = {}) {
  if (app) await app.stop();
  app = await startFixtureProcess('tests/accounts/app-server.ts', { ...process.env, ...overrides }, 'MFP_TEST_APP_READY');
}
before(async () => { await restart(); });
after(async () => { if (app) await app.stop(); await db.end(); });
type Status = { status: string; contextToken: string | null; principal: { id: string; displayName: string } | null;
  workspace: { id: string; role: string } | null; workspaces: { id: string; role: string }[] };
class Client {
  cookie = ''; context: string | null = null; workspace: string | null = null;
  async request(path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) {
    const response = await fetch(new URL(path, origin), { method, redirect: 'manual', headers: {
      ...(this.cookie ? { Cookie: this.cookie } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(method === 'GET' ? {} : { Origin: origin, 'X-MFP-Request': '1' }),
      ...(this.context ? { 'X-MFP-Context': this.context } : {}), ...(this.workspace ? { 'X-MFP-Workspace-Id': this.workspace } : {}), ...extra,
    }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    for (const item of response.headers.getSetCookie()) if (item.startsWith('__Host-mfp-session=')) this.cookie = item.split(';')[0];
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    return response;
  }
  async status() { const r = await this.request('/api/auth/session'); assert.equal(r.status, 200); const status = await r.json() as Status;
    this.context = status.contextToken; this.workspace = status.workspace?.id ?? null; return status; }
  async begin(returnPath = '/physical-draft') {
    if (!this.context) await this.status();
    const response = await this.request('/api/auth/login', 'POST', { returnPath });
    assert.equal(response.status, 200, 'Login initiation must succeed');
    const { authorizationUrl } = await response.json();
    const target = new URL(authorizationUrl);
    assert.ok(target.origin === issuer); assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
    assert.equal(target.searchParams.get('scope'), 'openid');
    assert.ok(target.searchParams.has('state') && target.searchParams.has('nonce') && target.searchParams.has('code_challenge'));
    return authorizationUrl as string;
  }
  async choose(url: string, account = 'account-a') {
    const page = await fetch(url, { redirect: 'manual' }); assert.equal(page.status, 200);
    const html = await page.text(); const match = html.match(/action="([^"]+)"/); assert.ok(match, 'Issuer form missing');
    const response = await fetch(new URL(match[1], issuer), { method: 'POST', redirect: 'manual',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ account }) });
    assert.equal(response.status, 303); const location = response.headers.get('location'); assert.ok(location); return location;
  }
  async callback(url: string, outcome = 'success') {
    const response = await this.request(url); assert.equal(response.status, 303);
    const location = new URL(response.headers.get('location')!, origin);
    assert.equal(location.pathname, '/account/callback'); assert.equal(location.searchParams.get('result'), outcome);
    if (outcome === 'success') {
      const cookie = response.headers.getSetCookie().find(item => item.startsWith('__Host-mfp-session=')) || '';
      assert.ok(/; Secure/i.test(cookie) && /; HttpOnly/i.test(cookie) && /; Path=\//i.test(cookie) && /; SameSite=Lax/i.test(cookie));
      assert.ok(!/; Domain=/i.test(cookie));
    }
    assert.ok(!location.searchParams.has('code') && !location.searchParams.has('state') && !location.searchParams.has('id_token'));
    return response;
  }
  async login(account = 'account-a') { await configureIssuer(); await this.callback(await this.choose(await this.begin(), account)); return this.status(); }
  async create(name = 'Synthetic workspace', key = randomUUID()) {
    const response = await this.request('/api/workspaces', 'POST', { name, idempotencyKey: key }); assert.equal(response.status, 201); return response.json();
  }
  async select(id: string | null) {
    const response = await this.request('/api/auth/workspace', 'POST', { workspaceId: id }); assert.equal(response.status, 200);
    const status = await response.json() as Status; this.context = status.contextToken; this.workspace = status.workspace?.id ?? null; return status;
  }
}

test('real HTTPS discovery, S256 code exchange and verified signing keys create exact issuer/subject and rotate opaque session', async () => {
  const client = new Client(); const before = await client.status(); const priorCookie = client.cookie;
  assert.equal(before.status, 'anonymous'); assert.ok(priorCookie.startsWith('__Host-mfp-session='));
  const result = await client.login(); assert.equal(result.status, 'authenticated'); assert.ok(result.principal);
  assert.ok(client.cookie !== priorCookie, 'Authentication must rotate the session identifier');
  const [row] = await db`select issuer,subject from external_identities where principal_id=${result.principal.id}`;
  assert.deepEqual(row, { issuer, subject: 'account-a' }); assert.equal(result.workspace, null);
  const evidence = await issuerEvents(); assert.ok(evidence.discovery && evidence.jwks && evidence.token);
  const response = await client.request('/api/auth/session');
  assert.equal(response.headers.getSetCookie().length, 0, 'Ordinary reads must not reissue an older cookie');
  const body = await response.text(); assert.ok(!/access_token|id_token|refresh_token|client_secret|code_verifier|sessionID/.test(body));
});

for (const mode of ['wrong-issuer', 'wrong-audience', 'wrong-azp', 'wrong-nonce', 'wrong-signature', 'expired-token',
  'expired-code', 'wrong-pkce', 'wrong-state', 'token-failure', 'missing-id-token', 'malformed-token'] as IssuerFailure[]) {
  test(`production OIDC client rejects ${mode} without creating an authenticated session`, async () => {
    const client = new Client(); await configureIssuer({ mode });
    const callback = await client.choose(await client.begin()); await client.callback(callback, 'failed');
    assert.equal((await client.status()).status, 'anonymous'); await configureIssuer();
  });
}

test('provider cancellation and malformed/repeated callback parameters return only sanitized local outcomes', async () => {
  const client = new Client(); await configureIssuer();
  await client.callback(await client.choose(await client.begin(), 'cancel'), 'cancelled');
  assert.equal((await client.status()).status, 'anonymous');
  await client.callback(`${origin}/api/auth/callback?state=invalid&code=synthetic`, 'failed');
  const callback = new URL(await client.choose(await client.begin())); callback.searchParams.append('state', callback.searchParams.get('state')!);
  await client.callback(callback.href, 'failed'); assert.equal((await client.status()).status, 'anonymous');
});

test('callback is one-time and concurrent callbacks cannot both authenticate or overwrite the winning cookie', async () => {
  const client = new Client(); await configureIssuer(); const callback = await client.choose(await client.begin());
  const duplicate = new Client(); duplicate.cookie = client.cookie; duplicate.context = client.context;
  const responses = await Promise.all([client.request(callback), duplicate.request(callback)]);
  const results = responses.map(response => new URL(response.headers.get('location')!, origin).searchParams.get('result'));
  assert.equal(results.filter(result => result === 'success').length, 1); assert.equal(results.filter(result => result === 'failed').length, 1);
  const loser = responses[results.indexOf('failed')]; assert.equal(loser.headers.getSetCookie().length, 0);
  const winner = results[0] === 'success' ? client : duplicate; assert.equal((await winner.status()).status, 'authenticated');
  const replay = await winner.callback(callback, 'failed'); assert.equal(replay.headers.getSetCookie().length, 0);
  assert.equal((await winner.status()).status, 'authenticated');
});

test('concurrent independent login attempts retain distinct correlation and stale success cannot replace newer identity', async () => {
  const client = new Client(); await configureIssuer();
  const a = await client.begin(); await client.status(); const b = await client.begin();
  assert.ok(new URL(a).searchParams.get('state') !== new URL(b).searchParams.get('state'));
  assert.ok(new URL(a).searchParams.get('nonce') !== new URL(b).searchParams.get('nonce'));
  const late = await client.choose(a, 'account-a'); await client.callback(await client.choose(b, 'account-b'));
  const status = await client.status(); const response = await client.callback(late, 'failed');
  assert.equal(response.headers.getSetCookie().length, 0); assert.equal((await client.status()).principal?.id, status.principal?.id);
});

test('logout revokes the server context and stale pre-logout callback cannot restore it', async () => {
  const pending = new Client(); await configureIssuer(); const callback = await pending.choose(await pending.begin());
  const oldCookie = pending.cookie; await pending.status(); assert.equal((await pending.request('/api/auth/logout', 'POST')).status, 200);
  const stale = new Client(); stale.cookie = oldCookie;
  const response = await stale.callback(callback, 'failed'); assert.equal(response.headers.getSetCookie().length, 0);
  assert.notEqual((await stale.status()).status, 'authenticated');
  const signedIn = new Client(); await signedIn.login(); const replay = new Client(); replay.cookie = signedIn.cookie; replay.context = signedIn.context;
  assert.equal((await signedIn.request('/api/auth/logout', 'POST')).status, 200);
  assert.equal((await replay.request('/api/workspaces')).status, 401);
});

test('session and outstanding login correlation survive actual application-process recreation', async () => {
  const signedIn = new Client(); const original = await signedIn.login('account-b');
  const pending = new Client(); const callback = await pending.choose(await pending.begin(), 'account-c');
  await restart(); assert.equal((await signedIn.status()).principal?.id, original.principal?.id);
  await pending.callback(callback); assert.equal((await pending.status()).status, 'authenticated');
});

for (const column of ['idle_expires_at', 'absolute_expires_at']) test(`server enforces ${column} independently of browser cookie`, async () => {
  const client = new Client(); await client.login();
  await db.unsafe(`update auth_browser_contexts set ${column}=now()-interval '1 second' where context_token=$1`, [client.context!]);
  assert.equal((await client.request('/api/workspaces')).status, 401); assert.equal((await client.status()).status, 'expired');
});

test('same email from a different configured issuer does not merge principals', async () => {
  const a = new Client(); const first = await a.login();
  await restart({ MFP_OIDC_ISSUER: `${issuer}/second` });
  try {
    const b = new Client(); const second = await b.login(); assert.ok(second.principal?.id !== first.principal?.id);
    const [row] = await db`select issuer,subject from external_identities where principal_id=${second.principal!.id}`;
    assert.deepEqual(row, { issuer: `${issuer}/second`, subject: 'account-a' });
  } finally { await restart(); }
});

test('workspace creation retries are atomic, selection explicit, and old context/forged role cannot write', async () => {
  const client = new Client(); const status = await client.login('account-b'); const key = randomUUID();
  const [a, b] = await Promise.all([client.create('Retry-safe workspace', key), client.create('Retry-safe workspace', key)]);
  assert.equal(a.id, b.id); assert.equal((await client.status()).workspace, null);
  const [membership] = await db`select role,status from workspace_memberships where workspace_id=${a.id} and principal_id=${status.principal!.id}`;
  assert.deepEqual(membership, { role: 'owner', status: 'active' });
  const stale = client.context!; await client.select(a.id);
  const denied = await client.request('/api/floor-plans', 'POST', { name: 'stale operation' }, { 'X-MFP-Context': stale, 'x-mfp-role': 'owner' });
  assert.equal(denied.status, 409); assert.equal((await denied.json()).code, 'ACCOUNT_CONTEXT_CHANGED');
  assert.equal((await db`select count(*)::int as count from floor_plans where workspace_id is null`)[0].count, 1);
});

test('principal disablement and active membership revocation remain effective for real signed-in sessions', async () => {
  const client = new Client(); const status = await client.login('account-c'); const workspace = await client.create(); await client.select(workspace.id);
  await db`update workspace_memberships set status='revoked' where principal_id=${status.principal!.id} and workspace_id=${workspace.id}`;
  assert.equal((await client.request('/api/floor-plans')).status, 404); assert.equal((await client.status()).workspace, null);
  await db`update application_principals set status='revoked' where id=${status.principal!.id}`;
  try { assert.equal((await client.request('/api/workspaces')).status, 401); assert.notEqual((await client.status()).status, 'authenticated'); }
  finally { await db`update application_principals set status='active' where id=${status.principal!.id}`; }
});

test('login and logout require exact trusted Origin, request marker and current context; return paths are allowlisted', async () => {
  const client = new Client(); await client.status();
  for (const path of ['/api/auth/login', '/api/auth/logout']) {
    assert.equal((await client.request(path, 'POST', { returnPath: '/' }, { Origin: 'https://attacker.invalid' })).status, 403);
    assert.equal((await client.request(path, 'POST', { returnPath: '/' }, { 'X-MFP-Request': '' })).status, 403);
    assert.equal((await client.request(path, 'POST', { returnPath: '/' }, { 'X-MFP-Context': randomUUID() })).status, 409);
  }
  for (const returnPath of ['https://attacker.invalid', '//attacker.invalid', '/physical-draft?code=unsafe', '/unknown'])
    assert.equal((await client.request('/api/auth/login', 'POST', { returnPath })).status, 400);
});

test('discovery outage and mismatched metadata fail closed and a later valid discovery recovers', async () => {
  for (const mode of [{ discoveryFailure: true }, { discoveryIssuerMismatch: true }]) {
    await configureIssuer(mode); await restart(); const client = new Client(); await client.status();
    assert.equal((await client.request('/api/auth/login', 'POST', { returnPath: '/' })).status, 503);
  }
  await configureIssuer(); const client = new Client(); assert.equal((await client.login()).status, 'authenticated');
});

test('unconfigured normal composition remains unavailable and cannot use synthetic headers or ambient database access', async () => {
  await restart({ MFP_OIDC_ISSUER: '', DATABASE_URL: 'postgres://invalid:invalid@127.0.0.1:1/not_used' });
  try {
    const client = new Client(); assert.equal((await client.status()).status, 'unavailable');
    const response = await client.request('/api/floor-plans', 'GET', undefined, { 'x-test-user': 'owner', 'x-mfp-workspace-id': randomUUID() });
    assert.equal(response.status, 503); assert.equal((await response.json()).code, 'SIGN_IN_UNAVAILABLE');
  } finally { await restart(); }
});

test('fixture certificate is not trusted outside the scoped Node process trust configuration', async () => {
  const env = { ...process.env }; delete env.NODE_EXTRA_CA_CERTS; delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', 'try { await fetch(process.env.MFP_ACCOUNTS_APP_ORIGIN + "/api/auth/session"); process.exit(1); } catch { process.exit(0); }'],
      { env, windowsHide: true, stdio: 'ignore' }); child.on('error', reject); child.on('exit', resolve);
  });
  assert.equal(code, 0, 'A process without the fixture CA must reject the TLS connection');
});

test('actual mismatched S256 challenge is rejected by issuer rather than a synthetic token error', async () => {
  const client = new Client(); await configureIssuer();
  const authorization = new URL(await client.begin());
  authorization.searchParams.set('code_challenge', createHash('sha256').update('different-verifier').digest('base64url'));
  const before = await issuerEvents();
  await client.callback(await client.choose(authorization.href), 'failed');
  assert.equal((await issuerEvents()).rejectedPkce, before.rejectedPkce + 1);
  assert.equal((await client.status()).status, 'anonymous');
});

test('expired durable login transaction rejects callback before exchanging the issuer code', async () => {
  const client = new Client(); await configureIssuer(); const authorization = await client.begin();
  const stateHash = createHash('sha256').update(new URL(authorization).searchParams.get('state')!).digest('hex');
  const callback = await client.choose(authorization); const before = await issuerEvents();
  await db`update oidc_login_transactions set expires_at=now()-interval '1 second' where state_hash=${stateHash}`;
  await client.callback(callback, 'failed'); assert.equal((await issuerEvents()).token, before.token);
  assert.equal((await client.status()).status, 'anonymous');
});

test('logout during a real token exchange defeats its late success without overwriting the logout cookie', async () => {
  const client = new Client(); await configureIssuer({ tokenDelayMs: 400 });
  const callback = await client.choose(await client.begin()); await client.status();
  const stale = new Client(); stale.cookie = client.cookie; stale.context = client.context;
  const before = await issuerEvents(); const result = stale.request(callback);
  const deadline = Date.now() + 3000;
  while ((await issuerEvents()).token === before.token && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok((await issuerEvents()).token > before.token, 'Token exchange must be in flight before logout');
  assert.equal((await client.request('/api/auth/logout', 'POST')).status, 200);
  const response = await result;
  assert.equal(new URL(response.headers.get('location')!, origin).searchParams.get('result'), 'failed');
  assert.equal(response.headers.getSetCookie().length, 0);
  assert.equal((await client.status()).status, 'anonymous'); await configureIssuer();
});
test('a stale exchange cannot destroy the shared anonymous session of a newer pending login', async () => {
  const client = new Client(); await configureIssuer({ tokenDelayMs: 400 });
  const a = await client.choose(await client.begin(), 'account-a'); await client.status();
  const stale = new Client(); stale.cookie = client.cookie; stale.context = client.context;
  const before = await issuerEvents(); const staleCompletion = stale.request(a);
  const deadline = Date.now() + 3000;
  while ((await issuerEvents()).token === before.token && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok((await issuerEvents()).token > before.token);
  await configureIssuer(); await client.status(); const b = await client.choose(await client.begin(), 'account-b');
  const staleResult = await staleCompletion;
  assert.equal(new URL(staleResult.headers.get('location')!, origin).searchParams.get('result'), 'failed');
  assert.equal(staleResult.headers.getSetCookie().length, 0);
  await client.callback(b);
  const status = await client.status(); assert.equal(status.status, 'authenticated');
  const [identity] = await db`select subject from external_identities where principal_id=${status.principal!.id}`;
  assert.equal(identity.subject, 'account-b');
});
test('actual OIDC owner/editor/viewer sessions retain server-enforced legacy CRUD and cross-workspace denials', async () => {
  const owner = new Client(), editor = new Client(), viewer = new Client();
  await owner.login('account-a'); const editStatus = await editor.login('account-b'), viewStatus = await viewer.login('account-c');
  const workspace = await owner.create('Role fixture workspace');
  await db`insert into workspace_memberships(workspace_id,principal_id,role) values(${workspace.id},${editStatus.principal!.id},'editor'),(${workspace.id},${viewStatus.principal!.id},'viewer')`;
  await owner.select(workspace.id); await editor.select(workspace.id); await viewer.select(workspace.id);
  const payload = { name: 'Synthetic authorized legacy plan', rooms: [], createdAt: '2026-09-09T12:00:00.000Z', updatedAt: '2026-09-09T12:00:00.000Z' };
  const create = await editor.request('/api/floor-plans', 'POST', payload); assert.equal(create.status, 201); const plan = await create.json();
  assert.equal((await viewer.request(`/api/floor-plans/${plan.id}`)).status, 200);
  assert.equal((await viewer.request('/api/floor-plans', 'POST', payload, { 'x-mfp-role': 'owner' })).status, 403);
  assert.equal((await viewer.request(`/api/floor-plans/${plan.id}`, 'PATCH', { name: 'Forbidden' })).status, 403);
  assert.equal((await viewer.request(`/api/floor-plans/${plan.id}`, 'DELETE')).status, 403);
  assert.equal((await editor.request(`/api/workspaces/${workspace.id}/memberships`)).status, 403);
  assert.equal((await editor.request(`/api/floor-plans/${plan.id}`, 'PATCH', { name: 'Edited' })).status, 200);
  await owner.select(null); const second = await owner.create('Other private workspace'); await owner.select(second.id);
  assert.equal((await owner.request(`/api/floor-plans/${plan.id}`)).status, 404);
  assert.equal((await owner.request(`/api/floor-plans/${plan.id}`, 'PATCH', { name: 'Wrong scope' })).status, 404);
  assert.equal((await owner.request(`/api/floor-plans/${plan.id}`, 'DELETE')).status, 404);
  assert.equal((await owner.request(`/api/floor-plans/${plan.id}`, 'GET', undefined, { 'X-MFP-Workspace-Id': workspace.id })).status, 409);
  await owner.select(workspace.id); assert.equal((await owner.request(`/api/floor-plans/${plan.id}`, 'DELETE')).status, 204);
});