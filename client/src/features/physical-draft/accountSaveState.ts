import { capturePhysicalSaveEnvelope, physicalSavePayloadHash, type PhysicalSaveEnvelope } from '@shared/persistence/physicalSave';
import { canonicalJson } from '@shared/quantities/canonicalJson';
import type { PhysicalPlanRevision } from '@shared/persistence/physicalPlan';
import type { PhysicalDraft } from './state';
import { pendingSaveFields } from './pendingSaveFields';
import { accountStore, captureRequestContext, assertRequestContext, contextFetch, AccountContextChanged, type RequestContext } from '../account/runtime';
import { contextStorage, workspaceContext, currentLocalContext } from '../account/localContexts';
import { createRecoveryJournal, type JournalContext, type JournalScope, type JournalRecord, type JournalIntent } from './recoveryJournal';

export interface SaveBinding { planId: string; revisionId: string; revisionNumber: number; etag: string; payloadHash: string; savedLocalRevision: number }
export interface SaveState {
  binding: SaveBinding | null;
  phase: 'local-only' | 'saving' | 'saved' | 'failed' | 'conflict' | 'waiting' | 'paused';
  message: string; retryable: boolean; autosave: boolean; pending: boolean; acknowledgedCurrent: boolean;
  recovery: 'memory' | 'checkpointing' | 'checkpointed' | 'unavailable'; recoveryMessage: string;
}
export const AUTOSAVE_DELAY_MS = 1500;
export const CHECKPOINT_DELAY_MS = 250;
export const AUTOSAVE_MAX_RETRIES = 5;
export const AUTOSAVE_RETRY_CAP_MS = 30_000;
type Journal = ReturnType<typeof createRecoveryJournal>;
export interface SaveDependencies {
  authorize(): Promise<unknown>; assert(context: unknown): void;
  send(intent: JournalIntent, context: unknown): Promise<PhysicalPlanRevision>;
  key(): string; load(draftId: string): SaveBinding | null; persist(draftId: string, binding: SaveBinding): void;
  journal?: Journal; recoveryContext?(): JournalContext; accessIdentity?(): string;
  readCurrent?(binding: SaveBinding, context: unknown): Promise<{ etag: string; revisionNumber: number }>;
  clock?: { now(): number; set(callback: () => void, delay: number): unknown; clear(timer: unknown): void; random(): number };
}
export class PhysicalSaveResponseError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
const empty = (): SaveState => ({ binding: null, phase: 'local-only', message: '', retryable: false, autosave: false,
  pending: false, acknowledgedCurrent: false, recovery: 'memory', recoveryMessage: '' });
interface Entry {
  value: SaveState; draft?: PhysicalDraft; scope?: JournalScope; record?: JournalRecord; intent?: JournalIntent;
  attempt: number; durable: boolean; busy: boolean; suspended: boolean; permanent: boolean; epoch: number; retries: number; preferenceGeneration: number;
  checkpointTimer?: unknown; sendTimer?: unknown; retryTimer?: unknown; assessTimer?: unknown;
  queue: Promise<unknown>; checkpointStarted?: number; accessIdentity?: string; acknowledgedIdentity?: string; latestIdentity?: string; changedAt: number;
}
/** One coordinator per verified account context. Memory is the editable source;
 * IndexedDB holds detached checkpoints and at most one immutable request/branch. */
