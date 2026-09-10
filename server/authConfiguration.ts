/** Trusted server configuration only. Request headers and query parameters are never configuration. */
export interface AuthConfiguration {
  issuer: string; clientId: string; clientSecret?: string;
  clientAuthMethod: 'none' | 'client_secret_basic' | 'client_secret_post';
  origin: string; callbackUri: string; sessionSecret: string; databaseUrl: string;
}
const clean = (value: string | undefined, max = 2048): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= max && value === value.trim() &&
  !/[\u0000-\u001f\u007f]/.test(value);
export function readAuthConfiguration(env: NodeJS.ProcessEnv): AuthConfiguration | null {
  try {
    const issuer = env.MFP_OIDC_ISSUER;
    const origin = env.MFP_APP_ORIGIN;
    const callbackUri = env.MFP_OIDC_CALLBACK_URI;
    const clientId = env.MFP_OIDC_CLIENT_ID;
    const clientAuthMethod = env.MFP_OIDC_CLIENT_AUTH_METHOD;
    const clientSecret = env.MFP_OIDC_CLIENT_SECRET;
    const sessionSecret = env.MFP_SESSION_SECRET;
    const databaseUrl = env.DATABASE_URL;
    if (!clean(issuer) || !clean(origin) || !clean(callbackUri) || !clean(clientId, 512) ||
      !clean(sessionSecret, 512) || !/^[A-Za-z0-9_-]{43,}$/.test(sessionSecret) ||
      Buffer.from(sessionSecret, 'base64url').length < 32 || !clean(databaseUrl, 4096)) return null;
    const issuerUrl = new URL(issuer); const originUrl = new URL(origin); const database = new URL(databaseUrl);
    if (issuerUrl.protocol !== 'https:' || issuerUrl.username || issuerUrl.password || issuerUrl.search || issuerUrl.hash ||
      issuerUrl.pathname.includes('/.well-known/') ||
      originUrl.protocol !== 'https:' || originUrl.origin !== origin ||
      callbackUri !== origin + '/api/auth/callback' ||
      !['postgres:', 'postgresql:'].includes(database.protocol) || !database.hostname || !database.username || database.pathname.length < 2 ||
      !['none', 'client_secret_basic', 'client_secret_post'].includes(clientAuthMethod ?? '')) return null;
    if (clientAuthMethod !== 'none' && !clean(clientSecret, 4096)) return null;
    if (clientAuthMethod === 'none' && clientSecret) return null;
    return { issuer, origin, callbackUri, clientId, clientSecret, sessionSecret, databaseUrl,
      clientAuthMethod: clientAuthMethod as AuthConfiguration['clientAuthMethod'] };
  } catch { return null; }
}
export const localReturnPaths = ['/', '/physical-draft', '/quick-room'] as const;
export function safeReturnPath(value: unknown): string | null {
  return typeof value === 'string' && (localReturnPaths as readonly string[]).includes(value) ? value : null;
}
