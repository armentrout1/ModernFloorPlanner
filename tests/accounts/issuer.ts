// Separate Supabase Auth-shaped fixture. No production module imports or mounts this server.
import express from 'express';
import { createServer } from 'node:https';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

const origin = process.env.MFP_ACCOUNTS_SUPABASE_ORIGIN!;
const applicationOrigin = process.env.MFP_ACCOUNTS_APP_ORIGIN!;
const publishableKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const controlSecret = process.env.MFP_ACCOUNTS_CONTROL_SECRET!;
if (new URL(origin).hostname !== '127.0.0.3' || new URL(applicationOrigin).hostname !== '127.0.0.2' ||
    !publishableKey.startsWith('sb_publishable_') || !controlSecret) throw new Error('Invalid isolated Supabase fixture binding');

export type SupabaseFixtureMode = 'normal' | 'token-failure' | 'user-failure' | 'invalid-user';
let configuration = { mode: 'normal' as SupabaseFixtureMode, userDelayMs: 0, subjectPrefix: '' };
const counts = { password: 0, signup: 0, user: 0, recovery: 0, rejectedPassword: 0, rejectedToken: 0 };
const tokens = new Map<string, { id: string; email: string; mode: SupabaseFixtureMode; delay: number; expiresAt: number }>();
const createdUsers = new Map<string, { id: string; password: string }>();
const fixturePassword = (account: string) => `Password-${account.toUpperCase()}-1234`;
const fixtureEmail = (account: string) => `${account}@example.test`;
const random = () => randomBytes(32).toString('base64url');
function subject(account: string) {
  const hex = createHash('sha256').update(configuration.subjectPrefix + ':' + account).digest('hex').slice(0, 32).split('');
  hex[12] = '4'; hex[16] = ['8', '9', 'a', 'b'][parseInt(hex[16], 16) % 4];
  return `${hex.slice(0, 8).join('')}-${hex.slice(8, 12).join('')}-${hex.slice(12, 16).join('')}-${hex.slice(16, 20).join('')}-${hex.slice(20).join('')}`;
}
function accountFor(email: string, password: string) {
  for (const account of ['account-a', 'account-b', 'account-c'])
    if (email === fixtureEmail(account) && password === fixturePassword(account)) return { id: subject(account), email };
  const created = createdUsers.get(email);
  return created?.password === password ? { id: created.id, email } : null;
}
function authorized(req: express.Request) {
  return req.get('apikey') === publishableKey;
}
function issue(user: { id: string; email: string }) {
  const accessToken = random(), refreshToken = random();
  tokens.set(accessToken, { ...user, mode: configuration.mode, delay: configuration.userDelayMs, expiresAt: Date.now() + 300_000 });
  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    token_type: 'bearer',
    expires_in: 300,
    expires_at: Math.floor(Date.now() / 1000) + 300,
    user: { id: user.id, email: user.email, aud: 'authenticated', role: 'authenticated', user_metadata: {} },
  };
}

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'Access-Control-Allow-Origin': applicationOrigin,
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-supabase-api-version',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  });
  if (_req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});
app.use(express.json({ limit: '8kb' }));
app.use('/test', (req, res, next) => {
  const token = req.get('x-mfp-fixture-control') || '';
  if (Buffer.byteLength(token) !== Buffer.byteLength(controlSecret) || !timingSafeEqual(Buffer.from(token), Buffer.from(controlSecret))) { res.sendStatus(404); return; }
  next();
});
app.post('/test/control', (req, res) => {
  const modes: SupabaseFixtureMode[] = ['normal', 'token-failure', 'user-failure', 'invalid-user'];
  if (req.body.mode !== undefined && !modes.includes(req.body.mode)) { res.sendStatus(400); return; }
  if (req.body.userDelayMs !== undefined && (!Number.isInteger(req.body.userDelayMs) || req.body.userDelayMs < 0 || req.body.userDelayMs > 5000)) { res.sendStatus(400); return; }
  if (req.body.subjectPrefix !== undefined && (typeof req.body.subjectPrefix !== 'string' || !/^[A-Za-z0-9_-]{0,60}$/.test(req.body.subjectPrefix))) { res.sendStatus(400); return; }
  configuration = { mode: req.body.mode ?? 'normal', userDelayMs: req.body.userDelayMs ?? 0, subjectPrefix: req.body.subjectPrefix ?? configuration.subjectPrefix };
  res.json({ ok: true });
});
app.get('/test/events', (_req, res) => res.json(counts));
app.post('/auth/v1/token', (req, res) => {
  counts.password++;
  if (!authorized(req) || req.query.grant_type !== 'password') { res.status(401).json({ error: 'invalid_client' }); return; }
  if (configuration.mode === 'token-failure') { res.status(503).json({ error: 'temporarily_unavailable' }); return; }
  const user = accountFor(req.body.email, req.body.password);
  if (!user) { counts.rejectedPassword++; res.status(400).json({ error: 'invalid_grant', error_description: 'Invalid login credentials' }); return; }
  res.json(issue(user));
});
app.post('/auth/v1/signup', (req, res) => {
  counts.signup++;
  if (!authorized(req) || typeof req.body.email !== 'string' || typeof req.body.password !== 'string' || req.body.password.length < 8) {
    res.status(400).json({ error: 'invalid_request' }); return;
  }
  const email = req.body.email.toLowerCase();
  const user = createdUsers.get(email) ?? { id: subject('signup-' + email), password: req.body.password };
  createdUsers.set(email, user);
  res.json(issue({ id: user.id, email }));
});
app.post('/auth/v1/recover', (req, res) => {
  counts.recovery++;
  if (!authorized(req) || typeof req.body.email !== 'string') { res.status(400).json({ error: 'invalid_request' }); return; }
  res.json({});
});
app.get('/auth/v1/user', async (req, res) => {
  counts.user++;
  const match = /^Bearer ([^\s]+)$/.exec(req.get('authorization') || '');
  const record = match ? tokens.get(match[1]) : undefined;
  if (!authorized(req) || !record || record.expiresAt <= Date.now()) { counts.rejectedToken++; res.status(401).json({ message: 'invalid token' }); return; }
  if (record.delay) await new Promise(resolve => setTimeout(resolve, record.delay));
  if (record.mode === 'user-failure') { res.status(503).json({ message: 'temporarily unavailable' }); return; }
  if (record.mode === 'invalid-user') { res.status(401).json({ message: 'invalid token' }); return; }
  res.json({ id: record.id, email: record.email, aud: 'authenticated', role: 'authenticated', user_metadata: { ignored_role: 'owner' } });
});
app.put('/auth/v1/user', (req, res) => {
  const match = /^Bearer ([^\s]+)$/.exec(req.get('authorization') || '');
  const record = match ? tokens.get(match[1]) : undefined;
  if (!authorized(req) || !record || typeof req.body.password !== 'string' || req.body.password.length < 8) { res.status(401).json({ message: 'invalid token' }); return; }
  const created = createdUsers.get(record.email);
  if (created) created.password = req.body.password;
  res.json({ id: record.id, email: record.email, aud: 'authenticated', role: 'authenticated', user_metadata: {} });
});

const server = createServer({ key: readFileSync(process.env.MFP_ACCOUNTS_TLS_KEY!), cert: readFileSync(process.env.MFP_ACCOUNTS_TLS_CERT!) }, app);
server.listen(Number(new URL(origin).port), '127.0.0.3', () => console.log('MFP_TEST_SUPABASE_READY'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
