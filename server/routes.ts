import type { Express } from 'express';
import { createServer, type Server } from 'node:http';
import { mountAuthorizedRoutes } from './authorizedRoutes';
import { configuredApplicationOrigin } from './identity';
import { mountAccounts } from './accounts';
import { mountPhysicalPlanRoutes } from './physicalPlanRoutes';

// Normal composition has no injection argument, user-picker or test bypass.
export async function registerRoutes(app: Express): Promise<Server> {
  const identityResolver = mountAccounts(app);
  mountPhysicalPlanRoutes(app, identityResolver, configuredApplicationOrigin(process.env.MFP_APP_ORIGIN));
  mountAuthorizedRoutes(app, {
    identityResolver,
    storage: async () => (await import('./storage')).storage,
    allowedOrigin: configuredApplicationOrigin(process.env.MFP_APP_ORIGIN),
  });
  return createServer(app);
}
