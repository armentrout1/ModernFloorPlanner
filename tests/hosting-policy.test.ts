import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import session from 'express-session';
import { request, type IncomingHttpHeaders } from 'node:http';
import { once } from 'node:events';
import { configureHosting, sessionProxyFor, type HostingOptions } from '../server/hosting';

const origin = 'https://planner.example';
const headers = { Host: 'planner.example', 'X-Forwarded-Host': 'planner.example', 'X-Forwarded-Proto': 'https' };
function application(options: HostingOptions, env: { origin?: string; vercel?: string } = { origin, vercel: '1' }) {
  const previous = { origin: process.env.MFP_APP_ORIGIN, vercel: process.env.VERCEL };
  const app = express();
  try {
    if (env.origin === undefined) delete process.env.MFP_APP_ORIGIN; else process.env.MFP_APP_ORIGIN = env.origin;
    if (env.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = env.vercel;
    configureHosting(app, options);
  } finally {
    if (previous.origin === undefined) delete process.env.MFP_APP_ORIGIN; else process.env.MFP_APP_ORIGIN = previous.origin;
    if (previous.vercel === undefined) delete process.env.VERCEL; else process.env.VERCEL = previous.vercel;
  }
  let reached = 0;
  // Synthetic in-memory session store tests only the transport policy; production uses PostgreSQL.
  const store = new session.MemoryStore();
  app.use(session({ name: '__Host-mfp-session', secret: 'fixture-only-session-secret', store,
    resave: false, saveUninitialized: false, proxy: sessionProxyFor(app),
    cookie: { httpOnly: true, secure: true, sameSite: 'lax', path: '/' } }));
  app.get('/api/probe', (req, res) => { reached++; req.session.browserId = 'synthetic'; res.json({ accepted: true }); });
  return { app, reached: () => reached, store };
}
async function listen(app: express.Express) {
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const send = (supplied: Record<string, string | string[]> = headers) => new Promise<{ status: number; headers: IncomingHttpHeaders; body: string }>((resolve, reject) => {
    const req = request({ hostname: '127.0.0.1', port: address.port, path: '/api/probe', headers: supplied }, res => {
      let body = ''; res.setEncoding('utf8'); res.on('data', data => body += data);
      res.on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body }));
    }); req.on('error', reject); req.end();
  });
  return { send, close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) };
}

test('hosted entry permits its canonical forwarded HTTPS request and retains secure cookie attributes', async () => {
  const fixture = application({ hosting: 'vercel' }); const server = await listen(fixture.app);
  try {
    const response = await server.send(); assert.equal(response.status, 200);
    const cookie = response.headers['set-cookie']?.[0] ?? '';
    assert.match(cookie, /^__Host-mfp-session=/); assert.match(cookie, /; Secure/);
    assert.match(cookie, /; HttpOnly/); assert.match(cookie, /; SameSite=Lax/); assert.match(cookie, /; Path=\//);
    assert.doesNotMatch(cookie, /Domain=/); assert.equal(fixture.reached(), 1);
  } finally { await server.close(); }
});

test('ordinary listener ignores both forwarded headers and the VERCEL environment flag', async () => {
  const fixture = application({}); const server = await listen(fixture.app);
  try { const response = await server.send(); assert.equal(response.status, 200);
    assert.equal(response.headers['set-cookie'], undefined); assert.equal(sessionProxyFor(fixture.app), false);
  } finally { await server.close(); }
});

test('incomplete or noncanonical hosted configuration fails before session or route processing', async () => {
  for (const env of [{ origin }, { origin, vercel: 'true' }, { vercel: '1' },
    { origin: 'http://planner.example', vercel: '1' }, { origin: origin + '/', vercel: '1' },
    { origin: 'https://owner:secret@planner.example', vercel: '1' }]) {
    const fixture = application({ hosting: 'vercel' }, env); const server = await listen(fixture.app);
    try { const response = await server.send(); assert.equal(response.status, 503);
      assert.equal(JSON.parse(response.body).code, 'HOSTING_UNAVAILABLE');
      assert.equal(response.headers['set-cookie'], undefined); assert.equal(fixture.reached(), 0);
      assert.equal(sessionProxyFor(fixture.app), false);
    } finally { await server.close(); }
  }
});

test('wrong hosts, protocol ambiguity and competing Forwarded headers fail closed before sessions', async () => {
  const cases: Record<string, string | string[]>[] = [
    { ...headers, Host: 'other.example' }, { ...headers, 'X-Forwarded-Host': 'other.example' },
    { ...headers, 'X-Forwarded-Host': '' }, { ...headers, 'X-Forwarded-Proto': '' },
    { ...headers, 'X-Forwarded-Proto': 'http' }, { ...headers, 'X-Forwarded-Proto': 'https,http' },
    { ...headers, 'X-Forwarded-Host': 'planner.example,other.example' },
    { ...headers, 'X-Forwarded-Proto': ['https', 'https'] },
    { ...headers, Forwarded: 'proto=http;host=other.example' },
    { Host: 'planner.example' },
  ];
  const fixture = application({ hosting: 'vercel' }); const server = await listen(fixture.app);
  try {
    for (const supplied of cases) { const response = await server.send(supplied);
      assert.equal(response.status, 400); assert.equal(JSON.parse(response.body).code, 'INVALID_HOSTING_REQUEST');
      assert.equal(response.headers['set-cookie'], undefined); assert.match(String(response.headers['cache-control']), /no-store/);
    }
    assert.equal(fixture.reached(), 0);
    const count = await new Promise<number>((resolve, reject) => fixture.store.length((error, size) => error ? reject(error) : resolve(size!)));
    assert.equal(count, 0);
  } finally { await server.close(); }
});

test('hosting policy cannot be reconfigured after mounting and defaults to untrusted sessions', () => {
  const app = express(); assert.equal(sessionProxyFor(app), false);
  configureHosting(app); assert.throws(() => configureHosting(app, { hosting: 'vercel' }), /already configured/);
  assert.equal(sessionProxyFor(app), false);
});
