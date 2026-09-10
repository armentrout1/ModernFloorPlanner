import type { Express, Request, Response, RequestHandler } from 'express';
import { z } from 'zod';
import { createLegacyFloorPlanSchema, updateLegacyFloorPlanSchema, floorPlanIdSchema } from '@shared/legacyValidation';
import { AuthorizationError, type AuthorizationStorage, type VerifiedIdentity } from './authorizationTypes';
import { AccountStorageError } from './accountStorage';
import { configuredApplicationOrigin, resolveIdentity, type IdentityResolver } from './identity';

export const privateApiResponses: RequestHandler = (_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('Pragma', 'no-cache');
  res.vary('Cookie'); res.vary('Authorization'); res.vary('x-mfp-workspace-id'); res.vary('x-mfp-context');
  next();
};
type Dependencies = {
  identityResolver: IdentityResolver;
  storage: () => AuthorizationStorage | Promise<AuthorizationStorage>;
  allowedOrigin: string | null;
};
const uuid = z.string().uuid();
const workspacePatch = z.object({ name: z.string().trim().min(1).max(200) }).strict();
const membershipPatch = z.object({
  role: z.enum(['owner', 'editor', 'viewer']).optional(),
  status: z.enum(['active', 'revoked']).optional(),
}).strict().refine(value => Object.keys(value).length > 0);
const fail = (res: Response, status: number, code: string, message: string) => res.status(status).json({ code, message });

// Only trusted server composition selects these dependencies. The normal app
// never imports or enables the separate synthetic test entrypoint.
export function mountAuthorizedRoutes(app: Express, dependencies: Dependencies): void {
  app.disable('etag');
  app.use('/api', privateApiResponses);
  const allowedOrigin = configuredApplicationOrigin(dependencies.allowedOrigin ?? undefined);
  const protectedRoute = (action: (req: Request, res: Response, storage: AuthorizationStorage,
    identity: VerifiedIdentity, workspaceId: string) => Promise<unknown>): RequestHandler => async (req, res) => {
    const identity = await resolveIdentity(dependencies.identityResolver, req);
    if (identity.status !== 'authenticated') {
      return void (identity.status === 'unavailable'
        ? fail(res, 503, 'SIGN_IN_UNAVAILABLE', 'Account access is not configured or is temporarily unavailable. Your local drawing is unchanged.')
        : fail(res, 401, 'AUTHENTICATION_REQUIRED', 'Sign in is required to access saved plans. Your local drawing is unchanged.'));
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (!allowedOrigin || req.get('Origin') !== allowedOrigin || req.get('X-MFP-Request') !== '1')) {
      return void fail(res, 403, 'REQUEST_ORIGIN_DENIED', 'Request origin could not be verified.');
    }
    if (identity.identity.sessionBinding && req.get('X-MFP-Context') !== identity.identity.sessionBinding.contextToken) {
      return void fail(res, 409, 'ACCOUNT_CONTEXT_CHANGED', 'Your account context changed. Review the current account before continuing.');
    }
    const selection = uuid.safeParse(req.params.workspaceId ?? req.get('x-mfp-workspace-id'));
    if (!selection.success) return void fail(res, 400, 'INVALID_REQUEST', 'Select a valid workspace.');
    try {
      await action(req, res, await dependencies.storage(), identity.identity, selection.data);
    } catch (error) {
      if (error instanceof AccountStorageError) {
        fail(res, error.status, error.code === 'STALE_CONTEXT' ? 'ACCOUNT_CONTEXT_CHANGED' : error.code, 'Account access could not be confirmed.');
      } else if (error instanceof AuthorizationError) {
        if (error.status === 403) fail(res, 403, 'ACCESS_DENIED', 'This action is not permitted.');
        else fail(res, 404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
      } else {
        fail(res, 503, 'STORAGE_UNAVAILABLE', 'Saved plans are temporarily unavailable. Your local drawing is unchanged.');
      }
    }
  };
  const invalid = (res: Response) => fail(res, 400, 'INVALID_REQUEST', 'Invalid request.');
  const missing = (res: Response) => fail(res, 404, 'RESOURCE_NOT_FOUND', 'Resource not found.');
  app.get('/api/floor-plans', protectedRoute(async (_req, res, storage, identity, workspace) => {
    res.json(await storage.getFloorPlans(identity, workspace));
  }));
  app.post('/api/floor-plans', protectedRoute(async (req, res, storage, identity, workspace) => {
    const input = createLegacyFloorPlanSchema.safeParse(req.body);
    if (!input.success) return invalid(res);
    res.status(201).json(await storage.createFloorPlan(identity, workspace, input.data));
  }));
  app.get('/api/floor-plans/:id', protectedRoute(async (req, res, storage, identity, workspace) => {
    const id = floorPlanIdSchema.safeParse(req.params.id);
    if (!id.success) return invalid(res);
    const plan = await storage.getFloorPlan(identity, workspace, id.data);
    return plan ? res.json(plan) : missing(res);
  }));
  app.patch('/api/floor-plans/:id', protectedRoute(async (req, res, storage, identity, workspace) => {
    const id = floorPlanIdSchema.safeParse(req.params.id);
    const input = updateLegacyFloorPlanSchema.safeParse(req.body);
    if (!id.success || !input.success) return invalid(res);
    const plan = await storage.updateFloorPlan(identity, workspace, id.data, input.data);
    return plan ? res.json(plan) : missing(res);
  }));
  app.delete('/api/floor-plans/:id', protectedRoute(async (req, res, storage, identity, workspace) => {
    const id = floorPlanIdSchema.safeParse(req.params.id);
    if (!id.success) return invalid(res);
    return await storage.deleteFloorPlan(identity, workspace, id.data) ? res.status(204).end() : missing(res);
  }));
  app.get('/api/workspaces/:workspaceId', protectedRoute(async (_req, res, storage, identity, workspace) => {
    res.json(await storage.getWorkspace(identity, workspace));
  }));
  app.patch('/api/workspaces/:workspaceId', protectedRoute(async (req, res, storage, identity, workspace) => {
    const input = workspacePatch.safeParse(req.body);
    if (!input.success) return invalid(res);
    res.json(await storage.updateWorkspaceName(identity, workspace, input.data.name));
  }));
  app.get('/api/workspaces/:workspaceId/memberships', protectedRoute(async (_req, res, storage, identity, workspace) => {
    res.json(await storage.getMemberships(identity, workspace));
  }));
  app.patch('/api/workspaces/:workspaceId/memberships/:principalId', protectedRoute(async (req, res, storage, identity, workspace) => {
    const principal = uuid.safeParse(req.params.principalId);
    const input = membershipPatch.safeParse(req.body);
    if (!principal.success || !input.success) return invalid(res);
    res.json(await storage.updateMembership(identity, workspace, principal.data, input.data));
  }));
  // Unknown API paths must not fall through to the SPA HTML.
  app.use('/api', (_req, res) => missing(res));
}
