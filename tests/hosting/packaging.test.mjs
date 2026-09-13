import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, Server, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { publishClientAssets, publishHostedHandler } from '../../scripts/build-vercel.mjs';

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), 'mfp-hosting-package-'));
  try {
    await mkdir(join(root, 'dist/public/assets'), { recursive: true });
    await writeFile(join(root, 'dist/public/index.html'), '<script src="/assets/editor.js"></script>');
    await writeFile(join(root, 'dist/public/assets/editor.js'), 'console.log("synthetic editor")');
    await run(root);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('CDN packaging copies only the client, preserves standalone/server source, and removes stale generated assets', async () => fixture(async root => {
  await writeFile(join(root, 'dist/index.js'), 'private server');
  await writeFile(join(root, '.env'), 'SYNTHETIC_SECRET=not-real');
  await writeFile(join(root, 'owner-draft.json'), '{"name":"preserve"}');
  const result = await publishClientAssets(root);
  assert.deepEqual(Object.keys(result), ['assets/editor.js', 'index.html']);
  assert.equal(await readFile(join(root, 'dist/index.js'), 'utf8'), 'private server');
  assert.equal(await readFile(join(root, 'owner-draft.json'), 'utf8'), '{"name":"preserve"}');
  assert.deepEqual((await readdir(join(root, 'public'))).sort(), ['assets', 'index.html']);
  await rm(join(root, 'dist/public/assets/editor.js'));
  await writeFile(join(root, 'dist/public/assets/new.js'), 'new bundle');
  await publishClientAssets(root);
  assert.deepEqual(await readdir(join(root, 'public/assets')), ['new.js']);
}));

test('existing unmanaged public files are preserved and cause a clear refusal', async () => fixture(async root => {
  await mkdir(join(root, 'public'));
  await writeFile(join(root, 'public/owner.txt'), 'preserve me');
  await assert.rejects(publishClientAssets(root), /unmanaged or changed/);
  assert.equal(await readFile(join(root, 'public/owner.txt'), 'utf8'), 'preserve me');
}));

test('edits to previous generated assets are preserved instead of silently erased', async () => fixture(async root => {
  await publishClientAssets(root);
  await writeFile(join(root, 'public/index.html'), 'owner edit');
  await assert.rejects(publishClientAssets(root), /unmanaged or changed/);
  assert.equal(await readFile(join(root, 'public/index.html'), 'utf8'), 'owner edit');
}));

test('a private file mixed into build output cannot be published', async () => fixture(async root => {
  await writeFile(join(root, 'dist/public/.env'), 'SYNTHETIC_SECRET=not-real');
  await assert.rejects(publishClientAssets(root), /Only compiled client assets/);
  await assert.rejects(readFile(join(root, 'public/index.html')), { code: 'ENOENT' });
}));

test('generated handler stays outside CDN assets and refuses to overwrite owner edits', async () => fixture(async root => {
  await publishHostedHandler('import express from "express"; // synthetic server', root);
  await publishClientAssets(root);
  assert.deepEqual((await readdir(join(root, 'public'))).sort(), ['assets', 'index.html']);
  await publishHostedHandler('import express from "express"; // updated synthetic server', root);
  await writeFile(join(root, 'app.js'), 'owner edit');
  await assert.rejects(publishHostedHandler('replacement', root), /unmanaged or changed/);
  assert.equal(await readFile(join(root, 'app.js'), 'utf8'), 'owner edit');
}));

const artifactRoot = process.env.MFP_VERCEL_ARTIFACT_ROOT;
test('actual Vercel artifact retains complete routing and a cold, production-only API handler',
  { skip: !artifactRoot, timeout: 15000 }, async () => {
    const root = resolve(artifactRoot);
    const config = JSON.parse(await readFile(join(root, 'config.json'), 'utf8'));
    const functionRoot = join(root, 'functions/index.func');
    const runtime = JSON.parse(await readFile(join(functionRoot, '.vc-config.json'), 'utf8'));
    assert.equal(runtime.handler, 'app.js'); assert.equal(runtime.runtime, 'nodejs24.x');
    assert.equal(runtime.framework.slug, 'express');
    const spa = config.routes.filter(route => route.dest === '/index.html');
    assert.equal(spa.length, 1); assert.deepEqual(spa[0].methods, ['GET', 'HEAD']);
    for (const path of ['/', '/quick-room', '/physical-draft', '/account/callback'])
      assert.match(path, new RegExp(spa[0].src));
    for (const path of ['/api', '/api/auth/callback', '/api/physical-plans', '/assets/missing.js', '/unknown'])
      assert.doesNotMatch(path, new RegExp(spa[0].src));
    const reject = config.routes.find(route => route.status === 405);
    assert.equal(reject.src, spa[0].src); assert.equal(reject.headers.Allow, 'GET, HEAD');
    assert.ok(config.routes.some(route => route.handle === 'filesystem'));
    const handlerRoute = config.routes.find(route => route.transforms?.some(change => change.type === 'request.path'));
    assert.equal(handlerRoute.dest, '/');
    assert.deepEqual(handlerRoute.transforms, [{ type: 'request.path', op: 'set', args: '/$1' }]);
    for (const path of ['/api', '/api/auth/callback', '/api/physical-plans/example/revisions'])
      assert.equal(path.replace(new RegExp(handlerRoute.src), handlerRoute.transforms[0].args), path);
    const staticNames = (await readdir(join(root, 'static'), { recursive: true })).filter(name => !['assets'].includes(name));
    assert.equal(staticNames.filter(name => name.endsWith('.html')).length, 1);
    assert.ok(staticNames.some(name => name.endsWith('.js')));
    assert.ok(staticNames.every(name => /(?:^index\.html$|^assets[/\\][^/\\]+\.(?:js|css)$)/.test(name)));

    const prior = { ...process.env }, originalListen = Server.prototype.listen;
    let server;
    try {
      for (const key of Object.keys(process.env)) if (key.startsWith('MFP_') || key.startsWith('VERCEL') || key === 'DATABASE_URL') delete process.env[key];
      delete process.env.NODE_ENV;
      process.env.VERCEL = '1'; process.env.MFP_APP_ORIGIN = 'https://owner-only.example';
      Server.prototype.listen = () => { throw new Error('Hosted entry attempted a listener during import'); };
      const { default: app } = await import(pathToFileURL(join(functionRoot, runtime.handler)).href);
      assert.equal(app.get('env'), 'production');
      Server.prototype.listen = originalListen;
      server = createServer(app); server.listen(0, '127.0.0.1'); await once(server, 'listening');
      const headers = { Host: 'owner-only.example', 'X-Forwarded-Host': 'owner-only.example', 'X-Forwarded-Proto': 'https' };
      const request = (path, options = {}) => new Promise((done, reject) => {
        const req = httpRequest({ host: '127.0.0.1', port: server.address().port, path,
          method: options.method ?? 'GET', headers: { ...headers, ...options.headers } }, response => {
          const chunks = [];
          response.on('data', chunk => chunks.push(chunk));
          response.on('end', () => done(new Response(Buffer.concat(chunks), { status: response.statusCode, headers: response.headers })));
        });
        req.on('error', reject); req.setTimeout(5000, () => req.destroy(new Error('Artifact request timed out')));
        req.end(options.body);
      });
      for (let repeat = 0; repeat < 2; repeat++) {
        const response = await request('/api/auth/session');
        assert.equal(response.status, 200); assert.equal((await response.json()).status, 'unavailable');
        assert.equal(response.headers.get('set-cookie'), null);
      }
      for (const path of ['/api/physical-plans', '/api/floor-plans']) {
        const response = await request(path); assert.equal(response.status, 503);
        assert.match(response.headers.get('cache-control'), /no-store/); await response.json();
      }
      const missing = await request('/api/unknown-artifact-route');
      assert.equal(missing.status, 404); assert.match(missing.headers.get('content-type'), /application\/json/); await missing.json();
      const malformed = await request('/api/physical-plans', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"synthetic-secret":' });
      assert.equal(malformed.status, 400); assert.deepEqual(await malformed.json(), { message: 'Invalid JSON body' });
      const callback = await request('/api/auth/callback?state=synthetic&code=synthetic');
      assert.equal(callback.status, 303); assert.equal(callback.headers.get('location'), '/account/callback?result=failed&returnTo=%2F');
      for (const path of ['/assets/missing.js', '/assets/missing']) {
        const response = await request(path); assert.equal(response.status, 404);
        assert.doesNotMatch(response.headers.get('content-type'), /text\/html/); await response.text();
      }
    } finally {
      Server.prototype.listen = originalListen;
      if (server) { server.closeAllConnections(); await new Promise(done => server.close(done)); }
      for (const key of Object.keys(process.env)) if (!(key in prior)) delete process.env[key];
      Object.assign(process.env, prior);
    }
  });
