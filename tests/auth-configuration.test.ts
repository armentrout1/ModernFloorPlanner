import test from 'node:test';
import assert from 'node:assert/strict';
import { readAuthConfiguration, safeReturnPath } from '../server/authConfiguration';
const valid = {
  MFP_OIDC_ISSUER: 'https://identity.example', MFP_OIDC_CLIENT_ID: 'mfp-client',
  MFP_OIDC_CLIENT_AUTH_METHOD: 'none', MFP_APP_ORIGIN: 'https://app.example',
  MFP_OIDC_CALLBACK_URI: 'https://app.example/api/auth/callback', MFP_SESSION_SECRET: 'a'.repeat(43),
  DATABASE_URL: 'postgres://synthetic@127.0.0.1/test',
};
test('OIDC configuration requires every trusted server binding and never uses ambient identity hints', () => {
  assert.ok(readAuthConfiguration(valid));
  for (const key of Object.keys(valid)) {
    const env = { ...valid } as NodeJS.ProcessEnv; delete env[key];
    assert.equal(readAuthConfiguration(env), null, key);
  }
  assert.equal(readAuthConfiguration({ MFP_TEST_IDENTITY: 'owner', AUTH_USER: 'owner' }), null);
});
test('OIDC configuration rejects insecure URLs, dynamic discovery, redirects and invalid credentials', () => {
  for (const patch of [
    { MFP_OIDC_ISSUER: 'http://localhost:54421' },
    { MFP_OIDC_ISSUER: 'https://user:secret@identity.example' },
    { MFP_OIDC_ISSUER: 'https://identity.example/.well-known/openid-configuration' },
    { MFP_OIDC_ISSUER: 'https://identity.example?issuer=other' },
    { MFP_APP_ORIGIN: 'http://localhost:54420' }, { MFP_APP_ORIGIN: 'https://app.example/' },
    { MFP_APP_ORIGIN: 'https://app.example/path' }, { MFP_APP_ORIGIN: 'https://app.example#fragment' },
    { MFP_OIDC_CALLBACK_URI: 'https://other.example/api/auth/callback' },
    { MFP_OIDC_CALLBACK_URI: 'https://app.example/api/auth/callback?next=evil' },
    { MFP_OIDC_CLIENT_AUTH_METHOD: 'arbitrary' }, { MFP_OIDC_CLIENT_AUTH_METHOD: 'client_secret_basic' },
    { MFP_OIDC_CLIENT_SECRET: 'unexpected-with-none' },
    { MFP_SESSION_SECRET: 'short' }, { MFP_SESSION_SECRET: ' '.repeat(60) },
    { DATABASE_URL: '' }, { DATABASE_URL: 'file:/tmp/db' }, { DATABASE_URL: 'postgres://localhost' },
  ]) assert.equal(readAuthConfiguration({ ...valid, ...patch }), null, JSON.stringify(Object.keys(patch)));
});
test('confidential client methods require an explicit secret and retain exact issuer/subject trust', () => {
  for (const method of ['client_secret_basic', 'client_secret_post']) {
    const config = readAuthConfiguration({ ...valid, MFP_OIDC_CLIENT_AUTH_METHOD: method, MFP_OIDC_CLIENT_SECRET: 'server-only-secret' });
    assert.equal(config?.clientAuthMethod, method);
    assert.equal(config?.issuer, valid.MFP_OIDC_ISSUER);
  }
});
test('OIDC return targets are a fixed application route allowlist', () => {
  for (const path of ['/', '/physical-draft', '/quick-room']) assert.equal(safeReturnPath(path), path);
  for (const path of ['//evil.example', 'https://evil.example', '/physical-draft?secret=1', '/account/callback', '/%2f%2fevil', ['/', '/bad'], null])
    assert.equal(safeReturnPath(path), null);
});
