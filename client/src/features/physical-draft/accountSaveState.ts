import { capturePhysicalSaveEnvelope, type PhysicalSaveEnvelope } from '@shared/persistence/physicalSave';
import type { PhysicalPlanRevision } from '@shared/persistence/physicalPlan';
import type { PhysicalDraft } from './state';
import { pendingSaveFields } from './pendingSaveFields';
import { accountStore, captureRequestContext, assertRequestContext, contextFetch, AccountContextChanged, type RequestContext } from '../account/runtime';
import { contextStorage, workspaceContext, currentLocalContext } from '../account/localContexts';

export interface SaveBinding { planId: string; revisionId: string; revisionNumber: number; etag: string; payloadHash: string; savedLocalRevision: number }
interface SaveIntent { draftId: string; localRevision: number; envelope: PhysicalSaveEnvelope; key: string; binding: SaveBinding | null }
export interface SaveState { binding: SaveBinding | null; phase: 'local-only' | 'saving' | 'saved' | 'failed' | 'conflict'; message: string; retryable: boolean }
interface SaveDependencies {
  authorize(): Promise<unknown>; assert(context: unknown): void;
  send(intent: { envelope: PhysicalSaveEnvelope; key: string; binding: SaveBinding | null }, context: unknown): Promise<PhysicalPlanRevision>;
  key(): string; load(draftId: string): SaveBinding | null; persist(draftId: string, binding: SaveBinding): void;
}
export class PhysicalSaveResponseError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const empty = (): SaveState => ({ binding: null, phase: 'local-only', message: '', retryable: false });
/** Explicit saves only. Pending network retries remain memory-only; no background queue. */
export function createPhysicalSaveManager(dependencies: SaveDependencies) {
  const entries = new Map<string, SaveState>(), intents = new Map<string, SaveIntent>(), listeners = new Set<() => void>();
  let revision = 0;
  const notify = () => { ++revision; for (const listener of Array.from(listeners)) listener(); };
  function state(id: string) {
    let value = entries.get(id);
    if (!value) { const binding = dependencies.load(id); value = { ...empty(), binding, phase: binding ? 'saved' : 'local-only' }; entries.set(id, value); }
    return value;
  }
  function opened(id: string, localRevision: number, response: PhysicalPlanRevision) {
    const binding = { planId: response.planId, revisionId: response.revisionId, revisionNumber: response.revisionNumber,
      etag: response.etag, payloadHash: response.payloadHash, savedLocalRevision: localRevision };
    entries.set(id, { binding, phase: 'saved', message: '', retryable: false });
    dependencies.persist(id, binding); notify();
  }
  async function save(draft: PhysicalDraft, mode: 'current' | 'new' | 'retry' = 'current') {
    const before = state(draft.id);
    if (before.phase === 'saving' || (mode === 'current' && before.phase === 'saved' && before.binding?.savedLocalRevision === draft.localEditRevision)) return;
    if (pendingSaveFields(draft).length) throw Error('Apply or Revert each unfinished field before saving.');
    let intent: SaveIntent;
    if (mode === 'retry') {
      const previous = intents.get(draft.id);
      if (!previous || !before.retryable) throw Error('There is no pending request to retry.');
      intent = previous;
    } else {
      if (before.retryable) throw Error('Retry the previous request first to establish whether it was stored. Your current edits remain separate.');
      intent = { draftId: draft.id, localRevision: draft.localEditRevision, envelope: capturePhysicalSaveEnvelope(draft),
        key: dependencies.key(), binding: mode === 'new' ? null : before.binding };
      intents.set(draft.id, intent);
    }
    entries.set(draft.id, { ...before, phase: 'saving', message: '', retryable: false }); notify();
    let context: unknown;
    try {
      context = await dependencies.authorize(); dependencies.assert(context);
      const response = await dependencies.send(intent, context); dependencies.assert(context);
      // A response acknowledges only this immutable submitted candidate. Never replace editor state.
      opened(draft.id, intent.localRevision, response); intents.delete(draft.id);
    } catch (error) {
      if (error instanceof AccountContextChanged) {
        entries.set(draft.id, { ...before, phase: 'failed', message: 'Account access changed. This draft is preserved. Recheck access before retrying the same request.', retryable: true });
      } else if (error instanceof PhysicalSaveResponseError) {
        entries.set(draft.id, { ...before, phase: error.status === 412 ? 'conflict' : 'failed', message: error.message, retryable: error.status >= 500 });
        if (error.status < 500) intents.delete(draft.id);
      } else entries.set(draft.id, { ...before, phase: 'failed', message: 'The save response was not received. Your work is unchanged. Retry the same request to check whether it was stored.', retryable: true });
      notify();
    }
  }
  return { state, opened, save, getSnapshot: () => revision, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}
const managers = new Map<string, ReturnType<typeof createPhysicalSaveManager>>();
const STORAGE_KEY = 'modern-floor-planner:physical-save-bindings:v1';
function currentWorkspace(context: string) {
  const account = accountStore.getSnapshot(), { principal, workspace } = account.session;
  if (account.checking || account.session.status !== 'authenticated' || !principal || !workspace ||
      account.editorContext !== context || currentLocalContext() !== context || workspaceContext(principal.id, workspace.id) !== context) throw new AccountContextChanged();
}
export function getPhysicalSaveManager(context: string) {
  let manager = managers.get(context);
  if (manager) return manager;
  let bindings: Record<string, SaveBinding> = Object.create(null);
  try {
    const raw = contextStorage(context).getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.version === 1 && parsed.bindings && typeof parsed.bindings === 'object' && !Array.isArray(parsed.bindings))
        for (const [id, value] of Object.entries(parsed.bindings)) {
          const b = value as SaveBinding;
          if (b && typeof b.planId === 'string' && typeof b.revisionId === 'string' && Number.isSafeInteger(b.revisionNumber) &&
              b.revisionNumber > 0 && typeof b.etag === 'string' && /^"[^"\r\n]+"$/.test(b.etag) && typeof b.payloadHash === 'string' &&
              Number.isSafeInteger(b.savedLocalRevision) && b.savedLocalRevision >= 0) bindings[id] = b;
        }
    }
  } catch { /* Saving remains explicit; absent local linkage cannot grant server access. */ }
  manager = createPhysicalSaveManager({
    key: () => crypto.randomUUID(), load: id => bindings[id] ?? null,
    persist: (id, binding) => { bindings[id] = binding; try { contextStorage(context).setItem(STORAGE_KEY, JSON.stringify({ version: 1, bindings })); } catch { /* Keep verified linkage in memory. */ } },
    authorize: async () => { currentWorkspace(context); const captured = await captureRequestContext(); currentWorkspace(context); return captured; },
    assert: value => { currentWorkspace(context); assertRequestContext(value as RequestContext); },
    send: async (intent, captured) => {
      const url = intent.binding ? '/api/physical-plans/' + encodeURIComponent(intent.binding.planId) + '/revisions' : '/api/physical-plans';
      const response = await contextFetch('POST', url, intent.envelope, captured as RequestContext,
        { 'Idempotency-Key': intent.key, ...(intent.binding ? { 'If-Match': intent.binding.etag } : {}) });
      const value = await response.json();
      if (!response.ok) throw new PhysicalSaveResponseError(response.status, value.code ?? 'SAVE_FAILED', response.status === 412
        ? 'A newer revision exists. Your local candidate is preserved. Open the latest separately, or save this candidate as a new plan.'
        : value.message ?? 'The save was not accepted. Your local draft is unchanged.');
      const result = value as PhysicalPlanRevision;
      if (response.headers.get('ETag') !== result.etag) throw Error('The save response did not identify its exact revision.');
      return result;
    },
  });
  managers.set(context, manager); return manager;
}
