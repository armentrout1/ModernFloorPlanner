import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePublicSupabaseConfiguration } from '../client/src/features/provider-auth/supabaseAuth';
import { bearerAccessToken, SupabaseVerificationError, verifySupabaseAccessToken } from '../server/supabaseAuth';

const url = 'https://abcdefghijklmnopqrst.supabase.co';
const publishableKey = 'sb_publishable_' + 'a'.repeat(40);
const settings = { supabaseUrl: url, supabasePublishableKey: publishableKey, issuer: url + '/auth/v1' };

test('public Supabase configuration accepts only an exact HTTPS origin and publishable key', () => {
  assert.deepEqual(parsePublicSupabaseConfiguration({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey }), {
    url, publishableKey,
  });
  assert.equal(parsePublicSupabaseConfiguration({ VITE_SUPABASE_URL: 'https://auth.example:54421', VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey })?.url, 'https://auth.example:54421');
  for (const patch of [
    { VITE_SUPABASE_URL: 'http://abcdefghijklmnopqrst.supabase.co' },
    { VITE_SUPABASE_URL: url + '/auth/v1' },
    { VITE_SUPABASE_URL: 'https://user:secret@abcdefghijklmnopqrst.supabase.co' },
    { VITE_SUPABASE_PUBLISHABLE_KEY: 'service_role_secret' },
    { VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.legacy' },
  ]) assert.equal(parsePublicSupabaseConfiguration({ VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: publishableKey, ...patch }), null);
});

test('bearer access tokens are singular, bounded, nonempty and never accepted from another scheme', () => {
  const token = 't'.repeat(32);
  assert.equal(bearerAccessToken('Bearer ' + token), token);
  for (const header of [undefined, '', 'Basic ' + token, 'bearer ' + token, 'Bearer short', 'Bearer ' + token + ' extra', 'Bearer ' + token + '\n'])
    assert.equal(bearerAccessToken(header), null);
});

test('server verifies the access token with Supabase getUser and trusts only the returned user id', async () => {
  const original = globalThis.fetch;
  const subject = '11111111-1111-4111-8111-111111111111';
  let requests = 0;
  globalThis.fetch = async (input, init) => {
    requests++;
    assert.equal(String(input), url + '/auth/v1/user');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Authorization'), 'Bearer ' + 't'.repeat(32));
    assert.equal(headers.get('apikey'), publishableKey);
    return new Response(JSON.stringify({ id: subject, email: 'ignored@example.test', user_metadata: { role: 'owner' } }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    assert.deepEqual(await verifySupabaseAccessToken(settings, 't'.repeat(32)), { issuer: settings.issuer, subject });
    assert.equal(requests, 1);
  } finally { globalThis.fetch = original; }
});

test('invalid Supabase tokens fail as 401 and transport failures fail closed as unavailable', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ message: 'invalid token' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(verifySupabaseAccessToken(settings, 't'.repeat(32)), (error: unknown) => error instanceof SupabaseVerificationError && error.status === 401);
    globalThis.fetch = async () => { throw new Error('synthetic transport outage'); };
    await assert.rejects(verifySupabaseAccessToken(settings, 't'.repeat(32)), (error: unknown) => error instanceof SupabaseVerificationError && error.status === 503);
  } finally { globalThis.fetch = original; }
});
