import { createClient, type AuthChangeEvent, type Session } from '@supabase/supabase-js';

export interface PublicSupabaseConfiguration {
  url: string;
  publishableKey: string;
}

export class SupabaseAccountError extends Error {
  constructor(readonly code: 'NOT_CONFIGURED' | 'SIGN_IN_FAILED' | 'SIGN_UP_FAILED' | 'RESET_FAILED' | 'PASSWORD_UPDATE_FAILED') {
    super(code);
    this.name = 'SupabaseAccountError';
  }
}

const publishableKeyPattern = /^sb_publishable_[A-Za-z0-9_-]{20,2048}$/;

export function parsePublicSupabaseConfiguration(source: Record<string, unknown>): PublicSupabaseConfiguration | null {
  const rawUrl = source.VITE_SUPABASE_URL;
  const publishableKey = source.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (typeof rawUrl !== 'string' || typeof publishableKey !== 'string' || rawUrl !== rawUrl.trim() ||
      publishableKey !== publishableKey.trim() || !publishableKeyPattern.test(publishableKey)) return null;
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        url.origin !== rawUrl) return null;
    return { url: url.origin, publishableKey };
  } catch {
    return null;
  }
}

function configuration(): PublicSupabaseConfiguration {
  const parsed = parsePublicSupabaseConfiguration(import.meta.env);
  if (!parsed) throw new SupabaseAccountError('NOT_CONFIGURED');
  return parsed;
}

let client: ReturnType<typeof createClient> | null = null;
function supabase() {
  if (client) return client;
  const settings = configuration();
  client = createClient(settings.url, settings.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: true,
      flowType: 'implicit',
    },
  });
  return client;
}

function accessToken(session: Session | null): string {
  const token = session?.access_token;
  if (!token || token.length < 16 || token.length > 8192 || /[\u0000-\u0020\u007f]/.test(token))
    throw new SupabaseAccountError('SIGN_IN_FAILED');
  return token;
}

export async function signInWithSupabase(email: string, password: string): Promise<string> {
  const result = await supabase().auth.signInWithPassword({ email, password });
  if (result.error || !result.data.user) throw new SupabaseAccountError('SIGN_IN_FAILED');
  return accessToken(result.data.session);
}

export async function signUpWithSupabase(email: string, password: string): Promise<string | null> {
  const result = await supabase().auth.signUp({
    email,
    password,
    options: { emailRedirectTo: location.origin + '/account/confirm' },
  });
  if (result.error || !result.data.user) throw new SupabaseAccountError('SIGN_UP_FAILED');
  return result.data.session ? accessToken(result.data.session) : null;
}

export async function sendSupabasePasswordReset(email: string): Promise<void> {
  const result = await supabase().auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + '/account/reset-password',
  });
  if (result.error) throw new SupabaseAccountError('RESET_FAILED');
}

export async function updateSupabasePassword(password: string): Promise<void> {
  const result = await supabase().auth.updateUser({ password });
  if (result.error || !result.data.user) throw new SupabaseAccountError('PASSWORD_UPDATE_FAILED');
}

export async function clearSupabaseSession(): Promise<void> {
  try { await supabase().auth.signOut({ scope: 'local' }); } catch { /* MFP session remains authoritative. */ }
}

export async function currentSupabaseAccessToken(): Promise<string | null> {
  const result = await supabase().auth.getSession();
  if (result.error || !result.data.session) return null;
  try { return accessToken(result.data.session); } catch { return null; }
}

export function onSupabaseAuthChange(listener: (event: AuthChangeEvent, accessToken: string | null) => void): () => void {
  const subscription = supabase().auth.onAuthStateChange((event, session) => {
    let token: string | null = null;
    try { if (session) token = accessToken(session); } catch { token = null; }
    listener(event, token);
  });
  return () => subscription.data.subscription.unsubscribe();
}
