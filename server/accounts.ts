import type { Express, Request, Response, RequestHandler } from 'express';
import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import { createHash, randomUUID } from 'node:crypto';
import * as oidc from 'openid-client';
import { z } from 'zod';
import { readAuthConfiguration, safeReturnPath } from './authConfiguration';
import { createOidcClient } from './oidcClient';
import { getDatabase } from './db';
import { toSessionPoolOptions } from './databaseConfiguration';
import { AccountStorage, AccountStorageError, type BrowserContext, type LoginTransaction } from './accountStorage';
import { privateApiResponses } from './authorizedRoutes';
import { sessionCookiePolicy, type IdentityResolver } from './identity';
import type { VerifiedIdentity, SessionBinding } from './authorizationTypes';
import { sessionProxyFor } from './hosting';

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
const unavailable = (res: Response) => res.status(503).json({ code: 'SIGN_IN_UNAVAILABLE', message: 'Account access is temporarily unavailable. Your local drawing is unchanged.' });
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
    app.get('/api/auth/callback', (_req, res) => res.set('Referrer-Policy', 'no-referrer').redirect(303, '/account/callback?result=failed&returnTo=%2F'));
    app.use('/api/auth', (_req, res) => { unavailable(res); });
    app.get('/api/workspaces', (_req, res) => { unavailable(res); });
    app.post('/api/workspaces', (_req, res) => { unavailable(res); });
    return async () => ({ status: 'unavailable' });
  }
  const accounts = new AccountStorage(getDatabase);
  const protocol = createOidcClient(settings);
  const PgStore = connectPgSimple(session);
  const store = new PgStore({
    conObject: toSessionPoolOptions(settings.database),
    tableName: 'mfp_sessions', createTableIfMissing: false,
    pruneSessionInterval: false, errorLog: () => { /* Never log database connection/session details. */ },
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
  const callbackRedirect = (res: Response, result: string, returnPath = '/') => {
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.redirect(303, '/account/callback?result=' + result + '&returnTo=' + encodeURIComponent(returnPath));
  };
  app.use('/api', (req, res, next) => middleware(req, res, error => {
    if (error) {
      if (req.path === '/auth/callback') callbackRedirect(res, 'failed'); else unavailable(res);
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
    const input = z.object({ returnPath: z.string() }).strict().parse(req.body);
    const returnPath = safeReturnPath(input.returnPath);
    if (!returnPath) { res.status(400).json({ code: 'INVALID_REQUEST', message: 'Invalid return path.' }); return; }
    const context = current(req);
    if (context.status === 'authenticated') throw new AccountStorageError('STALE_CONTEXT');
    const state = oidc.randomState(), nonce = oidc.randomNonce(), codeVerifier = oidc.randomPKCECodeVerifier();
    // Discovery can fail without changing a valid draft/session context.
    const authorizationUrl = await protocol.authorizationUrl(state, nonce, codeVerifier);
    await accounts.beginLogin(binding(context), { stateHash: hash(state), nonce, codeVerifier, returnPath,
      expiresAt: Date.now() + 5 * 60 * 1000 }, Date.now());
    await persist(req);
    res.json({ authorizationUrl });
  }, true));
  app.get('/api/auth/callback', async (req, res) => {
    let transaction: LoginTransaction | undefined;
    try {
      if (!req.session.browserId || failures.get(req) === 'unavailable' || req.originalUrl.length > 8192) throw new Error();
      const url = new URL(settings.callbackUri);
      url.search = new URL(req.originalUrl, settings.origin).search;
      const state = url.searchParams.get('state');
      if (!state || !/^[A-Za-z0-9_-]{32,128}$/.test(state) || url.searchParams.getAll('state').length !== 1) throw new Error();
      transaction = await accounts.consumeLogin(req.session.browserId, hash(req.sessionID), hash(state), Date.now());
      if (url.searchParams.has('error')) {
        await accounts.cancelLogin(transaction, Date.now());
        delete (req as Partial<Request>).session;
        callbackRedirect(res, 'cancelled', transaction.returnPath); return;
      }
      if (!url.searchParams.get('code') || url.searchParams.getAll('code').length !== 1) throw new Error();
      const verified = await protocol.exchange(url, { state, nonce: transaction.nonce, codeVerifier: transaction.codeVerifier });
      const browserId = req.session.browserId;
      // Recheck/lock the live login context BEFORE destroying the old SID. An
      // older token exchange must not destroy a newer pending attempt's session.
      await accounts.finishLogin(transaction, verified, async () => {
        await regenerate(req);
        req.session.browserId = browserId;
        return hash(req.sessionID);
      }, Date.now());
      await persist(req);
      callbackRedirect(res, 'success', transaction.returnPath);
    } catch {
      // Never reflect provider errors, codes, tokens or database details in the URL or response.
      if (transaction) await accounts.cancelLogin(transaction, Date.now()).catch(() => undefined);
      // A failed/stale callback must not overwrite a newer tab's cookie.
      delete (req as Partial<Request>).session;
      callbackRedirect(res, 'failed', transaction?.returnPath);
    }
  });
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
