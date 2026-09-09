import type { Express } from 'express';
import { createServer, type Server } from 'node:http';
import { mountAuthorizedRoutes } from './authorizedRoutes';
import { configuredApplicationOrigin, resolveProductionIdentity } from './identity';

// Normal composition has no injection argument, user-picker or test bypass.
export async function registerRoutes(app: Express): Promise<Server> {
  mountAuthorizedRoutes(app, {
    identityResolver: resolveProductionIdentity,
    storage: async () => (await import('./storage')).storage,
    allowedOrigin: configuredApplicationOrigin(process.env.MFP_APP_ORIGIN),
  });
  return createServer(app);
}
