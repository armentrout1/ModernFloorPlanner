import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completeAuthorizationDecision,
  loadAuthorizationRequest,
  parsePublicSupabaseConfiguration,
  readAuthorizationId,
  safeOAuthRedirect,
  type OAuthAuthorizationLookup,
  type ProviderUser,
  type SupabaseAuthorizationService,
} from '../client/src/features/provider-auth/supabaseAuthorization';

const authorizationId = 'authorization_request_123456';
const origin = 'https://floor.example';
const user = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test' };
const details = {
  authorization_id: authorizationId,
  redirect_uri: origin + '/api/auth/callback',
  client: { id: 'mfp-client', name: 'Modern Floor Planner', uri: origin, logo_uri: '' },
  user,
  scope: 'openid',
};

function service(options: {
  user?: ProviderUser | null;
  lookup?: OAuthAuthorizationLookup;
  redirect?: string;
} = {}): SupabaseAuthorizationService {
  return {
    async getAuthenticatedUser() { return options.user === undefined ? user : options.user; },
    async signInWithPassword() {},
    async signOut() {},
    async getAuthorizationDetails() { return options.lookup ?? details; },
    async decide() { return options.redirect ?? origin + '/api/auth/callback?code=synthetic&state=opaque'; },
  };
}

test('public Supabase configuration accepts only an exact hosted project URL and publishable key', () => {
  const valid = { VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_' + 'a'.repeat(40) };
  assert.deepEqual(parsePublicSupabaseConfiguration(valid), {
    url: valid.VITE_SUPABASE_URL, publishableKey: valid.VITE_SUPABASE_PUBLISHABLE_KEY,
  });
  for (const patch of [
    { VITE_SUPABASE_URL: 'http://abcdefghijklmnopqrst.supabase.co' },
    { VITE_SUPABASE_URL: 'https://abcdefghijklmnopqrst.supabase.co/auth/v1' },
    { VITE_SUPABASE_URL: 'https://other.example' },
    { VITE_SUPABASE_URL: 'https://user:secret@abcdefghijklmnopqrst.supabase.co' },
    { VITE_SUPABASE_PUBLISHABLE_KEY: 'service_role_secret' },
    { VITE_SUPABASE_PUBLISHABLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.legacy' },
  ]) assert.equal(parsePublicSupabaseConfiguration({ ...valid, ...patch }), null);
});

test('authorization identifier is singular, opaque, bounded and never accepted from another parameter', () => {
  assert.equal(readAuthorizationId('?authorization_id=' + authorizationId), authorizationId);
  for (const search of ['', '?authorization_id=short', '?authorization_id=' + authorizationId + '&authorization_id=other_value_123456',
    '?authorization_id=' + encodeURIComponent('https://attacker.example'), '?state=' + authorizationId])
    assert.equal(readAuthorizationId(search), null);
});

test('signed-out users are sent to the owner sign-in form before authorization details are read', async () => {
  let lookups = 0;
  const signedOut = service({ user: null });
  signedOut.getAuthorizationDetails = async () => { lookups++; return details; };
  assert.deepEqual(await loadAuthorizationRequest(signedOut, authorizationId, origin), { status: 'sign-in' });
  assert.equal(lookups, 0);
});

test('authorization requires the same verified user, exact callback and only the openid scope', async () => {
  const ready = await loadAuthorizationRequest(service(), authorizationId, origin);
  assert.equal(ready.status, 'ready');
  if (ready.status === 'ready') assert.deepEqual(ready.scopes, ['openid']);
  for (const lookup of [
    { ...details, user: { ...user, id: '22222222-2222-4222-8222-222222222222' } },
    { ...details, user: { ...user, email: 'different@example.test' } },
    { ...details, redirect_uri: 'https://attacker.example/api/auth/callback' },
    { ...details, redirect_uri: origin + '/api/auth/callback?other=1' },
    { ...details, scope: 'openid email' },
    { ...details, authorization_id: 'different_request_123456' },
  ]) await assert.rejects(loadAuthorizationRequest(service({ lookup }), authorizationId, origin), /INVALID_AUTHORIZATION_RESPONSE/);
});

test('prior consent and explicit decisions redirect only to the same exact callback route', async () => {
  const already = await loadAuthorizationRequest(service({ lookup: {
    redirect_url: origin + '/api/auth/callback?code=prior&state=opaque',
  } }), authorizationId, origin);
  assert.equal(already.status, 'redirect');
  const approved = await completeAuthorizationDecision(service(), authorizationId, 'approve', origin);
  assert.equal(approved, origin + '/api/auth/callback?code=synthetic&state=opaque');
  for (const value of ['https://attacker.example/api/auth/callback?code=x', origin + '/other?code=x',
    origin + '/api/auth/callback#code=x', 'javascript:alert(1)']) {
    assert.equal(safeOAuthRedirect(value, origin), null);
    await assert.rejects(completeAuthorizationDecision(service({ redirect: value }), authorizationId, 'approve', origin), /INVALID_AUTHORIZATION_RESPONSE/);
  }
});
