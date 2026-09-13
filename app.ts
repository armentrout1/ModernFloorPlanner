import express from 'express';
import { configureApplication } from './server/app';
import { httpErrorHandler } from './server/httpErrors';

// Recognized Vercel entry: no standalone listener, Vite, or disk-based SPA fallback.
const app = express();
app.set('env', 'production');
try {
  await configureApplication(app, { hosting: 'vercel' });
} catch {
  throw new Error('Hosted application initialization failed.');
}
app.use((_req, res) => { res.status(404).type('text/plain').send('Not found'); });
app.use(httpErrorHandler);
export default app;
