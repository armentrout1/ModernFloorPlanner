import { readDatabaseConfiguration, type DatabaseConfiguration } from './databaseConfiguration';

/** Trusted server configuration only. Request headers and query parameters are never configuration. */
export interface AuthConfiguration {
  supabaseUrl: string;
  supabasePublishableKey: string;
  issuer: string;
  origin: string;
  sessionSecret: string;
  databaseUrl: string;
  database: DatabaseConfiguration;
}

const clean = (value: string | undefined, max = 2048): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() &&
  !/[\u0000-\u001f\u007f]/.test(value);

const publishableKeyPattern = /^sb_publishable_[A-Za-z0-9_-]{20,2048}$/;

function exactHttpsOrigin(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
        url.origin !== value) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function readAuthConfiguration(env: NodeJS.ProcessEnv): AuthConfiguration | null {
  try {
    const supabaseUrl = env.VITE_SUPABASE_URL;
    const supabasePublishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
    const origin = env.MFP_APP_ORIGIN;
    const sessionSecret = env.MFP_SESSION_SECRET;
    const databaseUrl = env.DATABASE_URL;
    if (!clean(supabaseUrl) || !clean(supabasePublishableKey) || !publishableKeyPattern.test(supabasePublishableKey) ||
        !clean(origin) || !clean(sessionSecret, 512) || !/^[A-Za-z0-9_-]{43,}$/.test(sessionSecret) ||
        Buffer.from(sessionSecret, 'base64url').length < 32 || !clean(databaseUrl, 4096)) return null;
    const trustedSupabaseOrigin = exactHttpsOrigin(supabaseUrl);
    const trustedApplicationOrigin = exactHttpsOrigin(origin);
    if (!trustedSupabaseOrigin || !trustedApplicationOrigin) return null;
    const database = readDatabaseConfiguration(databaseUrl, env);
    return {
      supabaseUrl: trustedSupabaseOrigin,
      supabasePublishableKey,
      issuer: trustedSupabaseOrigin + '/auth/v1',
      origin: trustedApplicationOrigin,
      sessionSecret,
      databaseUrl,
      database,
    };
  } catch {
    return null;
  }
}