export function createPhysicalSaveManager(dependencies: SaveDependencies) {
  const entries = new Map<string, Entry>(), listeners = new Set<() => void>();
  const clock = dependencies.clock ?? { now: Date.now, set: (f: () => void, n: number) => setTimeout(f, n),
    clear: (timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>), random: Math.random };
  const ownerId = dependencies.key();
  let revision = 0, disposed = false, activeId: string | null = null;
  const notify = () => { if (disposed) return; ++revision; for (const listener of Array.from(listeners)) listener(); };
  function entry(id: string): Entry {
    let e = entries.get(id);
    if (!e) { const binding = dependencies.load(id); e = { value: { ...empty(), binding, phase: binding ? 'saved' : 'local-only' },
      attempt: 0, durable: false, busy: false, suspended: false, permanent: false, epoch: 0, retries: 0, preferenceGeneration: 0, queue: Promise.resolve(), changedAt: clock.now() }; entries.set(id, e); }
    return e;
  }
  const state = (id: string) => entry(id).value;
  function patch(e: Entry, value: Partial<SaveState>) { e.value = { ...e.value, ...value }; notify(); }
  function cancel(e: Entry, key: 'checkpointTimer' | 'sendTimer' | 'retryTimer' | 'assessTimer') { if (e[key] !== undefined) clock.clear(e[key]); e[key] = undefined; }
  function scope(e: Entry): JournalScope {
    if (!e.scope) {
      if (!dependencies.recoveryContext) throw Error('Local recovery is unavailable in this context.');
      e.scope = { ...dependencies.recoveryContext(), planId: e.value.binding?.planId ?? null, branchId: dependencies.key() };
    }
    return e.scope;
  }
  function serial<T>(e: Entry, work: () => Promise<T>): Promise<T> {
    const result = e.queue.then(work); e.queue = result.catch(() => undefined); return result;
  }
  function unavailable(e: Entry, error: unknown) {
    patch(e, { recovery: 'unavailable', recoveryMessage: `Local recovery unavailable. Work remains in memory. ${error instanceof Error ? error.message : ''}`.trim() });
  }
  async function checkpoint(e: Entry) {
    cancel(e, 'checkpointTimer'); e.checkpointStarted = undefined;
    if (!dependencies.journal || !e.draft || (!e.value.binding && !e.intent)) return;
    const draft = e.draft;
    patch(e, { recovery: 'checkpointing' });
    try {
      await serial(e, async () => {
        const record = await dependencies.journal!.checkpoint(scope(e), draft, { binding: e.intent?.operation === 'create' ? null : e.value.binding, autosave: e.value.autosave });
        e.record = record; e.scope = record.scope;
      });
      if (e.draft === draft) patch(e, { recovery: 'checkpointed', recoveryMessage: '' });
    } catch (error) { unavailable(e, error); }
  }
  function scheduleCheckpoint(e: Entry) {
    if (!dependencies.journal || (!e.value.binding && !e.intent)) return;
    e.checkpointStarted ??= clock.now();
    cancel(e, 'checkpointTimer');
    if (e.value.recovery !== 'unavailable') patch(e, { recovery: 'memory', recoveryMessage: 'Newer edits are only in memory until the next local checkpoint.' });
    e.checkpointTimer = clock.set(() => { e.checkpointTimer = undefined; void checkpoint(e); }, Math.max(0, Math.min(CHECKPOINT_DELAY_MS, 2000 - (clock.now() - e.checkpointStarted))));
  }
  function currentIdentity(draft: PhysicalDraft): string { return canonicalJson(capturePhysicalSaveEnvelope(draft)); }
  async function assess(e: Entry, draft: PhysicalDraft, schedule = true) {
    if (e.draft !== draft || disposed) return;
    const pending = pendingSaveFields(draft).length > 0;
    if (pending) {
      cancel(e, 'sendTimer'); patch(e, { pending: true, acknowledgedCurrent: false,
        ...(e.busy || e.permanent ? {} : { phase: 'paused' as const, message: 'Apply or Revert unfinished inputs before saving new changes.' }) }); return;
    }
    let identity: string, hash: string;
    try {
      identity = currentIdentity(draft);
      if (e.latestIdentity !== identity) { e.latestIdentity = identity; e.changedAt = clock.now(); cancel(e, 'sendTimer'); }
      const acknowledged = e.acknowledgedIdentity === identity;
      hash = acknowledged ? e.value.binding?.payloadHash ?? '' : await physicalSavePayloadHash(capturePhysicalSaveEnvelope(draft));
      if (e.draft !== draft || disposed) return;
      const isCurrent = !!e.value.binding && (acknowledged || hash === e.value.binding.payloadHash);
      patch(e, { pending: false, acknowledgedCurrent: isCurrent });
      if (isCurrent && !e.busy && !e.intent && !e.suspended && !e.permanent) { cancel(e, 'sendTimer'); patch(e, { phase: 'saved', message: '' }); return; }
      if (e.busy || e.intent || e.suspended || e.permanent) return;
      if (!schedule || !e.value.autosave || !e.value.binding || activeId !== draft.id) {
        patch(e, { phase: e.value.binding ? 'saved' : 'local-only', message: '' }); return;
      }
      if (e.value.phase === 'conflict' || (e.value.phase === 'failed' && !e.value.retryable)) return;
      patch(e, { phase: 'waiting', message: 'Waiting to send committed changes.' });
      if (e.sendTimer === undefined) e.sendTimer = clock.set(() => { e.sendTimer = undefined;
        if (e.draft) void run(e.draft, 'current', true).catch(error => patch(e, { phase: 'paused', message: error.message }));
      }, Math.max(0, AUTOSAVE_DELAY_MS - (clock.now() - e.changedAt)));
    } catch (error) { cancel(e, 'sendTimer'); patch(e, { pending: false, acknowledgedCurrent: false, phase: 'paused',
      message: error instanceof Error ? error.message : 'This candidate cannot be saved.' }); }
  }
  function observe(draft: PhysicalDraft | null) {
    if (disposed) return;
    if (activeId && activeId !== draft?.id) { const old = entries.get(activeId); if (old) { cancel(old, 'sendTimer'); cancel(old, 'retryTimer'); } }
    const reactivated = activeId !== draft?.id;
    activeId = draft?.id ?? null;
    if (!draft) return;
    const e = entry(draft.id);
    if (e.suspended && e.accessIdentity && dependencies.accessIdentity) {
      try { if (dependencies.accessIdentity() === e.accessIdentity) e.suspended = false; } catch { /* A stored label does not authorize reactivation. */ }
    }
    if (e.draft === draft && !reactivated) return;
    e.draft = draft;
    // Coalesce serialization; reference equality avoids recopying large imported
    // originals when React or account status rerenders without an editor change.
    scheduleCheckpoint(e);
    // Raw typing gets an immediate pause without serializing retained originals.
    if (pendingSaveFields(draft).length) { cancel(e, 'sendTimer'); patch(e, { pending: true, acknowledgedCurrent: false, ...(e.busy || e.permanent ? {} : { phase: 'paused' as const, message: 'Apply or Revert unfinished inputs before saving new changes.' }) }); }
    cancel(e, 'assessTimer'); e.assessTimer = clock.set(() => { e.assessTimer = undefined; if (e.draft) void assess(e, e.draft); }, CHECKPOINT_DELAY_MS);
    scheduleRetry(e);
  }
  function opened(id: string, localRevision: number, response: PhysicalPlanRevision) {
    const e = entry(id), binding: SaveBinding = { planId: response.planId, revisionId: response.revisionId,
      revisionNumber: response.revisionNumber, etag: response.etag, payloadHash: response.payloadHash, savedLocalRevision: localRevision };
    if (e.value.binding?.planId === binding.planId && e.value.binding.revisionNumber > binding.revisionNumber) return;
    e.acknowledgedIdentity = canonicalJson(response.envelope);
    try { e.accessIdentity = dependencies.accessIdentity?.(); } catch { /* Opening is separately authorized. */ }
    patch(e, { binding, phase: 'saved', message: '', retryable: false, acknowledgedCurrent: true });
    dependencies.persist(id, binding); scheduleCheckpoint(e);
  }
  function scheduleRetry(e: Entry) {
    if (e.retryTimer !== undefined) return;
    if (!e.value.autosave || e.suspended || !e.intent || !e.value.retryable || e.retries >= AUTOSAVE_MAX_RETRIES || activeId !== e.draft?.id) return;
    const delay = Math.min(AUTOSAVE_RETRY_CAP_MS, 1000 * 2 ** e.retries) * (0.8 + Math.min(1, Math.max(0, clock.random())) * 0.4);
    e.retryTimer = clock.set(() => { e.retryTimer = undefined; if (e.draft) void run(e.draft, 'retry', true).catch(() => undefined); }, delay);
  }
  async function mark(e: Entry, value: 'dispatched' | 'uncertain' | 'paused') {
    if (dependencies.journal && e.durable) await serial(e, async () => {
      const record = await dependencies.journal!.markIntent(scope(e), e.attempt, value); e.record = record;
    });
  }
  async function run(draft: PhysicalDraft, mode: 'current' | 'new' | 'retry', automatic: boolean) {
    const e = entry(draft.id);
    if (disposed || e.busy) return;
    if (automatic && (!e.value.autosave || e.suspended || e.permanent)) return;
    if (mode !== 'retry' && pendingSaveFields(draft).length) throw Error('Apply or Revert each unfinished field before saving.');
    if (mode === 'retry' && (!e.intent || !e.value.retryable)) throw Error('There is no pending request to retry.');
    if (mode !== 'retry' && e.intent) throw Error('Retry the previous request first to establish whether it was stored. Your current edits remain separate.');
    e.draft = draft; activeId = draft.id; e.busy = true;
    if (!automatic && mode === 'new') e.permanent = false;
    cancel(e, 'sendTimer'); cancel(e, 'retryTimer'); cancel(e, 'checkpointTimer'); cancel(e, 'assessTimer');
    const epoch = e.epoch;
    let dispatched = false, claimed = false;
    try {
      let candidate: PhysicalSaveEnvelope | undefined, identity: string | undefined, candidateHash: string | undefined;
      if (mode !== 'retry') {
        candidate = capturePhysicalSaveEnvelope(draft); identity = canonicalJson(candidate);
        if (mode === 'current' && e.value.binding && e.acknowledgedIdentity === identity) { patch(e, { phase: 'saved', acknowledgedCurrent: true, message: '' }); return; }
        candidateHash = await physicalSavePayloadHash(candidate);
        if (mode === 'current' && e.value.binding?.payloadHash === candidateHash) { e.acknowledgedIdentity = identity; patch(e, { phase: 'saved', acknowledgedCurrent: true, message: '' }); return; }
      }
      const context = await dependencies.authorize(); dependencies.assert(context);
      if (epoch !== e.epoch) throw new AccountContextChanged();
      e.suspended = false; e.accessIdentity = dependencies.accessIdentity?.();
      // A local acknowledgement may have committed just before account invalidation
      // prevented UI finalization. Its durable receipt is already authoritative.
      if (mode === 'retry' && e.durable && e.record && !e.record.intent && e.record.binding) {
        const recorded = e.record.binding;
        if (e.intent?.candidateHash === recorded.payloadHash) e.acknowledgedIdentity = canonicalJson(e.intent.envelope);
        e.intent = undefined; e.durable = false; e.retries = 0; e.permanent = false;
        dependencies.persist(draft.id, recorded); patch(e, { binding: recorded, phase: 'saved', message: '', retryable: false }); return;
      }
      if (mode !== 'retry') {
        const binding = mode === 'new' ? null : e.value.binding;
        e.intent = { draftId: draft.id, localRevision: draft.localEditRevision, envelope: candidate!, key: dependencies.key(), binding,
          candidateHash: candidateHash!, operation: binding ? 'append' : 'create', resource: binding ? binding.planId : 'collection' };
        e.durable = false;
        if (mode === 'new') patch(e, { autosave: false });
        if (e.scope && (mode === 'new' || e.scope.planId !== (binding?.planId ?? null))) {
          // Save as new is a distinct local branch; keep any old plan checkpoint.
          e.scope = { ...e.scope, planId: binding?.planId ?? null, branchId: dependencies.key() }; e.record = undefined;
        }
      }
      const intent = e.intent!;
      if (!e.durable && dependencies.journal) {
        try {
          await serial(e, async () => {
            const record = await dependencies.journal!.checkpoint(scope(e), e.draft!, { binding: intent.binding, autosave: e.value.autosave });
            e.scope = record.scope; e.record = record;
            const prepared = await dependencies.journal!.prepareIntent(scope(e), intent, { expectedGeneration: record.generation });
            e.record = prepared; e.attempt = prepared.attemptGeneration; e.durable = true;
          });
          patch(e, { recovery: 'checkpointed', recoveryMessage: '' });
        } catch (error) {
          unavailable(e, error);
          if (automatic) { e.intent = undefined; e.suspended = true; patch(e, { phase: 'paused', message: 'Autosave paused because local recovery is unavailable.', retryable: false }); return; }
          // Explicit Save remains available, with a visible memory-only warning.
        }
      }
      if (e.durable && e.record?.state === 'prepared' && intent.binding && dependencies.readCurrent) {
        const current = await dependencies.readCurrent(intent.binding, context); dependencies.assert(context);
        if (current.etag !== intent.binding.etag) throw new PhysicalSaveResponseError(412, 'REVISION_CONFLICT', 'A newer revision exists. Your local candidate is preserved. Open the latest separately, or save this candidate as a new plan.');
      }
      if (e.durable && dependencies.journal) {
        claimed = await dependencies.journal.claimAttempt(scope(e), e.attempt, ownerId, clock.now());
        if (!claimed) { patch(e, { phase: 'paused', message: 'This exact request is being resolved by another editor. Retry after that attempt finishes.', retryable: true }); return; }
        await mark(e, 'dispatched');
      }
      dependencies.assert(context); if (epoch !== e.epoch) throw new AccountContextChanged();
      patch(e, { phase: 'saving', message: '', retryable: false });
      dispatched = true;
      if (automatic && mode === 'retry') ++e.retries;
      const response = await dependencies.send(intent, context); dependencies.assert(context);
      if (epoch !== e.epoch) throw new AccountContextChanged();
      const accepted: SaveBinding = { planId: response.planId, revisionId: response.revisionId, revisionNumber: response.revisionNumber,
        etag: response.etag, payloadHash: response.payloadHash, savedLocalRevision: intent.localRevision };
      let binding = e.value.binding?.planId === accepted.planId && e.value.binding.revisionNumber > accepted.revisionNumber ? e.value.binding : accepted;
      if (e.durable && dependencies.journal) {
        try {
          await serial(e, async () => {
            const record = await dependencies.journal!.acknowledge(scope(e), e.attempt, accepted);
            e.record = record; e.scope = record.scope;
            binding = e.value.binding?.planId === record.binding!.planId && e.value.binding.revisionNumber > record.binding!.revisionNumber ? e.value.binding : record.binding!;
          });
        } catch (error) {
          // Server may have committed. Keep the receipt's exact request until the
          // local acknowledgement transaction succeeds on an idempotent retry.
          unavailable(e, error); throw error;
        }
      }
      dependencies.assert(context); if (epoch !== e.epoch) throw new AccountContextChanged();
      e.intent = undefined; e.durable = false; e.retries = 0; e.permanent = false;
      if (binding.revisionId === accepted.revisionId) e.acknowledgedIdentity = canonicalJson(intent.envelope);
      dependencies.persist(draft.id, binding);
      patch(e, { binding, phase: 'saved', message: '', retryable: false });
      scheduleCheckpoint(e);
    } catch (error) {
      if (error instanceof AccountContextChanged || (error instanceof PhysicalSaveResponseError && [401,403,404].includes(error.status))) {
        e.suspended = true;
        patch(e, { phase: 'failed', message: 'Account access changed. This draft is preserved. Recheck access before retrying the same request.', retryable: !!e.intent });
        try { await mark(e, 'paused'); } catch (journalError) { unavailable(e, journalError); }
      } else if (error instanceof PhysicalSaveResponseError && error.status < 500 && error.status !== 408 && error.status !== 429) {
        e.permanent = true;
        patch(e, { phase: error.status === 412 ? 'conflict' : 'failed', message: error.message, retryable: false });
        let finalized = true;
        if (e.durable && dependencies.journal) try { await serial(e, async () => {
          e.record = await dependencies.journal!.clearRejectedIntent(scope(e), e.attempt);
        }); } catch (journalError) { finalized = false; unavailable(e, journalError); patch(e, { retryable: true }); }
        if (finalized) { e.intent = undefined; e.durable = false; }
      } else {
        patch(e, { phase: 'failed', message: dispatched || mode === 'retry'
          ? 'The save response was not received. Your work is unchanged. Retry the same request to check whether it was stored.'
          : 'The save could not be sent. Your work is preserved. Retry now when access is available.', retryable: !!e.intent });
        try { await mark(e, dispatched ? 'uncertain' : 'paused'); } catch (journalError) { unavailable(e, journalError); }
      }
    } finally {
      if (claimed && dependencies.journal && e.scope) try { await dependencies.journal.releaseAttempt(e.scope, e.attempt, ownerId); } catch { /* Lease expiry also permits exact replay. */ }
      e.busy = false;
      if (e.draft) await assess(e, e.draft);
      scheduleRetry(e);
    }
  }
  const save = (draft: PhysicalDraft, mode: 'current' | 'new' | 'retry' = 'current') => run(draft, mode, false);
  async function setAutosave(draft: PhysicalDraft, enabled: boolean) {
    const e = entry(draft.id), preference = ++e.preferenceGeneration;
    e.draft ??= draft; activeId = draft.id;
    if (!enabled) { cancel(e, 'sendTimer'); cancel(e, 'retryTimer'); patch(e, { autosave: false }); }
    const context = await dependencies.authorize(); dependencies.assert(context);
    if (preference !== e.preferenceGeneration) return;
    if (!e.value.binding) throw Error('Save this draft explicitly to the selected workspace before enabling Autosave.');
    // The canonical observer may have advanced while authorization was pending.
    // A preference change must never restore the draft captured by its click.
    e.suspended = false; e.accessIdentity = dependencies.accessIdentity?.();
    cancel(e, 'sendTimer'); cancel(e, 'retryTimer');
    patch(e, { autosave: enabled });
    await checkpoint(e);
    if (preference !== e.preferenceGeneration) return;
    if (e.value.recovery === 'unavailable' && enabled) { patch(e, { autosave: false, phase: 'paused', message: 'Autosave requires local recovery. Explicit Save remains available.' }); return; }
    if (dependencies.journal) try { e.record = await serial(e, () => dependencies.journal!.setAutosave(scope(e), enabled)); }
    catch (error) { unavailable(e, error); patch(e, { autosave: false }); return; }
    if (preference !== e.preferenceGeneration) return;
    e.retries = 0;
    if (e.draft) await assess(e, e.draft); if (enabled) scheduleRetry(e);
  }
  async function discoverRecovery(): Promise<JournalRecord[]> {
    if (!dependencies.journal || !dependencies.recoveryContext) return [];
    const context = await dependencies.authorize(); dependencies.assert(context);
    const available = await dependencies.journal.list(dependencies.recoveryContext());
    // These branches already have an editable owner in this manager. Offering
    // them as recovery would duplicate the current draft and obscure older work.
    // Filtering changes no checkpoint bytes or other tab's branch identity.
    const inUse = new Set(Array.from(entries.values()).filter(e => e.draft && e.scope).map(e => e.scope!.branchId));
    const records = available.filter(record => !inUse.has(record.scope.branchId));
    for (const record of records) {
      if (record.binding && dependencies.readCurrent) await dependencies.readCurrent(record.binding, context);
      dependencies.assert(context);
    }
    return records;
  }
  async function resumeRecovery(candidate: JournalRecord, newLocalDraftId: string): Promise<PhysicalDraft> {
    if (!dependencies.journal || !dependencies.recoveryContext) throw Error('Local recovery is unavailable.');
    const context = await dependencies.authorize(); dependencies.assert(context);
    const verified = dependencies.recoveryContext();
    if (candidate.scope.origin !== verified.origin || candidate.scope.principalId !== verified.principalId || candidate.scope.workspaceId !== verified.workspaceId) throw new AccountContextChanged();
    const original = await dependencies.journal.read(candidate.scope); dependencies.assert(context);
    if (!original) throw Error('This local checkpoint is no longer available.');
    const current = original.binding && dependencies.readCurrent ? await dependencies.readCurrent(original.binding, context) : null;
    dependencies.assert(context);
    const record = await dependencies.journal.forkRecovery(original.scope, { ...original.scope, branchId: dependencies.key() }, newLocalDraftId);
    dependencies.assert(context);
    const draft = record.draft;
    const e = entry(newLocalDraftId);
    e.draft = undefined; e.scope = record.scope; e.record = record; e.attempt = record.attemptGeneration;
    e.intent = record.intent ?? undefined; e.durable = !!e.intent; e.suspended = false; e.accessIdentity = dependencies.accessIdentity?.();
    const conflict = !!(current && original.binding && current.etag !== original.binding.etag && (!original.intent || original.state === 'prepared'));
    e.permanent = conflict;
    if (conflict && e.intent) { e.record = await dependencies.journal.clearRejectedIntent(record.scope, record.attemptGeneration); e.intent = undefined; e.durable = false; dependencies.assert(context); }
    patch(e, { binding: record.binding, autosave: record.autosave, recovery: 'checkpointed', recoveryMessage: '',
      phase: conflict ? 'conflict' : e.intent ? 'failed' : record.binding ? 'saved' : 'local-only', retryable: !!e.intent,
      message: conflict ? 'A newer revision exists. Your recovered candidate is preserved. Open latest separately, or save as a new plan.' : e.intent ? 'Recovered request requires its original receipt before newer edits can save.' : '' });
    if (record.binding) dependencies.persist(newLocalDraftId, record.binding);
    activeId = newLocalDraftId;
    // Caller inserts this detached draft into the canonical store. Only then does
    // observe schedule work; discovery itself never uploads or edits a draft.
    return draft;
  }
  function suspend() {
    for (const e of Array.from(entries.values())) {
      e.suspended = true; ++e.epoch; cancel(e, 'sendTimer'); cancel(e, 'retryTimer'); cancel(e, 'assessTimer');
      if (e.intent || e.value.autosave) { patch(e, { phase: 'paused', message: 'Account context changed. Resume only after verifying the same workspace.', retryable: !!e.intent });
        if (e.intent) void mark(e, 'paused').catch(error => unavailable(e, error)); }
    }
  }
  function dispose() { suspend(); disposed = true; for (const e of Array.from(entries.values())) { cancel(e, 'checkpointTimer'); cancel(e, 'assessTimer'); } listeners.clear(); }
  return { state, opened, save, observe, setAutosave, discoverRecovery, resumeRecovery, suspend, dispose,
    checkpoint: async (id: string) => checkpoint(entry(id)), getSnapshot: () => revision,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}
const managers = new Map<string, ReturnType<typeof createPhysicalSaveManager>>();
const STORAGE_KEY = 'modern-floor-planner:physical-save-bindings:v1';
let journal: Journal | undefined;
function currentWorkspace(context: string) {
  const account = accountStore.getSnapshot(), { principal, workspace } = account.session;
  if (account.checking || account.session.status !== 'authenticated' || !principal || !workspace ||
      account.editorContext !== context || currentLocalContext() !== context || workspaceContext(principal.id, workspace.id) !== context) throw new AccountContextChanged();
  return { principal, workspace };
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
  } catch { /* Old session linkage is only a hint, never authorization. */ }
  journal ??= createRecoveryJournal();
  manager = createPhysicalSaveManager({
    key: () => crypto.randomUUID(), load: id => bindings[id] ?? null, journal,
    accessIdentity: () => { const { principal, workspace } = currentWorkspace(context); return JSON.stringify([principal.id, workspace.id, workspace.role, accountStore.getSnapshot().session.contextToken]); },
    recoveryContext: () => { const { principal, workspace } = currentWorkspace(context); return { origin: location.origin, principalId: principal.id, workspaceId: workspace.id }; },
    persist: (id, binding) => { bindings[id] = binding; try { contextStorage(context).setItem(STORAGE_KEY, JSON.stringify({ version: 1, bindings })); } catch { /* Keep verified linkage in memory. */ } },
    authorize: async () => { currentWorkspace(context); const captured = await captureRequestContext(); const { workspace } = currentWorkspace(context);
      if (workspace.role === 'viewer') throw new PhysicalSaveResponseError(403, 'WRITE_FORBIDDEN', 'This workspace currently allows viewing only. Your local work is preserved.'); return captured; },
    assert: value => { currentWorkspace(context); assertRequestContext(value as RequestContext); },
    readCurrent: async (binding, captured) => {
      const response = await contextFetch('GET', '/api/physical-plans/' + encodeURIComponent(binding.planId), undefined, captured as RequestContext);
      const value = await response.json();
      if (!response.ok) throw new PhysicalSaveResponseError(response.status, value.code ?? 'OPEN_FAILED', value.message ?? 'Workspace access could not be verified.');
      if (response.headers.get('ETag') !== value.etag) throw Error('The current plan response did not identify its exact revision.');
      return { etag: value.etag, revisionNumber: value.revisionNumber };
    },
    send: async (intent, captured) => {
      const response = await contextFetch('POST', intent.operation === 'append' ? '/api/physical-plans/' + encodeURIComponent(intent.resource) + '/revisions' : '/api/physical-plans', intent.envelope, captured as RequestContext,
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
if (typeof window !== 'undefined') window.addEventListener('mfp-account-invalidated', () => { for (const manager of Array.from(managers.values())) manager.suspend(); });
