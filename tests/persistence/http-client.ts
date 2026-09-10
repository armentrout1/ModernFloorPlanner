import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { configureIssuer } from '../accounts/control';
const origin = process.env.MFP_ACCOUNTS_APP_ORIGIN!;
const issuer = process.env.MFP_ACCOUNTS_ISSUER_ORIGIN!;
type Status = { status: string; contextToken: string | null; principal: { id: string; displayName: string } | null;
  workspace: { id: string; role: string } | null; workspaces: { id: string; role: string }[] };
export class PhysicalHttpClient {
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
  async login(account = 'account-a') { await this.callback(await this.choose(await this.begin(), account)); return this.status(); }
  async create(name = 'Synthetic workspace', key = randomUUID()) {
    const response = await this.request('/api/workspaces', 'POST', { name, idempotencyKey: key }); assert.equal(response.status, 201); return response.json();
  }
  async select(id: string | null) {
    const response = await this.request('/api/auth/workspace', 'POST', { workspaceId: id }); assert.equal(response.status, 200);
    const status = await response.json() as Status; this.context = status.contextToken; this.workspace = status.workspace?.id ?? null; return status;
  }
}
