export interface PublicSupabaseConfiguration {
  url: string;
  publishableKey: string;
}

export interface ProviderUser {
  id: string;
  email: string;
}

export interface OAuthAuthorizationDetails {
  authorization_id: string;
  redirect_uri: string;
  client: { id: string; name: string; uri: string; logo_uri: string };
  user: ProviderUser;
  scope: string;
}

export type OAuthAuthorizationLookup = OAuthAuthorizationDetails | { redirect_url: string };

export interface SupabaseAuthorizationService {
  getAuthenticatedUser(): Promise<ProviderUser | null>;
  signInWithPassword(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  getAuthorizationDetails(authorizationId: string): Promise<OAuthAuthorizationLookup>;
  decide(authorizationId: string, decision: 'approve' | 'deny'): Promise<string>;
}

export type AuthorizationLoadResult =
  | { status: 'sign-in' }
  | { status: 'redirect'; redirectUrl: string }
  | { status: 'ready'; details: OAuthAuthorizationDetails; scopes: string[] };

const authorizationIdPattern = /^[A-Za-z0-9._~-]{16,2048}$/;
const projectHostPattern = /^[a-z0-9]{20}\.supabase\.co$/;
const publishableKeyPattern = /^sb_publishable_[A-Za-z0-9_-]{20,2048}$/;

export function parsePublicSupabaseConfiguration(
  source: Record<string, unknown>,
): PublicSupabaseConfiguration | null {
  const rawUrl = source.VITE_SUPABASE_URL;
  const publishableKey = source.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof rawUrl !== 'string' || typeof publishableKey !== 'string' ||
      rawUrl !== rawUrl.trim() || publishableKey !== publishableKey.trim() ||
      !publishableKeyPattern.test(publishableKey)) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || !projectHostPattern.test(url.hostname) ||
        url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash ||
        url.origin !== rawUrl) return null;
    return { url: url.origin, publishableKey };
  } catch {
    return null;
  }
}

export function readAuthorizationId(search: string): string | null {
  const params = new URLSearchParams(search);
  const values = params.getAll('authorization_id');
  return values.length === 1 && authorizationIdPattern.test(values[0]) ? values[0] : null;
}

function parseRegisteredCallback(value: string, expectedOrigin: string, allowQuery: boolean): URL | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.origin !== expectedOrigin || url.pathname !== '/api/auth/callback' ||
        url.username || url.password || url.hash || (!allowQuery && url.search)) return null;
    return url;
  } catch {
    return null;
  }
}

export function safeOAuthRedirect(value: string, expectedOrigin: string): string | null {
  return parseRegisteredCallback(value, expectedOrigin, true)?.href ?? null;
}

function requestedScopes(value: string): string[] | null {
  const scopes = value.split(' ').filter(Boolean);
  return scopes.length === 1 && scopes[0] === 'openid' ? scopes : null;
}

function validDetails(
  value: OAuthAuthorizationDetails,
  authorizationId: string,
  user: ProviderUser,
  expectedOrigin: string,
): string[] | null {
  if (value.authorization_id !== authorizationId || value.user.id !== user.id || value.user.email !== user.email ||
      !authorizationIdPattern.test(value.authorization_id) ||
      typeof value.client?.id !== 'string' || !value.client.id ||
      typeof value.client?.name !== 'string' || !value.client.name.trim() || value.client.name.length > 200 ||
      !parseRegisteredCallback(value.redirect_uri, expectedOrigin, false)) return null;
  return requestedScopes(value.scope);
}

export async function loadAuthorizationRequest(
  service: SupabaseAuthorizationService,
  authorizationId: string,
  expectedOrigin: string,
): Promise<AuthorizationLoadResult> {
  if (!authorizationIdPattern.test(authorizationId)) throw new Error('INVALID_AUTHORIZATION_REQUEST');
  const user = await service.getAuthenticatedUser();
  if (!user) return { status: 'sign-in' };
  const result = await service.getAuthorizationDetails(authorizationId);
  if ('redirect_url' in result) {
    const redirectUrl = safeOAuthRedirect(result.redirect_url, expectedOrigin);
    if (!redirectUrl) throw new Error('INVALID_AUTHORIZATION_RESPONSE');
    return { status: 'redirect', redirectUrl };
  }
  const scopes = validDetails(result, authorizationId, user, expectedOrigin);
  if (!scopes) throw new Error('INVALID_AUTHORIZATION_RESPONSE');
  return { status: 'ready', details: result, scopes };
}

export async function completeAuthorizationDecision(
  service: SupabaseAuthorizationService,
  authorizationId: string,
  decision: 'approve' | 'deny',
  expectedOrigin: string,
): Promise<string> {
  if (!authorizationIdPattern.test(authorizationId)) throw new Error('INVALID_AUTHORIZATION_REQUEST');
  const redirectUrl = await service.decide(authorizationId, decision);
  const safe = safeOAuthRedirect(redirectUrl, expectedOrigin);
  if (!safe) throw new Error('INVALID_AUTHORIZATION_RESPONSE');
  return safe;
}
