import type { Request } from 'express';
import type { VerifiedIdentity } from './authorizationTypes';

export type IdentityFailure = 'absent' | 'expired' | 'revoked' | 'invalid' | 'unavailable';
export type IdentityResolution = {
  status: 'authenticated'; identity: VerifiedIdentity; expiresAt: number;
  authentication: 'session' | 'bearer';
} | { status: IdentityFailure };
export type IdentityResolver = (request: Request) => Promise<IdentityResolution>;

export async function resolveIdentity(resolver: IdentityResolver, request: Request): Promise<IdentityResolution> {
  try {
    const result = await resolver(request);
    if (!result || typeof result !== 'object') return { status: 'invalid' };
    if (result.status !== 'authenticated') {
      return ['absent', 'expired', 'revoked', 'invalid', 'unavailable'].includes(result.status)
        ? result : { status: 'invalid' };
    }
    const { identity, expiresAt, authentication } = result;
    if (!identity || ![identity.issuer, identity.subject].every(value =>
      typeof value === 'string' && value.trim().length > 0 && value.length <= 2048 && !/[\u0000-\u001f\u007f]/.test(value)) ||
      !Number.isFinite(expiresAt) || !['session', 'bearer'].includes(authentication)) return { status: 'invalid' };
    return expiresAt <= Date.now() ? { status: 'expired' } : result;
  } catch { return { status: 'unavailable' }; }
}

// The configured server session integration honors this policy without HTTP fallbacks.
export const sessionCookiePolicy = Object.freeze({
  name: '__Host-mfp-session', httpOnly: true, secure: true, sameSite: 'lax' as const, path: '/',
});

export function configuredApplicationOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
    if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/') return null;
    return url.origin;
  } catch { return null; }
}
