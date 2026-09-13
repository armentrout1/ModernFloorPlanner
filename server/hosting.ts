import type { Express, Request } from 'express';

/** This option belongs to server composition, never to a request or a client setting. */
export interface HostingOptions { hosting?: 'vercel' }
const policies = new WeakMap<Express, boolean>();

function canonicalHost(origin: string | undefined): string | null {
  try {
    if (!origin) return null;
    const url = new URL(origin);
    return url.protocol === 'https:' && url.origin === origin ? url.host : null;
  } catch { return null; }
}

function singleHeader(req: Request, name: string): string | null {
  const value = req.headers[name];
  if (typeof value !== 'string' || !value || value.trim() !== value || /[,\s]/.test(value)) return null;
  // These are the adapter's reconstructed headers. This does not certify edge deduplication.
  let count = 0;
  for (let index = 0; index < req.rawHeaders.length; index += 2) {
    if (req.rawHeaders[index].toLowerCase() === name) count++;
  }
  return count === 1 ? value : null;
}

/** Mount before parsers/routes. Ordinary Node listeners never opt into forwarded-protocol trust. */
export function configureHosting(app: Express, options: HostingOptions = {}): void {
  if (policies.has(app)) throw new Error('Application hosting policy was already configured');
  if (options.hosting !== undefined && options.hosting !== 'vercel') throw new Error('Unsupported application hosting policy');
  if (options.hosting !== 'vercel') { policies.set(app, false); return; }
  const host = canonicalHost(process.env.MFP_APP_ORIGIN);
  const ready = process.env.VERCEL === '1' && host !== null;
  policies.set(app, ready);
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store, private');
    res.setHeader('Pragma', 'no-cache');
    if (!ready) {
      res.status(503).json({ code: 'HOSTING_UNAVAILABLE', message: 'Application hosting is not configured.' });
      return;
    }
    // The dedicated managed-host entry owns this ingress contract; no proxy peer IP is guessed.
    // VERCEL + headers are not standalone authentication, and edge sanitization needs live verification.
    const requestHost = singleHeader(req, 'host');
    const forwardedHost = singleHeader(req, 'x-forwarded-host');
    if (requestHost?.toLowerCase() !== host || forwardedHost?.toLowerCase() !== host ||
        singleHeader(req, 'x-forwarded-proto') !== 'https' || req.headers.forwarded !== undefined) {
      res.status(400).json({ code: 'INVALID_HOSTING_REQUEST', message: 'Invalid application request.' });
      return;
    }
    next();
  });
}

/** express-session may honor the protocol only after this app's entry-owned guard has run. */
export function sessionProxyFor(app: Express): boolean {
  return policies.get(app) === true;
}
