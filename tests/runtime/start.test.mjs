import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { createRequire } from 'node:module';
import { dirname, resolve, delimiter } from 'node:path';
import { pathToFileURL } from 'node:url';

// This suite owns only this reserved, independently checked loopback listener.
// MFP_RUNTIME_APP_ROOT may select a separate npm ci --omit=dev installation.
const appRoot = resolve(process.env.MFP_RUNTIME_APP_ROOT ?? process.cwd());
const host = '127.0.0.1', port = 54428, origin = `http://${host}:${port}`;
const env = { ...process.env, HOST: host, PORT: String(port), NODE_ENV: 'development',
  PATH: dirname(process.execPath) + delimiter + process.env.PATH };
for (const key of Object.keys(env)) {
  if (key.startsWith('MFP_') || key === 'DATABASE_URL' || key === 'NODE_OPTIONS' || key === 'NODE_PATH' || key === 'NODE_TLS_REJECT_UNAUTHORIZED') delete env[key];
}
const npmCli = process.env.npm_execpath ?? resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
let child, serverPid, output = '';
const request = (path = '', options = {}) => fetch(origin + path, { ...options, signal: AbortSignal.timeout(5000) });
async function closeChild() {
  if (serverPid) {
    try { process.kill(serverPid); } catch (error) { if (error.code !== 'ESRCH') throw error; }
    serverPid = undefined;
  }
  if (child && child.exitCode === null && child.signalCode === null) {
    const stopped = once(child, 'exit');
    const timer = setTimeout(() => child.kill(), 5000); timer.unref();
    try { await stopped; } finally { clearTimeout(timer); }
  }
}
before(async () => {
  assert.ok(existsSync(npmCli), 'Run this suite with npm run test:runtime or a runtime containing npm.');
  const available = createServer();
  available.listen({ host, port, exclusive: true }); await once(available, 'listening');
  await new Promise((done, reject) => available.close(error => error ? reject(error) : done()));
  if (process.env.MFP_RUNTIME_REQUIRE_PRODUCTION_ONLY === '1') {
    const require = createRequire(pathToFileURL(resolve(appRoot, 'package.json')));
    for (const dependency of ['vite', '@vitejs/plugin-react', 'tsx', 'esbuild'])
      assert.throws(() => require.resolve(dependency), { code: 'MODULE_NOT_FOUND' }, `${dependency} must be absent from the production-only installation`);
  }
  child = spawn(process.execPath, [npmCli, 'start', '--silent'], { cwd: appRoot, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(Error('Compiled npm start did not become ready: ' + output)), 15000);
      let readySeen = false;
      const collect = data => {
        output += data.toString();
        const ready = output.match(/serving on 127\.0\.0\.1:54428 \(process (\d+)\)/);
        if (ready && !readySeen) { readySeen = true; serverPid = Number(ready[1]); clearTimeout(timer); done(); }
      };
      child.stdout.on('data', collect); child.stderr.on('data', collect);
      child.once('error', error => { clearTimeout(timer); reject(error); });
      child.once('exit', code => { clearTimeout(timer); if (!serverPid) reject(Error(`Compiled npm start exited ${code}: ${output}`)); });
    });
  } catch (error) { await closeChild(); throw error; }
}, { timeout: 25000 });
after(closeChild);

test('actual npm start selects production and serves direct SPA links from built assets', async () => {
  for (const route of ['/', '/physical-draft', '/quick-room', '/account/callback?result=failed&returnTo=%2F']) {
    const response = await request(route), html = await response.text();
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(html, /\/assets\/[^" ]+\.js/); assert.doesNotMatch(html, /\/@vite\/client|\/src\/main\.tsx/);
  }
});

test('built scripts and styles load, while absent assets and non-GET routes never become SPA HTML', async () => {
  const html = await (await request()).text();
  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
  assert.ok(assets.some(path => path.endsWith('.js'))); assert.ok(assets.some(path => path.endsWith('.css')));
  for (const asset of assets) {
    const response = await request(asset); assert.equal(response.status, 200);
    assert.doesNotMatch(response.headers.get('content-type'), /text\/html/); assert.ok((await response.text()).length > 0);
  }
  for (const route of ['/assets/missing.js', '/assets/missing', '/missing.css']) {
    const response = await request(route); assert.equal(response.status, 404);
    assert.doesNotMatch(response.headers.get('content-type'), /text\/html/);
  }
  const response = await request('/physical-draft', { method: 'POST' });
  assert.equal(response.status, 404); assert.doesNotMatch(response.headers.get('content-type'), /text\/html/);
});

test('normal APIs remain ahead of SPA fallback and fail closed without provider bindings', async () => {
  const session = await request('/api/auth/session');
  assert.equal(session.status, 200); assert.equal((await session.json()).status, 'unavailable');
  assert.equal(session.headers.get('set-cookie'), null);
  for (const route of ['/api/physical-plans', '/api/floor-plans']) {
    const response = await request(route); assert.equal(response.status, 503);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.match(response.headers.get('cache-control'), /no-store/);
    assert.equal(response.headers.get('set-cookie'), null);
  }
  const missing = await request('/api/unknown-runtime-route');
  assert.equal(missing.status, 404); assert.match(missing.headers.get('content-type'), /application\/json/);
});

test('compiled server retains sanitized parser errors', async () => {
  const response = await request('/api/physical-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"synthetic-secret":' });
  assert.equal(response.status, 400); const body = await response.json();
  assert.deepEqual(body, { message: 'Invalid JSON body' });
  assert.match(response.headers.get('cache-control'), /no-store/);
});

test('invalid listener configuration exits clearly instead of silently using another port', async () => {
  for (const invalid of [{ PORT: 'not-a-port' }, { PORT: '65536' }, { HOST: 'https://127.0.0.1' }]) {
    const result = spawnSync(process.execPath, [resolve(appRoot, 'scripts/start-production.mjs')], {
      cwd: appRoot, env: { ...env, ...invalid }, windowsHide: true, encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.error, undefined); assert.equal(result.status, 1);
    assert.match(result.stderr, /Application startup failed/); assert.doesNotMatch(result.stdout, /serving on/);
  }
});
