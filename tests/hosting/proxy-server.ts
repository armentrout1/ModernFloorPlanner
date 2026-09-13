// Synthetic TLS edge/CDN only. This is not Vercel deployment or header-overwrite evidence.
import express from 'express';
import { createServer } from 'node:https';
import { request } from 'node:http';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const origin = process.env.MFP_ACCOUNTS_APP_ORIGIN;
if (origin !== 'https://127.0.0.2:54440') throw new Error('Invalid isolated HTTPS hosting origin');
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (req.path !== '/api' && !req.path.startsWith('/api/')) { next(); return; }
  const headers = { ...req.headers, host: '127.0.0.2:54440', 'x-forwarded-host': '127.0.0.2:54440', 'x-forwarded-proto': 'https' };
  delete headers.forwarded;
  const upstream = request({ hostname: '127.0.0.1', port: 54442, path: req.originalUrl, method: req.method, headers }, response => {
    res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
  });
  upstream.on('error', () => { if (!res.headersSent) res.status(502).json({ code: 'FIXTURE_UPSTREAM_UNAVAILABLE' }); else res.destroy(); });
  req.pipe(upstream);
});
// The packaging tests independently validate generated Vercel routing. These are
// the selected four page routes plus public build assets needed by browser acceptance.
const publicPath = resolve('public');
app.use(express.static(publicPath));
for (const path of ['/', '/physical-draft', '/quick-room', '/account/callback'])
  app.get(path, (_req, res) => res.sendFile(resolve(publicPath, 'index.html')));
app.use((_req, res) => res.sendStatus(404));
const server = createServer({ key: readFileSync(process.env.MFP_ACCOUNTS_TLS_KEY!), cert: readFileSync(process.env.MFP_ACCOUNTS_TLS_CERT!) }, app);
server.listen(54440, '127.0.0.2', () => console.log('MFP_TEST_HOSTING_PROXY_READY'));
process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
