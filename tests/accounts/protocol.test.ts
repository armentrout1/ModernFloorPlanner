import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import postgres from 'postgres';
import { startFixtureProcess } from './runtime.mjs';
import { configureSupabase, supabaseEvents } from './control';

const origin = process.env.MFP_ACCOUNTS_APP_ORIGIN!;
const supabaseOrigin = process.env.MFP_ACCOUNTS_SUPABASE_ORIGIN!;
const issuer = supabaseOrigin + '/auth/v1';
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
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

type Status = {
  status: string;
  contextToken: string | null;
  principal: { id: string; displayName: string } | null;
  workspace: { id: string; role: string } | null;
  workspaces: { id: string; role: string }[];
};

const emailFor = (account: string) => `${account}@example.test`;
const passwordFor = (account: string) => `Password-${account.toUpperCase()}-1234`;
async function providerToken(account = 'account-a', password = passwordFor(account)): Promise<string | null> {
  const response = await fetch(`${supabaseOrigin}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: publishableKey },
    body: JSON.stringify({ email: emailFor(account), password }),
  });
  if (!response.ok) return null;
  const body = await response.json();
  return typeof body.access_token === 'string' ? body.access_token : null;
}

class Client {
  cookie = '';
  context: string | null = null;
  workspace: string | null = null;
  async request(path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}) {
    const response = await fetch(new URL(path, origin), {
      method,
      redirect: 'manual',
      headers: {
        ...(this.cookie ? { Cookie: this.cookie } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(method === 'GET' ? {} : { Origin: origin, 'X-MFP-Request': '1' }),
        ...(this.context ? { 'X-MFP-Context': this.context } : {}),
        ...(this.workspace ? { 'X-MFP-Workspace-Id': this.workspace } : {}),
        ...extra,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    for (const item of response.headers.getSetCookie()) {
      if (item.startsWith('__Host-mfp-session=')) this.cookie = item.split(';')[0];
    }
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    return response;
  }
  async status() {
    const response = await this.request('/api/auth/session');
    assert.equal(response.status, 200);
    const status = await response.json() as Status;
    this.context = status.contextToken;
    this.workspace = status.workspace?.id ?? null;
    return status;
  }
  async authenticate(token: string) {
    if (!this.context) await this.status();
    const response = await this.request('/api/auth/login', 'POST', {}, { Authorization: 'Bearer ' + token });
    if (response.status === 200) {
      const status = await response.json() as Status;
      this.context = status.contextToken;
      this.workspace = status.workspace?.id ?? null;
    }
    return response;
  }
  async login(account = 'account-a') {
    await configureSupabase({ mode: 'normal', userDelayMs: 0 });
    const token = await providerToken(account); assert.ok(token);
    const response = await this.authenticate(token);
    assert.equal(response.status, 200);
    return this.status();
  }
  async create(name = 'Synthetic workspace', key = randomUUID()) {
    const response = await this.request('/api/workspaces', 'POST', { name, idempotencyKey: key });
    assert.equal(response.status, 201, `${response.status} ${await response.clone().text()}`);
    return response.json();
  }
  async select(id: string | null) {
    const response = await this.request('/api/auth/workspace', 'POST', { workspaceId: id });
    assert.equal(response.status, 200);
    const status = await response.json() as Status;
    this.context = status.contextToken;
    this.workspace = status.workspace?.id ?? null;
    return status;
  }
}

test('real Supabase password token and getUser verification create exact issuer/subject and rotate the opaque MFP session', async () => {
  const client = new Client();
  const before = await client.status(), priorCookie = client.cookie;
  assert.equal(before.status, 'anonymous');
  const token = await providerToken(); assert.ok(token);
  const response = await client.authenticate(token);
  assert.equal(response.status, 200);
  const setCookie = response.headers.getSetCookie().find(item => item.startsWith('__Host-mfp-session=')) || '';
  assert.match(setCookie, /; Secure/i); assert.match(setCookie, /; HttpOnly/i); assert.match(setCookie, /; Path=\//i); assert.match(setCookie, /; SameSite=Lax/i);
  assert.doesNotMatch(setCookie, /; Domain=/i);
  assert.notEqual(client.cookie, priorCookie);
  const status = await client.status();
  assert.equal(status.status, 'authenticated'); assert.ok(status.principal); assert.equal(status.workspace, null);
  const [identity] = await db`select issuer,subject from external_identities where principal_id=${status.principal!.id}`;
  assert.equal(identity.issuer, issuer); assert.match(identity.subject, /^[0-9a-f-]{36}$/);
  const evidence = await supabaseEvents(); assert.ok(evidence.password >= 1 && evidence.user >= 1);
  const ordinary = await client.request('/api/auth/session');
  assert.equal(ordinary.headers.getSetCookie().length, 0);
  assert.doesNotMatch(await ordinary.text(), /access_token|refresh_token|password|authorization/i);
});

test('wrong passwords and invalid or missing bearer tokens never authenticate an MFP session', async () => {
  const client = new Client(); await client.status();
  assert.equal(await providerToken('account-a', 'wrong-password'), null);
  for (const header of ['', 'Bearer invalid-token-value-1234567890', 'Basic ' + 'x'.repeat(32)]) {
    const response = await client.request('/api/auth/login', 'POST', {}, header ? { Authorization: header } : {});
    assert.equal(response.status, 401);
    assert.equal(response.headers.getSetCookie().length, 0);
  }
  assert.equal((await client.status()).status, 'anonymous');
});

test('concurrent login attempts on one anonymous context permit one SID rotation and reject the stale request', async () => {
  const original = new Client(); await original.status();
  const tokenA = await providerToken('account-a'), tokenB = await providerToken('account-b'); assert.ok(tokenA && tokenB);
  const duplicate = new Client(); duplicate.cookie = original.cookie; duplicate.context = original.context;
  const responses = await Promise.all([original.authenticate(tokenA), duplicate.authenticate(tokenB)]);
  const outcome = responses.map(response => ({ status: response.status, setCookies: response.headers.getSetCookie().length }));
  assert.equal(responses.filter(response => response.status === 200).length, 1, JSON.stringify(outcome));
  assert.equal(responses.filter(response => response.status === 409).length, 1, JSON.stringify(outcome));
  const loser = responses.find(response => response.status === 409)!;
  assert.equal(loser.headers.getSetCookie().length, 0);
  const winner = responses[0].status === 200 ? original : duplicate;
  assert.equal((await winner.status()).status, 'authenticated');
});

test('logout revokes the server context, clears the cookie and rejects an old copied session', async () => {
  const client = new Client(); await client.login();
  const copied = new Client(); copied.cookie = client.cookie; copied.context = client.context;
  const response = await client.request('/api/auth/logout', 'POST', {});
  assert.equal(response.status, 200);
  assert.match(response.headers.getSetCookie().join(';'), /__Host-mfp-session=;/);
  assert.equal((await copied.request('/api/workspaces')).status, 401);
  assert.notEqual((await client.status()).status, 'authenticated');
});

test('a verified MFP session survives application-process recreation without retaining a provider token', async () => {
  const client = new Client(); const first = await client.login('account-b');
  await restart();
  const recovered = await client.status();
  assert.equal(recovered.status, 'authenticated'); assert.equal(recovered.principal?.id, first.principal?.id);
});

for (const column of ['idle_expires_at', 'absolute_expires_at']) test(`server enforces ${column} independently of the browser cookie`, async () => {
  const client = new Client(); await client.login();
  await db.unsafe(`update auth_browser_contexts set ${column}=now()-interval '1 second' where context_token=$1`, [client.context!]);
  assert.equal((await client.request('/api/workspaces')).status, 401);
  assert.equal((await client.status()).status, 'expired');
});

test('workspace creation atomically selects the result, remains idempotent, and stale context cannot write', async () => {
  const client = new Client(); const status = await client.login('account-b'); const key = randomUUID(), stale = client.context!;
  const [a, b] = await Promise.all([client.create('Retry-safe workspace', key), client.create('Retry-safe workspace', key)]);
  assert.equal(a.id, b.id); assert.equal((await client.status()).workspace?.id, a.id);
  const [membership] = await db`select role,status from workspace_memberships where workspace_id=${a.id} and principal_id=${status.principal!.id}`;
  assert.deepEqual(membership, { role: 'owner', status: 'active' });
  const denied = await client.request('/api/floor-plans', 'POST', { name: 'stale operation' }, { 'X-MFP-Context': stale, 'x-mfp-role': 'owner' });
  assert.equal(denied.status, 409); assert.equal((await denied.json()).code, 'ACCOUNT_CONTEXT_CHANGED');
});

test('principal and membership revocation remain effective for native Supabase sessions', async () => {
  const client = new Client(); const status = await client.login('account-c'); const workspace = await client.create(); await client.status();
  await db`update workspace_memberships set status='revoked' where principal_id=${status.principal!.id} and workspace_id=${workspace.id}`;
  assert.equal((await client.request('/api/floor-plans')).status, 404); assert.equal((await client.status()).workspace, null);
  await db`update application_principals set status='revoked' where id=${status.principal!.id}`;
  try { assert.equal((await client.request('/api/workspaces')).status, 401); assert.notEqual((await client.status()).status, 'authenticated'); }
  finally { await db`update application_principals set status='active' where id=${status.principal!.id}`; }
});

test('login and logout require the trusted Origin, request marker, current context, and a verified bearer token', async () => {
  const client = new Client(); await client.status(); const token = await providerToken(); assert.ok(token);
  for (const path of ['/api/auth/login', '/api/auth/logout']) {
    const authorization = path.endsWith('/login') ? { Authorization: 'Bearer ' + token } : {};
    assert.equal((await client.request(path, 'POST', {}, { ...authorization, Origin: 'https://attacker.invalid' })).status, 403);
    assert.equal((await client.request(path, 'POST', {}, { ...authorization, 'X-MFP-Request': '' })).status, 403);
    assert.equal((await client.request(path, 'POST', {}, { ...authorization, 'X-MFP-Context': randomUUID() })).status, 409);
  }
});

test('Supabase verification outage fails closed and a later healthy verification recovers', async () => {
  const client = new Client(); await client.status();
  await configureSupabase({ mode: 'user-failure' }); const token = await providerToken(); assert.ok(token);
  assert.equal((await client.authenticate(token)).status, 503);
  assert.equal((await client.status()).status, 'anonymous');
  await configureSupabase({ mode: 'normal' }); const healthy = await providerToken(); assert.ok(healthy);
  assert.equal((await client.authenticate(healthy)).status, 200);
});

test('unconfigured normal composition remains unavailable and cannot use synthetic identity headers', async () => {
  await restart({ VITE_SUPABASE_URL: '', DATABASE_URL: 'postgres://invalid:invalid@127.0.0.1:1/not_used' });
  try {
    const client = new Client(); assert.equal((await client.status()).status, 'unavailable');
    const response = await client.request('/api/floor-plans', 'GET', undefined, { 'x-test-user': 'owner', 'x-mfp-workspace-id': randomUUID() });
    assert.equal(response.status, 503); assert.equal((await response.json()).code, 'SIGN_IN_UNAVAILABLE');
  } finally { await restart(); }
});

test('logout during a delayed Supabase verification defeats the late success without restoring the old cookie', async () => {
  const client = new Client(); await client.status();
  await configureSupabase({ mode: 'normal', userDelayMs: 400 }); const token = await providerToken(); assert.ok(token);
  const stale = new Client(); stale.cookie = client.cookie; stale.context = client.context;
  const before = await supabaseEvents(); const pending = stale.authenticate(token);
  const deadline = Date.now() + 3000;
  while ((await supabaseEvents()).user === before.user && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10));
  assert.ok((await supabaseEvents()).user > before.user);
  assert.equal((await client.request('/api/auth/logout', 'POST', {})).status, 200);
  const response = await pending;
  assert.notEqual(response.status, 200); assert.equal(response.headers.getSetCookie().length, 0);
  assert.notEqual((await client.status()).status, 'authenticated');
  await configureSupabase({ mode: 'normal', userDelayMs: 0 });
});

test('fixture certificate is not trusted outside the scoped Node process trust configuration', async () => {
  const env = { ...process.env }; delete env.NODE_EXTRA_CA_CERTS; delete env.NODE_TLS_REJECT_UNAUTHORIZED;
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(process.execPath, ['--input-type=module', '-e', 'try { await fetch(process.env.MFP_ACCOUNTS_APP_ORIGIN + "/api/auth/session"); process.exit(1); } catch { process.exit(0); }'],
      { env, windowsHide: true, stdio: 'ignore' });
    child.on('error', reject); child.on('exit', resolve);
  });
  assert.equal(code, 0);
});
