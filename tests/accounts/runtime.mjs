import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { createFixtureTls } from './tls-fixture.mjs';

export async function startFixtureProcess(file, env, readyMessage) {
  const child = spawn(process.execPath, ['--import', 'tsx', file], { cwd: process.cwd(), env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let ready = false;
  // Deliberately retain no child log bodies: a failed protocol request can contain secrets.
  await new Promise((done, reject) => {
    const timer = setTimeout(() => reject(new Error(`Fixture did not become ready: ${readyMessage}`)), 20_000);
    child.stdout.on('data', data => {
      if (data.toString().includes(readyMessage)) { ready = true; clearTimeout(timer); done(); }
    });
    child.stderr.on('data', () => {});
    child.on('error', () => { clearTimeout(timer); reject(new Error(`Unable to start fixture: ${readyMessage}`)); });
    child.on('exit', () => { if (!ready) { clearTimeout(timer); reject(new Error(`Fixture exited before readiness: ${readyMessage}`)); } });
  }).catch(error => { child.kill(); throw error; });
  return { child, stop: async () => {
    if (child.exitCode !== null) return;
    const closed = once(child, 'exit'); child.kill(); await closed;
  } };
}

/** Called before spawning Node tests so NODE_EXTRA_CA_CERTS takes effect at startup. */
export async function createAccountsFixture() {
  const supplied = process.env.MFP_TEST_DATABASE_URL;
  const directory = process.env.MFP_TEST_DATA_DIRECTORY;
  assert.ok(supplied && directory, 'Set the explicit disposable MFP_TEST_DATABASE_URL and MFP_TEST_DATA_DIRECTORY.');
  const url = new URL(supplied);
  assert.ok(['postgres:', 'postgresql:'].includes(url.protocol));
  assert.equal(url.hostname, '127.0.0.1', 'Only explicit loopback PostgreSQL is permitted');
  assert.equal(decodeURIComponent(url.username), 'mfp_test');
  assert.match(url.pathname.slice(1), /^mfp_[a-z0-9_]+_test$/);
  assert.equal(url.search, '', 'Connection overrides are not accepted');
  const normalized = value => resolve(value).replaceAll('\\', '/').toLowerCase();
  const admin = postgres(supplied, { max: 1, connect_timeout: 5, onnotice: () => {} });
  const database = `mfp_accounts_${randomUUID().replaceAll('-', '')}_test`;
  let created = false;
  let issuer;
  let tls;
  try {
    const [actual] = await admin`select current_database() as database,current_user as username,current_setting('data_directory') as directory,host(inet_server_addr()) as address`;
    assert.equal(actual.database, url.pathname.slice(1)); assert.equal(actual.username, 'mfp_test');
    assert.equal(actual.address, '127.0.0.1'); assert.equal(normalized(actual.directory), normalized(directory));
    await admin.unsafe(`create database "${database}"`); created = true;
    url.pathname = `/${database}`;
    const setup = postgres(url.href, { max: 1, connect_timeout: 5, onnotice: () => {} });
    try {
      await setup.unsafe(`create table floor_plans(id serial primary key,name text not null,rooms jsonb not null,created_at text not null,updated_at text not null);
        create table users(id serial primary key,username text not null unique,password text not null);
        insert into floor_plans(name,rooms,created_at,updated_at) values('Unowned synthetic legacy','[]','fixture-created','fixture-updated');`);
      for (const migration of ['0001_workspace_authorization.sql', '0002_oidc_sessions_accounts.sql', '0003_physical_plans.sql']) {
        await setup.unsafe(readFileSync(resolve('migrations', migration), 'utf8'));
      }
    } finally { await setup.end(); }
    tls = createFixtureTls();
    const env = { ...process.env, NODE_ENV: 'production', NODE_EXTRA_CA_CERTS: tls.ca,
      MFP_ACCOUNTS_TLS_KEY: tls.key, MFP_ACCOUNTS_TLS_CERT: tls.cert, MFP_ACCOUNTS_SPKI: tls.spki,
      MFP_ACCOUNTS_APP_ORIGIN: 'https://127.0.0.2:54420', MFP_ACCOUNTS_ISSUER_ORIGIN: 'https://127.0.0.3:54421',
      MFP_ACCOUNTS_CONTROL_SECRET: randomBytes(32).toString('base64url'),
      MFP_APP_ORIGIN: 'https://127.0.0.2:54420', MFP_OIDC_ISSUER: 'https://127.0.0.3:54421',
      MFP_OIDC_CALLBACK_URI: 'https://127.0.0.2:54420/api/auth/callback', MFP_OIDC_CLIENT_ID: 'mfp-isolated-accounts-client',
      MFP_OIDC_CLIENT_AUTH_METHOD: 'client_secret_basic', MFP_OIDC_CLIENT_SECRET: randomBytes(32).toString('base64url'),
      MFP_SESSION_SECRET: randomBytes(48).toString('base64url'), DATABASE_URL: url.href };
    delete env.NODE_TLS_REJECT_UNAUTHORIZED;
    issuer = await startFixtureProcess('tests/accounts/issuer.ts', env, 'MFP_TEST_ISSUER_READY');
    return { env, tls, startApp: overrides => startFixtureProcess('tests/accounts/app-server.ts', { ...env, ...overrides }, 'MFP_TEST_APP_READY'),
      cleanup: async () => {
        await issuer.stop();
        // Only the exact randomly named database created above can be dropped.
        await admin.unsafe(`drop database "${database}" with (force)`); await admin.end(); tls.cleanup();
      } };
  } catch (error) {
    if (issuer) await issuer.stop();
    if (created) await admin.unsafe(`drop database "${database}" with (force)`);
    await admin.end(); if (tls) tls.cleanup(); throw error;
  }
}
