// Separate protocol fixture. No production module imports or mounts this issuer.
import express from 'express';
import { createServer } from 'node:https';
import { createHash, generateKeyPairSync, randomBytes, sign, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

const origin = process.env.MFP_ACCOUNTS_ISSUER_ORIGIN!;
const callback = `${process.env.MFP_ACCOUNTS_APP_ORIGIN}/api/auth/callback`;
const clientId = process.env.MFP_OIDC_CLIENT_ID!;
const clientSecret = process.env.MFP_OIDC_CLIENT_SECRET!;
const controlSecret = process.env.MFP_ACCOUNTS_CONTROL_SECRET!;
if (new URL(origin).hostname !== '127.0.0.3' || new URL(callback).hostname !== '127.0.0.2' || !controlSecret) throw new Error('Invalid isolated issuer binding');
const signing = generateKeyPairSync('rsa', { modulusLength: 2048 });
const wrongSigning = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...signing.publicKey.export({ format: 'jwk' }), kid: 'fixture-signing-key', use: 'sig', alg: 'RS256' };
export type IssuerMode = 'normal' | 'wrong-issuer' | 'wrong-audience' | 'wrong-azp' | 'wrong-nonce' | 'wrong-signature'
  | 'expired-token' | 'expired-code' | 'wrong-pkce' | 'wrong-state' | 'token-failure' | 'missing-id-token' | 'malformed-token';
