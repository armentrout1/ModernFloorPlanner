import { physicalLifecycleEtag, type PhysicalPlanSummary } from '@shared/persistence/physicalPlan';
import { accountStore, assertRequestContext, captureRequestContext, contextFetch, AccountContextChanged } from '../account/runtime';
import { contextStorage, workspaceContext } from '../account/localContexts';
import { z } from 'zod';

export type ProjectOperation = 'duplicate' | 'archive' | 'restore';
export interface ProjectActionResult {
  operation: ProjectOperation; replayed: boolean;
  applied: { planId: string; revisionId: string; archivedAt: string | null; lifecycleVersion: number };
  plan: PhysicalPlanSummary;
}
export interface ProjectIntent {
  operation: ProjectOperation; planId: string; revisionId: string; etag: string; key: string;
}
export const PROJECT_ACTION_STORAGE_KEY = 'modern-floor-planner:project-action:v1';
const intentSchema = z.object({ operation: z.enum(['duplicate', 'archive', 'restore']), planId: z.string().uuid(),
  revisionId: z.string().uuid(), etag: z.string().regex(/^\"mfp-physical-lifecycle-[a-f0-9-]+-[0-9]+\"$/i), key: z.string().uuid() }).strict();
const storedSchema = z.object({ version: z.literal('project-action-v1'), intent: intentSchema }).strict();
const uuid = z.string().uuid(), date = z.string().datetime({ offset: true }), version = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const summarySchema = z.object({ planId: uuid, name: z.string(), currentRevisionId: uuid, revisionNumber: z.number().int().positive(),
  createdAt: date, updatedAt: date, archivedAt: date.nullable(), lifecycleVersion: version, lifecycleEtag: z.string(),
  copiedFrom: z.object({ planId: uuid, revisionId: uuid }).strict().nullable(),
}).strict().refine(plan => plan.lifecycleEtag === physicalLifecycleEtag(plan.currentRevisionId, plan.lifecycleVersion));
const resultSchema = z.object({ operation: z.enum(['duplicate', 'archive', 'restore']), replayed: z.boolean(),
  applied: z.object({ planId: uuid, revisionId: uuid, archivedAt: date.nullable(), lifecycleVersion: version }).strict(),
  plan: summarySchema, revision: z.unknown().optional(),
}).strict();
interface ActionState { pending: ProjectIntent | null; busy: boolean; message: string; blocked: boolean }
/** Context-scoped same-tab recovery contains only exact request metadata. Stored
 * labels never authorize an action; every dispatch rechecks current server access. */
function createProjectActions(localContext: string) {
  let state: ActionState = { pending: null, busy: false, message: '', blocked: false };
  const storage = contextStorage(localContext);
  let expectedBytes: string | null = null;
  try {
    expectedBytes = storage.getItem(PROJECT_ACTION_STORAGE_KEY);
    if (expectedBytes !== null) {
      state.pending = storedSchema.parse(JSON.parse(expectedBytes)).intent;
      state.message = 'An unresolved project action was recovered. Retry the same action to establish its saved result.';
    }
  } catch {
    state.blocked = true;
    state.message = 'Project action recovery is unavailable or contains unsupported data. Its bytes are preserved. Keep this page open; no project mutation will be sent.';
  }
  const listeners = new Set<() => void>();
  const publish = (next: Partial<ActionState>) => { state = { ...state, ...next }; listeners.forEach(listener => listener()); };
  function persist(intent: ProjectIntent) {
    if (state.blocked) throw Error(state.message);
    if (storage.getItem(PROJECT_ACTION_STORAGE_KEY) !== expectedBytes) throw Error('Project action recovery changed. Preserve this page and the existing recovery data.');
    const bytes = JSON.stringify({ version: 'project-action-v1', intent });
    storage.setItem(PROJECT_ACTION_STORAGE_KEY, bytes); expectedBytes = bytes;
    if (storage.getItem(PROJECT_ACTION_STORAGE_KEY) !== bytes) throw Error('Project action recovery could not be verified.');
  }
  function clear(): boolean {
    try {
      if (storage.getItem(PROJECT_ACTION_STORAGE_KEY) !== expectedBytes) return false;
      storage.removeItem(PROJECT_ACTION_STORAGE_KEY);
      if (storage.getItem(PROJECT_ACTION_STORAGE_KEY) !== null) return false;
      expectedBytes = null; publish({ pending: null }); return true;
    } catch { return false; }
  }
  async function perform(intent: ProjectIntent): Promise<ProjectActionResult> {
    const captured = await captureRequestContext(), account = accountStore.getSnapshot();
    if (!captured.principal || !captured.workspace || account.session.status !== 'authenticated' ||
        account.editorContext !== localContext || workspaceContext(captured.principal, captured.workspace) !== localContext)
      throw new AccountContextChanged();
    try { persist(intent); } catch { throw Error('Project action recovery is unavailable. Keep this page open; no project mutation was sent. The exact request and existing recovery bytes are preserved.'); }
    const response = await contextFetch('POST', '/api/physical-plans/' + encodeURIComponent(intent.planId) + '/' + intent.operation,
      { revisionId: intent.revisionId }, captured, { 'If-Match': intent.etag, 'Idempotency-Key': intent.key });
    const value = await response.json(); assertRequestContext(captured);
    if (!response.ok) {
      // Known validation/conflict rejection is final. Lost responses and changed
      // permission/context remain unresolved and retain their original key.
      if ([400, 409, 412].includes(response.status) && value.code !== 'ACCOUNT_CONTEXT_CHANGED') clear();
      throw Error(response.status === 412 ? 'This project changed. Refresh the list and review its current saved revision before trying again.'
        : value.message || 'The project action was not confirmed.');
    }
    const validated = resultSchema.safeParse(value);
    if (!validated.success) throw Error('The project response did not identify a valid saved result. Retry the same action.');
    const result = validated.data;
    const identityMatches = result.operation === intent.operation && result.applied.planId === result.plan.planId &&
      (intent.operation === 'duplicate'
        ? result.plan.planId !== intent.planId && result.plan.copiedFrom?.planId === intent.planId && result.plan.copiedFrom.revisionId === intent.revisionId
        : result.plan.planId === intent.planId && result.applied.revisionId === intent.revisionId);
    if (!identityMatches) throw Error('The project response does not match this exact action. Retry the same action.');
    const cleaned = clear();
    const current = result.plan.archivedAt === null ? 'active' : 'archived';
    publish({ message: (result.replayed
      ? 'Earlier action confirmed; current project is ' + current + '. Your local drafts are unchanged.' + (intent.operation === 'duplicate' ? '' : ' Autosave remains off.')
      : intent.operation === 'duplicate' ? 'Saved revision duplicated as an independent project. Your current local draft is unchanged.'
      : current === 'archived' ? 'Project archived. Your local drafts and recovery remain preserved; Autosave is off.'
      : 'Project restored. Your local drafts are unchanged; Autosave stays off until explicitly enabled.') +
      (cleaned ? '' : ' The action was accepted, but local receipt cleanup was unavailable. Retry same project action safely resolves that same receipt.') });
    return result;
  }
  async function attempt(intent: ProjectIntent) {
    try { return await perform(intent); }
    catch (error) {
      publish({ message: (error instanceof Error ? error.message : 'The project response was not confirmed.') +
        (state.pending ? ' Keep this page open and use Retry same project action to resolve this exact request.' : '') });
      throw error;
    } finally { publish({ busy: false }); }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    async start(plan: PhysicalPlanSummary, operation: ProjectOperation, before: () => Promise<void>) {
      if (state.blocked) throw Error(state.message);
      if (state.busy || state.pending) throw Error('Resolve the pending project action before starting another.');
      publish({ busy: true, message: '' });
      try { await before(); }
      catch (error) { publish({ busy: false, message: error instanceof Error ? error.message : 'The project action could not start.' }); throw error; }
      const intent: ProjectIntent = { operation, planId: plan.planId, revisionId: plan.currentRevisionId,
        etag: plan.lifecycleEtag, key: crypto.randomUUID() };
      publish({ pending: intent }); return attempt(intent);
    },
    async retry() {
      if (state.busy || !state.pending) throw Error('There is no project action to retry.');
      const intent = state.pending; publish({ busy: true, message: '' }); return attempt(intent);
    },
  };
}
const coordinators = new Map<string, ReturnType<typeof createProjectActions>>();
export function getProjectActions(context: string) {
  let coordinator = coordinators.get(context);
  if (!coordinator) { coordinator = createProjectActions(context); coordinators.set(context, coordinator); }
  return coordinator;
}
