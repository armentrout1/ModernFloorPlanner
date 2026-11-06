import type { Express, Request, Response, RequestHandler } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { readAuthConfiguration } from './authConfiguration';
import { getDatabase } from './db';
import { toSessionPoolOptions } from './databaseConfiguration';
import { AccountStorage, AccountStorageError, type BrowserContext } from './accountStorage';
import { privateApiResponses } from './authorizedRoutes';
import { sessionCookiePolicy, type IdentityResolver } from './identity';
import type { VerifiedIdentity, SessionBinding } from './authorizationTypes';
import { sessionProxyFor } from './hosting';
import { bearerAccessToken, SupabaseVerificationError, verifySupabaseAccessToken } from './supabaseAuth';

declare module 'express-session' { interface SessionData { browserId?: string } }
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const binding = (context: BrowserContext): SessionBinding => ({
  browserId: context.browserId, contextToken: context.contextToken, sessionIdHash: context.sessionIdHash,
});
const identity = (context: BrowserContext): VerifiedIdentity => ({
  issuer: context.issuer!, subject: context.subject!, sessionBinding: binding(context),
});
const persist = (req: Request) => new Promise<void>((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
const regenerate = (req: Request) => new Promise<void>((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
const destroy = (req: Request) => new Promise<void>((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
const unavailable = (res: Response) => {
  if (!res.headersSent) res.status(503).json({ code: 'SIGN_IN_UNAVAILABLE', message: 'Account access is temporarily unavailable. Your local drawing is unchanged.' });
};
const databaseFailureClass = (error: unknown): string => {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  const message = error instanceof Error ? error.message : '';
  if (/^28/.test(code)) return 'authentication';
  if (/password authentication failed|tenant or user not found|sasl/i.test(message)) return 'authentication';
  if (code === '42501') return 'permission';
  if (/permission denied/i.test(message)) return 'permission';
  if (code === '42P01') return 'missing-relation';
  if (/relation .* does not exist/i.test(message)) return 'missing-relation';
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'dns';
  if (['ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET'].includes(code) || /^08/.test(code)) return 'connection';
  if (['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(code) || /certificate|tls|ssl/i.test(message)) return 'tls';
  return 'unknown';
};
const databaseFailureCode = (error: unknown): string => {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : '';
  return /^[A-Z0-9_]{2,64}$/.test(code) ? code : 'none';
};
const emptyStatus = (status: string, contextToken: string | null = null) => ({
  status, contextToken, principal: null, workspace: null, workspaces: [],
});

/** Only this normal composition configures authentication. No test adapter or identity header is accepted. */
export function mountAccounts(app: Express): IdentityResolver {
  app.disable('etag');
  app.use('/api', privateApiResponses);
  const settings = readAuthConfiguration(process.env);
  if (!settings) {
    app.get('/api/auth/session', (_req, res) => res.json(emptyStatus('unavailable')));
    app.use('/api/auth', (_req, res) => { unavailable(res); });
    app.get('/api/workspaces', (_req, res) => { unavailable(res); });
    app.post('/api/workspaces', (_req, res) => { unavailable(res); });
    return async () => ({ status: 'unavailable' });
  }
  const accounts = new AccountStorage(getDatabase);
  const PgStore = connectPgSimple(session);
  const store = new PgStore({
    conObject: toSessionPoolOptions(settings.database),
    tableName: 'mfp_sessions', createTableIfMissing: false,
    pruneSessionInterval: false,
    // Never log connection strings, messages, query text or credentials.
    errorLog: (...values) => console.error('account_session_store_error', {
      category: databaseFailureClass(values.find(value => value && typeof value === 'object')),
      code: databaseFailureCode(values.find(value => value && typeof value === 'object')),
    }),
  });
  // Server owners may close resources on shutdown; this is not a request-accessible control.
  app.locals.closeAccountSessions = () => store.close();
  const middleware = session({
    name: sessionCookiePolicy.name, store, secret: settings.sessionSecret,
    resave: false, saveUninitialized: false, rolling: false, proxy: sessionProxyFor(app),
    // Cookie lifetime is absolute; PostgreSQL independently enforces idle expiry.
    // Late ordinary responses never roll an old SID over a newer login cookie.
    cookie: { httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 8 * 60 * 60 * 1000 },
  });
  const contexts = new WeakMap<Request, BrowserContext>();
  const failures = new WeakMap<Request, 'absent' | 'expired' | 'revoked' | 'unavailable'>();
  app.use('/api', (req, res, next) => middleware(req, res, error => {
    if (error) {
      console.error('account_session_request_error', { category: databaseFailureClass(error), code: databaseFailureCode(error) });
      unavailable(res);
      return;
    }
    next();
  }));
  app.use('/api', (async (req, _res, next) => {
    try {
      if (!req.session.browserId) failures.set(req, 'absent');
      else {
        const context = await accounts.getContext(req.session.browserId, hash(req.sessionID), Date.now(), { touch: true });
        if (context?.status === 'authenticated' && context.issuer !== settings.issuer) failures.set(req, 'revoked');
        else if (context) contexts.set(req, context); else failures.set(req, 'expired');
      }
    } catch (error) {
      failures.set(req, error instanceof AccountStorageError && error.status === 401 ? 'revoked' : 'unavailable');
    }
    next();
  }) as RequestHandler);
  const current = (req: Request) => {
    const context = contexts.get(req);
    if (!context) throw new AccountStorageError('SESSION_EXPIRED');
    if (req.get('X-MFP-Context') !== context.contextToken) throw new AccountStorageError('STALE_CONTEXT');
    return context;
  };
  const statusView = async (context: BrowserContext, statusOverride?: string) => {
    if (context.status !== 'authenticated') return emptyStatus(statusOverride ?? 'anonymous', context.contextToken);
    const workspaces = await accounts.listWorkspaces(identity(context));
    let workspace = workspaces.find(item => item.id === context.selectedWorkspaceId) ?? null;
    if (context.selectedWorkspaceId && !workspace) {
      context = await accounts.selectWorkspace(binding(context), null, Date.now());
      workspace = null;
    }
    return { status: 'authenticated', contextToken: context.contextToken,
      principal: { id: context.principalId!, displayName: context.subject!.slice(0, 80) },
      workspace, workspaces, expiresAt: Math.min(context.absoluteExpiresAt, context.idleExpiresAt) };
  };
  const newAnonymous = async (req: Request) => {
    await regenerate(req);
    req.session.browserId = randomUUID();
    req.session.cookie.maxAge = 30 * 60 * 1000;
    const context = await accounts.createAnonymousContext(req.session.browserId, hash(req.sessionID), Date.now());
    await persist(req); contexts.set(req, context); return context;
  };
  const handle = (action: (req: Request, res: Response) => Promise<unknown>, mutation = false): RequestHandler => async (req, res) => {
    if (mutation && (req.get('Origin') !== settings.origin || req.get('X-MFP-Request') !== '1')) {
      res.status(403).json({ code: 'REQUEST_ORIGIN_DENIED', message: 'Request origin could not be verified.' }); return;
    }
    try {
      if (failures.get(req) === 'unavailable') return void unavailable(res);
      await action(req, res);
    } catch (error) {
      if (error instanceof AccountStorageError) {
        const code = error.code === 'STALE_CONTEXT' ? 'ACCOUNT_CONTEXT_CHANGED' : error.code;
        res.status(error.status).json({ code, message: error.status === 429 ? 'Please wait before creating another workspace.' :
          error.status === 409 ? 'Your account context changed. Review the current account before continuing.' :
            'Account access could not be confirmed. Your local drawing is unchanged.' });
      } else if (error instanceof SupabaseVerificationError) {
        if (error.status === 503) unavailable(res);
        else res.status(401).json({ code: 'SIGN_IN_DENIED', message: 'Sign-in could not be verified. Check your details and try again.' });
      } else if (error instanceof z.ZodError) res.status(400).json({ code: 'INVALID_REQUEST', message: 'Invalid request.' });
      else unavailable(res);
    }
  };
  app.get('/api/auth/session', handle(async (req, res) => {
    let context = contexts.get(req);
    const priorStatus = failures.get(req);
    if (!context || context.status === 'revoked') context = await newAnonymous(req);
    res.json(await statusView(context, priorStatus === 'expired' || priorStatus === 'revoked' ? priorStatus : undefined));
  }));
  app.post('/api/auth/login', handle(async (req, res) => {
    z.object({}).strict().parse(req.body);
    const context = current(req);
    if (context.status === 'authenticated') throw new AccountStorageError('STALE_CONTEXT');
    const token = bearerAccessToken(req.get('Authorization'));
    if (!token) throw new SupabaseVerificationError(401);
    const verified = await verifySupabaseAccessToken(settings, token);
    const browserId = req.session.browserId!;
    const authenticated = await accounts.authenticate(binding(context), verified, async () => {
      await regenerate(req);
      req.session.browserId = browserId;
      return hash(req.sessionID);
    }, Date.now());
    await persist(req);
    contexts.set(req, authenticated);
    res.json(await statusView(authenticated));
  }, true));
  app.post('/api/auth/logout', handle(async (req, res) => {
    const context = current(req);
    await accounts.logout(binding(context), Date.now());
    await destroy(req);
    res.clearCookie(sessionCookiePolicy.name, { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
    res.json(emptyStatus('anonymous'));
  }, true));
  app.post('/api/auth/workspace', handle(async (req, res) => {
    const input = z.object({ workspaceId: z.string().uuid().nullable() }).strict().parse(req.body);
    const context = await accounts.selectWorkspace(binding(current(req)), input.workspaceId, Date.now());
    res.json(await statusView(context));
  }, true));
  app.get('/api/workspaces', handle(async (req, res) => {
    const context = current(req);
    if (context.status !== 'authenticated') throw new AccountStorageError('SESSION_EXPIRED');
    res.json(await accounts.listWorkspaces(identity(context)));
  }));
  app.post('/api/workspaces', handle(async (req, res) => {
    const input = z.object({ name: z.string().trim().min(1).max(200), idempotencyKey: z.string().uuid() }).strict().parse(req.body);
    const context = current(req);
    if (context.status !== 'authenticated') throw new AccountStorageError('SESSION_EXPIRED');
    res.status(201).json(await accounts.createWorkspace(identity(context), input, Date.now()));
  }, true));
  return async req => {
    const context = contexts.get(req);
    if (!context || context.status !== 'authenticated') return { status: failures.get(req) ?? 'absent' };
    return { status: 'authenticated', identity: identity(context), authentication: 'session',
      expiresAt: Math.min(context.absoluteExpiresAt, context.idleExpiresAt) };
  };
}
