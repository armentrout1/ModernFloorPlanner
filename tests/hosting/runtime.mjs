import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { createFixtureTls } from '../accounts/tls-fixture.mjs';
import { startFixtureProcess } from '../accounts/runtime.mjs';

const bindings = [['127.0.0.2', 54440], ['127.0.0.3', 54441], ['127.0.0.1', 54442], ['127.0.0.1', 54443]];
async function assertPortsAvailable() {
  for (const [host, port] of bindings) await new Promise((done, reject) => {
    const server = createServer();
    server.once('error', () => reject(new Error('Hosting fixture port is already occupied; no process was stopped.')));
    server.listen({ host, port, exclusive: true }, () => server.close(done));
  });
}

/** New origins, fresh SQL database, ephemeral CA. Never reads an owner database. */
export async function createHostingFixture() {
  const supplied = process.env.MFP_TEST_DATABASE_URL;
  const directory = process.env.MFP_TEST_DATA_DIRECTORY;
  assert.ok(supplied && directory, 'Explicit disposable database URL and actual data directory are required.');
  const url = new URL(supplied);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, '127.0.0.1'); assert.equal(decodeURIComponent(url.username), 'mfp_test');
  assert.match(url.pathname.slice(1), /^mfp_[a-z0-9_]+_test$/); assert.equal(url.search, '');
  await assertPortsAvailable();
  const normalized = value => resolve(value).replaceAll('\\', '/').toLowerCase();
  const admin = postgres(supplied, { max: 1, connect_timeout: 5, onnotice: () => {} });
  const database = `mfp_hosting_${randomUUID().replaceAll('-', '')}_test`;
  const children = []; let created = false; let tls;
  const start = async (file, env, ready) => {
    const owned = await startFixtureProcess(file, env, ready); let stopped = false;
    const child = { child: owned.child, stop: async () => {
      if (stopped || owned.child.exitCode !== null || owned.child.signalCode !== null) return;
      stopped = true; await owned.stop();
    } };
    children.push(child); return child;
  };
  const cleanup = async () => {
    for (const child of children.reverse()) await child.stop();
    if (created) {
      assert.match(database, /^mfp_hosting_[a-f0-9]{32}_test$/);
      await admin.unsafe(`drop database "${database}" with (force)`); created = false;
    }
    await admin.end(); tls?.cleanup();
  };
  try {
    const [actual] = await admin`select current_database() as database,current_user as username,current_setting('data_directory') as directory,host(inet_server_addr()) as address`;
    assert.equal(actual.database, url.pathname.slice(1)); assert.equal(actual.username, 'mfp_test');
    assert.equal(actual.address, '127.0.0.1'); assert.equal(normalized(actual.directory), normalized(directory));
    await admin.unsafe(`create database "${database}"`); created = true; url.pathname = '/' + database;
    const setup = postgres(url.href, { max: 1, connect_timeout: 5, onnotice: () => {} });
    try {
      await setup.unsafe('create table floor_plans(id serial primary key,name text not null,rooms jsonb not null,created_at text not null,updated_at text not null); create table users(id serial primary key,username text not null unique,password text not null);');
      for (const name of ['0001_workspace_authorization.sql', '0002_oidc_sessions_accounts.sql', '0003_physical_plans.sql', '0004_physical_project_lifecycle.sql'])
        await setup.unsafe(readFileSync(resolve('migrations', name), 'utf8'));
    } finally { await setup.end(); }
    tls = createFixtureTls();
    const clean = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(MFP_|DATABASE_URL$|PG|VERCEL|NODE_OPTIONS$|NODE_EXTRA_CA_CERTS$|NODE_TLS_REJECT_UNAUTHORIZED$)/i.test(key)));
    const env = { ...clean, NODE_ENV: 'production', VERCEL: '1', NODE_EXTRA_CA_CERTS: tls.ca,
      MFP_TEST_DATABASE_URL: supplied, MFP_TEST_DATA_DIRECTORY: directory,
      MFP_ACCOUNTS_TLS_KEY: tls.key, MFP_ACCOUNTS_TLS_CERT: tls.cert, MFP_ACCOUNTS_SPKI: tls.spki,
      MFP_ACCOUNTS_APP_ORIGIN: 'https://127.0.0.2:54440', MFP_ACCOUNTS_ISSUER_ORIGIN: 'https://127.0.0.3:54441',
      MFP_ACCOUNTS_CONTROL_SECRET: randomBytes(32).toString('base64url'),
      MFP_APP_ORIGIN: 'https://127.0.0.2:54440', MFP_OIDC_ISSUER: 'https://127.0.0.3:54441',
      MFP_OIDC_CALLBACK_URI: 'https://127.0.0.2:54440/api/auth/callback', MFP_OIDC_CLIENT_ID: 'mfp-isolated-hosting-client',
      MFP_OIDC_CLIENT_AUTH_METHOD: 'client_secret_basic', MFP_OIDC_CLIENT_SECRET: randomBytes(32).toString('base64url'),
      MFP_SESSION_SECRET: randomBytes(48).toString('base64url'), DATABASE_URL: url.href };
    await start('tests/accounts/issuer.ts', env, 'MFP_TEST_ISSUER_READY');
    let hosted;
    const startHosted = async () => { hosted = await start('tests/hosting/handler-server.ts', env, 'MFP_TEST_HOSTING_HANDLER_READY'); return hosted; };
    await startHosted();
    await start('tests/hosting/proxy-server.ts', env, 'MFP_TEST_HOSTING_PROXY_READY');
    await start('dist/index.js', { ...env, HOST: '127.0.0.1', PORT: '54443' }, 'serving on 127.0.0.1:54443');
    return { env, cleanup, restartHosted: async () => { await hosted.stop(); return startHosted(); } };
  } catch (error) { await cleanup(); throw error; }
}
