// Isolated acceptance server using NORMAL production API composition.
// No identity, storage or workspace fixture is injected here.
import express from 'express';
import path from 'node:path';
import { registerRoutes } from '../server/routes';
import { privateApiResponses } from '../server/authorizedRoutes';
import { httpErrorHandler } from '../server/httpErrors';
const app = express();
app.use('/api', privateApiResponses);
app.use(express.json());
const server = await registerRoutes(app);
const publicPath = path.resolve('dist/public');
app.use(express.static(publicPath));
app.get('*', (_req, res) => res.sendFile(path.join(publicPath, 'index.html')));
app.use(httpErrorHandler);
server.listen(4175, '127.0.0.1', () => console.log('Normal authorization boundary on loopback:4175'));
