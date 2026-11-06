import { createClient } from '@supabase/supabase-js';
import type { AuthConfiguration } from './authConfiguration';
import type { VerifiedIdentity } from './authorizationTypes';

export class SupabaseVerificationError extends Error {
  constructor(readonly status: 401 | 503) {
    super(status === 401 ? 'Supabase access token was not accepted' : 'Supabase authentication is unavailable');
    this.name = 'SupabaseVerificationError';
  }
}

function accessToken(value: string | undefined): string | null {
  if (!value || value.length < 16 || value.length > 8192 || value !== value.trim() || /[\u0000-\u0020\u007f]/.test(value)) return null;
  return value;
}

export function bearerAccessToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer ([^\s]+)$/.exec(header);
  return match ? accessToken(match[1]) : null;
}

/**
 * Verifies every browser token with Supabase Auth. The token is used for this
 * request only and is never stored in the MFP database or server session.
 */
export async function verifySupabaseAccessToken(
  settings: Pick<AuthConfiguration, 'supabaseUrl' | 'supabasePublishableKey' | 'issuer'>,
  token: string,
): Promise<VerifiedIdentity> {
  if (!accessToken(token)) throw new SupabaseVerificationError(401);
  try {
    // Per-request construction avoids sharing user-specific auth state across
    // Vercel Fluid Compute invocations.
    const client = createClient(settings.supabaseUrl, settings.supabasePublishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const result = await client.auth.getUser(token);
    if (result.error) {
      const status = typeof result.error.status === 'number' ? result.error.status : 0;
      const transportFailure = status === 0 || status >= 500 || /fetch|retry/i.test(result.error.name);
      throw new SupabaseVerificationError(transportFailure ? 503 : 401);
    }
    if (!result.data.user?.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result.data.user.id))
      throw new SupabaseVerificationError(401);
    return { issuer: settings.issuer, subject: result.data.user.id };
  } catch (error) {
    if (error instanceof SupabaseVerificationError) throw error;
    throw new SupabaseVerificationError(503);
  }
}