let configuration = { mode: 'normal' as IssuerMode, discoveryFailure: false, discoveryIssuerMismatch: false, tokenDelayMs: 0, subjectPrefix: '' };
const counts = { discovery: 0, authorization: 0, token: 0, jwks: 0, rejectedPkce: 0, rejectedCode: 0, rejectedCredentials: 0, rejectedRedirect: 0, rejectedGrant: 0 };
type Attempt = { redirect: string; state: string; nonce: string; challenge: string; issuer: string; mode: IssuerMode; tokenDelayMs: number; subjectPrefix: string };
const attempts = new Map<string, Attempt>();
const codes = new Map<string, Attempt & { subject: string; expiresAt: number }>();
const random = () => randomBytes(32).toString('base64url');
const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' }); next(); });
app.use(express.urlencoded({ extended: false, limit: '8kb' }));
app.use(express.json({ limit: '2kb' }));
app.use('/test', (req, res, next) => {
  const token = req.get('x-mfp-fixture-control') || '';
  if (Buffer.byteLength(token) !== Buffer.byteLength(controlSecret) || !timingSafeEqual(Buffer.from(token), Buffer.from(controlSecret))) { res.sendStatus(404); return; }
  next();
});
app.post('/test/control', (req, res) => {
  const modes: IssuerMode[] = ['normal', 'wrong-issuer', 'wrong-audience', 'wrong-azp', 'wrong-nonce', 'wrong-signature', 'expired-token', 'expired-code', 'wrong-pkce', 'wrong-state', 'token-failure', 'missing-id-token', 'malformed-token'];
  if (req.body.mode !== undefined && !modes.includes(req.body.mode)) { res.sendStatus(400); return; }
  if (req.body.tokenDelayMs !== undefined && (!Number.isInteger(req.body.tokenDelayMs) || req.body.tokenDelayMs < 0 || req.body.tokenDelayMs > 5000)) { res.sendStatus(400); return; }
  if (req.body.subjectPrefix !== undefined && (typeof req.body.subjectPrefix !== 'string' || !/^[A-Za-z0-9_-]{0,60}$/.test(req.body.subjectPrefix))) { res.sendStatus(400); return; }
  configuration = { mode: req.body.mode ?? 'normal', discoveryFailure: req.body.discoveryFailure === true,
    discoveryIssuerMismatch: req.body.discoveryIssuerMismatch === true, tokenDelayMs: req.body.tokenDelayMs ?? 0, subjectPrefix: req.body.subjectPrefix ?? configuration.subjectPrefix };
  res.json({ ok: true });
});
app.get('/test/events', (_req, res) => res.json(counts));
for (const prefix of ['', '/second']) {
  const issuer = `${origin}${prefix}`;
  app.get(`${prefix}/.well-known/openid-configuration`, (_req, res) => {
    counts.discovery++;
    if (configuration.discoveryFailure) { res.status(503).json({ error: 'temporarily_unavailable' }); return; }
    res.json({ issuer: configuration.discoveryIssuerMismatch ? `${origin}/different` : issuer,
      authorization_endpoint: `${issuer}/authorize`, token_endpoint: `${issuer}/token`, jwks_uri: `${issuer}/jwks`,
      response_types_supported: ['code'], subject_types_supported: ['public'], id_token_signing_alg_values_supported: ['RS256'],
      scopes_supported: ['openid', 'profile', 'email'], token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'], authorization_response_iss_parameter_supported: true });
  });
  app.get(`${prefix}/jwks`, (_req, res) => { counts.jwks++; res.json({ keys: [jwk] }); });
  app.get(`${prefix}/authorize`, (req, res) => {
    counts.authorization++;
    const query = req.query;
    if (query.client_id !== clientId || query.redirect_uri !== callback || query.response_type !== 'code' || query.code_challenge_method !== 'S256'
      || typeof query.code_challenge !== 'string' || typeof query.state !== 'string' || typeof query.nonce !== 'string'
      || !String(query.scope).split(' ').includes('openid')) { res.status(400).send('Invalid authorization request'); return; }
    const id = random();
    attempts.set(id, { redirect: callback, state: query.state, nonce: query.nonce, challenge: query.code_challenge, issuer,
      mode: configuration.mode, tokenDelayMs: configuration.tokenDelayMs, subjectPrefix: configuration.subjectPrefix });
    res.type('html').send(`<!doctype html><html lang="en"><head><meta name="referrer" content="no-referrer"><title>Isolated OIDC test issuer</title></head><body><main><h1>Isolated OIDC test issuer</h1><p>Synthetic accounts only.</p><form method="post" action="${prefix}/authorize/${id}"><button name="account" value="account-a">Continue as Account A</button><button name="account" value="account-b">Continue as Account B</button><button name="account" value="account-c">Continue as Account C</button><button name="account" value="cancel">Cancel sign-in</button></form></main></body></html>`);
  });
  app.post(`${prefix}/authorize/:id`, (req, res) => {
    const attempt = attempts.get(req.params.id);
    if (!attempt || attempt.issuer !== issuer) { res.sendStatus(400); return; }
    attempts.delete(req.params.id);
    const redirect = new URL(attempt.redirect);
    redirect.searchParams.set('state', attempt.mode === 'wrong-state' ? random() : attempt.state);
    redirect.searchParams.set('iss', issuer);
    if (req.body.account === 'cancel') redirect.searchParams.set('error', 'access_denied');
    else {
      if (!['account-a', 'account-b', 'account-c'].includes(req.body.account)) { res.sendStatus(400); return; }
      const code = random(); codes.set(code, { ...attempt, subject: req.body.account, expiresAt: Date.now() + (attempt.mode === 'expired-code' ? -1 : 60_000) });
      redirect.searchParams.set('code', code);
    }
    res.redirect(303, redirect.href);
  });
  app.post(`${prefix}/token`, async (req, res) => {
    counts.token++;
    const grant = codes.get(req.body.code); codes.delete(req.body.code);
    if (!grant || grant.issuer !== issuer || grant.expiresAt <= Date.now()) { counts.rejectedCode++; res.status(400).json({ error: 'invalid_grant' }); return; }
    const method = process.env.MFP_OIDC_CLIENT_AUTH_METHOD;
    let basicMatches = false;
    try {
      const header = req.get('authorization') || '';
      const encoded = /^Basic ([A-Za-z0-9+/=]+)$/i.exec(header)?.[1];
      if (encoded) {
        const decoded = Buffer.from(encoded, 'base64').toString('utf8'), separator = decoded.indexOf(':');
        const unescape = (value: string) => decodeURIComponent(value.replaceAll('+', ' '));
        basicMatches = separator >= 0 && unescape(decoded.slice(0, separator)) === clientId && unescape(decoded.slice(separator + 1)) === clientSecret;
      }
    } catch { basicMatches = false; }
    const credentials = method === 'client_secret_basic'
      ? basicMatches
      : req.body.client_id === clientId && (method === 'none' || req.body.client_secret === clientSecret);
    if (!credentials || req.body.grant_type !== 'authorization_code' || req.body.redirect_uri !== callback) { if (!credentials) counts.rejectedCredentials++; if (req.body.grant_type !== 'authorization_code') counts.rejectedGrant++; if (req.body.redirect_uri !== callback) counts.rejectedRedirect++; res.status(400).json({ error: 'invalid_client' }); return; }
    const challenge = typeof req.body.code_verifier === 'string' ? createHash('sha256').update(req.body.code_verifier).digest('base64url') : '';
    if (grant.mode === 'wrong-pkce' || challenge !== grant.challenge) { counts.rejectedPkce++; res.status(400).json({ error: 'invalid_grant' }); return; }
    if (grant.tokenDelayMs) await new Promise(resolve => setTimeout(resolve, grant.tokenDelayMs));
    if (grant.mode === 'token-failure') { res.status(503).json({ error: 'temporarily_unavailable' }); return; }
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: grant.mode === 'wrong-issuer' ? `${origin}/not-configured` : issuer, sub: grant.subjectPrefix ? grant.subjectPrefix + ':' + grant.subject : grant.subject,
      aud: grant.mode === 'wrong-audience' ? 'another-client' : grant.mode === 'wrong-azp' ? [clientId, 'another-audience'] : clientId,
      ...(grant.mode === 'wrong-azp' ? { azp: 'another-client' } : {}), iat: now, exp: grant.mode === 'expired-token' ? now - 3600 : now + 300,
      nonce: grant.mode === 'wrong-nonce' ? random() : grant.nonce, email: 'shared-synthetic@example.invalid', name: `Synthetic ${grant.subject}` };
    const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const content = `${encoded({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })}.${encoded(claims)}`;
    const signature = sign('RSA-SHA256', Buffer.from(content), grant.mode === 'wrong-signature' ? wrongSigning.privateKey : signing.privateKey).toString('base64url');
    res.json({ access_token: random(), token_type: 'Bearer', expires_in: 300,
      ...(grant.mode === 'missing-id-token' ? {} : { id_token: grant.mode === 'malformed-token' ? 'invalid' : `${content}.${signature}` }) });
  });
}
const server = createServer({ key: readFileSync(process.env.MFP_ACCOUNTS_TLS_KEY!), cert: readFileSync(process.env.MFP_ACCOUNTS_TLS_CERT!) }, app);
server.listen(Number(new URL(origin).port), '127.0.0.3', () => console.log('MFP_TEST_ISSUER_READY'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
