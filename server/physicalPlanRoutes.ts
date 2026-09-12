import type { Express, Response } from 'express';
import { z } from 'zod';
import { createProtectedRoute, privateApiResponses } from './authorizedRoutes';
import type { IdentityResolver } from './identity';
import { PhysicalPlanStorage, PhysicalPlanStorageError } from './physicalPlanStorage';
import { renderQuantityCsv, renderQuantityHtml } from '@shared/exports/quantityReport';

const uuid = z.string().uuid();
const pageQuery = z.object({ limit: z.coerce.number().int().min(1).max(50).optional(), cursor: z.string().min(1).max(200).optional(), status: z.enum(['active', 'archived']).optional() }).strict();
const exportQuery = z.object({ format: z.enum(['csv', 'html', 'plan']), unit: z.enum(['ft', 'm']) }).strict();
const invalid = (res: Response) => res.status(400).json({ code: 'INVALID_REQUEST', message: 'Invalid physical plan request.' });
export function mountPhysicalPlanRoutes(app: Express, identityResolver: IdentityResolver, allowedOrigin: string | null): void {
  app.disable('etag');
  app.use('/api/physical-plans', privateApiResponses);
  const protectedRoute = createProtectedRoute({ identityResolver, allowedOrigin,
    storage: () => new PhysicalPlanStorage(),
    onError(error, res) {
      if (!(error instanceof PhysicalPlanStorageError)) return false;
      const message = error.code === 'PLAN_ARCHIVED' ? 'This project is archived. Your local work is preserved; restore it or save a separate new plan.'
        : error.code === 'LIFECYCLE_CONFLICT' ? 'The project or its archive state changed. Refresh the project list and choose the current version.'
        : error.code === 'PROJECT_STATE_CONFLICT' ? 'This project already has that archive state. Refresh the project list.'
        : error.status === 412 ? 'A newer server revision exists. Keep your local candidate and open the latest separately, or save as a new plan.'
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
  app.get('/api/physical-plans/:planId/revisions/:revisionId/export', protectedRoute(async (req, res, storage, identity, workspace) => {
    const plan = uuid.safeParse(req.params.planId), revision = uuid.safeParse(req.params.revisionId);
    const query = exportQuery.safeParse(req.query);
    if (!plan.success || !revision.success || !query.success) return invalid(res);
    // Authorize this immutable revision at retrieval. A prior download, local
    // binding, or knowledge of an ID never grants access to a later request.
    const saved = await storage.readRevision(identity, workspace, plan.data, revision.data);
    const options = { unit: query.data.unit, source: 'saved' as const, planId: saved.planId, revisionId: saved.revisionId, copiedFrom: saved.copiedFrom, includeDrawing: query.data.format === 'plan' };
    const body = await (query.data.format === 'csv'
      ? renderQuantityCsv(saved.evaluation.snapshot, options)
      : renderQuantityHtml(saved.evaluation.snapshot, options));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="modern-floor-planner-${saved.revisionId}.${query.data.format === 'csv' ? 'csv' : 'html'}"`);
    res.setHeader('Content-Type', query.data.format === 'csv' ? 'text/csv; charset=utf-8' : 'text/html; charset=utf-8');
    if (query.data.format !== 'csv') {
      res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
      res.setHeader('Referrer-Policy', 'no-referrer');
    }
    res.send(body);
  }));
  for (const operation of ['duplicate', 'archive', 'restore'] as const) {
    app.post(`/api/physical-plans/:planId/${operation}`, protectedRoute(async (req, res, storage, identity, workspace) => {
      if (!z.object({}).strict().safeParse(req.query).success) return invalid(res);
      const plan = uuid.safeParse(req.params.planId); if (!plan.success) return invalid(res);
      const result = await storage.lifecycle(identity, workspace, plan.data, operation, req.body,
        { idempotencyKey: req.get('Idempotency-Key') ?? '', ifMatch: req.get('If-Match') });
      res.setHeader('ETag', result.plan.lifecycleEtag); res.status(operation === 'duplicate' && !result.replayed ? 201 : 200).json(result);
    }));
  }
  app.post('/api/physical-plans/:planId/revisions', protectedRoute(async (req, res, storage, identity, workspace) => {
    const plan = uuid.safeParse(req.params.planId); if (!plan.success) return invalid(res);
    const saved = await storage.append(identity, workspace, plan.data, req.body,
      { idempotencyKey: req.get('Idempotency-Key') ?? '', ifMatch: req.get('If-Match') });
    res.setHeader('ETag', saved.etag); res.status(201).json(saved);
  }));
}
