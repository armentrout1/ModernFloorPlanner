import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const origin = process.env.MFP_ACCOUNTS_APP_ORIGIN!;
const supabaseOrigin = process.env.MFP_ACCOUNTS_SUPABASE_ORIGIN!;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
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
  async login(account = 'account-a') {
    if (!this.context) await this.status();
    const provider = await fetch(`${supabaseOrigin}/auth/v1/token?grant_type=password`, { method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: publishableKey },
      body: JSON.stringify({ email: `${account}@example.test`, password: `Password-${account.toUpperCase()}-1234` }) });
    assert.equal(provider.status, 200); const supplied = await provider.json(); assert.equal(typeof supplied.access_token, 'string');
    const response = await this.request('/api/auth/login', 'POST', {}, { Authorization: 'Bearer ' + supplied.access_token });
    assert.equal(response.status, 200, 'Supabase token verification must succeed');
    const status = await response.json() as Status; this.context = status.contextToken; this.workspace = status.workspace?.id ?? null;
    return this.status();
  }
  async create(name = 'Synthetic workspace', key = randomUUID()) {
    const response = await this.request('/api/workspaces', 'POST', { name, idempotencyKey: key }); assert.equal(response.status, 201); return response.json();
  }
  async select(id: string | null) {
    const response = await this.request('/api/auth/workspace', 'POST', { workspaceId: id }); assert.equal(response.status, 200);
    const status = await response.json() as Status; this.context = status.contextToken; this.workspace = status.workspace?.id ?? null; return status;
  }
}
