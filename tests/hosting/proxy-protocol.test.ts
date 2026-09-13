import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { request as httpRequest } from 'node:http';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { configureIssuer, issuerEvents } from '../accounts/control';
import { PhysicalHttpClient } from '../persistence/http-client';
import { basicPhysicalSaveDraft } from '../fixtures/physicalSave';
import { capturePhysicalSaveEnvelope } from '../../shared/persistence/physicalSave';

const origin = 'https://127.0.0.2:54440';
assert.equal(process.env.MFP_ACCOUNTS_APP_ORIGIN, origin);
assert.match(new URL(process.env.DATABASE_URL!).pathname, /^\/mfp_hosting_[a-f0-9]{32}_test$/);
const db = postgres(process.env.DATABASE_URL!, { max: 2, onnotice: () => {} });
after(async () => db.end());
beforeEach(async () => configureIssuer({ subjectPrefix: 'host-' + randomUUID() }));
const hostedHeaders = ['Host', '127.0.0.2:54440', 'X-Forwarded-Host', '127.0.0.2:54440', 'X-Forwarded-Proto', 'https'];
function rawRequest(port: number, headers: string[], path = '/api/auth/session') {
  return new Promise<{ status: number; cookie: string[]; value: any; cache: string }>((done, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port, path, headers, method: 'GET' }, response => {
      let body = ''; response.setEncoding('utf8'); response.on('data', chunk => body += chunk);
      response.on('end', () => { try { done({ status: response.statusCode!, cookie: response.headers['set-cookie'] ?? [], value: JSON.parse(body), cache: String(response.headers['cache-control'] ?? '') }); } catch { reject(new Error('Expected sanitized JSON from hosting boundary.')); } });
    });
    req.setTimeout(5000, () => req.destroy(new Error('Isolated hosting request timed out')));
    req.once('error', () => reject(new Error('Isolated hosting request failed'))); req.end();
  });
}
async function sessionCounts() {
  return (await db`select (select count(*)::int from mfp_sessions) as sessions,(select count(*)::int from auth_browser_contexts) as contexts`)[0];
}
async function member(account = 'account-a') {
  const client = new PhysicalHttpClient(); const identity = await client.login(account);
  const workspace = await client.create('Synthetic hosting workspace'); await client.select(workspace.id);
  return { client, identity, workspace };
}

async function restartHosted() {
  assert.ok(process.send, 'Restart is available only through the owning fixture runner.');
  await new Promise<void>((done, reject) => {
    const id = randomUUID();
    const timer = setTimeout(() => { process.off('message', receive); reject(new Error('Hosted fixture restart timed out.')); }, 30_000);
    const receive = (message: any) => {
      if (message?.type !== 'MFP_TEST_RESTARTED' || message.id !== id) return;
      clearTimeout(timer); process.off('message', receive);
      if (message.ok) done(); else reject(new Error('Hosted fixture restart failed.'));
    };
    process.on('message', receive); process.send!({ type: 'MFP_TEST_RESTART_HOSTED', id });
  });
}

