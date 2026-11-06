import test from 'node:test';
import assert from 'node:assert/strict';
import { readAuthConfiguration } from '../server/authConfiguration';

const valid = {
  VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'a'.repeat(40),
  MFP_APP_ORIGIN: 'https://app.example',
  MFP_SESSION_SECRET: 'a'.repeat(43),
  DATABASE_URL: 'postgres://synthetic@127.0.0.1/test',
};

test('Supabase Auth configuration requires every trusted binding and never uses ambient identity hints', () => {
  const configuration = readAuthConfiguration(valid);
  assert.ok(configuration);
  assert.equal(configuration.issuer, valid.VITE_SUPABASE_URL + '/auth/v1');
  for (const key of Object.keys(valid)) {
    const env = { ...valid } as NodeJS.ProcessEnv; delete env[key];
    assert.equal(readAuthConfiguration(env), null, key);
  }
  assert.equal(readAuthConfiguration({ MFP_TEST_IDENTITY: 'owner', AUTH_USER: 'owner' }), null);
});

test('Supabase Auth configuration rejects insecure or ambiguous origins, nonpublishable keys and invalid credentials', () => {
  for (const patch of [
    { VITE_SUPABASE_URL: 'http://abcdefghijklmnopqrst.supabase.co' },
    { VITE_SUPABASE_URL: 'https://user:secret@abcdefghijklmnopqrst.supabase.co' },
    { VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1' },
    { VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co?project=other' },
    { VITE_SUPABASE_PUBLISHABLE_KEY: 'service_role_secret' },
    { VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.legacy' },
    { MFP_APP_ORIGIN: 'http://localhost:54420' },
    { MFP_APP_ORIGIN: 'https://app.example/' },
    { MFP_APP_ORIGIN: 'https://app.example/path' },
    { MFP_APP_ORIGIN: 'https://app.example#fragment' },
    { MFP_SESSION_SECRET: 'short' },
    { MFP_SESSION_SECRET: ' '.repeat(60) },
    { DATABASE_URL: '' },
    { DATABASE_URL: 'file:/tmp/db' },
    { DATABASE_URL: 'postgres://localhost' },
  ]) assert.equal(readAuthConfiguration({ ...valid, ...patch }), null, JSON.stringify(Object.keys(patch)));
});

test('exact HTTPS self-hosted or isolated Supabase origins remain supported without weakening the application origin', () => {
  const configuration = readAuthConfiguration({ ...valid, VITE_SUPABASE_URL: 'https://127.0.0.3:54421' });
  assert.equal(configuration?.supabaseUrl, 'https://127.0.0.3:54421');
  assert.equal(configuration?.issuer, 'https://127.0.0.3:54421/auth/v1');
});
