import type { Express, Response } from 'express';
import { z } from 'zod';
import { createProtectedRoute, privateApiResponses } from './authorizedRoutes';
import type { IdentityResolver } from './identity';
import { PhysicalPlanStorage, PhysicalPlanStorageError } from './physicalPlanStorage';

const uuid = z.string().uuid();
const pageQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).optional(), cursor: z.string().min(1).max(200).optional() }).strict();
const invalid = (res: Response) => res.status(400).json({ code: 'INVALID_REQUEST', message: 'Invalid physical plan request.' });
export function mountPhysicalPlanRoutes(app: Express, identityResolver: IdentityResolver, allowedOrigin: string | null): void {
  app.disable('etag');
  app.use('/api/physical-plans', privateApiResponses);
  const protectedRoute = createProtectedRoute({ identityResolver, allowedOrigin,
    storage: () => new PhysicalPlanStorage(),
    onError(error, res) {
      if (!(error instanceof PhysicalPlanStorageError)) return false;
      const message = error.status === 412 ? 'A newer server revision exists. Keep your local candidate and open the latest separately, or save as a new plan.'
        : error.status === 428 ? 'The exact current revision is required to save changes.'
        : error.code === 'IDEMPOTENCY_CONFLICT' ? 'This retry key belongs to different saved content. Your local draft is unchanged.'
        : 'This physical plan request could not be accepted. Your local draft is unchanged.';
      res.status(error.status).json({ code: error.code, message }); return true;
    },
  });
  app.get('/api/physical-plans', protectedRoute(async (req, res, storage, identity, workspace) => {
    const query = pageQuery.safeParse(req.query); if (!query.success) return invalid(res);
    res.json(await storage.list(identity, workspace, query.data));
  }));
  app.post('/api/physical-plans', protectedRoute(async (req, res, storage, identity, workspace) => {
    const saved = await storage.create(identity, workspace, req.body, req.get('Idempotency-Key') ?? '');
    res.setHeader('ETag', saved.etag); res.status(201).json(saved);
  }));
  app.get('/api/physical-plans/:planId', protectedRoute(async (req, res, storage, identity, workspace) => {
    const plan = uuid.safeParse(req.params.planId); if (!plan.success) return invalid(res);
    const saved = await storage.read(identity, workspace, plan.data);
    res.setHeader('ETag', saved.etag); res.json(saved);
  }));
  app.get('/api/physical-plans/:planId/revisions/:revisionId', protectedRoute(async (req, res, storage, identity, workspace) => {
    const plan = uuid.safeParse(req.params.planId), revision = uuid.safeParse(req.params.revisionId);
    if (!plan.success || !revision.success) return invalid(res);
    const saved = await storage.readRevision(identity, workspace, plan.data, revision.data);
    res.setHeader('ETag', saved.etag); res.json(saved);
  }));
  app.post('/api/physical-plans/:planId/revisions', protectedRoute(async (req, res, storage, identity, workspace) => {
    const plan = uuid.safeParse(req.params.planId); if (!plan.success) return invalid(res);
    const saved = await storage.append(identity, workspace, plan.data, req.body,
      { idempotencyKey: req.get('Idempotency-Key') ?? '', ifMatch: req.get('If-Match') });
    res.setHeader('ETag', saved.etag); res.status(201).json(saved);
  }));
}