test('actual hosted entry over an HTTP hop supports secure OIDC cookies, PKCE, SID rotation and one-time callback', async () => {
  const client = new PhysicalHttpClient(); const anonymous = await client.request('/api/auth/session');
  const initial = await anonymous.json(); client.context = initial.contextToken;
  assert.equal(initial.status, 'anonymous'); const prior = client.cookie;
  const cookie = anonymous.headers.getSetCookie().find(value => value.startsWith('__Host-mfp-session=')) ?? '';
  assert.ok(/; Secure/i.test(cookie) && /; HttpOnly/i.test(cookie) && /; SameSite=Lax/i.test(cookie) && /; Path=\//i.test(cookie));
  assert.ok(!/; Domain=/i.test(cookie));
  const callback = await client.choose(await client.begin()); await client.callback(callback);
  const authenticated = await client.status(); assert.equal(authenticated.status, 'authenticated');
  assert.ok(prior !== client.cookie, 'Successful hosted login rotates the opaque session.');
  const [identity] = await db`select issuer,subject from external_identities where principal_id=${authenticated.principal!.id}`;
  assert.equal(identity.issuer, process.env.MFP_OIDC_ISSUER); assert.ok(identity.subject.endsWith('account-a'));
  const counts = await issuerEvents(); assert.ok(counts.discovery > 0 && counts.token > 0 && counts.jwks > 0);
  const replay = await client.callback(callback, 'failed'); assert.equal(replay.headers.getSetCookie().length, 0);
  const status = await client.request('/api/auth/session'); assert.equal(status.headers.getSetCookie().length, 0);
  assert.ok(!/access_token|id_token|refresh_token|client_secret|code_verifier|sessionID/.test(await status.text()));
});

test('missing, conflicting and duplicate forwarded metadata fail before durable sessions are created', async () => {
  const before = await sessionCounts();
  const invalid = [
    ['Host', '127.0.0.2:54440'],
    ['Host', '127.0.0.2:54440', 'X-Forwarded-Host', '127.0.0.2:54440', 'X-Forwarded-Proto', 'http'],
    ['Host', 'foreign.invalid', 'X-Forwarded-Host', '127.0.0.2:54440', 'X-Forwarded-Proto', 'https'],
    ['Host', '127.0.0.2:54440', 'X-Forwarded-Host', 'foreign.invalid', 'X-Forwarded-Proto', 'https'],
    [...hostedHeaders, 'X-Forwarded-Proto', 'https'],
    [...hostedHeaders, 'X-Forwarded-Host', '127.0.0.2:54440'],
    ['Host', '127.0.0.2:54440', 'X-Forwarded-Host', '127.0.0.2:54440', 'X-Forwarded-Proto', 'https,http'],
    [...hostedHeaders, 'Forwarded', 'proto=https;host=127.0.0.2:54440'],
  ];
  for (const headers of invalid) {
    const response = await rawRequest(54442, headers);
    assert.equal(response.status, 400); assert.equal(response.value.code, 'INVALID_HOSTING_REQUEST');
    assert.equal(response.cookie.length, 0); assert.match(response.cache, /no-store/);
  }
  assert.deepEqual(await sessionCounts(), before);
});

test('standalone HTTP cannot enable Secure cookies through VERCEL env or spoofed forwarding headers', async () => {
  const response = await rawRequest(54443, hostedHeaders);
  assert.equal(response.status, 200); assert.equal(response.value.status, 'anonymous');
  assert.equal(response.cookie.length, 0, 'Standalone session transport must still require direct TLS.');
  const next = await rawRequest(54443, hostedHeaders);
  assert.ok(response.value.contextToken !== next.value.contextToken, 'No authenticated cookie continuity is invented on HTTP.');
});

test('saved physical revisions and every export remain workspace-private through the hosted transport', async () => {
  const owner = await member(); const envelope = capturePhysicalSaveEnvelope(basicPhysicalSaveDraft());
  const response = await owner.client.request('/api/physical-plans', 'POST', envelope, { 'Idempotency-Key': randomUUID() });
  assert.equal(response.status, 201); const saved = await response.json();
  assert.equal(response.headers.get('etag'), saved.etag); assert.deepEqual(saved.envelope, envelope);
  const [row] = await db`select envelope from physical_plan_revisions where id=${saved.revisionId}`; assert.deepEqual(row.envelope, envelope);
  const outsider = await member('account-b'); const anonymous = new PhysicalHttpClient();
  const paths = [`/api/physical-plans/${saved.planId}`, ...['csv', 'html', 'plan'].map(format => `/api/physical-plans/${saved.planId}/revisions/${saved.revisionId}/export?format=${format}&unit=ft`)];
  for (const path of paths) {
    assert.equal((await owner.client.request(path)).status, 200);
    assert.equal((await outsider.client.request(path)).status, 404);
    assert.equal((await anonymous.request(path)).status, 401);
  }
  await db`insert into workspace_memberships(workspace_id,principal_id,role,status) values(${owner.workspace.id},${outsider.identity.principal!.id},'viewer','active')`;
  await outsider.client.select(owner.workspace.id);
  assert.equal((await outsider.client.request(paths[0])).status, 200);
  assert.equal((await outsider.client.request('/api/physical-plans', 'POST', envelope, { 'Idempotency-Key': randomUUID() })).status, 403);
});

test('a cold hosted handler replacement preserves the server session, saved revision and pending OIDC callback', async () => {
  const { client } = await member();
  const response = await client.request('/api/physical-plans', 'POST', capturePhysicalSaveEnvelope(basicPhysicalSaveDraft()), { 'Idempotency-Key': randomUUID() });
  assert.equal(response.status, 201); const saved = await response.json();
  const pending = new PhysicalHttpClient(); const callback = await pending.choose(await pending.begin(), 'account-b');
  await restartHosted();
  assert.equal((await client.status()).status, 'authenticated');
  const recovered = await client.request('/api/physical-plans/' + saved.planId); assert.equal(recovered.status, 200);
  assert.deepEqual(await recovered.json(), saved);
  await pending.callback(callback); assert.equal((await pending.status()).status, 'authenticated');
});

test('hosted mutations still reject CSRF and stale contexts and logout revokes the old SID', async () => {
  const { client } = await member(); const oldContext = client.context; const oldCookie = client.cookie;
  const body = capturePhysicalSaveEnvelope(basicPhysicalSaveDraft());
  for (const extra of [{ Origin: 'https://foreign.invalid' }, { 'X-MFP-Request': '0' }, { 'X-MFP-Context': randomUUID() }]) {
    const rejected = await client.request('/api/physical-plans', 'POST', body, { 'Idempotency-Key': randomUUID(), ...extra });
    assert.ok([403, 409].includes(rejected.status));
  }
  await client.select(null);
  const stale = await client.request('/api/auth/workspace', 'POST', { workspaceId: null }, { 'X-MFP-Context': oldContext! }); assert.equal(stale.status, 409);
  assert.equal((await client.request('/api/auth/logout', 'POST', {})).status, 200);
  const old = new PhysicalHttpClient(); old.cookie = oldCookie; old.context = oldContext;
  assert.equal((await old.request('/api/physical-plans')).status, 401);
  assert.equal((await client.status()).status, 'anonymous');
});

test('hosted API unknown paths and malformed JSON retain private JSON errors rather than SPA HTML', async () => {
  const missing = await fetch(origin + '/api/not-a-route'); assert.equal(missing.status, 404);
  assert.match(missing.headers.get('content-type') ?? '', /application\/json/); assert.match(missing.headers.get('cache-control') ?? '', /no-store/);
  const malformed = await fetch(origin + '/api/physical-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{synthetic-invalid-json' });
  assert.equal(malformed.status, 400); const content = await malformed.text();
  assert.ok(!content.includes('synthetic-invalid-json') && !content.includes('SyntaxError') && !content.includes('at JSON.parse'));
});
