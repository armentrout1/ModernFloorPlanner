import express, { type Express } from 'express';
import { registerRoutes } from './routes';
import { privateApiResponses } from './authorizedRoutes';
import { configureHosting, type HostingOptions } from './hosting';
import { log } from './log';

/** Shared API composition. Hosting is selected by an entry point, never a request. */
export async function configureApplication(app: Express, options: HostingOptions = {}) {
  configureHosting(app, options);
  app.use('/api', privateApiResponses);
  app.use('/api/physical-plans', express.json({ limit: '4mb' }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    res.on('finish', () => {
      if (path.startsWith('/api')) {
        // Request metadata only; never saved contents or response bodies.
        log(`${req.method} ${path} ${res.statusCode} in ${Date.now() - start}ms`);
      }
    });
    next();
  });
  return registerRoutes(app);
}
