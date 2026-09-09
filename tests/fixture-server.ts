// Disposable loopback-only acceptance entry point. Never imported by production.
import express from 'express';
import path from 'node:path';
import { createServer } from 'node:http';
import { mountAuthorizedRoutes } from '../server/authorizedRoutes';
import { httpErrorHandler } from '../server/httpErrors';
import { createFixtureStorage, createTestIdentityResolver, TEST_WORKSPACE_A } from './support/authFixtures';

const storage = createFixtureStorage();
const app = express();
app.use(express.json());
// Existing editor fixtures explicitly select one synthetic workspace in this
// test entry point. These defaults are absent from normal registerRoutes().
app.use('/api', (req, _res, next) => {
  req.headers['x-mfp-workspace-id'] ??= TEST_WORKSPACE_A;
  if (!['GET','HEAD','OPTIONS'].includes(req.method)) {
    req.headers.origin ??= 'http://127.0.0.1:4173';
    req.headers['x-mfp-request'] ??= '1';
  }
  next();
});
mountAuthorizedRoutes(app, { identityResolver: createTestIdentityResolver(), storage: () => storage, allowedOrigin:'http://127.0.0.1:4173' });
const publicPath = path.resolve('dist/public');
app.use(express.static(publicPath));
app.get('*', (_req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.use(httpErrorHandler);
createServer(app).listen(4173, '127.0.0.1', () => console.log('Authorized synthetic fixture listening on loopback:4173'));
